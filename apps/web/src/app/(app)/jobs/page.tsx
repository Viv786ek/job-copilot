'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, BookmarkCheck, ExternalLink, Link2, Loader2, Plane, RefreshCw, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CountryPicker, visaLabel } from '@/components/app/country-picker';
import { EmptyState, PageHeader, ScoreRing } from '@/components/app/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label, NativeSelect, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/progress';
import { useApi, useToken } from '@/lib/api';
import { LOCAL_MODE } from '@/lib/session';
import type { FeedResponse } from '@/lib/types';
import { formatSalary, relativeDays } from '@/lib/utils';

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
}

const DEFAULTS: Filters = { q: '', countries: [], includeRemote: true, workModes: [], visa: '', relocation: false, postedWithinDays: '', source: '', minScore: '0', sort: 'score', saved: false };
const STORE = 'job-copilot-filters';

export default function JobsPage() {
  const api = useApi();
  const { ready } = useToken();
  const qc = useQueryClient();
  const router = useRouter();
  const [f, setF] = useState<Filters>(DEFAULTS);
  const [page, setPage] = useState(1);
  const [showImport, setShowImport] = useState(false);
  const [imp, setImp] = useState({ url: '', title: '', company: '', description: '' });

  // Restore last filters (per-viewer convenience); otherwise start from the target countries in Settings.
  useEffect(() => {
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
  const flag = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { saved?: boolean; dismissed?: boolean } }) => api(`/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feed'] }),
  });

  const toggleMode = (m: string) => update({ workModes: f.workModes.includes(m) ? f.workModes.filter((x) => x !== m) : [...f.workModes, m] });
  const pages = feed.data ? Math.ceil(feed.data.total / feed.data.pageSize) : 0;

  return (
    <>
      <PageHeader
        title="Job matches"
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
        {feed.data?.items.map((m) => {
          const visa = visaLabel(m.job.visaStatus, m.job.visaConfidence);
          return (
            <Card key={m.id} className="transition-shadow hover:shadow-md">
              <CardContent className="flex gap-4 p-4">
                <ScoreRing score={m.score} size={56} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/jobs/view?id=${m.job.id}`} className="font-semibold hover:underline">
                        {m.job.title}
                      </Link>
                      <p className="truncate text-sm text-muted-foreground">
                        {m.job.companyName} · {m.job.location || 'Location not stated'} {m.job.postedAt && `· ${relativeDays(m.job.postedAt)}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon" variant="ghost" title={m.saved ? 'Unsave' : 'Save'} onClick={() => flag.mutate({ id: m.job.id, body: { saved: !m.saved } })}>
                        {m.saved ? <BookmarkCheck className="text-primary" /> : <Bookmark />}
                      </Button>
                      <Button size="icon" variant="ghost" title="Not interested" onClick={() => flag.mutate({ id: m.job.id, body: { dismissed: true } })}>
                        <X />
                      </Button>
                      {m.job.url.startsWith('http') && (
                        <Button size="icon" variant="ghost" asChild title="Open original posting">
                          <a href={m.job.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant="outline">{m.job.source}</Badge>
                    {m.job.workMode && (
                      <Badge variant="secondary">
                        {m.job.workMode === 'REMOTE' && m.job.remoteScope === 'GLOBAL' ? 'Remote · worldwide' : m.job.workMode.toLowerCase()}
                      </Badge>
                    )}
                    {m.job.countries?.slice(0, 3).map((c) => (
                      <Badge key={c} variant="outline">
                        {c}
                      </Badge>
                    ))}
                    {visa && <Badge variant={visa.variant}>{visa.text}</Badge>}
                    {m.job.relocation && <Badge variant="success">Relocation</Badge>}
                    {formatSalary(m.job.salaryMin, m.job.salaryMax, m.job.salaryCurrency) && (
                      <Badge variant="secondary">{formatSalary(m.job.salaryMin, m.job.salaryMax, m.job.salaryCurrency)}</Badge>
                    )}
                    {m.atsScore != null && <Badge variant="secondary">ATS {m.atsScore}%</Badge>}
                    {m.missingSkills.slice(0, 3).map((s) => (
                      <Badge key={s} variant="warning">
                        Missing: {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
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
