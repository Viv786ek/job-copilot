import { assessVisa, computeMatch, jobOpenInCountry, parseLocation, parseResumeText, toCountryCode } from '@copilot/shared';

describe('parseLocation', () => {
  it.each([
    ['San Francisco, CA', ['US'], null],
    ['Bengaluru, IN', ['IN'], null],
    ['Atlanta, Georgia', ['US'], null],
    ['Dubai - United Arab Emirates', ['AE'], null],
    ['Luxembourg', ['LU'], null],
    ['Zürich', ['CH'], null],
    ['Remote (EU)', [], 'REGION'],
    ['Remote - US', ['US'], 'COUNTRY'],
    ['Anywhere in the world', [], 'GLOBAL'],
  ])('%s', (input, countries, scope) => {
    const r = parseLocation(input);
    expect(r.countries).toEqual(countries);
    expect(r.remoteScope).toBe(scope);
  });

  it('accepts names, aliases and ISO codes for any country', () => {
    expect(toCountryCode('UAE')).toBe('AE');
    expect(toCountryCode('Holland')).toBe('NL');
    expect(toCountryCode('NZL')).toBe('NZ');
    expect(toCountryCode('Kazakhstan')).toBe('KZ');
  });

  it('treats EU-remote roles as open to Luxembourg but not to the UAE', () => {
    const job = { countries: [], regions: ['EU'], remoteScope: 'REGION' as const };
    expect(jobOpenInCountry(job, 'LU')).toBe(true);
    expect(jobOpenInCountry(job, 'AE')).toBe(false);
  });
});

describe('assessVisa', () => {
  it('detects explicit sponsorship, visa programme and relocation', () => {
    const v = assessVisa('We offer visa sponsorship and a relocation package. You will join on a Skilled Worker visa.');
    expect(v.status).toBe('SPONSORS');
    expect(v.relocation).toBe(true);
    expect(v.visaTypes).toContain('UK Skilled Worker');
  });
  it('detects H-1B transfers', () => {
    expect(assessVisa('We are happy to sponsor H-1B transfers for this role.').visaTypes).toContain('H-1B');
  });
  it('respects negations and authorization requirements', () => {
    const v = assessVisa('Applicants must be authorized to work in the US without current or future sponsorship.');
    expect(v.status).toBe('NO_SPONSORSHIP');
    expect(v.requiresAuthorizationIn).toEqual(['US']);
  });
  it('ignores unrelated uses of “sponsor”', () => {
    expect(assessVisa('We sponsor a local hackathon every year.').status).toBe('UNKNOWN');
  });
  it('uses official registers as a signal', () => {
    expect(assessVisa('Great team.', { sponsorRegister: 'UK Home Office register of licensed sponsors' }).status).toBe('LIKELY');
  });
});

const RESUME = `Priya Nair
Senior Backend Engineer
priya.nair@example.com | +91 98450 12345 | Pune, India | linkedin.com/in/priyanair
SUMMARY
Backend engineer with 6 years building payment APIs in Java and Spring Boot.
SKILLS
Java, Spring Boot, Kafka, PostgreSQL, Docker, Kubernetes, AWS
EXPERIENCE
Senior Software Engineer, Finlytics  Jan 2022 - Present
• Built Kafka event pipelines processing 2M events per day
• Led migration of 12 services to Kubernetes
Software Engineer | CodeCraft Solutions | Jul 2019 – Dec 2021
• Developed Spring Boot REST APIs on PostgreSQL
EDUCATION
B.Tech Computer Science, College of Engineering Pune 2015 - 2019
CERTIFICATIONS
AWS Certified Developer – Associate, 2023`;

describe('parseResumeText', () => {
  const r = parseResumeText(RESUME);
  it('extracts contact details', () => {
    expect(r.fullName).toBe('Priya Nair');
    expect(r.email).toBe('priya.nair@example.com');
    expect(r.links[0]).toContain('linkedin.com/in/priyanair');
  });
  it('extracts roles with dates and bullets', () => {
    expect(r.experience).toHaveLength(2);
    expect(r.experience[0]).toMatchObject({ title: 'Senior Software Engineer', company: 'Finlytics', startDate: '2022-01', current: true });
    expect(r.experience[0].bullets).toHaveLength(2);
    expect(r.experience[1]).toMatchObject({ company: 'CodeCraft Solutions', startDate: '2019-07', endDate: '2021-12' });
  });
  it('extracts skills, education and certifications', () => {
    expect(r.skills).toEqual(expect.arrayContaining(['Java', 'Spring Boot', 'Kafka', 'Kubernetes', 'AWS']));
    expect(r.education[0].degree).toMatch(/B\.Tech/);
    expect(r.certifications[0].name).toMatch(/AWS Certified Developer/);
  });
});

