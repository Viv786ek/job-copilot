import { Suspense } from 'react';
import { AuthForm } from '../auth-form';

export const metadata = { title: 'Create account' };

export default function RegisterPage() {
  // Build-time flag (NEXT_PUBLIC_AUTH_PROVIDERS=google,github) keeps this page statically renderable.
  const providers = (process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? '').split(',');
  const oauth = { google: providers.includes('google'), github: providers.includes('github') };
  return (
    <Suspense>
      <AuthForm mode="register" oauth={oauth} />
    </Suspense>
  );
}
