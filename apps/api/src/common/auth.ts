import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { AppConfig } from '../config/config.service';

export interface AuthUser {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN';
  plan: 'FREE' | 'PRO' | 'TEAM';
}

export const IS_PUBLIC = 'isPublic';
export const IS_INTERNAL = 'isInternal';
/** Route is reachable without a user JWT. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Route is only reachable with the x-internal-key header (n8n, Next.js server). */
export const Internal = () => SetMetadata(IS_INTERNAL, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<Request & { user: AuthUser }>();
  return req.user;
});

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Global guard: JWT for user routes, shared key for internal routes. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();

    if (this.reflector.getAllAndOverride<boolean>(IS_INTERNAL, targets)) {
      const key = req.headers['x-internal-key'];
      if (typeof key === 'string' && safeEqual(key, this.config.get('INTERNAL_API_KEY'))) return true;
      throw new UnauthorizedException('Invalid internal key');
    }

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException();
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; email: string; role: AuthUser['role']; plan: AuthUser['plan'] }>(token);
      req.user = { id: payload.sub, email: payload.email, role: payload.role, plan: payload.plan };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
