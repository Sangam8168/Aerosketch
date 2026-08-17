# Air Notepad — Architecture & Model Notes

## What this project is

A "draw in thin air" app: point your index finger at a webcam and it draws on screen,
raise two fingers to pick a color/tool from a floating panel, and make a fist to lift
the pen. The shipped product is a single static web app (`index.html` + `styles.css` +
`script.js`, no backend, no build step). The repo also keeps the earlier Python
prototyping work that the web app grew out of.

## Tech stack — where each piece is used

| Tech | Used in | What it does here |
|---|---|---|
| **MediaPipe Hands** | Both the Python prototype and the web app | The actual hand-tracking model — outputs 21 hand landmarks per frame. Everything else in the project is built on top of its output. |
| **OpenCV** | Python prototype only (`airnotepad_handrecog/`) | Reads webcam frames (`cv2.VideoCapture`) and renders the preview window (`cv2.imshow`) during early prototyping. |
| **NumPy** | Python prototype only | Backs the drawing canvas and coordinate/array math in the prototype scripts. |
| **JavaScript** | Web app (`script.js`) | Everything in the shipped product: loads MediaPipe via WebAssembly in-browser, does gesture detection, point smoothing, canvas rendering, and the DOM-based tool panel — no Python involved. |

The Python prototype and the web app are two separate implementations of the same idea — the prototype proved the concept out with OpenCV/NumPy, and the web app is the browser-native rewrite that actually ships.

## Repo layout

```
index.html                  Markup only — landing screen + camera/drawing screen
styles.css                  All styling
script.js                   All application logic (~680 lines, one IIFE)

airnotepad_handrecog/       Original Python/OpenCV prototype (predates the web app)
  test.py, test1.py           Minimal webcam + landmark-drawing scripts
  handrecogdraw*.ipynb         Notebook versions with drawing-on-canvas logic
AIRNOTEPAD.ipynb            Early root-level prototype notebook

assets/models/
  hand_detector.tflite        Palm/hand detector, stage 1 of the model (2.3 MB)
  hand_landmarks_detector.tflite  Landmark regressor, stage 2 of the model (5.3 MB)
  (not used by the web app — see "Which runtime uses what" below)

README.md, .gitignore
```

Nothing in this repo trains a model. Every hand-tracking path here calls the same
pretrained network; they differ only in *language/runtime* and in what happens to the
model's output afterward.

---

## The model: MediaPipe Hands

All three implementations in this history (Python prototype, the earlier Flutter app,
the current web app) are built on **MediaPipe Hands**, a pretrained model Google ships
as part of MediaPipe. It is not trained or fine-tuned anywhere in this repo.

It's a **two-stage pipeline**, run per frame:

1. **Palm detector** (`hand_detector.tflite`) — a lightweight CNN that scans the full
   camera frame and outputs a bounding box around a hand, if one is present. This is
   the more expensive of the two stages, so it doesn't need to run every single frame —
   once a hand is being tracked, stage 2 can reuse a region derived from the previous
   frame's landmarks, and stage 1 only re-fires if tracking is lost.
2. **Landmark regressor** (`hand_landmarks_detector.tflite`) — takes just the cropped
   hand region from stage 1 and outputs **21 3D keypoints**: wrist, and 4 joints per
   finger (thumb, index, middle, ring, pinky), each as `{x, y, z}` normalized to the
   0–1 range of the cropped region. `z` is a rough relative-depth estimate; this project
   only uses `x`/`y`.

That's the entire "AI" part of the app. Everything downstream — deciding which finger is
extended, what gesture that means, how to smooth the point, how to render a stroke — is
ordinary geometry and application logic, not machine learning.

### Which runtime uses what

| Where | How the model runs |
|---|---|
| `airnotepad_handrecog/*.py`, `*.ipynb` | Google's official Python bindings: `import mediapipe as mp; mp.solutions.hands.Hands(...)`, fed frames from `cv2.VideoCapture`, rendered with OpenCV (`cv2.imshow`). This is where the concept (index-fingertip → draw on a `numpy` canvas) was first proven out. |
| Earlier Flutter app (now removed from the working tree, still in git history) | Loaded the raw `.tflite` files directly via the `tflite_flutter` plugin and ran inference itself in Dart — more manual (own image preprocessing/tensor handling), which is why those two model files are still sitting in `assets/models/`. |
| **Current web app** (`script.js`) | Loads `@mediapipe/hands` compiled to WebAssembly from a CDN (`cdn.jsdelivr.net/npm/@mediapipe/hands`) and runs entirely client-side in the browser. Same model weights as the `.tflite` files, different execution engine — no Python, no Dart, nothing server-side. |

