'use client';

import {
  BarChart3,
  Bookmark,
  Briefcase,
  FileSearch,
  KanbanSquare,
  LineChart,
  LogOut,
  Menu,
  MessageSquareQuote,
  Radar,
  Settings,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LOCAL_MODE, useAppSession } from '@/lib/session';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const NAV: Array<{ title?: string; items: Array<{ href: string; label: string; icon: typeof BarChart3 }> }> = [
  {
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
      { href: '/discover', label: 'AI Job Discovery', icon: Radar },
      { href: '/jobs', label: 'Recommended Jobs', icon: Briefcase },
      { href: '/saved', label: 'Saved Jobs', icon: Bookmark },
      { href: '/applications', label: 'Application Tracker', icon: KanbanSquare },
      { href: '/insights', label: 'Career Insights', icon: LineChart },
    ],
  },
  {
    title: 'Tools',
    items: [
      { href: '/analyzer', label: 'JD Analyzer', icon: FileSearch },
      { href: '/documents', label: 'Generated Docs', icon: MessageSquareQuote },
    ],
  },
  {
    title: 'Account',
    items: [
      { href: '/resumes', label: 'My Profile', icon: UserRound },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const session = useAppSession();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
      {NAV.map((group, gi) => (
        <div key={gi} className={cn('flex flex-col gap-1', gi > 0 && 'mt-4')}>
          {group.title && <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</p>}
          {group.items.map(({ href, label, icon: Icon }) => (
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
        </div>
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
        <LogOut /> {LOCAL_MODE ? 'Clear my data' : 'Sign out'}
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
