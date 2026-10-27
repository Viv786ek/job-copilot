'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';
import { useState } from 'react';
import { Toaster } from 'sonner';
import { DEMO } from '@/lib/session';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  const app = (
    <QueryClientProvider client={client}>
      {children}
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
  // The static demo has no Auth.js endpoint to talk to.
  return DEMO ? app : <SessionProvider>{app}</SessionProvider>;
}
