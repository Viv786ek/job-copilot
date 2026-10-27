import { AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import type { CoverLetter, TailoredResume } from '@copilot/shared';

interface Contact {
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  links?: string[];
}

const FONT = 'Calibri';

function heading(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999', space: 2 } },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 22, font: FONT })],
  });
}

function dateRange(start?: string | null, end?: string | null, current?: boolean) {
  const fmt = (d?: string | null) => {
    if (!d) return '';
    const [y, m] = d.split('-');
    return m ? `${new Date(Number(y), Number(m) - 1).toLocaleString('en-US', { month: 'short' })} ${y}` : y;
  };
  return [fmt(start), current ? 'Present' : fmt(end)].filter(Boolean).join(' – ');
}

/** Single-column, no tables/images/text boxes: the layout ATS parsers read most reliably. */
export async function renderResumeDocx(r: TailoredResume, c: Contact): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: c.fullName ?? '', bold: true, size: 32, font: FONT })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: [c.email, c.phone, c.location, ...(c.links ?? [])].filter(Boolean).join(' | '), size: 20, font: FONT })],
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: r.headline, italics: true, size: 22, font: FONT })] }),
    heading('Summary'),
    new Paragraph({ children: [new TextRun({ text: r.summary, size: 21, font: FONT })] }),
    heading('Skills'),
    new Paragraph({ children: [new TextRun({ text: r.skills.join(' • '), size: 21, font: FONT })] }),
    heading('Experience'),
  ];

  for (const e of r.experience) {
    children.push(
      new Paragraph({
        spacing: { before: 120 },
        children: [
          new TextRun({ text: `${e.title}, ${e.company}`, bold: true, size: 22, font: FONT }),
          new TextRun({ text: `\t${dateRange(e.startDate, e.endDate, e.current)}`, size: 20, font: FONT }),
        ],
        tabStops: [{ type: 'right', position: 10_000 }],
      }),
      ...e.bullets.map((b) => new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: b, size: 21, font: FONT })] })),
    );
  }

  if (r.projects.length) {
    children.push(heading('Projects'));
    for (const p of r.projects) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: p.name, bold: true, size: 21, font: FONT }),
            new TextRun({ text: p.skills.length ? ` (${p.skills.join(', ')})` : '', size: 20, font: FONT }),
          ],
        }),
        new Paragraph({ children: [new TextRun({ text: p.description, size: 21, font: FONT })] }),
      );
    }
  }

  if (r.education.length) {
    children.push(heading('Education'));
    for (const ed of r.education) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: [ed.degree, ed.field].filter(Boolean).join(', '), bold: true, size: 21, font: FONT }),
            new TextRun({ text: ` — ${ed.institution} ${dateRange(ed.startDate, ed.endDate)}`, size: 21, font: FONT }),
          ],
        }),
      );
    }
  }

  if (r.certifications.length) {
    children.push(heading('Certifications'));
    for (const cert of r.certifications)
      children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: [cert.name, cert.issuer].filter(Boolean).join(' — '), size: 21, font: FONT })] }));
  }

  const doc = new Document({
    sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } } }, children }],
  });
  return Packer.toBuffer(doc);
}

export async function renderCoverLetterDocx(letter: CoverLetter): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: letter.body
          .split(/\n{2,}/)
          .map((p) => new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: p.trim(), size: 22, font: FONT })] })),
      },
    ],
  });
  return Packer.toBuffer(doc);
}
