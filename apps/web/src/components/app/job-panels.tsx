'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, CheckCircle2, Copy, ExternalLink, FileCheck2, Globe2, Loader2, ShieldAlert, ShieldCheck, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { visaLabel } from '@/components/app/country-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useApi, useToken } from '@/lib/api';

export interface JobInsights {
  openRoles: number;
  postedLast30Days: number;
  sponsoringRoles: number;
  hiringCountries: Array<{ code: string; name: string }>;
  sponsorRegister: string | null;
  ats: string | null;
  postingAgeDays: number | null;
  tips: string[];
}

interface VisaJob {
  visaStatus?: string;
  visaConfidence?: number;
  visaTypes?: string[];
  visaEvidence?: string[];
  sponsorRegister?: string | null;
  relocation?: boolean;
  requiresAuthorizationIn?: string[];
}

export function VisaPanel({ job }: { job: VisaJob }) {
  const label = visaLabel(job.visaStatus, job.visaConfidence);
  const Icon = job.visaStatus === 'NO_SPONSORSHIP' ? ShieldAlert : ShieldCheck;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4" /> Visa sponsorship
        </CardTitle>
        <CardDescription>Detected from the posting text and official sponsor registers (UK Home Office, Netherlands IND).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          {label ? <Badge variant={label.variant}>{label.text}</Badge> : <Badge variant="secondary">Not stated in the posting</Badge>}
          {job.relocation && <Badge variant="success">Relocation support</Badge>}
          {job.visaTypes?.map((t) => (
            <Badge key={t} variant="outline">
              {t}
            </Badge>
          ))}
        </div>
        {job.sponsorRegister && (
          <p className="flex items-center gap-2 text-success">
            <CheckCircle2 className="h-4 w-4" /> Employer is on the {job.sponsorRegister}.
          </p>
        )}
        {!!job.requiresAuthorizationIn?.length && (
          <p className="text-warning">Requires existing work authorization in: {job.requiresAuthorizationIn.join(', ')}</p>
        )}
        {job.visaEvidence?.length ? (
          <div>
            <p className="mb-1 font-medium">Evidence from the posting</p>
            <ul className="space-y-1 text-muted-foreground">
              {job.visaEvidence.map((e, i) => (
                <li key={i} className="border-l-2 pl-2">
                  “{e}”
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-muted-foreground">The posting doesn’t mention sponsorship or relocation. Ask the recruiter before investing time.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function CompanyInsights({ company, insights }: { company: string; insights: JobInsights }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4" /> Recruiter insights: {company}
        </CardTitle>
        <CardDescription>From all open roles in the job index.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md border p-2">
            <div className="text-xl font-bold">{insights.openRoles}</div>
            <div className="text-xs text-muted-foreground">open roles</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="text-xl font-bold">{insights.postedLast30Days}</div>
            <div className="text-xs text-muted-foreground">posted in 30 days</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="text-xl font-bold">{insights.sponsoringRoles}</div>
            <div className="text-xs text-muted-foreground">visa-friendly roles</div>
          </div>
        </div>
        {insights.hiringCountries.length > 0 && (
          <p className="flex flex-wrap items-center gap-1.5">
            <Globe2 className="h-4 w-4 text-muted-foreground" />
            {insights.hiringCountries.map((c) => (
              <Badge key={c.code} variant="outline">
                {c.name}
              </Badge>
            ))}
          </p>
        )}
        <p className="text-muted-foreground">
          {insights.postingAgeDays != null ? `Posted ${insights.postingAgeDays} day(s) ago` : 'Posting date not published'}
          {insights.ats ? ` · applications via ${insights.ats}` : ''}
        </p>
        {insights.tips.map((t, i) => (
          <p key={i}>• {t}</p>
        ))}
      </CardContent>
    </Card>
  );
}

interface ApplyKitData {
  job: { id: string; title: string; company: string; applyUrl: string; ats: string | null };
  fields: Record<string, string | number | boolean | null>;
  answers: { whyThisCompany: string; sponsorshipStatement: string | null };
  documents: { tailoredResumeId: string | null; coverLetterId: string | null; coverLetterText: string | null };
}

const FIELD_LABELS: Record<string, string> = {
  firstName: 'First name', lastName: 'Last name', email: 'Email', phone: 'Phone', location: 'Location', linkedin: 'LinkedIn', github: 'GitHub',
  website: 'Website / portfolio', currentTitle: 'Current title', currentCompany: 'Current company', yearsOfExperience: 'Years of experience',
  authorizedToWork: 'Authorized to work here', requiresSponsorship: 'Requires sponsorship', willingToRelocate: 'Willing to relocate',
};

const show = (v: unknown) => (v === true ? 'Yes' : v === false ? 'No' : v == null || v === '' ? '—' : String(v));
const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast.success('Copied'));

/**
 * Builds a bookmarklet that fills common application-form fields (Greenhouse, Lever, Ashby,
 * Workable, SmartRecruiters and most custom forms) on the page the user is viewing. It only
 * types values into empty fields; reviewing and submitting stays with the user.
 */
function buildBookmarklet(f: ApplyKitData['fields']): string {
  const data = {
    first: f.firstName, last: f.lastName, full: [f.firstName, f.lastName].filter(Boolean).join(' '), email: f.email, phone: f.phone,
    location: f.location, linkedin: f.linkedin, github: f.github, website: f.website, title: f.currentTitle, company: f.currentCompany,
  };
  const src = `(()=>{const D=${JSON.stringify(data)};const R=[[/first.?name|given/i,'first'],[/last.?name|family|surname/i,'last'],[/^(full.?)?name$|your name|_systemfield_name|candidate.?name/i,'full'],[/e-?mail/i,'email'],[/phone|mobile|tel/i,'phone'],[/linked.?in/i,'linkedin'],[/git.?hub/i,'github'],[/website|portfolio|personal.?(site|url)/i,'website'],[/current.?(job.?)?title|^title$/i,'title'],[/current.?company|employer|^org$/i,'company'],[/location|city/i,'location']];let n=0;const lab=e=>{let t=[e.name,e.id,e.placeholder,e.getAttribute('aria-label'),e.getAttribute('autocomplete')];if(e.id){const l=document.querySelector('label[for="'+CSS.escape(e.id)+'"]');if(l)t.push(l.textContent)}const p=e.closest('label,.field,.application-field,.form-group,[class*=field]');if(p)t.push((p.querySelector('label')||p).textContent.slice(0,80));return t.filter(Boolean).join(' ')};document.querySelectorAll('input[type=text],input[type=email],input[type=tel],input[type=url],input:not([type]),textarea').forEach(e=>{if(e.value||e.disabled||e.readOnly)return;const L=lab(e);for(const[re,k]of R){if(re.test(L)&&D[k]){const s=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e),'value').set;s.call(e,D[k]);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));n++;break}}});alert('Job Copilot filled '+n+' field(s). Review everything, attach your resume, then submit yourself.')})();`;
  return `javascript:${encodeURIComponent(src)}`;
}

export function ApplyKit({ job }: { job: { id: string; title: string; companyName: string; source: string; url: string; applyUrl?: string | null } }) {
  const api = useApi();
  const { ready } = useToken();
  const qc = useQueryClient();
  const kit = useQuery({ queryKey: ['apply-kit', job.id], queryFn: () => api<ApplyKitData>(`/documents/apply-kit/${job.id}`), enabled: ready, retry: false });
  const bookmarklet = useMemo(() => (kit.data ? buildBookmarklet(kit.data.fields) : ''), [kit.data]);

  const applied = useMutation({
    mutationFn: () =>
      api('/applications', {
        method: 'POST',
        body: JSON.stringify({
          jobId: job.id,
          company: job.companyName,
          role: job.title,
          source: job.source,
          jobUrl: (job.applyUrl || job.url).startsWith('http') ? job.applyUrl || job.url : undefined,
          status: 'APPLIED',
        }),
      }),
    onSuccess: () => {
      toast.success('Marked as applied. A follow-up reminder is set for 7 days from now.');
      qc.invalidateQueries({ queryKey: ['applications'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (kit.isLoading) return <Loader2 className="animate-spin" />;
  if (kit.error)
    return (
      <p className="text-sm text-muted-foreground">
        {(kit.error as Error).message}{' '}
        <Link href="/resumes" className="text-primary underline">
          Upload your resume
        </Link>
      </p>
    );
  const k = kit.data!;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Application answers</CardTitle>
          <CardDescription>Prefilled from your resume and preferences. Click any value to copy it.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          {Object.entries(FIELD_LABELS).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => k.fields[key] != null && k.fields[key] !== '' && copy(show(k.fields[key]))}
              className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left hover:bg-secondary"
            >
              <span className="text-muted-foreground">{label}</span>
              <span className="truncate font-medium">{show(k.fields[key])}</span>
            </button>
          ))}
          {[k.answers.whyThisCompany, k.answers.sponsorshipStatement, k.documents.coverLetterText].filter(Boolean).map((t, i) => (
            <button key={i} type="button" onClick={() => copy(t!)} className="rounded-md border px-3 py-2 text-left hover:bg-secondary sm:col-span-2">
              <span className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Copy className="h-3 w-3" /> {i === 0 ? 'Why this company' : i === 1 && k.answers.sponsorshipStatement ? 'Sponsorship statement' : 'Cover letter'}
              </span>
              <span className="line-clamp-3 whitespace-pre-wrap">{t}</span>
            </button>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Apply on {k.job.company}’s site</CardTitle>
          <CardDescription>You review and submit; nothing is sent on your behalf.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Button asChild className="w-full">
            <a href={k.job.applyUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink /> Open application form
            </a>
          </Button>
          <div className="rounded-md border p-3">
            <p className="mb-2 flex items-center gap-1 font-medium">
              <Wand2 className="h-4 w-4" /> Autofill bookmarklet
            </p>
            <p className="mb-2 text-xs text-muted-foreground">
              Drag this button to your bookmarks bar once. On any application form, click the bookmark to fill name, email, phone and links.
            </p>
            <a href={bookmarklet} onClick={(e) => e.preventDefault()} draggable className="inline-block cursor-grab rounded-md bg-secondary px-3 py-1.5 text-xs font-medium">
              ⭐ Fill application
            </a>
          </div>
          {!k.documents.tailoredResumeId && <p className="text-xs text-muted-foreground">Tip: generate a tailored resume first (Tailored resume tab) and attach it.</p>}
          <Button variant="outline" className="w-full" onClick={() => applied.mutate()} disabled={applied.isPending || applied.isSuccess}>
            <FileCheck2 /> {applied.isSuccess ? 'Tracked as applied' : 'I applied: track it'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
