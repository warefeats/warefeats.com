import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseCatalog } from "../src/catalog";
import type { Benchmark, BenchmarkRun, BenchmarkSection, Candidate, Post } from "../src/types";

export interface RegistryEntry {
  slug: string;
  repo: string;
  ref: string;
}

interface Registry {
  schemaVersion: number;
  benchmarks: RegistryEntry[];
}

export interface RunnerBenchmark {
  schemaVersion: number;
  id: string;
  /** The benchmark's category of tools, its runner's name, which its page's URL carries. */
  slug: string;
  /** Its post's URL slug: the primary run's date, then the slug, then the products it compares. */
  post: string;
  category: string;
  title: string;
  deck: string;
  unit: "ms";
  lowerIsBetter: boolean;
  sectionSamples?: Benchmark["sectionSamples"];
  verdict: Benchmark["verdict"];
  corpus?: Benchmark["corpus"];
  ruleMap?: Benchmark["ruleMap"];
  limitations: string[];
  trademarks?: string[];
  runs: string[];
  /** Fleet runs the site shows on the matchup, newest first. The runner keeps this list; the site shows exactly what it lists. */
  fleetRuns?: string[];
  /** Posts written after the first, as files under posts/ (ADR 0005). */
  posts?: string[];
}

/** A later post's file in its runner repository. */
export interface PostFile extends Post {
  schemaVersion: number;
}

export interface RunFile {
  schemaVersion: number;
  id: string;
  label: string;
  publishedAt: string;
  environment: Benchmark["environment"];
  protocol: Benchmark["protocol"];
  candidates?: Candidate[];
  sections?: BenchmarkSection[];
}

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RUN_PATH_PATTERN = /^runs\/[A-Za-z0-9._-]+\.json$/;
const POST_PATH_PATTERN = /^posts\/[a-z0-9-]+\.json$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The most fleet runs a benchmark may list. Retention is the runner's call; this bounds what a page carries. */
export const FLEET_RUN_LIMIT = 4;

export function validateRef(ref: string): void {
  if (!SHA_PATTERN.test(ref)) throw new Error(`Invalid ref "${ref}" — expected a 40-character hex SHA`);
}

export function validateRunPath(path: string): void {
  if (!RUN_PATH_PATTERN.test(path)) throw new Error(`Invalid run path "${path}" — must match runs/<name>.json`);
}

/** Checks a benchmark's URL slugs: its own names a category in lowercase words, and its post's starts with its date and that slug, then names the products. */
export function validateSlugs(slug: string, post: string, publishedAt: string): void {
  if (!SLUG_PATTERN.test(slug)) throw new Error(`Invalid slug "${slug}" — expected lowercase words joined by hyphens`);
  const prefix = `${publishedAt}-${slug}-`;
  if (typeof post !== "string" || !post.startsWith(prefix) || !SLUG_PATTERN.test(post.slice(prefix.length))) {
    throw new Error(`Invalid post "${post}" for ${slug} — expected ${prefix}<products>, lowercase words joined by hyphens`);
  }
}

/**
 * Checks a later post against the runs it can tell: a dated slug, a run the benchmark has and no older than the post, at
 * least two of that run's candidates, a verdict for one of them, and a headline for every section the post shows.
 */
