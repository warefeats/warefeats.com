import { useId } from "react";
import { axisTicks, fittedTicks, formatValue, samplePosition, testWinner } from "../metrics";
import type { Benchmark, BenchmarkTest } from "../types";

/** Rem per character of the axis and value-label font: mono at --text-xs, 90% wide. */
const CHAR_REM = 0.5;
/** A test grid column is never narrower than 26rem, and a bar's track starts 11.5rem into its chart. */
const NARROWEST_CHART_REM = 26;
const TRACK_START_REM = 11.5;

interface BarChartProps {
  benchmark: Benchmark;
  test: BenchmarkTest;
  index: number;
}

/**
 * One barefeats-style test: a boxed chart with the title in its header band, one horizontal bar
 * per product from a zero baseline, the value at the end of each bar, and ticks along the bottom.
 * The better bar is red; the rest are ink.
 */
export function BarChart({ benchmark, test, index }: BarChartProps) {
  const winner = testWinner(test);
  const max = Math.max(...test.results.map((result) => result.value));
  // The axis runs from zero to one friendly step past the largest value, so no bar touches the edge.
  const probe = axisTicks(0, max * 1.15, 5);
  const step = probe.length > 1 ? probe[1]! - probe[0]! : max || 1;
  const scaleMax = Math.ceil((max * 1.08) / step) * step;
  const name = (id: string) => benchmark.candidates.find((candidate) => candidate.id === id)?.name ?? id;
  // The track keeps room for its longest value label, so a label like "12,833,173.6 ops/s" ends inside the chart.
  const valueChars = Math.max(...test.results.map((result) => formatValue(result.value, test.unit).length));
  // As many ticks as fit the narrowest axis this chart can get, so their labels never touch.
  const axisRem = NARROWEST_CHART_REM - TRACK_START_REM - Math.max(5.75, valueChars * CHAR_REM + 1.25);
  const { ticks, labels: tickText } = fittedTicks(scaleMax, axisRem, CHAR_REM);
  const direction = test.lowerIsBetter ? "LOWER" : "HIGHER";
  const headingId = `${useId()}-title`;

  return (
    <section className="test" aria-labelledby={headingId}>
      <h3 id={headingId} className="test-title">
        <span className="test-index">Test {index + 1}</span> {test.title}
      </h3>
      <p className="test-description">
        {test.description} <span className="test-direction">({direction} {test.unit} = {test.lowerIsBetter ? "FASTER" : "BETTER"})</span>
      </p>

      <figure className="bar-chart" style={{ "--value-chars": valueChars } as React.CSSProperties}>
        <figcaption className="bar-chart-head">{test.title} ({test.unit})</figcaption>
        <div className="bar-rows">
          {test.results.map((result) => {
            const width = samplePosition(result.value, 0, scaleMax);
            const isWinner = result.candidateId === winner;
            const candidate = benchmark.candidates.find((entry) => entry.id === result.candidateId);
            const color = candidate?.color;

            return (
              <div
                className={isWinner ? "bar-row is-best" : "bar-row"}
                style={color ? ({ "--brand": color } as React.CSSProperties) : undefined}
                key={result.candidateId}
              >
                <span className="bar-label">
                  {candidate?.logo ? <img src={candidate.logo} alt="" height="24" /> : null}
                  <span>{name(result.candidateId)}</span>
                </span>
                <span className="bar-track">
                  <span className="bar" style={{ width: `${width}%` }} />
                  <span className="bar-value num" style={{ left: `${width}%` }}>{formatValue(result.value, test.unit)}</span>
                </span>
              </div>
            );
          })}
        </div>
        <div className="bar-axis" aria-hidden="true">
          {ticks.map((tick, index) => (
            <span className="bar-tick num" style={{ left: `${samplePosition(tick, 0, scaleMax)}%` }} key={tick}>
              {tickText[index]}
            </span>
          ))}
        </div>
        <table className="sr-only">
          <caption>{test.title} in {test.unit}</caption>
          <tbody>
            {test.results.map((result) => (
              <tr key={result.candidateId}>
                <th scope="row">{name(result.candidateId)}</th>
                <td>{formatValue(result.value, test.unit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figure>
    </section>
  );
}
