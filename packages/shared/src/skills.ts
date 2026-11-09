/**
 * Canonical skill taxonomy. Keys are canonical names; values are aliases.
 * Used for deterministic normalization before scoring so "ReactJS", "react.js"
 * and "React" all compare equal. Runtime extensions live in the SkillAlias table.
 */
export const SKILL_TAXONOMY: Record<string, string[]> = {
  JavaScript: ['javascript', 'ecmascript', 'es6'],
  TypeScript: ['typescript'],
  React: ['react', 'reactjs', 'react.js'],
  'Next.js': ['nextjs', 'next.js'],
  Angular: ['angular', 'angularjs', 'angular.js'],
  'Vue.js': ['vue', 'vuejs', 'vue.js'],
  Redux: ['redux', 'redux toolkit'],
  'Node.js': ['node', 'nodejs', 'node.js'],
  NestJS: ['nestjs', 'nest.js'],
  Express: ['express', 'expressjs', 'express.js'],
  Java: ['java', 'core java'],
  'Spring Boot': ['spring boot', 'springboot', 'spring'],
  Hibernate: ['hibernate', 'jpa'],
  Microservices: ['microservices', 'microservice architecture'],
  Python: ['python', 'python3'],
  Django: ['django'],
  FastAPI: ['fastapi'],
  Flask: ['flask'],
  Go: ['golang'],
  'C#': ['c#', 'csharp', '.net', 'dotnet', 'asp.net'],
  'C++': ['c++', 'cpp'],
  SQL: ['sql'],
  PostgreSQL: ['postgres', 'postgresql'],
  MySQL: ['mysql'],
  MongoDB: ['mongo', 'mongodb'],
  Redis: ['redis'],
  Kafka: ['kafka', 'apache kafka'],
  RabbitMQ: ['rabbitmq'],
  GraphQL: ['graphql'],
  'REST APIs': ['rest api', 'restful', 'rest apis', 'restful apis'],
  Docker: ['docker'],
  Kubernetes: ['kubernetes', 'k8s'],
  AWS: ['aws', 'amazon web services'],
  Azure: ['azure', 'microsoft azure'],
  GCP: ['gcp', 'google cloud', 'google cloud platform'],
  Terraform: ['terraform'],
  'CI/CD': ['ci/cd', 'cicd', 'continuous integration', 'github actions', 'jenkins'],
  Git: ['git'],
  Linux: ['linux', 'unix'],
  HTML: ['html', 'html5'],
  CSS: ['css', 'css3', 'scss', 'sass'],
  'Tailwind CSS': ['tailwind', 'tailwindcss', 'tailwind css'],
  Jest: ['jest'],
  'Unit Testing': ['unit testing', 'junit', 'mocha', 'vitest'],
  'Machine Learning': ['machine learning'],
  'Deep Learning': ['deep learning'],
  PyTorch: ['pytorch'],
  TensorFlow: ['tensorflow'],
  'scikit-learn': ['sklearn', 'scikit-learn', 'scikit learn'],
  LLMs: ['llm', 'llms', 'large language models', 'genai', 'generative ai'],
  LangChain: ['langchain'],
  RAG: ['retrieval augmented generation', 'retrieval-augmented generation'],
  'Prompt Engineering': ['prompt engineering'],
  NLP: ['nlp', 'natural language processing'],
  Pandas: ['pandas'],
  NumPy: ['numpy'],
  'Power BI': ['power bi', 'powerbi'],
  Tableau: ['tableau'],
  Excel: ['excel', 'ms excel', 'advanced excel'],
  'Data Analysis': ['data analysis', 'data analytics'],
  Statistics: ['statistics', 'statistical analysis'],
  Spark: ['apache spark', 'pyspark'],
  Airflow: ['airflow', 'apache airflow'],
  'System Design': ['system design', 'distributed systems'],
  'Data Structures & Algorithms': ['dsa', 'data structures', 'algorithms'],
  Agile: ['agile', 'scrum'],
  Kotlin: ['kotlin'],
  Swift: ['swift', 'swiftui'],
  'Objective-C': ['objective-c'],
  Android: ['android', 'android sdk'],
  iOS: ['ios'],
  'React Native': ['react native', 'react-native'],
  Flutter: ['flutter', 'dart'],
  Rust: ['rust'],
  Scala: ['scala'],
  Ruby: ['ruby'],
  'Ruby on Rails': ['rails', 'ruby on rails', 'ror'],
  PHP: ['php'],
  Laravel: ['laravel'],
  Elixir: ['elixir', 'phoenix framework'],
  Svelte: ['svelte', 'sveltekit'],
  jQuery: ['jquery'],
  Webpack: ['webpack', 'vite', 'rollup'],
  Storybook: ['storybook'],
  'Material UI': ['material ui', 'mui'],
  RxJS: ['rxjs'],
  gRPC: ['grpc', 'protobuf', 'protocol buffers'],
  WebSockets: ['websocket', 'websockets', 'socket.io'],
  OAuth: ['oauth', 'oauth2', 'openid connect', 'oidc', 'jwt'],
  Elasticsearch: ['elasticsearch', 'opensearch', 'elk'],
  DynamoDB: ['dynamodb'],
  Cassandra: ['cassandra'],
  Snowflake: ['snowflake'],
  BigQuery: ['bigquery'],
  Databricks: ['databricks'],
  dbt: ['dbt'],
  Hadoop: ['hadoop', 'hive', 'hdfs'],
  Looker: ['looker'],
  Firebase: ['firebase', 'firestore'],
  Supabase: ['supabase'],
  Nginx: ['nginx'],
  Helm: ['helm'],
  Ansible: ['ansible'],
  Prometheus: ['prometheus', 'grafana'],
  Datadog: ['datadog'],
  Serverless: ['serverless', 'aws lambda', 'lambda functions', 'cloud functions'],
  Microfrontends: ['micro frontends', 'microfrontends', 'module federation'],
  Selenium: ['selenium'],
  Cypress: ['cypress'],
  Playwright: ['playwright'],
  'Hugging Face': ['hugging face', 'huggingface', 'transformers library'],
  'Computer Vision': ['computer vision', 'opencv'],
  MLOps: ['mlops', 'mlflow', 'kubeflow'],
  SageMaker: ['sagemaker', 'vertex ai'],
  'Fine-tuning': ['fine-tuning', 'fine tuning', 'lora', 'peft'],
  'Vector Databases': ['vector database', 'pinecone', 'weaviate', 'pgvector', 'qdrant', 'faiss', 'chroma'],
  Figma: ['figma'],
  Jira: ['jira', 'confluence'],
  Salesforce: ['salesforce', 'apex'],
  SAP: ['sap', 's/4hana', 'abap'],
  Solidity: ['solidity', 'web3', 'ethereum'],
  'Product Management': ['product management', 'product roadmap', 'product strategy'],
  Accessibility: ['accessibility', 'wcag', 'a11y'],
  Security: ['application security', 'owasp', 'penetration testing', 'devsecops'],
};

