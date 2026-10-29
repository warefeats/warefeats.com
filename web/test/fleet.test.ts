import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { assembleCatalog } from "../scripts/assemble";
import { buildBenchmark, FLEET_RUN_LIMIT, validatePost, validateRunLists } from "../scripts/sync";
import type { PostFile, RegistryEntry, RunFile, RunnerBenchmark } from "../scripts/sync";
import { parseBenchmark, toCatalogIndex } from "../src/catalog";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WinnerLine } from "../src/components/WinnerLine";
import { render } from "../src/entry-server";
import { BENCHMARKS_PATH, benchmarkPath, postPath, prerenderPaths, routeMeta, sitemapPaths } from "../src/head";
import { candidateUniverse, readPick } from "../src/matchup";
import { formatValue, scorecard } from "../src/metrics";
import { namingPost, postView } from "../src/posts";
import { activeRun, changedCandidates, newestRun, rigLabel, runChoices, runViews, toggleLabels, versionedName } from "../src/runs";
import type { Benchmark, BenchmarkRun } from "../src/types";
import { writePick, writeRun } from "../src/url-state";

const CACHE = join(import.meta.dir, "..", "data", "cache");
const SLUG = "web-map-renderers";
const POST = "2026-09-02-web-map-renderers-mapbox-gl-js-vs-maplibre-gl-js";

/**
 * Splits a cached benchmark back into the runner files sync read, so sync's builder can be checked against its own output.
 * `runs` holds the authored runs, `fleet` the fleet runs and `posts` the later posts, so a test can build on the authored runs alone.
 */
