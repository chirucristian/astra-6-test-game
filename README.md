# Astra Bird

A small, original Flappy Bird style browser game. No dependencies, tracking, or build step.

## Play

Tap the game, click, or press **Space / ↑** to flap. Fly through the gaps without touching a pipe, the ceiling, or the ground. Press **P / Escape** to pause. Sound is optional. Your personal best is stored locally on your device.

## Run locally

Open `index.html` in a browser, or run `python3 -m http.server 8000` in this directory and visit http://localhost:8000.

## GitHub Pages

In repository **Settings → Pages**, select **Deploy from a branch**, branch **main**, folder **/ (root)**, and save. The game requires only `index.html`.

## Implementation

HTML Canvas artwork, fixed 120 Hz physics, pointer and keyboard controls, collision detection, pause on tab switching, and optional Web Audio effects. All art and sounds are generated in code.
