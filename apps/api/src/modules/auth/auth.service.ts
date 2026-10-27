import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../core/prisma.service';

const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-not-a-password', 12);

export interface AuthResult {
  accessToken: string;
  user: { id: string; email: string; name: string | null; image: string | null; plan: string };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(email: string, password: string, name?: string): Promise<AuthResult> {
    const normalized = email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (existing) throw new ConflictException('An account with this email already exists');
    const user = await this.prisma.user.create({
      data: {
        email: normalized,
        name,
        passwordHash: await bcrypt.hash(password, 12),
        preferences: { create: {} },
        profile: { create: { skills: [], primaryRoles: [], embedding: [] } },
      },
    });
    return this.issue(user);
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    // Compare against a dummy hash when the user is missing to keep timing uniform.
    const hash = user?.passwordHash ?? DUMMY_HASH;
    const ok = await bcrypt.compare(password, hash);
    if (!user || !user.passwordHash || !ok) throw new UnauthorizedException('Invalid email or password');
    return this.issue(user);
  }

  /** Called server-to-server by Auth.js after a successful OAuth sign-in. */
  async upsertOAuth(input: {
    email: string;
    name?: string | null;
    image?: string | null;
    provider: string;
    providerAccountId: string;
  }): Promise<AuthResult> {
    const email = input.email.toLowerCase().trim();
    const user = await this.prisma.user.upsert({
      where: { email },
      update: { name: input.name ?? undefined, image: input.image ?? undefined },
      create: {
        email,
        name: input.name,
        image: input.image,
        emailVerified: new Date(),
        preferences: { create: {} },
        profile: { create: { skills: [], primaryRoles: [], embedding: [] } },
      },
    });
    await this.prisma.oAuthAccount.upsert({
      where: {
        provider_providerAccountId: { provider: input.provider, providerAccountId: input.providerAccountId },
      },
      update: {},
      create: { userId: user.id, provider: input.provider, providerAccountId: input.providerAccountId },
    });
    return this.issue(user);
  }

  async me(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, name: true, image: true, plan: true, role: true, createdAt: true },
    });
  }

  private async issue(user: User): Promise<AuthResult> {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
    });
    return {
      accessToken,
      user: { id: user.id, email: user.email, name: user.name, image: user.image, plan: user.plan },
    };
  }
}
