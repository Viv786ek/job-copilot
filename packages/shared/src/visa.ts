/**
 * Visa sponsorship & relocation intelligence.
 *
 * Rule-based NLP over the job text: weighted intent patterns, explicit negations,
 * work-authorization restrictions and visa-programme detection, combined into a
 * status + 0–100 confidence with the evidence sentences that produced it.
 * Official sponsor registers (UK Home Office, NL IND) add an independent signal.
 */

export type VisaStatus = 'SPONSORS' | 'LIKELY' | 'UNKNOWN' | 'NO_SPONSORSHIP';

export interface VisaAssessment {
  status: VisaStatus;
  confidence: number;
  visaTypes: string[];
  relocation: boolean;
  evidence: string[];
  /** Countries whose work authorization the posting explicitly demands. */
  requiresAuthorizationIn: string[];
  sponsorRegister: string | null;
}

interface Rule {
  re: RegExp;
  weight: number;
  label?: string;
}

const POSITIVE: Rule[] = [
  { re: /visa sponsorship (is |will be )?(available|provided|offered|possible|supported)/i, weight: 60 },
  { re: /\b(we|company|employer) (will |can |do |are able to |is able to |offer to )?(provide |offer )?sponsor(s|ship)?\b[^.]{0,60}\b(visa|work permit|immigration|h-?1b|relocat)/i, weight: 50 },
  { re: /\b(visa|work permit|immigration)\b[^.]{0,40}\b(we|company|employer) (will |can |do )?sponsor/i, weight: 50 },
  { re: /\b(offer|provide|including|includes|with) (full )?(visa|work permit|immigration) (sponsorship|support|assistance)/i, weight: 55 },
  { re: /sponsorship (is )?(available|offered|provided|possible)/i, weight: 50 },
  { re: /\bvisa (support|assistance|help|processing)\b/i, weight: 40 },
  { re: /\bh-?1b\b[^.]{0,40}\b(sponsor|transfer|support)/i, weight: 60, label: 'H-1B' },
  { re: /\b(sponsor|transfer)\b[^.]{0,40}\bh-?1b\b/i, weight: 60, label: 'H-1B' },
  { re: /\bskilled worker (visa|route|sponsorship)\b/i, weight: 55, label: 'UK Skilled Worker' },
  { re: /\btier ?2 (visa|sponsorship)\b/i, weight: 50, label: 'UK Skilled Worker' },
  { re: /\b(eu )?blue card\b/i, weight: 50, label: 'EU Blue Card' },
  { re: /\b(highly skilled migrant|kennismigrant|hsm visa|30% ruling)\b/i, weight: 50, label: 'NL Highly Skilled Migrant' },
  { re: /\b(golden visa|employment visa|residence visa)\b[^.]{0,40}\b(provided|sponsor|support|arranged)/i, weight: 45, label: 'UAE / GCC Employment Visa' },
  { re: /\b(provided|sponsor|support|arranged)\b[^.]{0,40}\b(employment|residence|work) visa\b/i, weight: 45, label: 'Employment Visa' },
  { re: /\b(work permit|work authori[sz]ation) (sponsorship|support|assistance|will be (provided|arranged))/i, weight: 50, label: 'Work Permit' },
  { re: /\b(tss|482|subclass 482|186 visa|skilled employer sponsored)\b/i, weight: 45, label: 'Australia TSS/482' },
  { re: /\baccredited employer work visa\b|\baewv\b/i, weight: 50, label: 'NZ AEWV' },
  { re: /\b(l-?1|o-?1|tn visa|e-?3)\b[^.]{0,30}\b(sponsor|support)/i, weight: 45, label: 'US Work Visa' },
  { re: /\bopen to (international|global|overseas) (candidates|applicants|talent)/i, weight: 20 },
];

const RELOCATION: RegExp[] = [
  /\breloca(tion|te)\b[^.]{0,40}\b(package|support|assistance|bonus|help|stipend|allowance|provided|covered|paid)/i,
  /\b(package|support|assistance|help) (for|with) (your )?relocat/i,
  /\bwe (will |can )?(help you |support you to )?relocate\b/i,
  /\brelocation (is )?(available|offered|possible)/i,
];

