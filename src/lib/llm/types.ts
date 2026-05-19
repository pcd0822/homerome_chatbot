import type { McpConfig, Message } from '@/types'

export interface ProviderCallParams {
  apiKey: string
  messages: Message[]
  systemPrompt?: string
  mcpEnabled?: boolean
  mcpConfig?: McpConfig
}

export interface ProviderCallResult {
  content: string
}
