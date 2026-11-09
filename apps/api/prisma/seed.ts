import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const prisma = new PrismaClient();

/**
 * Loads the verified company job boards produced by the discovery CLI
 * (packages/connectors/data/companies.json). No users or credentials are seeded.
 */
async function main() {
  const file = resolve(__dirname, '../../../packages/connectors/data/companies.json');
  const { boards } = JSON.parse(readFileSync(file, 'utf8')) as {
    boards: Array<{ name: string; ats: string; slug: string; website?: string | null; origin?: string; openJobs?: number }>;
  };
  let n = 0;
  for (const b of boards) {
    const slug = `${b.ats}-${b.slug}`.toLowerCase();
    await prisma.company.upsert({
      where: { slug },
      update: { name: b.name, website: b.website ?? undefined, openJobs: b.openJobs ?? undefined },
      create: { slug, name: b.name, website: b.website ?? null, atsType: b.ats, atsBoardId: b.slug, origin: b.origin ?? 'curated', openJobs: b.openJobs ?? null },
    });
    n++;
  }
  console.log(`Seeded ${n} verified company job boards. Run the worker (or POST /api/v1/internal/harvest) to fetch jobs.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
