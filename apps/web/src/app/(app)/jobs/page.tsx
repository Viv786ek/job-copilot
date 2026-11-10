'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Bookmark, Link2, Loader2, Plane, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CountryPicker } from '@/components/app/country-picker';
import { JobCard } from '@/components/app/job-card';
import { EmptyState, PageHeader } from '@/components/app/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label, NativeSelect, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/progress';
import { useApi, useToken } from '@/lib/api';
import { LOCAL_MODE } from '@/lib/session';
import type { FeedResponse } from '@/lib/types';

interface Filters {
  q: string;
  countries: string[];
  includeRemote: boolean;
  workModes: string[];
  visa: '' | 'likely' | 'sponsors' | 'exclude-no';
  relocation: boolean;
  postedWithinDays: string;
  source: string;
  minScore: string;
  sort: 'score' | 'recent';
  saved: boolean;
  level: string;
  salaryMin: string;
  salaryCurrency: string;
  newWithinDays: string;
}

const DEFAULTS: Filters = { q: '', countries: [], includeRemote: true, workModes: [], visa: '', relocation: false, postedWithinDays: '', source: '', minScore: '0', sort: 'score', saved: false, level: '', salaryMin: '', salaryCurrency: 'USD', newWithinDays: '' };
const STORE = 'job-copilot-filters';

