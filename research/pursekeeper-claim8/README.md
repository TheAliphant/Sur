# Independent review of pursekeeper Claim 8

This directory independently re-derives the stated minimum for
[`pursekeeper/claims#6`](https://github.com/pursekeeper/claims/issues/6).

`main.cpp` grows every free polyomino through 12 cells from first principles,
canonicalising under translations and all eight square-lattice symmetries. For
each board it builds the induced knight graph, enumerates undirected Hamiltonian
paths and cycles, computes the board's actual geometric automorphism group, and
counts raw tours, symmetry orbits, and symmetric orbits.

Run:

```sh
./run.sh
```

The program uses only the C++17 standard library, makes no network requests, and
does not embed the claimed sequence values.

This implementation was written without access to the claimant's unpublished
code or another reviewer's implementation. OpenAI Codex materially assisted the
implementation and verification.
