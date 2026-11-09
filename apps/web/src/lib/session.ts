'use client';

import { signOut, useSession } from 'next-auth/react';

/**
 * Two editions, chosen at build time:
 *  - server edition: Auth.js session + NestJS API
 *  - local edition (GitHub Pages): no server; the API runs in the browser over the harvested
 *    job index, and the user's resume/applications stay in this browser's storage.
 */
export const LOCAL_MODE = process.env.NEXT_PUBLIC_LOCAL_MODE === 'true';
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

function readLocalUser(): { name: string | null; email: string | null } {
  try {
    const s = JSON.parse(window.localStorage.getItem('job-copilot-local-v3') ?? 'null');
    const r = s?.resumes?.find((x: { id: string }) => x.id === s.activeResumeId) ?? s?.resumes?.[0];
    return { name: r?.parsed?.fullName ?? null, email: r?.parsed?.email ?? null };
  } catch {
    return { name: null, email: null };
  }
}

function useLocalSession(): AppSession {
  const u = typeof window === 'undefined' ? { name: null, email: null } : readLocalUser();
  return {
    token: 'local',
    ready: true,
    user: { name: u.name ?? 'Your workspace', email: u.email ?? 'Stored only in this browser', plan: 'LOCAL' },
    signOut: async () => {
      if (!window.confirm('Remove your resume, saved jobs, applications and documents from this browser?')) return;
      const { resetLocalData } = await import('./local/backend');
      resetLocalData();
      window.location.href = `${BASE_PATH}/`;
    },
  };
}

// Chosen once at build time, so hook order never changes between renders.
export const useAppSession = LOCAL_MODE ? useLocalSession : useRealSession;
