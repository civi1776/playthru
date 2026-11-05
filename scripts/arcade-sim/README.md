# Arcade balance simulator

Plays headless nine-hole rounds through the real engine with a scripted
player, and reports points, clock pressure, strokes, putts, hazards and
where the time goes. Found three real bugs on its first run (the scorer
judging against the unscaled time par, the green-wall handoff, tree-side
arrival), so run it after any change to `lib/arcade/`.

```bash
# careful player: 0.9s hesitation, tight meter timing
node --import ./scripts/arcade-sim/register-hooks.mjs scripts/arcade-sim/sim.mjs 16 0.9

# sloppy player: 3s hesitation, loose meter timing
SIGMA=0.12 node --import ./scripts/arcade-sim/register-hooks.mjs scripts/arcade-sim/sim.mjs 16 3
```

Args: rounds per difficulty, hesitation seconds. `SIGMA` is the meter
timing error (0.05 careful, 0.12 sloppy). The cart controller is naive
and steers into water about 2% of rounds; a human steers around, so
ignore "did not finish" lines unless the count jumps.
