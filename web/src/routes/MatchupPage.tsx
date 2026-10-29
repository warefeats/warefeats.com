import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { useBenchmark } from "../catalog-context";
import { BarChart } from "../components/BarChart";
import { BoxPlot } from "../components/BoxPlot";
import { CandidatePicker } from "../components/CandidatePicker";
import { Conditions } from "../components/Conditions";
import { CopyReport } from "../components/CopyReport";
import { ReportBlock } from "../components/ReportBlock";
import { RunToggle } from "../components/RunToggle";
import { Scorecard } from "../components/Scorecard";
import { CatalogSkeleton, ErrorState } from "../components/States";
import { WinnerLine } from "../components/WinnerLine";
import { BENCHMARKS_PATH, postPath } from "../head";
import { applyPick, candidateUniverse, MATCHUP_FIELD, matchupHeading, pickFlat } from "../matchup";
import { benchmarkTests, formatDate, scorecard, sectionTests } from "../metrics";
import { namingPost, postForRun } from "../posts";
import { rigLabel } from "../runs";
import { usePick, useRunSelection } from "../url-state";
import type { Benchmark, BenchmarkSection } from "../types";
import { NotFound } from "./NotFound";

/**
 * A benchmark's page: a reader-picked view of one of its runs, laid out like the post without its prose. Each section
 * opens with the winner computed from its samples, then its charts (ADR 0007), then the conditions and the scorecard,
 * with nothing after it (ADR 0003). It offers every run, fleet runs included, and opens on the newest; a change of pick
 * pins the run in the URL (ADR 0002). It lives at the benchmark's category, /benchmarks/<slug>/ (ADR 0004).
 */
function MatchupContent({ benchmark }: { benchmark: Benchmark }) {
  const { runs, active, select } = useRunSelection(benchmark, "matchup");
  const universe = useMemo(() => candidateUniverse(active), [active]);
  const { pick, toggle, reset } = usePick(universe, active.id);
  const published = postPath(benchmark.post);
  // Two candidates leave nothing to pick: both stay on the page.
  const pickable = universe.length >= MATCHUP_FIELD;
  const repeats = benchmark.sectionSamples === "repeats";
  const sectioned = Boolean(active.sections?.length);
  const picked = sectioned ? applyPick(active.sections ?? [], pick.ids) : undefined;
  const flat = sectioned ? undefined : pickFlat(benchmark, active, pick.ids);
  const card = picked ? scorecard(picked.sections, repeats) : undefined;
  // A later post that tells the run on screen is the post to read; otherwise the first post, on its own run when a
  // fleet run is showing, since a post draws only the runs it was written against.
  const primary = runs[0]!;
  const covering = postForRun(benchmark, active.id);
  const named = namingPost(benchmark);
  const back = covering ? { pathname: postPath(covering.slug) } : { pathname: published, search: active.fleet || active.id === primary.id ? "" : `?run=${encodeURIComponent(active.id)}` };

  return (
    <article className="benchmark matchup">
      <p className="crumbs"><Link to={BENCHMARKS_PATH}>Benchmarks</Link> <span aria-hidden="true">/</span> {benchmark.category}</p>

      {runs.length > 1 ? <RunToggle runs={runs} active={active.id} onSelect={select} /> : null}

      {/* The picker sits above the heading, which changes length with the pick, so a tick never moves the boxes. */}
      {pickable ? <CandidatePicker universe={universe} picked={pick.ids} onToggle={toggle} onReset={reset} note={pick.ignored ? "That link named fewer than two candidates from this run, so you're seeing all of them." : undefined} /> : null}

      <header className="benchmark-head">
        <h1>{matchupHeading(pick, universe, named.title)}</h1>
        <p className="deck">{pickable ? "Tick the candidates you care about and the charts, winners and table redraw for just them: same run, same rig, same samples." : "Every candidate on one rig, from the same samples."} Winners come from the numbers alone; the story is in the post.</p>
        {active.fleet ? (
          <p className="byline">From the fleet run of <time dateTime={active.publishedAt} className="num">{formatDate(active.publishedAt)}</time> on {rigLabel(active)}: {active.environment.machine}, {active.environment.chip}. {covering ? "A post tells this run's story. " : <>The post covers the run of <time dateTime={primary.publishedAt} className="num">{formatDate(primary.publishedAt)}</time>. </>}<Link to={back}>Read the post</Link></p>
        ) : (
          <p className="byline">From the run of <time dateTime={active.publishedAt} className="num">{formatDate(active.publishedAt)}</time> on {active.environment.machine}, {active.environment.chip}. <Link to={back}>Read the post</Link></p>
        )}
      </header>

      {picked && picked.sections.length === 0 ? <p className="matchup-empty">No section ran two of the candidates you picked.</p> : null}

      {picked && card && picked.sections.length > 0 ? (
        <>
          {picked.sections.map((section, index) => (
            <section className="benchmark-section" key={section.id} aria-labelledby={`section-${section.id}`}>
              <h2 id={`section-${section.id}`}>{section.title}</h2>
              <WinnerLine card={card} index={index} />
              <div className="test-stack">
                {sectionTests(section).map((test, testIndex) => (
                  <BarChart benchmark={{ ...benchmark, candidates: section.candidates }} test={test} index={testIndex} key={test.id} />
                ))}
              </div>
            </section>
          ))}

          {picked.omitted.length ? <p className="matchup-omitted">Not in this matchup: {picked.omitted.map((section) => section.title).join(", ")}. Fewer than two of the candidates you picked ran them.</p> : null}

          <Conditions benchmark={{ ...benchmark, environment: active.environment, protocol: active.protocol }} />

          <OverallTable sections={picked.sections} repeats={repeats} caption="Mean of each section's samples for the candidates you picked. The best value in each column is marked in red." trademarks={benchmark.trademarks} />
        </>
      ) : null}

      {flat ? <FlatTests benchmark={flat} repeats={repeats} /> : null}
    </article>
  );
}

