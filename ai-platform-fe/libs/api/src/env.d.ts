/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Preferred for Nx + Rspack: exposed to the browser via DefinePlugin.
   * Must include the gateway `/api` prefix, e.g. `http://localhost:4000/api`.
   */
  readonly API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
