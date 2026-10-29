import type { Benchmark, BenchmarkSection, BenchmarkTest, Candidate } from "./types";

export function formatDuration(value: number, unit = "ms"): string {
  if (unit === "ms" && value >= 1000) {
    return `${(value / 1000).toFixed(3)} s`;
  }

  return `${value.toFixed(1)} ${unit}`;
}

export function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(2)} MB`;
  }

  return `${(bytes / 1_000).toFixed(1)} kB`;
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(iso));
}

/** Sample standard deviation, as hyperfine reports σ. */
export function standardDeviation(samples: number[]): number {
  if (samples.length < 2) {
    return 0;
  }

  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const variance = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (samples.length - 1);
  return Math.sqrt(variance);
}

export interface Comparison {
  other: Candidate;
  ratio: number;
  sigma: number;
}

export interface Summary {
  winner: Candidate;
  comparisons: Comparison[];
}

/**
 * The hyperfine summary: how many times faster the winner ran than each other candidate,
 * with the propagated uncertainty ratio * sqrt((σa/μa)² + (σb/μb)²).
 */
export function summarize(benchmark: Benchmark): Summary {
  if (benchmark.candidates.length === 0) {
    return { winner: { id: "", name: "", version: "", statistics: { medianMs: 0, meanMs: 0, minMs: 0, maxMs: 0 }, samplesMs: [] }, comparisons: [] };
  }

  const winner = benchmark.candidates.find((candidate) => candidate.id === benchmark.verdict.winnerId) ?? benchmark.candidates[0];

  if (!winner) {
    throw new Error(`Benchmark ${benchmark.id} has no candidates.`);
  }

  const winnerMean = winner.statistics.meanMs;
  const winnerSigma = standardDeviation(winner.samplesMs);

  const comparisons = benchmark.candidates
    .filter((candidate) => candidate.id !== winner.id)
    .map((other) => {
      const otherMean = other.statistics.meanMs;
      const otherSigma = standardDeviation(other.samplesMs);
      const ratio = benchmark.lowerIsBetter ? otherMean / winnerMean : winnerMean / otherMean;
      const sigma = ratio * Math.sqrt((winnerSigma / winnerMean) ** 2 + (otherSigma / otherMean) ** 2);
      return { other, ratio, sigma };
    })
    .sort((a, b) => a.ratio - b.ratio);

  return { winner, comparisons };
}

export function formatRatio(comparison: Pick<Comparison, "ratio" | "sigma">): string {
  return `${comparison.ratio.toFixed(2)} ± ${comparison.sigma.toFixed(2)}`;
}

export function samplePosition(value: number, min: number, max: number): number {
  if (min === max) {
    return 50;
  }

  return ((value - min) / (max - min)) * 100;
}

/** Shared axis bounds across every candidate so the gap between tools is visible. */
export function sampleRange(benchmark: Benchmark): { min: number; max: number } {
  const all = benchmark.candidates.flatMap((candidate) => candidate.samplesMs);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const pad = (max - min) * 0.06 || 1;
  return { min: min - pad, max: max + pad };
}

/** Evenly spaced axis ticks rounded to a friendly step. */
export function axisTicks(min: number, max: number, count = 5): number[] {
  const rawStep = (max - min) / (count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const candidates = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude);
  const step = candidates.find((value) => value >= rawStep) ?? candidates[candidates.length - 1]!;
  const first = Math.ceil(min / step) * step;
  const ticks: number[] = [];

  for (let tick = first; tick <= max + step * 0.001; tick += step) {
    ticks.push(Number(tick.toFixed(6)));
  }

  return ticks;
}

/** The report as hyperfine prints it, for the clipboard. */
/** The report as hyperfine prints it. A matchup leaves out the summary sentence, which names a winner (ADR 0001). */
export function reportText(benchmark: Benchmark, { summary: withSummary = true }: { summary?: boolean } = {}): string {
  const lines: string[] = [];

  benchmark.candidates.forEach((candidate, index) => {
    const sigma = standardDeviation(candidate.samplesMs);
    lines.push(`Benchmark ${index + 1}: ${candidate.name} ${candidate.version}`);
    lines.push(`  Time (mean ± σ):     ${formatDuration(candidate.statistics.meanMs).padStart(10)} ± ${formatDuration(sigma).padStart(8)}`);
    lines.push(`  Range (min … max):   ${formatDuration(candidate.statistics.minMs).padStart(10)} … ${formatDuration(candidate.statistics.maxMs).padStart(8)}    ${candidate.samplesMs.length} runs`);
    lines.push("");
  });

  if (withSummary) {
    const summary = summarize(benchmark);
    lines.push("Summary");
    lines.push(`  ${summary.winner.name} ${summary.winner.version} ran`);
    for (const comparison of summary.comparisons) {
      lines.push(`    ${formatRatio(comparison)} times faster than ${comparison.other.name} ${comparison.other.version}`);
    }
    lines.push("");
  }
  lines.push(`Rig: ${benchmark.environment.machine}, ${benchmark.environment.chip}, ${benchmark.environment.memory}, ${benchmark.environment.os}`);
  lines.push(`Source: https://warefeats.com/posts/${benchmark.post}/`);

  return lines.join("\n");
}

