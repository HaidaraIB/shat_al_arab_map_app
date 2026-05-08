/** File in `public/` used when no design is stored in localStorage. */
export const PUBLIC_INITIAL_MAP_FILE = 'map-default.json'

export function publicInitialMapUrl(): string {
  const base = import.meta.env.BASE_URL || '/'
  return `${base.replace(/\/?$/, '/')}${PUBLIC_INITIAL_MAP_FILE}`
}

/** Dev server only — overwrites `public/map-default.json` on disk. */
export function saveMapDefaultApiUrl(): string {
  const base = import.meta.env.BASE_URL || '/'
  return `${base.replace(/\/?$/, '/')}__save_map_default`
}
