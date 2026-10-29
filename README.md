# warefeats

warefeats is a benchmark comparison publication for developer tools and architecture choices. Every conclusion includes the workload, pinned tool versions, test rig, protocol, limitations, and raw samples.

## Workspace

- `web/` contains the React and Vite publication UI. Routes are `/` (index of every benchmark by category plus the queue), `/benchmarks/<slug>/`, `/benchmarks/<slug>/matchup/` (a reader-picked subset of a benchmark's candidates, for benchmarks with three or more; its canonical URL is the benchmark page and it stays out of the sitemap, per `docs/adr/0001-the-matchup-is-a-view.md`), `/methodology/`, and `/about/`; `bun run build` prerenders each route to static HTML with its own metadata, writes `sitemap.xml` and `robots.txt` beside them, and a new catalog entry becomes a page with no new page code.
- Every page embeds a small catalog index (`dist/data/catalog.json`), and a benchmark's own pages also embed that benchmark (`dist/data/benchmarks/<slug>.json`), which client-side navigation fetches instead. `dist/data/benchmarks.json` is the whole catalog, for the OG cards and the raw-JSON link.
- `infra/` contains the AWS CDK stack for private S3 and CloudFront hosting.
- `.github/workflows/deploy.yml` verifies and deploys every push to `main`.

## Catalog

Benchmark results live in the repos that produced them. The site holds a registry of pinned commit SHAs and assembles the catalog at build time.

- `web/data/registry.json` pins each benchmark slug to a repo and full SHA.
- `web/data/queue.json` holds the editorial queue (planned, running, published).
- `web/data/cache/<slug>.json` is the assembled legacy `Benchmark` object for each entry, committed for reviewable diffs and offline builds.
- `web/data/cache/manifest.json` records the slug-to-repo-and-ref mapping the cache was built from.

Runner repos:

- [warefeats/js-linter-tools](https://github.com/warefeats/js-linter-tools) — the ESLint vs Biome reproducible runner.
- [warefeats/http-caching-proxies](https://github.com/warefeats/http-caching-proxies) — the Varnish vs Vinyl vs NGINX HLS caching-proxy runner.

### Publish flow

1. Run the benchmark in its runner repo; the importer writes `runs/<file>.json` and updates `benchmark.json`; PR, merge.
2. In this repo: bump that slug's `ref` in `web/data/registry.json` to the new SHA, run `bun run sync`, commit registry + cache together, PR, merge → deploy.

A fleet run publishes the same way, except that the runner lists it in `benchmark.json`'s `fleetRuns` (newest first, at most four) instead of `runs`. The matchup shows fleet runs; the benchmark page never does (`docs/adr/0002-fleet-runs-feed-the-matchup-not-the-post.md`).

### The run file

A runner's `runs/<id>.json` is `schemaVersion: 1`, `id`, `label`, `publishedAt`, `environment`, `protocol`, and either `candidates[]` (a flat benchmark: each candidate's `statistics` and `samplesMs`, one value per measured pass) or `sections[]`, each with `id`, `title`, `deck`, `unit`, `lowerIsBetter`, `verdict`, its own `candidates[]` and `tests[]`.

A test is `id`, `title`, `description`, `unit`, `lowerIsBetter`, `results[]` of `{ candidateId, value, samples? }`, and an optional `statistic`, one of `mean`, `median`, `min`, `max` or `other`, saying how `value` summarizes each candidate's samples. `samples` is one measurement of that candidate on that test per measured pass, in the test's unit, in pass order (CONTEXT.md's Sample); the site derives the count, the range and the spread from it and never reads them from the file; a single reading is a one-element array; a test with no per-pass values on disk carries no samples. `other` covers a value the site cannot recompute from the per-pass numbers, such as a median pooled over every request of every pass, a percentile of the per-pass numbers, or a ratio, and the description says what it is. `bun run sync` recomputes `mean`, `median` (linear interpolation, so an even count averages the middle two), `min` and `max` from the samples and refuses a value more than half a unit of its last printed decimal away.

`benchmark.json`'s `sectionSamples: "repeats"` declares that every section's candidate `samplesMs` repeat one measurement per pass, which lets the scorecard, the matchup's winner line and a derived chart call a lead inside the noise a tie.

## Local development

Run `bun install`, then `bun run --cwd web dev` for the site (`bun run --cwd web preview` serves the prerendered `web/dist`). Run `bun run check`, `bun run test`, and `bun run build` before pushing.

### Syncing benchmark data

`bun run sync` (from `web/`) fetches each pinned benchmark's `benchmark.json` and run files from GitHub, validates, assembles the legacy catalog shape, and writes the cache. Run it after bumping a ref in `registry.json` or when setting up the repo for the first time.

## Deployment

The production workflow expects the `AWS_DEPLOY_ROLE_ARN` repository secret and optionally the `AWS_REGION` repository variable. Follow [infra/README.md](infra/README.md) once per AWS account, then every push to `main` deploys the CDK stack, syncs `web/dist`, and invalidates CloudFront.
