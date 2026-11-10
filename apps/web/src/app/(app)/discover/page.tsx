'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardPaste, FileText, Linkedin, Loader2, Plus, Radar, RotateCcw, UploadCloud, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CountryPicker } from '@/components/app/country-picker';
import { JobCard } from '@/components/app/job-card';
import { PageHeader } from '@/components/app/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label, NativeSelect, Textarea } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApi, useToken } from '@/lib/api';
import type { FeedResponse, Resume } from '@/lib/types';
import { cn } from '@/lib/utils';

type Step = 'source' | 'profile' | 'questions' | 'results';
const STEPS: Array<[Step, string]> = [
  ['source', 'Your profile'],
  ['profile', 'Review'],
  ['questions', 'Five quick ones'],
  ['results', 'Discover'],
];

interface Prefs {
  titles: string[];
  countries: string[];
  authorizedCountries: string[];
  workModes: string[];
  openToRelocation: boolean;
  experienceLevel: string;
  salaryFloor: number | null;
  salaryCurrency: string;
  linkedinUrl: string | null;
  discoveryCompletedAt: string | null;
}
interface ProfileResponse {
  profile: { headline: string | null; location: string | null; summary: string | null; skills: string[]; totalYearsExp: number } | null;
  preferences: Partial<Prefs> | null;
}
interface ParsedView {
  fullName?: string | null;
  headline?: string | null;
  location?: string | null;
  experience: Array<{ title: string; company: string; startDate?: string | null; current: boolean }>;
}
interface SourcesResponse {
  generatedAt?: string;
  totalJobs?: number;
  companies?: number;
  sources?: Array<{ source: string; ok: boolean; jobs: number; skipped?: string }>;
  feeds?: Array<{ source: string; enabled: boolean }>;
}

const LINKEDIN_URL = /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[\w\-%]+\/?/i;

