# Posts sit on a timeline; the matchup names winners

Amended by ADR 0007: the winner line now opens each section, above its charts.

A post tells one story against the runs and candidates it locks in, and the home page lists every post on one timeline, newest first. A later story is a later post, never an edit to an earlier one. Today each benchmark has one post, its page; a second post about the same benchmark needs posts as entries of their own, which comes with the first such post.

The matchup is laid out like a post without its prose: each section's charts, then the winner the page computes for that section, then the run's conditions and the scorecard for the pick, with nothing after the scorecard but the products' trademark notices. A winner is the candidate with the best mean in the section among the candidates picked. Where the runner declares that section samples repeat one measurement, a lead inside twice the standard error of the difference is a tie, and the line names every candidate inside the leader's noise. The winner line and the scorecard's mark read the same column, so they always agree. A winner is computed and never written, so it isn't a verdict: a post's verdicts stay authored and cover its own runs, and a fleet run still carries none (ADR 0002). This reverses ADR 0001's rejection of a computed line per pick, because the line is the table's own mark in words, and it drops the limitations from the matchup, since they belong to the post's prose.

## Considered options

- **Authored verdicts on the matchup.** Rejected: nobody writes prose for a reader's pick or a fleet run.
- **A winner per chart.** Deferred: a test carries one value per candidate, so a chart can't tell a lead from noise. Revisit when the contract carries per-test samples.
- **An overall winner above the scorecard.** Rejected: the page ends on the table, without further comment.
- **Keeping the limitations on the matchup.** Rejected: they're the post's prose, and the byline links the post.
