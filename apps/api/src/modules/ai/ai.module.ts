import { Global, Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AnthropicProvider } from './providers/anthropic.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { OpenAiProvider } from './providers/openai.provider';
import { LLM_PROVIDERS } from './providers/provider';

@Global()
@Module({
  providers: [
    OpenAiProvider,
    AnthropicProvider,
    GeminiProvider,
    {
      provide: LLM_PROVIDERS,
      useFactory: (o: OpenAiProvider, a: AnthropicProvider, g: GeminiProvider) => [o, a, g],
      inject: [OpenAiProvider, AnthropicProvider, GeminiProvider],
    },
    AiService,
  ],
  exports: [AiService],
})
export class AiModule {}
