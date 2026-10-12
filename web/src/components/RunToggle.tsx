import { toggleLabels, type RunView } from "../runs";

interface RunToggleProps {
  runs: RunView[];
  active: string;
  onSelect: (id: string) => void;
}

/** Switches the page between a benchmark's runs. Each run's label names its rig; a fleet run says so. Runs that share a label show the versions that differ. */
export function RunToggle({ runs, active, onSelect }: RunToggleProps) {
  const labels = toggleLabels(runs);
  return (
    <div className="run-toggle" role="group" aria-label="Run">
      {runs.map((run) => (
        <button key={run.id} type="button" aria-pressed={run.id === active} className={`run-toggle-btn${run.id === active ? " active" : ""}`} onClick={() => onSelect(run.id)}>
          {labels.get(run.id)}
          {run.fleet ? <span className="run-toggle-kind"> fleet</span> : null}
        </button>
      ))}
    </div>
  );
}
