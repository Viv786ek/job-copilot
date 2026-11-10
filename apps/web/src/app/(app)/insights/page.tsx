'use client';

import { useQuery } from '@tanstack/react-query';
import { Briefcase, Globe2, Plane, Sparkles, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CountryPicker } from '@/components/app/country-picker';
import { EmptyState, PageHeader, StatCard } from '@/components/app/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress, Skeleton } from '@/components/ui/progress';
import { useApi, useToken } from '@/lib/api';

interface Insights {
  scope: { jobsConsidered: number; matching: number; strong: number; newThisWeek: number };
  skillDemand: Array<{ skill: string; jobs: number; share: number; youHaveIt: boolean }>;
  topGaps: Array<{ skill: string; jobs: number }>;
  countries: Array<{ code: string; name: string; jobs: number; visaFriendly: number }>;
  workModes: Record<string, number>;
  visaFriendlyEmployers: Array<{ company: string; roles: number }>;
  hiringNow: Array<{ company: string; roles: number }>;
  salaries: Array<{ currency: string; samples: number; p25: number; median: number; p75: number }>;
  countriesFilter: string[];
  datasetGeneratedAt?: string;
}

const money = (n: number, c: string) => new Intl.NumberFormat('en', { style: 'currency', currency: c, maximumFractionDigits: 0, notation: n >= 100_000 ? 'compact' : 'standard' }).format(n);

export default function InsightsPage() {
  const api = useApi();
  const { ready } = useToken();
  const [countries, setCountries] = useState<string[] | null>(null);
  const prefs = useQuery({ queryKey: ['profile'], queryFn: () => api<{ preferences: { countries?: string[] } | null }>('/profile'), enabled: ready });
  useEffect(() => {
    if (countries === null && prefs.data) setCountries(prefs.data.preferences?.countries ?? []);
  }, [prefs.data, countries]);

  const q = countries === null ? null : new URLSearchParams({ countries: countries.join(',') }).toString();
  const data = useQuery({ queryKey: ['insights', q], queryFn: () => api<Insights>(`/insights?${q}`), enabled: ready && q !== null, retry: false });

  if (data.error)
    return (
      <>
        <PageHeader title="Career insights" />
        <EmptyState
          title="Add your profile first"
          description={(data.error as Error).message}
          action={
            <Button asChild>
              <Link href="/discover">Start AI Job Discovery</Link>
            </Button>
          }
        />
      </>
    );

  const d = data.data;
  const totalModes = d ? Object.values(d.workModes).reduce((a, b) => a + b, 0) || 1 : 1;

  return (
    <>
      <PageHeader
        title="Career insights"
        description="What employers hiring for your profile ask for, where they hire, who sponsors visas, and what they pay when they say."
        actions={
          <div className="w-72">
            <CountryPicker value={countries ?? []} onChange={setCountries} placeholder="All countries" />
          </div>
        }
      />
      {!d ? (
        <div className="grid gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Jobs considered" value={d.scope.jobsConsidered.toLocaleString()} hint={d.countriesFilter.length ? `In ${d.countriesFilter.join(', ')} or remote to them` : 'All countries'} icon={<Globe2 className="h-4 w-4" />} />
            <StatCard label="Good matches (60+)" value={d.scope.matching.toLocaleString()} icon={<Briefcase className="h-4 w-4" />} />
            <StatCard label="Strong matches (75+)" value={d.scope.strong.toLocaleString()} icon={<TrendingUp className="h-4 w-4" />} />
            <StatCard label="Relevant & posted this week" value={d.scope.newThisWeek.toLocaleString()} icon={<Sparkles className="h-4 w-4" />} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Most-requested skills in your matches</CardTitle>
                <CardDescription>Share of relevant jobs asking for each skill.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {d.skillDemand.map((s) => (
                  <div key={s.skill}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="flex items-center gap-2">
                        {s.skill}
                        {s.youHaveIt ? <Badge variant="success">you have it</Badge> : <Badge variant="warning">gap</Badge>}
                      </span>
                      <span className="text-muted-foreground">{s.share}%</span>
                    </div>
                    <Progress value={s.share} indicatorClassName={s.youHaveIt ? 'bg-success' : 'bg-warning'} />
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Biggest skill gaps</CardTitle>
                  <CardDescription>Learning these would open the most roles. Add them to your profile only once you genuinely have them.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {d.topGaps.length ? d.topGaps.map((g) => <Badge key={g.skill} variant="warning">{g.skill} · {g.jobs} jobs</Badge>) : <p className="text-sm text-muted-foreground">No recurring gaps. Nice.</p>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Pay where postings publish it</CardTitle>
                  <CardDescription>Middle of the advertised range for relevant roles (25th / median / 75th percentile).</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {d.salaries.length ? (
                    d.salaries.map((s) => (
                      <div key={s.currency} className="flex items-center justify-between rounded-md border px-3 py-2">
                        <span className="font-medium">{s.currency}</span>
                        <span>
                          {money(s.p25, s.currency)} · <b>{money(s.median, s.currency)}</b> · {money(s.p75, s.currency)}
                        </span>
                        <span className="text-xs text-muted-foreground">{s.samples} jobs</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground">Not enough relevant postings publish salaries yet (needs 5+ per currency).</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Where your matches are</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {d.countries.map((c) => (
                  <div key={c.code} className="flex justify-between">
                    <span>{c.name}</span>
                    <span className="text-muted-foreground">
                      {c.jobs} {c.visaFriendly > 0 && <span className="text-success">· {c.visaFriendly} visa-friendly</span>}
                    </span>
                  </div>
                ))}
                <div className="pt-2 text-xs text-muted-foreground">
                  Work mode: {Object.entries(d.workModes).map(([k, v]) => `${k.toLowerCase()} ${Math.round((v / totalModes) * 100)}%`).join(' · ')}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Plane className="h-4 w-4" /> Employers sponsoring visas
                </CardTitle>
                <CardDescription>Relevant roles stating or likely offering sponsorship.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {d.visaFriendlyEmployers.length ? d.visaFriendlyEmployers.map((e) => (
                  <Link key={e.company} href={`/jobs?q=${encodeURIComponent(e.company)}`} className="flex justify-between hover:underline">
                    <span>{e.company}</span>
                    <span className="text-muted-foreground">{e.roles}</span>
                  </Link>
                )) : <p className="text-muted-foreground">None in this selection.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4" /> Hiring now
                </CardTitle>
                <CardDescription>Most relevant roles posted in the last 14 days.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {d.hiringNow.length ? d.hiringNow.map((e) => (
                  <div key={e.company} className="flex justify-between">
                    <span>{e.company}</span>
                    <span className="text-muted-foreground">{e.roles}</span>
                  </div>
                )) : <p className="text-muted-foreground">No relevant postings in the last two weeks.</p>}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
