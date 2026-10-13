# The matchup is a view, not a publication

Superseded in part by ADR 0003: the matchup now names a computed winner for each section and leaves the limitations to the post. Superseded in part by ADR 0004: the matchup is now each benchmark's page, at `/benchmarks/<slug>/`, and its canonical URL is its post's.

A matchup redraws one benchmark's published numbers for the candidates a reader picks, so it never carries a verdict: verdicts are written against the full field and checked before they ship, and a pick is arbitrary. The only marks a matchup shows are the best value in each column, computed from the cells on screen and captioned as being for this pick. The benchmark page stays the publication: a matchup's canonical URL is its benchmark page, and matchups stay out of the sitemap.

## Considered options

- **Matchups as their own canonical pages, listed in the sitemap.** Rejected: the default matchup repeats the benchmark page's charts without its prose, and a search engine that clusters the two may show the matchup instead of the post.
- **A computed verdict line for each pick.** Rejected: it would publish claims nobody wrote or checked.
