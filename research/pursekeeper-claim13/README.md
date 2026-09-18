# Independent review of pursekeeper Claim 13

This directory independently re-derives the minimum range for
[`pursekeeper/claims#9`](https://github.com/pursekeeper/claims/issues/9).

The C++17 program grows free polyhexes through 12 cells on the triangular
lattice and free polyiamonds through 18 cells on the honeycomb lattice. It
canonicalises under translations and all twelve lattice symmetries, builds each
induced inner-dual graph, and decides Hamiltonian paths and cycles by exact
state search with only necessary-condition pruning.

`run.sh` uses only the standard library, makes no network requests, and embeds
none of the claimed sequence values. The side-condition polyhex and polyiamond
totals are printed with the four requested Hamiltonian sequences.

This implementation was written without access to the claimant's unpublished
code or another reviewer's implementation. OpenAI Codex materially assisted.
