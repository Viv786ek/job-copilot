'use client';

import { signOut, useSession } from 'next-auth/react';
import { resetDemo } from './demo/backend';

/** Static GitHub Pages build: no server, no Auth.js; the API runs in the browser. */
export const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export interface AppSession {
  token: string | undefined;
  ready: boolean;
  user: { name?: string | null; email?: string | null; plan: string } | null;
  signOut: () => void;
}

function useRealSession(): AppSession {
  const { data, status } = useSession();
  return {
    token: data?.accessToken,
    ready: status === 'authenticated',
    user: data?.user ? { name: data.user.name, email: data.user.email, plan: data.user.plan ?? 'FREE' } : null,
    signOut: () => void signOut({ callbackUrl: '/' }),
  };
}

function useDemoSession(): AppSession {
  return {
    token: 'demo',
    ready: true,
    user: { name: 'Aarav Sharma (demo)', email: 'aarav.sharma@example.com', plan: 'PRO' },
    signOut: () => {
      resetDemo();
      window.location.href = `${BASE_PATH}/`;
    },
  };
}

// Chosen once at build time, so hook order never changes between renders.
export const useAppSession = DEMO ? useDemoSession : useRealSession;
