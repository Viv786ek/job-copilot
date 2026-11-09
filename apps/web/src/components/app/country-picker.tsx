'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { useApi, useToken } from '@/lib/api';
import { cn } from '@/lib/utils';

interface CountriesResponse {
  withJobs: Array<{ code: string; name: string; count: number }>;
  all: Array<{ code: string; name: string }>;
}

export function useCountries() {
  const api = useApi();
  const { ready } = useToken();
  return useQuery({ queryKey: ['countries'], queryFn: () => api<CountriesResponse>('/jobs/countries'), enabled: ready, staleTime: 3_600_000 });
}

/** Multi-select over every ISO country; countries with open jobs are listed first with counts. */
export function CountryPicker({
  value,
  onChange,
  placeholder = 'Any country',
  showCounts = true,
}: {
  value: string[];
  onChange: (codes: string[]) => void;
  placeholder?: string;
  showCounts?: boolean;
}) {
  const { data } = useCountries();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const options = useMemo(() => {
    const counts = new Map((data?.withJobs ?? []).map((c) => [c.code, c.count]));
    const all = (data?.all ?? []).map((c) => ({ ...c, count: counts.get(c.code) ?? 0 }));
    const term = q.toLowerCase().trim();
    return all
      .filter((c) => !term || c.name.toLowerCase().includes(term) || c.code.toLowerCase() === term)
      .sort((a, b) => (showCounts ? b.count - a.count : 0) || a.name.localeCompare(b.name));
  }, [data, q, showCounts]);
  const names = new Map((data?.all ?? []).map((c) => [c.code, c.name]));

  const toggle = (code: string) => onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex min-h-10 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-left text-sm"
      >
        {value.length === 0 && <span className="text-muted-foreground">{placeholder}</span>}
        {value.map((code) => (
          <span key={code} className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-xs">
            {names.get(code) ?? code}
            <X
              className="h-3 w-3 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                toggle(code);
              }}
            />
          </span>
        ))}
        <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[260px] rounded-md border bg-card p-2 shadow-lg">
          <Input autoFocus placeholder="Search countries…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-2 h-9" />
          <div className="max-h-64 overflow-y-auto">
            {options.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => toggle(c.code)}
                className={cn('flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-secondary', value.includes(c.code) && 'bg-accent')}
              >
                <span className="flex items-center gap-2">
                  <Check className={cn('h-3.5 w-3.5', value.includes(c.code) ? 'opacity-100' : 'opacity-0')} />
                  {c.name}
                </span>
                {showCounts && c.count > 0 && <span className="text-xs text-muted-foreground">{c.count.toLocaleString()}</span>}
              </button>
            ))}
            {!options.length && <p className="p-2 text-sm text-muted-foreground">No country matches “{q}”.</p>}
          </div>
          {value.length > 0 && (
            <button type="button" className="mt-2 w-full text-xs text-muted-foreground hover:underline" onClick={() => onChange([])}>
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const VISA_LABEL: Record<string, { text: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' }> = {
  SPONSORS: { text: 'Sponsors visa', variant: 'success' },
  LIKELY: { text: 'Visa likely', variant: 'warning' },
  NO_SPONSORSHIP: { text: 'No sponsorship', variant: 'destructive' },
};
export function visaLabel(status?: string | null, confidence?: number | null) {
  const v = status ? VISA_LABEL[status] : undefined;
  return v ? { ...v, text: confidence ? `${v.text} · ${confidence}%` : v.text } : null;
}
