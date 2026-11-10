'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { JobCard } from '@/components/app/job-card';
import { EmptyState, PageHeader } from '@/components/app/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/progress';
import { useApi, useToken } from '@/lib/api';
import type { FeedResponse } from '@/lib/types';

export default function SavedJobsPage() {
  const api = useApi();
  const { ready } = useToken();
  const saved = useQuery({ queryKey: ['saved'], queryFn: () => api<FeedResponse>('/jobs/feed?saved=true&sort=score&pageSize=50&includeRemote=true'), enabled: ready });

  return (
    <>
      <PageHeader title="Saved jobs" description="Roles you bookmarked. Open one to tailor your resume, prepare, and apply." />
      {saved.isLoading && <Skeleton className="h-40" />}
      {saved.data && saved.data.items.length === 0 && (
        <EmptyState
          title="Nothing saved yet"
          description="Tap the bookmark on any job in AI Job Discovery or Recommended Jobs to keep it here."
          action={
            <Button asChild>
              <Link href="/discover">Discover jobs</Link>
            </Button>
          }
        />
      )}
      <div className="space-y-3">
        {saved.data?.items.map((m) => (
          <JobCard key={m.id} m={m} />
        ))}
      </div>
    </>
  );
}
