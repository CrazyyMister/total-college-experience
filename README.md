# Venus University

A personal, private build of Venus University: a single-player, AI-driven dating sim in visual-novel form. A cloud LLM writes the scenes and a locally managed ComfyUI renders the character art. It is an Electron desktop app (React, TypeScript, Zustand).

## What it needs

- Windows, with an NVIDIA GPU or an AMD RDNA 3/4 GPU for ComfyUI.
- Node 22.
- An API key for the text model, entered in Settings.

## Running in development

```
npm install
npm run dev
```

Everything the player sets up lives in `data/` (settings, saves and the characters made in the game); it is gitignored and there is no server.

Before committing, `npm run typecheck` and `npm test` have to pass.

## Where things are written down

- `DESIGN_GUIDE.md` — what the game is, where things live and the rules every change keeps. Start here.
- `UI_STYLE_GUIDE.md` — how anything on screen looks and moves.
- `TESTING_PLAN.md` — the steps for testing the game by hand.
- `ROTEIRO_COLLEGE_SIM.md` and the `PLANO_*.md` files — the roadmap and the plans for each stage of it.

## Licence

- Code is licensed under AGPL-3.0-only — see `LICENSE`.
- Image, audio and video files are all rights reserved — see `LICENSE-ASSETS.md`.
