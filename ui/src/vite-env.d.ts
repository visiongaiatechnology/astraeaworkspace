interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly VITE_ASTRAEA_EDITION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
