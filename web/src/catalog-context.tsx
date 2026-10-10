import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { parseBenchmark, parseCatalogIndex } from "./catalog";
import type { Benchmark, CatalogIndex } from "./types";

export type CatalogState =
  | { status: "loading" }
  | { status: "ready"; index: CatalogIndex }
  | { status: "error"; message: string };

/** One benchmark's full data, which only the pages that chart it load. */
export type BenchmarkState =
  | { status: "loading" }
  | { status: "ready"; benchmark: Benchmark }
  | { status: "missing" }
  | { status: "error"; message: string; retry: () => void };

type Loaded = { status: "ready"; benchmark: Benchmark } | { status: "error"; message: string };

interface CatalogContextValue {
  state: CatalogState;
  reload: () => void;
  loaded: Record<string, Loaded>;
  load: (slug: string) => void;
  forget: (slug: string) => void;
}

const CatalogContext = createContext<CatalogContextValue>({ state: { status: "loading" }, reload: () => undefined, loaded: {}, load: () => undefined, forget: () => undefined });

interface CatalogProviderProps {
  /** The index every page embeds. */
  index?: CatalogIndex;
  /** The benchmarks this page embeds in full, by slug. */
  benchmarks?: Record<string, Benchmark>;
  children: ReactNode;
}

async function fetchJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(`${import.meta.env.BASE_URL}${path}`, { signal });

  // CloudFront answers a missing file with the home page, so a body that isn't JSON counts as missing.
  if (!response.ok || !response.headers.get("content-type")?.includes("json")) {
    throw new Error(`The request for ${path} failed with ${response.status}.`);
  }

  return response.json();
}

export function CatalogProvider({ index, benchmarks, children }: CatalogProviderProps) {
  const [state, setState] = useState<CatalogState>(index ? { status: "ready", index } : { status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Record<string, Loaded>>(() => Object.fromEntries(Object.entries(benchmarks ?? {}).map(([slug, benchmark]) => [slug, { status: "ready", benchmark }])));
  const pending = useRef(new Set<string>());

  const reload = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    if (state.status !== "loading") {
      return;
    }

    const controller = new AbortController();

    async function loadIndex(): Promise<void> {
      try {
        setState({ status: "ready", index: parseCatalogIndex(await fetchJson("data/catalog.json", controller.signal)) });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setState({ status: "error", message: error instanceof Error ? error.message : "The benchmark catalog could not be loaded." });
      }
    }

    void loadIndex();
    return () => controller.abort();
    // The attempt counter is the retry trigger; the status guard keeps embedded data from refetching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, state.status]);

  const load = useCallback((slug: string) => {
    if (pending.current.has(slug)) {
      return;
    }

    pending.current.add(slug);
    fetchJson(`data/benchmarks/${slug}.json`)
      .then((value) => {
        const benchmark = parseBenchmark(value);
        setLoaded((current) => ({ ...current, [slug]: { status: "ready", benchmark } }));
      })
      .catch((error: unknown) => {
        setLoaded((current) => ({ ...current, [slug]: { status: "error", message: error instanceof Error ? error.message : "The benchmark could not be loaded." } }));
      })
      .finally(() => pending.current.delete(slug));
  }, []);

  const forget = useCallback((slug: string) => {
    setLoaded((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== slug)));
  }, []);

  return <CatalogContext.Provider value={{ state, reload, loaded, load, forget }}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): { state: CatalogState; reload: () => void } {
  const { state, reload } = useContext(CatalogContext);
  return { state, reload };
}

/** The full data for one benchmark: embedded on its own pages, fetched once on the way to them otherwise. */
export function useBenchmark(slug: string | undefined): BenchmarkState {
  const { state, reload, loaded, load, forget } = useContext(CatalogContext);
  const known = state.status === "ready" && slug !== undefined && state.index.benchmarks.some((entry) => entry.slug === slug);
  const entry = slug === undefined ? undefined : loaded[slug];

  useEffect(() => {
    if (known && slug !== undefined && entry === undefined) {
      load(slug);
    }
  }, [known, slug, entry, load]);

  if (state.status === "loading") {
    return { status: "loading" };
  }

  if (state.status === "error") {
    return { status: "error", message: state.message, retry: reload };
  }

  if (!known || slug === undefined) {
    return { status: "missing" };
  }

  if (entry === undefined) {
    return { status: "loading" };
  }

  if (entry.status === "error") {
    return { status: "error", message: entry.message, retry: () => forget(slug) };
  }

  return entry;
}
