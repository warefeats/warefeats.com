import { formatVersion } from "../metrics";
import type { Benchmark } from "../types";

interface CandidatesProps {
  benchmark: Benchmark;
}

/** The candidates under test, logo and pinned version, under barefeats' heading where it put the product photo. */
export function Candidates({ benchmark }: CandidatesProps) {
  return (
    <section className="products" aria-labelledby="products-title">
      <h2 id="products-title">Products compared</h2>
      <ul className="product-list">
        {benchmark.candidates.map((candidate) => {
          const isWinner = candidate.id === benchmark.verdict.winnerId;
          return (
            <li className={isWinner ? "product is-fastest" : "product"} key={candidate.id}>
              {candidate.logo ? <img className="product-logo" src={candidate.logo} alt="" height="56" /> : <span className="product-logo product-logo-blank" aria-hidden="true" />}
              <span className="product-name">
                {candidate.homepage ? <a href={candidate.homepage} target="_blank" rel="noreferrer">{candidate.name}</a> : candidate.name}
              </span>
              <span className="product-version num">{formatVersion(candidate.version)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
