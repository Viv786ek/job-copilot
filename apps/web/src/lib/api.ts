'use client';

import { useSession } from 'next-auth/react';
import { useCallback } from 'react';

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
  const { data } = useSession();
  const token = data?.accessToken;
  return useCallback(
    <T,>(path: string, init?: RequestInit) => apiFetch<T>(path, token, init),
    [token],
  );
}

export function useToken() {
  const { data, status } = useSession();
  return { token: data?.accessToken, ready: status === 'authenticated' };
}