The `.tflite` files are orphaned now that the Flutter app is gone — nothing in the
current app reads them — but they're kept in place since they're ML artifacts.

---

## Web app data flow

```
 webcam ──▶ <video> element ──▶ MediaPipe Camera helper ──▶ MediaPipe Hands (WASM)
                                                                   │
                                                     21 landmarks, ~every frame
                                                                   ▼
                                                            onResults(results)
                                                     (the app's de facto main loop)
```

From there, per frame:

1. **Finger-extension geometry** — `fingerUp()` compares each fingertip's `y` to its
   knuckle's `y`. This uses **hysteresis** (needs a gap > 0.045 to register "just went
   up", only drops back to "down" below 0.012) so tracking noise sitting near the
   threshold doesn't flicker the result frame to frame.
2. **Gesture mode**, derived from which fingers are up:
   - index + middle → **select** (aim at the floating tool panel)
   - index only → **draw**
   - anything else → **idle** (pen up) — but only acted on after being idle for
     >120ms, so one misread frame doesn't fragment a stroke into pieces
3. **Position smoothing** — the raw index-fingertip point is run through a **One Euro
   Filter** (`mincutoff=0.35, beta=0.7`) before it's used for anything. This is a
   standard filter for exactly this problem (noisy real-time 2D pointer data): heavy
   smoothing when the hand is nearly still, opening up automatically during fast motion
   so it doesn't lag behind quick strokes. Stroke *width* is separately smoothed with an
   exponential moving average (`α=0.35`) of drawing speed, so line thickness doesn't
   flicker even when the centerline is already smooth.
4. **Rendering** — two canvases: the visible one is redrawn every frame from scratch
   (camera image, or a chosen solid/grid/dot background); the actual drawing lives on a
   separate, never-cleared offscreen `inkCanvas` that's composited on top each frame.
   Strokes are stored as arrays of `{x, y, w}` points, rendered as chained quadratic
   curves through consecutive midpoints (not straight segments) for a natural hand-drawn
   look, which is also what makes undo/redo trivial — pop a stroke, replay the rest.
5. **Tool selection** — same mapped fingertip position, in *select* mode, is hit-tested
   against each toolbar button's real DOM bounding box; holding over one for `DWELL_MS`
   (650ms) triggers it, shown as a filling progress bar.

---

## Do you need to train the model?

**No, and it's not really practical either.** MediaPipe Hands is a general-purpose
model Google trained on a large, diverse hand dataset (skin tones, lighting, hand
shapes, angles). Retraining or fine-tuning it would require a comparably large labeled
dataset and meaningful ML infrastructure — disproportionate effort for what this app
needs, and unlikely to beat Google's version without that scale of data.

What actually determines how "good" the app feels is almost entirely the **application
layer**, not the model:

- Detection reliability → lighting, camera quality, `minDetectionConfidence` /
  `minTrackingConfidence` (currently 0.7/0.7 — lower if hands aren't being found often
  enough, raise if it's tracking things that aren't hands).
- Jitter/smoothness → the One Euro Filter constants and the hysteresis/debounce values
  above. These are the knobs that were actually tuned to fix the choppiness you ran
  into earlier — no model changes were needed.
- More gestures (e.g. pinch-to-erase, thumbs-up for a specific tool) → don't retrain the
  landmark model. The standard approach is to keep MediaPipe frozen and train a small,
  separate classifier (a tiny MLP or even just more geometric rules) that takes the 21
  landmark points it already outputs as input features. That's a lightweight, fast
  thing to build and iterate on — nothing like training a CNN from scratch — and is the
  right next step *if* you want smarter gesture recognition later.

So: leave the hand-tracking model alone. If something feels off, it's almost always
worth tuning the filters/thresholds in `script.js` first.