function unbuild(benchmark: Benchmark): { entry: RegistryEntry; meta: RunnerBenchmark; runs: RunFile[]; fleet: RunFile[]; posts: PostFile[] } {
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
  const posts = (benchmark.posts ?? []).map((post): PostFile => ({ schemaVersion: 1, ...post }));
  const meta: RunnerBenchmark = {
    schemaVersion: 1,
    id: benchmark.id,
    slug: benchmark.slug,
    post: benchmark.post,
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
    ...(posts.length ? { posts: posts.map((post) => `posts/${post.slug}.json`) } : {}),
  };
  return { entry: { slug: benchmark.slug, repo: benchmark.runnerUrl!.replace("https://github.com/", ""), ref: "0".repeat(40) }, meta, runs, fleet, posts };
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
      const { entry, meta, runs, fleet, posts } = unbuild(JSON.parse(text));
      expect(JSON.stringify(buildBenchmark(entry, meta, runs, fleet, posts), null, 2) + "\n").toBe(text);
      if (fleet.length === 0) {
        expect(JSON.stringify(buildBenchmark(entry, meta, runs, undefined, posts), null, 2) + "\n").toBe(text);
        expect(JSON.stringify(buildBenchmark(entry, { ...meta, fleetRuns: [] }, runs, [], posts), null, 2) + "\n").toBe(text);
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

  test("names the candidates a run measured at another release than an earlier run", async () => {
    const [primary, fleet] = runViews(await withFleet(["2026-10-12"]));

    expect(changedCandidates(primary!, fleet!).map(versionedName)).toEqual(["MapLibre GL JS 6 v6.13.0"]);
    expect(changedCandidates(fleet!, fleet!)).toEqual([]);
    expect(changedCandidates({ ...primary!, candidates: [], sections: [] }, fleet!).map((candidate) => candidate.id)).toEqual(["mapbox-gl-1-13", "maplibre-gl-5", "maplibre-gl-6"]);
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
    return { post: html(postPath(POST)), matchup: html(benchmarkPath(SLUG)) };
  }

  /** The post's matchup button and the line beside it, and the rest of the post. */
  function matchupLink(post: string): { link: string; rest: string } {
    const link = post.match(/<p class="matchup-link">.*?<\/p>/)?.[0] ?? "";
    return { link, rest: post.replace(link, "") };
  }

  test("the post draws its own run, and its matchup button opens the newest fleet run and names it", async () => {
    const { link, rest } = matchupLink((await pages()).post);

    expect(rest).not.toContain("2026-10-19");
    expect(rest).not.toContain("6.13.0");
    expect(rest).not.toContain("fleet");
    expect(rest).toContain("6.7.0");
    expect(link).toContain(`href="${benchmarkPath(SLUG)}"`);
    expect(link.replace(/<[^>]+>/g, "")).toBe("Build a matchupThe matchup opens on the fleet run of Oct 19, 2026, with MapLibre GL JS 6 v6.13.0.");
  });

  test("the post names the fleet run's rig when it isn't the post's, and every release that moved", async () => {
    const base = await cached(SLUG);
    const mini = withVersion(fleetRun(base, "2026-10-19", { label: "Mac mini / macOS 26, 2026-10-19", environment: { ...base.environment, machine: "Mac mini", chip: "Apple M4" } }), "6.14.0");
    const moved = { ...mini, sections: mini.sections!.map((section) => ({ ...section, candidates: section.candidates.map((candidate) => (candidate.id === "maplibre-gl-5" ? { ...candidate, version: "5.25.0" } : candidate)) })) };
    const { link } = matchupLink((await pages([moved])).post);

    expect(link.replace(/<[^>]+>/g, "")).toBe("Build a matchupThe matchup opens on the fleet run of Oct 19, 2026 on Mac mini / macOS 26, with MapLibre GL JS 5 v5.25.0 and MapLibre GL JS 6 v6.14.0.");
  });

  test("without a fleet run, the post's matchup button opens its run and adds nothing", async () => {
    const { link } = matchupLink((await pages([])).post);

    expect(link).toContain(`href="${benchmarkPath(SLUG)}"`);
    expect(link.replace(/<[^>]+>/g, "")).toBe("Build a matchup");
  });

  test("the matchup opens on the newest fleet run, says so, and offers every run", async () => {
    const { matchup } = await pages();

    expect(matchup).toContain("From the fleet run of");
    expect(matchup).toContain("on Radeon 680M / Windows 11: BOSGAME");
    expect(matchup.replace(/<[^>]+>/g, "")).toContain("The post covers the run of Sep 2, 2026.");
    expect(matchup).toContain("6.13.0");
    expect(matchup.match(/class="run-toggle-btn/g)).toHaveLength(3);
    expect(matchup.match(/class="run-toggle-kind"/g)).toHaveLength(2);
    expect(matchup).toContain(`href="${postPath(POST)}"`);
    expect(matchup).not.toContain(`${postPath(POST)}?run=`);
  });

  test("the matchup's run toggle tells two fleet runs of one day apart", async () => {
    const base = await cached(SLUG);
    const { matchup } = await pages([withVersion(fleetRun(base, "2026-10-12", { id: "2026-10-12-radeon-680m-win11-2" }), "6.14.0"), fleetRun(base, "2026-10-12")]);

    expect(matchup).toContain("Radeon 680M / Windows 11, 2026-10-12, MapLibre GL JS 6 v6.14.0<span class=\"run-toggle-kind\"> fleet</span>");
    expect(matchup).toContain("Radeon 680M / Windows 11, 2026-10-12, MapLibre GL JS 6 v6.13.0<span class=\"run-toggle-kind\"> fleet</span>");
    expect(matchup).toContain("6.14.0");
  });
});

describe("the matchup reads like a post without its prose", () => {
  /** Markup as a reader reads it: tags dropped, entities and spacing tidied. */
  const text = (html: string) => html.replaceAll("<!-- -->", "").replace(/<[^>]+>/g, " ").replaceAll("&#x27;", "'").replace(/\s+/g, " ").replace(/ ([,.])/g, "$1").trim();
  /** A benchmark's page drawn from its authored runs alone, so what it shows doesn't change when the next fleet run lands. */
  const matchupOf = async (slug: string) => {
    const { entry, meta, runs } = unbuild(await cached(slug));
    const benchmark = buildBenchmark(entry, { ...meta, fleetRuns: [] }, runs, []);
    const catalog = await assembleCatalog();
    return render(benchmarkPath(slug), toCatalogIndex(catalog), benchmark).html.replaceAll("<!-- -->", "");
  };

  test("each section opens with its winner, then its charts, then the conditions, then the scorecard last", async () => {
    const html = await matchupOf(SLUG);
    const at = (needle: string) => {
      const index = html.indexOf(needle);
      expect(index).toBeGreaterThan(-1);
      return index;
    };
    const order = [
      at('id="section-startup"'), at('id="section-frame-time"'), at('id="section-memory"'),
      at("Test conditions"), at('id="scorecard-title"'), at("trademark"),
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);

    const winners = [...html.matchAll(/<p class="section-winner">(.*?)<\/p>/g)].map((match) => text(match[1]!));
    expect(winners).toEqual(["Winner Mapbox GL JS 1.13 (192.7 ms)", "Winner MapLibre GL JS 5 (3.1 ms)", "Winner MapLibre GL JS 5 (918.6 MB)"]);
    expect(html.lastIndexOf('class="section-winner"')).toBeLessThan(at('id="scorecard-title"'));
    const anchors = ['id="section-startup"', 'id="section-frame-time"', 'id="section-memory"', "Test conditions"];
    for (let index = 0; index < anchors.length - 1; index++) {
      const section = html.slice(at(anchors[index]!), at(anchors[index + 1]!));
      expect(section.indexOf('class="section-winner"')).toBeGreaterThan(-1);
      expect(section.indexOf('class="section-winner"')).toBeLessThan(section.indexOf('class="test"'));
    }

    const benchmark = await cached(SLUG);
    expect(html).not.toContain(benchmark.sections![0]!.deck);
    expect(html).not.toContain("What this does not prove");
    expect(html).not.toContain(benchmark.limitations[0]!);
  });

  test("a lead inside the run's noise is a tie that names every candidate inside it", async () => {
    // The post's frame-time section with MapLibre 6 a hundredth of a millisecond ahead of MapLibre 5 on every pass.
    const frame = (await cached(SLUG)).sections!.find((section) => section.id === "frame-time")!;
    const five = frame.candidates.find((candidate) => candidate.id === "maplibre-gl-5")!;
    const ahead = five.samplesMs.map((sample) => sample - 0.01);
    const six = { ...frame.candidates.find((candidate) => candidate.id === "maplibre-gl-6")!, samplesMs: ahead, statistics: { ...five.statistics, meanMs: five.statistics.meanMs - 0.01 } };
    const card = scorecard([{ ...frame, candidates: frame.candidates.map((candidate) => (candidate.id === "maplibre-gl-6" ? six : candidate)) }], true);

    expect(card.columns[0]!.tied).toBe(true);
    expect(text(renderToStaticMarkup(createElement(WinnerLine, { card, index: 0 })))).toBe(`Tie MapLibre GL JS 6 (${formatValue(six.statistics.meanMs, "ms")}) and MapLibre GL JS 5 (${formatValue(five.statistics.meanMs, "ms")}), inside this run's noise`);
  });

  test("a benchmark without sections names its winner by time per pass and ends on a one-column scorecard", async () => {
    const slug = "js-bundlers";
    const html = await matchupOf(slug);
    const best = [...(await cached(slug)).candidates].sort((a, b) => a.statistics.meanMs - b.statistics.meanMs)[0]!;
    const winner = text(html.match(/<p class="section-winner">(.*?)<\/p>/)![1]!);

    expect(winner.startsWith(`Winner ${best.name} (`)).toBe(true);
    expect(html.indexOf('class="section-winner"')).toBeLessThan(html.indexOf('class="test"'));
    expect(html.indexOf('class="section-winner"')).toBeLessThan(html.indexOf('id="scorecard-title"'));
    expect(text(html.slice(html.indexOf('id="scorecard-title"')))).toContain("Time per pass");
    expect(html).not.toContain("What this does not prove");
  });
});

describe("later posts", () => {
  const LATER = "2026-10-13-web-map-renderers-maplibre-gl-js-5-vs-6";
  const later = (extra: Partial<PostFile> = {}): PostFile => ({
    schemaVersion: 1,
    slug: LATER,
    publishedAt: "2026-10-13",
    run: "2026-10-12-radeon-680m-win11-2",
    candidates: ["maplibre-gl-5", "maplibre-gl-6"],
    title: "MapLibre GL JS 6.13 vs 5",
    deck: "The fork against itself, one major apart.",
    verdict: { winnerId: "maplibre-gl-6", headline: "MapLibre GL JS 6.13 painted a warm frame faster than 5", summary: "A made-up post for the tests." },
    sections: { startup: "Startup headline", "frame-time": "Frame headline", memory: "Memory headline" },
    limitations: ["One rig."],
    ...extra,
  });
  /** The cached MapLibre benchmark's authored runs and one made-up 6.13.0 fleet run, the newest, which the later post tells. */
  async function inputs() {
    const base = await cached(SLUG);
    const { entry, meta, runs } = unbuild(base);
    const fleet = [fleetRun(base, "2026-10-12", { id: "2026-10-12-radeon-680m-win11-2" })];
    return { entry, meta: { ...meta, fleetRuns: fleet.map((run) => `runs/${run.id}.json`) }, runs, fleet };
  }
  async function withPosts(posts: PostFile[]): Promise<Benchmark> {
    const { entry, meta, runs, fleet } = await inputs();
    return buildBenchmark(entry, { ...meta, posts: posts.map((post) => `posts/${post.slug}.json`) }, runs, fleet, posts);
  }
  async function site(benchmark: Benchmark) {
    const catalog = await assembleCatalog();
    const index = toCatalogIndex({ ...catalog, benchmarks: catalog.benchmarks.map((entry) => (entry.slug === SLUG ? benchmark : entry)) });
    const html = (path: string) => render(path, index, benchmark).html.replaceAll("<!-- -->", "");
    return { index, html };
  }

  test("sync keeps a valid later post and refuses one that breaks the rules", async () => {
    const benchmark = await withPosts([later()]);
    expect(benchmark.posts).toEqual([{ ...later(), schemaVersion: undefined }].map(({ schemaVersion: _, ...post }) => post));

    const { entry, meta, runs, fleet } = await inputs();
    const all = [...runs, ...fleet];
    const refuses = (extra: Partial<PostFile>, message: string) => expect(() => validatePost(SLUG, later(extra), all)).toThrow(message);
    refuses({ slug: "2026-10-13-maplibre-gl-js-5-vs-6" }, "Invalid post");
    refuses({ run: "2026-10-30-radeon-680m-win11" }, "doesn't list");
    refuses({ candidates: ["maplibre-gl-5", "maplibre-gl-7"] }, "doesn't have");
    refuses({ candidates: ["maplibre-gl-6"], verdict: { ...later().verdict } }, "at least two candidates");
    refuses({ verdict: { ...later().verdict, winnerId: "mapbox-gl-1-13" } }, "verdict");
    refuses({ sections: { startup: "Startup headline", memory: "Memory headline" } }, "section frame-time");
    refuses({ sections: { ...later().sections, extra: "Extra" } }, "section extra");
    refuses({ publishedAt: "2026-10-11", slug: "2026-10-11-web-map-renderers-maplibre-gl-js-5-vs-6" }, "before its run");
    expect(() => buildBenchmark(entry, meta, runs, fleet, [later(), later()])).toThrow("two posts");
  });

  test("a later post's page draws its own run, narrowed to its candidates, under its own prose", async () => {
    const benchmark = await withPosts([later()]);
    const view = postView(benchmark, benchmark.posts![0]!);
    expect(view.sections!.map((section) => section.candidates.map((candidate) => candidate.id))).toEqual([["maplibre-gl-5", "maplibre-gl-6"], ["maplibre-gl-5", "maplibre-gl-6"], ["maplibre-gl-5", "maplibre-gl-6"]]);
    expect(view.sections!.map((section) => section.verdict.headline)).toEqual(["Startup headline", "Frame headline", "Memory headline"]);
    expect(view.runs).toBeUndefined();

    const { html } = await site(benchmark);
    const page = html(postPath(LATER));
    expect(page).toContain("<h1>MapLibre GL JS 6.13 vs 5</h1>");
    expect(page).toContain("The fork against itself, one major apart.");
    expect(page).toContain("Frame headline");
    expect(page).not.toContain("Mapbox GL JS 1.13</");
    expect(page).toContain(`href="${benchmarkPath(SLUG)}"`);
    // The matchup opens on this post's own run, so the button names no other run.
    expect(page).not.toContain("matchup-link-note");
    // The first post still points at the fleet run it doesn't tell.
    expect(html(postPath(POST))).toContain("The matchup opens on the fleet run of");
  });

  test("a later post sits on the timeline and in the sitemap, and the benchmark page sends its run's readers to it", async () => {
    const benchmark = await withPosts([later()]);
    const { index, html } = await site(benchmark);

    expect(html("/").indexOf(`href="${postPath(LATER)}"`)).toBeGreaterThan(-1);
    expect(html("/").indexOf(`href="${postPath(LATER)}"`)).toBeLessThan(html("/").indexOf(`href="${postPath(POST)}"`));
    expect(sitemapPaths(index)).toContain(postPath(LATER));
    expect(prerenderPaths(index)).toContain(postPath(LATER));
    const meta = routeMeta(postPath(LATER), index);
    expect([meta.status, meta.title, meta.image, meta.publishedAt]).toEqual([200, "MapLibre GL JS 6.13 vs 5 | warefeats", `https://warefeats.com/og/posts/${LATER}.png`, "2026-10-13"]);

    const matchup = html(benchmarkPath(SLUG)).replace(/<[^>]+>/g, "").replaceAll("&#x27;", "'");
    expect(matchup).toContain("A post tells this run's story.");
    expect(html(benchmarkPath(SLUG))).toContain(`href="${postPath(LATER)}"`);
  });

  test("the newest post that tells its run's whole lineup names the benchmark page; a narrower one leaves the first post's name", async () => {
    const narrow = await withPosts([later()]);
    expect(namingPost(narrow).post).toBe(POST);
    const narrowSite = await site(narrow);
    expect(narrowSite.html(benchmarkPath(SLUG))).toContain("<h1>MapLibre GL JS vs Mapbox GL JS</h1>");
    expect(routeMeta(benchmarkPath(SLUG), narrowSite.index).canonical).toBe(postPath(POST));

    const whole = await withPosts([later({ candidates: ["mapbox-gl-1-13", "maplibre-gl-5", "maplibre-gl-6"] })]);
    expect([namingPost(whole).post, namingPost(whole).title]).toEqual([LATER, "MapLibre GL JS 6.13 vs 5"]);
    const { index, html } = await site(whole);
    expect(html(BENCHMARKS_PATH)).toContain(`<a href="${benchmarkPath(SLUG)}" data-discover="true">MapLibre GL JS 6.13 vs 5</a>`);
    expect(html(benchmarkPath(SLUG))).toContain("<h1>MapLibre GL JS 6.13 vs 5</h1>");
    const meta = routeMeta(benchmarkPath(SLUG), index);
    expect([meta.title, meta.canonical]).toEqual(["Matchup: MapLibre GL JS 6.13 vs 5 | warefeats", postPath(LATER)]);
    // The first post keeps its own title on its page and on the timeline.
    expect(html(postPath(POST))).toContain("<h1>MapLibre GL JS vs Mapbox GL JS</h1>");
    expect(html("/")).toContain(">MapLibre GL JS vs Mapbox GL JS</a>");
  });
});
