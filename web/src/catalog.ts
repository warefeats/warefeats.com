import { matchupField } from "./matchup";
import { namingPost } from "./posts";
import { runViews } from "./runs";
import { summarize } from "./metrics";
import type { Benchmark, BenchmarkCatalog, CatalogEntry, CatalogIndex } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const TEST_STATISTICS = new Set<string>(["mean", "median", "min", "max", "other"]);

/** The ids of a candidate list whose shape has already been checked. */
function candidateIds(candidates: unknown[]): Set<string> {
  return new Set(candidates.flatMap((candidate) => (isRecord(candidate) && typeof candidate.id === "string" ? [candidate.id] : [])));
}

/**
 * Checks a list of tests: each a record with an id and a results array; each result naming one of the given candidates
 * once, with a finite value; samples, when present, a non-empty array of finite numbers; the statistic one the contract
 * names. Shape only: whether a value is its statistic of its samples is sync's check, too costly for every page load.
 */
function parseTests(tests: unknown, ids: Set<string>, where: string): void {
  if (!Array.isArray(tests)) {
    throw new Error(`The tests of ${where} are invalid.`);
  }
  for (const test of tests) {
    if (!isRecord(test) || typeof test.id !== "string" || !Array.isArray(test.results)) {
      throw new Error(`A test in ${where} is invalid.`);
    }
    if (test.statistic !== undefined && (typeof test.statistic !== "string" || !TEST_STATISTICS.has(test.statistic))) {
      throw new Error(`Test ${test.id} in ${where} has an invalid statistic.`);
    }
    const seen = new Set<string>();
    for (const result of test.results) {
      if (!isRecord(result) || typeof result.candidateId !== "string" || typeof result.value !== "number" || !Number.isFinite(result.value)) {
        throw new Error(`Test ${test.id} in ${where} has an invalid result.`);
      }
      if (!ids.has(result.candidateId)) {
        throw new Error(`Test ${test.id} in ${where} has a result for ${result.candidateId}, which is not one of its candidates.`);
      }
      if (seen.has(result.candidateId)) {
        throw new Error(`Test ${test.id} in ${where} has two results for ${result.candidateId}.`);
      }
      seen.add(result.candidateId);
      if (result.samples !== undefined && (!Array.isArray(result.samples) || result.samples.length === 0 || result.samples.some((sample) => typeof sample !== "number" || !Number.isFinite(sample)))) {
        throw new Error(`Test ${test.id} in ${where} has invalid samples for ${result.candidateId}: expected a non-empty array of finite numbers.`);
      }
    }
  }
}

export function parseCatalog(value: unknown): BenchmarkCatalog {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.benchmarks) || !Array.isArray(value.queue)) {
    throw new Error("The benchmark catalog has an unsupported shape.");
  }

  for (const benchmark of value.benchmarks) {
    parseBenchmark(benchmark);
  }

  return value as unknown as BenchmarkCatalog;
}

