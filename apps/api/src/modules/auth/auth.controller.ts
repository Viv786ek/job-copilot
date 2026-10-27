import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { AuthUser, CurrentUser, Internal, Public } from '../../common/auth';
import { ZodPipe } from '../../common/zod.pipe';
import { AuthService } from './auth.service';

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100).optional(),
});
const LoginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const OAuthSchema = z.object({
  email: z.string().email(),
  name: z.string().nullish(),
  image: z.string().nullish(),
  provider: z.string(),
  providerAccountId: z.string(),
});

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body(new ZodPipe(RegisterSchema)) body: z.infer<typeof RegisterSchema>) {
    return this.auth.register(body.email, body.password, body.name);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  login(@Body(new ZodPipe(LoginSchema)) body: z.infer<typeof LoginSchema>) {
    return this.auth.login(body.email, body.password);
  }

  @Internal()
  @HttpCode(200)
  @Post('oauth')
  oauth(@Body(new ZodPipe(OAuthSchema)) body: z.infer<typeof OAuthSchema>) {
    return this.auth.upsertOAuth(body);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}
