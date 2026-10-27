'use client';

import { AlertTriangle, Copy, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DEMO } from '@/lib/session';
import type { GeneratedDoc } from '@/lib/types';

function copy(text: string) {
  navigator.clipboard.writeText(text).then(() => toast.success('Copied'));
}

function CopyBlock({ title, text }: { title: string; text: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button size="sm" variant="ghost" onClick={() => copy(text)}>
          <Copy /> Copy
        </Button>
      </CardHeader>
      <CardContent>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
      </CardContent>
    </Card>
  );
}

export function DocView({ doc, onDownload }: { doc: GeneratedDoc; onDownload?: () => void }) {
  const c = doc.content;
  switch (doc.type) {
    case 'TAILORED_RESUME':
      return (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {doc.atsScoreBefore != null && (
              <Badge variant="success">
                ATS keyword coverage {doc.atsScoreBefore}% → {doc.atsScoreAfter}%
              </Badge>
            )}
            <Badge variant="outline">v{doc.version}</Badge>
            {onDownload && (
              <Button size="sm" onClick={onDownload}>
                <Download /> Download {DEMO ? 'Word' : 'DOCX'}
              </Button>
            )}
          </div>
          {doc.guardrailFlags.length > 0 && (
            <Card className="border-warning/50">
              <CardContent className="space-y-1 p-4 text-sm">
                <p className="flex items-center gap-2 font-medium text-warning">
                  <AlertTriangle className="h-4 w-4" /> Honesty guardrails removed {doc.guardrailFlags.length} item(s)
                </p>
                {doc.guardrailFlags.map((f: string, i: number) => (
                  <p key={i} className="text-muted-foreground">• {f}</p>
                ))}
              </CardContent>
            </Card>
          )}
          {c.missingSkills?.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Gaps not added to your resume (learn or mention only if true): <span className="font-medium text-foreground">{c.missingSkills.join(', ')}</span>
            </p>
          )}
          <Card>
            <CardContent className="space-y-4 p-6 text-sm">
              <div>
                <p className="text-base font-semibold">{c.headline}</p>
                <p className="mt-1">{c.summary}</p>
              </div>
              <div>
                <h4 className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">Skills</h4>
                <p>{c.skills.join(' • ')}</p>
              </div>
              <div className="space-y-3">
                <h4 className="font-semibold uppercase tracking-wide text-muted-foreground">Experience</h4>
                {c.experience.map((e: any, i: number) => (
                  <div key={i}>
                    <p className="font-medium">
                      {e.title}, {e.company} <span className="font-normal text-muted-foreground">({e.startDate} – {e.current ? 'Present' : e.endDate})</span>
                    </p>
                    <ul className="ml-5 mt-1 list-disc space-y-0.5">
                      {e.bullets.map((b: string, j: number) => (
                        <li key={j}>{b}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          {c.changeLog?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">What changed and why</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                {c.changeLog.map((l: string, i: number) => (
                  <p key={i}>• {l}</p>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      );
    case 'COVER_LETTER':
      return (
        <div className="space-y-3">
          {onDownload && (
            <Button size="sm" onClick={onDownload}>
              <Download /> Download {DEMO ? 'Word' : 'DOCX'}
            </Button>
          )}
          <CopyBlock title={c.subject} text={c.body} />
        </div>
      );
    case 'RECRUITER_EMAIL':
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <CopyBlock title="LinkedIn connection note" text={c.linkedinConnectionNote} />
          <CopyBlock title="LinkedIn message" text={c.linkedinMessage} />
          <CopyBlock title={`Email · ${c.recruiterEmail.subject}`} text={c.recruiterEmail.body} />
          {c.followUpEmails.map((f: any, i: number) => (
            <CopyBlock key={i} title={`Follow-up (day ${f.sendAfterDays}) · ${f.subject}`} text={f.body} />
          ))}
        </div>
      );
    case 'INTERVIEW_PREP':
      return (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Technical</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {c.technical.map((q: any, i: number) => (
                <details key={i} className="rounded-md border p-3">
                  <summary className="cursor-pointer font-medium">{q.question}</summary>
                  <p className="mt-2 text-muted-foreground">{q.whyAsked}</p>
                  <ul className="ml-5 mt-1 list-disc">
                    {q.answerHints.map((h: string, j: number) => (
                      <li key={j}>{h}</li>
                    ))}
                  </ul>
                </details>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Behavioral (STAR from your resume)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {c.behavioral.map((q: any, i: number) => (
                <details key={i} className="rounded-md border p-3">
                  <summary className="cursor-pointer font-medium">{q.question}</summary>
                  <p className="mt-2 text-muted-foreground">{q.starStoryFromResume}</p>
                </details>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">System design</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {c.systemDesign.map((q: any, i: number) => (
                <details key={i} className="rounded-md border p-3">
                  <summary className="cursor-pointer font-medium">{q.question}</summary>
                  <ul className="ml-5 mt-2 list-disc">
                    {q.keyPoints.map((h: string, j: number) => (
                      <li key={j}>{h}</li>
                    ))}
                  </ul>
                </details>
              ))}
            </CardContent>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <CopyBlock title="Company-specific prep" text={c.companySpecific.map((s: string) => `• ${s}`).join('\n')} />
            <CopyBlock title="Questions to ask them" text={c.questionsToAsk.map((s: string) => `• ${s}`).join('\n')} />
          </div>
        </div>
      );
    default:
      return <pre className="overflow-auto rounded-md bg-muted p-4 text-xs">{JSON.stringify(c, null, 2)}</pre>;
  }
}
