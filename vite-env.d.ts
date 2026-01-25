
/// <reference types="vite/client" />

// Extend Vite's ImportMetaEnv for custom environment variables
interface ImportMetaEnv {
    readonly VITE_GEMINI_API_KEY?: string
    readonly VITE_APP_TITLE?: string
    readonly MODE: string
    readonly BASE_URL: string
    readonly PROD: boolean
    readonly DEV: boolean
    readonly SSR: boolean
    // Add other VITE_ prefixed env variables here
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}