/** Checks one benchmark: the catalog checks each entry this way, and a page checks the one it loads. */
export function parseBenchmark(benchmark: unknown): Benchmark {
  if (!isRecord(benchmark) || typeof benchmark.id !== "string" || typeof benchmark.title !== "string" || !Array.isArray(benchmark.candidates)) {
    throw new Error("A benchmark entry is incomplete.");
  }

  if (benchmark.run !== undefined && (!isRecord(benchmark.run) || typeof benchmark.run.id !== "string" || typeof benchmark.run.label !== "string")) {
    throw new Error(`Benchmark ${benchmark.id} has an invalid primary run.`);
  }

  if (benchmark.sectionSamples !== undefined && benchmark.sectionSamples !== "repeats") {
    throw new Error(`Benchmark ${benchmark.id} has an invalid sectionSamples.`);
  }

  const hasSections = Array.isArray(benchmark.sections) && benchmark.sections.length > 0;

  if (!hasSections && benchmark.candidates.length < 2) {
    throw new Error(`Benchmark ${benchmark.id} needs at least two candidates.`);
  }

  const runs = isRecord(benchmark.protocol) ? Number((benchmark.protocol as Record<string, unknown>).runs) : 0;

  for (const candidate of benchmark.candidates) {
    if (!isRecord(candidate) || typeof candidate.id !== "string" || !isRecord(candidate.statistics) || !Array.isArray(candidate.samplesMs)) {
      throw new Error(`Benchmark ${benchmark.id} contains an invalid candidate.`);
    }
    if (runs > 1 && candidate.samplesMs.length > 1 && new Set(candidate.samplesMs as number[]).size < 2) {
      throw new Error(`Candidate ${candidate.id} in ${benchmark.id} has ${candidate.samplesMs.length} samples but only 1 distinct value — samples look replicated, not independently measured.`);
    }
  }

  if (benchmark.tests !== undefined) {
    parseTests(benchmark.tests, candidateIds(benchmark.candidates), `benchmark ${benchmark.id}`);
  }

  if (hasSections) {
    for (const section of benchmark.sections as unknown[]) {
      if (!isRecord(section) || typeof section.id !== "string" || !Array.isArray(section.candidates)) {
        throw new Error(`Benchmark ${benchmark.id} has an invalid section.`);
      }
      if (section.candidates.length < 2) {
        throw new Error(`Section ${section.id} in ${benchmark.id} needs at least two candidates.`);
      }
      for (const candidate of section.candidates) {
        if (!isRecord(candidate) || typeof candidate.id !== "string" || !isRecord(candidate.statistics) || !Array.isArray(candidate.samplesMs)) {
          throw new Error(`Section ${section.id} in ${benchmark.id} contains an invalid candidate.`);
        }
        if (runs > 1 && (candidate.samplesMs as number[]).length > 1 && new Set(candidate.samplesMs as number[]).size < 2) {
          throw new Error(`Candidate ${candidate.id} in section ${section.id} of ${benchmark.id} has ${(candidate.samplesMs as number[]).length} samples but only 1 distinct value — samples look replicated, not independently measured.`);
        }
      }
      if (section.tests !== undefined) {
        parseTests(section.tests, candidateIds(section.candidates), `section ${section.id} of ${benchmark.id}`);
      }
    }
  }

  if (Array.isArray(benchmark.runs)) {
    for (const run of benchmark.runs) {
      if (!isRecord(run) || typeof run.id !== "string" || typeof run.label !== "string" || !isRecord(run.environment)) {
        throw new Error(`Benchmark ${benchmark.id} has an invalid run entry.`);
      }
      if (run.fleet !== undefined && run.fleet !== true) {
        throw new Error(`Run ${run.id} in ${benchmark.id} has an invalid fleet flag.`);
      }
      if (Array.isArray(run.sections)) {
        for (const section of run.sections as unknown[]) {
          if (!isRecord(section) || typeof section.id !== "string" || !Array.isArray(section.candidates) || section.candidates.length < 2) {
            throw new Error(`A run in ${benchmark.id} has an invalid section.`);
          }
          if (section.tests !== undefined) {
            parseTests(section.tests, candidateIds(section.candidates), `section ${section.id} of run ${run.id} in ${benchmark.id}`);
          }
        }
      }
      if (Array.isArray(run.candidates) && run.candidates.length > 0 && run.candidates.length < 2) {
        throw new Error(`A run in ${benchmark.id} needs at least two candidates.`);
      }
    }
  }

  // Pages are found by these two: a benchmark page by its slug, a post by its post (ADR 0004).
  if (typeof benchmark.slug !== "string" || typeof benchmark.post !== "string") {
    throw new Error(`Benchmark ${benchmark.id} has no slug or post.`);
  }

  if (benchmark.posts !== undefined) {
    if (!Array.isArray(benchmark.posts) || benchmark.posts.some((post) => !isRecord(post) || typeof post.slug !== "string" || typeof post.run !== "string" || typeof post.title !== "string")) {
      throw new Error(`Benchmark ${benchmark.id} has an invalid later post.`);
    }
  }

  return benchmark as unknown as Benchmark;
}

/** The catalog without samples, with each benchmark's summary worked out once at build time. */
export function toCatalogIndex(catalog: BenchmarkCatalog): CatalogIndex {
  return { schemaVersion: catalog.schemaVersion, generatedAt: catalog.generatedAt, benchmarks: catalog.benchmarks.map(toCatalogEntry), queue: catalog.queue };
}

function toCatalogEntry(benchmark: Benchmark): CatalogEntry {
  const summary = summarize(benchmark);
  const lead = summary.comparisons[0];
  const field = matchupField(benchmark);
  const named = namingPost(benchmark);

  return {
    id: benchmark.id,
    slug: benchmark.slug,
    post: benchmark.post,
    category: benchmark.category,
    title: benchmark.title,
    deck: benchmark.deck,
    publishedAt: benchmark.publishedAt,
    chip: benchmark.environment.chip,
    runs: benchmark.protocol.runs,
    verdictHeadline: benchmark.verdict.headline,
    page: { post: named.post, title: named.title },
    ...(lead ? { lead: { winner: { name: summary.winner.name, version: summary.winner.version }, other: { name: lead.other.name, version: lead.other.version }, ratio: lead.ratio, sigma: lead.sigma } } : {}),
    ...(field === undefined ? {} : { matchup: { candidates: field } }),
    ...(benchmark.posts?.length ? { posts: benchmark.posts.map((post) => ({ slug: post.slug, title: post.title, deck: post.deck, publishedAt: post.publishedAt, chip: runViews(benchmark).find((run) => run.id === post.run)?.environment.chip ?? benchmark.environment.chip })) } : {}),
  };
}

export function parseCatalogIndex(value: unknown): CatalogIndex {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.benchmarks) || !Array.isArray(value.queue)) {
    throw new Error("The benchmark catalog has an unsupported shape.");
  }

  for (const entry of value.benchmarks) {
    if (!isRecord(entry) || typeof entry.slug !== "string" || typeof entry.post !== "string" || typeof entry.title !== "string" || typeof entry.category !== "string" || typeof entry.publishedAt !== "string") {
      throw new Error("A benchmark entry is incomplete.");
    }
  }

  return value as unknown as CatalogIndex;
}
