# Fleet runs feed the matchup, never the post

Refined by ADR 0005: a later post may tell a fleet run's story; a fleet run still never changes an earlier post.

A fleet run repeats a benchmark's corpus and protocol after a release line moves, so its numbers are published numbers in ADR 0001's sense and a matchup may redraw them. It never becomes a post: a benchmark page's verdict and prose were written against its authored run, so the page's run toggle lists authored runs only, and a `?run=` naming a fleet run there falls back to the primary run. Each runner's `benchmark.json` lists the fleet runs the site shows in `fleetRuns`, newest first, at most four, and the site shows exactly that list; older fleet run files stay in the runner repository. A matchup without `?run=` opens on the newest run, says so in its byline when that is a fleet run, and writes the run into the URL as soon as a reader changes the pick, so a shared link keeps its numbers when a newer run lands. When the newest run is a fleet run, the benchmark page's matchup button opens the matchup on it and a line beside the button names it: its date, and the releases it measured that the page's run didn't. The page draws none of its numbers. Whether the post's verdict still holds on a new fleet run is for the fleet's pull request to say before it merges, never for the site to compute.

## Considered options

- **A newer run replaces the post's primary.** Rejected: the post's verdict and prose would sit over numbers nobody checked them against.
- **The site keeps every fleet run and trims at sync time.** Rejected: the site renders what the runners produce, so retention is the runner's call, made in its own `benchmark.json`.
- **The matchup opens on the post's run.** Rejected: the matchup is where a reader compares current releases, and pinning the run on the first pick keeps shared links stable.
- **The post's matchup button carries the post's run.** Tried first, and dropped on 2026-10-12 once two fleet runs were live: the button is the site's way into a matchup, so a reader following the site's links never reached a fleet run.
