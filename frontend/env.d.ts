/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** development | staging | production (also chosen by `vite --mode`). */
  readonly VITE_APP_ENV?: 'development' | 'staging' | 'production';
  /** API base path or URL, e.g. "/api/v1" (same origin) or "https://api.example.uz/api/v1". */
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DEV_API_PROXY?: string;
  /** Optional endpoint for client error reports; empty = reporting off. */
  readonly VITE_ERROR_REPORTING_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Injected at build time (package.json version). */
declare const __APP_VERSION__: string;