/** The tests a benchmark charts as bar graphs. A run with only its timing distribution charts a box plot instead. */
export function benchmarkTests(benchmark: Benchmark): BenchmarkTest[] {
  return benchmark.tests ?? [];
}

export interface FiveNumber {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
}

/** Five-number summary with quartiles by linear interpolation (the R-7 / NumPy default). */
export function fiveNumber(samples: number[]): FiveNumber {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (p: number): number => {
    if (sorted.length === 0) {
      return 0;
    }
    const position = (sorted.length - 1) * p;
    const low = Math.floor(position);
    const high = Math.ceil(position);
    const weight = position - low;
    return sorted[low]! * (1 - weight) + sorted[high]! * weight;
  };

  return { min: at(0), q1: at(0.25), median: at(0.5), q3: at(0.75), max: at(1) };
}

export function testWinner(test: BenchmarkTest): string | undefined {
  const sorted = [...test.results].sort((a, b) => (test.lowerIsBetter ? a.value - b.value : b.value - a.value));
  return sorted[0]?.candidateId;
}

/** "v1.16.0" for a release number; anything else, like "stable" or a commit, as written. */
export function formatVersion(version: string): string {
  return /^\d+(\.\d+)+([-+].*)?$/.test(version) ? `v${version}` : version;
}

