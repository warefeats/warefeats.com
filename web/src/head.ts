import type { CatalogEntry, CatalogIndex, CatalogPost } from "./types";

export const SITE_NAME = "warefeats";
export const SITE_ORIGIN = "https://warefeats.com";
const DEFAULT_DESCRIPTION = "Independent, reproducible benchmarks for developer tools and architecture choices. Every result ships with its rig, protocol, and raw samples.";
const SITE_CARD = `${SITE_ORIGIN}/og/site.png`;
// Where search results cut off a title and a description.
const TITLE_LIMIT = 60;
const DESCRIPTION_LIMIT = 160;

export interface RouteMeta {
  path: string;
  /** The page search engines should index instead, when it isn't this one. */
  canonical?: string;
  title: string;
  description: string;
  type: "website" | "article";
  publishedAt?: string;
  status: 200 | 404;
  /** Absolute URL of the Open Graph card for this route. */
  image: string;
}

/** The index of benchmark pages. */
export const BENCHMARKS_PATH = "/benchmarks/";

/** A benchmark's page, the matchup over its runs, named for its category of tools and never its products (ADR 0004). */
export function benchmarkPath(slug: string): string {
  return `/benchmarks/${slug}/`;
}

/** A post's page, named for its date, its benchmark's category and the products it compares (ADR 0004). */
export function postPath(post: string): string {
  return `/posts/${post}/`;
}

export function isBenchmarkPath(path: string): boolean {
  return /^\/benchmarks\/[^/]+\/$/.test(normalizePath(path));
}

