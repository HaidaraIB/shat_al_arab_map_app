import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

/** Dev-only: POST body JSON → write `public/map-default.json` (for updating the bundled default map). */
export function saveMapDefaultPlugin(): Plugin {
  return {
    name: 'save-map-default',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split('?')[0] ?? ''
        if (!pathname.endsWith('__save_map_default') || req.method !== 'POST') {
          return next()
        }
        const chunks: Buffer[] = []
        req.on('data', (chunk: Buffer) => chunks.push(chunk))
        req.on('end', () => {
          try {
            const raw = Buffer.concat(chunks).toString('utf8')
            const data = JSON.parse(raw) as unknown
            const pretty = JSON.stringify(data, null, 2)
            const file = path.resolve(process.cwd(), 'public', 'map-default.json')
            fs.mkdirSync(path.dirname(file), { recursive: true })
            fs.writeFileSync(file, pretty, 'utf8')
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.statusCode = 200
            res.end(JSON.stringify({ ok: true }))
          } catch (e) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ ok: false, error: String(e) }))
          }
        })
      })
    },
  }
}