/** Commas between thousands in a number already rounded for display, so grouping never changes the rounding. */
function groupThousands(rounded: string): string {
  const [whole, fraction] = rounded.split(".");
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

export interface ColumnFormat {
  /** What the column's header carries: the unit, "s" for a column of whole seconds, "K ops/s" once scaled. */
  unit: string;
  /** What a value is divided by before it prints: 1, or 1000 for s or K, 1e6 for M, 1e9 for B. */
  scale: number;
  decimals: number;
  /** A value of the column as a bare number: scaled, to the column's decimals, grouped by thousands. */
  format: (value: number) => string;
}

/**
 * One precision for a column of values in one unit, a chart's bars or a scorecard column, so a reader compares digits
 * and never units. Milliseconds become seconds only when every value is a second or more. Any other unit takes the
 * largest of K, M and B that keeps the column's smallest value at or above one, once its largest reaches 100,000, where
 * the axis ticks shorten too. The decimals give the column's smallest value three significant figures, at most two of
 * them after the point, or three when two would print a value as nothing.
 */
export function columnFormat(values: number[], unit: string): ColumnFormat {
  const magnitudes = values.map(Math.abs).filter((value) => value > 0);
  const min = magnitudes.length ? Math.min(...magnitudes) : 0;
  const max = magnitudes.length ? Math.max(...magnitudes) : 0;
  let scale = 1;
  let shown = unit;
  if (unit === "ms") {
    if (min >= 1000) {
      scale = 1000;
      shown = "s";
    }
  } else if (max >= 100_000) {
    for (const [size, prefix] of [[1e9, "B"], [1e6, "M"], [1e3, "K"]] as const) {
      if (min >= size) {
        scale = size;
        shown = `${prefix} ${unit}`;
        break;
      }
    }
  }
  const smallest = min / scale;
  let decimals = smallest > 0 ? Math.min(2, Math.max(0, 2 - Math.floor(Math.log10(smallest)))) : 0;
  if (decimals === 2 && smallest < 0.005) decimals = 3;
  return { unit: shown, scale, decimals, format: (value) => groupThousands((value / scale).toFixed(decimals)) };
}

/** An axis tick, grouped by thousands. */
export function formatTick(value: number): string {
  return groupThousands(String(value));
}

/** A tick shortened to thousands, millions or billions: 500K, 1.5M. */
function compactTick(value: number): string {
  for (const [size, suffix] of [[1e9, "B"], [1e6, "M"], [1e3, "K"]] as const) {
    if (Math.abs(value) >= size) return `${Number((value / size).toFixed(1))}${suffix}`;
  }
  return String(value);
}

/** An axis's tick labels: grouped by thousands, or shortened (500K, 1.5M) once the axis reaches 100,000, so wide ticks don't collide. */
export function tickLabels(ticks: number[]): string[] {
  const compact = ticks.some((tick) => Math.abs(tick) >= 100_000);
  return ticks.map((tick) => (compact ? compactTick(tick) : formatTick(tick)));
}

/**
 * Ticks from zero to `max` whose labels fit an axis `axisRem` wide: the most ticks, from six down to two, that leave each
 * label's neighbour room for the longest label plus a gap, at `charRem` per character. Labels print in the chart's
 * `scale`, the one its values print in.
 */
export function fittedTicks(max: number, axisRem: number, charRem: number, scale = 1): { ticks: number[]; labels: string[] } {
  const label = (ticks: number[]) => tickLabels(ticks.map((tick) => Number((tick / scale).toFixed(6))));
  const first = axisTicks(0, max, 6).filter((tick) => tick <= max);
  let fallback = { ticks: first, labels: label(first) };
  for (const count of [6, 5, 4, 3, 2]) {
    const ticks = axisTicks(0, max, count).filter((tick) => tick <= max);
    if (ticks.length < 2) continue;
    const labels = label(ticks);
    const longest = Math.max(...labels.map((label) => label.length));
    if (axisRem / (ticks.length - 1) >= longest * charRem + 0.75) return { ticks, labels };
    fallback = { ticks, labels };
  }
  return fallback;
}

export interface ScorecardColumn {
  id: string;
  title: string;
  unit: string;
  lowerIsBetter: boolean;
  /** The candidate with the best displayed value in this column, or null when the column is empty or tied. */
  bestId: string | null;
  /** The best value's lead over another candidate is inside the run's noise, so nothing is marked. */
  tied: boolean;
  /** The candidate with the best displayed value, marked or not, or null when the column is empty. */
  leaderId: string | null;
  /** When the column is tied, the other candidates whose means sit inside the leader's noise, best first. */
  tiedIds: string[];
  /** One scale and one precision for the column's cells, so the table and the winner line print the same digits. */
  format: ColumnFormat;
}

export interface ScorecardRow {
  candidateId: string;
  name: string;
  /** One entry per column: the candidate's mean in that section, or null where it did not run. */
  cells: (number | null)[];
}

export interface Scorecard {
  columns: ScorecardColumn[];
  rows: ScorecardRow[];
}

/**
 * Whether two candidates' means are closer than the run's noise: twice the standard error of the difference, about a
 * 95% interval. Only meaningful when each sample repeats one measurement; false when either has fewer than two.
 */
export function insideNoise(a: Candidate, b: Candidate): boolean {
  const n = a.samplesMs.length;
  const m = b.samplesMs.length;
  if (n < 2 || m < 2) return false;
  const noise = 2 * Math.sqrt(standardDeviation(a.samplesMs) ** 2 / n + standardDeviation(b.samplesMs) ** 2 / m);
  return Math.abs(a.statistics.meanMs - b.statistics.meanMs) <= noise;
}

/**
 * One row per candidate, one column per section, each cell the mean of that section's samples (the
 * statistic the section's charts and the hyperfine summary already use). The best value in each
 * column is computed from the cells themselves, so the mark always agrees with the number shown.
 * With `repeats` (samples that repeat one measurement), a best value inside the noise of any other
 * candidate's is left unmarked. Candidates keep the order of their first appearance; a candidate
 * absent from a section leaves that cell empty.
 */
export function scorecard(sections: BenchmarkSection[], repeats = false): Scorecard {
  const order: string[] = [];
  const names = new Map<string, string>();
  for (const section of sections) {
    for (const candidate of section.candidates) {
      if (!names.has(candidate.id)) {
        order.push(candidate.id);
        names.set(candidate.id, candidate.name);
      }
    }
  }
  const rows = order.map((candidateId) => ({
    candidateId,
    name: names.get(candidateId) ?? candidateId,
    cells: sections.map((section) => section.candidates.find((candidate) => candidate.id === candidateId)?.statistics.meanMs ?? null),
  }));
  const columns = sections.map((section, index) => {
    let bestId: string | null = null;
    let best: number | null = null;
    for (const row of rows) {
      const value = row.cells[index];
      if (value === null || value === undefined) continue;
      if (best === null || (section.lowerIsBetter ? value < best : value > best)) {
        best = value;
        bestId = row.candidateId;
      }
    }
    const leader = bestId === null ? undefined : section.candidates.find((candidate) => candidate.id === bestId);
    const inside = repeats && leader !== undefined ? section.candidates.filter((candidate) => candidate !== leader && insideNoise(leader, candidate)) : [];
    const tiedIds = inside.sort((a, b) => (section.lowerIsBetter ? a.statistics.meanMs - b.statistics.meanMs : b.statistics.meanMs - a.statistics.meanMs)).map((candidate) => candidate.id);
    const tied = tiedIds.length > 0;
    const format = columnFormat(rows.map((row) => row.cells[index]).filter((cell): cell is number => cell !== null && cell !== undefined), section.unit);
    return { id: section.id, title: section.title, unit: section.unit, lowerIsBetter: section.lowerIsBetter, bestId: tied ? null : bestId, tied, leaderId: bestId, tiedIds, format };
  });
  return { columns, rows };
}
