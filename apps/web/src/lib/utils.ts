import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(d?: string | Date | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function relativeDays(d?: string | Date | null) {
  if (!d) return '';
  const days = Math.round((Date.now() - new Date(d).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

export function scoreTone(score: number) {
  if (score >= 75) return 'text-success';
  if (score >= 55) return 'text-warning';
  return 'text-destructive';
}

export function formatSalary(min?: number | null, max?: number | null, currency?: string | null) {
  if (!min && !max) return null;
  const fmt = (n: number) =>
    currency === 'INR' ? `₹${(n / 100_000).toFixed(1)}L` : `${currency ?? ''} ${Math.round(n / 1000)}k`.trim();
  return [min, max].filter(Boolean).map((n) => fmt(n as number)).join(' – ');
}
