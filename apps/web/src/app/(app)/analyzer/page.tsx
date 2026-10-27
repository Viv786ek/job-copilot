'use client';

import { useMutation } from '@tanstack/react-query';
import { FileSearch, Loader2, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { MatchBreakdown, PageHeader, ScoreRing } from '@/components/app/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { useApi } from '@/lib/api';
import type { JdAnalysis, MatchResult } from '@/lib/types';

export default function AnalyzerPage() {
  const api = useApi();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [description, setDescription] = useState('');

  const analyze = useMutation({
    mutationFn: () =>
      api<{ analysis: JdAnalysis; match: MatchResult }>('/jobs/analyze', {
        method: 'POST',
        body: JSON.stringify({ description, title: title || undefined, company: company || undefined }),
      }),
    onError: (e) => toast.error((e as Error).message),
  });

  const save = useMutation({
    mutationFn: () => api<{ jobId: string }>('/jobs/import', { method: 'POST', body: JSON.stringify({ description, title: title || undefined, company: company || undefined }) }),
    onSuccess: ({ jobId }) => router.push(`/jobs/view?id=${jobId}`),
    onError: (e) => toast.error((e as Error).message),
  });

  const r = analyze.data;

  return (
    <>
      <PageHeader title="JD Analyzer" description="Paste any job description to see required skills, ATS keywords, your match score and gaps." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input placeholder="Job title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
              <Input placeholder="Company (optional)" value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
            <Textarea rows={18} placeholder="Paste the full job description…" value={description} onChange={(e) => setDescription(e.target.value)} />
            <div className="flex gap-2">
              <Button onClick={() => analyze.mutate()} disabled={description.length < 100 || analyze.isPending}>
                {analyze.isPending ? <Loader2 className="animate-spin" /> : <FileSearch />} Analyze
              </Button>
              {r && (
                <Button variant="outline" onClick={() => save.mutate()} disabled={save.isPending}>
                  <Save /> Save job & generate documents
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {r && (
          <div className="space-y-4">
            <Card>
              <CardContent className="flex items-center justify-around p-6">
                <ScoreRing score={r.match.score} size={96} label="Match score" />
                <ScoreRing score={r.match.atsScore} size={96} label="ATS score" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <MatchBreakdown breakdown={r.match.breakdown} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Requirements</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>
                  <span className="font-medium">Seniority:</span> {r.analysis.seniority} · <span className="font-medium">Experience:</span>{' '}
                  {r.analysis.minYearsExperience ?? '?'}+ yrs
                </p>
                <Section title="Required skills" items={r.analysis.requiredSkills} have={r.match.matchedSkills} />
                <Section title="Preferred skills" items={r.analysis.preferredSkills} have={r.match.matchedSkills} />
                <Section title="ATS keywords" items={r.analysis.atsKeywords} have={r.match.matchedKeywords} />
                {r.match.recommendations.map((x, i) => (
                  <p key={i} className="text-muted-foreground">• {x}</p>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}

function Section({ title, items, have }: { title: string; items: string[]; have: string[] }) {
  const h = new Set(have.map((s) => s.toLowerCase()));
  return (
    <div>
      <p className="mb-1 font-medium">{title}</p>
      <div className="flex flex-wrap gap-1">
        {items.map((s) => (
          <Badge key={s} variant={h.has(s.toLowerCase()) ? 'success' : 'warning'}>
            {s}
          </Badge>
        ))}
      </div>
    </div>
  );
}