export function normalizePath(path: string): string {
  const pathname = path.split(/[?#]/)[0] ?? "/";
  if (pathname === "" || pathname === "/") {
    return "/";
  }

  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

/** The benchmark whose data a page draws: a benchmark page's own, or the one a post belongs to. */
export function pageBenchmark(path: string, index: CatalogIndex | undefined): CatalogEntry | undefined {
  const pathname = normalizePath(path);
  const slug = /^\/benchmarks\/([^/]+)\/$/.exec(pathname)?.[1];
  if (slug) {
    return index?.benchmarks.find((entry) => entry.slug === slug);
  }
  const post = /^\/posts\/([^/]+)\/$/.exec(pathname)?.[1];
  return post ? index?.benchmarks.find((entry) => entry.post === post || entry.posts?.some((later) => later.slug === post)) : undefined;
}

/** A later post's index entry, when a path names one. */
export function pageLaterPost(path: string, index: CatalogIndex | undefined): CatalogPost | undefined {
  const post = /^\/posts\/([^/]+)\/$/.exec(normalizePath(path))?.[1];
  return post ? index?.benchmarks.flatMap((entry) => entry.posts ?? []).find((later) => later.slug === post) : undefined;
}

export function routeMeta(path: string, index?: CatalogIndex): RouteMeta {
  const pathname = normalizePath(path);

  if (pathname === "/") {
    return { path: pathname, title: `${SITE_NAME}: benchmarks for developer tools`, description: DEFAULT_DESCRIPTION, type: "website", status: 200, image: SITE_CARD };
  }

  if (pathname === "/methodology/") {
    return { path: pathname, title: `Methodology | ${SITE_NAME}`, description: "How every warefeats benchmark is run: pinned versions, a fixed corpus, warmups, fresh processes, and every sample published.", type: "website", status: 200, image: SITE_CARD };
  }

  if (pathname === "/about/") {
    return { path: pathname, title: `About | ${SITE_NAME}`, description: "warefeats is a one-person benchmark lab for developer tools, run on a named machine with an open-source runner.", type: "website", status: 200, image: SITE_CARD };
  }

  if (pathname === BENCHMARKS_PATH) {
    return { path: pathname, title: `Benchmarks | ${SITE_NAME}`, description: "Every benchmark's runs on one page each: the charts, a winner per section, and the scorecard, for the candidates you pick.", type: "website", status: 200, image: SITE_CARD };
  }

  const benchmark = pageBenchmark(pathname, index);

  if (benchmark && isBenchmarkPath(pathname)) {
    // A benchmark page redraws numbers its post publishes, so search engines index the post (ADR 0001, ADR 0004).
    return { path: pathname, canonical: postPath(benchmark.post), title: matchupTitle(benchmark), description: clipDescription(`${benchmark.title}: the charts, a winner for each section, and the scorecard, without the prose.`), type: "website", status: 200, image: `${SITE_ORIGIN}/og/benchmarks/${benchmark.slug}.png` };
  }

  const later = pageLaterPost(pathname, index);
  if (benchmark && later) {
    return { path: pathname, title: benchmarkTitle(later), description: later.deck.length <= DESCRIPTION_LIMIT ? later.deck : clipDescription(later.deck), type: "article", publishedAt: later.publishedAt, status: 200, image: `${SITE_ORIGIN}/og/posts/${later.slug}.png` };
  }

  if (benchmark) {
    return { path: pathname, title: benchmarkTitle(benchmark), description: benchmarkDescription(benchmark), type: "article", publishedAt: benchmark.publishedAt, status: 200, image: `${SITE_ORIGIN}/og/posts/${benchmark.post}.png` };
  }

  return { path: pathname, title: `Not found | ${SITE_NAME}`, description: DEFAULT_DESCRIPTION, type: "website", status: 404, image: SITE_CARD };
}

function matchupTitle(benchmark: CatalogEntry): string {
  const title = `Matchup: ${benchmark.title} | ${SITE_NAME}`;
  return title.length <= TITLE_LIMIT ? title : `Matchup: ${benchmark.title}`;
}

/** A post's title, followed by the site name when both fit in a search result. */
function benchmarkTitle(benchmark: Pick<CatalogEntry, "title">): string {
  const title = `${benchmark.title} | ${SITE_NAME}`;
  return title.length <= TITLE_LIMIT ? title : benchmark.title;
}

/** The result, then the deck. A section benchmark has no single ratio, so when its deck runs long its verdict stands in. */
function benchmarkDescription(benchmark: CatalogEntry): string {
  const lead = benchmark.lead;

  if (lead) {
    return clipDescription(`${lead.winner.name} ${lead.winner.version} ran ${lead.ratio.toFixed(2)} ± ${lead.sigma.toFixed(2)} times faster than ${lead.other.name} ${lead.other.version}. ${benchmark.deck}`);
  }

  return benchmark.deck.length <= DESCRIPTION_LIMIT ? benchmark.deck : clipDescription(benchmark.verdictHeadline);
}

/** Cuts text to the description limit at its last sentence or clause break that fits, so no clause is cut in half; text without one is cut at a word. */
function clipDescription(text: string): string {
  if (text.length <= DESCRIPTION_LIMIT) {
    return text;
  }

  let clipped = "";
  for (const match of text.matchAll(/[.!?;:](?=\s)|\s[—–](?=\s)/g)) {
    const candidate = /[.!?]/.test(match[0]) ? text.slice(0, match.index + 1) : `${text.slice(0, match.index)}.`;
    if (candidate.length > DESCRIPTION_LIMIT) {
      break;
    }
    clipped = candidate;
  }

  if (clipped) {
    return clipped;
  }

  const words = text.slice(0, DESCRIPTION_LIMIT - 1);
  const space = words.lastIndexOf(" ");
  return `${(space > 0 ? words.slice(0, space) : words).replace(/[\s,;:]+$/, "")}…`;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function headTags(meta: RouteMeta): string {
  const url = `${SITE_ORIGIN}${meta.path}`;
  const tags = [
    `<title>${escapeAttribute(meta.title)}</title>`,
    `<meta name="description" content="${escapeAttribute(meta.description)}" />`,
    `<link rel="canonical" href="${SITE_ORIGIN}${meta.canonical ?? meta.path}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${escapeAttribute(meta.title)}" />`,
    `<meta property="og:description" content="${escapeAttribute(meta.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:type" content="${meta.type}" />`,
    `<meta property="og:image" content="${meta.image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:image" content="${meta.image}" />`,
  ];

  if (meta.publishedAt) {
    tags.push(`<meta property="article:published_time" content="${meta.publishedAt}" />`);
  }

  if (meta.status === 404) {
    tags.push(`<meta name="robots" content="noindex" />`);
  }

  return tags.join("\n    ");
}

/** Every page the build writes: the fixed pages, each post, and each benchmark's page. */
export function prerenderPaths(index: CatalogIndex): string[] {
  return [...sitemapPaths(index), ...index.benchmarks.map((benchmark) => benchmarkPath(benchmark.slug))];
}

/** The pages search engines should index. A benchmark page points its canonical URL at its post, so it stays out. */
export function sitemapPaths(index: CatalogIndex): string[] {
  const posts = index.benchmarks.flatMap((benchmark) => [benchmark.post, ...(benchmark.posts ?? []).map((later) => later.slug)]);
  return ["/", BENCHMARKS_PATH, "/methodology/", "/about/", ...posts.map(postPath)];
}

/** Every prerendered page by its canonical URL. */
export function sitemapXml(paths: string[]): string {
  const urls = paths.map((path) => `  <url><loc>${escapeAttribute(`${SITE_ORIGIN}${path}`)}</loc></url>`);
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...urls, "</urlset>", ""].join("\n");
}

export function robotsTxt(): string {
  return ["User-agent: *", "Disallow:", "", `Sitemap: ${SITE_ORIGIN}/sitemap.xml`, ""].join("\n");
}
