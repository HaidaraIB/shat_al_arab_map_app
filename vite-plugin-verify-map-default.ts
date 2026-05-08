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
      const savePhp = path.join(root, 'save-map-default.php')
      if (!fs.existsSync(mapJson)) {
        this.warn(
          '[map-default] dist/map-default.json غير موجود بعد البناء. أضف الملف إلى مجلد public قبل npm run build — فيته يُنسخ إلى جذر dist مع index.html.',
        )
      }
      if (!fs.existsSync(savePhp)) {
        this.warn(
          '[map-default] dist/save-map-default.php غير موجود — أضف public/save-map-default.php للحفظ على الخادم.',
        )
      }
    },
  }
}
