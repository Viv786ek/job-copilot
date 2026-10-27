import type { AiProviderName } from '@copilot/shared';

export interface CompletionRequest {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  /** Ask the provider for a JSON object response when it supports a native JSON mode. */
  json?: boolean;
}

export interface CompletionResponse {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface LlmProvider {
  readonly name: AiProviderName;
  isConfigured(): boolean;
  complete(req: CompletionRequest): Promise<CompletionResponse>;
  embed?(texts: string[]): Promise<number[][]>;
}

export const LLM_PROVIDERS = Symbol('LLM_PROVIDERS');
