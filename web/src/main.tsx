import "@fontsource-variable/martian-mono/standard.css";
import "@fontsource-variable/red-hat-text/index.css";
import "@fontsource-variable/red-hat-text/wght-italic.css";
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";
import { parseBenchmark, parseCatalogIndex } from "./catalog";
import { CatalogProvider } from "./catalog-context";
import { normalizePath } from "./head";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("The application root element is missing.");
}

function embedded<T>(id: string, parse: (value: unknown) => T): T | undefined {
  const node = document.getElementById(id);
  if (!node?.textContent) {
    return undefined;
  }

  try {
    return parse(JSON.parse(node.textContent));
  } catch {
    return undefined;
  }
}

const index = embedded("wf-catalog", parseCatalogIndex);
const benchmark = embedded("wf-benchmark", parseBenchmark);
const app = (
  <StrictMode>
    <BrowserRouter>
      <CatalogProvider index={index} benchmarks={benchmark ? { [benchmark.slug]: benchmark } : undefined}>
        <App />
      </CatalogProvider>
    </BrowserRouter>
  </StrictMode>
);

const prerenderedPath = root.dataset.path;
const matchesPrerender = root.hasChildNodes() && prerenderedPath === normalizePath(window.location.pathname);

if (matchesPrerender) {
  hydrateRoot(root, app);
} else {
  root.replaceChildren();
  createRoot(root).render(app);
}
