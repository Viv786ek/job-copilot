'use client';

import { cn, scoreTone } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function ScoreRing({ score, size = 64, label }: { score: number; size?: number; label?: string }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, score)) / 100);
  return (
    <div className="relative inline-flex flex-col items-center" style={{ width: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={6} className="fill-none stroke-secondary" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className={cn('fill-none stroke-current transition-all', scoreTone(score))}
        />
      </svg>
      <span className={cn('absolute inset-0 flex items-center justify-center font-semibold', scoreTone(score))} style={{ height: size, fontSize: size / 4 }}>
        {score}
      </span>
      {label && <span className="mt-1 text-xs text-muted-foreground">{label}</span>}
    </div>
  );
}

export function StatCard({ label, value, hint, icon }: { label: string; value: React.ReactNode; hint?: string; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{label}</span>
          {icon}
        </div>
        <div className="mt-2 text-3xl font-bold tracking-tight">{value}</div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

const BREAKDOWN_LABELS: Record<string, string> = {
  requiredSkills: 'Must-have skills',
  preferredSkills: 'Nice-to-have skills',
  experience: 'Experience',
  title: 'Role alignment',
  semantic: 'Semantic fit',
  location: 'Location / visa',
};

export function MatchBreakdown({ breakdown }: { breakdown: Record<string, number> }) {
  return (
    <div className="space-y-3">
      {Object.entries(BREAKDOWN_LABELS).map(([key, label]) => (
        <div key={key}>
          <div className="mb-1 flex justify-between text-sm">
            <span>{label}</span>
            <span className="text-muted-foreground">{key === 'semantic' && !breakdown[key] ? 'n/a (no embeddings)' : `${breakdown[key] ?? 0}%`}</span>
          </div>
          <Progress value={breakdown[key] ?? 0} />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
