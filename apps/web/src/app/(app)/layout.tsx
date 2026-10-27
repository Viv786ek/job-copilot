import { DemoBanner } from '@/components/app/demo-banner';
import { Sidebar } from '@/components/app/sidebar';

// Access control lives in middleware.ts (Auth.js `authorized` callback), so this layout
// stays static-renderable for the GitHub Pages demo build.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:flex">
      <Sidebar />
      <main className="flex-1 overflow-x-hidden px-4 py-6 sm:px-8 lg:py-8">
        <div className="mx-auto max-w-6xl">
          <DemoBanner />
          {children}
        </div>
      </main>
    </div>
  );
}
