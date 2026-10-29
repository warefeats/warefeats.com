# warefeats

The benchmark catalog: one runner repository per benchmark, one site that renders only what the runners produce. This is the shared language across every runner and the site.

## Catalog

**Benchmark**:
One published comparison of candidates on a fixed corpus and protocol, with its own page; its authored runs fix the candidates its verdict covers.
_Avoid_: comparison, study, suite

**Post**:
A dated story about one benchmark, told against the runs and candidates it locks in. The home page lists every post on one timeline, newest first; a later story is a later post.
_Avoid_: article, writeup, report

**Candidate**:
A pinned artifact under test: one product at one exact version in one configuration. Never a product as a whole, a company, or an organization.
_Avoid_: engine, tool, contestant, competitor

**Product**:
The upstream software a candidate is one release of, such as Martin or ESLint.
_Avoid_: project, tool, package

**Release line**:
A product's releases that share a major version (a minor below 1.0), represented in each fleet run by its newest stable release.
_Avoid_: branch, track, channel

**Verdict**:
The one-sentence outcome a post gives for a benchmark or a section, written by a person and ranked by the same statistic the page displays.
_Avoid_: result, conclusion

**Winner**:
The candidate a matchup names for a section: the best mean among the candidates picked, computed and never written. Where a section's samples repeat one measurement, a lead inside the run's noise is a tie.
_Avoid_: verdict, leader, champion

**Matchup**:
A reader-picked set of two or more candidates from one run of one benchmark, laid out like a post without its prose: each section's winner, then its charts, then the scorecard. It gives no verdict.
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

**Fleet run**:
A run made without a person when a release line moves. It carries no verdict of its own and appears on the matchup; a later post may tell its story.
_Avoid_: CI run, nightly

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
