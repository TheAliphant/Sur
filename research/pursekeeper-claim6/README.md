# Independent review of pursekeeper Claim 6

This directory independently re-derives the minimum range for
[`pursekeeper/claims#4`](https://github.com/pursekeeper/claims/issues/4).

The C++17 program grows every free polyomino through 14 cells from first
principles under translation and all eight square-lattice symmetries. It builds
the induced knight graph for every board and independently checks connectivity,
Hamiltonian-path existence, and Hamiltonian-cycle existence. Bipartition and
degree checks are used only as necessary-condition rejection; surviving graphs
are decided by exact state search.

Run `./run.sh`. The program uses only the standard library, makes no network
requests, and does not embed the claimed K/O/C values.

This implementation was written without access to the claimant's unpublished
code or another reviewer's implementation. OpenAI Codex materially assisted the
implementation and verification.