export function validatePost(slug: string, post: Post, runs: RunFile[]): void {
  const fail = (problem: string) => {
    throw new Error(`Post ${post.slug} of ${slug} ${problem}`);
  };
  if (typeof post.publishedAt !== "string" || !DATE_PATTERN.test(post.publishedAt)) fail("needs a publishedAt date, YYYY-MM-DD");
  validateSlugs(slug, post.slug, post.publishedAt);
  for (const field of ["title", "deck"] as const) {
    if (typeof post[field] !== "string" || post[field].length === 0) fail(`needs a ${field}`);
  }
  if (!Array.isArray(post.limitations)) fail("needs a limitations list");
  const run = runs.find((candidate) => candidate.id === post.run);
  if (!run) return fail(`names run ${post.run}, which the benchmark doesn't list`);
  if (post.publishedAt < run.publishedAt) fail(`is dated before its run (${run.publishedAt})`);
  const ran = new Set([...(run.candidates ?? []), ...(run.sections ?? []).flatMap((section) => section.candidates)].map((candidate) => candidate.id));
  const kept = post.candidates ?? [...ran];
  if (post.candidates !== undefined && (!Array.isArray(post.candidates) || post.candidates.some((id) => !ran.has(id)))) fail(`locks in a candidate run ${run.id} doesn't have`);
  if (kept.length < 2) fail("needs at least two candidates");
  if (!post.verdict || typeof post.verdict.headline !== "string" || !kept.includes(post.verdict.winnerId)) fail("needs a verdict whose winner is one of its candidates");
  const shown = (run.sections ?? []).filter((section) => section.candidates.filter((candidate) => kept.includes(candidate.id)).length >= 2).map((section) => section.id);
  const written = Object.keys(post.sections ?? {});
  for (const id of shown) {
    if (typeof post.sections?.[id] !== "string") fail(`needs a verdict headline for section ${id}`);
  }
  for (const id of written) {
    if (!shown.includes(id)) fail(`has a headline for section ${id}, which it doesn't show`);
  }
}

/** Checks a runner's run lists: at least one authored run, at most four fleet runs, every path valid and listed once. */
export function validateRunLists(slug: string, meta: Pick<RunnerBenchmark, "runs" | "fleetRuns">): void {
  if (meta.runs.length === 0) {
    throw new Error(`Benchmark ${slug} has no runs — benchmark.json must list at least one run file`);
  }

  const fleetRuns = meta.fleetRuns ?? [];
  if (!Array.isArray(fleetRuns)) {
    throw new Error(`Benchmark ${slug} has an invalid fleetRuns list — expected an array of run paths`);
  }

  if (fleetRuns.length > FLEET_RUN_LIMIT) {
    throw new Error(`Benchmark ${slug} lists ${fleetRuns.length} fleet runs — the site shows at most ${FLEET_RUN_LIMIT}; trim fleetRuns in benchmark.json`);
  }

  const seen = new Set<string>();
  for (const runPath of [...meta.runs, ...fleetRuns]) {
    validateRunPath(runPath);
    if (seen.has(runPath)) {
      throw new Error(`Benchmark ${slug} lists ${runPath} twice`);
    }
    seen.add(runPath);
  }
}

function toBenchmarkRun(run: RunFile, fleet: boolean): BenchmarkRun {
  return {
    id: run.id,
    label: run.label,
    ...(fleet ? { fleet: true as const } : {}),
    environment: run.environment,
    protocol: run.protocol,
    publishedAt: run.publishedAt,
    ...(run.sections ? { sections: run.sections } : {}),
    ...((run.candidates?.length ?? 0) > 0 ? { candidates: run.candidates } : {}),
  };
}

/**
 * One benchmark as the site stores it: the primary authored run merged into the page shape, then every other authored
 * run, then the fleet runs in the runner's order. Run files may carry fields the site doesn't read (a fleet run's
 * provenance and lineup); only the page shape is kept.
 */
