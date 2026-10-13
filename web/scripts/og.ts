import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { parseCatalog } from "../src/catalog";
import { benchmarkCard, matchupCard, siteCard } from "../src/og";
import { postView } from "../src/posts";
import type { OgFonts } from "../src/og";

const root = join(import.meta.dir, "..");
const out = join(root, "dist", "og");

async function font(name: string): Promise<ArrayBuffer> {
  const bytes = await readFile(join(root, "assets", "fonts", name));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const fonts: OgFonts = {
  mono500: await font("MartianMono-500.ttf"),
  mono700: await font("MartianMono-700.ttf"),
  sans500: await font("RedHatText-500.ttf"),
};

function toPng(svg: string): Buffer {
  return new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
}

const catalog = parseCatalog(JSON.parse(await readFile(join(root, "dist", "data", "benchmarks.json"), "utf8")));
await mkdir(join(out, "posts"), { recursive: true });
await mkdir(join(out, "benchmarks"), { recursive: true });
await writeFile(join(out, "site.png"), toPng(await siteCard(fonts)));

// A post's card at og/posts/<post>.png, its benchmark page's at og/benchmarks/<slug>.png (ADR 0004).
let cards = 1;
for (const benchmark of catalog.benchmarks) {
  await writeFile(join(out, "posts", `${benchmark.post}.png`), toPng(await benchmarkCard(benchmark, fonts)));
  await writeFile(join(out, "benchmarks", `${benchmark.slug}.png`), toPng(await matchupCard(benchmark, fonts)));
  cards += 2;
  for (const later of benchmark.posts ?? []) {
    await writeFile(join(out, "posts", `${later.slug}.png`), toPng(await benchmarkCard(postView(benchmark, later), fonts)));
    cards += 1;
  }
}

console.log(`Rendered ${cards} OG cards into dist/og`);
