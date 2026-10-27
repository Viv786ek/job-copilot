'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, KanbanSquare, Loader2, Sparkles } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { toast } from 'sonner';
import { DocView } from '@/components/app/doc-views';
import { MatchBreakdown, PageHeader, ScoreRing } from '@/components/app/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { download, useApi, useToken } from '@/lib/api';
import type { GeneratedDoc, JdAnalysis } from '@/lib/types';
import { DEMO } from '@/lib/session';
import { formatSalary } from '@/lib/utils';

interface JobDetail {
  job: {
    id: string; title: string; companyName: string; location: string | null; workMode: string | null; source: string; url: string;
    description: string; analysis: JdAnalysis | null; salaryMin: number | null; salaryMax: number | null; salaryCurrency: string | null;
    visaSponsorship: boolean | null;
  };
  match: { score: number; atsScore: number; breakdown: Record<string, number>; matchedSkills: string[]; missingSkills: string[]; missingKeywords: string[]; recommendations: string[] } | null;
  documents: Array<{ id: string; type: GeneratedDoc['type']; version: number }>;
}

const GENERATORS = [
  { tab: 'resume', type: 'TAILORED_RESUME', label: 'Tailored resume', endpoint: '/documents/tailored-resume' },
  { tab: 'cover', type: 'COVER_LETTER', label: 'Cover letter', endpoint: '/documents/cover-letter' },
  { tab: 'outreach', type: 'RECRUITER_EMAIL', label: 'Recruiter outreach', endpoint: '/documents/outreach' },
  { tab: 'interview', type: 'INTERVIEW_PREP', label: 'Interview prep', endpoint: '/documents/interview-prep' },
] as const;

export default function JobDetailPage() {
  return (
    <Suspense>
      <JobDetail />
    </Suspense>
  );
}

