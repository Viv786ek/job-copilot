'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, BookmarkCheck, ExternalLink, Link2, Loader2, RefreshCw, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, PageHeader, ScoreRing } from '@/components/app/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/progress';
import { useApi, useToken } from '@/lib/api';
import type { FeedResponse } from '@/lib/types';
import { formatSalary, relativeDays } from '@/lib/utils';

const SOURCES = ['', 'LINKEDIN', 'NAUKRI', 'INDEED', 'WELLFOUND', 'INSTAHYRE', 'HIRIST', 'FOUNDIT', 'GREENHOUSE', 'LEVER', 'ASHBY', 'REMOTIVE', 'REMOTEOK', 'ADZUNA', 'MANUAL'];

export default function JobsPage() {
  const api = useApi();
  const { ready } = useToken();
  const qc = useQueryClient();
  const router = useRouter();
  const [filters, setFilters] = useState({ q: '', minScore: '50', remote: false, saved: false, source: '' });
  const [page, setPage] = useState(1);
  const [showImport, setShowImport] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importText, setImportText] = useState('');

  const params = new URLSearchParams({
    page: String(page),
    minScore: filters.minScore,
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.remote ? { remote: 'true' } : {}),
    ...(filters.saved ? { saved: 'true' } : {}),
    ...(filters.source ? { source: filters.source } : {}),
  });
  const feed = useQuery({ queryKey: ['feed', params.toString()], queryFn: () => api<FeedResponse>(`/jobs/feed?${params}`), enabled: ready });

  const search = useMutation({
    mutationFn: () => api('/jobs/search/run', { method: 'POST' }),
    onSuccess: () => toast.success('Searching job sources. New matches will appear here within a few minutes.'),
    onError: (e) => toast.error((e as Error).message),
  });

  const importJob = useMutation({
    mutationFn: () =>
      api<{ jobId: string }>('/jobs/import', {
        method: 'POST',
        body: JSON.stringify(importText.trim() ? { url: importUrl || undefined, description: importText } : { url: importUrl }),
      }),
    onSuccess: ({ jobId }) => {
      toast.success('Job imported and analyzed');
      router.push(`/jobs/view?id=${jobId}`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const flag = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { saved?: boolean; dismissed?: boolean } }) => api(`/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feed'] }),
  });

  return (
    <>
      <PageHeader
        title="Job matches"
        description="Ranked by how well each role fits your real experience."
        actions={
          <>
            <Button variant="outline" onClick={() => setShowImport(!showImport)}>
              <Link2 /> Import a job
            </Button>
            <Button onClick={() => search.mutate()} disabled={search.isPending}>
              {search.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Find new jobs
            </Button>
          </>
        }
      />

      {showImport && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Import from LinkedIn, Naukri, Indeed, Wellfound, Instahyre, Hirist, Foundit or any careers page</CardTitle>
            <CardDescription>Paste the job URL. If the page needs a login, paste the job description text as well.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="https://www.linkedin.com/jobs/view/…" value={importUrl} onChange={(e) => setImportUrl(e.target.value)} />
            <Textarea rows={6} placeholder="Optional: paste the full job description" value={importText} onChange={(e) => setImportText(e.target.value)} />
            <Button onClick={() => importJob.mutate()} disabled={importJob.isPending || (!importUrl && importText.length < 100)}>
              {importJob.isPending && <Loader2 className="animate-spin" />} Import & analyze
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="mb-4 grid gap-2 sm:grid-cols-5">
        <Input className="sm:col-span-2" placeholder="Search title or company" value={filters.q} onChange={(e) => (setPage(1), setFilters({ ...filters, q: e.target.value }))} />
        <NativeSelect value={filters.minScore} onChange={(e) => (setPage(1), setFilters({ ...filters, minScore: e.target.value }))}>
          {['0', '50', '60', '70', '80'].map((v) => (
            <option key={v} value={v}>
              Score ≥ {v}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={filters.source} onChange={(e) => (setPage(1), setFilters({ ...filters, source: e.target.value }))}>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {s || 'All sources'}
            </option>
          ))}
        </NativeSelect>
        <div className="flex gap-2">
          <Button variant={filters.remote ? 'default' : 'outline'} className="flex-1" onClick={() => setFilters({ ...filters, remote: !filters.remote })}>
            Remote
          </Button>
          <Button variant={filters.saved ? 'default' : 'outline'} className="flex-1" onClick={() => setFilters({ ...filters, saved: !filters.saved })}>
            Saved
          </Button>
        </div>
      </div>

      {feed.isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      )}

      {feed.data && feed.data.items.length === 0 && (
        <EmptyState
          title="No matches yet"
          description="Upload a resume, set your target roles in Settings, then run a search. You can also import any job by URL."
          action={<Button onClick={() => search.mutate()}>Find new jobs</Button>}
        />
      )}

      <div className="space-y-3">
        {feed.data?.items.map((m) => (
          <Card key={m.id} className="transition-shadow hover:shadow-md">
            <CardContent className="flex gap-4 p-4">
              <ScoreRing score={m.score} size={56} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/jobs/view?id=${m.job.id}`} className="font-semibold hover:underline">
                      {m.job.title}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {m.job.companyName} · {m.job.location ?? 'Location n/a'} {m.job.postedAt && `· ${relativeDays(m.job.postedAt)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="icon" variant="ghost" title={m.saved ? 'Unsave' : 'Save'} onClick={() => flag.mutate({ id: m.job.id, body: { saved: !m.saved } })}>
                      {m.saved ? <BookmarkCheck className="text-primary" /> : <Bookmark />}
                    </Button>
                    <Button size="icon" variant="ghost" title="Not interested" onClick={() => flag.mutate({ id: m.job.id, body: { dismissed: true } })}>
                      <X />
                    </Button>
                    <Button size="icon" variant="ghost" asChild title="Open original posting">
                      <a href={m.job.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink />
                      </a>
                    </Button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge variant="outline">{m.job.source}</Badge>
                  {m.job.workMode && <Badge variant="secondary">{m.job.workMode}</Badge>}
                  {m.job.visaSponsorship && <Badge variant="success">Visa sponsorship</Badge>}
                  {formatSalary(m.job.salaryMin, m.job.salaryMax, m.job.salaryCurrency) && (
                    <Badge variant="secondary">{formatSalary(m.job.salaryMin, m.job.salaryMax, m.job.salaryCurrency)}</Badge>
                  )}
                  <Badge variant="secondary">ATS {m.atsScore}%</Badge>
                  {m.missingSkills.slice(0, 3).map((s) => (
                    <Badge key={s} variant="warning">
                      Missing: {s}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {feed.data && feed.data.total > feed.data.pageSize && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {Math.ceil(feed.data.total / feed.data.pageSize)}
          </span>
          <Button variant="outline" disabled={page * feed.data.pageSize >= feed.data.total} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </>
  );
}
