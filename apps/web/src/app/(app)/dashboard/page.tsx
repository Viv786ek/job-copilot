'use client';

import { useQuery } from '@tanstack/react-query';
import { Briefcase, CalendarClock, Gauge, MailWarning, Send, TrendingUp, XCircle } from 'lucide-react';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageHeader, ScoreRing, StatCard } from '@/components/app/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/progress';
import { useApi, useToken } from '@/lib/api';
import type { DashboardStats } from '@/lib/types';

const PIPELINE_ORDER = ['DRAFT', 'APPLIED', 'SCREENING', 'INTERVIEWING', 'OFFER', 'REJECTED', 'GHOSTED'];

export default function DashboardPage() {
  const api = useApi();
  const { ready } = useToken();
  const { data: s, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => api<DashboardStats>('/dashboard'), enabled: ready });

  if (isLoading || !s) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your search at a glance."
        actions={
          <Button asChild>
            <Link href="/jobs">See today&apos;s matches</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="sm:col-span-2 lg:col-span-1">
          <CardContent className="flex items-center justify-around p-5">
            <ScoreRing score={s.resumeHealth} size={84} label="Resume health" />
            <ScoreRing score={s.avgMatchScore} size={84} label="Avg job match" />
          </CardContent>
        </Card>
        <StatCard
          label="ATS improvement"
          value={s.atsImprovement.documents ? `+${s.atsImprovement.delta}` : '—'}
          hint={s.atsImprovement.documents ? `${s.atsImprovement.avgBefore}% → ${s.atsImprovement.avgAfter}% keyword coverage across ${s.atsImprovement.documents} resumes` : 'Tailor a resume to see your ATS lift'}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard label="Strong matches (75+)" value={s.topMatches} icon={<Gauge className="h-4 w-4" />} />
        <StatCard label="Response rate" value={`${s.responseRate}%`} hint={`${s.applied} applications sent`} icon={<Send className="h-4 w-4" />} />
        <StatCard label="Applied" value={s.applied} icon={<Briefcase className="h-4 w-4" />} />
        <StatCard label="Interviews" value={s.interviews} hint={`${s.upcomingInterviews} upcoming`} icon={<CalendarClock className="h-4 w-4" />} />
        <StatCard label="Rejections" value={s.rejections} hint={`${s.offers} offers`} icon={<XCircle className="h-4 w-4" />} />
        <StatCard label="Follow-ups due" value={s.followUpsDue} icon={<MailWarning className="h-4 w-4" />} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Applications vs responses</CardTitle>
            <CardDescription>Last 12 weeks</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {s.weekly.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={s.weekly}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                  <XAxis dataKey="week" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={28} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="applied" name="Applied" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="responses" name="Responses" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="pt-16 text-center text-sm text-muted-foreground">Mark applications as Applied to start tracking.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Skill gaps in your matches</CardTitle>
            <CardDescription>Most-requested skills you don&apos;t list yet</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {s.topMissingSkills.length ? (
              s.topMissingSkills.map((m) => (
                <Badge key={m.skill} variant="warning">
                  {m.skill} · {m.count}
                </Badge>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No recurring gaps yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Pipeline</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {PIPELINE_ORDER.map((k) => (
            <Link key={k} href={`/applications?status=${k}`} className="rounded-md border p-3 text-center hover:bg-secondary">
              <div className="text-2xl font-bold">{s.pipeline[k] ?? 0}</div>
              <div className="text-xs capitalize text-muted-foreground">{k.toLowerCase()}</div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
