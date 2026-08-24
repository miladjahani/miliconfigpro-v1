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