export function buildBenchmark(entry: RegistryEntry, meta: RunnerBenchmark, runs: RunFile[], fleetRuns: RunFile[] = [], posts: PostFile[] = []): Benchmark {
  const primary = runs[0];
  if (!primary) {
    throw new Error(`Benchmark ${entry.slug} has no runs`);
  }

  const ids = new Set<string>();
  for (const run of [...runs, ...fleetRuns]) {
    if (ids.has(run.id)) {
      throw new Error(`Benchmark ${entry.slug} has two runs with the id ${run.id}`);
    }
    ids.add(run.id);
  }

  validateSlugs(meta.slug, meta.post, primary.publishedAt);

  const benchmark: Benchmark = {
    id: meta.id,
    slug: meta.slug,
    post: meta.post,
    category: meta.category,
    title: meta.title,
    deck: meta.deck,
    publishedAt: primary.publishedAt,
    run: { id: primary.id, label: primary.label },
    unit: meta.unit,
    lowerIsBetter: meta.lowerIsBetter,
    ...(meta.sectionSamples ? { sectionSamples: meta.sectionSamples } : {}),
    verdict: meta.verdict,
    ...(meta.corpus ? { corpus: meta.corpus } : {}),
    environment: primary.environment,
    protocol: primary.protocol,
    ...(meta.ruleMap ? { ruleMap: meta.ruleMap } : {}),
    candidates: primary.candidates ?? [],
    ...(primary.sections ? { sections: primary.sections } : {}),
    limitations: meta.limitations,
    ...(meta.trademarks ? { trademarks: meta.trademarks } : {}),
    runnerUrl: `https://github.com/${entry.repo}`,
  };

  const others = [...runs.slice(1).map((run) => toBenchmarkRun(run, false)), ...fleetRuns.map((run) => toBenchmarkRun(run, true))];
  if (others.length > 0) {
    benchmark.runs = others;
  }

  const slugs = new Set([meta.post]);
  for (const post of posts) {
    validatePost(meta.slug, post, [...runs, ...fleetRuns]);
    if (slugs.has(post.slug)) {
      throw new Error(`Benchmark ${meta.slug} has two posts with the slug ${post.slug}`);
    }
    slugs.add(post.slug);
  }
  if (posts.length > 0) {
    benchmark.posts = posts.map(({ schemaVersion: _schemaVersion, ...post }) => post);
  }

  return benchmark;
}

async function fetchRaw(repo: string, ref: string, path: string): Promise<unknown> {
  const url = `https://raw.githubusercontent.com/${repo}/${ref}/${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.json();
}

async function sync(): Promise<void> {
  const root = join(import.meta.dir, "..");
  const registry: Registry = JSON.parse(await readFile(join(root, "data", "registry.json"), "utf8"));
  const cacheDir = join(root, "data", "cache");
  await mkdir(cacheDir, { recursive: true });

  const buffered: { path: string; content: string }[] = [];
  const manifest: Record<string, { repo: string; ref: string }> = {};

  for (const entry of registry.benchmarks) {
    validateRef(entry.ref);

    const meta = (await fetchRaw(entry.repo, entry.ref, "benchmark.json")) as RunnerBenchmark;

    if (meta.slug !== entry.slug) {
      throw new Error(`Slug mismatch for ${entry.slug}: registry says "${entry.slug}" but benchmark.json says "${meta.slug}"`);
    }

    validateRunLists(entry.slug, meta);

    const runs: RunFile[] = [];
    for (const runPath of meta.runs) {
      runs.push((await fetchRaw(entry.repo, entry.ref, runPath)) as RunFile);
    }

    const fleetRuns: RunFile[] = [];
    for (const runPath of meta.fleetRuns ?? []) {
      fleetRuns.push((await fetchRaw(entry.repo, entry.ref, runPath)) as RunFile);
    }

    const posts: PostFile[] = [];
    for (const postPath of meta.posts ?? []) {
      if (!POST_PATH_PATTERN.test(postPath)) throw new Error(`Invalid post path "${postPath}" — must match posts/<slug>.json`);
      posts.push((await fetchRaw(entry.repo, entry.ref, postPath)) as PostFile);
    }

    const benchmark = buildBenchmark(entry, meta, runs, fleetRuns, posts);

    parseCatalog({ schemaVersion: 1, generatedAt: new Date().toISOString(), benchmarks: [benchmark], queue: [] });

    buffered.push({ path: join(cacheDir, `${entry.slug}.json`), content: JSON.stringify(benchmark, null, 2) + "\n" });
    manifest[entry.slug] = { repo: entry.repo, ref: entry.ref };
    console.log(`  ${entry.slug} ← ${entry.repo}@${entry.ref.slice(0, 7)}`);
  }

  buffered.push({ path: join(cacheDir, "manifest.json"), content: JSON.stringify(manifest, null, 2) + "\n" });

  for (const file of buffered) {
    await writeFile(file.path, file.content);
  }

  console.log(`Synced ${Object.keys(manifest).length} benchmarks`);
}

if (import.meta.main) {
  await sync();
}
