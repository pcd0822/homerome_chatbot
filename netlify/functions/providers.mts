// GET /api/providers  (netlify.toml 이 /.netlify/functions/providers 로 리다이렉트)
// ----------------------------------------------------------------------------
// 어떤 프로바이더의 키가 서버에 설정되어 있는지(가용 여부)와, 각 프로바이더가
// 실제로 쓰는 모델 ID 만 알려준다. 키 값 자체는 절대 반환하지 않는다.
// 프론트엔드는 이 정보로 모델 선택 UI 의 활성/비활성과 모델명 표시를 결정한다.
// ----------------------------------------------------------------------------

import { providerAvailability } from './lib/llm.mts'

// 서버 provider('anthropic') → 클라이언트 provider('claude') 매핑.
const TO_CLIENT: Record<string, string> = {
  anthropic: 'claude',
  openai: 'openai',
  gemini: 'gemini',
}

export default async function handler(): Promise<Response> {
  const { available, models } = providerAvailability(process.env)

  const clientAvailable: Record<string, boolean> = {}
  const clientModels: Record<string, string> = {}
  for (const [server, client] of Object.entries(TO_CLIENT)) {
    clientAvailable[client] = available[server] ?? false
    clientModels[client] = models[server] ?? ''
  }

  return new Response(JSON.stringify({ available: clientAvailable, models: clientModels }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}
