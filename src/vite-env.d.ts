/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAP_SAVE_ENDPOINT?: string
  readonly VITE_MAP_SAVE_TOKEN?: string
  /** When `'true'`, map JSON is not read/written in localStorage (production file-only workflow). */
  readonly VITE_MAP_DISABLE_LOCAL_STORAGE?: string
}
