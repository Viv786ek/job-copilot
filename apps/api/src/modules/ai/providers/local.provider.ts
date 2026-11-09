import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../config/config.service';
import type { CompletionRequest, CompletionResponse, LlmProvider } from './provider';

/**
 * Any OpenAI-compatible chat completions endpoint: Ollama, LM Studio, vLLM, llama.cpp server,
 * Groq, OpenRouter, Together. Lets the platform run on free/open-source models.
 */
@Injectable()
export class LocalProvider implements LlmProvider {
  readonly name = 'local' as const;

  constructor(private readonly config: AppConfig) {}

  isConfigured(): boolean {
    return !!this.config.get('OPENAI_COMPAT_BASE_URL');
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const base = this.config.get('OPENAI_COMPAT_BASE_URL')!.replace(/\/$/, '');
    const model = this.config.get('OPENAI_COMPAT_MODEL');
    const key = this.config.get('OPENAI_COMPAT_API_KEY');
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({
        model,
        temperature: req.temperature ?? 0.2,
        max_tokens: req.maxTokens ?? 4096,
        ...(req.json ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          { role: 'system', content: req.json ? `${req.system}\n\nRespond with a single valid JSON object only.` : req.system },
          { role: 'user', content: req.user },
        ],
      }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) throw new Error(`OpenAI-compatible endpoint ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      text: body.choices?.[0]?.message?.content ?? '',
      model,
      inputTokens: body.usage?.prompt_tokens ?? 0,
      outputTokens: body.usage?.completion_tokens ?? 0,
    };
  }
}
