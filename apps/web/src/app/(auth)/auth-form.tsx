'use client';

import { Loader2, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { apiFetch } from '@/lib/api';
import { DEMO } from '@/lib/session';

export function AuthForm({ mode, oauth }: { mode: 'login' | 'register'; oauth: { google: boolean; github: boolean } }) {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') ?? '/dashboard';
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get('email'));
    const password = String(form.get('password'));
    setLoading(true);
    try {
      if (mode === 'register') {
        await apiFetch('/auth/register', undefined, {
          method: 'POST',
          body: JSON.stringify({ email, password, name: String(form.get('name') || '') || undefined }),
        });
      }
      const res = await signIn('credentials', { email, password, redirect: false });
      if (res?.error) throw new Error('Invalid email or password');
      router.push(mode === 'register' ? '/resumes?welcome=1' : callbackUrl);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (DEMO) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <Sparkles className="mx-auto h-8 w-8 text-primary" />
            <CardTitle className="text-2xl">No sign-up needed</CardTitle>
            <CardDescription>
              This is the public demo. You&apos;ll use a sample candidate profile, and everything stays in your browser.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/dashboard">Enter the demo</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Sparkles className="mx-auto h-8 w-8 text-primary" />
          <CardTitle className="text-2xl">{mode === 'login' ? 'Welcome back' : 'Create your account'}</CardTitle>
          <CardDescription>{mode === 'login' ? 'Sign in to your job copilot' : 'Free plan includes 50 AI generations per month'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(oauth.google || oauth.github) && (
            <div className="grid gap-2">
              {oauth.google && (
                <Button variant="outline" onClick={() => signIn('google', { callbackUrl })}>
                  Continue with Google
                </Button>
              )}
              {oauth.github && (
                <Button variant="outline" onClick={() => signIn('github', { callbackUrl })}>
                  Continue with GitHub
                </Button>
              )}
              <div className="relative py-2 text-center text-xs text-muted-foreground">
                <span className="bg-card px-2">or with email</span>
              </div>
            </div>
          )}
          <form onSubmit={onSubmit} className="space-y-4">
            {mode === 'register' && (
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" autoComplete="name" />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="animate-spin" />}
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground">
            {mode === 'login' ? (
              <>
                New here? <Link className="text-primary hover:underline" href="/register">Create an account</Link>
              </>
            ) : (
              <>
                Already have an account? <Link className="text-primary hover:underline" href="/login">Sign in</Link>
              </>
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
