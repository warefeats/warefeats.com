import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { assembleCatalog } from "../scripts/assemble";
import { validateRef, validateRunPath } from "../scripts/sync";
import { parseBenchmark, parseCatalog, parseCatalogIndex, toCatalogIndex } from "../src/catalog";
import { BarChart } from "../src/components/BarChart";
import { Conditions } from "../src/components/Conditions";
import { benchmarkPath, BENCHMARKS_PATH, headTags, isBenchmarkPath, normalizePath, pageBenchmark, postPath, prerenderPaths, robotsTxt, routeMeta, sitemapPaths, sitemapXml } from "../src/head";
import { applyPick, candidateUniverse, matchupField, matchupHeading, pickerVersion, pickFlat, pickParam, readPick } from "../src/matchup";
import { axisTicks, benchmarkTests, fiveNumber, formatTick, formatValue, formatVersion, fittedTicks, tickLabels, reportText, samplePosition, scorecard, standardDeviation, summarize } from "../src/metrics";
import { render } from "../src/entry-server";
import { runViews } from "../src/runs";
import type { Benchmark, BenchmarkCatalog } from "../src/types";

let _catalog: BenchmarkCatalog | undefined;
async function loadCatalog() {
  if (!_catalog) _catalog = await assembleCatalog();
  return _catalog;
}

describe("benchmark catalog", () => {
  test("loads the published catalog", async () => {
    const catalog = await loadCatalog();

    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.benchmarks.length).toBeGreaterThanOrEqual(1);
    expect(catalog.benchmarks[0]?.candidates.length).toBeGreaterThanOrEqual(2);
  });

  test("summarizes the winner against every other candidate with a propagated sigma", async () => {
    const catalog = await loadCatalog();
    const summary = summarize(catalog.benchmarks[0]!);

    expect(summary.winner.id).toBe("biome");
    expect(summary.comparisons).toHaveLength(1);
    expect(summary.comparisons[0]?.ratio).toBeCloseTo(106.0 / 75.4, 3);
    expect(summary.comparisons[0]?.sigma).toBeGreaterThan(0);
    expect(summary.comparisons[0]?.sigma).toBeLessThan(0.1);
  });

  test("renders the report in hyperfine's shape", async () => {
    const catalog = await loadCatalog();
    const text = reportText(catalog.benchmarks[0]!);

    expect(text).toContain("Benchmark 1: ESLint 9.34.0");
    expect(text).toContain("Time (mean ± σ)");
    expect(text).toContain("Biome 2.2.2 ran");
    expect(text).toMatch(/1\.4\d ± 0\.0\d times faster than ESLint 9\.34\.0/);
  });

  test("charts no bar tests unless the catalog declares them", async () => {
    const catalog = await loadCatalog();
    expect(benchmarkTests(catalog.benchmarks[0]!)).toEqual([]);
  });

  test("computes the five-number summary with interpolated quartiles", () => {
    expect(fiveNumber([1, 2, 3, 4, 5, 6, 7, 8])).toEqual({ min: 1, q1: 2.75, median: 4.5, q3: 6.25, max: 8 });
    expect(fiveNumber([5])).toEqual({ min: 5, q1: 5, median: 5, q3: 5, max: 5 });
  });

  test("positions samples within the shared range", () => {
    expect(samplePosition(10, 10, 20)).toBe(0);
    expect(samplePosition(15, 10, 20)).toBe(50);
    expect(samplePosition(20, 10, 20)).toBe(100);
  });

  test("computes a sample standard deviation", () => {
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    expect(standardDeviation([5])).toBe(0);
  });

  test("groups large values and ticks by thousands, and keeps durations as they were", () => {
    expect(formatValue(12794200.66, "ops/s")).toBe("12,794,200.7 ops/s");
    expect(formatValue(1093.94, "MB")).toBe("1,093.9 MB");
    expect(formatValue(12600, "rps")).toBe("12,600 rps");
    expect(formatValue(906.66, "MB")).toBe("906.7 MB");
    expect(formatValue(192.62, "ms")).toBe("192.6 ms");
    expect(formatValue(2500, "ms")).toBe("2.500 s");
    // Grouping keeps toFixed's rounding: 0.15 and 11289.15 sit just below the half in binary.
    expect(formatValue(0.15, "ms/tile")).toBe("0.1 ms/tile");
    expect(formatValue(11289.15, "rps")).toBe("11,289.1 rps");
    expect(formatValue(-1234.5, "MB")).toBe("-1,234.5 MB");
    expect([0, 500, 1000, 10000000, 0.5].map(formatTick)).toEqual(["0", "500", "1,000", "10,000,000", "0.5"]);
    expect(tickLabels([0, 2500, 5000, 7500])).toEqual(["0", "2,500", "5,000", "7,500"]);
    expect(tickLabels([0, 500000, 1000000, 1500000])).toEqual(["0", "500K", "1M", "1.5M"]);
    expect(tickLabels([0, 5e6, 1e7, 1.5e7])).toEqual(["0", "5M", "10M", "15M"]);
    // Six ticks on a wide axis; fewer once the labels would touch on a narrow one.
    expect(fittedTicks(2500, 20, 0.5).labels).toEqual(["0", "500", "1,000", "1,500", "2,000", "2,500"]);
    expect(fittedTicks(2500, 8, 0.5).labels).toEqual(["0", "1,000", "2,000"]);
    expect(fittedTicks(1.5e6, 9, 0.5).labels).toEqual(["0", "500K", "1M", "1.5M"]);
    expect(fittedTicks(1.5e6, 5, 0.5).labels).toEqual(["0", "1M"]);
    // A chart of zeros keeps whatever ticks the axis had, never a second zero.
    expect(fittedTicks(0, 8, 0.5).ticks).toEqual(axisTicks(0, 0, 6));
  });

  test("picks friendly axis ticks", () => {
    const ticks = axisTicks(71, 110, 6);
    expect(ticks[0]).toBeGreaterThanOrEqual(71);
    expect(ticks[ticks.length - 1]).toBeLessThanOrEqual(110);
    expect(ticks.length).toBeGreaterThanOrEqual(4);
  });
});

