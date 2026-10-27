import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { Sidebar } from '@/components/app/sidebar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return (
    <div className="min-h-screen lg:flex">
      <Sidebar />
      <main className="flex-1 overflow-x-hidden px-4 py-6 sm:px-8 lg:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
