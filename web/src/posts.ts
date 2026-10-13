import { runViews } from "./runs";
import type { Benchmark, BenchmarkSection, Post } from "./types";

/** The later post a slug names on a benchmark, or undefined for its first post, which is the benchmark's own prose. */
export function laterPost(benchmark: Benchmark, slug: string | undefined): Post | undefined {
  return slug === undefined ? undefined : benchmark.posts?.find((post) => post.slug === slug);
}

/** The later post whose story is a given run, if one was written. */
export function postForRun(benchmark: Benchmark, runId: string): Post | undefined {
  return benchmark.posts?.find((post) => post.run === runId);
}

/**
 * A later post as its page draws it: the benchmark's page shape with the post's run as its only run, narrowed to the
 * candidates the post locks in, and the post's prose in place of the benchmark's. A section that fewer than two of those
 * candidates ran drops out (ADR 0005).
 */
export function postView(benchmark: Benchmark, post: Post): Benchmark {
  const run = runViews(benchmark).find((view) => view.id === post.run);
  if (!run) {
    throw new Error(`Post ${post.slug} tells the story of run ${post.run}, which ${benchmark.slug} doesn't have.`);
  }

  const kept = (id: string) => post.candidates === undefined || post.candidates.includes(id);
  const sections = run.sections
    ?.map((section): BenchmarkSection => ({
      ...section,
      candidates: section.candidates.filter((candidate) => kept(candidate.id)),
      ...(section.tests ? { tests: section.tests.map((test) => ({ ...test, results: test.results.filter((result) => kept(result.candidateId)) })) } : {}),
      verdict: { ...section.verdict, headline: post.sections?.[section.id] ?? section.verdict.headline },
    }))
    .filter((section) => section.candidates.length >= 2);
  // The run's own sections and tests replace the benchmark's, which belong to its first post's run.
  const { runs: _runs, posts: _posts, sections: _sections, tests: _tests, ...shared } = benchmark;

  return {
    ...shared,
    post: post.slug,
    title: post.title,
    deck: post.deck,
    publishedAt: post.publishedAt,
    run: { id: run.id, label: run.label },
    verdict: post.verdict,
    environment: run.environment,
    protocol: run.protocol,
    candidates: run.candidates.filter((candidate) => kept(candidate.id)),
    ...(sections ? { sections } : {}),
    ...(run.tests ? { tests: run.tests.map((test) => ({ ...test, results: test.results.filter((result) => kept(result.candidateId)) })) } : {}),
    limitations: post.limitations,
  };
}
