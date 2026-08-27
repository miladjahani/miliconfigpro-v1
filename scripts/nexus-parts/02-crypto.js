/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Crypto & Encoding Helpers
   ══════════════════════════════════════════════════════════════════════════════ */
function _s(i) {
  /* safe string helper — avoids native String.prototype issues */
  return String(i == null ? '' : i);
}
function 密時(a, b) {
  /* constant-time comparison — prevents timing attacks */
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function 拆IP(raw) {
  /* split proxy-IP field (newline or comma separated) into array */
  if (!raw) return [];
  return String(raw).split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
}
function 拆址(v) {
  /* parse address string into { host, port, name } */
  if (!v) return { host: '', port: 443, name: '' };
  const s = String(v).trim();
  const nameMatch = s.match(/^\(([^)]+)\)/);
  const name = nameMatch ? nameMatch[1] : '';
  const bare = nameMatch ? s.slice(nameMatch[0].length).trim() : s;
  const parts = bare.split(':');
  const host = parts[0] || '';
  const port = parseInt(parts[1]) || 443;
  return { host, port, name };
}
function 編(s) { return encodeURIComponent(String(s || '')); }
function 文本(v) { return new TextEncoder().encode(String(v || '')); }
function B64(b) {
  /* Uint8Array → base64 */
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}
function B64D(s) {
  /* base64 → Uint8Array */
  const bin = atob(String(s || ''));
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
function 哈(s) {
  /* simple FNV-1a hash — fast, non-crypto */
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
function 時間旅行(n) {
  /* deterministic pseudo-random from seed */
  let t = n;
  for (let i = 0; i < 7; i++) t = (t * 31 + 17) % 9973;
  return t;
}
function 隱形斗篷(s) {
  /* reverse string */
  let o = '';
  for (let i = s.length - 1; i >= 0; i--) o += s[i];
  return o;
}
