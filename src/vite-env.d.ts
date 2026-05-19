/// <reference types="vite/client" />

// 빌드 타임에 인라인되는 환경 변수.
// Vite의 VITE_ prefix가 붙은 값만 클라이언트 번들에 포함된다.
// ⚠️ 모든 VITE_ 변수는 최종 JS 번들에 평문으로 들어가므로,
// 학교/학급 단위로 제한된 사용자 그룹에서만 운영하는 것이 안전하다.
interface ImportMetaEnv {
  readonly VITE_ANTHROPIC_API_KEY?: string
  readonly VITE_OPENAI_API_KEY?: string
  readonly VITE_GEMINI_API_KEY?: string

  readonly VITE_NOTION_MCP_URL?: string
  readonly VITE_NOTION_MCP_TOKEN?: string

  readonly VITE_GOOGLE_DRIVE_MCP_URL?: string
  readonly VITE_GOOGLE_DRIVE_MCP_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
