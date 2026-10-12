import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { assembleCatalog } from "../scripts/assemble";
import { buildBenchmark, FLEET_RUN_LIMIT, validateRunLists } from "../scripts/sync";
import type { RegistryEntry, RunFile, RunnerBenchmark } from "../scripts/sync";
import { parseBenchmark, toCatalogIndex } from "../src/catalog";
import { render } from "../src/entry-server";
import { matchupPath } from "../src/head";
import { candidateUniverse, readPick } from "../src/matchup";
import { activeRun, newestRun, rigLabel, runChoices, runViews, toggleLabels } from "../src/runs";
import type { Benchmark, BenchmarkRun } from "../src/types";
import { writePick, writeRun } from "../src/url-state";

const CACHE = join(import.meta.dir, "..", "data", "cache");
const SLUG = "maplibre-gl-js-vs-mapbox-gl-js";

/**
 * Splits a cached benchmark back into the runner files sync read, so sync's builder can be checked against its own output.
 * `runs` holds the authored runs and `fleet` the fleet runs, so a test can build on the authored runs alone.
 */
function unbuild(benchmark: Benchmark): { entry: RegistryEntry; meta: RunnerBenchmark; runs: RunFile[]; fleet: RunFile[] } {
  const runFile = (run: Pick<BenchmarkRun, "id" | "label" | "publishedAt" | "environment" | "protocol" | "candidates" | "sections">): RunFile => ({
    schemaVersion: 1,
    id: run.id,
    label: run.label,
    publishedAt: run.publishedAt,
    environment: run.environment,
    protocol: run.protocol,
    ...(run.candidates ? { candidates: run.candidates } : {}),
    ...(run.sections ? { sections: run.sections } : {}),
  });
  const primary = runFile({ id: benchmark.run!.id, label: benchmark.run!.label, publishedAt: benchmark.publishedAt, environment: benchmark.environment, protocol: benchmark.protocol, candidates: benchmark.candidates, ...(benchmark.sections ? { sections: benchmark.sections } : {}) });
  const runs = [primary, ...(benchmark.runs ?? []).filter((run) => !run.fleet).map(runFile)];
  const fleet = (benchmark.runs ?? []).filter((run) => run.fleet).map(runFile);
  const meta: RunnerBenchmark = {
    schemaVersion: 1,
    id: benchmark.id,
    slug: benchmark.slug,
    category: benchmark.category,
    title: benchmark.title,
    deck: benchmark.deck,
    unit: benchmark.unit,
    lowerIsBetter: benchmark.lowerIsBetter,
    ...(benchmark.sectionSamples ? { sectionSamples: benchmark.sectionSamples } : {}),
    verdict: benchmark.verdict,
    ...(benchmark.corpus ? { corpus: benchmark.corpus } : {}),
    ...(benchmark.ruleMap ? { ruleMap: benchmark.ruleMap } : {}),
    limitations: benchmark.limitations,
    ...(benchmark.trademarks ? { trademarks: benchmark.trademarks } : {}),
    runs: runs.map((run) => `runs/${run.id}.json`),
    ...(fleet.length ? { fleetRuns: fleet.map((run) => `runs/${run.id}.json`) } : {}),
  };
  return { entry: { slug: benchmark.slug, repo: benchmark.runnerUrl!.replace("https://github.com/", ""), ref: "0".repeat(40) }, meta, runs, fleet };
}

async function cached(slug: string): Promise<Benchmark> {
  return JSON.parse(await readFile(join(CACHE, `${slug}.json`), "utf8"));
}

/** A made-up fleet run of the cached MapLibre benchmark: the primary's numbers under a new id, date and MapLibre 6 release. */
function fleetRun(base: Benchmark, date: string, extra: Record<string, unknown> = {}): RunFile {
  return {
    schemaVersion: 1,
    id: `${date}-radeon-680m-win11`,
    label: `Radeon 680M / Windows 11, ${date}`,
    publishedAt: date,
    environment: { ...base.environment, os: "Microsoft Windows 11 Pro 25H2 (build 26300)" },
    protocol: base.protocol,
    candidates: [],
    sections: base.sections!.map((section) => ({ ...section, candidates: section.candidates.map((candidate) => (candidate.id === "maplibre-gl-6" ? { ...candidate, version: "6.13.0" } : candidate)) })),
    ...extra,
  } as RunFile;
}

/** A run with MapLibre 6 at another release. */
function withVersion(run: RunFile, version: string): RunFile {
  return { ...run, sections: run.sections!.map((section) => ({ ...section, candidates: section.candidates.map((candidate) => (candidate.id === "maplibre-gl-6" ? { ...candidate, version } : candidate)) })) };
}

