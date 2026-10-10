import { useMemo, useSyncExternalStore } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { pickParam, readPick } from "./matchup";
import type { Pick } from "./matchup";
import { runViews } from "./runs";
import type { RunView } from "./runs";
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

/** The run named by `?run=`, or the primary. Switching runs adds a history entry; the primary keeps the URL clean. */
export function useRunSelection(benchmark: Benchmark): { runs: RunView[]; active: RunView; select: (id: string) => void } {
  const runs = useMemo(() => runViews(benchmark), [benchmark]);
  const [params] = useSearchParams();
  const setQuery = useSetQuery();
  const hydrated = useHydrated();
  const primary = runs[0]!;
  const requested = hydrated ? params.get("run") : null;
  const active = runs.find((run) => run.id === requested) ?? primary;

  function select(id: string): void {
    setQuery((next) => {
      if (id === primary.id) {
        next.delete("run");
      } else {
        next.set("run", id);
      }
    });
  }

  return { runs, active, select };
}

/**
 * The candidates named by `?pick=`, or the whole field. Ticking a candidate replaces the history entry, so the back button
 * leaves the matchup instead of stepping through every tick. A change that would leave fewer than two is refused.
 */
export function usePick(universe: Candidate[]): { pick: Pick; toggle: (id: string) => boolean; reset: () => void } {
  const [params] = useSearchParams();
  const setQuery = useSetQuery();
  const hydrated = useHydrated();
  const pick = readPick(hydrated ? params.get("pick") : null, universe);

  function write(ids: string[]): void {
    setQuery((next) => {
      const value = pickParam(ids, universe);
      if (value === null) {
        next.delete("pick");
      } else {
        next.set("pick", value);
      }
    }, { replace: true });
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
