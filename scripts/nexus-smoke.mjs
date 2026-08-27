#!/usr/bin/env node
/**
 * NEXUS smoke test — imports public/repo/nexus.js as a module worker and
 * exercises the public + protected endpoints with and without KV.
 * Run: node scripts/nexus-smoke.mjs
 */
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const KEY = '11111111-2222-4333-8444-555555555555'

function makeKV() {
  const store = new Map()
  return {
    get: async (k) => (store.has(k) ? store.get(k) : null),
    put: async (k, v) => { store.set(k, String(v)); return true },
    dump: () => Object.fromEntries(store),
  }
}

const results = []
function check(name, cond, extra = '') {
  results.push({ name, ok: !!cond, extra })
  console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`)
}

async function run() {
  await readFileSync(new URL('../public/repo/nexus.js', import.meta.url), 'utf8')
  const mod = await import(new URL('../public/repo/nexus.js', import.meta.url).href + '?t=' + Date.now())
  const worker = mod.default

  const env = {
    u: KEY,
    C: makeKV(),
  }

  const base = `https://nexus.example.workers.dev`

  // ── healthz ──
  let r = await worker.fetch(new Request(base + '/healthz'), env)
  check('GET /healthz 200', r.status === 200)
  const health = await r.json()
  check('healthz ok', health.ok === true && health.v.startsWith('3.0.0'))

  // ── info (no auth) ──
  r = await worker.fetch(new Request(base + '/api/info'), env)
  const info = await r.json()
  check('GET /api/info ok', r.status === 200 && info.ok && info.cc === 'XX')
  check('info.keySet', info.keySet === true)

  // ── info with CF headers (Iran profile) ──
  r = await worker.fetch(new Request(base + '/api/info', { headers: { 'cf-ipcountry': 'IR', 'cf-colo': 'FRA', 'user-agent': 'clash' } }), env)
  const infoIr = await r.json()
  check('info IR zone', infoIr.zone === 'IR' && infoIr.colo === 'FRA')

  // ── nodes: forbidden without key ──
  r = await worker.fetch(new Request(base + '/api/nodes'), env)
  check('nodes 403 without key', r.status === 403)

  // ── nodes: with key ──
  r = await worker.fetch(new Request(base + `/api/nodes?k=${KEY}`), env)
  check('nodes 200 with key', r.status === 200)
  const nodes = await r.json()
  check('nodes generated', nodes.ok && Array.isArray(nodes.nodes) && nodes.nodes.length > 0, `${nodes.nodes.length} nodes`)
  check('links formats', !!(nodes.links.base64 && nodes.links.plain && nodes.links.clash && nodes.links.singbox))
  check('rtt sane', typeof nodes.rtt === 'number' && nodes.rtt > 0)
  const vless = nodes.nodes.find((n) => n.p === 'vless')
  check('vless line well-formed', vless && vless.line.startsWith('vless://') && vless.line.includes('type=ws'))
  check('clash yaml valid-ish', nodes.links.clash.includes('proxies:') && nodes.links.clash.includes('url-test'))
  const sing = JSON.parse(nodes.links.singbox)
  check('singbox json valid', Array.isArray(sing.outbounds) && sing.outbounds.length > 0)

  // ── sub (public) base64 ──
  r = await worker.fetch(new Request(base + '/sub', { headers: { 'user-agent': 'v2rayNG' } }), env)
  const sub = await r.text()
  check('GET /sub 200 base64', r.status === 200 && (() => { try { return JSON.parse(atob(sub)) !== undefined } catch { return false } })() === false)
  check('sub decodes to vless lines', decodeB64(sub).includes('vless://'))

  // ── sub clash via UA ──
  r = await worker.fetch(new Request(base + '/sub', { headers: { 'user-agent': 'ClashForAndroid' } }), env)
  const clashSub = await r.text()
  check('sub clash UA', clashSub.includes('proxies:') && clashSub.includes('type: vless'))

  // ── sub singbox via ?target ──
  r = await worker.fetch(new Request(base + '/sub?target=singbox'), env)
  check('sub singbox target', r.headers.get('content-type').includes('json'))
  const sing2 = JSON.parse(await r.text())
  check('sub singbox parses', sing2.outbounds.length > 0)

  // ── sub under key path (base64 like /sub) ──
  r = await worker.fetch(new Request(base + `/${KEY}/sub`), env)
  const keySub = await r.text()
  check('GET /<key>/sub 200', r.status === 200 && decodeB64(keySub).includes('vless://'))

  // ── page locked at root (no key in path) ──
  r = await worker.fetch(new Request(base + '/'), env)
  const pageLocked = await r.text()
  check('page root 200', r.status === 200 && pageLocked.includes('NEXUS'))
  check('page locked script var', pageLocked.includes('var UNLOCKED = false;') && pageLocked.includes('var KEY = "' + KEY + '"'))

  // ── page unlocked under /<key> ──
  r = await worker.fetch(new Request(base + `/${KEY}`), env)
  const pageOpen = await r.text()
  check('page /<key> unlocked', pageOpen.includes('var UNLOCKED = true;'))

  // ── config GET with key ──
  r = await worker.fetch(new Request(base + `/api/config?k=${KEY}`), env)
  const cfg0 = await r.json()
  check('config GET', cfg0.ok && cfg0.cfg.name === 'NEXUS')

  // ── config POST (save to KV) ──
  r = await worker.fetch(new Request(base + `/api/config?k=${KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subname: 'MYNODE', transports: ['ws', 'grpc'], ev: 'yes', et: 'no', ex: 'no' }),
  }), env)
  const saved = await r.json()
  check('config POST saved', saved.ok && saved.saved === true)
  check('config POST persisted to KV', env.C.dump().c && env.C.dump().c.includes('MYNODE'))
  check('uuid not overridable', saved.cfg.uuid === KEY)

  // ── config reload picks up KV ──
  r = await worker.fetch(new Request(base + `/api/nodes?k=${KEY}`), env)
  const nodes2 = await r.json()
  check('KV config applied', nodes2.nodes.length > 0 && nodes2.nodes.every((n) => n.p !== 'trojan' && n.p !== 'ss'), `${nodes2.nodes.length} nodes (vless only)`)

  // ── unlock endpoint ──
  r = await worker.fetch(new Request(base + '/api/unlock', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: KEY }) }), env)
  check('unlock correct key', (await r.json()).ok === true)
  r = await worker.fetch(new Request(base + '/api/unlock', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: 'nope' }) }), env)
  check('unlock wrong key', (await r.json()).ok === false)

  // ── map ──
  r = await worker.fetch(new Request(base + '/api/map'), env)
  const map = await r.json()
  check('map data', map.ok && map.pops.length > 40, `${map.pops.length} pops`)

  // ── disabled toggle ──
  await worker.fetch(new Request(base + `/api/config?k=${KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ disabled: true }),
  }), env)
  r = await worker.fetch(new Request(base + `/api/nodes?k=${KEY}`), env)
  check('disabled blocks nodes', r.status === 403)
  r = await worker.fetch(new Request(base + '/sub'), env)
  check('disabled blocks sub', r.status === 403)
  await worker.fetch(new Request(base + `/api/config?k=${KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ disabled: false }),
  }), env)

  // ── no-KV mode (bare deploy) ──
  const bare = { u: KEY }
  r = await worker.fetch(new Request(base + '/healthz'), bare)
  const bh = await r.json()
  check('no-KV healthz', bh.ok && bh.kv === false)
  r = await worker.fetch(new Request(base + `/api/nodes?k=${KEY}`), bare)
  const bn = await r.json()
  check('no-KV nodes still work', bn.ok && bn.nodes.length > 0)
  r = await worker.fetch(new Request(base + `/api/config?k=${KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subname: 'TEMP' }),
  }), bare)
  const bc = await r.json()
  check('no-KV save degrades gracefully', bc.ok && bc.saved === false)

  // ── OPTIONS / CORS ──
  r = await worker.fetch(new Request(base + '/sub', { method: 'OPTIONS' }), env)
  check('OPTIONS 204', r.status === 204 && r.headers.get('access-control-allow-origin') === '*')

  // ── 404 ──
  r = await worker.fetch(new Request(base + '/api/whatever'), env)
  check('unknown api 404', r.status === 404)

  const failed = results.filter((x) => !x.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length ? 1 : 0)
}

function decodeB64(s) {
  const bin = atob(s)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

run().catch((e) => { console.error('SMOKE CRASH:', e); process.exit(1) })
