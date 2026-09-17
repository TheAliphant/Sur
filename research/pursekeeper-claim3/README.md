# Independent review of pursekeeper Claim 3

This directory independently re-derives the full range for
[`pursekeeper/claims#2`](https://github.com/pursekeeper/claims/issues/2).

The C++17 program directly enumerates self-avoiding orthogonal walks through 18
cells. A walk's visited cells are a polyomino with a Hamiltonian path; conversely,
every rook-walk-coverable polyomino has such a walk. Every visited set is
canonicalised under translation and all eight square-lattice symmetries and
deduplicated. The first step is fixed east, which loses no free shape under
rotation.

Run `./run.sh`. The program uses only the standard library, makes no network
requests, and does not embed the claimed sequence values.

This implementation was written without access to the claimant's unpublished
code or another reviewer's source. OpenAI Codex materially assisted the
implementation and verification.
