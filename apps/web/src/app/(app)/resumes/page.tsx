'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, Loader2, RefreshCw, Trash2, UploadCloud, XCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, PageHeader, ScoreRing } from '@/components/app/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { download, useApi, useToken } from '@/lib/api';
import type { Resume } from '@/lib/types';
import { cn, formatDate } from '@/lib/utils';

export default function ResumesPage() {
  const api = useApi();
  const { ready } = useToken();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['resumes'],
    queryFn: () => api<Resume[]>('/resumes'),
    enabled: ready,
    // Poll while anything is still parsing.
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === 'PARSING' || r.status === 'UPLOADED') ? 2500 : false),
  });
  const activeId = selected ?? list.data?.find((r) => r.status === 'PARSED')?.id;
  const detail = useQuery({ queryKey: ['resume', activeId], queryFn: () => api<Resume>(`/resumes/${activeId}`), enabled: ready && !!activeId });

  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api<Resume>('/resumes', { method: 'POST', body: fd });
    },
    onSuccess: () => {
      toast.success('Uploaded. Parsing your resume…');
      qc.invalidateQueries({ queryKey: ['resumes'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const action = useMutation({
    mutationFn: ({ id, op }: { id: string; op: 'reparse' | 'activate' | 'delete' }) =>
      op === 'delete' ? api(`/resumes/${id}`, { method: 'DELETE' }) : api(`/resumes/${id}/${op}`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['resumes'] }),
    onError: (e) => toast.error((e as Error).message),
  });

  async function downloadResume(id: string, fileName: string) {
    const { url } = await api<{ url: string }>(`/resumes/${id}/download`);
    download(url, fileName);
  }

  function onFiles(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    if (!/\.(pdf|docx)$/i.test(f.name)) return toast.error('Upload a PDF or DOCX file');
    if (f.size > 5 * 1024 * 1024) return toast.error('Max file size is 5 MB');
    upload.mutate(f);
  }

  const parsed = detail.data?.parsed as
    | { fullName?: string; headline?: string; skills: string[]; experience: Array<{ company: string; title: string; startDate?: string; endDate?: string; current: boolean }>; education: Array<{ institution: string; degree?: string }>; projects: Array<{ name: string }>; certifications: Array<{ name: string }> }
    | undefined;

  return (
    <>
      <PageHeader title="Resumes" description="Upload a PDF or DOCX. We extract your skills, experience, education, projects and certifications." />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'mb-6 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 text-center transition-colors',
          dragging ? 'border-primary bg-accent' : 'hover:bg-secondary',
        )}
      >
        {upload.isPending ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : <UploadCloud className="h-8 w-8 text-primary" />}
        <p className="mt-3 font-medium">Drop your resume here or click to browse</p>
        <p className="text-sm text-muted-foreground">PDF or DOCX, up to 5 MB. Text-based files work best.</p>
        <input ref={inputRef} type="file" accept=".pdf,.docx" className="hidden" onChange={(e) => onFiles(e.target.files)} />
      </div>

      {list.data && list.data.length === 0 && (
        <EmptyState title="No resumes yet" description="Upload your current resume to build your candidate profile and start getting matched jobs." />
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-2">
          {list.data?.map((r) => (
            <Card key={r.id} className={cn('cursor-pointer', activeId === r.id && 'ring-2 ring-primary')} onClick={() => setSelected(r.id)}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.fileName}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</p>
                  <div className="mt-2">
                    {r.status === 'PARSED' && <Badge variant="success">Parsed</Badge>}
                    {(r.status === 'PARSING' || r.status === 'UPLOADED') && <Badge variant="secondary">Parsing…</Badge>}
                    {r.status === 'FAILED' && <Badge variant="destructive" title={r.errorMessage ?? ''}>Failed</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  {r.healthScore != null && <ScoreRing score={r.healthScore} size={44} />}
                  <Button size="icon" variant="ghost" title="Download" onClick={() => downloadResume(r.id, r.fileName)}>
                    <Download />
                  </Button>
                  <Button size="icon" variant="ghost" title="Make active & re-parse" onClick={() => action.mutate({ id: r.id, op: r.status === 'PARSED' ? 'activate' : 'reparse' })}>
                    <RefreshCw />
                  </Button>
                  <Button size="icon" variant="ghost" title="Delete" onClick={() => confirm('Delete this resume?') && action.mutate({ id: r.id, op: 'delete' })}>
                    <Trash2 />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {parsed && detail.data && (
          <div className="space-y-4 lg:col-span-3">
            <Card>
              <CardHeader>
                <CardTitle>{parsed.fullName ?? 'Your profile'}</CardTitle>
                <CardDescription>{parsed.headline}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="mb-2 text-sm font-semibold">Skills ({parsed.skills.length})</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {parsed.skills.map((s) => (
                      <Badge key={s} variant="secondary">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="mb-2 text-sm font-semibold">Experience</h4>
                  <ul className="space-y-1 text-sm">
                    {parsed.experience.map((e, i) => (
                      <li key={i}>
                        <span className="font-medium">{e.title}</span> · {e.company}{' '}
                        <span className="text-muted-foreground">
                          ({e.startDate ?? '?'} – {e.current ? 'Present' : e.endDate ?? '?'})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="grid gap-4 sm:grid-cols-3 text-sm">
                  <div>
                    <h4 className="mb-1 font-semibold">Education</h4>
                    {parsed.education.map((e, i) => (
                      <p key={i}>{[e.degree, e.institution].filter(Boolean).join(', ')}</p>
                    ))}
                  </div>
                  <div>
                    <h4 className="mb-1 font-semibold">Projects</h4>
                    {parsed.projects.map((p) => <p key={p.name}>{p.name}</p>)}
                  </div>
                  <div>
                    <h4 className="mb-1 font-semibold">Certifications</h4>
                    {parsed.certifications.map((c) => <p key={c.name}>{c.name}</p>)}
                  </div>
                </div>
              </CardContent>
            </Card>

            {detail.data.healthReport && (
              <Card>
                <CardHeader>
                  <CardTitle>Resume health · {detail.data.healthReport.score}/100</CardTitle>
                  <CardDescription>Fix the unchecked items to raise your baseline ATS score.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {detail.data.healthReport.checks.map((c) => (
                    <div key={c.id} className="flex items-start gap-2 text-sm">
                      {c.passed ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
                      <div>
                        <p className="font-medium">{c.label}</p>
                        {!c.passed && <p className="text-muted-foreground">{c.tip}</p>}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </>
  );
}
