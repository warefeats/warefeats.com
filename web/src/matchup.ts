import { formatVersion } from "./metrics";
import { runViews } from "./runs";
import type { RunView } from "./runs";
import type { Benchmark, BenchmarkSection, BenchmarkTest, Candidate } from "./types";

/** A matchup needs a field worth picking from: three or more candidates in one run. */
export const MATCHUP_FIELD = 3;

/** Every candidate in a run, once each, in the order its run file first lists them. */
export function candidateUniverse(run: RunView): Candidate[] {
  const seen = new Map<string, Candidate>();
  for (const candidate of [...run.candidates, ...(run.sections ?? []).flatMap((section) => section.candidates)]) {
    if (!seen.has(candidate.id)) {
      seen.set(candidate.id, candidate);
    }
  }
  return [...seen.values()];
}

/** The size of the largest field among a benchmark's runs, or undefined when no run has enough candidates for a matchup. */
export function matchupField(benchmark: Benchmark): number | undefined {
  const largest = Math.max(...runViews(benchmark).map((run) => candidateUniverse(run).length));
  return largest >= MATCHUP_FIELD ? largest : undefined;
}

/** The candidates a reader has picked, in run order. */
export interface Pick {
  ids: string[];
  /** Every candidate in the run is picked. */
  full: boolean;
  /** The URL named fewer than two of this run's candidates, so the page shows all of them. */
  ignored: boolean;
}

/** Reads a `pick` parameter against a run's candidates. Unknown ids drop out; fewer than two left means the whole field. */
export function readPick(param: string | null, universe: Candidate[]): Pick {
  const all = universe.map((candidate) => candidate.id);
  if (param === null) {
    return { ids: all, full: true, ignored: false };
  }

  const named = new Set(param.split(",").map((id) => id.trim()));
  const ids = all.filter((id) => named.has(id));
  if (ids.length < 2) {
    return { ids: all, full: true, ignored: true };
  }

  return { ids, full: ids.length === all.length, ignored: false };
}

/** The `pick` parameter for a set of ids, in run order, or null for the whole field. */
export function pickParam(ids: string[], universe: Candidate[]): string | null {
  const picked = new Set(ids);
  const ordered = universe.map((candidate) => candidate.id).filter((id) => picked.has(id));
  return ordered.length === universe.length ? null : ordered.join(",");
}

function pickTest(test: BenchmarkTest, picked: Set<string>): BenchmarkTest {
  return { ...test, results: test.results.filter((result) => picked.has(result.candidateId)) };
}

/** The sections narrowed to the pick. A section, or a test inside one, needs two picked candidates to stay. */
export function applyPick(sections: BenchmarkSection[], ids: string[]): { sections: BenchmarkSection[]; omitted: BenchmarkSection[] } {
  const picked = new Set(ids);
  const kept: BenchmarkSection[] = [];
  const omitted: BenchmarkSection[] = [];

  for (const section of sections) {
    const candidates = section.candidates.filter((candidate) => picked.has(candidate.id));
    if (candidates.length < 2) {
      omitted.push(section);
      continue;
    }

    const tests = section.tests?.map((test) => pickTest(test, picked)).filter((test) => test.results.length >= 2);
    kept.push({ ...section, candidates, ...(tests ? { tests } : {}) });
  }

  return { sections: kept, omitted };
}

/**
 * A benchmark without sections narrowed to the pick, using the run's own candidates and tests. No authored verdict
 * carries over: the winner is the picked candidate that leads on both the mean and the median, which the report and the
 * box plot each print, so the mark never sits beside a number that contradicts it. When they disagree, nothing is marked.
 */
export function pickFlat(benchmark: Benchmark, run: RunView, ids: string[]): Benchmark {
  const picked = new Set(ids);
  const candidates = run.candidates.filter((candidate) => picked.has(candidate.id));
  const better = (a: number, b: number) => (benchmark.lowerIsBetter ? a < b : a > b);
  const leader = (statistic: "meanMs" | "medianMs") => candidates.reduce<Candidate | undefined>((best, candidate) => (best === undefined || better(candidate.statistics[statistic], best.statistics[statistic]) ? candidate : best), undefined);
  const byMean = leader("meanMs");
  const tests = run.tests?.map((test) => pickTest(test, picked)).filter((test) => test.results.length >= 2) ?? [];

  return {
    ...benchmark,
    environment: run.environment,
    protocol: run.protocol,
    candidates,
    tests,
    verdict: { ...benchmark.verdict, winnerId: byMean !== undefined && byMean === leader("medianMs") ? byMean.id : "" },
  };
}

/** The page heading: the benchmark's own title for the whole field, the picked names otherwise. */
export function matchupHeading(pick: Pick, universe: Candidate[], title: string): string {
  if (pick.full) {
    return title;
  }

  const picked = new Set(pick.ids);
  return universe.filter((candidate) => picked.has(candidate.id)).map((candidate) => candidate.name).join(" vs ");
}

/** A candidate's version as the picker shows it, or undefined when its name already carries the version. */
export function pickerVersion(candidate: Candidate): string | undefined {
  return candidate.name.includes(candidate.version) ? undefined : formatVersion(candidate.version);
}