const aliasIndex: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(SKILL_TAXONOMY)) {
    m.set(canonical.toLowerCase(), canonical);
    for (const a of aliases) m.set(a.toLowerCase(), canonical);
  }
  return m;
})();

export function normalizeSkill(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  return aliasIndex.get(key) ?? raw.trim();
}

export function normalizeSkills(raw: string[]): string[] {
  const seen = new Map<string, string>();
  for (const r of raw) {
    if (!r || !r.trim()) continue;
    const n = normalizeSkill(r);
    const k = n.toLowerCase();
    if (!seen.has(k)) seen.set(k, n);
  }
  return [...seen.values()];
}

export function skillKey(skill: string): string {
  return normalizeSkill(skill).toLowerCase();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/#]/g, '\\$&');
}

const aliasPatterns: Array<[RegExp, string]> = [...aliasIndex.entries()]
  .filter(([alias]) => alias.length > 2 || alias === 'go' || alias === 'c#')
  .map(([alias, canonical]) => [
    new RegExp(`(^|[^a-z0-9+#])${escapeRegex(alias)}(?=[^a-z0-9+#]|$)`, 'i'),
    canonical,
  ]);

/** Deterministic keyword scan, used as fallback and cross-check for LLM extraction. */
let lastText: string | null = null;
let lastResult: string[] = [];

export function extractKnownSkills(text: string): string[] {
  // Matching calls this with the same resume text for every job; memoize the last input.
  if (text === lastText) return lastResult;
  lastResult = extractKnownSkillsUncached(text);
  lastText = text;
  return lastResult;
}

function extractKnownSkillsUncached(text: string): string[] {
  const found = new Set<string>();
  for (const [re, canonical] of aliasPatterns) {
    if (re.test(text)) found.add(canonical);
  }
  return [...found];
}