describe("scorecard", () => {
  const candidate = (id: string, median: number) => ({ id, name: id.toUpperCase(), version: "1", statistics: { medianMs: median, meanMs: median, minMs: median, maxMs: median }, samplesMs: [median] });
  const section = (id: string, unit: string, lowerIsBetter: boolean, winnerId: string, candidates: ReturnType<typeof candidate>[]) => ({
    id, title: id, deck: "", unit, lowerIsBetter, verdict: { winnerId, headline: "", summary: "" }, candidates,
  });

  test("lays out one row per candidate and one column per section, means in the cells", () => {
    const card = scorecard([
      section("latency", "ms", true, "a", [candidate("a", 10), candidate("b", 20)]),
      section("throughput", "req/s", false, "b", [candidate("b", 300), candidate("a", 200), candidate("c", 50)]),
    ]);
    expect(card.columns.map((c) => [c.id, c.unit, c.lowerIsBetter])).toEqual([["latency", "ms", true], ["throughput", "req/s", false]]);
    expect(card.rows.map((r) => r.candidateId)).toEqual(["a", "b", "c"]);
    expect(card.rows.map((r) => r.cells)).toEqual([[10, 200], [20, 300], [null, 50]]);
    expect(card.rows[2]!.name).toBe("C");
  });

  test("marks the best displayed value, not the verdict's pick, so the mark matches the number", () => {
    const card = scorecard([
      section("burst", "ms", true, "b", [candidate("a", 4.7), candidate("b", 4.8)]),
      section("rps", "req/s", false, "a", [candidate("a", 100), candidate("b", 250)]),
      section("empty", "ms", true, "a", []),
    ]);
    expect(card.columns.map((c) => c.bestId)).toEqual(["a", "b", null]);
  });

  test("is empty for a benchmark without sections", () => {
    expect(scorecard([])).toEqual({ columns: [], rows: [] });
  });

  test("with repeated samples, leaves a lead inside the noise unmarked", () => {
    const sampled = (id: string, samples: number[]) => {
      const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
      return { ...candidate(id, mean), samplesMs: samples };
    };
    const sections = [
      // 3.16 against 3.14 with a spread of 0.16: inside twice the standard error of the difference (0.26).
      section("frame", "ms", true, "a", [sampled("a", [3.0, 3.16, 3.32]), sampled("b", [2.98, 3.14, 3.3]), sampled("c", [6.4, 6.5, 6.6])]),
      // 3.05 against 2.90 with a spread of 0.01: far outside it (0.02).
      section("startup", "ms", true, "a", [sampled("a", [3.04, 3.05, 3.06]), sampled("b", [2.89, 2.9, 2.91])]),
    ];
    const card = scorecard(sections, true);
    expect(card.columns.map((c) => [c.bestId, c.tied])).toEqual([[null, true], ["b", false]]);
    expect(scorecard(sections).columns.map((c) => [c.bestId, c.tied])).toEqual([["b", false], ["b", false]]);
    expect(card.columns.map((c) => [c.leaderId, c.tiedIds])).toEqual([["b", ["a"]], ["b", []]]);
    expect(scorecard(sections).columns.map((c) => [c.leaderId, c.tiedIds])).toEqual([["b", []], ["b", []]]);
  });
});

describe("catalog assembly", () => {
  test("assembles the full catalog from registry + cache", async () => {
    const catalog = await assembleCatalog();

    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.generatedAt).toBeTruthy();
    const registry = JSON.parse(await Bun.file(new URL("../data/registry.json", import.meta.url).pathname).text()) as { benchmarks: unknown[] };
    expect(catalog.benchmarks).toHaveLength(registry.benchmarks.length);
    expect(catalog.queue.length).toBeGreaterThanOrEqual(1);
  });

  test("sets runnerUrl from the registry repo", async () => {
    const catalog = await assembleCatalog();

    expect(catalog.benchmarks[0]!.runnerUrl).toBe("https://github.com/warefeats/js-linter-tools");
    expect(catalog.benchmarks[1]!.runnerUrl).toBe("https://github.com/warefeats/http-caching-proxies");
  });

  test("merges the primary run into the legacy shape", async () => {
    const catalog = await assembleCatalog();
    const lint = catalog.benchmarks[0]!;

    expect(lint.id).toBe("lint-js-eslint-biome-2026-08");
    expect(lint.environment.chip).toBe("Apple M2 Max");
    expect(lint.protocol.runs).toBe(20);
    expect(lint.candidates.length).toBe(2);
  });

  test("preserves sections on a sections-based benchmark", async () => {
    const catalog = await assembleCatalog();
    const proxy = catalog.benchmarks[1]!;

    expect(proxy.sections).toBeDefined();
    expect(proxy.sections!.length).toBe(4);
    expect(proxy.candidates).toEqual([]);
  });
});

describe("catalog index", () => {
  test("carries each benchmark's summary without its samples", async () => {
    const catalog = await loadCatalog();
    const index = toCatalogIndex(catalog);

    expect(index.benchmarks.map((entry) => entry.slug)).toEqual(catalog.benchmarks.map((benchmark) => benchmark.slug));
    expect(JSON.stringify(index)).not.toContain("samplesMs");
    expect(index.queue).toEqual(catalog.queue);
    for (const benchmark of catalog.benchmarks) {
      const entry = index.benchmarks.find((candidate) => candidate.slug === benchmark.slug)!;
      const summary = summarize(benchmark);
      const lead = summary.comparisons[0];
      expect(entry.chip).toBe(benchmark.environment.chip);
      expect(entry.runs).toBe(benchmark.protocol.runs);
      expect(entry.verdictHeadline).toBe(benchmark.verdict.headline);
      const expected = lead ? { winner: { name: summary.winner.name, version: summary.winner.version }, other: { name: lead.other.name, version: lead.other.version }, ratio: lead.ratio, sigma: lead.sigma } : undefined;
      expect(entry.lead as unknown).toEqual(expected);
    }
  });

  test("parses its own output and rejects an entry without a slug", async () => {
    const index = toCatalogIndex(await loadCatalog());
    expect(parseCatalogIndex(JSON.parse(JSON.stringify(index)))).toEqual(index);
    expect(() => parseCatalogIndex({ schemaVersion: 1, benchmarks: [{ title: "No slug" }], queue: [] })).toThrow("incomplete");
  });

  test("checks one benchmark on its own", async () => {
    const catalog = await loadCatalog();
    expect(parseBenchmark(JSON.parse(JSON.stringify(catalog.benchmarks[0])))).toEqual(catalog.benchmarks[0]!);
    expect(() => parseBenchmark({ id: "x" })).toThrow("incomplete");
  });
});

