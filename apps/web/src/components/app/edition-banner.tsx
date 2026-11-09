'use client';

import { useQuery } from '@tanstack/react-query';
import { Database, Github, Lock } from 'lucide-react';
import { loadIndex } from '@/lib/local/dataset';
import { LOCAL_MODE } from '@/lib/session';

export const REPO_URL = 'https://github.com/Viv786ek/job-copilot';

function ago(iso: string) {
  const h = Math.round((Date.now() - Date.parse(iso)) / 3_600_000);
  return h < 1 ? 'just now' : h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

export function EditionBanner() {
  const { data } = useQuery({ queryKey: ['dataset-meta'], queryFn: async () => (await loadIndex()).meta, enabled: LOCAL_MODE, staleTime: Infinity });
  if (!LOCAL_MODE) return null;
  return (
    <div className="mb-6 flex flex-col gap-2 rounded-lg border bg-card px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Database className="h-3.5 w-3.5 text-primary" />
          {data ? (
            <>
              <b className="text-foreground">{data.totalJobs.toLocaleString()}</b> live jobs · {data.companies.toLocaleString()} companies · {data.countries.length} countries · updated{' '}
              {ago(data.generatedAt)}
            </>
          ) : (
            'Loading job index…'
          )}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 text-success" /> Your resume stays in this browser
        </span>
      </p>
      <a className="inline-flex shrink-0 items-center gap-1 font-medium hover:underline" href={REPO_URL} target="_blank" rel="noopener noreferrer">
        <Github className="h-3.5 w-3.5" /> Source
      </a>
    </div>
  );
}
