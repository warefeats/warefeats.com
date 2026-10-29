export interface BenchmarkCatalog {
  schemaVersion: number;
  generatedAt: string;
  benchmarks: Benchmark[];
  queue: QueueItem[];
}

/** The catalog without samples: enough to list, link and title every benchmark. Every page embeds it. */
export interface CatalogIndex {
  schemaVersion: number;
  generatedAt: string;
  benchmarks: CatalogEntry[];
  queue: QueueItem[];
}

export interface CatalogEntry {
  id: string;
  slug: string;
  /** The URL slug of the benchmark's post: its date, the benchmark's slug, and the products it compares (ADR 0004). */
  post: string;
  category: string;
  title: string;
  deck: string;
  publishedAt: string;
  /** The primary run's chip and measured pass count, for the home page's rig column. */
  chip: string;
  runs: number;
  verdictHeadline: string;
  /** The hyperfine summary of a benchmark without sections: the winner against its closest rival. */
  lead?: CatalogLead;
  /** The benchmark's later posts, each with its own page and its own place on the timeline (ADR 0005). */
  posts?: CatalogPost[];
  /** Present when the benchmark has a matchup: the number of candidates a reader can pick from. */
  matchup?: { candidates: number };
  /** The post the benchmark's page is named for and points its canonical URL at: the newest telling its run's whole lineup, else the first (ADR 0006). */
  page?: { post: string; title: string };
}

/** A later post as the timeline lists it. */
export interface CatalogPost {
  slug: string;
  title: string;
  deck: string;
  publishedAt: string;
  /** The chip of the rig its run came from. */
  chip: string;
}

export interface CatalogLead {
  winner: { name: string; version: string };
  other: { name: string; version: string };
  ratio: number;
  sigma: number;
}

export interface Benchmark {
  id: string;
  /** The benchmark's category of tools, its runner's name: the page at /benchmarks/<slug>/ (ADR 0004). */
  slug: string;
  /** The URL slug of its post, /posts/<post>/: the post's date, the benchmark's slug, and the products it compares. */
  post: string;
  category: string;
  title: string;
  deck: string;
  publishedAt: string;
  /** The primary run's id and label, as its run file names them. */
  run?: { id: string; label: string };
  unit: "ms";
  lowerIsBetter: boolean;
  /**
   * "repeats" when each section's samples are one value per pass of its headline measure, so their spread is run-to-run
   * noise and the scorecard can leave a lead inside it unmarked. Absent when a section's samples pool its tests.
   */
  sectionSamples?: "repeats";
  verdict: {
    winnerId: string;
    headline: string;
    summary: string;
  };
  corpus?: {
    name: string;
    source: string;
    files: number;
    lines: number;
    bytes: number;
  };
  environment: {
    machine: string;
    chip: string;
    cores: string;
    memory: string;
    os: string;
    arch: string;
    runtime: string;
    /** GPU model and driver, for workloads that render in a browser on a GPU. */
    gpu?: string;
    /** Browser build and rendering backend, for workloads that render in a browser. */
    browser?: string;
    /** Viewport, scale factor, and whether a physical display was attached. */
    display?: string;
  };
  protocol: {
    warmups: number;
    runs: number;
    processModel: string;
    cacheState: string;
    output: string;
  };
  ruleMap?: RuleMapping[];
  candidates: Candidate[];
  /** Individual tests, each charted on its own. Absent entries derive four from the timing statistics. */
  tests?: BenchmarkTest[];
  /** Titled sub-benchmarks, each with its own candidates and charts. When present, top-level candidates may be empty. */
  sections?: BenchmarkSection[];
  /** The benchmark's other runs: authored runs first, then fleet runs, newest first. The page toggles among authored runs only. */
  runs?: BenchmarkRun[];
  /** Posts written after the first, each telling one story from one run (ADR 0005). The first post is this benchmark's own prose. */
  posts?: Post[];
  limitations: string[];
  /** Logo and trademark notices for the products under test, shown under the limitations. */
  trademarks?: string[];
  runnerUrl?: string;
}

/**
 * A later post: a story told against one run of the benchmark, authored or fleet, and the candidates it locks in. Its
 * prose replaces the benchmark's own on its page; its numbers are that run's, narrowed to those candidates (ADR 0005).
 */
export interface Post {
  /** Its URL slug: its date, the benchmark's slug, and the products it compares (ADR 0004). */
  slug: string;
  publishedAt: string;
  /** The id of the run it tells the story of. */
  run: string;
  /** The candidates it locks in, by id; every candidate in the run when absent. */
  candidates?: string[];
  title: string;
  deck: string;
  verdict: Benchmark["verdict"];
  /** One verdict headline per section the post shows, by section id. */
  sections?: Record<string, string>;
  limitations: string[];
}

export interface BenchmarkRun {
  id: string;
  label: string;
  /** A fleet run: published numbers with no verdict, shown on the matchup and never on the benchmark page (ADR 0002). */
  fleet?: true;
  environment: Benchmark["environment"];
  protocol: Benchmark["protocol"];
  publishedAt: string;
  sections?: BenchmarkSection[];
  candidates?: Candidate[];
}

export interface BenchmarkSection {
  id: string;
  title: string;
  deck: string;
  unit: string;
  lowerIsBetter: boolean;
  verdict: {
    winnerId: string;
    headline: string;
    summary: string;
  };
  candidates: Candidate[];
  tests?: BenchmarkTest[];
}

/** One charted test in the barefeats sense: a title, what was measured, and one value per candidate. */
export interface BenchmarkTest {
  id: string;
  title: string;
  description: string;
  unit: string;
  lowerIsBetter: boolean;
  results: TestResult[];
}

export interface TestResult {
  candidateId: string;
  value: number;
}

/** One matched intent; every other key is a candidate id mapped to that candidate's rule name. */
export interface RuleMapping {
  intent: string;
  [candidateId: string]: string;
}

export interface Candidate {
  id: string;
  name: string;
  version: string;
  /** Site-relative path to the product's logo, self-hosted under public/logos. */
  logo?: string;
  /** The product's brand color as a hex string; charts mix it per theme for contrast. */
  color?: string;
  homepage?: string;
  statistics: Statistics;
  samplesMs: number[];
  configuration?: {
    engine: string;
    topology: "plaintext" | "tls-inprocess" | "proxyv2-haproxy";
    workload: "hit-path-rps" | "segment-serve" | "segment-serve-range" | "miss-storm" | "origin-flap";
    targetRps?: number;
    concurrency?: number;
  };
  metrics?: Record<string, { value: number; unit: string; label?: string }>;
}

export interface Statistics {
  medianMs: number;
  meanMs: number;
  minMs: number;
  maxMs: number;
}

export type StatisticKey = keyof Statistics;

export interface QueueItem {
  category: string;
  title: string;
  question: string;
  status: "Planned" | "Running" | "Published";
}
