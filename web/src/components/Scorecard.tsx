import { formatValue, scorecard } from "../metrics";
import type { BenchmarkSection } from "../types";

const DEFAULT_CAPTION = "Mean of each section's samples per candidate. The best value in each column is marked in red.";
const TIED = " A column has no mark when the lead is inside the run's noise, twice the standard error of the difference.";

/** The verdict's numbers as a table: one row per candidate, one column per section, means. */
export function Scorecard({ sections, caption = DEFAULT_CAPTION, repeats = false }: { sections: BenchmarkSection[] | undefined; caption?: string; repeats?: boolean }) {
  if (!sections?.length) return null;
  const card = scorecard(sections, repeats);
  return (
    <div className="table-scroll scorecard">
      <table>
        <caption>{caption}{card.columns.some((column) => column.tied) ? TIED : ""}</caption>
        <thead>
          <tr>
            <th scope="col">Candidate</th>
            {card.columns.map((column) => (
              <th scope="col" key={column.id}>
                {column.title} <span className="unit">({column.unit}, {column.lowerIsBetter ? "lower is better" : "higher is better"})</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {card.rows.map((row) => (
            <tr key={row.candidateId}>
              <th scope="row">{row.name}</th>
              {row.cells.map((cell, index) => {
                const column = card.columns[index]!;
                const winner = column.bestId === row.candidateId;
                return (
                  <td className={`num${winner ? " scorecard-winner" : ""}`} key={column.id}>
                    {cell === null ? <span aria-label="not run">–</span> : formatValue(cell, column.unit)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
