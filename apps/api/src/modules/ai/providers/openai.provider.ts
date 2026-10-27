import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { AppConfig } from '../../../config/config.service';
import type { CompletionRequest, CompletionResponse, LlmProvider } from './provider';

@Injectable()
export class OpenAiProvider implements LlmProvider {
  readonly name = 'openai' as const;
  private readonly client?: OpenAI;

  constructor(private readonly config: AppConfig) {
    const apiKey = config.get('OPENAI_API_KEY');
    if (apiKey) this.client = new OpenAI({ apiKey, maxRetries: 2, timeout: 90_000 });
  }

  isConfigured(): boolean {
    return !!this.client;
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const model = this.config.get('OPENAI_MODEL');
    const res = await this.client!.chat.completions.create({
      model,
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxTokens ?? 4096,
      response_format: req.json ? { type: 'json_object' } : undefined,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
    });
    return {
      text: res.choices[0]?.message?.content ?? '',
      model,
      inputTokens: res.usage?.prompt_tokens ?? 0,
      outputTokens: res.usage?.completion_tokens ?? 0,
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await this.client!.embeddings.create({
      model: this.config.get('OPENAI_EMBEDDING_MODEL'),
      input: texts.map((t) => t.slice(0, 24_000)),
    });
    return res.data.map((d) => d.embedding);
  }
}
