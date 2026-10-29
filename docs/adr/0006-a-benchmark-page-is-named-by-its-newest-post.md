# A benchmark page is named by its newest post

A benchmark's page outlives its lineup (ADR 0004), and a later post can bring a new product into that lineup (ADR 0005). The page, its entry on `/benchmarks/`, its heading, its title tag, its card and its canonical URL take the title of the newest post that tells the whole lineup of its run: that lineup is the one the matchup opens on, and that post's numbers are the ones the page redraws. A post that locks in fewer candidates than its run measured tells a narrower story and names nothing. With no such later post, the first post names the page, as before. The first post keeps its own title on its page and on the timeline.

## Considered options

- **Renaming the benchmark in `benchmark.json`.** Rejected: that title is the first post's prose (ADR 0005), so it would rename that post on its page and on the timeline.
- **Naming the page from the candidates of the run it opens on.** Rejected: a post's title is authored, and a computed "A vs B vs C" would reword every page and reorder some.
