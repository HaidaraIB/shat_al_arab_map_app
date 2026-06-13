export type MapZoneId = 'default' | 'zone3'

export type MapZoneConfig = {
  id: MapZoneId
  labelAr: string
  titleAr: string
  publicFile: string
}

export const MAP_ZONES: readonly MapZoneConfig[] = [
  {
    id: 'default',
    labelAr: 'الزون الأول',
    titleAr: 'مخطط الزون الأول',
    publicFile: 'map-default.json',
  },
  {
    id: 'zone3',
    labelAr: 'الزون الثالث',
    titleAr: 'مخطط الزون الثالث',
    publicFile: 'map-zone3.json',
  },
] as const

export function getZoneConfig(mapId: MapZoneId): MapZoneConfig {
  const zone = MAP_ZONES.find((z) => z.id === mapId)
  if (!zone) throw new Error(`Unknown map zone: ${mapId}`)
  return zone
}
