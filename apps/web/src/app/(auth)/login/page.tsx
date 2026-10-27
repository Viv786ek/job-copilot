import { Suspense } from 'react';
import { AuthForm } from '../auth-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in' };

export default function LoginPage() {
  const oauth = { google: !!process.env.AUTH_GOOGLE_ID, github: !!process.env.AUTH_GITHUB_ID };
  return (
    <Suspense>
      <AuthForm mode="login" oauth={oauth} />
    </Suspense>
  );
}
