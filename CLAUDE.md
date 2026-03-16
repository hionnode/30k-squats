# 30K Squats 2026

Single-file PWA squat tracker with real-time camera pose detection. Goal: 30,000 squats in 2026.

## Tech Stack

- Vanilla HTML/JS/CSS (no framework, no build step)
- MediaPipe Pose Landmarker (WASM + GPU) for pose detection
- localStorage for all data persistence
- Single `index.html` file — the entire app

## Architecture

Everything lives in `index.html`. No build step, no dependencies to install.

### Key Functions

- `detectLoop()` — main pose detection loop, runs on each video frame
- `drawSkeleton()` — renders pose landmarks on canvas overlay
- `processSquat()` — squat counting logic based on knee angle thresholds
- `checkLandmarkReadiness()` — validates skeleton visibility before counting starts
- `updateDashboard()` — refreshes stats, streaks, heatmap, and session info

## Deploy

```sh
npx wrangler pages deploy . --project-name=30k-squats --branch=main
```

Live URL: https://30k-squats.pages.dev

## Workflow

After finishing code changes, always commit and deploy without asking:

1. Commit the changes (follow commit style below)
2. Deploy with the wrangler command above

## Commit Style

```
Add <feature description> (<tags>)
```

Tags reference design change items (e.g., CD1, CD2).
