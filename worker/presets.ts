// ISP-specific TLS-fragmentation presets (community-tuned starting points).
// Applied at sub-serve time when a member picks a preset instead of manual
// fragment values — helps against ISP-level DPI throttling in Iran.

export interface FragmentPreset {
  code: string
  label: string
  flag: string
  config: { packets: string; length: string; interval: string }
}

export const FRAGMENT_PRESETS: FragmentPreset[] = [
  { code: 'mci',      label: 'همراه اول',   flag: '🇮🇷', config: { packets: 'tlshello', length: '1-3',     interval: '1-2'   } },
  { code: 'irancel',  label: 'ایرانسل',     flag: '🇮🇷', config: { packets: 'tlshello', length: '10-20',   interval: '5-10'  } },
  { code: 'rightel',  label: 'رایتل',       flag: '🇮🇷', config: { packets: 'tlshello', length: '100-200', interval: '10-20' } },
  { code: 'tci',      label: 'مخابرات (TCI)', flag: '🇮🇷', config: { packets: 'tlshello', length: '50-100', interval: '10-20' } },
  { code: 'gaming',   label: 'گیمینگ (کم‌تأخیر)', flag: '🎮', config: { packets: 'tlshello', length: '1-5',   interval: '10-20' } },
]

export function findPreset(code: string | undefined): FragmentPreset | null {
  if (!code) return null
  return FRAGMENT_PRESETS.find((p) => p.code === code) ?? null
}

/** Battle-tested multi-fragment `fm=` JSON configs (Iran-verified). These are
 * injected VERBATIM into every link as the `fm` query param — exactly what
 * cf-optimizor's ready buttons emit. Never rewritten by the panel. */
export const FM_PRESETS: Array<{ code: string; label: string; json: string }> = [
  {
    code: 'fm-dual',
    label: 'فرگمنت دو مرحله‌ای (پایدار)',
    json: '{"tcp":[{"type":"fragment","settings":{"packets":"tlshello","lengths":["5","94","1"],"delays":["0"],"maxSplit":"0"}},{"type":"fragment","settings":{"packets":"1-1","lengths":["109","1"],"delays":["1"],"maxSplit":"355"}}]}',
  },
  {
    code: 'fm-single',
    label: 'فرگمنت ساده (سبک)',
    json: '{"tcp":[{"type":"fragment","settings":{"packets":"tlshello","lengths":["1-1"],"delays":["0"],"maxSplit":"0"}}]}',
  },
  {
    code: 'fm-combo',
    label: 'فرگمنت ترکیبی (ضد اختلال)',
    json: '{"tcp":[{"type":"fragment","settings":{"packets":"tlshello","lengths":["1-1"],"delays":["0"],"maxSplit":"0"}},{"type":"fragment","settings":{"packets":"1-3","lengths":["1-1"],"delays":["1"],"maxSplit":"500"}}]}',
  },
]
