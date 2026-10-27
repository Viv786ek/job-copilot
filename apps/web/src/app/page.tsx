import { ArrowRight, Bot, FileCheck2, KanbanSquare, Radar, ShieldCheck, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

const FEATURES = [
  { icon: Radar, title: 'Jobs that actually fit', body: 'Daily discovery across job APIs, company career pages and anything you import from LinkedIn, Naukri, Indeed, Wellfound and more — ranked by an explainable match score.' },
  { icon: FileCheck2, title: 'ATS-ready, never fabricated', body: 'Every tailored resume is checked against your real resume. Invented skills, roles or metrics are stripped automatically and you see exactly what changed.' },
  { icon: Bot, title: 'Cover letters & outreach', body: 'Specific cover letters, LinkedIn notes, recruiter emails and timed follow-ups, written from your actual achievements.' },
  { icon: KanbanSquare, title: 'One pipeline for everything', body: 'Track applications, interviews and follow-ups. See your response rate and where your search is leaking.' },
];

export default function Landing() {
  return (
    <div className="min-h-screen">
      <header className="container flex items-center justify-between py-5">
        <span className="flex items-center gap-2 text-lg font-bold">
          <Sparkles className="h-5 w-5 text-primary" /> VP AI Job Copilot
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/register">Get started free</Link>
          </Button>
        </div>
      </header>

      <section className="container py-20 text-center sm:py-28">
        <p className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-success" /> Honest by design: we never add skills you don&apos;t have
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight sm:text-6xl">
          Your AI copilot from <span className="text-primary">resume</span> to <span className="text-primary">offer</span>.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Upload your resume once. Get matched jobs every morning, a tailored resume and cover letter for each one, recruiter
          messages, interview prep, and a tracker that reminds you to follow up.
        </p>
        <div className="mt-10 flex justify-center gap-3">
          <Button size="lg" asChild>
            <Link href="/register">
              Upload your resume <ArrowRight />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/login">I have an account</Link>
          </Button>
        </div>
      </section>

      <section className="container grid gap-6 pb-24 sm:grid-cols-2">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-xl border bg-card p-6">
            <Icon className="h-6 w-6 text-primary" />
            <h3 className="mt-4 text-lg font-semibold">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">© {new Date().getFullYear()} VP AI Job Copilot</footer>
    </div>
  );
}
