export function getUnitPlanImageUrls(
  category?: 'A' | 'B' | 'C',
  unitType?: 'ركن' | 'عادي',
): string[] | null {
  if (!category) return null
  const prefix = unitType === 'ركن' ? `${category}N` : category
  return [1, 2, 3].map((n) => `/${prefix}${n}.png`)
}
