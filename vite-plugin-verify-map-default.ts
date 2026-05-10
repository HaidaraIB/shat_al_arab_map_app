import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

/**
 * Vite copies `public/map-default.json` → `dist/map-default.json` (same folder as index.html).
 * This plugin warns if the expected output is missing after build.
 */
export function verifyMapDefaultCopied(): Plugin {
  return {
    name: 'verify-map-default-copied',
    closeBundle() {
      const root = path.resolve(process.cwd(), 'dist')
      const mapJson = path.join(root, 'map-default.json')
      if (!fs.existsSync(mapJson)) {
        this.warn(
          '[map-default] dist/map-default.json missing after build. Add public/map-default.json before npm run build.',
        )
      }
    },
  }
}
