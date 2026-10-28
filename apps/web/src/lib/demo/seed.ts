import type { ParsedResume } from '@copilot/shared';

/** Sample data for the static demo. All companies and postings are fictional. */

export const SAMPLE_RESUME: ParsedResume = {
  fullName: 'Vivek Kumar Srivastava',
  email: 'vivek.Srivastava@example.com',
  phone: '+91 98765 43210',
  location: 'Bengaluru, India',
  headline: 'Full Stack Developer',
  summary:
    'Full stack developer with 6 years of experience building React and Node.js products used by thousands of customers. Comfortable owning features end to end, from database design to deployment.',
  links: ['linkedin.com/in/viveksde', 'github.com/viv786ek'],
  // The first 10 appear in the resume's skills line; the rest are skills the candidate declared in
  // their profile but never wrote down, which is exactly the gap honest tailoring closes.
  skills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'Express', 'PostgreSQL', 'MongoDB', 'Docker', 'AWS', 'Git', 'Redux', 'REST APIs', 'Jest', 'HTML', 'CSS', 'Tailwind CSS', 'Redis', 'CI/CD', 'Microservices'],
  experience: [
    {
      company: 'Brightcart Commerce',
      title: 'Software Engineer II',
      location: 'Bengaluru',
      startDate: '2023-04',
      endDate: null,
      current: true,
      bullets: [
        'Built a ReactJS checkout flow used by 40,000 daily shoppers, cutting cart abandonment by 12%',
        'Designed Node.js and Express REST APIs on PostgreSQL serving 1,200 requests per second',
        'Containerized 6 services with Docker and deployed them to AWS ECS',
        'Mentored 3 junior engineers through code reviews and pairing',
      ],
      skills: ['React', 'Node.js', 'Express', 'PostgreSQL', 'Docker', 'AWS'],
    },
    {
      company: 'Pixelforge Studios',
      title: 'Associate Software Engineer',
      location: 'Pune',
      startDate: '2021-07',
      endDate: '2023-03',
      current: false,
      bullets: [
        'Developed a Redux-based admin dashboard for 200 internal users',
        'Wrote Jest unit tests that raised coverage from 35% to 80%',
        'Migrated a legacy jQuery frontend to React with TypeScript',
      ],
      skills: ['React', 'Redux', 'TypeScript', 'Jest'],
    },
  ],
  education: [{ institution: 'VIT Vellore', degree: 'B.Tech', field: 'Computer Science', startDate: '2017', endDate: '2021', grade: '8.4 CGPA' }],
  projects: [
    { name: 'Expense Splitter', description: 'MERN app to split group expenses with real-time balances', skills: ['MongoDB', 'Express', 'React', 'Node.js'], url: null },
    { name: 'Portfolio Site', description: 'Next-style static portfolio with Tailwind CSS and a Lighthouse score of 98', skills: ['HTML', 'CSS', 'Tailwind CSS'], url: null },
  ],
  certifications: [{ name: 'AWS Certified Cloud Practitioner', issuer: 'Amazon Web Services', date: '2024' }],
};

export function resumeToText(r: ParsedResume): string {
  return [
    r.fullName,
    [r.email, r.phone, r.location, ...r.links].filter(Boolean).join(' | '),
    r.headline,
    'SUMMARY',
    r.summary,
    'SKILLS',
    r.skills.slice(0, 10).join(', '),
    'EXPERIENCE',
    ...r.experience.flatMap((e) => [`${e.title}, ${e.company} (${e.startDate} - ${e.current ? 'Present' : e.endDate})`, ...e.bullets.map((b) => `- ${b}`)]),
    'PROJECTS',
    ...r.projects.map((p) => `${p.name}: ${p.description}`),
    'EDUCATION',
    ...r.education.map((e) => `${e.degree} ${e.field ?? ''}, ${e.institution}`),
    'CERTIFICATIONS',
    ...r.certifications.map((c) => c.name),
  ]
    .filter(Boolean)
    .join('\n');
}

export interface SeedJob {
  id: string;
  title: string;
  companyName: string;
  location: string;
  workMode: 'REMOTE' | 'HYBRID' | 'ONSITE';
  source: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  visaSponsorship: boolean | null;
  daysAgo: number;
  description: string;
}

