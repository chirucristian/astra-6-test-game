# Astra Bird

A small, original Flappy Bird style browser game. No dependencies, tracking, or build step.

## Play

Tap the game, click, or press **Space / ↑** to flap. Fly through the gaps without touching a pipe, the ceiling, or the ground. Press **P / Escape** to pause. Sound is optional. Your personal best is stored locally on your device.

## Collectibles and health

Collectibles appear 32–48 pixels above or below the middle of a pipe gap, with clearance from both pipes. Gold stars add one bonus point. Pink hearts add one health, up to three. At full health, a heart gives one bonus point instead. You start each run with one health. A hit spends one health; if you survive, you get 1.5 seconds of protection and are moved into the pipe gap (or bounced away from the ground).

The skyline uses stable world coordinates so buildings scroll smoothly without changing shape at wrap boundaries.

## Progressive speed

Each flight starts at 155 pixels per second and smoothly gains 1.5 pixels per second for every second of active play, capped at 260. Pipes, collectibles, and scenery share the same movement distance. Pausing freezes the ramp; restarting resets it.

## Run locally

Open `index.html` in a browser, or run `python3 -m http.server 8000` in this directory and visit http://localhost:8000.

## GitHub Pages

In repository **Settings → Pages**, select **Deploy from a branch**, branch **main**, folder **/ (root)**, and save. The game requires only `index.html`.

## Implementation

HTML Canvas artwork, fixed 120 Hz physics, pointer and keyboard controls, collision detection, pause on tab switching, and optional Web Audio effects. All art and sounds are generated in code.