/** The cached MapLibre benchmark's authored runs and the given fleet runs, newest first, in place of any real ones. */
async function withFleetRuns(fleet: RunFile[]): Promise<Benchmark> {
  const { entry, meta, runs } = unbuild(await cached(SLUG));
  return buildBenchmark(entry, { ...meta, fleetRuns: fleet.map((run) => `runs/${run.id}.json`) }, runs, fleet);
}

/** The cached MapLibre benchmark's authored runs, with made-up fleet runs in place of any real ones. */
async function withFleet(dates: string[]): Promise<Benchmark> {
  const base = await cached(SLUG);
  const { entry, meta, runs } = unbuild(base);
  const fleet = dates.map((date) => fleetRun(base, date));
  return buildBenchmark(entry, { ...meta, fleetRuns: fleet.map((run) => `runs/${run.id}.json`) }, runs, fleet);
}

describe("sync with fleet runs", () => {
  test("rebuilds every cached benchmark byte for byte, and without fleet runs when the runner lists none", async () => {
    const files = (await readdir(CACHE)).filter((file) => file.endsWith(".json") && file !== "manifest.json");
    expect(files.length).toBeGreaterThanOrEqual(8);

    for (const file of files) {
      const text = await readFile(join(CACHE, file), "utf8");
      const { entry, meta, runs, fleet } = unbuild(JSON.parse(text));
      expect(JSON.stringify(buildBenchmark(entry, meta, runs, fleet), null, 2) + "\n").toBe(text);
      if (fleet.length === 0) {
        expect(JSON.stringify(buildBenchmark(entry, meta, runs), null, 2) + "\n").toBe(text);
        expect(JSON.stringify(buildBenchmark(entry, { ...meta, fleetRuns: [] }, runs, []), null, 2) + "\n").toBe(text);
      }
    }
  });

  test("appends fleet runs after the authored runs, flagged, in the runner's order, without provenance or lineup", async () => {
    const base = await cached("desktop-shells");
    const { entry, meta, runs } = unbuild(base);
    const fleet = [fleetRun(base as Benchmark, "2026-10-19", { provenance: { kind: "fleet" }, lineup: [] }), fleetRun(base as Benchmark, "2026-10-12")];
    const built = buildBenchmark(entry, { ...meta, fleetRuns: fleet.map((run) => `runs/${run.id}.json`) }, runs, fleet);

    expect(built.runs!.map((run) => [run.id, run.fleet ?? false])).toEqual([["2026-09-10-radeon-680m-win11", false], ["2026-10-19-radeon-680m-win11", true], ["2026-10-12-radeon-680m-win11", true]]);
    expect(Object.keys(built.runs![1]!)).toEqual(["id", "label", "fleet", "environment", "protocol", "publishedAt", "sections"]);
    expect(built.run).toEqual(base.run!);
    expect(parseBenchmark(built)).toBe(built);
  });

  test("checks the run lists: at most four fleet runs, valid paths, nothing listed twice, no shared ids", async () => {
    const runs = ["runs/a.json"];
    const fleet = (count: number) => Array.from({ length: count }, (_, i) => `runs/f${i}.json`);

    expect(() => validateRunLists("x", { runs, fleetRuns: fleet(FLEET_RUN_LIMIT) })).not.toThrow();
    expect(() => validateRunLists("x", { runs })).not.toThrow();
    expect(() => validateRunLists("x", { runs, fleetRuns: fleet(FLEET_RUN_LIMIT + 1) })).toThrow("at most 4");
    expect(() => validateRunLists("x", { runs, fleetRuns: ["runs/a.json"] })).toThrow("twice");
    expect(() => validateRunLists("x", { runs, fleetRuns: ["../secret.json"] })).toThrow("Invalid run path");
    expect(() => validateRunLists("x", { runs, fleetRuns: "runs/f.json" as unknown as string[] })).toThrow("invalid fleetRuns");
    expect(() => validateRunLists("x", { runs: [], fleetRuns: fleet(1) })).toThrow("no runs");

    const base = await cached(SLUG);
    const { entry, meta, runs: files } = unbuild(base);
    const twin = { ...fleetRun(base, "2026-10-12"), id: files[0]!.id };
    expect(() => buildBenchmark(entry, meta, files, [twin])).toThrow("two runs with the id");
  });

  test("accepts the fleet flag on a run and rejects anything but true", async () => {
    const built = await withFleet(["2026-10-12"]);
    expect(parseBenchmark(built).runs![0]!.fleet).toBe(true);
    expect(() => parseBenchmark({ ...built, runs: [{ ...built.runs![0]!, fleet: "yes" }] })).toThrow("invalid fleet flag");
  });
});

