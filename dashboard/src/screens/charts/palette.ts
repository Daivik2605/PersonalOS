// One categorical palette for every chart, readable on both the light and the dark background.
export const SERIES_COLORS = ['#6366f1', '#0891b2', '#d97706', '#059669', '#db2777', '#8b5cf6', '#64748b', '#ca8a04'] as const

const FIXED: Record<string, number> = { Study: 0, Hustle: 1 }

/** The same name always gets the same colour in every chart (Study is always indigo, Hustle cyan); others hash into the rest. */
export function tagColor(name: string): string {
  const fixed = FIXED[name] ?? FIXED[name.split('/')[0]!]
  if (fixed !== undefined && !name.includes('/')) return SERIES_COLORS[fixed]!
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return SERIES_COLORS[2 + (h % (SERIES_COLORS.length - 2))]!
}

export const GREY = '#94a3b8'
