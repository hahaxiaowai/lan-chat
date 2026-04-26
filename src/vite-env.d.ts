/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SIGNAL_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  __LAN_CHAT_SIGNAL_URL__?: string
}
