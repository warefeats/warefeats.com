# A benchmark carries later posts

A post locks in one run and the candidates its story is about. A benchmark's first post is its own prose: the title, deck, verdict and limitations in `benchmark.json`, and the section verdicts in its primary run file. A later post is a file of its own, `posts/<slug>.json` in the runner repository, listed under `posts` in `benchmark.json`. It names its run, authored or fleet, and the candidates it locks in, every candidate in the run when it names none. It carries its date, title, deck and verdict, a verdict headline for each section it shows, and its limitations. Its page draws that run alone, narrowed to those candidates, under its own prose, with no run toggle, and it takes its place on the home timeline by its date.

Sync refuses a later post when:
- its slug doesn't start with its date and the benchmark's slug;
- its run isn't in the benchmark, or the post is dated before it;
- it locks in fewer than two candidates, or one the run doesn't have;
- its verdict names a candidate it doesn't lock in;
- it misses a headline for a section it shows, or has one for a section it doesn't.

When the matchup shows a run that a later post tells, its byline says so and "Read the post" goes there. This refines ADR 0002: a fleet run still never changes an earlier post, and a later post's prose is written against the run it draws.

## Considered options

- **Later posts in the site repository.** Rejected: a post's prose belongs with the runs it describes, as the first post's does.
- **A post that draws several runs.** Rejected: a post draws one run, like the matchup, so its charts never mix dates or rigs.
