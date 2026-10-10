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
import { REPO_URL } from "../components/SiteHeader";
import { CatalogSkeleton, ErrorState } from "../components/States";
import { benchmarkPath } from "../head";
import { applyPick, candidateUniverse, matchupField, matchupHeading, pickFlat } from "../matchup";
import { benchmarkTests, formatDate } from "../metrics";
import { usePick, useRunSelection } from "../url-state";
import type { Benchmark } from "../types";
import { NotFound } from "./NotFound";

/** A reader-picked view of one benchmark's run: its charts and tables for the candidates ticked, and no verdict (ADR 0001). */
function MatchupContent({ benchmark }: { benchmark: Benchmark }) {
  const { runs, active, select } = useRunSelection(benchmark);
  const universe = useMemo(() => candidateUniverse(active), [active]);
  const { pick, toggle, reset } = usePick(universe);
  const published = benchmarkPath(benchmark.slug);
  const sectioned = Boolean(active.sections?.length);
  const picked = sectioned ? applyPick(active.sections ?? [], pick.ids) : undefined;
  const flat = sectioned ? undefined : pickFlat(benchmark, active, pick.ids);
  const back = { pathname: published, search: active.id === runs[0]!.id ? "" : `?run=${encodeURIComponent(active.id)}` };

  return (
    <article className="benchmark matchup">
      <header className="benchmark-head">
        <p className="crumbs"><Link to="/">Benchmarks</Link> <span aria-hidden="true">/</span> {benchmark.category} <span aria-hidden="true">/</span> Matchup</p>
        <h1>{matchupHeading(pick, universe, benchmark.title)}</h1>
        <p className="deck">Tick the candidates you care about and the charts and tables redraw for just them: same run, same rig, same samples. The verdict stays on the published page.</p>
        <p className="byline">From the run of <time dateTime={active.publishedAt} className="num">{formatDate(active.publishedAt)}</time> on {active.environment.machine}, {active.environment.chip}. <Link to={back}>Read the published benchmark</Link></p>
      </header>

      {runs.length > 1 ? <RunToggle runs={runs} active={active.id} onSelect={select} /> : null}

      <CandidatePicker universe={universe} picked={pick.ids} onToggle={toggle} onReset={reset} note={pick.ignored ? "That link named fewer than two candidates from this run, so you're seeing all of them." : undefined} />

      {picked && picked.sections.length === 0 ? <p className="matchup-empty">No section ran two of the candidates you picked.</p> : null}

      {picked && picked.sections.length > 0 ? (
        <>
          <section className="matchup-scorecard" aria-labelledby="scorecard-title">
            <h2 id="scorecard-title">Scorecard</h2>
            <Scorecard sections={picked.sections} caption="Mean of each section's samples for the candidates you picked. The best value in each column is marked in red." />
          </section>

          {picked.sections.map((section) => (
            <section className="benchmark-section" key={section.id} aria-labelledby={`section-${section.id}`}>
              <h2 id={`section-${section.id}`}>{section.title}</h2>
              <p className="deck">{section.deck}</p>
              {section.tests?.length ? (
                <div className="test-grid">
                  {section.tests.map((test, index) => (
                    <BarChart benchmark={{ ...benchmark, candidates: section.candidates }} test={test} index={index} key={test.id} />
                  ))}
                </div>
              ) : null}
            </section>
          ))}

          {picked.omitted.length ? <p className="matchup-omitted">Not in this matchup: {picked.omitted.map((section) => section.title).join(", ")}. Fewer than two of the candidates you picked ran them.</p> : null}
        </>
      ) : null}

      {picked ? <Conditions benchmark={{ ...benchmark, environment: active.environment, protocol: active.protocol }} /> : null}

      {flat ? <FlatTests benchmark={flat} /> : null}

      <section className="matchup-limits" aria-labelledby="limits-title">
        <h2 id="limits-title">What this does not prove</h2>
        <ul>
          {benchmark.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
        </ul>
        <p className="limits-foot">Rerun it yourself: the runner and configuration are in the <a href={benchmark.runnerUrl ?? REPO_URL} target="_blank" rel="noreferrer">repository</a>, and the <Link to="/methodology/">methodology</Link> page covers what every run holds constant. Think a result is wrong? Open an issue with your rig and your samples.</p>
        <p className="limits-foot"><Link to={back}>Read the published benchmark</Link></p>
        {benchmark.trademarks ? <p className="limits-foot">{benchmark.trademarks.join(" ")}</p> : null}
      </section>
    </article>
  );
}

/** A benchmark without sections, narrowed to the pick: the same charts and hyperfine blocks, minus the summary sentence. */
function FlatTests({ benchmark }: { benchmark: Benchmark }) {
  const tests = benchmarkTests(benchmark);

  return (
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
      <details className="report-details">
        <summary>Full report, as hyperfine prints it</summary>
        <div className="report-grid">
          {benchmark.candidates.map((candidate, index) => <ReportBlock benchmark={benchmark} candidate={candidate} index={index} key={candidate.id} />)}
        </div>
        <div className="report-actions">
          <CopyReport benchmark={benchmark} summary={false} />
        </div>
      </details>
      <Conditions benchmark={benchmark} />
    </section>
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
