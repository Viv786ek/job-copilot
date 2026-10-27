'use client';

import { APPLICATION_STATUSES, type ApplicationStatus } from '@copilot/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, ExternalLink, LayoutGrid, Plus, Table2, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, PageHeader } from '@/components/app/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label, NativeSelect, Textarea } from '@/components/ui/input';
import { useApi, useToken } from '@/lib/api';
import type { Application } from '@/lib/types';
import { formatDate } from '@/lib/utils';

const BOARD: ApplicationStatus[] = ['DRAFT', 'APPLIED', 'SCREENING', 'INTERVIEWING', 'OFFER', 'REJECTED'];
const TONE: Record<string, 'secondary' | 'default' | 'success' | 'warning' | 'destructive' | 'outline'> = {
  DRAFT: 'outline', APPLIED: 'default', SCREENING: 'secondary', INTERVIEWING: 'warning', OFFER: 'success', ACCEPTED: 'success',
  REJECTED: 'destructive', WITHDRAWN: 'outline', GHOSTED: 'outline',
};

export default function ApplicationsPage() {
  return (
    <Suspense>
      <Tracker />
    </Suspense>
  );
}

function Tracker() {
  const api = useApi();
  const { ready } = useToken();
  const qc = useQueryClient();
  const params = useSearchParams();
  const [view, setView] = useState<'board' | 'table'>('board');
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Application | null>(null);

  const qs = new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}) });
  const { data } = useQuery({ queryKey: ['applications', qs.toString()], queryFn: () => api<Application[]>(`/applications?${qs}`), enabled: ready });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['applications'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => api('/applications', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => (invalidate(), setShowForm(false), toast.success('Application added')),
    onError: (e) => toast.error((e as Error).message),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api(`/applications/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => (invalidate(), setEditing(null)),
    onError: (e) => toast.error((e as Error).message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/applications/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
  const addInterview = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api(`/applications/${id}/interviews`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => (invalidate(), toast.success('Interview scheduled')),
    onError: (e) => toast.error((e as Error).message),
  });

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const body = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ''));
    if (editing) update.mutate({ id: editing.id, body });
    else create.mutate(body);
  }

  return (
    <>
      <PageHeader
        title="Application tracker"
        description="Every application, interview and follow-up in one place."
        actions={
          <>
            <Button variant="outline" size="icon" onClick={() => setView(view === 'board' ? 'table' : 'board')} title="Toggle view">
              {view === 'board' ? <Table2 /> : <LayoutGrid />}
            </Button>
            <Button onClick={() => (setEditing(null), setShowForm(!showForm))}>
              <Plus /> Add application
            </Button>
          </>
        }
      />

      {(showForm || editing) && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">{editing ? `Edit · ${editing.company}` : 'New application'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form key={editing?.id ?? 'new'} onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
              <Field label="Company" name="company" required defaultValue={editing?.company} />
              <Field label="Role" name="role" required defaultValue={editing?.role} />
              <div className="space-y-1">
                <Label>Source</Label>
                <NativeSelect name="source" defaultValue={editing?.source ?? 'LINKEDIN'}>
                  {['LINKEDIN', 'NAUKRI', 'INDEED', 'WELLFOUND', 'INSTAHYRE', 'HIRIST', 'FOUNDIT', 'CAREER_PAGE', 'REFERRAL', 'MANUAL'].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <NativeSelect name="status" defaultValue={editing?.status ?? 'APPLIED'}>
                  {APPLICATION_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </NativeSelect>
              </div>
              <Field label="Applied date" name="appliedAt" type="date" defaultValue={editing?.appliedAt?.slice(0, 10)} />
              <Field label="Follow-up date" name="followUpAt" type="date" defaultValue={editing?.followUpAt?.slice(0, 10)} />
              <Field label="Recruiter name" name="recruiterName" defaultValue={editing?.recruiterName ?? ''} />
              <Field label="Recruiter email" name="recruiterEmail" type="email" defaultValue={editing?.recruiterEmail ?? ''} />
              <Field label="Job URL" name="jobUrl" type="url" defaultValue={editing?.jobUrl ?? ''} />
              <div className="space-y-1 sm:col-span-3">
                <Label>Notes</Label>
                <Textarea name="notes" rows={3} defaultValue={editing?.notes ?? ''} />
              </div>
              <div className="flex gap-2 sm:col-span-3">
                <Button type="submit" disabled={create.isPending || update.isPending}>
                  Save
                </Button>
                <Button type="button" variant="ghost" onClick={() => (setShowForm(false), setEditing(null))}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Input placeholder="Search company or role" value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-xs" />
        <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} className="sm:max-w-[200px]">
          <option value="">All statuses</option>
          {APPLICATION_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </NativeSelect>
      </div>

      {data && data.length === 0 && <EmptyState title="Nothing tracked yet" description="Add applications manually, or click “Track application” on any job match." />}

      {data && data.length > 0 && view === 'board' && (
        <div className="grid gap-4 overflow-x-auto pb-4 md:grid-cols-3 xl:grid-cols-6">
          {BOARD.map((col) => (
            <div key={col} className="min-w-[220px] rounded-lg bg-secondary/50 p-3">
              <p className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {col} <span>{data.filter((a) => a.status === col).length}</span>
              </p>
              <div className="space-y-2">
                {data
                  .filter((a) => a.status === col)
                  .map((a) => (
                    <Card key={a.id} className="cursor-pointer" onClick={() => (setShowForm(false), setEditing(a))}>
                      <CardContent className="space-y-2 p-3">
                        <p className="text-sm font-semibold leading-tight">{a.role}</p>
                        <p className="text-xs text-muted-foreground">{a.company}</p>
                        <div className="flex flex-wrap gap-1">
                          {a.matchScore != null && <Badge variant="secondary">{a.matchScore}%</Badge>}
                          {a.followUpAt && new Date(a.followUpAt) <= new Date() && <Badge variant="warning">Follow up</Badge>}
                          {a.interviews.length > 0 && <Badge variant="outline">{a.interviews.length} interview(s)</Badge>}
                        </div>
                        <NativeSelect
                          className="h-8 text-xs"
                          value={a.status}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => update.mutate({ id: a.id, body: { status: e.target.value } })}
                        >
                          {APPLICATION_STATUSES.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </NativeSelect>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {data && data.length > 0 && view === 'table' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  {['Company', 'Role', 'Source', 'Applied', 'Status', 'Follow-up', 'Recruiter', ''].map((h) => (
                    <th key={h} className="px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((a) => (
                  <tr key={a.id} className="border-b last:border-0 hover:bg-secondary/30">
                    <td className="px-4 py-3 font-medium">{a.company}</td>
                    <td className="px-4 py-3">{a.role}</td>
                    <td className="px-4 py-3">{a.source}</td>
                    <td className="px-4 py-3">{formatDate(a.appliedAt)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={TONE[a.status]}>{a.status}</Badge>
                    </td>
                    <td className="px-4 py-3">{formatDate(a.followUpAt)}</td>
                    <td className="px-4 py-3">{a.recruiterName ?? '—'}</td>
                    <td className="flex gap-1 px-4 py-3">
                      {a.jobUrl && (
                        <Button size="icon" variant="ghost" asChild>
                          <a href={a.jobUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink />
                          </a>
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Schedule interview"
                        onClick={() => {
                          const when = prompt('Interview date & time (YYYY-MM-DD HH:MM)');
                          const round = when && prompt('Round name (e.g. Technical 1)');
                          if (when && round) addInterview.mutate({ id: a.id, body: { round, scheduledAt: new Date(when.replace(' ', 'T')).toISOString() } });
                        }}
                      >
                        <CalendarPlus />
                      </Button>
                      <Button size="icon" variant="ghost" title="Delete" onClick={() => confirm('Delete this application?') && remove.mutate(a.id)}>
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1">
      <Label htmlFor={props.name}>{label}</Label>
      <Input id={props.name} {...props} />
    </div>
  );
}
