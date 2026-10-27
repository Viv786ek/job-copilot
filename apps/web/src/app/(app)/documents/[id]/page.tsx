'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { DocView } from '@/components/app/doc-views';
import { PageHeader } from '@/components/app/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/progress';
import { useApi, useToken } from '@/lib/api';
import type { GeneratedDoc } from '@/lib/types';

export default function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const { ready } = useToken();
  const { data: doc } = useQuery({ queryKey: ['doc', id], queryFn: () => api<GeneratedDoc>(`/documents/${id}`), enabled: ready });

  if (!doc) return <Skeleton className="h-96" />;

  async function download() {
    const { url } = await api<{ url: string }>(`/documents/${id}/docx`);
    window.location.href = url;
  }

  return (
    <>
      <PageHeader
        title={doc.job ? `${doc.job.title} · ${doc.job.companyName}` : 'Document'}
        description={`Version ${doc.version}`}
        actions={
          doc.job && (
            <Button variant="outline" asChild>
              <Link href={`/jobs/${doc.job.id}`}>Open job</Link>
            </Button>
          )
        }
      />
      <DocView doc={doc} onDownload={doc.type === 'TAILORED_RESUME' || doc.type === 'COVER_LETTER' ? download : undefined} />
    </>
  );
}
