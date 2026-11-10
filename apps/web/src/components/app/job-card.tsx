'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bookmark, BookmarkCheck, CheckCircle2, Copy, ExternalLink, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { visaLabel } from '@/components/app/country-picker';
import { ScoreRing } from '@/components/app/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useApi } from '@/lib/api';
import type { JobMatchRow } from '@/lib/types';
import { formatSalary, relativeDays } from '@/lib/utils';

const DAY = 86_400_000;

/** Freshness from the source's posting date, or from when our index first saw the job. */
export function freshness(job: { postedAt: string | null; firstSeenAt?: string | null }): { label: string; fresh: boolean } | null {
  const posted = job.postedAt ? Date.parse(job.postedAt) : null;
  const seen = job.firstSeenAt ? Date.parse(job.firstSeenAt) : null;
  const t = posted ?? seen;
  if (!t) return null;
  const days = Math.floor((Date.now() - t) / DAY);
  const label = posted ? `Posted ${relativeDays(job.postedAt)}` : `Found ${relativeDays(job.firstSeenAt)}`;
  return { label, fresh: days <= 3 };
}

const salaryText = (j: JobMatchRow['job']) => formatSalary(j.salaryMin, j.salaryMax, j.salaryCurrency);

export function JobCard({ m, compact = false }: { m: JobMatchRow; compact?: boolean }) {
  const api = useApi();
  const qc = useQueryClient();
  const flag = useMutation({
    mutationFn: (body: { saved?: boolean; dismissed?: boolean }) => api(`/jobs/${m.job.id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => ['feed', 'saved', 'discover-results', 'dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  });
  const visa = visaLabel(m.job.visaStatus, m.job.visaConfidence);
  const fresh = freshness(m.job);

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="flex gap-4 p-4">
        <ScoreRing score={m.score} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link href={`/jobs/view?id=${m.job.id}`} className="font-semibold hover:underline">
                {m.job.title}
              </Link>
              <p className="truncate text-sm text-muted-foreground">
                {m.job.companyName} · {m.job.location || 'Location not stated'}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button size="icon" variant="ghost" title={m.saved ? 'Remove from saved' : 'Save job'} aria-label={m.saved ? 'Remove from saved' : 'Save job'} onClick={() => flag.mutate({ saved: !m.saved })}>
                {m.saved ? <BookmarkCheck className="text-primary" /> : <Bookmark />}
              </Button>
              {!compact && (
                <Button size="icon" variant="ghost" title="Not interested" aria-label="Not interested" onClick={() => flag.mutate({ dismissed: true })}>
                  <X />
                </Button>
              )}
              {m.job.url.startsWith('http') && (
                <Button size="icon" variant="ghost" asChild title="Open the original posting">
                  <a href={m.job.url} target="_blank" rel="noopener noreferrer" aria-label="Open the original posting">
                    <ExternalLink />
                  </a>
                </Button>
              )}
            </div>
          </div>

          {m.reasons && m.reasons.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-sm">
              {m.reasons.map((r) => (
                <li key={r} className="flex items-start gap-1.5">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2 flex flex-wrap gap-1.5">
            {fresh && (
              <Badge variant={fresh.fresh ? 'success' : 'outline'}>
                {fresh.fresh && <Sparkles className="mr-1 h-3 w-3" />}
                {fresh.label}
              </Badge>
            )}
            {m.job.workMode && (
              <Badge variant="secondary">{m.job.workMode === 'REMOTE' && m.job.remoteScope === 'GLOBAL' ? 'Remote · worldwide' : m.job.workMode.toLowerCase()}</Badge>
            )}
            {m.job.countries?.slice(0, 3).map((c) => (
              <Badge key={c} variant="outline">
                {c}
              </Badge>
            ))}
            {visa && <Badge variant={visa.variant}>{visa.text}</Badge>}
            {m.job.relocation && <Badge variant="success">Relocation</Badge>}
            {salaryText(m.job) && <Badge variant="secondary">{salaryText(m.job)}</Badge>}
            {!compact && m.atsScore != null && <Badge variant="secondary">ATS {m.atsScore}%</Badge>}
            {!!m.job.alsoOnCount && (
              <Badge variant="outline" title="The same role was found on other sites and merged into one listing">
                <Copy className="mr-1 h-3 w-3" /> Also on {m.job.alsoOnCount} other site{m.job.alsoOnCount > 1 ? 's' : ''}
              </Badge>
            )}
            <Badge variant="outline">{m.job.source}</Badge>
            {!compact &&
              m.missingSkills.slice(0, 3).map((s) => (
                <Badge key={s} variant="warning">
                  Missing: {s}
                </Badge>
              ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
