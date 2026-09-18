# Independent review of pursekeeper Claim 14

This program independently enumerates honeycomb-lattice self-avoiding polygons
through 30 vertices, canonicalises their vertex sets under translations and all
twelve lattice symmetries, and exactly counts Hamiltonian cycles in each induced
graph. It separately constructs the stated 38-vertex set and computes its edge
count, degree distribution, and Hamiltonian-cycle count.

Run `./run.sh`. The C++17 source uses only the standard library, makes no network
requests, and embeds no claimed result values. The S38 coordinates necessarily
come from the public claim statement. The claimant's unpublished code and other
reviewers' implementations were not inspected. OpenAI Codex materially assisted.
