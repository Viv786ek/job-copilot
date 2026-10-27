'use client';

import { useCallback } from 'react';
import { demoRequest } from './demo/backend';
import { DEMO, useAppSession } from './session';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, token: string | undefined, init: RequestInit = {}): Promise<T> {
  if (DEMO) return demoRequest<T>(path, init);
  const isForm = init.body instanceof FormData;
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    headers: {
      ...(isForm ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray(body?.errors) ? body.errors.map((e: { message: string }) => e.message).join(', ') : body?.message;
    throw new ApiError(res.status, msg || `Request failed (${res.status})`);
  }
  return body as T;
}

/** Returns a fetcher bound to the current session token. */
export function useApi() {
  const { token } = useAppSession();
  return useCallback(<T,>(path: string, init?: RequestInit) => apiFetch<T>(path, token, init), [token]);
}

export function useToken() {
  const { token, ready } = useAppSession();
  return { token, ready };
}

/** Triggers a browser download for a presigned (or blob) URL. */
export function download(url: string, fileName: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
