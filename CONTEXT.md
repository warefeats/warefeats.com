# warefeats

The benchmark catalog: one runner repository per benchmark, one site that renders only what the runners produce. This is the shared language across every runner and the site.

## Catalog

**Benchmark**:
One published comparison of a fixed set of candidates on a fixed corpus under a fixed protocol, with its own page.
_Avoid_: comparison, study, suite

**Candidate**:
A pinned artifact under test: one product at one exact version in one configuration. Never a product as a whole, a company, or an organization.
_Avoid_: engine, tool, contestant, competitor

**Product**:
The upstream software a candidate is one release of, such as Martin or ESLint.
_Avoid_: project, tool, package

**Verdict**:
The one-sentence outcome of a benchmark or a section, ranked by the same statistic the page displays.
_Avoid_: winner, result, conclusion

**Matchup**:
A reader-picked set of two or more candidates from one benchmark, shown on one rig with the benchmark's charts and tables and no verdict.
_Avoid_: comparison, explorer, versus, head-to-head

**Category**:
The topic a benchmark is filed under on the site.
_Avoid_: section, area, topic

**Queue**:
The public list of benchmarks that are planned, running, or published.
_Avoid_: roadmap, backlog

## Measurement

**Corpus**:
The pinned input every candidate is given, identified by its checksums.
_Avoid_: dataset, fixtures, test data

**Protocol**:
The written procedure a run follows: warmups, measured passes, process model, cache state, and ordering.
_Avoid_: methodology, setup, harness

**Rig**:
The specific machine a run happened on, recorded in enough detail to be recognizable, including the GPU, driver, browser build, and display when the workload renders.
_Avoid_: environment, hardware, box

**Run**:
One execution of the protocol on one rig on one date, producing one run file.
_Avoid_: execution, trial, session

**Warmup**:
A pass whose samples are discarded.
_Avoid_: dry run, priming

**Measured pass**:
A pass whose samples count.
_Avoid_: iteration, trial, run

**Sample**:
One measurement of one candidate on one test in one measured pass.
_Avoid_: data point, observation, reading

**Section**:
A coarse workload within a benchmark, with its own unit and its own verdict.
_Avoid_: workload, scenario, phase

**Test**:
A fine workload within a section, charted on its own.
_Avoid_: case, sub-benchmark, scenario

**Metric**:
A supplementary measured value reported beside a section's samples but never charted or ranked.
_Avoid_: stat, KPI, indicator

**Gate**:
A precondition every candidate must meet before a run's samples count. A failed gate invalidates the run instead of scoring it.
_Avoid_: metric, check, assertion, parity score

**Limitation**:
A stated boundary on what the benchmark proves.
_Avoid_: caveat, disclaimer, threat to validity
