# Aerosketch ✋✍️

Draw on screen using nothing but your hand and a webcam. Point your index finger to
draw, raise two fingers to pick a tool, make a fist to lift the pen — no mouse,
keyboard, or install required.

**[https://aerosketch.vercel.app/](#)

---

## What it is

Aerosketch is a browser-based, gesture-controlled drawing app. It tracks your hand in
real time with **MediaPipe Hands**, turns your fingertip into a smoothed, pressure-like
pen, and renders everything on an HTML canvas — entirely client-side, no server, no
account, nothing installed on your machine.

It started life as a Python/OpenCV prototype exploring hand-landmark tracking (still in
this repo, see below) and was rebuilt from the ground up as a standalone web app.

## Features

- Real-time hand tracking with jitter-smoothed, natural-feeling strokes
- Gesture controls: point to draw, two fingers to select a tool, fist to lift the pen
- 7 preset colors + a full custom color picker
- Adjustable brush size, eraser, mirror/symmetry mode
- Undo/redo, canvas backgrounds (camera feed, solid, grid paper, dot grid)
- Autosaves your drawing locally and restores it next visit
- Export your drawing as a PNG
- Works with mouse/touch too, if you'd rather not use gestures

## Run it locally


```bash
git clone https://github.com/Sangam8168/Aerosketch.git
cd Aerosketch
python3 -m http.server 8000
```

Then open `http://localhost:8000` and click **Open Camera**. (Serving it locally like
this, rather than opening `index.html` directly, avoids browser camera-permission
quirks with `file://` pages.)

## Tech stack

**Web app:** JavaScript, HTML5 Canvas API, [MediaPipe Hands](https://developers.google.com/mediapipe) (loaded as WebAssembly from a CDN)

**Original prototype:** Python, OpenCV, NumPy, MediaPipe

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a full breakdown of how the hand-tracking
model works and how the app is put together internally.

## Project structure

```
index.html, styles.css, script.js   The app — markup, styling, and all logic
aerosketch_handrecog/                Original Python/OpenCV prototype
AEROSKETCH.ipynb                     Early prototyping notebook
assets/models/                       Raw MediaPipe model files (.tflite) from an
                                      earlier native-app iteration
ARCHITECTURE.md                      Deeper technical writeup
```

## Future ideas

- Lightweight gesture classifier on top of the existing hand landmarks (e.g. pinch to
  erase, more tool shortcuts) — see the "do we need to train a model" section in
  ARCHITECTURE.md for why this is the right next step over touching the tracking model
  itself
- Handwriting-to-text on top of captured strokes
- Multi-hand / collaborative drawing
