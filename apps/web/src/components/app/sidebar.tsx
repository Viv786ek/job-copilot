'use client';

import {
  BarChart3,
  Briefcase,
  FileSearch,
  FileText,
  KanbanSquare,
  LogOut,
  Menu,
  MessageSquareQuote,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DEMO, useAppSession } from '@/lib/session';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { href: '/jobs', label: 'Job Matches', icon: Briefcase },
  { href: '/analyzer', label: 'JD Analyzer', icon: FileSearch },
  { href: '/resumes', label: 'Resumes', icon: FileText },
  { href: '/applications', label: 'Applications', icon: KanbanSquare },
  { href: '/documents', label: 'Generated Docs', icon: MessageSquareQuote },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const session = useAppSession();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex flex-1 flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={() => setOpen(false)}
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            pathname.startsWith(href) ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </Link>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t pt-4">
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{session.user?.name ?? session.user?.email}</p>
          <p className="truncate text-xs text-muted-foreground">{session.user?.email}</p>
        </div>
        <Badge variant={session.user?.plan === 'FREE' ? 'secondary' : 'default'}>{session.user?.plan ?? 'FREE'}</Badge>
      </div>
      <Button variant="ghost" className="w-full justify-start" onClick={session.signOut}>
        <LogOut /> {DEMO ? 'Exit demo' : 'Sign out'}
      </Button>
    </div>
  );

  const brand = (
    <Link href="/dashboard" className="mb-6 flex items-center gap-2 px-2 text-lg font-bold">
      <Sparkles className="h-5 w-5 text-primary" /> Job Copilot
    </Link>
  );

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b bg-background px-4 py-3 lg:hidden">
        {brand}
        <Button variant="ghost" size="icon" onClick={() => setOpen(!open)} aria-label="Toggle menu">
          {open ? <X /> : <Menu />}
        </Button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 flex flex-col bg-background p-4 lg:hidden">
          <div className="flex justify-end">
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close menu">
              <X />
            </Button>
          </div>
          {nav}
          {footer}
        </div>
      )}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-card p-4 lg:flex">
        {brand}
        {nav}
        {footer}
      </aside>
    </>
  );
}