export const SEED_JOBS: SeedJob[] = [
  {
    id: 'job-fullstack-northwind', title: 'Senior Full Stack Engineer', companyName: 'Northwind Labs', location: 'Bengaluru, India', workMode: 'HYBRID',
    source: 'LINKEDIN', salaryMin: 2800000, salaryMax: 4000000, salaryCurrency: 'INR', visaSponsorship: null, daysAgo: 1,
    description: `Northwind Labs builds supply-chain software for 3,000 retailers. We're hiring a Senior Full Stack Engineer.

What you'll do
- Own features end to end across React frontends and Node.js services
- Design REST APIs and PostgreSQL schemas that scale
- Ship to AWS with Docker and CI/CD pipelines
- Mentor engineers and review code

Requirements
- 4+ years building web applications
- Strong TypeScript, React and Node.js
- PostgreSQL and REST API design
- Docker and AWS experience

Nice to have
- GraphQL
- Kubernetes
- Redis`,
  },
  {
    id: 'job-react-kestrel', title: 'Frontend Engineer (React)', companyName: 'Kestrel Pay', location: 'Remote (India)', workMode: 'REMOTE',
    source: 'WELLFOUND', salaryMin: 2200000, salaryMax: 3200000, salaryCurrency: 'INR', visaSponsorship: null, daysAgo: 2,
    description: `Kestrel Pay is a fintech startup making UPI payments simple for small businesses. Fully remote across India.

Responsibilities
- Build fast, accessible React interfaces with TypeScript
- Manage complex state with Redux
- Write unit tests with Jest
- Collaborate with design on our Tailwind CSS design system

Requirements
- 3+ years of React experience
- TypeScript, JavaScript, HTML, CSS
- Redux and Jest

Bonus
- Next.js
- Performance optimization experience`,
  },
  {
    id: 'job-node-orbit', title: 'Backend Engineer, Node.js', companyName: 'Orbit Health', location: 'Hyderabad, India', workMode: 'ONSITE',
    source: 'NAUKRI', salaryMin: 1800000, salaryMax: 2600000, salaryCurrency: 'INR', visaSponsorship: null, daysAgo: 3,
    description: `Orbit Health runs a telemedicine platform serving 2 million patients.

Responsibilities
- Build Node.js microservices with Express
- Model data in PostgreSQL and MongoDB
- Integrate messaging with Kafka
- Work from our Hyderabad office (on-site)

Requirements
- 2-5 years backend experience
- Node.js, Express, PostgreSQL
- Microservices and REST APIs

Preferred
- Kafka
- Docker`,
  },
  {
    id: 'job-java-meridian', title: 'Java Developer', companyName: 'Meridian Insurance Tech', location: 'Pune, India', workMode: 'HYBRID',
    source: 'INDEED', salaryMin: 1500000, salaryMax: 2400000, salaryCurrency: 'INR', visaSponsorship: null, daysAgo: 4,
    description: `Meridian builds policy administration systems for insurers.

Requirements
- 3+ years with Java and Spring Boot
- Hibernate and SQL
- Microservices on Kafka
- Unit testing with JUnit

Nice to have
- AWS
- Docker`,
  },
  {
    id: 'job-ml-quanta', title: 'AI Engineer, LLM Applications', companyName: 'Quanta Docs', location: 'Remote', workMode: 'REMOTE',
    source: 'GREENHOUSE', salaryMin: 90000, salaryMax: 130000, salaryCurrency: 'USD', visaSponsorship: true, daysAgo: 2,
    description: `Quanta Docs turns contracts into structured data with LLMs. Visa sponsorship is available for this role.

What you'll do
- Build RAG pipelines over millions of documents
- Ship Python services with FastAPI
- Evaluate and improve prompts and retrieval quality

Requirements
- 3+ years of Python
- Experience with LLMs, RAG and prompt engineering
- FastAPI or Django

Nice to have
- LangChain
- PostgreSQL
- TypeScript`,
  },
  {
    id: 'job-data-lumen', title: 'Data Analyst', companyName: 'Lumen Retail', location: 'Gurugram, India', workMode: 'HYBRID',
    source: 'FOUNDIT', salaryMin: 900000, salaryMax: 1400000, salaryCurrency: 'INR', visaSponsorship: null, daysAgo: 5,
    description: `Lumen Retail operates 400 stores across North India.

Requirements
- 1-3 years in data analysis
- Advanced SQL and Excel
- Power BI or Tableau dashboards
- Python with Pandas

Preferred
- Statistics background`,
  },
  {
    id: 'job-fullstack-tidal', title: 'Full Stack Developer (MERN)', companyName: 'Tidal Learning', location: 'Bengaluru, India', workMode: 'HYBRID',
    source: 'INSTAHYRE', salaryMin: 1600000, salaryMax: 2400000, salaryCurrency: 'INR', visaSponsorship: null, daysAgo: 1,
    description: `Tidal Learning is an edtech platform with 500,000 learners.

Responsibilities
- Build features across MongoDB, Express, React and Node.js
- Write clean, tested JavaScript
- Deploy with Docker

Requirements
- 2+ years MERN stack
- MongoDB, Express, React, Node.js
- Git

Good to have
- TypeScript
- AWS`,
  },
  {
    id: 'job-angular-cobalt', title: 'Angular Developer', companyName: 'Cobalt Logistics', location: 'Chennai, India', workMode: 'ONSITE',
    source: 'HIRIST', salaryMin: 1200000, salaryMax: 1800000, salaryCurrency: 'INR', visaSponsorship: null, daysAgo: 6,
    description: `Cobalt Logistics builds fleet management software.

Requirements
- 3+ years with Angular and TypeScript
- RxJS, HTML, CSS
- REST APIs

Nice to have
- Java
- Azure`,
  },
  {
    id: 'job-platform-aster', title: 'Software Engineer, Platform', companyName: 'Aster Cloud', location: 'Berlin, Germany', workMode: 'HYBRID',
    source: 'LEVER', salaryMin: 65000, salaryMax: 85000, salaryCurrency: 'EUR', visaSponsorship: true, daysAgo: 3,
    description: `Aster Cloud offers a developer platform used by 10,000 teams. We sponsor visas and relocation to Berlin.

Requirements
- 3+ years in backend or platform engineering
- Go or Node.js
- Docker and Kubernetes
- AWS or GCP

Nice to have
- Terraform
- PostgreSQL`,
  },
];
