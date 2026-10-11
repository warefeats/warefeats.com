import type { Benchmark, BenchmarkSection, BenchmarkTest, Candidate } from "./types";

/** One run of a benchmark as a page shows it: its rig, its protocol, and the samples it produced. */
export interface RunView {
  id: string;
  label: string;
  /** A fleet run: no verdict, shown only on the matchup (ADR 0002). */
  fleet?: true;
  environment: Benchmark["environment"];
  protocol: Benchmark["protocol"];
  publishedAt: string;
  sections?: BenchmarkSection[];
  candidates: Candidate[];
  /** Charted tests of a benchmark without sections. Run files carry them for the primary run only. */
  tests?: BenchmarkTest[];
}

/** Every run of a benchmark, the primary first, then the other authored runs, then the fleet runs. */
export function runViews(benchmark: Benchmark): RunView[] {
  const primary: RunView = {
    id: benchmark.run?.id ?? "primary",
    label: benchmark.run?.label ?? benchmark.environment.machine,
    environment: benchmark.environment,
    protocol: benchmark.protocol,
    publishedAt: benchmark.publishedAt,
    ...(benchmark.sections ? { sections: benchmark.sections } : {}),
    candidates: benchmark.candidates,
    ...(benchmark.tests ? { tests: benchmark.tests } : {}),
  };
  const others = (benchmark.runs ?? []).map((run): RunView => {
    const sections = run.sections ?? benchmark.sections;
    return {
      id: run.id,
      label: run.label,
      ...(run.fleet ? { fleet: true as const } : {}),
      environment: run.environment,
      protocol: run.protocol,
      publishedAt: run.publishedAt,
      ...(sections ? { sections } : {}),
      candidates: run.candidates ?? benchmark.candidates,
    };
  });
  return [primary, ...others];
}

/** A run's label without the date a fleet run's label ends with, for prose that prints the date itself. */
export function rigLabel(run: RunView): string {
  const suffix = `, ${run.publishedAt}`;
  return run.label.endsWith(suffix) ? run.label.slice(0, -suffix.length) : run.label;
}

/**
 * The run with the latest date. On a tie a fleet run beats an authored one; otherwise the earlier entry wins, which keeps
 * the primary ahead of other authored runs and the runner's newest-first order among fleet runs.
 */
export function newestRun(runs: RunView[]): RunView {
  let newest = runs[0]!;
  for (const run of runs.slice(1)) {
    if (run.publishedAt > newest.publishedAt || (run.publishedAt === newest.publishedAt && run.fleet && !newest.fleet)) {
      newest = run;
    }
  }
  return newest;
}

/** Where a run is drawn: the benchmark page, under the post's verdict, or its matchup, which has none. */
export type RunScope = "post" | "matchup";

/** The runs a page offers and the one it shows without `?run=`: authored runs and the primary on a post, every run and the newest on a matchup. */
export function runChoices(benchmark: Benchmark, scope: RunScope): { runs: RunView[]; fallback: RunView } {
  const all = runViews(benchmark);
  if (scope === "post") {
    return { runs: all.filter((run) => !run.fleet), fallback: all[0]! };
  }
  return { runs: all, fallback: newestRun(all) };
}

/** The run a page shows for a `?run=` value: the named run when the page offers it, the fallback otherwise. */
export function activeRun(choices: { runs: RunView[]; fallback: RunView }, requested: string | null): RunView {
  return choices.runs.find((run) => run.id === requested) ?? choices.fallback;
}
