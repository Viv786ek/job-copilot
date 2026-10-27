import { Suspense } from 'react';
import { AuthForm } from '../auth-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Create account' };

export default function RegisterPage() {
  const oauth = { google: !!process.env.AUTH_GOOGLE_ID, github: !!process.env.AUTH_GITHUB_ID };
  return (
    <Suspense>
      <AuthForm mode="register" oauth={oauth} />
    </Suspense>
  );
}
