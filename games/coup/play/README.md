# Coup solo companion

Static ES modules; no API key, account, backend or saved personal data. Start a static HTTP server from the repository root and open `games/coup/play/`.

## Layers
- `engine.js`: immutable state transitions, legal decision enumeration, setup, public/private observation projection.
- `ai.js`: receives only the deciding player's observation and chooses from its legal moves. No authoritative state argument.
- `game.js`: DOM built with `textContent` from the human observation; timer invalidation on restart, explicit influence-loss and exchange decisions.

## Scope and digital policies
- Original five-character 2–6 player basic game; one human, 1–5 computers. No Reformation or optional two-player drafting setup.
- New-game starting player is random; in two-player games only the starting player receives one coin.
- Response windows run clockwise from the claimant. A resolved claim is never challenged again. If an aid block is exposed, resolve the original aid without a second blocking round.
- Ambassador exchange puts the private living hand plus two draws in escrow until exactly the original living influence count is kept; public lost cards are never included. Returned cards are shuffled into the court deck.
- Income-like transfers are limited to coins physically available in the treasury.
- Declining proof is allowed even with the claimed card. Proven cards are shuffled back before replacement. Successful action challenges refund action costs; successful blocks do not. Eliminated players retain zero coins.

## Difficulty
All levels use the same cards, rules and observation boundary. Easy selects actions broadly and challenges randomly; normal prefers real abilities, useful cards and affordable attacks; hard adds public card-count inference, threat-based targets, risk-aware blocks, and penalties for repeating blocked attacks or unproductive steals. A claim is never treated as proof of an opponent's hidden card.

Deterministic calibration in `test/coup-ai.test.js` uses 400 games per level against the same easy baseline and alternates the starting seat. These are simulation results, not guaranteed human win rates:
- Easy: 188 wins / 212 losses.
- Normal: 316 wins / 84 losses.
- Hard: 357 wins / 43 losses.

Another 180 games cover all levels across 2–6 players, checking legal moves and the 15-card / 50-coin invariants after every decision. All simulations have a hard decision cap; timeout is failure, not a draw.

## Verification
`npm run check` includes module syntax checks, all rule and AI tests, UI integration checks and static link validation. Rule tests cover action proofs/concessions, block proofs/concessions, assassination's two losses, cost refunds, elimination during response resolution, private exchanges and hidden-state noninterference.

Browser verification uses actual DOM controls with deterministic pre-navigation RNG and accelerated timers: human-first two-player and computer-first six-player full games, exchange selection, proof, influence loss, result-dialog cancellation, restart and 320/390 px overflow checks. Repeat those paths on the deployed URL after Pages has built the exact commit.

The UI hides opponents' private roles and all hidden card IDs. This prevents accidental DOM/log disclosure; a static client cannot stop its owner inspecting authoritative in-memory state using developer tools. Korean typography uses the same Google Fonts Noto Sans KR family as the archive's other games, with system fallbacks.