const NEGATIVE: Rule[] = [
  { re: /\b(no|not|unable to|cannot|can['’]?t|do not|don['’]?t|does not|will not|won['’]?t|are not able to)\b[^.]{0,40}\b(offer|provide|sponsor|support)\b[^.]{0,40}\b(visa|sponsorship|work permit|immigration)/i, weight: -80 },
  { re: /\b(visa )?sponsorship (is )?(not|un)(available|offered|provided|possible)/i, weight: -80 },
  { re: /without (the need for |requiring )?(current or future |any )?(visa |employer )?sponsorship/i, weight: -80 },
  { re: /\bno (visa )?sponsorship\b/i, weight: -80 },
  { re: /\b(us|u\.s\.) citizens? (only|required)\b|\bmust be a (us|u\.s\.) citizen\b/i, weight: -70 },
  { re: /\b(active |current )?(security|government|ts\/sci|secret) clearance (is )?required\b/i, weight: -50 },
  { re: /\bmust (already )?(be |have )(legally )?(authori[sz]ed|eligible|permitted|the (legal )?right) to work in\b/i, weight: -45 },
  { re: /\bright to work in the (uk|united kingdom|eu|us|uae)\b[^.]{0,30}\b(required|essential|needed|mandatory)/i, weight: -45 },
  { re: /\b(eu|uk|us) (work permit|citizenship|passport) (is )?(required|mandatory)/i, weight: -45 },
];

const AUTH_COUNTRY: Array<[RegExp, string]> = [
  [/\b(authori[sz]ed|eligible|right) to work in the (us|u\.s\.|united states)/i, 'US'],
  [/\b(authori[sz]ed|eligible|right) to work in the (uk|united kingdom)/i, 'GB'],
  [/\b(authori[sz]ed|eligible|right) to work in (canada)/i, 'CA'],
  [/\b(authori[sz]ed|eligible|right) to work in (australia)/i, 'AU'],
  [/\b(authori[sz]ed|eligible|right) to work in (the )?(eu|european union|germany|netherlands)/i, 'EU'],
];

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+|\n+|•/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
}

export function assessVisa(text: string, opts: { sponsorRegister?: string | null } = {}): VisaAssessment {
  let score = 0;
  const visaTypes = new Set<string>();
  const evidence: string[] = [];
  const requires = new Set<string>();
  let negative = false;
  let relocation = false;

  for (const s of sentences(text)) {
    let hit = false;
    for (const r of NEGATIVE) {
      if (r.re.test(s)) {
        score += r.weight;
        negative = negative || r.weight <= -70;
        hit = true;
        break;
      }
    }
    if (!hit) {
      for (const r of POSITIVE) {
        if (r.re.test(s)) {
          score += r.weight;
          if (r.label) visaTypes.add(r.label);
          hit = true;
        }
      }
    }
    if (RELOCATION.some((re) => re.test(s))) {
      relocation = true;
      score += 15;
      hit = true;
    }
    for (const [re, cc] of AUTH_COUNTRY) if (re.test(s)) requires.add(cc);
    if (hit && evidence.length < 4) evidence.push(s.length > 220 ? `${s.slice(0, 217)}…` : s);
  }

  if (opts.sponsorRegister && !negative) {
    score += 30;
    evidence.push(`Company is on the ${opts.sponsorRegister}.`);
  }

  let status: VisaStatus;
  if (negative && score < 30) status = 'NO_SPONSORSHIP';
  else if (score >= 50) status = 'SPONSORS';
  else if (score >= 25) status = 'LIKELY';
  else if (score < -20) status = 'NO_SPONSORSHIP';
  else status = 'UNKNOWN';

  const confidence =
    status === 'UNKNOWN' ? 0 : Math.min(98, Math.round(status === 'NO_SPONSORSHIP' ? 50 + Math.min(48, -score / 2) : 35 + score / 1.6));

  return {
    status,
    confidence,
    visaTypes: [...visaTypes],
    relocation,
    evidence,
    requiresAuthorizationIn: [...requires],
    sponsorRegister: opts.sponsorRegister ?? null,
  };
}

/** Normalizes company names so "Acme Ltd." and "ACME LIMITED" match the sponsor registers. */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\b(the|ltd|limited|llc|inc|incorporated|corp|corporation|plc|gmbh|ag|bv|b\.v|nv|sa|sas|sarl|srl|pty|co|company|holdings?|group|uk|europe|international|technologies|technology|labs?)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
