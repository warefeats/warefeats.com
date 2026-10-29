import { Fragment } from "react";
import type { Scorecard } from "../metrics";

/**
 * The winner a matchup names under a section: the best mean in that scorecard column, or a tie that names every candidate
 * inside the leader's noise. It reads the column the table marks, so the line and the table always agree.
 */
export function WinnerLine({ card, index }: { card: Scorecard; index: number }) {
  const column = card.columns[index];
  if (!column?.leaderId) return null;

  const names = new Map(card.rows.map((row) => [row.candidateId, row]));
  const named = (id: string) => {
    const row = names.get(id)!;
    return <><strong>{row.name}</strong> ({column.format.format(row.cells[index]!)} {column.format.unit})</>;
  };

  if (!column.tied) {
    return (
      <p className="section-winner">
        <span className="section-winner-label">Winner</span> {named(column.leaderId)}
      </p>
    );
  }

  const parts = new Intl.ListFormat("en-US").formatToParts([column.leaderId, ...column.tiedIds]);
  return (
    <p className="section-winner">
      <span className="section-winner-label is-tie">Tie</span> {parts.map((part, i) => <Fragment key={i}>{part.type === "element" ? named(part.value) : part.value}</Fragment>)}, inside this run's noise
    </p>
  );
}
