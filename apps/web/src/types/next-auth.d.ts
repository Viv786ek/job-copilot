import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface User {
    accessToken?: string;
    plan?: string;
  }
  interface Session {
    accessToken: string;
    user: { id: string; plan: string; email: string; name?: string | null; image?: string | null };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    accessTokenExpires?: number;
    plan?: string;
  }
}
