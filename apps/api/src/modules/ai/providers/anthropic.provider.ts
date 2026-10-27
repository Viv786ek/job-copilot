import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../config/config.service';
import type { CompletionRequest, CompletionResponse, LlmProvider } from './provider';

@Injectable()
export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic' as const;
  private readonly client?: Anthropic;

  constructor(private readonly config: AppConfig) {
    const apiKey = config.get('ANTHROPIC_API_KEY');
    if (apiKey) this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 });
  }

  isConfigured(): boolean {
    return !!this.client;
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const model = this.config.get('ANTHROPIC_MODEL');
    const system = req.json
      ? `${req.system}\n\nRespond with a single valid JSON object only. No markdown fences, no commentary.`
      : req.system;
    const res = await this.client!.messages.create({
      model,
      max_tokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? 0.2,
      system,
      messages: [{ role: 'user', content: req.user }],
    });
    const text = res.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');
    return {
      text,
      model,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
    };
  }
}