export default function DiscoverPage() {
  const api = useApi();
  const { ready } = useToken();
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>('source');

  const profile = useQuery({ queryKey: ['profile'], queryFn: () => api<ProfileResponse>('/profile'), enabled: ready });
  const resumes = useQuery({ queryKey: ['resumes'], queryFn: () => api<Resume[]>('/resumes'), enabled: ready });
  const activeId = resumes.data?.find((r) => (r as Resume & { active?: boolean }).active)?.id ?? resumes.data?.[0]?.id;
  const active = useQuery({ queryKey: ['resume', activeId], queryFn: () => api<Resume>(`/resumes/${activeId}`), enabled: ready && !!activeId });

  // Returning users who finished discovery land on their results.
  const [initialised, setInitialised] = useState(false);
  useEffect(() => {
    if (initialised || !profile.data) return;
    setInitialised(true);
    if (profile.data.profile && profile.data.preferences?.discoveryCompletedAt) setStep('results');
  }, [profile.data, initialised]);

  const refresh = () => ['profile', 'resumes', 'resume', 'feed', 'dashboard', 'insights', 'discover-results'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const idx = STEPS.findIndex(([s]) => s === step);
  const hasProfile = !!profile.data?.profile;

  return (
    <>
      <PageHeader
        title="AI Job Discovery"
        description="Give us your profile once. We read it, ask five quick questions, and match you against every job in our live index, with the reasons for each match."
      />

      <ol className="mb-6 grid grid-cols-4 gap-2 text-xs sm:text-sm">
        {STEPS.map(([s, label], i) => (
          <li key={s}>
            <button
              type="button"
              disabled={i > 0 && !hasProfile}
              onClick={() => setStep(s)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md border px-2 py-2 text-left transition-colors disabled:opacity-50',
                i === idx ? 'border-primary bg-accent text-accent-foreground' : i < idx ? 'bg-card' : 'bg-card text-muted-foreground',
              )}
            >
              <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold', i <= idx ? 'bg-primary text-primary-foreground' : 'bg-secondary')}>
                {i < idx ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="truncate">{label}</span>
            </button>
          </li>
        ))}
      </ol>

      {step === 'source' && (
        <SourceStep
          existing={hasProfile ? (active.data?.parsed as ParsedView | undefined)?.fullName ?? 'your current profile' : null}
          linkedinUrl={profile.data?.preferences?.linkedinUrl ?? ''}
          onDone={() => {
            refresh();
            setStep('profile');
          }}
          onUseExisting={() => setStep('profile')}
        />
      )}
      {step === 'profile' && profile.data?.profile && (
        <ProfileStep parsed={active.data?.parsed as ParsedView | undefined} profile={profile.data.profile} onBack={() => setStep('source')} onNext={() => (refresh(), setStep('questions'))} />
      )}
      {step === 'questions' && profile.data && (
        <QuestionsStep
          initial={profile.data.preferences ?? {}}
          suggestions={[...new Set([...(profile.data.preferences?.titles ?? []), ...((active.data?.parsed as ParsedView | undefined)?.experience ?? []).map((e) => e.title)])].filter((t) => t && t !== 'Role').slice(0, 5)}
          onBack={() => setStep('profile')}
          onNext={() => (refresh(), setStep('results'))}
        />
      )}
      {step === 'results' && profile.data && <ResultsStep prefs={profile.data.preferences ?? {}} onRestart={() => setStep('source')} onEdit={() => setStep('questions')} />}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Step 1: profile input                                               */
/* ------------------------------------------------------------------ */

function SourceStep({ existing, linkedinUrl, onDone, onUseExisting }: { existing: string | null; linkedinUrl: string; onDone: () => void; onUseExisting: () => void }) {
  const api = useApi();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [url, setUrl] = useState(linkedinUrl);
  const [tab, setTab] = useState('upload');

  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api('/resumes', { method: 'POST', body: fd });
    },
    onSuccess: () => (toast.success('Profile read'), onDone()),
    onError: (e) => toast.error((e as Error).message),
  });
  const paste = useMutation({
    mutationFn: () =>
      api('/resumes/text', { method: 'POST', body: JSON.stringify({ text, source: tab === 'linkedin' ? 'linkedin' : 'paste', linkedinUrl: LINKEDIN_URL.test(url) ? url : undefined }) }),
    onSuccess: () => (toast.success('Profile read'), onDone()),
    onError: (e) => toast.error((e as Error).message),
  });
  const saveUrl = useMutation({
    mutationFn: () => api('/profile/preferences', { method: 'PATCH', body: JSON.stringify({ linkedinUrl: url.trim() }) }),
  });

  const onFile = (f?: File | null) => {
    if (!f) return;
    if (!/\.(pdf|docx|txt)$/i.test(f.name)) return toast.error('Upload a PDF, DOCX or TXT file');
    upload.mutate(f);
  };
  const busy = upload.isPending || paste.isPending;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Tell us about you</CardTitle>
          <CardDescription>Your profile is read in your browser. Nothing is uploaded to a server.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-auto flex-wrap">
              <TabsTrigger value="upload">
                <UploadCloud className="mr-1.5 h-4 w-4" /> Resume or LinkedIn PDF
              </TabsTrigger>
              <TabsTrigger value="linkedin">
                <Linkedin className="mr-1.5 h-4 w-4" /> LinkedIn URL
              </TabsTrigger>
              <TabsTrigger value="paste">
                <ClipboardPaste className="mr-1.5 h-4 w-4" /> Paste text
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload">
              <button
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  onFile(e.dataTransfer.files?.[0]);
                }}
                className="flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 text-center hover:bg-secondary"
              >
                {upload.isPending ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : <FileText className="h-8 w-8 text-primary" />}
                <p className="mt-3 font-medium">Drop your resume or LinkedIn profile PDF</p>
                <p className="text-sm text-muted-foreground">PDF, DOCX or TXT · up to 5 MB</p>
              </button>
              <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </TabsContent>

            <TabsContent value="linkedin" className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="li">Your LinkedIn profile URL</Label>
                <div className="flex gap-2">
                  <Input id="li" placeholder="https://www.linkedin.com/in/your-name" value={url} onChange={(e) => setUrl(e.target.value)} />
                  <Button
                    variant="outline"
                    disabled={!LINKEDIN_URL.test(url)}
                    onClick={() => {
                      saveUrl.mutate();
                      window.open(url.replace(/\/?$/, '/'), '_blank', 'noopener');
                    }}
                  >
                    Open profile
                  </Button>
                </div>
                {url && !LINKEDIN_URL.test(url) && <p className="text-xs text-destructive">That doesn’t look like a linkedin.com/in/… profile link.</p>}
              </div>
              <div className="rounded-md border bg-secondary/40 p-4 text-sm">
                <p className="font-medium">LinkedIn doesn’t let other apps read a profile from its URL.</p>
                <p className="mt-1 text-muted-foreground">We won’t scrape it. Two ways that take under a minute:</p>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  <li>
                    On your profile, click <b>More → Save to PDF</b>, then drop that PDF in the <b>Resume or LinkedIn PDF</b> tab.
                  </li>
                  <li>Or copy your headline, About and Experience sections and paste them below.</li>
                </ol>
              </div>
              <Textarea rows={8} placeholder="Paste your LinkedIn headline, About and Experience…" value={text} onChange={(e) => setText(e.target.value)} />
              <Button onClick={() => paste.mutate()} disabled={busy || text.trim().length < 150}>
                {paste.isPending && <Loader2 className="animate-spin" />} Read my profile
              </Button>
            </TabsContent>

            <TabsContent value="paste" className="space-y-3">
              <Textarea rows={12} placeholder="Paste your resume or profile text (experience, skills, education)…" value={text} onChange={(e) => setText(e.target.value)} />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{text.trim().length < 150 ? `${150 - text.trim().length} more characters needed` : 'Ready'}</span>
                <Button onClick={() => paste.mutate()} disabled={busy || text.trim().length < 150}>
                  {paste.isPending && <Loader2 className="animate-spin" />} Read my profile
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {existing && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Already set up</CardTitle>
              <CardDescription>Continue with {existing}.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={onUseExisting}>
                Use my current profile <ArrowRight />
              </Button>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What happens next</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>1. We extract your roles, years of experience and skills.</p>
            <p>2. You confirm them and answer five quick questions.</p>
            <p>3. Every job in our index (company career pages and job feeds, refreshed every 6 hours) is scored against you, with visa and location checked.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 2: review the extracted profile                                */
/* ------------------------------------------------------------------ */

function ProfileStep({
  parsed,
  profile,
  onBack,
  onNext,
}: {
  parsed?: ParsedView;
  profile: NonNullable<ProfileResponse['profile']>;
  onBack: () => void;
  onNext: () => void;
}) {
  const api = useApi();
  const [skills, setSkills] = useState(profile.skills);
  const [add, setAdd] = useState('');
  const [headline, setHeadline] = useState(profile.headline ?? '');
  const save = useMutation({
    mutationFn: () => api('/profile', { method: 'PATCH', body: JSON.stringify({ skills, headline }) }),
    onSuccess: onNext,
    onError: (e) => toast.error((e as Error).message),
  });
  const companies = [...new Set((parsed?.experience ?? []).map((e) => e.company).filter((c) => c && c !== 'Company'))].slice(0, 4);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{parsed?.fullName ? `Here’s what we read, ${parsed.fullName.split(' ')[0]}` : 'Here’s what we read'}</CardTitle>
        <CardDescription>Fix anything that’s off. Only list skills you genuinely have: tailored resumes never go beyond this list.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1">
          <Label htmlFor="headline">Headline</Label>
          <Input id="headline" value={headline} onChange={(e) => setHeadline(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant="secondary">{profile.totalYearsExp} yrs experience</Badge>
          {profile.location && <Badge variant="outline">{profile.location}</Badge>}
          {companies.map((c) => (
            <Badge key={c} variant="outline">
              {c}
            </Badge>
          ))}
        </div>
        {!!parsed?.experience.length && (
          <div className="text-sm">
            <p className="mb-1 font-medium">Roles</p>
            <ul className="space-y-0.5 text-muted-foreground">
              {parsed.experience.slice(0, 5).map((e, i) => (
                <li key={i}>
                  {e.title} · {e.company} {e.startDate ? `(${e.startDate} – ${e.current ? 'present' : '…'})` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <p className="mb-2 text-sm font-medium">Skills ({skills.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {skills.map((s) => (
              <span key={s} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs">
                {s}
                <button type="button" aria-label={`Remove ${s}`} onClick={() => setSkills(skills.filter((x) => x !== s))}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <form
            className="mt-2 flex max-w-sm gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = add.trim();
              if (v && !skills.some((s) => s.toLowerCase() === v.toLowerCase())) setSkills([...skills, v]);
              setAdd('');
            }}
          >
            <Input placeholder="Add a skill you have" value={add} onChange={(e) => setAdd(e.target.value)} />
            <Button type="submit" variant="outline" size="icon" aria-label="Add skill">
              <Plus />
            </Button>
          </form>
        </div>
        <div className="flex justify-between">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft /> Back
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !skills.length}>
            {save.isPending && <Loader2 className="animate-spin" />} Looks right <ArrowRight />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Step 3: five quick questions                                        */
/* ------------------------------------------------------------------ */

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" size="sm" variant={active ? 'default' : 'outline'} onClick={onClick}>
      {children}
    </Button>
  );
}

function QuestionsStep({ initial, suggestions, onBack, onNext }: { initial: Partial<Prefs>; suggestions: string[]; onBack: () => void; onNext: () => void }) {
  const api = useApi();
  const [p, setP] = useState({
    titles: initial.titles ?? [],
    countries: initial.countries ?? [],
    authorizedCountries: initial.authorizedCountries ?? [],
    workModes: initial.workModes ?? [],
    openToRelocation: initial.openToRelocation ?? false,
    experienceLevel: initial.experienceLevel ?? '',
    salaryFloor: initial.salaryFloor ?? null,
    salaryCurrency: initial.salaryCurrency ?? 'USD',
  });
  const [role, setRole] = useState('');
  const set = (patch: Partial<typeof p>) => setP({ ...p, ...patch });
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const save = useMutation({
    mutationFn: () =>
      api('/profile/preferences', {
        method: 'PATCH',
        body: JSON.stringify({
          ...p,
          needsVisaSponsorship: p.countries.some((c) => !p.authorizedCountries.includes(c)),
          remoteOnly: p.workModes.length === 1 && p.workModes[0] === 'REMOTE',
          discoveryCompletedAt: new Date().toISOString(),
        }),
      }),
    onSuccess: () => {
      // Recommended Jobs opens with the same filters.
      try {
        window.localStorage.setItem(
          'job-copilot-filters',
          JSON.stringify({ countries: p.countries, includeRemote: true, workModes: p.workModes, level: p.experienceLevel, sort: 'score', minScore: '0', visa: p.countries.some((c) => !p.authorizedCountries.includes(c)) ? 'exclude-no' : '' }),
        );
      } catch {
        /* storage blocked */
      }
      onNext();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Five quick ones</CardTitle>
        <CardDescription>Your answers filter and score every job. Change them any time in Settings.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-2">
          <h3 className="font-medium">1. Where do you want to work?</h3>
          <CountryPicker value={p.countries} onChange={(countries) => set({ countries })} placeholder="Anywhere (leave empty)" />
          <p className="text-xs text-muted-foreground">Remote roles open to these countries are included automatically.</p>
        </section>
        <section className="space-y-2">
          <h3 className="font-medium">2. Where can you already work without a visa?</h3>
          <CountryPicker value={p.authorizedCountries} onChange={(authorizedCountries) => set({ authorizedCountries })} placeholder="Citizenship, PR or a current work visa" showCounts={false} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={p.openToRelocation} onChange={(e) => set({ openToRelocation: e.target.checked })} />
            I’m open to relocating
          </label>
        </section>
        <section className="space-y-2">
          <h3 className="font-medium">3. How do you want to work?</h3>
          <div className="flex flex-wrap gap-2">
            {['REMOTE', 'HYBRID', 'ONSITE'].map((m) => (
              <Choice key={m} active={p.workModes.includes(m)} onClick={() => set({ workModes: toggle(p.workModes, m) })}>
                {m === 'ONSITE' ? 'On-site' : m.charAt(0) + m.slice(1).toLowerCase()}
              </Choice>
            ))}
            <Choice active={!p.workModes.length} onClick={() => set({ workModes: [] })}>
              Don’t mind
            </Choice>
          </div>
        </section>
        <section className="space-y-2">
          <h3 className="font-medium">4. What’s next for you?</h3>
          <div className="flex flex-wrap gap-2">
            {[...new Set([...suggestions, ...p.titles])].map((t) => (
              <Choice key={t} active={p.titles.includes(t)} onClick={() => set({ titles: toggle(p.titles, t).slice(0, 5) })}>
                {t}
              </Choice>
            ))}
          </div>
          <form
            className="flex max-w-sm gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (role.trim()) set({ titles: [...new Set([...p.titles, role.trim()])].slice(0, 5) });
              setRole('');
            }}
          >
            <Input placeholder="Another role, e.g. Staff AI Engineer" value={role} onChange={(e) => setRole(e.target.value)} />
            <Button type="submit" variant="outline" size="icon" aria-label="Add role">
              <Plus />
            </Button>
          </form>
          <div className="flex flex-wrap gap-2 pt-1">
            {[
              ['', 'Any level'],
              ['entry', 'Entry'],
              ['mid', 'Mid'],
              ['senior', 'Senior'],
              ['leadership', 'Lead / manager'],
            ].map(([v, label]) => (
              <Choice key={v} active={p.experienceLevel === v} onClick={() => set({ experienceLevel: v })}>
                {label}
              </Choice>
            ))}
          </div>
        </section>
        <section className="space-y-2">
          <h3 className="font-medium">5. Salary floor (optional)</h3>
          <div className="flex max-w-sm gap-2">
            <NativeSelect className="w-28" value={p.salaryCurrency} onChange={(e) => set({ salaryCurrency: e.target.value })}>
              {['USD', 'EUR', 'GBP', 'INR', 'AED', 'CHF', 'CAD', 'AUD', 'SGD'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </NativeSelect>
            <Input type="number" min={0} step={5000} placeholder="e.g. 80000" value={p.salaryFloor ?? ''} onChange={(e) => set({ salaryFloor: e.target.value ? Number(e.target.value) : null })} />
          </div>
          <p className="text-xs text-muted-foreground">Only some postings publish pay; we use this in Career Insights and as an optional filter, not to hide jobs.</p>
        </section>
        <div className="flex justify-between">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft /> Back
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />} Find my jobs <Radar />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Step 4: discover                                                    */
/* ------------------------------------------------------------------ */

function ResultsStep({ prefs, onRestart, onEdit }: { prefs: Partial<Prefs>; onRestart: () => void; onEdit: () => void }) {
  const api = useApi();
  const { ready } = useToken();
  const needsVisa = (prefs.countries ?? []).some((c) => !(prefs.authorizedCountries ?? []).includes(c));
  const params = useMemo(
    () =>
      new URLSearchParams({
        sort: 'score',
        pageSize: '10',
        includeRemote: 'true',
        ...(prefs.countries?.length ? { countries: prefs.countries.join(',') } : {}),
        ...(prefs.workModes?.length ? { workModes: prefs.workModes.join(',') } : {}),
        ...(prefs.experienceLevel ? { level: prefs.experienceLevel } : {}),
        ...(needsVisa ? { visa: 'exclude-no' } : {}),
      }),
    [prefs, needsVisa],
  );
  const sources = useQuery({ queryKey: ['sources'], queryFn: () => api<SourcesResponse>('/jobs/sources'), enabled: ready, staleTime: 3_600_000 });
  const results = useQuery({ queryKey: ['discover-results', params.toString()], queryFn: () => api<FeedResponse>(`/jobs/feed?${params}`), enabled: ready });
  const strong = useQuery({
    queryKey: ['discover-results', 'strong', params.toString()],
    queryFn: () => api<FeedResponse>(`/jobs/feed?${params}&minScore=75&pageSize=1`),
    enabled: ready,
  });

  // Reveal sources one by one while results compute; the counts are the real index counts.
  const list = (sources.data?.sources ?? []).filter((s) => s.ok && s.jobs > 0).sort((a, b) => b.jobs - a.jobs);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!list.length) return;
    setShown(0);
    const t = setInterval(() => setShown((n) => (n >= list.length ? (clearInterval(t), n) : n + 1)), 120);
    return () => clearInterval(t);
  }, [list.length]);
  const scanning = shown < list.length || results.isLoading;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>{scanning ? 'Searching…' : `Searched ${list.length} sources and ${(sources.data?.companies ?? 0).toLocaleString()} companies`}</CardTitle>
            <CardDescription>
              {(sources.data?.totalJobs ?? 0).toLocaleString()} open jobs in the index
              {sources.data?.generatedAt ? `, refreshed ${new Date(sources.data.generatedAt).toLocaleString()}` : ''}.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onEdit}>
              Edit answers
            </Button>
            <Button variant="ghost" size="sm" onClick={onRestart}>
              <RotateCcw /> New profile
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {list.slice(0, Math.max(shown, scanning ? 0 : list.length)).map((s) => (
            <Badge key={s.source} variant="secondary" className="gap-1">
              <CheckCircle2 className="h-3 w-3 text-success" /> {s.source.toLowerCase()} · {s.jobs.toLocaleString()}
            </Badge>
          ))}
          {scanning && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        </CardContent>
      </Card>

      {!scanning && results.data && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Jobs that fit your answers</p>
                <p className="mt-1 text-3xl font-bold">{results.data.total.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Strong matches (75+)</p>
                <p className="mt-1 text-3xl font-bold">{(strong.data?.total ?? 0).toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Looking for</p>
                <p className="mt-1 truncate font-medium">{prefs.titles?.join(', ') || 'Roles like your recent ones'}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {prefs.countries?.length ? prefs.countries.join(', ') : 'Anywhere'} · {prefs.workModes?.length ? prefs.workModes.join(', ').toLowerCase() : 'any work mode'}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Your top matches</h2>
            <Button asChild variant="outline">
              <Link href="/jobs">
                See all in Recommended Jobs <ArrowRight />
              </Link>
            </Button>
          </div>
          {results.data.items.length ? (
            <div className="space-y-3">
              {results.data.items.map((m) => (
                <JobCard key={m.id} m={m} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No jobs fit all your answers yet. Try adding countries, allowing more work modes, or another role.</p>
          )}
        </>
      )}
    </div>
  );
}
