import { Link } from "react-router";
import { benchmarkPath } from "../head";

export function About() {
  return (
    <article className="prose">
      <header className="prose-head">
        <h1>About</h1>
        <p className="deck">One person, three rigs, every run published.</p>
      </header>

      <h2>Why this exists</h2>
      <p>Most tool comparisons are written by someone selling one of the tools. The rest quote a number with no machine, no versions, and no workload behind it. I wanted the page <a href="https://barefeats.com" target="_blank" rel="noreferrer">barefeats</a> used to publish for Mac hardware, but for the choices I actually have to make at work: the linter, the bundler, the cache, the desktop shell, the map renderer, the tile server.</p>

      <h2>Who runs it</h2>
      <p>I'm John Carmack. I write Rust and TypeScript for a living. I run every benchmark here myself, on hardware I own or rent, with a runner you can read. No sponsor. No affiliation with any tool on this site.</p>

      <h2>The rigs</h2>
      <p>Three so far. Most runs come off an M2 Max MacBook Pro with 96 GB. A BOSGAME mini PC (Ryzen 7 6800H, Radeon 680M, Windows 11) ran <Link to={benchmarkPath("maplibre-gl-js-vs-mapbox-gl-js")}>MapLibre vs Mapbox</Link> and the Windows half of <Link to={benchmarkPath("desktop-shells")}>Tauri vs Electron</Link>. <Link to={benchmarkPath("redis-vs-valkey-vs-dragonfly-kv")}>Redis vs Valkey vs Dragonfly</Link> ran on AWS Graviton3: a c7g.metal engine with a c7g.4xlarge client. Every result page names its rig, and numbers from different rigs never share a chart.</p>

      <h2>Independence</h2>
      <p>Hosting comes out of my pocket, and later out of ads. If a sponsor ever pays for a bigger rig, that sponsor gets named on every result that ran on it. Nobody but me picks what gets benchmarked or how.</p>

      <h2>Logos</h2>
      <p>Product logos appear unmodified to identify the products under test and imply no endorsement. Varnish is a registered trademark of Varnish Software AB. NGINX is a trademark of F5, Inc. The Vinyl Cache logo is CC BY 4.0 <a href="https://rhubarbe.design" target="_blank" rel="noreferrer">Rhubarbe.design</a>. ESLint and Biome logos belong to their respective projects. The Vite and esbuild logos are MIT-licensed from their respective project repositories. Redis is a registered trademark of Redis Ltd. Any rights therein are reserved to Redis Ltd. Valkey is a trademark of LF Projects, LLC. Dragonfly is a trademark of DragonflyDB Ltd.</p>

      <h2>Corrections</h2>
      <p>Think a result is wrong? Open an issue in the <a href="https://github.com/warefeats/warefeats.com" target="_blank" rel="noreferrer">repository</a> with your rig and your samples. Corrections go up as new runs. The original stays, with a note.</p>

      <p className="prose-foot"><Link to="/methodology/">How each run is done</Link></p>
    </article>
  );
}
