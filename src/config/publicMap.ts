/** Source: `public/map-default.json`. After `vite build`, served as `/map-default.json` (beside `index.html`), not under `dist/public/`. */
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

/** Production: POST target (same origin). Default `save-map-default.php` next to `index.html`. */
export function productionSaveMapDefaultUrl(): string {
  const configured = import.meta.env.VITE_MAP_SAVE_ENDPOINT?.trim()
  const path = configured && configured.length > 0 ? configured : '/save-map-default.php'
  const normalized = path.startsWith('/') ? path : `/${path}`
  const base = import.meta.env.BASE_URL || '/'
  const root = base.replace(/\/?$/, '')
  return `${root}${normalized}`
}
