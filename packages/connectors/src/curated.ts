import type { CompanyCandidate } from './discover';

/**
 * Product companies and scale-ups hiring internationally (US, UK, DE, NL, CH, LU, UAE, AU, NZ, SG, IN, CA).
 * Names only: the ATS and board slug are discovered and verified live, so this list never
 * goes stale silently. Extend freely, or add companies from the UI by pasting a careers URL.
 */
const NAMES = `
Stripe, Airbnb, Figma, Notion, Databricks, Snowflake, Datadog, Cloudflare, Coinbase, Robinhood, Plaid, Brex, Ramp, Rippling, Gusto, Deel, Remote, Lattice, Retool, Vercel,
Supabase, PlanetScale, Neon, Linear, Loom, Miro, Canva, Atlassian, Asana, Monday, Airtable, Zapier, Webflow, Framer, Grammarly, Duolingo, Discord, Reddit, Pinterest, Dropbox,
Twilio, Okta, HashiCorp, GitLab, Elastic, MongoDB, Confluent, Cockroach Labs, Temporal, Postman, Sentry, PagerDuty, LaunchDarkly, Segment, Amplitude, Mixpanel, Heap, Contentful, Algolia,
OpenAI, Anthropic, Cohere, Mistral, Hugging Face, Scale AI, Perplexity, Runway, Stability AI, Replit, Anyscale, Weights and Biases, Pinecone, Weaviate, Modal, Together AI, ElevenLabs, Synthesia, DeepL, Aleph Alpha,
Revolut, Monzo, Wise, Starling Bank, Checkout.com, GoCardless, Klarna, N26, Trade Republic, Solaris, Mollie, Adyen, Bunq, Bolt, Personio, Celonis, Contentsquare, Doctolib, Qonto, Alan,
Spotify, Zalando, Delivery Hero, HelloFresh, GetYourGuide, SumUp, Wolt, Booking.com, Miro, Messagebird, Bird, Mews, Productboard, Pleo, Lunar, Tink, Pipedrive, Wise, Glovo, Cabify,
Careem, Talabat, Kitopi, Tabby, Tamara, Noon, Anghami, Property Finder, Bayut, Swvl, Fetchr, Sarwa, Pure Harvest,
Canva, Atlassian, SafetyCulture, Airwallex, Culture Amp, Employment Hero, Linktree, Deputy, Xero, Rocket Lab, Halter, Sharesies, Pushpay, Vend, Seek, Afterpay, Immutable,
Grab, Shopee, Sea, Ninja Van, Carousell, Xendit, Nium, Thunes, PatSnap, Razorpay, CRED, Zerodha, Swiggy, Zomato, Meesho, Groww, PhonePe, Postman, BrowserStack, Freshworks, Chargebee, Zeta, Slice, Jar,
Shopify, Wealthsimple, Cohere, Faire, Clio, Hootsuite, Ada, Coveo, Lightspeed, ApplyBoard,
Proton, Scandit, Nexthink, Beekeeper, GetYourGuide, Climeworks, Frontify, Ledgy, Sygnum, Taurus,
Spire Global, Docker, JetBrains, Grafana Labs, Kong, Snyk, Wiz, Tailscale, 1Password, Bitwarden, Auth0, Clerk, Doppler, Render, Railway, Fly.io, Netlify, Prisma, Hasura, Airbyte, dbt Labs, Fivetran, Hex,
Instacart, DoorDash, Lyft, Uber, Square, Block, Affirm, Chime, SoFi, Mercury, Navan, Gong, Outreach, Apollo, HubSpot, Intercom, Zendesk, Front, Calendly, Typeform, Mural, Pitch, Superhuman, Raycast,
Bending Spoons, Satispay, Factorial, Travelperk, Hotjar, Sennder, Forto, Taxfix, Raisin, Scalable Capital, Enpal, 1Komma5, Flix, Trivago, Blinkist, Babbel, Ecosia, Contentful, Commercetools, Staffbase,
Picnic, Mollie, Backbase, Miro, Bynder, Catawiki, Framer, Lightyear, Payhawk, Vinted, Nord Security, Wix, Monday.com, Fiverr, Riskified, Snyk
`;

export const CURATED_COMPANIES: CompanyCandidate[] = [...new Set(NAMES.split(',').map((n) => n.trim()).filter(Boolean))].map((name) => ({
  name,
  origin: 'curated',
}));
