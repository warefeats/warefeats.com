# A chart marks its winner from its own passes

A test's results may carry one sample per measured pass and name the statistic its value summarizes them by, so a bar chart draws the spread of its passes as a whisker and, where the statistic is the mean and every candidate has two or more passes, tells a lead from noise the way the scorecard does: the best value is marked unless it sits inside twice the standard error of the difference from another candidate's, when no bar is red and the chart's method line says whose lead is inside the noise. The mark reads the value at the end of the bar and the published samples, so it always agrees with the number shown. A test without samples, an "other" statistic or a median keeps its mark by value alone. A section's derived chart follows the scorecard's gate, `sectionSamples: "repeats"`, so the two never disagree. This takes up what ADR 0003 deferred and ADR 0007 kept deferred, now that the contract carries per-test samples.

## Considered options

- **A winner by value alone, as before.** Rejected: a chart whose passes overlap would mark a lead the samples don't support while the scorecard calls the same lead a tie.
- **A noise test for every statistic.** Rejected: twice the standard error is a statement about means; a median's or a pooled percentile's uncertainty needs an estimate nobody publishes.
- **Keeping the mark and naming the tie only in the method line.** Rejected: the red bar is the chart's claim, and the mark and the line must agree, as the winner line and the scorecard do.
