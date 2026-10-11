import { describe, it, expect } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { createEngine, ConstantClock } from "@clockwyrks/simple-2d";
import {
  game,
  initial,
  debug,
  action,
  targets,
  type RefractState,
  type Cell,
  type PointerDevice,
} from "./game";
import {
  parseBoard,
  legal,
  complete,
  solved,
  cellX,
  cellY,
  spent,
} from "./rules";
import { CAMPAIGN } from "./campaign";
import { CASCADE_BOARDS } from "./cascade-boards";
import { generate } from "./generator";
import { analyze } from "./solver";
import * as C from "./constants";
async function harness(step = 16) {
  const events = new EventTarget();
  const canvas = createCanvas(C.STAGE_W, C.STAGE_H);
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    background: "#080f17",
    game,
    layout: C.LAYOUT,
    clock: new ConstantClock(step),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  await engine.initialize();
  const key = async (code: string) => {
    events.dispatchEvent(
      Object.assign(new Event("keydown"), { code, repeat: false }),
    );
    await engine.advance(1);
    events.dispatchEvent(Object.assign(new Event("keyup"), { code }));
    await engine.advance(1);
  };
  return { engine, events, key };
}
function at(s: RefractState, c: Cell) {
  return [cellX(c.col, s.board.cols), cellY(c.row, s.board.rows)] as const;
}
function trace(
  s: RefractState,
  cells: readonly Cell[],
  device: PointerDevice = "mouse",
) {
  s = debug.pointerDown(s, ...at(s, cells[0]), device);
  for (const c of cells.slice(1)) s = debug.pointerMove(s, ...at(s, c), device);
  return debug.pointerUp(s, device);
}
describe("engine integration", () => {
  it("advances immutable values by engine seconds and registers live diagnostics", async () => {
    const { engine } = await harness(25);
    const original = engine.state;
    await engine.advance(40);
    expect(engine.state.simTime).toBeCloseTo(1);
    expect(original.simTime).toBe(0);
    expect(engine.diagnostics().find((d) => d.name === "screen")?.value).toBe(
      "title",
    );
    expect(engine.diagnostics().every((d) => !d.error)).toBe(true);
    engine.destroy();
  });
  it("runs both modes through keyboard and preserves independent progression", async () => {
    const { engine, key } = await harness();
    await key("Enter");
    expect(engine.state.screen).toBe("select");
    await key("Enter");
    expect(engine.state.board.nodes).toEqual(parseBoard(CAMPAIGN[0]).nodes);
    await key("Escape");
    await key("Escape");
    await key("ArrowDown");
    await key("Enter");
    expect(engine.state.mode).toBe("cascade");
    expect(engine.state.screen).toBe("playing");
    await key("KeyM");
    expect(engine.state.muted).toBe(true);
    await key("Escape");
    expect(engine.state.menuIndex).toBe(1);
    engine.destroy();
  });
  it("resolves every ordered primary pointer sample and plays each event cue once", async () => {
    const { engine, events } = await harness();
    engine.apply((s) => debug.loadBoard(s, ["TtT"]));
    const cues: string[] = [];
    engine.events.on("cue:played", (e) => cues.push(e.cue));
    const send = (type: string, col: number) =>
      events.dispatchEvent(
        Object.assign(new Event("pointer" + type), {
          clientX: cellX(col, 3),
          clientY: cellY(0, 1),
          pointerId: 1,
          isPrimary: true,
          pointerType: "mouse",
          button: 0,
          buttons: type === "up" ? 0 : 1,
        }),
      );
    send("down", 0);
    send("move", 1);
    send("move", 2);
    send("up", 2);
    await engine.advance(1);
    expect(engine.state.screen).toBe("solved");
    expect(cues).toEqual([
      C.CUES.connect,
      C.CUES.channelComplete,
      C.CUES.solved,
    ]);
    expect(engine.state.pointer.down).toBe(false);
    engine.destroy();
  });
  it("clears only during play and emits the clear cue only when a segment existed", async () => {
    const { engine, key } = await harness();
    engine.apply((s) => debug.loadBoard(s, ["TttT"]));
    engine.apply((s) => debug.pointerDown(s, cellX(0, 4), C.BOARD_CY));
    engine.apply((s) => debug.pointerMove(s, cellX(1, 4), C.BOARD_CY));
    const cues: string[] = [];
    engine.events.on("cue:played", (e) => cues.push(e.cue));
    await key("KeyR");
    await key("KeyR");
    expect(cues).toEqual([C.CUES.clear]);
    engine.apply((s) => debug.setScreen(s, "solved"));
    const before = engine.state;
    await key("KeyR");
    expect(engine.state.beams).toEqual(before.beams);
    engine.destroy();
  });
  it("renders all screens and records real drawing commands", async () => {
    const { engine } = await harness();
    engine.startRecording();
    for (const screen of [
      "title",
      "howto",
      "select",
      "playing",
      "solved",
      "complete",
    ] as const) {
      engine.apply((s) => debug.loadBoard(s, ["T1t", "s1T", "S1S"]));
      engine.apply((s) => debug.setScreen(s, screen));
      await engine.advance(1);
    }
    const recording = engine.stopRecording();
    expect(recording.frames).toHaveLength(6);
    expect(recording.ops.length).toBeGreaterThan(100);
    engine.destroy();
  });
});
describe("targets and navigation", () => {
  it("provides separated touch-size targets within the stage on every screen", () => {
    for (const screen of [
      "title",
      "howto",
      "select",
      "playing",
      "solved",
      "complete",
    ] as const)
      for (const mode of ["campaign", "cascade"] as const) {
        const s = { ...initial(), screen, mode };
        const ts = targets(s);
        for (const t of ts) {
          expect(t.w).toBeGreaterThanOrEqual(C.TARGET_MIN_W);
          expect(t.h).toBeGreaterThanOrEqual(C.TARGET_MIN_H);
          expect(t.x).toBeGreaterThanOrEqual(0);
          expect(t.y).toBeGreaterThanOrEqual(0);
          expect(t.x + t.w).toBeLessThanOrEqual(C.STAGE_W);
          expect(t.y + t.h).toBeLessThanOrEqual(C.STAGE_H);
        }
        for (let i = 0; i < ts.length; i++)
          for (const b of ts.slice(i + 1)) {
            const a = ts[i];
            expect(
              a.x + a.w <= b.x ||
                b.x + b.w <= a.x ||
                a.y + a.h <= b.y ||
                b.y + b.h <= a.y,
            ).toBe(true);
          }
      }
  });
  it("requires matching press/release, supports hover and every pointer device", () => {
    for (const d of ["mouse", "touch", "pen"] as const) {
      let s = initial();
      const t = targets(s)[1];
      s = debug.pointerMove(s, t.x + 20, t.y + 20, d);
      expect(s.menuIndex).toBe(1);
      s = debug.pointerDown(s, t.x + 20, t.y + 20, d);
      s = debug.pointerMove(s, 0, 0, d);
      s = debug.pointerUp(s, d);
      expect(s.screen).toBe("title");
      s = debug.pointerDown(s, t.x + 20, t.y + 20, d);
      s = debug.pointerUp(s, d);
      expect(s.mode).toBe("cascade");
      expect(s.pointer.device).toBe(d);
    }
  });
  it("wraps select rows and columns and refuses locked boards", () => {
    let s = action(initial(), "confirm");
    s = action(s, "left");
    expect(s.selectIndex).toBe(5);
    s = action(s, "up");
    expect(s.selectIndex).toBe(23);
    expect(action(s, "confirm").screen).toBe("select");
    s = action(s, "right");
    expect(s.selectIndex).toBe(18);
    s = action(s, "down");
    expect(s.selectIndex).toBe(0);
  });
  it("returns from instructions with the right title highlight", () => {
    let s = action({ ...initial(), menuIndex: 2 }, "confirm");
    expect(s.screen).toBe("howto");
    s = action(s, "back");
    expect(s.menuIndex).toBe(2);
  });
});
describe("tracing and limits", () => {
  it("leaves no isolated cell after release; respects the circular hit radius", () => {
    let s = debug.loadBoard(initial(), ["TttT"]);
    s = debug.pointerDown(s, cellX(0, 4) + C.NODE_HIT_R + 1, C.BOARD_CY);
    expect(s.tracing).toBeNull();
    s = debug.pointerDown(s, cellX(0, 4), C.BOARD_CY);
    expect(s.beams[0].cells).toHaveLength(1);
    expect(debug.pointerUp(s).beams[0].cells).toEqual([]);
  });
  it("persists, reverses, shortens, and retracts partial beams", () => {
    let s = debug.loadBoard(initial(), ["TtttT"]);
    s = trace(s, [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 2, row: 0 },
      { col: 3, row: 0 },
    ]);
    expect(s.beams[0].cells).toHaveLength(4);
    s = debug.pointerDown(s, ...at(s, { col: 2, row: 0 }));
    expect(s.beams[0].cells).toHaveLength(3);
    s = debug.pointerMove(s, ...at(s, { col: 1, row: 0 }));
    expect(s.beams[0].cells).toHaveLength(2);
    s = debug.pointerUp(s);
    s = debug.pointerDown(s, ...at(s, { col: 0, row: 0 }));
    expect(s.beams[0].cells).toEqual([
      { col: 1, row: 0 },
      { col: 0, row: 0 },
    ]);
  });
  it("checks adjacency, exclusion, empty cells, lenses and terminal emitter capacity", () => {
    let s = debug.loadBoard(initial(), ["TtTS"]);
    s = debug.pointerDown(s, ...at(s, { col: 0, row: 0 }));
    expect(legal(s.board, s.beams, "triangle", { col: 2, row: 0 })).toBe(false);
    expect(legal(s.board, s.beams, "triangle", { col: 0, row: 1 })).toBe(false);
    s = debug.pointerMove(s, ...at(s, { col: 1, row: 0 }));
    expect(legal(s.board, s.beams, "triangle", { col: 0, row: 0 })).toBe(false);
    expect(legal(s.board, s.beams, "triangle", { col: 3, row: 0 })).toBe(false);
    const board = parseBoard(["TTt"]);
    expect(
      legal(
        board,
        [
          {
            channel: "triangle",
            cells: [
              { col: 0, row: 0 },
              { col: 1, row: 0 },
            ],
          },
        ],
        "triangle",
        { col: 2, row: 0 },
      ),
    ).toBe(false);
  });
  it("forbids shared segments and crossing diagonals across any channels", () => {
    const board = parseBoard(["T1S", "1t1", "T1S"]);
    const beams = [
      {
        channel: "triangle" as const,
        cells: [
          { col: 0, row: 0 },
          { col: 1, row: 1 },
        ],
      },
      {
        channel: "square" as const,
        cells: [
          { col: 2, row: 0 },
          { col: 1, row: 0 },
        ],
      },
    ];
    expect(legal(board, beams, "square", { col: 0, row: 1 })).toBe(false);
    const repeated = [
      {
        channel: "triangle" as const,
        cells: [
          { col: 0, row: 0 },
          { col: 1, row: 0 },
          { col: 1, row: 1 },
          { col: 0, row: 1 },
        ],
      },
    ];
    expect(legal(board, repeated, "triangle", { col: 0, row: 0 })).toBe(false);
  });
  it("spends charges on entry, restores them on retraction, and never overfills", () => {
    let s = debug.loadBoard(initial(), ["T1T", "t.t"]);
    s = debug.pointerDown(s, ...at(s, { col: 0, row: 0 }));
    s = debug.pointerMove(s, ...at(s, { col: 1, row: 0 }));
    expect(spent(s.beams, { col: 1, row: 0 })).toBe(1);
    expect(solved(s)).toBe(false);
    s = debug.pointerMove(s, ...at(s, { col: 0, row: 0 }));
    expect(spent(s.beams, { col: 1, row: 0 })).toBe(0);
    s = debug.pointerMove(s, ...at(s, { col: 1, row: 0 }));
    s = debug.pointerMove(s, ...at(s, { col: 2, row: 1 }));
    expect(legal(s.board, s.beams, "triangle", { col: 1, row: 0 })).toBe(false);
  });
  it("permits incomplete endpoint connections without treating missing coverage as a limit", () => {
    let s = debug.loadBoard(initial(), ["TT", "tt"]);
    s = trace(s, [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    expect(s.beams[0].cells).toHaveLength(2);
    expect(complete(s.board, s.beams[0])).toBe(false);
    expect(s.screen).toBe("playing");
  });
  it("counts repeated crystal visits and keeps the last occurrence when shortened", () => {
    let s = debug.loadBoard(initial(), ["T2t", "ttT"]);
    s = trace(s, [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 2, row: 0 },
      { col: 2, row: 1 },
    ]);
    // Pose an unsolved loop with two crystal entries to exercise unambiguous shortening.
    s = {
      ...s,
      screen: "playing",
      beams: [
        {
          channel: "triangle",
          cells: [
            { col: 0, row: 0 },
            { col: 1, row: 0 },
            { col: 2, row: 0 },
            { col: 2, row: 1 },
            { col: 1, row: 0 },
            { col: 0, row: 1 },
          ],
        },
      ],
    };
    expect(
      debug.snapshot(s).board.nodes.find((n) => n.kind === "crystal")?.spent,
    ).toBe(2);
    s = debug.pointerDown(s, ...at(s, { col: 1, row: 0 }));
    expect(s.beams[0].cells).toHaveLength(5);
  });
});
describe("progress and debug poses", () => {
  it("solves immediately, ends tracing, unlocks once, and starts the next board empty", () => {
    let s = debug.loadBoard(initial(), ["TtT"]);
    const before = s;
    s = trace(
      s,
      [
        { col: 0, row: 0 },
        { col: 1, row: 0 },
        { col: 2, row: 0 },
      ],
      "touch",
    );
    expect(s.screen).toBe("solved");
    expect(s.tracing).toBeNull();
    expect(s.solvedBoards).toEqual([0]);
    expect(s.unlockedCount).toBe(2);
    expect(before.beams[0].cells).toEqual([]);
    expect(debug.pointerMove(s, ...at(s, { col: 1, row: 0 })).beams).toEqual(
      s.beams,
    );
    s = action(s, "confirm");
    expect(s.boardIndex).toBe(1);
    expect(s.beams.every((b) => !b.cells.length)).toBe(true);
  });
  it("finishes the campaign, offers replay on board 24, and preserves solved progress", () => {
    let s = debug.loadBoard(
      {
        ...initial(),
        boardIndex: 23,
        solvedBoards: Array.from({ length: 23 }, (_, i) => i),
        unlockedCount: 24,
      },
      ["TT"],
    );
    s = trace(s, [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    expect(s.screen).toBe("complete");
    expect(action(s, "confirm").screen).toBe("select");
    expect(action({ ...s, menuIndex: 1 }, "confirm").screen).toBe("title");
    s = debug.setScreen(s, "solved");
    s = action({ ...s, menuIndex: 0 }, "confirm");
    expect(s.boardIndex).toBe(23);
    expect(s.beams.every((b) => !b.cells.length)).toBe(true);
  });
  it("advances Cascade tiers exactly and restarts independently of campaign", () => {
    let s = debug.loadBoard(
      {
        ...initial(),
        mode: "cascade",
        solvedCount: 4,
        solvedBoards: [0, 1],
        unlockedCount: 3,
      },
      ["TT"],
    );
    s = trace(s, [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    expect(s.solvedCount).toBe(5);
    expect(s.tier).toBe(2);
    s = action(s, "confirm");
    expect(s.tier).toBe(2);
    s = action({ ...s, screen: "solved", menuIndex: 1 }, "confirm");
    expect(s.tier).toBe(1);
    expect(s.solvedCount).toBe(0);
    expect(s.solvedBoards).toEqual([0, 1]);
  });
  it("makes poses exact, reconcile pure, reset complete, and invalid boards loud", () => {
    let s = debug.setScreen(initial(), "complete");
    s = debug.setMode(s, "cascade");
    s = debug.setMenuIndex(s, 99);
    s = debug.setTier(s, 5);
    s = debug.setSolvedCount(s, 19);
    expect(debug.reconcile(s)).toEqual(s);
    expect(s.menuIndex).toBe(99);
    expect(s.tier).toBe(5);
    const reset = debug.reset({ ...s, muted: true });
    expect(reset).toEqual(initial(true));
    expect(() => debug.loadBoard(s, ["?"])).toThrow();
    expect(() => parseBoard(["TT", "T"])).toThrow();
    expect(() => parseBoard(["........"])).toThrow();
    expect(() => generate(0)).toThrow();
  });
  it("clear works on any posed screen without changing its board or progress", () => {
    const s = {
      ...debug.loadBoard(initial(), ["TT"]),
      screen: "complete" as const,
      beams: [
        {
          channel: "triangle" as const,
          cells: [
            { col: 0, row: 0 },
            { col: 1, row: 0 },
          ],
        },
      ],
    };
    const next = debug.clear(s);
    expect(next.screen).toBe("complete");
    expect(next.board).toEqual(s.board);
    expect(next.beams[0].cells).toEqual([]);
  });
});
describe("board construction and difficulty", () => {
  it("ships all 24 exact campaign boards and each admits a solution", () => {
    expect(CAMPAIGN).toHaveLength(C.CAMPAIGN_LENGTH);
    for (const rows of CAMPAIGN) {
      const analysis = analyze(parseBoard(rows), 2500000);
      expect(analysis?.solutions).toBeGreaterThan(0);
    }
  }, 120000);
  it("validates Cascade difficulty and dimensions at every tier and independent grid size", () => {
    for (const [key, boards] of Object.entries(CASCADE_BOARDS)) {
      const t = C.TIERS[Number(key[0]) - 1],
        board = parseBoard(boards[0]);
      const a = analyze(board, 2000000)!;
      expect(a).not.toBeNull();
      expect(a.routes.every((r) => r >= t.minRoutes)).toBe(true);
      expect(a.solutions).toBeGreaterThanOrEqual(t.minSolutions);
      expect(a.solutions).toBeLessThanOrEqual(t.maxSolutions);
      expect(a.determinedShare).toBeLessThanOrEqual(t.maxDeterminedShare);
      expect(a.branching).toBeGreaterThanOrEqual(t.minBranching);
      expect(a.shared).toBeGreaterThanOrEqual(t.minSharedCrystals);
      const crystals = board.nodes.filter((n) => n.kind === "crystal");
      expect(crystals.length).toBeGreaterThanOrEqual(t.minCrystals);
      expect(crystals.length).toBeLessThanOrEqual(t.maxCrystals);
      expect(
        crystals.every(
          (n) => n.charges! >= t.minCharges && n.charges! <= t.maxCharges,
        ),
      ).toBe(true);
      expect(board.cols * board.rows - board.nodes.length).toBeLessThanOrEqual(
        t.maxEmptyCells,
      );
      let s = debug.loadBoard({ ...initial(), mode: "cascade" }, boards[0]);
      for (const beam of a.example) s = trace(s, beam.cells);
      expect(s.screen).toBe("solved");
    }
  }, 120000);
  it("certifies every emitted orientation against its tier floor", () => {
    for (const [key, boards] of Object.entries(CASCADE_BOARDS)) {
      const t = C.TIERS[Number(key[0]) - 1];
      for (const rows of boards) {
        const a = analyze(parseBoard(rows), 2000000)!;
        expect(a, rows.join("/")).not.toBeNull();
        expect(a.routes.every((r) => r >= t.minRoutes)).toBe(true);
        expect(a.solutions).toBeGreaterThanOrEqual(t.minSolutions);
        expect(a.solutions).toBeLessThanOrEqual(t.maxSolutions);
        expect(a.determinedShare).toBeLessThanOrEqual(t.maxDeterminedShare);
        expect(a.branching).toBeGreaterThanOrEqual(t.minBranching);
        expect(a.shared).toBeGreaterThanOrEqual(t.minSharedCrystals);
      }
    }
  }, 120000);
  it("generates diverse certified boards and debug generation leaves progression alone", () => {
    for (const t of C.TIERS) {
      const seen = new Set();
      for (let i = 0; i < 20; i++) {
        const rows = generate(t.tier);
        const board = parseBoard(rows);
        seen.add(rows.join("/"));
        expect(board.cols).toBeGreaterThanOrEqual(t.minCols);
        expect(board.rows).toBeLessThanOrEqual(t.maxRows);
        expect(
          CASCADE_BOARDS[`${t.tier}-${board.cols}-${board.rows}`].some(
            (b) => b.join("/") === rows.join("/"),
          ),
        ).toBe(true);
      }
      expect(seen.size).toBeGreaterThan(1);
    }
    const s = debug.generateBoard(
      { ...initial(), tier: 4, solvedCount: 15 },
      2,
    );
    expect(s.tier).toBe(4);
    expect(s.solvedCount).toBe(15);
    expect(s.screen).toBe("playing");
  });
});
