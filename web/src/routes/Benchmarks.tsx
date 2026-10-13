import { Link } from "react-router";
import { useCatalog } from "../catalog-context";
import { CatalogSkeleton, EmptyState, ErrorState } from "../components/States";
import { benchmarkPath } from "../head";
import type { CatalogEntry } from "../types";

/** Every benchmark page, by category and then title. */
function byCategory(benchmarks: CatalogEntry[]): CatalogEntry[] {
  return [...benchmarks].sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
}

/** The index of benchmark pages: one per benchmark, named for its category of tools (ADR 0004). */
export function Benchmarks() {
  const { state, reload } = useCatalog();

  return (
    <>
      <section className="intro" aria-labelledby="benchmarks-title">
        <h1 id="benchmarks-title">Benchmarks</h1>
        <p>One page per benchmark: every run's charts, a winner for each section, and the scorecard, for the candidates you pick. The stories are in the posts.</p>
      </section>

      {state.status === "loading" ? <CatalogSkeleton /> : null}
      {state.status === "error" ? <ErrorState message={state.message} onRetry={reload} /> : null}
      {state.status === "ready" && state.index.benchmarks.length === 0 ? <EmptyState /> : null}

      {state.status === "ready" && state.index.benchmarks.length > 0 ? (
        <section className="timeline" aria-labelledby="benchmarks-title">
          <ol className="timeline-list">
            {byCategory(state.index.benchmarks).map((benchmark) => (
              <li className="timeline-entry" key={benchmark.id}>
                <p className="timeline-meta">{benchmark.category} <span aria-hidden="true">·</span> {benchmark.chip}</p>
                <h2 className="timeline-title"><Link to={benchmarkPath(benchmark.slug)}>{benchmark.title}</Link></h2>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </>
  );
}
