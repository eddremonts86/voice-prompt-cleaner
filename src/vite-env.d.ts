/// <reference types="vite/client" />
/// <reference types="dom-speech-recognition" />

interface ImportMetaEnv {
  readonly VITE_DEFAULT_LLM_BASE_URL?: string;
  readonly VITE_DEFAULT_LLM_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
