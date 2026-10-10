import { useMemo, useSyncExternalStore } from "react";
import { useSearchParams } from "react-router";
import { runViews } from "./runs";
import type { RunView } from "./runs";
import type { Benchmark } from "./types";

const noSubscription = () => () => undefined;

/** False while React hydrates the prerendered page and true after, so URL state can't change the first render. */
export function useHydrated(): boolean {
  return useSyncExternalStore(noSubscription, () => true, () => false);
}

/** The run named by `?run=`, or the primary. Switching runs adds a history entry; the primary keeps the URL clean. */
export function useRunSelection(benchmark: Benchmark): { runs: RunView[]; active: RunView; select: (id: string) => void } {
  const runs = useMemo(() => runViews(benchmark), [benchmark]);
  const [params, setParams] = useSearchParams();
  const hydrated = useHydrated();
  const primary = runs[0]!;
  const requested = hydrated ? params.get("run") : null;
  const active = runs.find((run) => run.id === requested) ?? primary;

  function select(id: string): void {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (id === primary.id) {
        next.delete("run");
      } else {
        next.set("run", id);
      }
      return next;
    });
  }

  return { runs, active, select };
}
