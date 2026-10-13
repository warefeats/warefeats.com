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
import { benchmarkPath } from "../head";
import { applyPick, candidateUniverse, matchupField, matchupHeading, pickFlat } from "../matchup";
import { benchmarkTests, formatDate, scorecard } from "../metrics";
import { rigLabel } from "../runs";
import { usePick, useRunSelection } from "../url-state";
import type { Benchmark, BenchmarkSection } from "../types";
import { NotFound } from "./NotFound";

/**
 * A reader-picked view of one benchmark's run, laid out like the post without its prose: each section's charts and the
 * winner computed from its samples, then the conditions and the scorecard, with nothing after it (ADR 0003). It offers
 * every run, fleet runs included, and opens on the newest; a change of pick pins the run in the URL (ADR 0002).
 */
function MatchupContent({ benchmark }: { benchmark: Benchmark }) {
  const { runs, active, select } = useRunSelection(benchmark, "matchup");
  const universe = useMemo(() => candidateUniverse(active), [active]);
  const { pick, toggle, reset } = usePick(universe, active.id);
  const published = benchmarkPath(benchmark.slug);
  const repeats = benchmark.sectionSamples === "repeats";
  const sectioned = Boolean(active.sections?.length);
  const picked = sectioned ? applyPick(active.sections ?? [], pick.ids) : undefined;
  const flat = sectioned ? undefined : pickFlat(benchmark, active, pick.ids);
  const card = picked ? scorecard(picked.sections, repeats) : undefined;
  // The benchmark page shows authored runs only, so a fleet run sends the reader to the post's own run.
  const post = runs[0]!;
  const back = { pathname: published, search: active.fleet || active.id === post.id ? "" : `?run=${encodeURIComponent(active.id)}` };

  return (
    <article className="benchmark matchup">
      <p className="crumbs"><Link to="/">Benchmarks</Link> <span aria-hidden="true">/</span> {benchmark.category} <span aria-hidden="true">/</span> Matchup</p>

      {runs.length > 1 ? <RunToggle runs={runs} active={active.id} onSelect={select} /> : null}

      {/* The picker sits above the heading, which changes length with the pick, so a tick never moves the boxes. */}
      <CandidatePicker universe={universe} picked={pick.ids} onToggle={toggle} onReset={reset} note={pick.ignored ? "That link named fewer than two candidates from this run, so you're seeing all of them." : undefined} />

      <header className="benchmark-head">
        <h1>{matchupHeading(pick, universe, benchmark.title)}</h1>
        <p className="deck">Tick the candidates you care about and the charts, winners and table redraw for just them: same run, same rig, same samples. Winners come from the numbers alone; the story is in the post.</p>
        {active.fleet ? (
          <p className="byline">From the fleet run of <time dateTime={active.publishedAt} className="num">{formatDate(active.publishedAt)}</time> on {rigLabel(active)}: {active.environment.machine}, {active.environment.chip}. The post covers the run of <time dateTime={post.publishedAt} className="num">{formatDate(post.publishedAt)}</time>. <Link to={back}>Read the post</Link></p>
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
              {section.tests?.length ? (
                <div className="test-grid">
                  {section.tests.map((test, testIndex) => (
                    <BarChart benchmark={{ ...benchmark, candidates: section.candidates }} test={test} index={testIndex} key={test.id} />
                  ))}
                </div>
              ) : null}
              <WinnerLine card={card} index={index} />
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
        {tests.length ? (
          <div className="test-grid">
            {tests.map((test, index) => <BarChart benchmark={benchmark} test={test} index={index} key={test.id} />)}
          </div>
        ) : (
          <div className="test-single">
            <BoxPlot benchmark={benchmark} index={0} />
          </div>
        )}
        <WinnerLine card={card} index={0} />
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

  if (load.status === "missing" || matchupField(load.benchmark) === undefined) {
    return <NotFound />;
  }

  return <MatchupContent benchmark={load.benchmark} />;
}