describe("which run a page shows", () => {
  test("a post offers only its authored runs and ignores a fleet run named in the URL", async () => {
    const benchmark = await withFleet(["2026-10-19", "2026-10-12"]);
    const post = runChoices(benchmark, "post");

    expect(post.runs.map((run) => run.id)).toEqual(["2026-09-02-radeon-680m-win11"]);
    expect(post.fallback.id).toBe("2026-09-02-radeon-680m-win11");
    expect(activeRun(post, "2026-10-12-radeon-680m-win11").id).toBe("2026-09-02-radeon-680m-win11");
    expect(activeRun(post, null).id).toBe("2026-09-02-radeon-680m-win11");
  });

  test("a matchup offers every run, opens on the newest, and keeps candidate ids across a run switch", async () => {
    const benchmark = await withFleet(["2026-10-19", "2026-10-12"]);
    const matchup = runChoices(benchmark, "matchup");

    expect(matchup.runs.map((run) => run.id)).toEqual(["2026-09-02-radeon-680m-win11", "2026-10-19-radeon-680m-win11", "2026-10-12-radeon-680m-win11"]);
    expect(matchup.fallback.id).toBe("2026-10-19-radeon-680m-win11");
    expect(activeRun(matchup, "2026-10-12-radeon-680m-win11").id).toBe("2026-10-12-radeon-680m-win11");
    expect(activeRun(matchup, "2026-09-02-radeon-680m-win11").id).toBe("2026-09-02-radeon-680m-win11");
    expect(activeRun(matchup, "nope").id).toBe("2026-10-19-radeon-680m-win11");

    const before = candidateUniverse(matchup.runs[0]!);
    const after = candidateUniverse(matchup.fallback);
    expect(readPick("maplibre-gl-5,maplibre-gl-6", after).ids).toEqual(readPick("maplibre-gl-5,maplibre-gl-6", before).ids);
    expect(after.find((candidate) => candidate.id === "maplibre-gl-6")!.version).toBe("6.13.0");
  });

  test("breaks a date tie toward the fleet run, then toward the earlier entry", async () => {
    const base = await cached(SLUG);
    const { entry, meta, runs } = unbuild(base);
    const ties = [fleetRun(base, "2026-09-02", { id: "2026-09-02-radeon-680m-win11-2" }), fleetRun(base, "2026-09-02", { id: "2026-09-02-radeon-680m-win11-1" })];
    const views = runViews(buildBenchmark(entry, { ...meta, fleetRuns: ties.map((run) => `runs/${run.id}.json`) }, runs, ties));

    expect(newestRun(views).id).toBe("2026-09-02-radeon-680m-win11-2");
    expect(newestRun(views).fleet).toBe(true);
    const authoredOnly = runViews(await cached("desktop-shells"));
    expect(newestRun(authoredOnly).id).toBe("2026-09-10-m2max");
    expect(runChoices(buildBenchmark(entry, meta, runs), "matchup").fallback.id).toBe("2026-09-02-radeon-680m-win11");
  });

  test("names the rig without repeating the date a fleet run's label ends with", async () => {
    const [primary, fleet] = runViews(await withFleet(["2026-10-12"]));
    expect(rigLabel(fleet!)).toBe("Radeon 680M / Windows 11");
    expect(rigLabel(primary!)).toBe(primary!.label);
  });

  test("tells runs that share a label apart by the versions that differ, then by id", async () => {
    const base = await cached(SLUG);
    const morning = fleetRun(base, "2026-10-12");
    const evening = withVersion(fleetRun(base, "2026-10-12", { id: "2026-10-12-radeon-680m-win11-2" }), "6.14.0");
    const rerun = fleetRun(base, "2026-10-12", { id: "2026-10-12-radeon-680m-win11-3" });
    const labels = async (fleet: RunFile[]) => toggleLabels(runViews(await withFleetRuns(fleet)));

    const two = await labels([evening, morning]);
    expect(two.get("2026-09-02-radeon-680m-win11")).toBe("Radeon 680M / Windows 11 (local)");
    expect(two.get("2026-10-12-radeon-680m-win11-2")).toBe("Radeon 680M / Windows 11, 2026-10-12, MapLibre GL JS 6 v6.14.0");
    expect(two.get("2026-10-12-radeon-680m-win11")).toBe("Radeon 680M / Windows 11, 2026-10-12, MapLibre GL JS 6 v6.13.0");

    const same = await labels([rerun, morning]);
    expect(same.get("2026-10-12-radeon-680m-win11-3")).toBe("Radeon 680M / Windows 11, 2026-10-12, 2026-10-12-radeon-680m-win11-3");
    expect(same.get("2026-10-12-radeon-680m-win11")).toBe("Radeon 680M / Windows 11, 2026-10-12, 2026-10-12-radeon-680m-win11");

    const three = await labels([evening, rerun, morning]);
    expect(three.get("2026-10-12-radeon-680m-win11-2")).toBe("Radeon 680M / Windows 11, 2026-10-12, MapLibre GL JS 6 v6.14.0");
    expect(three.get("2026-10-12-radeon-680m-win11-3")).toBe("Radeon 680M / Windows 11, 2026-10-12, MapLibre GL JS 6 v6.13.0, 2026-10-12-radeon-680m-win11-3");

    const apart = await labels([fleetRun(base, "2026-10-19"), morning]);
    expect([...apart.values()]).toEqual(["Radeon 680M / Windows 11 (local)", "Radeon 680M / Windows 11, 2026-10-19", "Radeon 680M / Windows 11, 2026-10-12"]);
  });
});

