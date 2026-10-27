import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/** Seeds a demo account and a starter set of career pages (public Greenhouse/Lever/Ashby boards). */
async function main() {
  const companies = [
    { name: 'Razorpay', atsType: 'lever', atsBoardId: 'razorpay' },
    { name: 'Postman', atsType: 'greenhouse', atsBoardId: 'postman' },
    { name: 'Groww', atsType: 'greenhouse', atsBoardId: 'groww' },
    { name: 'Notion', atsType: 'ashby', atsBoardId: 'notion' },
    { name: 'Vercel', atsType: 'greenhouse', atsBoardId: 'vercel' },
  ];
  for (const c of companies) {
    const slug = `${c.atsType}-${c.atsBoardId}`;
    await prisma.company.upsert({ where: { slug }, update: {}, create: { ...c, slug } });
  }

  const email = 'demo@jobcopilot.dev';
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: 'Demo User',
      passwordHash: await bcrypt.hash('DemoPass123!', 12),
      preferences: { create: { titles: ['Full Stack Developer'], locations: ['Bengaluru'], minMatchScore: 60 } },
      profile: { create: { skills: [], primaryRoles: [], embedding: [] } },
    },
  });
  console.log(`Seeded ${companies.length} career pages and ${email} (password in prisma/seed.ts)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
