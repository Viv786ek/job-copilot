// Builds the static GitHub Pages demo into apps/web/out.
// Server-only pieces (Auth.js route handler, middleware) can't be statically exported,
// so they are moved aside for the duration of the build and always restored.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const stash = join(root, '.pages-stash');
const serverOnly = ['src/middleware.ts', 'src/app/api'];

rmSync(stash, { recursive: true, force: true });
mkdirSync(stash, { recursive: true });
const moved = [];
try {
  for (const rel of serverOnly) {
    const from = join(root, rel);
    if (!existsSync(from)) continue;
    const to = join(stash, rel.replace(/[\\/]/g, '__'));
    renameSync(from, to);
    moved.push([from, to]);
  }
  execSync('npx next build', {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      BUILD_TARGET: 'pages',
      NEXT_PUBLIC_DEMO_MODE: 'true',
      NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH ?? '/job-copilot',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  });
} finally {
  for (const [from, to] of moved.reverse()) renameSync(to, from);
  rmSync(stash, { recursive: true, force: true });
}
