import NextAuth, { type NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';

const API_URL = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const TOKEN_TTL_MS = 6.5 * 24 * 3600 * 1000; // a little under the API's 7d JWT expiry

interface ApiAuthResult {
  accessToken: string;
  user: { id: string; email: string; name: string | null; image: string | null; plan: string };
}

async function apiPost<T>(path: string, body: unknown, internal = false): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(internal ? { 'x-internal-key': process.env.INTERNAL_API_KEY ?? '' } : {}),
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

const providers: NextAuthConfig['providers'] = [
  Credentials({
    credentials: { email: { label: 'Email', type: 'email' }, password: { label: 'Password', type: 'password' } },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) return null;
      try {
        const r = await apiPost<ApiAuthResult>('/auth/login', { email: credentials.email, password: credentials.password });
        return { id: r.user.id, email: r.user.email, name: r.user.name, image: r.user.image, accessToken: r.accessToken, plan: r.user.plan };
      } catch {
        return null;
      }
    },
  }),
];
if (process.env.AUTH_GOOGLE_ID) providers.push(Google);
if (process.env.AUTH_GITHUB_ID) providers.push(GitHub);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  trustHost: true,
  callbacks: {
    async jwt({ token, user, account }) {
      if (account && user) {
        if (account.provider === 'credentials') {
          token.accessToken = user.accessToken;
          token.plan = user.plan;
        } else {
          // Exchange the OAuth identity for an API token (server-to-server, internal key).
          const r = await apiPost<ApiAuthResult>(
            '/auth/oauth',
            { email: user.email, name: user.name, image: user.image, provider: account.provider, providerAccountId: account.providerAccountId },
            true,
          );
          token.accessToken = r.accessToken;
          token.plan = r.user.plan;
          token.sub = r.user.id;
        }
        token.accessTokenExpires = Date.now() + TOKEN_TTL_MS;
      }
      // Expired API token -> force re-login rather than sending a dead token.
      if (token.accessTokenExpires && Date.now() > token.accessTokenExpires) return null;
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.user.id = token.sub as string;
      session.user.plan = (token.plan as string) ?? 'FREE';
      return session;
    },
    authorized({ auth: session, request }) {
      const protectedPaths = ['/dashboard', '/resumes', '/jobs', '/analyzer', '/applications', '/documents', '/interviews', '/settings'];
      const isProtected = protectedPaths.some((p) => request.nextUrl.pathname.startsWith(p));
      return isProtected ? !!session?.user : true;
    },
  },
});
