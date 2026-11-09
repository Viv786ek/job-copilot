// Copies browser builds of pdf.js and mammoth into public/vendor so the app can load them at
// runtime (resume parsing in the browser) without bundling their worker/UMD code through webpack.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'vendor');
mkdirSync(out, { recursive: true });

const pdfDir = join(dirname(require.resolve('pdfjs-dist/package.json')), 'legacy', 'build');
copyFileSync(join(pdfDir, 'pdf.min.mjs'), join(out, 'pdf.min.mjs'));
copyFileSync(join(pdfDir, 'pdf.worker.min.mjs'), join(out, 'pdf.worker.min.mjs'));
copyFileSync(join(dirname(require.resolve('mammoth/package.json')), 'mammoth.browser.min.js'), join(out, 'mammoth.browser.min.js'));
console.log('vendor files copied to public/vendor');
