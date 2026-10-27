'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { EmptyState, PageHeader } from '@/components/app/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/input';
import { useApi, useToken } from '@/lib/api';
import type { GeneratedDoc } from '@/lib/types';
import { formatDate } from '@/lib/utils';

const LABELS: Record<string, string> = {
  TAILORED_RESUME: 'Tailored resume',
  COVER_LETTER: 'Cover letter',
  RECRUITER_EMAIL: 'Recruiter outreach',
  INTERVIEW_PREP: 'Interview prep',
};

export default function DocumentsPage() {
  const api = useApi();
  const { ready } = useToken();
  const [type, setType] = useState('');
  const { data } = useQuery({
    queryKey: ['documents', type],
    queryFn: () => api<GeneratedDoc[]>(`/documents${type ? `?type=${type}` : ''}`),
    enabled: ready,
  });

  return (
    <>
      <PageHeader
        title="Generated documents"
        description="Every tailored resume, cover letter, outreach message and prep guide, versioned per job."
        actions={
          <NativeSelect value={type} onChange={(e) => setType(e.target.value)} className="w-48">
            <option value="">All types</option>
            {Object.entries(LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
        }
      />
      {data && data.length === 0 && <EmptyState title="No documents yet" description="Open any job match and generate a tailored resume or cover letter." />}
      <div className="grid gap-3 md:grid-cols-2">
        {data?.map((d) => (
          <Link key={d.id} href={`/documents/${d.id}`}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{d.job?.title ?? 'Untitled job'}</p>
                  <p className="text-sm text-muted-foreground">
                    {d.job?.companyName} · {formatDate(d.createdAt)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant="secondary">{LABELS[d.type] ?? d.type}</Badge>
                  {d.atsScoreAfter != null && <Badge variant="success">ATS {d.atsScoreBefore}→{d.atsScoreAfter}%</Badge>}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
