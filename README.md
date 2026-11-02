# Mini Golf Garden

A cosy, physics-based miniature-golf game for [Little Joy Arcade](https://littlejoyarcade.site): 72 hand-built holes across eight whimsical gardens.

- **Play:** <https://jd4rider.github.io/mini-golf-garden/play/>
- **Engine:** Phaser 3 rendering + a custom deterministic golf physics engine
- **Stack:** TypeScript, Vite, Vitest, Playwright
- **Saves:** `localStorage`, mirrored to a Little Joy account by `public/arcade-client.js`

## What is in the box

| Piece | Detail |
| --- | --- |
| Holes | 8 courses × 9 holes, all hand-authored as 24×16 tile grids |
| Surfaces | grass, rough, stone, sand, mud, ice, water, bridges, conveyors, slopes |
| Obstacles | windmills, sliding gates, rafts, lily pads, mushrooms, fountains, teleporting flowers, springs, wind zones, rotating and sliding logs, bees |
| Modes | Journey, Free Play, Daily Challenge, Time Attack, Trick Shots, Zen |
| Scoring | par, birdies, eagles, hole-in-one, per-hole stars, course scorecards, personal bests |
| Presentation | procedurally painted garden artwork, WebAudio sound and birdsong, HTML/CSS menus |

## Controls

- **Mouse / touch:** press near the ball, drag *away* from the target, release. Further drag = more power. Release inside the dead-zone to cancel.
- **Keyboard:** ← → aim · ↑ ↓ power · Space putt · R restart hole · Esc pause.
- Landscape is strongly recommended on a phone; the board is 3:2.

## Run it

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm test           # 44 unit tests: physics, scoring, saves, daily seed, all 72 holes
npm run build      # typecheck + production bundle in dist/
npm run test:e2e   # Playwright smoke test (needs npx playwright install chromium)
```

Course health report after editing a hole:

```bash
npx vite-node scripts/report.ts
```

## Architecture

```
src/core/            pure game logic, no Phaser and no DOM
  constants.ts       fixed timestep, ball/cup radii, speeds
  world.ts           deterministic physics: surfaces, collisions, obstacles, cup
  courses/           8 hand-authored course files + grid normaliser
  validator.ts       structural + connectivity + simulated-putt checks
  scoring.ts         golf language and star rules
  save.ts            versioned save, migration, progression, achievements
  daily.ts           UTC-seeded daily hole and streaks
  challenges.ts      trick-shot objectives and completion rules
src/game/            Phaser presentation
  scene.ts           input, shot flow, effects, hole reporting
  art.ts             procedural canvas painting of each hole
  render.ts          animated obstacles, flag, ball, aim assist
  audio.ts           synthesised effects and ambience (no audio files)
  theme.ts           eight garden palettes
  bus.ts             decoupled UI ↔ scene events
src/ui/              HTML/CSS menus, HUD, results, toasts
src/app.ts           round state machine, recording, unlocks
src/main.ts          bootstrap
```

### Physics notes

- Fixed 120 Hz simulation with velocity-scaled sub-stepping; frame rate cannot change a shot.
- Walls are merged tile runs plus optional angled capsules; circle-vs-box and circle-vs-capsule resolution with restitution, tangential scrape and a low-speed settle threshold.
- The cup only captures below `CAPTURE_SPEED`; faster balls lip over. A gentle pull inside 34px makes near misses feel generous.
- Moving obstacles are pure functions of time, so replays and the daily challenge are identical for everyone.
- Determinism is covered by a test that plays the same shot twice on a world with a moving bee and compares the final position exactly.

## Tests

`npm test` runs the physics suite (tunnelling, friction ordering, cup behaviour, water penalty, bumper energy, determinism, preview), the scoring suite, save migration and progression, daily determinism, and a validation sweep across all 72 holes (grid shapes, sealed borders, tee/cup clearance, walking route, obstacle placement, simulated putts).

`npm run test:e2e` drives a real Chromium: menu → garden → hole → drag → the stroke counter, failing on any console error. Run `npx playwright install chromium` once first.

## Publishing

The game is a normal Little Joy Arcade game repo: `pages.yml` builds it and publishes the playable build to `/play/` plus a small landing page at the root. Per the platform contract, the repo does **not** set a Pages custom domain or ship `public/CNAME`; the portal prefers `https://minigolf.littlejoyarcade.site/play/` and falls back to the `github.io` build.

1. `git init && git add -A && git commit -m "Mini Golf Garden"`
2. `gh repo create jd4rider/mini-golf-garden --public --source=. --push`
3. Publish the catalogue row with `GAME_MANIFEST.json` (`scripts/publish-game.mjs` in the portal repo).
4. Optional: register the `minigolf` subdomain with the portal's `register-subdomain` function. Do not add a CNAME to this repo.

## Save contract

`mini-golf-garden-save-v1` holds settings, per-hole bests and stars, achievements, daily results, time-attack records and trick-shot clears. `migrateSave` accepts partial or corrupt payloads and fills the gaps, so a save from an older build still loads.

Made for Little Joy Arcade.
