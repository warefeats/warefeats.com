import { Link } from "react-router";
import { useCatalog } from "../catalog-context";
import { Queue } from "../components/Queue";
import { CatalogSkeleton, EmptyState, ErrorState } from "../components/States";
import { postPath } from "../head";
import { formatDate } from "../metrics";
import type { CatalogEntry } from "../types";

interface TimelineEntry {
  slug: string;
  title: string;
  deck: string;
  publishedAt: string;
  category: string;
  chip: string;
}

/** Every post on one timeline, newest first, whatever its category: each benchmark's first post and its later ones. */
function timeline(benchmarks: CatalogEntry[]): TimelineEntry[] {
  const posts = benchmarks.flatMap((entry): TimelineEntry[] => [
    { slug: entry.post, title: entry.title, deck: entry.deck, publishedAt: entry.publishedAt, category: entry.category, chip: entry.chip },
    ...(entry.posts ?? []).map((later) => ({ ...later, category: entry.category })),
  ]);
  return posts.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function Home() {
  const { state, reload } = useCatalog();

  return (
    <>
      <section className="intro" aria-labelledby="intro-title">
        <h1 id="intro-title">Benchmarks for developer tools, with the runs attached.</h1>
        <p>I pin the versions, hold the corpus still, warm the cache, and fork a fresh process for every pass. You get the number, the machine it came from, and every sample behind it.</p>
      </section>

      {state.status === "loading" ? <CatalogSkeleton /> : null}
      {state.status === "error" ? <ErrorState message={state.message} onRetry={reload} /> : null}
      {state.status === "ready" && state.index.benchmarks.length === 0 ? <EmptyState /> : null}

      {state.status === "ready" && state.index.benchmarks.length > 0 ? (
        <section className="timeline" aria-labelledby="timeline-title">
          <div className="section-head">
            <h2 id="timeline-title">Posts</h2>
            <p>Newest first.</p>
          </div>
          <ol className="timeline-list">
            {timeline(state.index.benchmarks).map((post) => (
              <li className="timeline-entry" key={post.slug}>
                <p className="timeline-meta">
                  <time dateTime={post.publishedAt} className="num">{formatDate(post.publishedAt)}</time> <span aria-hidden="true">·</span> {post.category} <span aria-hidden="true">·</span> {post.chip}
                </p>
                <h3 className="timeline-title"><Link to={postPath(post.slug)}>{post.title}</Link></h3>
                <p className="timeline-deck">{post.deck}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {state.status === "ready" ? <Queue items={state.index.queue} /> : null}
    </>
  );
}
