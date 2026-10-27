import { GoogleGenerativeAI } from '@google/generative-ai';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../config/config.service';
import type { CompletionRequest, CompletionResponse, LlmProvider } from './provider';

@Injectable()
export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini' as const;
  private readonly client?: GoogleGenerativeAI;

  constructor(private readonly config: AppConfig) {
    const apiKey = config.get('GEMINI_API_KEY');
    if (apiKey) this.client = new GoogleGenerativeAI(apiKey);
  }

  isConfigured(): boolean {
    return !!this.client;
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const modelName = this.config.get('GEMINI_MODEL');
    const model = this.client!.getGenerativeModel({
      model: modelName,
      systemInstruction: req.system,
      generationConfig: {
        temperature: req.temperature ?? 0.2,
        maxOutputTokens: req.maxTokens ?? 4096,
        responseMimeType: req.json ? 'application/json' : 'text/plain',
      },
    });
    const result = await model.generateContent(req.user);
    const usage = result.response.usageMetadata;
    return {
      text: result.response.text(),
      model: modelName,
      inputTokens: usage?.promptTokenCount ?? 0,
      outputTokens: usage?.candidatesTokenCount ?? 0,
    };
  }
}
