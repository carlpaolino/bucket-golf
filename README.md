# Bucket Golf

A simple, single-page web app for tracking your **9-hole** rounds. Pick from a
handful of bundled courses, upload or type in your scores, and save the round
locally in your browser.

Built with vanilla HTML / CSS / JavaScript — no build step required.

## Features

- Choose from 4 pre-built 9-hole courses, each with its own par and map.
- Visual SVG map of the selected course.
- Manual score entry per hole with live total + par comparison.
- Upload a CSV / TXT scorecard (any whitespace- or comma-separated list of 9
  numbers) to auto-fill scores.
- Saved rounds persist in `localStorage` so they survive a page reload.
- Red & white theme.

## Run it

Just open `index.html` in your browser. Or serve the folder with any static
server, e.g.:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Files

- `index.html` — markup
- `styles.css` — red & white theme
- `script.js` — courses, score logic, persistence

## CSV format

Any text file with at least 9 numeric values separated by commas, spaces, tabs,
or newlines. For example:

```
4,3,5,4,3,4,5,3,4
```
