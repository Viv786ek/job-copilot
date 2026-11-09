import { Global, Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AnthropicProvider } from './providers/anthropic.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { LocalProvider } from './providers/local.provider';
import { OpenAiProvider } from './providers/openai.provider';
import { LLM_PROVIDERS } from './providers/provider';

@Global()
@Module({
  providers: [
    OpenAiProvider,
    AnthropicProvider,
    GeminiProvider,
    LocalProvider,
    {
      provide: LLM_PROVIDERS,
      useFactory: (o: OpenAiProvider, a: AnthropicProvider, g: GeminiProvider, l: LocalProvider) => [o, a, g, l],
      inject: [OpenAiProvider, AnthropicProvider, GeminiProvider, LocalProvider],
    },
    AiService,
  ],
  exports: [AiService],
})
export class AiModule {}
