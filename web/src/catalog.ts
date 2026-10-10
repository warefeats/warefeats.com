import { summarize } from "./metrics";
import type { Benchmark, BenchmarkCatalog, CatalogEntry, CatalogIndex } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
    }
  }

  if (Array.isArray(benchmark.runs)) {
    for (const run of benchmark.runs) {
      if (!isRecord(run) || typeof run.id !== "string" || typeof run.label !== "string" || !isRecord(run.environment)) {
        throw new Error(`Benchmark ${benchmark.id} has an invalid run entry.`);
      }
      if (Array.isArray(run.sections)) {
        for (const section of run.sections as unknown[]) {
          if (!isRecord(section) || typeof section.id !== "string" || !Array.isArray(section.candidates) || section.candidates.length < 2) {
            throw new Error(`A run in ${benchmark.id} has an invalid section.`);
          }
        }
      }
      if (Array.isArray(run.candidates) && run.candidates.length > 0 && run.candidates.length < 2) {
        throw new Error(`A run in ${benchmark.id} needs at least two candidates.`);
      }
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

  return {
    id: benchmark.id,
    slug: benchmark.slug,
    category: benchmark.category,
    title: benchmark.title,
    deck: benchmark.deck,
    publishedAt: benchmark.publishedAt,
    chip: benchmark.environment.chip,
    runs: benchmark.protocol.runs,
    verdictHeadline: benchmark.verdict.headline,
    ...(lead ? { lead: { winner: { name: summary.winner.name, version: summary.winner.version }, other: { name: lead.other.name, version: lead.other.version }, ratio: lead.ratio, sigma: lead.sigma } } : {}),
  };
}

export function parseCatalogIndex(value: unknown): CatalogIndex {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.benchmarks) || !Array.isArray(value.queue)) {
    throw new Error("The benchmark catalog has an unsupported shape.");
  }

  for (const entry of value.benchmarks) {
    if (!isRecord(entry) || typeof entry.slug !== "string" || typeof entry.title !== "string" || typeof entry.category !== "string" || typeof entry.publishedAt !== "string") {
      throw new Error("A benchmark entry is incomplete.");
    }
  }

  return value as unknown as CatalogIndex;
}