function JobDetail() {
  const id = useSearchParams().get('id') ?? '';
  const api = useApi();
  const { ready } = useToken();
  const qc = useQueryClient();
  const router = useRouter();
  const [tab, setTab] = useState('match');

  const { data, isLoading } = useQuery({ queryKey: ['job', id], queryFn: () => api<JobDetail>(`/jobs/${id}`), enabled: ready });

  const latest = (type: string) => data?.documents.find((d) => d.type === type);

  const generate = useMutation({
    mutationFn: (endpoint: string) => api<GeneratedDoc>(endpoint, { method: 'POST', body: JSON.stringify({ jobId: id }) }),
    onSuccess: () => {
      toast.success('Generated');
      qc.invalidateQueries({ queryKey: ['job', id] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const track = useMutation({
    mutationFn: () =>
      api<{ id: string }>('/applications', {
        method: 'POST',
        body: JSON.stringify({ jobId: id, company: data!.job.companyName, role: data!.job.title, source: data!.job.source, jobUrl: data!.job.url.startsWith('http') ? data!.job.url : undefined }),
      }),
    onSuccess: () => {
      toast.success('Added to your tracker');
      router.push('/applications');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading || !data) return <Skeleton className="h-96" />;
  const { job, match } = data;
  const a = job.analysis;

  return (
    <>
      <PageHeader
        title={job.title}
        description={`${job.companyName} · ${job.location ?? job.workMode ?? ''}`}
        actions={
          <>
            {job.url.startsWith('http') && (
              <Button variant="outline" asChild>
                <a href={job.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink /> Original posting
                </a>
              </Button>
            )}
            <Button onClick={() => track.mutate()} disabled={track.isPending}>
              <KanbanSquare /> Track application
            </Button>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <Badge variant="outline">{job.source}</Badge>
        {job.workMode && <Badge variant="secondary">{job.workMode}</Badge>}
        {a?.seniority && a.seniority !== 'UNKNOWN' && <Badge variant="secondary">{a.seniority}</Badge>}
        {job.visaSponsorship === true && <Badge variant="success">Visa sponsorship</Badge>}
        {formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency) && <Badge variant="secondary">{formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency)}</Badge>}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="match">Match & gaps</TabsTrigger>
          <TabsTrigger value="jd">JD analysis</TabsTrigger>
          {GENERATORS.map((g) => (
            <TabsTrigger key={g.tab} value={g.tab}>
              {g.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="match">
          {match ? (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardContent className="flex justify-around p-6">
                  <ScoreRing score={match.score} size={96} label="Match score" />
                  <ScoreRing score={match.atsScore} size={96} label="ATS score" />
                </CardContent>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">Why this score</CardTitle>
                </CardHeader>
                <CardContent>
                  <MatchBreakdown breakdown={match.breakdown} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Skills you match</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-1.5">
                  {match.matchedSkills.map((s) => (
                    <Badge key={s} variant="success">{s}</Badge>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Missing skills</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-1.5">
                  {match.missingSkills.length ? match.missingSkills.map((s) => <Badge key={s} variant="warning">{s}</Badge>) : <p className="text-sm text-muted-foreground">None 🎯</p>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recommendations</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {match.recommendations.map((r, i) => (
                    <p key={i}>• {r}</p>
                  ))}
                  {match.missingKeywords.length > 0 && (
                    <p className="text-muted-foreground">ATS keywords not in your resume: {match.missingKeywords.slice(0, 12).join(', ')}</p>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Match not computed yet. Upload a resume first.</p>
          )}
        </TabsContent>

        <TabsContent value="jd">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-base">Extracted requirements</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {a ? (
                  <>
                    <p>
                      <span className="font-medium">Experience:</span> {a.minYearsExperience ?? '?'}
                      {a.maxYearsExperience ? `–${a.maxYearsExperience}` : '+'} years
                    </p>
                    <div>
                      <p className="mb-1 font-medium">Required</p>
                      <div className="flex flex-wrap gap-1">{a.requiredSkills.map((s) => <Badge key={s}>{s}</Badge>)}</div>
                    </div>
                    <div>
                      <p className="mb-1 font-medium">Preferred</p>
                      <div className="flex flex-wrap gap-1">{a.preferredSkills.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}</div>
                    </div>
                    <div>
                      <p className="mb-1 font-medium">ATS keywords</p>
                      <div className="flex flex-wrap gap-1">{a.atsKeywords.map((s) => <Badge key={s} variant="outline">{s}</Badge>)}</div>
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground">Analysis pending…</p>
                )}
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Full description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="max-h-[600px] overflow-auto whitespace-pre-wrap text-sm leading-relaxed">{job.description}</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {GENERATORS.map((g) => (
          <TabsContent key={g.tab} value={g.tab}>
            <GeneratedPanel
              docId={latest(g.type)?.id}
              label={g.label}
              busy={generate.isPending && generate.variables === g.endpoint}
              onGenerate={() => generate.mutate(g.endpoint)}
            />
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}

function GeneratedPanel({ docId, label, busy, onGenerate }: { docId?: string; label: string; busy: boolean; onGenerate: () => void }) {
  const api = useApi();
  const { ready } = useToken();
  const { data: doc } = useQuery({ queryKey: ['doc', docId], queryFn: () => api<GeneratedDoc>(`/documents/${docId}`), enabled: ready && !!docId });

  async function downloadDocx() {
    const { url } = await api<{ url: string }>(`/documents/${docId}/docx`);
    download(url, `${doc?.job?.companyName ?? 'Job'}-${label.replace(/\s+/g, '-')}.${DEMO ? 'doc' : 'docx'}`);
  }

  return (
    <div className="space-y-4">
      <Button onClick={onGenerate} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} {docId ? `Regenerate ${label.toLowerCase()}` : `Generate ${label.toLowerCase()}`}
      </Button>
      {busy && <p className="text-sm text-muted-foreground">{DEMO ? 'Generating…' : 'Writing from your real experience… this takes 10–30 seconds.'}</p>}
      {DEMO && !doc && <p className="text-sm text-muted-foreground">Demo mode uses a template generator in your browser. The deployed product uses OpenAI, Claude or Gemini.</p>}
      {doc && <DocView doc={doc} onDownload={doc.type === 'TAILORED_RESUME' || doc.type === 'COVER_LETTER' ? downloadDocx : undefined} />}
    </div>
  );
}
