# URLs name the category; posts carry their date

A benchmark's page lives at `/benchmarks/<slug>/`, where the slug names its category of tools: its runner's name, such as `web-map-renderers`, never the products it compares. The products in a benchmark change as release lines come and go, and the page outlives every lineup. A post lives at `/posts/<date>-<slug>-<products>/`, such as `/posts/2026-09-02-web-map-renderers-mapbox-gl-js-vs-maplibre-gl-js/`. It names the products because it tells a story about them, and the date says when that story was true. The home page lists the posts; `/benchmarks/` lists the benchmark pages.

Each runner's `benchmark.json` carries both: `slug` is the category, and `post` is its post's URL slug, which sync checks starts with the primary run's date and the slug. A benchmark page points its canonical URL at its post, as the matchup did (ADR 0001), and stays out of the sitemap. Every page and social card that moved answers with a 301 to where it lives now, its query kept, from the map in `infra/lib/moved.json`. `/benchmarks/desktop-shells/` was a post and is now that benchmark's page, so it doesn't redirect.

## Considered options

- **Products in a benchmark's URL** (`/benchmarks/maplibre-gl-js-vs-mapbox-gl-js/`). Rejected: the name goes stale as soon as the lineup changes.
- **Posts nested under their benchmark** (`/benchmarks/<products>/<post>/`). Rejected for the same reason, and a post's own URL should say when it was written.
- **Moving only new posts to `/posts/`.** Rejected: one scheme for every post, with redirects from the old addresses.
