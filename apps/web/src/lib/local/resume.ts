/** Reads PDF / DOCX / TXT resumes entirely in the browser; the file never leaves the device. */
import { BASE_PATH } from '../session';

const MAX_BYTES = 5 * 1024 * 1024;

declare global {
  interface Window {
    mammoth?: { extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }> };
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function pdfText(buf: ArrayBuffer): Promise<string> {
  const pdfjs = await import(/* webpackIgnore: true */ `${BASE_PATH}/vendor/pdf.min.mjs`);
  pdfjs.GlobalWorkerOptions.workerSrc = `${BASE_PATH}/vendor/pdf.worker.min.mjs`;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // Rebuild lines from text item positions so section headings and bullets survive.
    let lastY: number | null = null;
    let line = '';
    const lines: string[] = [];
    for (const item of content.items as Array<{ str: string; transform: number[]; hasEOL?: boolean }>) {
      const y = Math.round(item.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        lines.push(line.trim());
        line = '';
      }
      line += (line && !line.endsWith(' ') && !item.str.startsWith(' ') ? ' ' : '') + item.str;
      lastY = y;
      if (item.hasEOL) {
        lines.push(line.trim());
        line = '';
        lastY = null;
      }
    }
    if (line.trim()) lines.push(line.trim());
    pages.push(lines.filter(Boolean).join('\n'));
  }
  return pages.join('\n');
}

async function docxText(buf: ArrayBuffer): Promise<string> {
  await loadScript(`${BASE_PATH}/vendor/mammoth.browser.min.js`);
  if (!window.mammoth) throw new Error('DOCX reader failed to load');
  return (await window.mammoth.extractRawText({ arrayBuffer: buf })).value;
}

export async function extractResumeText(file: File): Promise<string> {
  if (file.size > MAX_BYTES) throw new Error('Resume must be 5 MB or smaller');
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 5));
  const isPdf = String.fromCharCode(...head) === '%PDF-';
  const isZip = head[0] === 0x50 && head[1] === 0x4b;
  let text: string;
  if (isPdf) text = await pdfText(buf);
  else if (isZip) text = await docxText(buf);
  else if (/\.(txt|md)$/i.test(file.name)) text = new TextDecoder().decode(buf);
  else throw new Error('Upload a PDF, DOCX or TXT resume');
  const cleaned = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (cleaned.length < 150) throw new Error('Could not read text from this file. If it is a scanned image, export a text-based PDF.');
  return cleaned;
}