export default function JobsPage() {
  const api = useApi();
  const { ready } = useToken();
  const router = useRouter();
  const [f, setF] = useState<Filters>(DEFAULTS);
  const [page, setPage] = useState(1);
  const [showImport, setShowImport] = useState(false);
  const [imp, setImp] = useState({ url: '', title: '', company: '', description: '' });

  // Restore last filters (per-viewer convenience); otherwise start from the target countries in Settings.
  useEffect(() => {
    // Deep links (e.g. from Career Insights: /jobs?q=Company) override saved filters.
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) {
      setF({ ...DEFAULTS, q });
      return;
    }
    try {
      const saved = window.localStorage.getItem(STORE);
      if (saved) {
        setF({ ...DEFAULTS, ...JSON.parse(saved) });
        return;
      }
    } catch {
      /* storage blocked */
    }
    if (ready)
      api<{ preferences: { countries?: string[] } | null }>('/profile')
        .then((p) => {
          const countries = p.preferences?.countries ?? [];
          if (countries.length) setF((x) => ({ ...x, countries }));
        })
        .catch(() => undefined);
  }, [ready, api]);

  const update = (patch: Partial<Filters>) => {
    setPage(1);
    setF((x) => {
      const next = { ...x, ...patch };
      try {
        window.localStorage.setItem(STORE, JSON.stringify(next));
      } catch {
        /* storage blocked */
      }
      return next;
    });
  };

  const params = new URLSearchParams({
    page: String(page),
    sort: f.sort,
    minScore: f.minScore,
    includeRemote: String(f.includeRemote),
    ...(f.q ? { q: f.q } : {}),
    ...(f.countries.length ? { countries: f.countries.join(',') } : {}),
    ...(f.workModes.length ? { workModes: f.workModes.join(',') } : {}),
    ...(f.visa ? { visa: f.visa } : {}),
    ...(f.relocation ? { relocation: 'true' } : {}),
    ...(f.postedWithinDays ? { postedWithinDays: f.postedWithinDays } : {}),
    ...(f.source ? { source: f.source } : {}),
    ...(f.saved ? { saved: 'true' } : {}),
    ...(f.level ? { level: f.level } : {}),
    ...(f.salaryMin ? { salaryMin: f.salaryMin, salaryCurrency: f.salaryCurrency } : {}),
    ...(f.newWithinDays ? { newWithinDays: f.newWithinDays } : {}),
  });
  const feed = useQuery({ queryKey: ['feed', params.toString()], queryFn: () => api<FeedResponse>(`/jobs/feed?${params}`), enabled: ready });
  const sources = useQuery({
    queryKey: ['sources'],
    queryFn: () => api<{ sources?: Array<{ source: string; ok: boolean; jobs: number }>; feeds?: Array<{ source: string; enabled: boolean }> }>('/jobs/sources'),
    enabled: ready,
    staleTime: 3_600_000,
  });
  const sourceNames = (sources.data?.sources?.filter((s) => s.ok && s.jobs > 0).map((s) => s.source) ?? sources.data?.feeds?.map((s) => s.source) ?? []).sort();

  const search = useMutation({
    mutationFn: () => api<{ queued?: boolean; message?: string }>('/jobs/search/run', { method: 'POST' }),
    onSuccess: (r) => toast.success(r.message ?? 'Searching job sources. New matches will appear within a few minutes.'),
    onError: (e) => toast.error((e as Error).message),
  });
  const importJob = useMutation({
    mutationFn: () =>
      api<{ jobId: string }>('/jobs/import', {
        method: 'POST',
        body: JSON.stringify({ url: imp.url || undefined, title: imp.title || undefined, company: imp.company || undefined, description: imp.description || undefined }),
      }),
    onSuccess: ({ jobId }) => {
      toast.success('Job added and analyzed');
      router.push(`/jobs/view?id=${jobId}`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const toggleMode = (m: string) => update({ workModes: f.workModes.includes(m) ? f.workModes.filter((x) => x !== m) : [...f.workModes, m] });
  const pages = feed.data ? Math.ceil(feed.data.total / feed.data.pageSize) : 0;

  return (
    <>
      <PageHeader
        title="Recommended jobs"
        description="Real openings from company career boards and job feeds, scored against your resume."
        actions={
          <>
            <Button variant="outline" onClick={() => setShowImport(!showImport)}>
              <Link2 /> Add a job
            </Button>
            {!LOCAL_MODE && (
              <Button onClick={() => search.mutate()} disabled={search.isPending}>
                {search.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Find new jobs
              </Button>
            )}
          </>
        }
      />

      {showImport && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Add a job from LinkedIn, Wellfound, Naukri, Bayt or any other site</CardTitle>
            <CardDescription>
              {LOCAL_MODE
                ? 'Paste the job description (and optionally its link). It is analyzed for skills, visa sponsorship and fit.'
                : 'Paste the job URL; if the page needs a login, paste the description as well.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <Input placeholder="Job URL" value={imp.url} onChange={(e) => setImp({ ...imp, url: e.target.value })} className="sm:col-span-3" />
            <Input placeholder="Job title" value={imp.title} onChange={(e) => setImp({ ...imp, title: e.target.value })} />
            <Input placeholder="Company" value={imp.company} onChange={(e) => setImp({ ...imp, company: e.target.value })} />
            <div />
            <Textarea rows={6} placeholder="Full job description" value={imp.description} onChange={(e) => setImp({ ...imp, description: e.target.value })} className="sm:col-span-3" />
            <Button onClick={() => importJob.mutate()} disabled={importJob.isPending || (LOCAL_MODE ? imp.description.length < 100 : !imp.url && imp.description.length < 100)}>
              {importJob.isPending && <Loader2 className="animate-spin" />} Add & analyze
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="mb-4">
        <CardContent className="grid gap-3 p-4 md:grid-cols-6">
          <div className="space-y-1 md:col-span-2">
            <Label>Search</Label>
            <Input placeholder="Title or company" value={f.q} onChange={(e) => update({ q: e.target.value })} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Countries</Label>
            <CountryPicker value={f.countries} onChange={(countries) => update({ countries })} placeholder="All countries" />
          </div>
          <div className="space-y-1">
            <Label>Visa</Label>
            <NativeSelect value={f.visa} onChange={(e) => update({ visa: e.target.value as Filters['visa'] })}>
              <option value="">Any</option>
              <option value="exclude-no">Hide “no sponsorship”</option>
              <option value="likely">Sponsors or likely</option>
              <option value="sponsors">Explicitly sponsors</option>
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label>Posted</Label>
            <NativeSelect value={f.postedWithinDays} onChange={(e) => update({ postedWithinDays: e.target.value })}>
              <option value="">Any time</option>
              <option value="1">Last 24 hours</option>
              <option value="3">Last 3 days</option>
              <option value="7">Last week</option>
              <option value="14">Last 2 weeks</option>
              <option value="30">Last month</option>
            </NativeSelect>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:col-span-4">
            {['REMOTE', 'HYBRID', 'ONSITE'].map((m) => (
              <Button key={m} size="sm" variant={f.workModes.includes(m) ? 'default' : 'outline'} onClick={() => toggleMode(m)}>
                {m === 'ONSITE' ? 'On-site' : m.charAt(0) + m.slice(1).toLowerCase()}
              </Button>
            ))}
            <Button size="sm" variant={f.relocation ? 'default' : 'outline'} onClick={() => update({ relocation: !f.relocation })}>
              <Plane /> Relocation support
            </Button>
            <Button size="sm" variant={f.saved ? 'default' : 'outline'} onClick={() => update({ saved: !f.saved })}>
              <Bookmark /> Saved
            </Button>
            {f.countries.length > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4" checked={f.includeRemote} onChange={(e) => update({ includeRemote: e.target.checked })} />
                Include remote roles open to these countries
              </label>
            )}
          </div>
          <div className="space-y-1">
            <Label>Experience</Label>
            <NativeSelect value={f.level} onChange={(e) => update({ level: e.target.value })}>
              <option value="">Any level</option>
              <option value="entry">Entry (0–2 yrs)</option>
              <option value="mid">Mid (2–5 yrs)</option>
              <option value="senior">Senior (5+ yrs)</option>
              <option value="leadership">Lead / manager</option>
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label>Minimum salary (listed only)</Label>
            <div className="flex gap-1">
              <NativeSelect className="w-24" value={f.salaryCurrency} onChange={(e) => update({ salaryCurrency: e.target.value })}>
                {['USD', 'EUR', 'GBP', 'INR', 'AED', 'CHF', 'CAD', 'AUD', 'SGD'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </NativeSelect>
              <Input type="number" min={0} step={5000} placeholder="Any" value={f.salaryMin} onChange={(e) => update({ salaryMin: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>New to our index</Label>
            <NativeSelect value={f.newWithinDays} onChange={(e) => update({ newWithinDays: e.target.value })}>
              <option value="">Any</option>
              <option value="1">Found in the last 24 h</option>
              <option value="3">Last 3 days</option>
              <option value="7">Last week</option>
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label>Source</Label>
            <NativeSelect value={f.source} onChange={(e) => update({ source: e.target.value })}>
              <option value="">All sources</option>
              {sourceNames.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label>Sort</Label>
            <NativeSelect
              value={`${f.sort}:${f.minScore}`}
              onChange={(e) => {
                const [sort, minScore] = e.target.value.split(':');
                update({ sort: sort as Filters['sort'], minScore });
              }}
            >
              <option value="score:0">Best match</option>
              <option value="score:60">Match ≥ 60</option>
              <option value="score:75">Match ≥ 75</option>
              <option value="recent:0">Most recent</option>
            </NativeSelect>
          </div>
        </CardContent>
      </Card>

      {feed.data && feed.data.hasProfile === false && (
        <div className="mb-4 rounded-md border border-primary/30 bg-accent px-4 py-3 text-sm text-accent-foreground">
          <Link href="/resumes" className="font-medium underline">
            Upload your resume
          </Link>{' '}
          to see match scores, skill gaps and ATS scores for every job.
        </div>
      )}

      {feed.isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      )}
      {feed.error && <EmptyState title="Couldn't load jobs" description={(feed.error as Error).message} />}
      {feed.data && feed.data.items.length === 0 && (
        <EmptyState
          title="No jobs match these filters"
          description="Widen the countries, include remote roles, or relax the visa filter."
          action={
            <Button variant="outline" onClick={() => update(DEFAULTS)}>
              Reset filters
            </Button>
          }
        />
      )}

      {feed.data && feed.data.total > 0 && <p className="mb-2 text-sm text-muted-foreground">{feed.data.total.toLocaleString()} jobs</p>}

      <div className="space-y-3">
        {feed.data?.items.map((m) => <JobCard key={m.id} m={m} />)}
      </div>

      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {pages.toLocaleString()}
          </span>
          <Button variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </>
  );
}
