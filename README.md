# Refract

Draw the light across a dark optical bench. Connect each channel’s two outlined emitters, thread every filled lens of its shape, and spend every crystal charge exactly. Play a course of 24 handcrafted puzzles in **Campaign**, or follow an endless, increasingly difficult sequence in **Cascade**.

## Run

Requires Node.js 22.12+ (or 20.19+).

```sh
npm ci
npm run dev
```

Open the local URL Vite prints. Everything runs in the browser, with no backend, network services, art files, or audio downloads.

## Build

```sh
npm run build
```

Serve `dist/` at the root of any static web server. `npm run preview` serves the production build locally.

## Controls

- **Mouse, pen, or touch:** press an outlined emitter and drag through neighboring nodes. Release to keep the beam. Grab either end to continue, or a node along a beam to shorten it. Drag backward to retract.
- **R / CLEAR:** clear the current board.
- **Arrow keys / WASD:** navigate menus and the campaign grid.
- **Enter / Space:** accept the highlighted choice.
- **Escape / BACK:** return to the previous screen.
- **M:** toggle sound. **Backtick:** toggle the engine’s diagnostic overlay.

All menus also work by tapping or clicking their buttons. Emitters are outlined; lenses are filled. The triangle, square, and diamond channels have distinct colors and shapes. Neutral hexagonal crystals show spent / total charges. A move that breaks a rule simply leaves the beam where it was.

Progress lasts until the page closes or reloads. Campaign progress and Cascade counts are independent. Starting Cascade again begins a new run.

## Checks and structure

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

`game.ts` holds immutable state transitions and the version-2 debug surface. `rules.ts` enforces the light-tracing rules; `view.ts` draws the bench. The Simple 2D engine handles frames, pointer samples, canvas fitting, audio, and recording. Tests run that engine over a Node canvas and a counted clock.

Cascade independently chooses its grid dimensions, then samples a catalog of certified optical motifs, reflections, and channel permutations. The exact solver in `solver.ts` enumerates distinct beam routes and joint solutions to validate the difficulty floor. Each orientation is checked separately for its canonical drawing’s branching factor. The catalog allows varied fresh boards without a potentially lengthy search during play.

The player-facing presentation and captured live-play replay are in `showcase/`.