describe("catalog validation", () => {
  test("every cached benchmark names its primary run", async () => {
    const catalog = await loadCatalog();
    for (const benchmark of catalog.benchmarks) {
      expect(typeof benchmark.run?.id).toBe("string");
      expect(typeof benchmark.run?.label).toBe("string");
    }
  });

  test("rejects a primary run without an id and label", () => {
    const benchmark = { id: "x", title: "X", candidates: [], sections: [], run: { id: 7 } };
    expect(() => parseCatalog({ schemaVersion: 1, benchmarks: [benchmark], queue: [] })).toThrow("invalid primary run");
  });

  test("rejects unsupported schemas", () => {
    expect(() => parseCatalog({ schemaVersion: 2, benchmarks: [], queue: [] })).toThrow("unsupported shape");
  });

  test("accepts benchmarks without corpus or ruleMap", () => {
    const catalog = parseCatalog({
      schemaVersion: 1,
      generatedAt: "2026-08-29T00:00:00Z",
      queue: [],
      benchmarks: [{
        id: "proxy-bench-test",
        slug: "proxy-bench-test",
        post: "2026-08-29-proxy-bench-test-a-vs-b",
        category: "Caching proxies",
        title: "Test",
        deck: "Test benchmark",
        publishedAt: "2026-08-29",
        unit: "ms",
        lowerIsBetter: true,
        verdict: { winnerId: "a", headline: "A wins", summary: "A is faster" },
        environment: { machine: "Test", chip: "Test", cores: "1", memory: "1 GB", os: "Test", arch: "arm64", runtime: "Docker" },
        protocol: { warmups: 3, runs: 20, processModel: "container", cacheState: "warm", output: "TTFB" },
        candidates: [
          { id: "a", name: "A", version: "1.0", statistics: { medianMs: 1, meanMs: 1, minMs: 1, maxMs: 1 }, samplesMs: [1], configuration: { engine: "varnish", topology: "plaintext", workload: "hit-path-rps", targetRps: 5000 }, metrics: { p50: { value: 1, unit: "ms" } } },
          { id: "b", name: "B", version: "1.0", statistics: { medianMs: 2, meanMs: 2, minMs: 2, maxMs: 2 }, samplesMs: [2] },
        ],
        limitations: ["Test only"],
      }],
    });
    expect(catalog.benchmarks[0]!.id).toBe("proxy-bench-test");
  });

  test("rejects comparisons with fewer than two candidates", () => {
    expect(() => parseCatalog({ schemaVersion: 1, queue: [], benchmarks: [{ id: "one", title: "One", candidates: [] }] })).toThrow("at least two candidates");
  });

  test("accepts benchmarks with sections instead of top-level candidates", () => {
    const catalog = parseCatalog({
      schemaVersion: 1,
      generatedAt: "2026-08-29T00:00:00Z",
      queue: [],
      benchmarks: [{
        id: "test-sections",
        slug: "test-sections",
        post: "2026-08-29-test-sections-a-vs-b",
        category: "Test",
        title: "Sections test",
        deck: "A test",
        publishedAt: "2026-08-29",
        unit: "ms",
        lowerIsBetter: true,
        verdict: { winnerId: "mixed", headline: "Mixed", summary: "No single winner" },
        environment: { machine: "Test", chip: "Test", cores: "1", memory: "1 GB", os: "Test", arch: "arm64", runtime: "Docker" },
        protocol: { warmups: 3, runs: 20, processModel: "container", cacheState: "warm", output: "TTFB" },
        candidates: [],
        sections: [
          {
            id: "s1",
            title: "Section 1",
            deck: "First section",
            unit: "ms",
            lowerIsBetter: true,
            verdict: { winnerId: "a", headline: "A wins", summary: "A faster" },
            candidates: [
              { id: "a", name: "A", version: "1.0", statistics: { medianMs: 1, meanMs: 1, minMs: 1, maxMs: 1 }, samplesMs: [1] },
              { id: "b", name: "B", version: "1.0", statistics: { medianMs: 2, meanMs: 2, minMs: 2, maxMs: 2 }, samplesMs: [2] },
            ],
          },
        ],
        limitations: ["Test only"],
      }],
    });
    expect(catalog.benchmarks[0]!.sections!.length).toBe(1);
  });

  test("rejects a candidate with replicated samples when protocol.runs > 1", () => {
    expect(() => parseCatalog({
      schemaVersion: 1,
      generatedAt: "2026-08-29T00:00:00Z",
      queue: [],
      benchmarks: [{
        id: "replicated",
        slug: "replicated",
        post: "2026-08-29-replicated-a-vs-b",
        category: "Test",
        title: "Replicated",
        deck: "Test",
        publishedAt: "2026-08-29",
        unit: "ms",
        lowerIsBetter: true,
        verdict: { winnerId: "a", headline: "A", summary: "A" },
        environment: { machine: "T", chip: "T", cores: "1", memory: "1 GB", os: "T", arch: "arm64", runtime: "T" },
        protocol: { warmups: 3, runs: 20, processModel: "container", cacheState: "warm", output: "TTFB" },
        candidates: [
          { id: "a", name: "A", version: "1.0", statistics: { medianMs: 5, meanMs: 5, minMs: 5, maxMs: 5 }, samplesMs: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5] },
          { id: "b", name: "B", version: "1.0", statistics: { medianMs: 6, meanMs: 6, minMs: 6, maxMs: 6 }, samplesMs: [6, 6, 6, 6, 6] },
        ],
        limitations: [],
      }],
    })).toThrow("samples look replicated");
  });

  test("rejects a section candidate with replicated samples when protocol.runs > 1", () => {
    expect(() => parseCatalog({
      schemaVersion: 1,
      generatedAt: "2026-08-29T00:00:00Z",
      queue: [],
      benchmarks: [{
        id: "replicated-section",
        slug: "replicated-section",
        post: "2026-08-29-replicated-section-a-vs-b",
        category: "Test",
        title: "Replicated Section",
        deck: "Test",
        publishedAt: "2026-08-29",
        unit: "ms",
        lowerIsBetter: true,
        verdict: { winnerId: "a", headline: "A", summary: "A" },
        environment: { machine: "T", chip: "T", cores: "1", memory: "1 GB", os: "T", arch: "arm64", runtime: "T" },
        protocol: { warmups: 3, runs: 20, processModel: "container", cacheState: "warm", output: "TTFB" },
        candidates: [],
        sections: [{
          id: "s1",
          title: "S1",
          deck: "S1",
          unit: "ms",
          lowerIsBetter: true,
          verdict: { winnerId: "a", headline: "A", summary: "A" },
          candidates: [
            { id: "a", name: "A", version: "1.0", statistics: { medianMs: 3, meanMs: 3, minMs: 3, maxMs: 3 }, samplesMs: [3, 3, 3, 3, 3] },
            { id: "b", name: "B", version: "1.0", statistics: { medianMs: 4, meanMs: 4, minMs: 4, maxMs: 4 }, samplesMs: [4] },
          ],
        }],
        limitations: [],
      }],
    })).toThrow("samples look replicated");
  });

  test("accepts replicated samples when protocol.runs is 1", () => {
    const catalog = parseCatalog({
      schemaVersion: 1,
      generatedAt: "2026-08-29T00:00:00Z",
      queue: [],
      benchmarks: [{
        id: "single-run",
        slug: "single-run",
        post: "2026-08-29-single-run-a-vs-b",
        category: "Test",
        title: "Single",
        deck: "Test",
        publishedAt: "2026-08-29",
        unit: "ms",
        lowerIsBetter: true,
        verdict: { winnerId: "a", headline: "A", summary: "A" },
        environment: { machine: "T", chip: "T", cores: "1", memory: "1 GB", os: "T", arch: "arm64", runtime: "T" },
        protocol: { warmups: 0, runs: 1, processModel: "single", cacheState: "cold", output: "TTFB" },
        candidates: [
          { id: "a", name: "A", version: "1.0", statistics: { medianMs: 5, meanMs: 5, minMs: 5, maxMs: 5 }, samplesMs: [5] },
          { id: "b", name: "B", version: "1.0", statistics: { medianMs: 6, meanMs: 6, minMs: 6, maxMs: 6 }, samplesMs: [6] },
        ],
        limitations: [],
      }],
    });
    expect(catalog.benchmarks[0]!.id).toBe("single-run");
  });

  test("accepts benchmarks with optional runs for multiple environments", () => {
    const catalog = parseCatalog({
      schemaVersion: 1,
      generatedAt: "2026-08-30T00:00:00Z",
      queue: [],
      benchmarks: [{
        id: "multi-env",
        slug: "multi-env",
        post: "2026-08-29-multi-env-a-vs-b",
        category: "Test",
        title: "Multi-env test",
        deck: "A benchmark with two environment runs",
        publishedAt: "2026-08-30",
        unit: "ms",
        lowerIsBetter: true,
        verdict: { winnerId: "a", headline: "A wins", summary: "A is faster" },
        environment: { machine: "MacBook Pro", chip: "Apple M2 Max", cores: "12", memory: "96 GB", os: "macOS", arch: "arm64", runtime: "Bun" },
        protocol: { warmups: 3, runs: 10, processModel: "container", cacheState: "warm", output: "TTFB" },
        candidates: [],
        sections: [
          {
            id: "s1",
            title: "Section 1",
            deck: "First section",
            unit: "ms",
            lowerIsBetter: true,
            verdict: { winnerId: "a", headline: "A wins", summary: "A faster" },
            candidates: [
              { id: "a", name: "A", version: "1.0", statistics: { medianMs: 1, meanMs: 1, minMs: 1, maxMs: 1 }, samplesMs: [1] },
              { id: "b", name: "B", version: "1.0", statistics: { medianMs: 2, meanMs: 2, minMs: 2, maxMs: 2 }, samplesMs: [2] },
            ],
          },
        ],
        runs: [
          {
            id: "cloud",
            label: "Cloud (c7g.xlarge)",
            environment: { machine: "EC2 c7g.xlarge", chip: "Graviton3", cores: "4 vCPU", memory: "8 GB", os: "Amazon Linux 2023", arch: "arm64", runtime: "Docker" },
            protocol: { warmups: 3, runs: 10, processModel: "container", cacheState: "warm", output: "TTFB" },
            publishedAt: "2026-08-30",
          },
        ],
        limitations: ["Test only"],
      }],
    });
    expect(catalog.benchmarks[0]!.runs!.length).toBe(1);
    expect(catalog.benchmarks[0]!.runs![0]!.id).toBe("cloud");
    expect(catalog.benchmarks[0]!.runs![0]!.label).toBe("Cloud (c7g.xlarge)");
  });

  test("accepts benchmarks without runs (backwards compatible)", () => {
    const catalog = parseCatalog({
      schemaVersion: 1,
      generatedAt: "2026-08-30T00:00:00Z",
      queue: [],
      benchmarks: [{
        id: "no-runs",
        slug: "no-runs",
        post: "2026-08-29-no-runs-a-vs-b",
        category: "Test",
        title: "No runs",
        deck: "Test",
        publishedAt: "2026-08-30",
        unit: "ms",
        lowerIsBetter: true,
        verdict: { winnerId: "a", headline: "A", summary: "A" },
        environment: { machine: "T", chip: "T", cores: "1", memory: "1 GB", os: "T", arch: "arm64", runtime: "T" },
        protocol: { warmups: 0, runs: 1, processModel: "single", cacheState: "cold", output: "TTFB" },
        candidates: [
          { id: "a", name: "A", version: "1.0", statistics: { medianMs: 1, meanMs: 1, minMs: 1, maxMs: 1 }, samplesMs: [1] },
          { id: "b", name: "B", version: "1.0", statistics: { medianMs: 2, meanMs: 2, minMs: 2, maxMs: 2 }, samplesMs: [2] },
        ],
        limitations: [],
      }],
    });
    expect(catalog.benchmarks[0]!.runs).toBeUndefined();
  });

  test("accepts the optional gpu, browser and display environment fields", () => {
    const candidates = [
      { id: "a", name: "A", version: "1.0", statistics: { medianMs: 1, meanMs: 1, minMs: 1, maxMs: 1 }, samplesMs: [1] },
      { id: "b", name: "B", version: "1.0", statistics: { medianMs: 2, meanMs: 2, minMs: 2, maxMs: 2 }, samplesMs: [2] },
    ];
    const protocol = { warmups: 0, runs: 1, processModel: "single", cacheState: "cold", output: "frame time" };
    const catalog = parseCatalog({
      schemaVersion: 1,
      generatedAt: "2026-09-02T00:00:00Z",
      queue: [],
      benchmarks: [
        {
          id: "gpu-rig",
          slug: "gpu-rig",
          post: "2026-08-29-gpu-rig-a-vs-b",
          category: "Test",
          title: "GPU rig",
          deck: "Test",
          publishedAt: "2026-09-02",
          unit: "ms",
          lowerIsBetter: true,
          verdict: { winnerId: "a", headline: "A", summary: "A" },
          environment: {
            machine: "MacBook Pro", chip: "Apple M2 Max", cores: "12", memory: "96 GB", os: "macOS 15.6", arch: "arm64", runtime: "Bun 1.2",
            gpu: "Apple M2 Max 38-core (Metal 3)", browser: "Chromium 140 (ANGLE Metal)", display: "1280×800 @2x, physical display attached",
          },
          protocol,
          candidates,
          limitations: [],
        },
        {
          id: "cpu-rig",
          slug: "cpu-rig",
          post: "2026-08-29-cpu-rig-a-vs-b",
          category: "Test",
          title: "CPU rig",
          deck: "Test",
          publishedAt: "2026-09-02",
          unit: "ms",
          lowerIsBetter: true,
          verdict: { winnerId: "a", headline: "A", summary: "A" },
          environment: { machine: "T", chip: "T", cores: "1", memory: "1 GB", os: "T", arch: "arm64", runtime: "T" },
          protocol,
          candidates,
          limitations: [],
        },
      ],
    });
    expect(catalog.benchmarks[0]!.environment.gpu).toBe("Apple M2 Max 38-core (Metal 3)");
    expect(catalog.benchmarks[0]!.environment.browser).toBe("Chromium 140 (ANGLE Metal)");
    expect(catalog.benchmarks[0]!.environment.display).toBe("1280×800 @2x, physical display attached");
    expect(catalog.benchmarks[1]!.environment.gpu).toBeUndefined();
    expect(catalog.benchmarks[1]!.environment.browser).toBeUndefined();
    expect(catalog.benchmarks[1]!.environment.display).toBeUndefined();
  });

  test("rejects a run entry with missing id or label", () => {
    expect(() => parseCatalog({
      schemaVersion: 1,
      queue: [],
      benchmarks: [{
        id: "bad-run",
        title: "Bad",
        candidates: [
          { id: "a", name: "A", version: "1.0", statistics: { medianMs: 1, meanMs: 1, minMs: 1, maxMs: 1 }, samplesMs: [1] },
          { id: "b", name: "B", version: "1.0", statistics: { medianMs: 2, meanMs: 2, minMs: 2, maxMs: 2 }, samplesMs: [2] },
        ],
        runs: [{ id: "x" }],
      }],
    })).toThrow("invalid run entry");
  });

  test("rejects sections with fewer than two candidates", () => {
    expect(() => parseCatalog({
      schemaVersion: 1,
      generatedAt: "2026-08-29T00:00:00Z",
      queue: [],
      benchmarks: [{
        id: "bad-section",
        title: "Bad",
        candidates: [],
        sections: [{ id: "s1", candidates: [{ id: "a", name: "A", version: "1.0", statistics: { medianMs: 1, meanMs: 1, minMs: 1, maxMs: 1 }, samplesMs: [1] }] }],
      }],
    })).toThrow("at least two candidates");
  });

  test("loads the published sections benchmark with four sections", async () => {
    const catalog = await loadCatalog();
    const proxy = catalog.benchmarks.find((b) => b.sections?.length);
    expect(proxy).toBeDefined();
    expect(proxy!.sections!.length).toBe(4);
    for (const section of proxy!.sections!) {
      expect(section.candidates.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("home", () => {
  test("lists every post on one timeline, newest first, whatever its category", async () => {
    const index = toCatalogIndex(await loadCatalog());
    const html = render("/", index).html.replaceAll("<!-- -->", "");
    const titles = [...html.matchAll(/class="timeline-title"><a [^>]*>([^<]+)<\/a>/g)].map((match) => match[1]);
    const posts = index.benchmarks.flatMap((entry) => [{ title: entry.title, publishedAt: entry.publishedAt }, ...(entry.posts ?? [])]);
    const newestFirst = posts.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).map((post) => post.title.replaceAll("&", "&amp;"));

    expect(titles).toEqual(newestFirst);
    expect(new Set(index.benchmarks.map((post) => post.category)).size).toBeGreaterThan(1);
    expect(html).toContain(`<h2 id="timeline-title">Posts</h2>`);
  });
});

describe("routes", () => {
  test("normalizes paths to a trailing slash", () => {
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("/about")).toBe("/about/");
    expect(normalizePath("/about/?x=1")).toBe("/about/");
  });

  test("prerenders each post and each benchmark page, plus the fixed pages", async () => {
    const catalog = toCatalogIndex(await loadCatalog());
    const paths = prerenderPaths(catalog);
    expect(paths.slice(0, 4)).toEqual(["/", "/benchmarks/", "/methodology/", "/about/"]);
    expect(paths).toContain("/posts/2026-08-26-js-linter-tools-eslint-vs-biome/");
    expect(paths).toContain("/benchmarks/js-linter-tools/");
    expect(paths).toContain("/benchmarks/http-caching-proxies/");
    const later = catalog.benchmarks.flatMap((entry) => entry.posts ?? []);
    for (const post of later) {
      expect(paths).toContain(postPath(post.slug));
    }
    expect(paths).toHaveLength(4 + 2 * catalog.benchmarks.length + later.length);
  });

  test("names a post by its date, its category and its products, and a benchmark page by its category alone", async () => {
    const catalog = toCatalogIndex(await loadCatalog());

    for (const entry of catalog.benchmarks) {
      expect(entry.post.startsWith(`${entry.publishedAt}-${entry.slug}-`)).toBe(true);
      expect(pageBenchmark(postPath(entry.post), catalog)).toBe(entry);
      expect(pageBenchmark(benchmarkPath(entry.slug), catalog)).toBe(entry);
    }
    expect(catalog.benchmarks.map((entry) => entry.slug).sort()).toEqual(["archive-tile-servers", "desktop-shells", "http-caching-proxies", "js-bundlers", "js-linter-tools", "kv-stores", "vector-tile-servers", "web-map-renderers"]);
    expect(pageBenchmark("/posts/nope/", catalog)).toBeUndefined();
  });

  test("builds post metadata from the catalog", async () => {
    const catalog = toCatalogIndex(await loadCatalog());
    const meta = routeMeta("/posts/2026-08-26-js-linter-tools-eslint-vs-biome", catalog);

    expect(meta.status).toBe(200);
    expect(meta.title).toBe("ESLint vs Biome | warefeats");
    expect(meta.description).toContain("Biome 2.2.2 ran");
    expect(headTags(meta)).toContain('<link rel="canonical" href="https://warefeats.com/posts/2026-08-26-js-linter-tools-eslint-vs-biome/" />');
    expect(meta.image).toBe("https://warefeats.com/og/posts/2026-08-26-js-linter-tools-eslint-vs-biome.png");
    expect(headTags(meta)).toContain('<meta property="og:image" content="https://warefeats.com/og/posts/2026-08-26-js-linter-tools-eslint-vs-biome.png" />');
  });

  test("marks unknown routes as not found, old benchmark URLs included (the CDN redirects those first)", async () => {
    const catalog = toCatalogIndex(await loadCatalog());
    const meta = routeMeta("/benchmarks/nope", catalog);

    expect(meta.status).toBe(404);
    expect(headTags(meta)).toContain('name="robots" content="noindex"');
    expect(routeMeta("/posts/nope/", catalog).status).toBe(404);
    expect(routeMeta("/benchmarks/eslint-vs-biome-javascript-lint/", catalog).status).toBe(404);
    expect(routeMeta(BENCHMARKS_PATH, catalog).status).toBe(200);
  });

  test("fits every title and description into a search result", async () => {
    const catalog = toCatalogIndex(await loadCatalog());

    for (const path of prerenderPaths(catalog)) {
      const meta = routeMeta(path, catalog);
      expect(meta.description.length).toBeLessThanOrEqual(160);
      expect(meta.title.length <= 60 || !meta.title.includes(" | ")).toBe(true);
    }
  });

  test("drops the site name from a title too long to carry it", async () => {
    const catalog = toCatalogIndex(await loadCatalog());

    expect(routeMeta("/posts/2026-09-10-desktop-shells-tauri-vs-electron/", catalog).title).toBe("Tauri vs Electron | warefeats");
    expect(routeMeta("/posts/2026-09-08-archive-tile-servers-martin-vs-go-pmtiles-vs-tileserver-gl-vs-mbtileserver-vs-bbox/", catalog).title).toBe("Martin vs go-pmtiles vs tileserver-gl vs mbtileserver vs BBOX");
  });

  test("keeps a deck that fits and cuts a long verdict at its last clause break that fits", async () => {
    const catalog = toCatalogIndex(await loadCatalog());

    expect(routeMeta("/posts/2026-08-31-kv-stores-redis-vs-valkey-vs-dragonfly/", catalog).description).toBe(catalog.benchmarks.find((entry) => entry.slug === "kv-stores")!.deck);
    expect(routeMeta("/posts/2026-09-08-archive-tile-servers-martin-vs-go-pmtiles-vs-tileserver-gl-vs-mbtileserver-vs-bbox/", catalog).description).toBe("Martin served 12,600 tiles a second at 100 clients from the PMTiles archive, more than any other server from either format.");
  });

  test("lists every page that is its own canonical in the sitemap, and no benchmark page", async () => {
    const catalog = toCatalogIndex(await loadCatalog());
    const sitemap = sitemapXml(sitemapPaths(catalog));

    expect(sitemap.match(/<loc>/g)).toHaveLength(prerenderPaths(catalog).filter((path) => !isBenchmarkPath(path)).length);
    expect(sitemap).not.toContain("/benchmarks/js-linter-tools/");
    expect(sitemap).toContain("<loc>https://warefeats.com/benchmarks/</loc>");
    expect(sitemap).toContain("<loc>https://warefeats.com/methodology/</loc>");
    expect(sitemap).toContain("<loc>https://warefeats.com/posts/2026-09-10-desktop-shells-tauri-vs-electron/</loc>");
    expect(robotsTxt()).toContain("Sitemap: https://warefeats.com/sitemap.xml");
  });
});

describe("matchups", () => {
  const SLUGS = ["http-caching-proxies", "js-bundlers", "kv-stores", "vector-tile-servers", "web-map-renderers", "archive-tile-servers"];

  test("go to benchmarks with three or more candidates in a run", async () => {
    const catalog = await loadCatalog();
    const withMatchup = catalog.benchmarks.filter((benchmark) => matchupField(benchmark) !== undefined).map((benchmark) => benchmark.slug);

    expect(withMatchup.sort()).toEqual([...SLUGS].sort());
    expect(toCatalogIndex(catalog).benchmarks.find((entry) => entry.slug === "vector-tile-servers")!.matchup).toEqual({ candidates: 7 });
    expect(toCatalogIndex(catalog).benchmarks.find((entry) => entry.slug === "desktop-shells")!.matchup).toBeUndefined();
  });

  test("pick from every candidate in the run, once each, in run order", async () => {
    const catalog = await loadCatalog();
    const proxies = catalog.benchmarks.find((benchmark) => benchmark.slug === "http-caching-proxies")!;
    const universe = candidateUniverse(runViews(proxies)[0]!);

    expect(universe.map((candidate) => candidate.id)).toEqual(["varnish-plaintext", "varnish-tls-inprocess", "varnish-proxyv2-haproxy", "vinyl-plaintext", "vinyl-proxyv2-haproxy", "nginx-plaintext", "nginx-tls-inprocess", "nginx-proxyv2-haproxy"]);
  });

  test("read a pick in run order, and fall back to the whole field when it names fewer than two", async () => {
    const catalog = await loadCatalog();
    const universe = candidateUniverse(runViews(catalog.benchmarks.find((benchmark) => benchmark.slug === "vector-tile-servers")!)[0]!);

    expect(readPick(null, universe)).toEqual({ ids: universe.map((candidate) => candidate.id), full: true, ignored: false });
    expect(readPick("tegola,martin", universe)).toEqual({ ids: ["martin", "tegola"], full: false, ignored: false });
    expect(readPick("martin,nope", universe)).toEqual({ ids: universe.map((candidate) => candidate.id), full: true, ignored: true });
    expect(readPick(universe.map((candidate) => candidate.id).join(","), universe).full).toBe(true);
    expect(pickParam(["tegola", "martin"], universe)).toBe("martin,tegola");
    expect(pickParam(universe.map((candidate) => candidate.id), universe)).toBeNull();
  });

  test("drop the sections fewer than two picked candidates ran, and recompute best marks from what stays", async () => {
    const catalog = await loadCatalog();
    const proxies = catalog.benchmarks.find((benchmark) => benchmark.slug === "http-caching-proxies")!;
    const sections = proxies.sections!;

    const plaintext = applyPick(sections, ["varnish-plaintext", "nginx-plaintext"]);
    expect(plaintext.sections.map((section) => section.id)).toEqual(["hit-path-rps", "segment-serve", "miss-storm", "origin-flap"]);
    expect(plaintext.sections.every((section) => section.candidates.length === 2)).toBe(true);
    expect(plaintext.sections.every((section) => section.tests!.every((test) => test.results.length === 2))).toBe(true);

    const tls = applyPick(sections, ["varnish-tls-inprocess", "nginx-tls-inprocess"]);
    expect(tls.sections.map((section) => section.id)).toEqual(["hit-path-rps", "segment-serve"]);
    expect(tls.omitted.map((section) => section.id)).toEqual(["miss-storm", "origin-flap"]);

    const card = scorecard(plaintext.sections);
    expect(card.rows.map((row) => row.candidateId)).toEqual(["varnish-plaintext", "nginx-plaintext"]);
    for (const column of card.columns) expect(["varnish-plaintext", "nginx-plaintext"]).toContain(column.bestId!);
  });

  test("name the fastest picked candidate as the winner of a benchmark without sections", async () => {
    const catalog = await loadCatalog();
    const bundlers = catalog.benchmarks.find((benchmark) => benchmark.slug === "js-bundlers")!;
    const picked = pickFlat(bundlers, runViews(bundlers)[0]!, ["vite", "tsup"]);

    expect(picked.candidates.map((candidate) => candidate.id)).toEqual(["vite", "tsup"]);
    expect(picked.verdict.winnerId).toBe("vite");
    expect(reportText(picked, { summary: false })).not.toContain("Summary");
    expect(reportText(picked)).toContain("Summary");
  });

  test("mark no winner when the picked mean and median leaders disagree, and chart only the run's own tests", async () => {
    const catalog = await loadCatalog();
    const bundlers = catalog.benchmarks.find((benchmark) => benchmark.slug === "js-bundlers")!;
    const [vite, tsup] = ["vite", "tsup"].map((id) => bundlers.candidates.find((candidate) => candidate.id === id)!);
    const split = { ...bundlers, candidates: [{ ...vite!, statistics: { ...vite!.statistics, meanMs: 10, medianMs: 20 } }, { ...tsup!, statistics: { ...tsup!.statistics, meanMs: 12, medianMs: 15 } }] };
    const test = { id: "t", title: "T", description: "T", unit: "ms", lowerIsBetter: true, results: [{ candidateId: "vite", value: 1 }, { candidateId: "tsup", value: 2 }] };
    const withTests = { ...split, tests: [test], runs: [{ id: "second", label: "Second", environment: split.environment, protocol: split.protocol, publishedAt: split.publishedAt, candidates: split.candidates }] };
    const [primary, second] = runViews(withTests);

    expect(pickFlat(split, runViews(split)[0]!, ["vite", "tsup"]).verdict.winnerId).toBe("");
    expect(pickFlat(withTests, primary!, ["vite", "tsup"]).tests).toHaveLength(1);
    expect(pickFlat(withTests, second!, ["vite", "tsup"]).tests).toEqual([]);
  });

  test("leave no section when the picked candidates never ran in one together", async () => {
    const catalog = await loadCatalog();
    const archive = catalog.benchmarks.find((benchmark) => benchmark.slug === "archive-tile-servers")!;
    const postgis = catalog.benchmarks.find((benchmark) => benchmark.slug === "vector-tile-servers")!;
    const mixed = [...archive.sections!, ...postgis.sections!];

    expect(applyPick(mixed, ["martin-pmtiles", "martin"]).sections).toEqual([]);
    expect(applyPick(mixed, ["martin-pmtiles", "martin"]).omitted).toHaveLength(mixed.length);
  });

  test("head the page with the picked names, or the benchmark title for the whole field", async () => {
    const catalog = await loadCatalog();
    const bundlers = catalog.benchmarks.find((benchmark) => benchmark.slug === "js-bundlers")!;
    const universe = candidateUniverse(runViews(bundlers)[0]!);

    expect(matchupHeading(readPick(null, universe), universe, bundlers.title)).toBe(bundlers.title);
    expect(matchupHeading(readPick("tsup,vite", universe), universe, bundlers.title)).toBe("Vite vs tsup");
    expect(pickerVersion({ ...universe[0]!, name: "Varnish 9.0.3 (plaintext)", version: "9.0.3" })).toBeUndefined();
    expect(pickerVersion({ ...universe[0]!, name: "Martin (PMTiles)", version: "1.16.0" })).toBe("v1.16.0");
  });

  test("live on every benchmark's page, which points its canonical URL at the post and stays out of the sitemap", async () => {
    const index = toCatalogIndex(await loadCatalog());
    const meta = routeMeta("/benchmarks/vector-tile-servers/?pick=martin,tegola", index);
    const tags = headTags(meta);

    expect(meta.status).toBe(200);
    expect(meta.title.startsWith("Matchup: ")).toBe(true);
    expect(meta.description.length).toBeLessThanOrEqual(160);
    expect(tags).toContain('<link rel="canonical" href="https://warefeats.com/posts/2026-09-02-vector-tile-servers-martin-vs-tegola-vs-bbox-vs-pg-tileserv-vs-tipg-vs-ldproxy/" />');
    expect(tags).toContain('<meta property="og:url" content="https://warefeats.com/benchmarks/vector-tile-servers/" />');
    expect(tags).toContain('<meta property="og:image" content="https://warefeats.com/og/benchmarks/vector-tile-servers.png" />');
    expect(routeMeta("/benchmarks/js-linter-tools/", index).status).toBe(200);
    expect(prerenderPaths(index).filter(isBenchmarkPath).sort()).toEqual(index.benchmarks.map((entry) => benchmarkPath(entry.slug)).sort());
    expect(sitemapPaths(index).some(isBenchmarkPath)).toBe(false);
    expect(index.benchmarks.filter((entry) => entry.matchup).map((entry) => entry.slug).sort()).toEqual([...SLUGS].sort());
  });
});

describe("sync validators", () => {
  test("accepts a valid 40-char hex SHA", () => {
    expect(() => validateRef("3de924adf5e656698963a4b797c7cfb044176a4b")).not.toThrow();
  });

  test("rejects a short ref", () => {
    expect(() => validateRef("3de924a")).toThrow("Invalid ref");
  });

  test("rejects an uppercase ref", () => {
    expect(() => validateRef("3DE924ADF5E656698963A4B797C7CFB044176A4B")).toThrow("Invalid ref");
  });

  test("rejects a ref with non-hex characters", () => {
    expect(() => validateRef("zde924adf5e656698963a4b797c7cfb044176a4b")).toThrow("Invalid ref");
  });

  test("accepts a valid run path", () => {
    expect(() => validateRunPath("runs/local-2026-08.json")).not.toThrow();
  });

  test("rejects a path-traversal run path", () => {
    expect(() => validateRunPath("runs/../secrets.json")).toThrow("Invalid run path");
  });

  test("rejects a run path outside the runs directory", () => {
    expect(() => validateRunPath("benchmark.json")).toThrow("Invalid run path");
  });

  test("rejects a run path with subdirectories", () => {
    expect(() => validateRunPath("runs/sub/file.json")).toThrow("Invalid run path");
  });
});

describe("sections-only run assembly", () => {
  test("assembles a benchmark whose alternate run has sections but no candidates", () => {
    const catalog = parseCatalog({
      schemaVersion: 1,
      generatedAt: "2026-08-30T00:00:00Z",
      queue: [],
      benchmarks: [{
        id: "sections-only-alt",
        slug: "sections-only-alt",
        post: "2026-08-29-sections-only-alt-a-vs-b",
        category: "Test",
        title: "Sections-only alternate",
        deck: "Primary has candidates, alternate has sections only",
        publishedAt: "2026-08-30",
        unit: "ms",
        lowerIsBetter: true,
        verdict: { winnerId: "a", headline: "A wins", summary: "A is faster" },
        environment: { machine: "T", chip: "T", cores: "1", memory: "1 GB", os: "T", arch: "arm64", runtime: "T" },
        protocol: { warmups: 3, runs: 10, processModel: "container", cacheState: "warm", output: "TTFB" },
        candidates: [
          { id: "a", name: "A", version: "1.0", statistics: { medianMs: 1, meanMs: 1, minMs: 1, maxMs: 1 }, samplesMs: [1] },
          { id: "b", name: "B", version: "1.0", statistics: { medianMs: 2, meanMs: 2, minMs: 2, maxMs: 2 }, samplesMs: [2] },
        ],
        runs: [{
          id: "cloud",
          label: "Cloud",
          environment: { machine: "EC2", chip: "Graviton3", cores: "4", memory: "8 GB", os: "AL2023", arch: "arm64", runtime: "Docker" },
          protocol: { warmups: 3, runs: 10, processModel: "container", cacheState: "warm", output: "TTFB" },
          publishedAt: "2026-08-30",
          sections: [{
            id: "s1",
            title: "Section 1",
            deck: "First section",
            unit: "ms",
            lowerIsBetter: true,
            verdict: { winnerId: "a", headline: "A wins", summary: "A faster" },
            candidates: [
              { id: "a", name: "A", version: "1.0", statistics: { medianMs: 1, meanMs: 1, minMs: 1, maxMs: 1 }, samplesMs: [1] },
              { id: "b", name: "B", version: "1.0", statistics: { medianMs: 2, meanMs: 2, minMs: 2, maxMs: 2 }, samplesMs: [2] },
            ],
          }],
        }],
        limitations: [],
      }],
    });

    expect(catalog.benchmarks[0]!.runs).toHaveLength(1);
    expect(catalog.benchmarks[0]!.runs![0]!.sections).toHaveLength(1);
    expect(catalog.benchmarks[0]!.runs![0]!.candidates).toBeUndefined();
  });
});

describe("conditions", () => {
  const benchmark: Benchmark = {
    id: "rig",
    slug: "rig",
    post: "2026-08-29-rig-a-vs-b",
    category: "Test",
    title: "Rig",
    deck: "Test",
    publishedAt: "2026-09-02",
    unit: "ms",
    lowerIsBetter: true,
    verdict: { winnerId: "a", headline: "A", summary: "A" },
    environment: { machine: "MacBook Pro", chip: "Apple M2 Max", cores: "12", memory: "96 GB", os: "macOS 15.6", arch: "arm64", runtime: "Bun 1.2" },
    protocol: { warmups: 0, runs: 1, processModel: "single", cacheState: "cold", output: "frame time" },
    candidates: [],
    limitations: [],
  };
  const rigRows = (html: string) => [...html.matchAll(/<dt>([^<]+)<\/dt>/g)].map((m) => m[1]);

  test("lists GPU, Browser and Display rows only when the environment has them", () => {
    const withoutGpu = renderToStaticMarkup(createElement(Conditions, { benchmark }));
    expect(rigRows(withoutGpu)).toEqual(["Machine", "Chip", "Cores", "Memory", "OS", "Runtime", "Warmups", "Measured", "Process", "Cache", "Output"]);

    const gpu = { gpu: "Apple M2 Max 38-core (Metal 3)", browser: "Chromium 140 (ANGLE Metal)", display: "1280×800 @2x, physical display attached" };
    const withGpu = renderToStaticMarkup(createElement(Conditions, { benchmark: { ...benchmark, environment: { ...benchmark.environment, ...gpu } } }));
    expect(rigRows(withGpu)).toEqual(["Machine", "Chip", "Cores", "Memory", "OS", "Runtime", "GPU", "Browser", "Display", "Warmups", "Measured", "Process", "Cache", "Output"]);
    expect(withGpu).toContain("<dt>GPU</dt><dd>Apple M2 Max 38-core (Metal 3)</dd>");
    expect(withGpu).toContain("<dt>Browser</dt><dd>Chromium 140 (ANGLE Metal)</dd>");
    expect(withGpu).toContain("<dt>Display</dt><dd>1280×800 @2x, physical display attached</dd>");
  });
});

describe("runs", () => {
  test("lists the primary run first under its own id and label, then the others", async () => {
    const catalog = await loadCatalog();
    const shells = catalog.benchmarks.find((benchmark) => benchmark.slug === "desktop-shells")!;
    const views = runViews(shells);

    expect(views.map((view) => view.id)).toEqual(["2026-09-10-m2max", "2026-09-10-radeon-680m-win11"]);
    expect(views[0]!.label).toBe(shells.run!.label);
    expect(views[0]!.sections).toBe(shells.sections!);
    expect(views[1]!.environment.chip).toContain("Ryzen 7 6800H");
  });

  test("gives a benchmark with one run a single view", async () => {
    const catalog = await loadCatalog();
    const lint = catalog.benchmarks.find((benchmark) => benchmark.slug === "js-linter-tools")!;
    const views = runViews(lint);

    expect(views).toHaveLength(1);
    expect(views[0]!.candidates).toBe(lint.candidates);
  });
});

describe("charts and versions", () => {
  test("gives each chart its own heading id when two sections reuse a test id", () => {
    const benchmark = { candidates: [{ id: "a", name: "A" }, { id: "b", name: "B" }] } as unknown as Benchmark;
    const test = { id: "p50-ttfb", title: "p50 TTFB", description: "p50", unit: "ms", lowerIsBetter: true, results: [{ candidateId: "a", value: 1 }, { candidateId: "b", value: 2 }] };
    const html = renderToStaticMarkup(createElement("div", null, createElement(BarChart, { benchmark, test, index: 0 }), createElement(BarChart, { benchmark, test, index: 0 })));
    const ids = [...html.matchAll(/<h3 id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(html).toContain(`aria-labelledby="${id}"`);
  });

  test("prefixes v only on release numbers", () => {
    expect(formatVersion("1.16.0")).toBe("v1.16.0");
    expect(formatVersion("2.0.0-beta.3")).toBe("v2.0.0-beta.3");
    expect(formatVersion("stable")).toBe("stable");
    expect(formatVersion("20250131")).toBe("20250131");
    expect(formatVersion("c67fd5f57")).toBe("c67fd5f57");
    expect(formatVersion("df-v1.40.1")).toBe("df-v1.40.1");
  });
});

describe("a post reads takeaway, then evidence", () => {
  const at = (html: string, needle: string) => {
    const index = html.indexOf(needle);
    expect(index).toBeGreaterThan(-1);
    return index;
  };

  test("the verdict leads the page and each section, the protocol sits in the byline, and the charts stack one per row", async () => {
    const catalog = await loadCatalog();
    const benchmark = catalog.benchmarks.find((entry) => entry.slug === "web-map-renderers")!;
    const html = render(postPath(benchmark.post), toCatalogIndex(catalog), benchmark).html.replaceAll("<!-- -->", "");

    expect(at(html, 'class="post-verdict"')).toBeLessThan(at(html, 'id="section-startup"'));
    expect(html).toContain(`<p class="post-verdict">${benchmark.verdict.headline.replaceAll("'", "&#x27;")}.</p>`);
    expect(html).toContain('<span class="num">15</span> measured passes after <span class="num">2</span> warmups.');

    const startup = html.slice(at(html, 'id="section-startup"'), at(html, 'id="section-frame-time"'));
    expect(at(startup, 'class="section-verdict"')).toBeLessThan(at(startup, 'class="test"'));
    expect(startup.match(/<section class="test"/g)).toHaveLength(benchmark.sections![0]!.tests!.length);
    expect(startup.match(/class="test-stack"/g)).toHaveLength(1);
    expect(html).not.toContain("test-grid");
    // The section's summary closes it, after the last chart.
    expect(startup.indexOf('class="section-summary"')).toBeGreaterThan(startup.lastIndexOf('<section class="test"'));
    expect(startup).toContain(`<p class="section-summary">${benchmark.sections![0]!.verdict.summary.replaceAll("'", "&#x27;")}</p>`);
  });
});

describe("open graph cards", () => {
  test("renders the benchmark card with the ratio", async () => {
    const { benchmarkCard } = await import("../src/og");
    const font = async (name: string) => {
      const bytes = await Bun.file(new URL(`../assets/fonts/${name}`, import.meta.url)).arrayBuffer();
      return bytes;
    };
    const fonts = { mono500: await font("MartianMono-500.ttf"), mono700: await font("MartianMono-700.ttf"), sans500: await font("RedHatText-500.ttf") };
    const catalog = await loadCatalog();
    const svg = await benchmarkCard(catalog.benchmarks[0]!, fonts);

    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('width="1200"');
    expect(svg).toContain('height="630"');
  });
});

describe("URLs", () => {
  test("every moved URL lands on a page or card the build writes, in one hop, and no live page is moved away", async () => {
    const index = toCatalogIndex(await loadCatalog());
    const moved: Record<string, string> = JSON.parse(await Bun.file(new URL("../../infra/lib/moved.json", import.meta.url)).text());
    const pages = new Set(prerenderPaths(index));
    const cards = new Set(["/og/site.png", ...index.benchmarks.flatMap((entry) => [`/og/posts/${entry.post}.png`, `/og/benchmarks/${entry.slug}.png`])]);

    for (const [from, to] of Object.entries(moved)) {
      expect(pages.has(to) || cards.has(to)).toBe(true);
      expect(pages.has(from)).toBe(false);
      expect(moved[to]).toBeUndefined();
    }
    // Every post that used to sit at /benchmarks/<old slug>/ moves, except desktop-shells, whose old address is now its benchmark page.
    expect(Object.keys(moved).filter((from) => /^\/benchmarks\/[^/]+\/$/.test(from))).toHaveLength(index.benchmarks.length - 1);
  });

  test("every internal link on every page points at a page the build writes", async () => {
    const catalog = await loadCatalog();
    const index = toCatalogIndex(catalog);
    const pages = new Set(prerenderPaths(index));
    const broken: string[] = [];

    for (const path of prerenderPaths(index)) {
      const slug = pageBenchmark(path, index)?.slug;
      const html = render(path, index, slug ? catalog.benchmarks.find((benchmark) => benchmark.slug === slug) : undefined).html;
      for (const [, href] of html.matchAll(/href="(\/[^"#?]*)/g)) {
        const file = /\.[a-z0-9]+$/i.test(href!);
        if (!file && !pages.has(href!)) broken.push(`${path} -> ${href}`);
      }
    }
    expect(broken).toEqual([]);
  });
});
