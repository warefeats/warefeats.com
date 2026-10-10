import type { Benchmark, BenchmarkSection, BenchmarkTest, Candidate } from "./types";

/** One run of a benchmark as a page shows it: its rig, its protocol, and the samples it produced. */
export interface RunView {
  id: string;
  label: string;
  environment: Benchmark["environment"];
  protocol: Benchmark["protocol"];
  publishedAt: string;
  sections?: BenchmarkSection[];
  candidates: Candidate[];
  /** Charted tests of a benchmark without sections. Run files carry them for the primary run only. */
  tests?: BenchmarkTest[];
}

/** Every run of a benchmark, the primary first. */
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
      environment: run.environment,
      protocol: run.protocol,
      publishedAt: run.publishedAt,
      ...(sections ? { sections } : {}),
      candidates: run.candidates ?? benchmark.candidates,
    };
  });
  return [primary, ...others];
}
