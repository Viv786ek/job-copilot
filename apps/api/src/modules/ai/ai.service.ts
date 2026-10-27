import { HttpException, HttpStatus, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { AiProviderName } from '@copilot/shared';
import type { ZodTypeAny, z } from 'zod';
import { AppConfig } from '../../config/config.service';
import { CacheService } from '../../core/cache.service';
import { PrismaService } from '../../core/prisma.service';
import { LLM_PROVIDERS, LlmProvider } from './providers/provider';

export interface GenerateOptions {
  feature: string;
  userId?: string;
  temperature?: number;
  maxTokens?: number;
  /** When false the response is never served from or written to cache. */
  cache?: boolean;
  /** Bypass the monthly quota (system jobs, e.g. JD analysis shared across users). */
  system?: boolean;
}

/**
 * AI gateway. Every LLM call in the product goes through here, which gives us:
 *  - provider routing with ordered fallback (OpenAI -> Claude -> Gemini by default)
 *  - strict JSON output validated against zod schemas, with one self-repair attempt
 *  - prompt-hash response caching in Redis
 *  - per-user monthly quotas and token/latency accounting (AiUsage table)
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @Inject(LLM_PROVIDERS) private readonly providers: LlmProvider[],
    private readonly config: AppConfig,
    private readonly cache: CacheService,
    private readonly prisma: PrismaService,
  ) {}

  private chain(): LlmProvider[] {
    const order: AiProviderName[] = [
      this.config.get('AI_PRIMARY_PROVIDER'),
      ...(this.config
        .get('AI_FALLBACK_PROVIDERS')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean) as AiProviderName[]),
    ];
    const seen = new Set<string>();
    return order
      .filter((n) => (seen.has(n) ? false : (seen.add(n), true)))
      .map((n) => this.providers.find((p) => p.name === n))
      .filter((p): p is LlmProvider => !!p && p.isConfigured());
  }

  async generateJson<S extends ZodTypeAny>(
    schema: S,
    prompt: { system: string; user: string },
    opts: GenerateOptions,
  ): Promise<{ data: z.infer<S>; model: string }> {
    const cacheKey = `ai:${opts.feature}:${CacheService.hash(prompt.system, prompt.user)}`;
    if (opts.cache !== false) {
      const hit = await this.cache.getJson<{ data: z.infer<S>; model: string }>(cacheKey);
      if (hit) return hit;
    }
    if (!opts.system && opts.userId) await this.enforceQuota(opts.userId);

    const providers = this.chain();
    if (!providers.length) throw new ServiceUnavailableException('No AI provider is configured');

    let lastError: unknown;
    for (const provider of providers) {
      const started = Date.now();
      try {
        const res = await provider.complete({ ...prompt, json: true, temperature: opts.temperature, maxTokens: opts.maxTokens });
        let parsed = schema.safeParse(this.extractJson(res.text));
        let { inputTokens, outputTokens } = res;

        if (!parsed.success) {
          // One repair round: show the model its own output and the validation errors.
          const repair = await provider.complete({
            system: prompt.system,
            user: `${prompt.user}\n\nYour previous response was invalid:\n${res.text.slice(0, 6000)}\n\nValidation errors:\n${parsed.error.issues
              .slice(0, 15)
              .map((i) => `- ${i.path.join('.')}: ${i.message}`)
              .join('\n')}\n\nReturn the corrected JSON object only.`,
            json: true,
            temperature: 0,
            maxTokens: opts.maxTokens,
          });
          inputTokens += repair.inputTokens;
          outputTokens += repair.outputTokens;
          parsed = schema.safeParse(this.extractJson(repair.text));
        }

        await this.track(opts, provider.name, res.model, inputTokens, outputTokens, Date.now() - started, parsed.success);
        if (!parsed.success) throw new Error(`Schema validation failed for ${opts.feature}`);

        const result = { data: parsed.data as z.infer<S>, model: `${provider.name}:${res.model}` };
        if (opts.cache !== false) await this.cache.setJson(cacheKey, result, this.config.get('AI_CACHE_TTL_SECONDS'));
        return result;
      } catch (err) {
        lastError = err;
        this.logger.warn(`[${opts.feature}] provider ${provider.name} failed: ${(err as Error).message}`);
      }
    }
    throw new ServiceUnavailableException(`AI generation failed: ${(lastError as Error)?.message ?? 'unknown error'}`);
  }

  /** Returns [] when no embedding-capable provider is configured; matching degrades gracefully. */
  async embed(texts: string[]): Promise<number[][]> {
    const provider = this.providers.find((p) => p.isConfigured() && typeof p.embed === 'function');
    if (!provider || !texts.length) return texts.map(() => []);
    const key = `emb:${CacheService.hash(texts)}`;
    return this.cache.wrap(key, 60 * 60 * 24 * 30, () => provider.embed!(texts)).catch((e) => {
      this.logger.warn(`Embedding failed: ${(e as Error).message}`);
      return texts.map(() => []);
    });
  }

  private extractJson(text: string): unknown {
    const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try {
      return JSON.parse(trimmed);
    } catch {
      const start = trimmed.indexOf('{');
      const end = trimmed.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(trimmed.slice(start, end + 1));
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  private async enforceQuota(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
    if (!user || user.plan !== 'FREE') return;
    const month = new Date().toISOString().slice(0, 7);
    const count = await this.cache.incrWindow(`quota:${userId}:${month}`, 60 * 60 * 24 * 32);
    if (count > this.config.get('FREE_PLAN_MONTHLY_AI_CALLS')) {
      throw new HttpException('Monthly AI quota reached. Upgrade to Pro for unlimited generations.', HttpStatus.PAYMENT_REQUIRED);
    }
  }

  private async track(
    opts: GenerateOptions,
    provider: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    latencyMs: number,
    success: boolean,
  ) {
    await this.prisma.aiUsage
      .create({ data: { userId: opts.userId, feature: opts.feature, provider, model, inputTokens, outputTokens, latencyMs, success } })
      .catch(() => undefined);
  }
}
