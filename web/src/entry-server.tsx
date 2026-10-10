import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";
import App from "./App";
import { CatalogProvider } from "./catalog-context";
import { headTags, prerenderPaths, routeMeta } from "./head";
import type { Benchmark, CatalogIndex } from "./types";

export { prerenderPaths };

/** Renders one page from exactly the data it will embed, so the client hydrates what the server drew. */
export function render(path: string, index: CatalogIndex, benchmark?: Benchmark): { html: string; head: string } {
  const html = renderToString(
    <StrictMode>
      <StaticRouter location={path}>
        <CatalogProvider index={index} benchmarks={benchmark ? { [benchmark.slug]: benchmark } : undefined}>
          <App />
        </CatalogProvider>
      </StaticRouter>
    </StrictMode>,
  );

  return { html, head: headTags(routeMeta(path, index)) };
}
