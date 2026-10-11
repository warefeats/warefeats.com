import { useMemo, useSyncExternalStore } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { pickParam, readPick } from "./matchup";
import type { Pick } from "./matchup";
import { activeRun, runChoices } from "./runs";
import type { RunScope, RunView } from "./runs";
import type { Benchmark, Candidate } from "./types";

const noSubscription = () => () => undefined;

/** Rewrites the query string, leaving commas readable so a shared pick reads ?pick=martin,tegola. */
function useSetQuery(): (update: (params: URLSearchParams) => void, options?: { replace?: boolean }) => void {
  const [params] = useSearchParams();
  const { hash } = useLocation();
  const navigate = useNavigate();

  return (update, options) => {
    const next = new URLSearchParams(params);
    update(next);
    const query = [...next].map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value).replace(/%2C/g, ",")}`).join("&");
    navigate({ search: query ? `?${query}` : "", hash }, { replace: options?.replace ?? false });
  };
}

/** False while React hydrates the prerendered page and true after, so URL state can't change the first render. */
export function useHydrated(): boolean {
  return useSyncExternalStore(noSubscription, () => true, () => false);
}

/**
 * Writes a run choice into the query. A post keeps its primary run's URL clean; a matchup always names the run, so a
 * shared link keeps showing the numbers it was made on after a newer run lands (ADR 0002).
 */
export function writeRun(params: URLSearchParams, id: string, scope: RunScope, fallbackId: string): void {
  if (scope === "post" && id === fallbackId) {
    params.delete("run");
  } else {
    params.set("run", id);
  }
}

/** Writes a pick into the query, and on a matchup the run it was made on. The whole field drops the parameter. */
export function writePick(params: URLSearchParams, ids: string[], universe: Candidate[], pinRun?: string): void {
  const value = pickParam(ids, universe);
  if (value === null) {
    params.delete("pick");
  } else {
    params.set("pick", value);
  }
  if (pinRun !== undefined) {
    params.set("run", pinRun);
  }
}

/**
 * The run named by `?run=`, or the page's fallback: the primary on a post, which offers authored runs only, and the
 * newest run on a matchup, which offers every run. Switching runs adds a history entry.
 */
export function useRunSelection(benchmark: Benchmark, scope: RunScope = "post"): { runs: RunView[]; active: RunView; select: (id: string) => void } {
  const choices = useMemo(() => runChoices(benchmark, scope), [benchmark, scope]);
  const [params] = useSearchParams();
  const setQuery = useSetQuery();
  const hydrated = useHydrated();
  const active = activeRun(choices, hydrated ? params.get("run") : null);

  function select(id: string): void {
    setQuery((next) => writeRun(next, id, scope, choices.fallback.id));
  }

  return { runs: choices.runs, active, select };
}

/**
 * The candidates named by `?pick=`, or the whole field. Ticking a candidate replaces the history entry, so the back button
 * leaves the matchup instead of stepping through every tick. A change that would leave fewer than two is refused. With
 * `pinRun`, every change also writes that run into the URL.
 */
export function usePick(universe: Candidate[], pinRun?: string): { pick: Pick; toggle: (id: string) => boolean; reset: () => void } {
  const [params] = useSearchParams();
  const setQuery = useSetQuery();
  const hydrated = useHydrated();
  const pick = readPick(hydrated ? params.get("pick") : null, universe);

  function write(ids: string[]): void {
    setQuery((next) => writePick(next, ids, universe, pinRun), { replace: true });
  }

  function toggle(id: string): boolean {
    const ids = pick.ids.includes(id) ? pick.ids.filter((picked) => picked !== id) : [...pick.ids, id];
    if (ids.length < 2) {
      return false;
    }
    write(ids);
    return true;
  }

  function reset(): void {
    write(universe.map((candidate) => candidate.id));
  }

  return { pick, toggle, reset };
}
