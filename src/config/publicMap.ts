/** Source: `public/map-default.json`. After `vite build`, served as `/map-default.json` (beside `index.html`), not under `dist/public/`. */
export const PUBLIC_INITIAL_MAP_FILE = 'map-default.json'

export function publicInitialMapUrl(): string {
  const base = import.meta.env.BASE_URL || '/'
  return `${base.replace(/\/?$/, '/')}${PUBLIC_INITIAL_MAP_FILE}`
}