describe("matchup URLs", () => {
  const universe = [{ id: "a" }, { id: "b" }, { id: "c" }] as Benchmark["candidates"];

  test("a change of pick on a matchup writes the run it was made on", () => {
    const params = new URLSearchParams();
    writePick(params, ["c", "a"], universe, "2026-10-19-radeon-680m-win11");
    expect(params.toString()).toBe("pick=a%2Cc&run=2026-10-19-radeon-680m-win11");

    writePick(params, ["a", "b", "c"], universe, "2026-10-19-radeon-680m-win11");
    expect(params.toString()).toBe("run=2026-10-19-radeon-680m-win11");
  });

  test("a pick without a run to pin leaves the run alone", () => {
    const params = new URLSearchParams("run=x");
    writePick(params, ["a", "b"], universe);
    expect(params.toString()).toBe("run=x&pick=a%2Cb");
  });

  test("a post keeps its primary run out of the URL; a matchup always names the run", () => {
    const post = new URLSearchParams("run=other");
    writeRun(post, "primary", "post", "primary");
    expect(post.has("run")).toBe(false);

    const matchup = new URLSearchParams();
    writeRun(matchup, "newest", "matchup", "newest");
    expect(matchup.get("run")).toBe("newest");
  });
});

describe("pages with fleet runs", () => {
  async function pages(fleet?: RunFile[]) {
    const benchmark = fleet ? await withFleetRuns(fleet) : await withFleet(["2026-10-19", "2026-10-12"]);
    const catalog = await assembleCatalog();
    const index = toCatalogIndex({ ...catalog, benchmarks: catalog.benchmarks.map((entry) => (entry.slug === SLUG ? benchmark : entry)) });
    // React separates adjacent text nodes with empty comments; the assertions read the text as a reader would.
    const html = (path: string) => render(path, index, benchmark).html.replaceAll("<!-- -->", "");
    return { post: html(`/benchmarks/${SLUG}/`), matchup: html(matchupPath(SLUG)) };
  }

  test("the post draws its own run, never mentions a fleet run, and links the matchup to its run", async () => {
    const { post } = await pages();

    expect(post).not.toContain("2026-10-19");
    expect(post).not.toContain("6.13.0");
    expect(post).not.toContain("fleet");
    expect(post).toContain(`href="${matchupPath(SLUG)}?run=2026-09-02-radeon-680m-win11"`);
  });

  test("the matchup opens on the newest fleet run, says so, and offers every run", async () => {
    const { matchup } = await pages();

    expect(matchup).toContain("From the fleet run of");
    expect(matchup).toContain("on Radeon 680M / Windows 11: BOSGAME");
    expect(matchup).toContain("A fleet run carries no verdict");
    expect(matchup).toContain("6.13.0");
    expect(matchup.match(/class="run-toggle-btn/g)).toHaveLength(3);
    expect(matchup.match(/class="run-toggle-kind"/g)).toHaveLength(2);
    expect(matchup).toContain(`href="/benchmarks/${SLUG}/"`);
    expect(matchup).not.toContain(`/benchmarks/${SLUG}/?run=`);
  });

  test("the matchup's run toggle tells two fleet runs of one day apart", async () => {
    const base = await cached(SLUG);
    const { matchup } = await pages([withVersion(fleetRun(base, "2026-10-12", { id: "2026-10-12-radeon-680m-win11-2" }), "6.14.0"), fleetRun(base, "2026-10-12")]);

    expect(matchup).toContain("Radeon 680M / Windows 11, 2026-10-12, MapLibre GL JS 6 v6.14.0<span class=\"run-toggle-kind\"> fleet</span>");
    expect(matchup).toContain("Radeon 680M / Windows 11, 2026-10-12, MapLibre GL JS 6 v6.13.0<span class=\"run-toggle-kind\"> fleet</span>");
    expect(matchup).toContain("6.14.0");
  });
});
