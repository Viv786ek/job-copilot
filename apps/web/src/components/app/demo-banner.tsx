'use client';

import { Github, RotateCcw } from 'lucide-react';
import { resetDemo } from '@/lib/demo/backend';
import { DEMO } from '@/lib/session';

export const REPO_URL = 'https://github.com/Viv786ek/job-copilot';

export function DemoBanner() {
  if (!DEMO) return null;
  return (
    <div className="mb-6 flex flex-col gap-2 rounded-lg border border-primary/30 bg-accent px-4 py-3 text-sm text-accent-foreground sm:flex-row sm:items-center sm:justify-between">
      <p>
        <span className="font-semibold">Live demo.</span> Runs entirely in your browser with a sample candidate and fictional jobs. Matching, ATS scoring and
        honesty guardrails are the real engine; AI writing is replaced by templates.
      </p>
      <div className="flex shrink-0 gap-3">
        <button
          className="inline-flex items-center gap-1 font-medium hover:underline"
          onClick={() => {
            resetDemo();
            window.location.reload();
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </button>
        <a className="inline-flex items-center gap-1 font-medium hover:underline" href={REPO_URL} target="_blank" rel="noopener noreferrer">
          <Github className="h-3.5 w-3.5" /> Source
        </a>
      </div>
    </div>
  );
}
