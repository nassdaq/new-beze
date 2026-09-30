/** Shared look of the runtime's screens: the dialogue box palette extended with the economy's coin colour. */
export const UI = {
  font: 'sans-serif',
  panel: 0x14121c,
  panelAlpha: 0.92,
  stroke: 0xf2f2f2,
  dim: 0x000000,
  dimAlpha: 0.55,
  text: '#ffffff',
  muted: '#9aa0b4',
  accent: '#f6d365',
  accentInt: 0xf6d365,
  coin: '#f6c343',
  coinInt: 0xf6c343,
  good: '#7ee081',
  bad: '#ff6b6b',
  badInt: 0xff6b6b,
  info: '#cfe3ff',
  infoInt: 0xcfe3ff,
  xp: 0x6fc3ff,
  star: '#f6c343',
} as const;

export const TEXT = {
  small: { fontFamily: UI.font, fontSize: '9px', color: UI.text },
  body: { fontFamily: UI.font, fontSize: '11px', color: UI.text },
  bold: { fontFamily: UI.font, fontSize: '11px', fontStyle: 'bold', color: UI.text },
  title: { fontFamily: UI.font, fontSize: '14px', fontStyle: 'bold', color: UI.accent },
  hint: { fontFamily: UI.font, fontSize: '9px', color: UI.muted },
} as const;

/** Depth bands inside the overlay scenes. */
export const DEPTH = { dim: 0, panel: 1, content: 2, top: 3 } as const;
