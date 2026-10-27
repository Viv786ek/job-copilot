import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createHash } from 'crypto';
import Redis from 'ioredis';
import { AppConfig } from '../config/config.service';

/**
 * Thin Redis wrapper. Used for: AI response caching (keyed by prompt hash),
 * dashboard stat caching, rate counters, and idempotency locks.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  readonly client: Redis;

  constructor(config: AppConfig) {
    this.client = new Redis(config.get('REDIS_URL'), { maxRetriesPerRequest: null, lazyConnect: false });
    this.client.on('error', (e) => this.logger.warn(`Redis error: ${e.message}`));
  }

  static hash(...parts: unknown[]): string {
    return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  }

  async getJson<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (e) {
      this.logger.warn(`Cache set failed for ${key}: ${(e as Error).message}`);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length) await this.client.del(...keys).catch(() => undefined);
  }

  async wrap<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    const hit = await this.getJson<T>(key);
    if (hit !== null) return hit;
    const value = await fn();
    await this.setJson(key, value, ttlSeconds);
    return value;
  }

  /** Increment a counter that expires at the end of the window. Returns the new count. */
  async incrWindow(key: string, windowSeconds: number): Promise<number> {
    const count = await this.client.incr(key);
    if (count === 1) await this.client.expire(key, windowSeconds);
    return count;
  }

  async onModuleDestroy() {
    await this.client.quit().catch(() => undefined);
  }
}
