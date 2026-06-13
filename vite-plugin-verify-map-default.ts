import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

/**
 * Vite copies `public/map-*.json` → `dist/map-*.json` (same folder as index.html).
 * This plugin warns if expected map outputs are missing after build.
 */
export function verifyMapDefaultCopied(): Plugin {
  return {
    name: 'verify-map-default-copied',
    closeBundle() {
      const root = path.resolve(process.cwd(), 'dist')
      const requiredMaps = ['map-default.json', 'map-zone3.json']
      for (const file of requiredMaps) {
        const mapJson = path.join(root, file)
        if (!fs.existsSync(mapJson)) {
          this.warn(
            `[map-default] dist/${file} missing after build. Add public/${file} before npm run build.`,
          )
        }
      }
    },
  }
}
