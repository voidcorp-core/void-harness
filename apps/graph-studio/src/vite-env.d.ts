/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the `void-harness graph live` SSE server (default http://localhost:4317). */
  readonly VITE_LIVE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
