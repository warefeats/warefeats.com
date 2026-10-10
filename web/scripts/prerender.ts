import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseBenchmark, parseCatalogIndex } from "../src/catalog";
import { benchmarkSlug, robotsTxt, sitemapXml } from "../src/head";
import type { Benchmark, CatalogIndex } from "../src/types";

interface ServerEntry {
  render: (path: string, index: CatalogIndex, benchmark?: Benchmark) => { html: string; head: string };
  prerenderPaths: (index: CatalogIndex) => string[];
}

const root = join(import.meta.dir, "..");
const dist = join(root, "dist");
const template = await readFile(join(dist, "index.html"), "utf8");
// Pages embed the same files the client fetches on navigation, read back from dist so the two can't drift.
const index = parseCatalogIndex(JSON.parse(await readFile(join(dist, "data", "catalog.json"), "utf8")));
const entry = (await import(pathToFileURL(join(dist, "server", "entry-server.js")).href)) as ServerEntry;

function dataTag(id: string, value: unknown): string {
  const json = JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return `<script id="${id}" type="application/json">${json}</script>`;
}

for (const placeholder of ["<!--app-head-->", "<!--app-html-->", "<!--app-data-->", 'data-path=""']) {
  if (!template.includes(placeholder)) {
    throw new Error(`dist/index.html is missing the ${placeholder} placeholder.`);
  }
}

const paths = entry.prerenderPaths(index);

for (const path of paths) {
  const slug = benchmarkSlug(path);
  const benchmark = slug ? parseBenchmark(JSON.parse(await readFile(join(dist, "data", "benchmarks", `${slug}.json`), "utf8"))) : undefined;
  const { html, head } = entry.render(path, index, benchmark);
  const page = template
    .replace("<!--app-head-->", head)
    .replace('data-path=""', `data-path="${path}"`)
    .replace("<!--app-html-->", html)
    .replace("<!--app-data-->", dataTag("wf-catalog", index) + (benchmark ? dataTag("wf-benchmark", benchmark) : ""));
  const file = path === "/" ? join(dist, "index.html") : join(dist, path.replace(/^\/|\/$/g, ""), "index.html");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, page);
}

await writeFile(join(dist, "sitemap.xml"), sitemapXml(paths));
await writeFile(join(dist, "robots.txt"), robotsTxt());
await rm(join(dist, "server"), { recursive: true, force: true });
console.log(`Prerendered ${paths.length} pages and their sitemap: ${paths.join(", ")}`);
