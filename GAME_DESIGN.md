# Mini Golf Garden — design notes

## Fantasy

A miniature golf course that someone built in a lovely old walled garden. Every hole is a small composed scene: clipped hedges, a pond with a plank bridge, a windmill that actually turns, fireflies after dark. The game should feel like putting on a Sunday afternoon, not like operating a physics toy.

**Design rule:** the player must always be able to explain the last shot. If the ball did something odd, the art or the HUD failed to communicate it.

## The shot

- Pull back from the ball (sling-shot), release to putt. Power is linear in drag distance, clamped to `SHOT_MIN = 150` … `SHOT_MAX = 1010` px/s.
- A directional line, a power arc and an optional dotted prediction (statics only, stops at the first wall) make the shot legible.
- No shot under 5% power; a release inside the dead-zone cancels.
- Input is locked while the ball is rolling. No mulligans hidden in the controls.
- Keyboard aiming exists for trackpads and accessibility.

## Physics contract

| Constant | Value | Why |
| --- | --- | --- |
| Timestep | 1/120 s, fixed | identical shots on every device |
| Sub-steps | up to 12, movement ≤ 0.55 ball radius | no tunnelling through hedges |
| Grass decel | 700 px/s² | a full putt crosses roughly two thirds of the board |
| Stone | 405 | visibly runs |
| Sand | 2450 | visibly grabs |
| Mud | 3050 | almost a trap |
| Ice | 105 | the ball becomes a marble |
| Wall restitution | 0.64 | bounces lose energy; never gain |
| Cup capture | < 610 px/s inside 7px | fast balls lip out |
| Settle | < 15 px/s | no endless micro-roll |

Obstacles are pure functions of time (rotations and linear oscillators), so a replay with the same inputs is bit-identical — the determinism test relies on it.

## Content map

| # | Course | Theme | New idea | Par |
| --- | --- | --- | --- | --- |
| 1 | Sunny Meadows | bright lawn, daisies | aiming, gentle doglegs, one bunker | 29 |
| 2 | Mushroom Grove | woodland, giant caps | bumper mushrooms, narrow lanes | 32 |
| 3 | Lily Pond | water and planks | bridges, lily pads, a ferry raft | 33 |
| 4 | Windmill Valley | stone and sail | turning blades, timed gates, wind | 34 |
| 5 | Crystal Garden | violet glass | ice, teleporting flowers, angled prisms | 35 |
| 6 | Autumn Orchard | amber harvest | mud, conveyor belts, rolling logs | 35 |
| 7 | Moonlight Garden | blue night | bees, sliding hedges, long routes | 38 |
| 8 | Royal Garden | marble and topiary | fountains and combined obstacles | 37 |

Each course is authored as a 24×16 ASCII grid (one character per 40px tile) plus an obstacle list in cell coordinates. `courses/helpers.ts` seals the border and pads short rows, so authoring mistakes cannot produce an open board.

## Scoring and rewards

- Stars: 3 at par, 2 at one over, 1 for finishing. A per-hole override exists for unusual designs.
- Unlocks are star-gated: 0, 6, 16, 28, 42, 58, 76, 96. Every threshold is reachable with 27 stars per completed course.
- A hole is conceded at par + 6 so a player can never be trapped.
- Water costs one stroke and replaces the ball on the last dry lie.
- Bests are per hole; a worse replay never lowers the star rating.

## Modes

- **Journey** — nine holes per garden, scorecard at the end, next garden unlocked by stars.
- **Free Play / Zen** — pick any hole. Zen forces assists on and keeps the tone relaxed.
- **Daily Challenge** — one hole chosen by `hash(UTC date)`; everyone gets the same hole and twist, with a streak counter.
- **Time Attack** — nine holes against the clock, best time per garden.
- **Trick Shots** — six objectives measured from physics counters (walls hit, mushroom hit, teleporter use, exact strokes, no sand, hole in one).

## Art direction

No bitmap assets. Each hole is painted once into a 960×640 canvas with Canvas2D: continuous grass (no tile seams), merged hedge silhouettes with shadows only where they meet grass, hand-drawn flowers as scattered decoration, themed materials (stone, crystal, hay, topiary), a night wash with fireflies for Moonlight Garden, and a soft vignette. Animated obstacles are drawn per frame on top.

Ball, cup and flag are deliberately high-contrast so they read at phone size.

## Audio

Everything is synthesised with the Web Audio API: filtered noise for putts and splashes, short pitched blips for bounces, a triangle arpeggio for a birdie, a low three-note sink, and occasional birdsong between shots. No audio files to download, no licensing.

## Validation

`src/core/validator.ts` checks each hole for grid size, sealed borders, exactly one tee and cup, par range, ball-radius clearance at both ends, a walking route, obstacle placement outside walls, and a spread of real simulated putts. `scripts/report.ts` prints every warning. The test suite fails on structural errors; the deep opt-in pass adds a solvability search.