describe('work authorization in matching', () => {
  const candidate = {
    skills: ['Java', 'Spring Boot'], totalYearsExp: 6, targetTitles: ['Backend Engineer'], embedding: [], resumeText: 'Java Spring Boot',
    preferredLocations: [], remoteOnly: false, needsVisaSponsorship: true, targetCountries: ['DE'], authorizedCountries: ['IN'],
  };
  const job = {
    title: 'Backend Engineer', requiredSkills: ['Java'], preferredSkills: [], atsKeywords: ['Java'], minYears: 3, maxYears: null, embedding: [],
    location: 'Berlin, Germany', workMode: 'ONSITE' as const, visaSponsorship: null, country: 'DE', countries: ['DE'],
  };
  it('rewards sponsoring employers and zeroes explicit refusals', () => {
    expect(computeMatch(candidate, { ...job, visaStatus: 'SPONSORS' }).breakdown.location).toBe(100);
    expect(computeMatch(candidate, { ...job, visaStatus: 'NO_SPONSORSHIP' }).breakdown.location).toBe(0);
    expect(computeMatch({ ...candidate, authorizedCountries: ['DE'] }, { ...job, visaStatus: 'NO_SPONSORSHIP' }).breakdown.location).toBe(100);
  });
});

const LINKEDIN_EXPORT = `Contact
ananya.rao.dev@example.com
www.linkedin.com/in/ananya-rao-dev (LinkedIn)
Top Skills
Python
FastAPI
Large Language Models (LLM)
Languages
English (Full Professional)
Certifications
AWS Certified Machine Learning – Specialty
Ananya Rao
Senior AI Engineer | LLMs · RAG · Python · AWS
Bengaluru, Karnataka, India
Summary
AI engineer building production RAG systems and agentic workflows.
Experience
Nimbus Analytics
3 years 2 months
Senior AI Engineer
January 2024 - Present (1 year 11 months)
Bengaluru, Karnataka, India
Built a RAG platform over 4 million documents using LangChain and pgvector.
Cut inference cost by 35% with batching and caching.
AI Engineer
October 2022 - December 2023 (1 year 3 months)
Shipped FastAPI microservices for document classification.
Brightline Software
Software Engineer
July 2019 - September 2022 (3 years 3 months)
Pune, Maharashtra, India
Developed Django REST APIs on PostgreSQL.
Education
Vellore Institute of Technology
Bachelor of Technology - BTech, Computer Science · (2015 - 2019)
Page 1 of 2`;

describe('LinkedIn profile export', () => {
  const r = parseResumeText(LINKEDIN_EXPORT);
  it('reads name, headline and location from the main column', () => {
    expect(r.fullName).toBe('Ananya Rao');
    expect(r.headline).toMatch(/^Senior AI Engineer/);
    expect(r.location).toBe('Bengaluru, Karnataka, India');
  });
  it('parses grouped roles under one company and single roles', () => {
    expect(r.experience.map((e) => [e.company, e.title, e.startDate, e.endDate])).toEqual([
      ['Nimbus Analytics', 'Senior AI Engineer', '2024-01', null],
      ['Nimbus Analytics', 'AI Engineer', '2022-10', '2023-12'],
      ['Brightline Software', 'Software Engineer', '2019-07', '2022-09'],
    ]);
    expect(r.experience[0].bullets).toHaveLength(2);
    expect(r.experience[0].location).toBe('Bengaluru, Karnataka, India');
  });
  it('reads top skills, education and certifications', () => {
    expect(r.skills).toEqual(expect.arrayContaining(['Python', 'FastAPI', 'LangChain', 'PostgreSQL']));
    expect(r.education[0]).toMatchObject({ institution: 'Vellore Institute of Technology', degree: 'Bachelor of Technology - BTech', field: 'Computer Science' });
    expect(r.certifications[0].name).toMatch(/AWS Certified Machine Learning/);
  });
});