/** The matchup's last word: the scorecard for the pick, and nothing after it but the products' trademark notices. */
function OverallTable({ sections, repeats, caption, trademarks }: { sections: BenchmarkSection[]; repeats: boolean; caption: string; trademarks: string[] | undefined }) {
  return (
    <section className="matchup-scorecard" aria-labelledby="scorecard-title">
      <h2 id="scorecard-title">Scorecard</h2>
      <Scorecard sections={sections} repeats={repeats} caption={caption} />
      {trademarks ? <p className="limits-foot">{trademarks.join(" ")}</p> : null}
    </section>
  );
}

/**
 * A benchmark without sections, narrowed to the pick: the same charts and hyperfine blocks, the winner by mean time per
 * pass, then the conditions and a one-column scorecard.
 */
function FlatTests({ benchmark, repeats }: { benchmark: Benchmark; repeats: boolean }) {
  const tests = benchmarkTests(benchmark);
  const timePerPass: BenchmarkSection = { id: "time-per-pass", title: "Time per pass", deck: "", unit: benchmark.unit, lowerIsBetter: benchmark.lowerIsBetter, verdict: benchmark.verdict, candidates: benchmark.candidates };
  const card = scorecard([timePerPass], repeats);

  return (
    <>
      <section className="tests" aria-labelledby="tests-title">
        <h2 id="tests-title">Tests</h2>
        <WinnerLine card={card} index={0} />
        {tests.length ? (
          <div className="test-stack">
            {tests.map((test, index) => <BarChart benchmark={benchmark} test={test} index={index} key={test.id} />)}
          </div>
        ) : (
          <div className="test-stack">
            <BoxPlot benchmark={benchmark} index={0} />
          </div>
        )}
        <details className="report-details">
          <summary>Full report, as hyperfine prints it</summary>
          <div className="report-grid">
            {benchmark.candidates.map((candidate, index) => <ReportBlock benchmark={benchmark} candidate={candidate} index={index} key={candidate.id} />)}
          </div>
          <div className="report-actions">
            <CopyReport benchmark={benchmark} summary={false} />
          </div>
        </details>
      </section>

      <Conditions benchmark={benchmark} />

      <OverallTable sections={[timePerPass]} repeats={repeats} caption="Mean time per pass for the candidates you picked. The best value is marked in red." trademarks={benchmark.trademarks} />
    </>
  );
}

export function MatchupPage() {
  const { slug } = useParams();
  const load = useBenchmark(slug);

  if (load.status === "loading") {
    return <CatalogSkeleton />;
  }

  if (load.status === "error") {
    return <ErrorState message={load.message} onRetry={load.retry} />;
  }

  if (load.status === "missing") {
    return <NotFound />;
  }

  return <MatchupContent benchmark={load.benchmark} />;
}
