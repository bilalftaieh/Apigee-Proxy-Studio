/// <reference types="vite/client" />

// Vite's own types, which declare import.meta.env. The app had no use for them
// until the logger started reading VITE_LOG_LEVEL and import.meta.env.DEV to
// pick its default verbosity.

interface ImportMetaEnv {
  /** Default log level for the browser: trace | debug | info | warn | error | silent. */
  readonly VITE_LOG_LEVEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv & { readonly DEV: boolean; readonly PROD: boolean; readonly MODE: string };
}
