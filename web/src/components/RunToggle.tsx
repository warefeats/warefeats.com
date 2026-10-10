import type { RunView } from "../runs";

interface RunToggleProps {
  runs: RunView[];
  active: string;
  onSelect: (id: string) => void;
}

/** Switches the page between a benchmark's runs. Each run's label names its rig. */
export function RunToggle({ runs, active, onSelect }: RunToggleProps) {
  return (
    <div className="run-toggle" role="group" aria-label="Run">
      {runs.map((run) => (
        <button key={run.id} type="button" aria-pressed={run.id === active} className={`run-toggle-btn${run.id === active ? " active" : ""}`} onClick={() => onSelect(run.id)}>
          {run.label}
        </button>
      ))}
    </div>
  );
}
