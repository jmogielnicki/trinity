/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NEON_AUTH_URL?: string;
  readonly VITE_NEON_DATA_API_URL?: string;
  // When set (Preview deploys only), force-opens the Pro-gated tabs.
  readonly VITE_DISABLE_PRO_GATE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
