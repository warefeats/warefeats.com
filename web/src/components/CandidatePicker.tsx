import { useState } from "react";
import { pickerVersion } from "../matchup";
import type { Candidate } from "../types";

interface CandidatePickerProps {
  universe: Candidate[];
  picked: string[];
  /** Returns false when the change would leave fewer than two candidates. */
  onToggle: (id: string) => boolean;
  onReset: () => void;
  /** Why the page ignored the pick its URL named, if it did. */
  note?: string;
}

/** One checkbox per candidate in the run, in run order. A matchup always keeps at least two. */
export function CandidatePicker({ universe, picked, onToggle, onReset, note }: CandidatePickerProps) {
  const [refused, setRefused] = useState(false);
  const full = picked.length === universe.length;
  // A logo column only when some candidate has a logo; the rest keep its width so the names line up.
  const logos = universe.some((candidate) => candidate.logo);

  return (
    <section className="picker" aria-labelledby="picker-title">
      <div className="picker-head">
        <h2 id="picker-title">Candidates</h2>
        {full ? null : (
          <button className="link-button picker-reset" type="button" onClick={() => { setRefused(false); onReset(); }}>
            Show all
          </button>
        )}
      </div>
      <ul className="picker-list" role="group" aria-labelledby="picker-title">
        {universe.map((candidate) => {
          const checked = picked.includes(candidate.id);
          const version = pickerVersion(candidate);
          return (
            <li key={candidate.id}>
              <label className={checked ? "picker-item is-picked" : "picker-item"}>
                <input type="checkbox" checked={checked} onChange={() => setRefused(!onToggle(candidate.id))} />
                {logos ? candidate.logo ? <img className="picker-logo" src={candidate.logo} alt="" height="24" /> : <span className="picker-logo" aria-hidden="true" /> : null}
                <span className="picker-name">{candidate.name}</span>
                {version ? <span className="picker-version num">{version}</span> : null}
              </label>
            </li>
          );
        })}
      </ul>
      <p className="picker-hint" aria-live="polite">{refused ? "A matchup needs at least two." : note ?? ""}</p>
    </section>
  );
}
