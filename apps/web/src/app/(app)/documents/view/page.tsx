'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { DocView } from '@/components/app/doc-views';
import { PageHeader } from '@/components/app/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/progress';
import { download, useApi, useToken } from '@/lib/api';
import { DEMO } from '@/lib/session';
import type { GeneratedDoc } from '@/lib/types';

export default function DocumentPage() {
  return (
    <Suspense>
      <DocumentDetail />
    </Suspense>
  );
}

function DocumentDetail() {
  const id = useSearchParams().get('id') ?? '';
  const api = useApi();
  const { ready } = useToken();
  const { data: doc } = useQuery({ queryKey: ['doc', id], queryFn: () => api<GeneratedDoc>(`/documents/${id}`), enabled: ready && !!id });

  if (!doc) return <Skeleton className="h-96" />;

  async function downloadDocx() {
    const { url } = await api<{ url: string }>(`/documents/${id}/docx`);
    const kind = doc!.type === 'TAILORED_RESUME' ? 'Resume' : 'Cover-Letter';
    download(url, `${doc!.job?.companyName ?? 'Job'}-${kind}-v${doc!.version}.${DEMO ? 'doc' : 'docx'}`);
  }

  return (
    <>
      <PageHeader
        title={doc.job ? `${doc.job.title} · ${doc.job.companyName}` : 'Document'}
        description={`Version ${doc.version}`}
        actions={
          doc.job && (
            <Button variant="outline" asChild>
              <Link href={`/jobs/view?id=${doc.job.id}`}>Open job</Link>
            </Button>
          )
        }
      />
      <DocView doc={doc} onDownload={doc.type === 'TAILORED_RESUME' || doc.type === 'COVER_LETTER' ? downloadDocx : undefined} />
    </>
  );
}
