import { BadRequestException } from '@nestjs/common';
import * as mammoth from 'mammoth';

// Import the library entry directly: pdf-parse's index.js runs a debug harness when required.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse: (data: Buffer) => Promise<{ text: string; numpages: number }> = require('pdf-parse/lib/pdf-parse.js');

export const ALLOWED_MIME = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
} as const;

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

/** Validates magic bytes, not just the client-supplied mimetype. */
export function sniffType(buf: Buffer): 'pdf' | 'docx' | null {
  if (buf.subarray(0, 5).toString('ascii') === '%PDF-') return 'pdf';
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'docx'; // ZIP container
  return null;
}

export async function extractText(buf: Buffer): Promise<string> {
  const kind = sniffType(buf);
  let text: string;
  if (kind === 'pdf') {
    text = (await pdfParse(buf)).text;
  } else if (kind === 'docx') {
    text = (await mammoth.extractRawText({ buffer: buf })).value;
  } else {
    throw new BadRequestException('Unsupported file type. Upload a PDF or DOCX resume.');
  }
  const cleaned = text
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (cleaned.length < 200) {
    throw new BadRequestException(
      'Could not read enough text from this file. If it is a scanned image, export it as a text-based PDF.',
    );
  }
  return cleaned;
}
