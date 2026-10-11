import type { Game } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";

export type Screen =
  "title" | "howto" | "select" | "playing" | "solved" | "complete";

export type Mode = "campaign" | "cascade";

export type Channel = "triangle" | "square" | "diamond";

export type NodeKind = "emitter" | "lens" | "crystal";

export interface Cell {
  readonly col: number;
  readonly row: number;
}

export interface NodeState {
  readonly col: number;
  readonly row: number;
  readonly kind: NodeKind;
  readonly channel: Channel | null;
  readonly charges: number | null;
}

export interface BoardState {
  readonly cols: number;
  readonly rows: number;
  readonly nodes: readonly NodeState[];
}

export interface BeamState {
  readonly channel: Channel;
  readonly cells: readonly Cell[];
}

export interface TraceState {
  readonly channel: Channel;
}

export type PointerDevice = "mouse" | "pen" | "touch";

export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
  readonly device: PointerDevice;
}

export interface RefractState {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;

  readonly board: BoardState;
  readonly beams: readonly BeamState[];
  readonly tracing: TraceState | null;

  readonly boardIndex: number;
  readonly solvedBoards: readonly number[];
  readonly unlockedCount: number;
  readonly selectIndex: number;

  readonly solvedCount: number;
  readonly tier: number;

  readonly pointer: PointerState;
  readonly armedTarget: string | null;
  readonly simTime: number;
  readonly muted: boolean;
}

import { CAMPAIGN } from "./campaign";
import {
  cellX,
  cellY,
  same,
  parseBoard,
  emptyBeams,
  spent,
  complete,
  solved,
  legal,
} from "./rules";
import { generate } from "./generator";
import { draw } from "./view";
export const BACKGROUND = "#080f17";
type S = DeepReadonly<RefractState>;
export interface Target {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export function initial(muted = false): RefractState {
  return {
    screen: "title",
    mode: "campaign",
    menuIndex: 0,
    board: { cols: 0, rows: 0, nodes: [] },
    beams: [],
    tracing: null,
    boardIndex: 0,
    solvedBoards: [],
    unlockedCount: 1,
    selectIndex: 0,
    solvedCount: 0,
    tier: 1,
    pointer: { x: 0, y: 0, down: false, device: "mouse" },
    armedTarget: null,
    simTime: 0,
    muted,
  };
}
export function menu(s: S): readonly string[] {
  if (s.screen === "title") return C.TITLE_ITEMS;
  if (s.screen === "complete") return ["BOARD SELECT", "MAIN MENU"];
  if (s.screen === "solved")
    return s.mode === "cascade"
      ? C.SOLVED_ITEMS
      : s.boardIndex < C.CAMPAIGN_LENGTH - 1
        ? ["NEXT BOARD", "REPLAY", "BOARD SELECT"]
        : ["REPLAY", "BOARD SELECT"];
  return [];
}
export function targets(s: S): Target[] {
  const control = (id: string, x: number): Target => ({
    id,
    x,
    y: 640,
    w: C.TARGET_MIN_W + 32,
    h: C.TARGET_MIN_H,
  });
  if (s.screen === "playing")
    return [control("clear", 1080), control("back", 72)];
  if (s.screen === "howto" || s.screen === "select") {
    const back = control("back", 72);
    return s.screen === "howto"
      ? [back]
      : [
          ...Array.from({ length: C.CAMPAIGN_LENGTH }, (_, i) => ({
            id: `board-${i + 1}`,
            x: 300 + (i % 6) * 112,
            y: 220 + Math.floor(i / 6) * 92,
            w: C.TARGET_MIN_W,
            h: C.TARGET_MIN_H,
          })),
          back,
        ];
  }
  return menu(s).map((_, i) => ({
    id: `menu-${i}`,
    x: s.screen === "title" ? 132 : 38,
    y: s.screen === "title" ? 350 + i * 84 : 280 + i * 84,
    w: s.screen === "title" ? 360 : 252,
    h: C.TARGET_MIN_H,
  }));
}
function screen(s: S, next: Screen, menuIndex = 0): RefractState {
  return { ...s, screen: next, menuIndex, armedTarget: null, tracing: null };
}
export function load(s: S, rows: readonly string[]): RefractState {
  const board = parseBoard(rows);
  return {
    ...s,
    screen: "playing",
    board,
    beams: emptyBeams(board),
    tracing: null,
    armedTarget: null,
  };
}
function enter(s: S, i: number): RefractState {
  return {
    ...load(s, CAMPAIGN[i]),
    boardIndex: i,
    selectIndex: i,
    menuIndex: 0,
  };
}
export function clear(s: S): RefractState {
  return {
    ...s,
    beams: s.beams.map((b) => ({ ...b, cells: [] })),
    tracing: null,
  };
}
export function action(s: S, a: string): RefractState {
  if (a === "clear") return s.screen === "playing" ? clear(s) : { ...s };
  if (a === "back") {
    if (s.screen === "title") return { ...s };
    if (s.screen === "howto") return screen(s, "title", 2);
    if (s.screen === "select") return screen(s, "title", 0);
    if (s.mode === "cascade") return screen(clear(s), "title", 1);
    return {
      ...screen(s.screen === "playing" ? clear(s) : s, "select"),
      selectIndex: s.boardIndex,
    };
  }
  if (s.screen === "select") {
    const col = s.selectIndex % 6,
      row = Math.floor(s.selectIndex / 6);
    if (a === "confirm")
      return s.selectIndex < s.unlockedCount
        ? enter(s, s.selectIndex)
        : { ...s };
    return {
      ...s,
      selectIndex:
        a === "left"
          ? row * 6 + ((col + 5) % 6)
          : a === "right"
            ? row * 6 + ((col + 1) % 6)
            : a === "up"
              ? ((row + 3) % 4) * 6 + col
              : a === "down"
                ? ((row + 1) % 4) * 6 + col
                : s.selectIndex,
    };
  }
  const items = menu(s);
  if (!items.length) return { ...s };
  if (a === "up" || a === "down")
    return {
      ...s,
      menuIndex:
        (s.menuIndex + (a === "up" ? items.length - 1 : 1)) % items.length,
    };
  if (a !== "confirm") return { ...s };
  if (s.screen === "title") {
    if (s.menuIndex === 0)
      return {
        ...screen(s, "select"),
        mode: "campaign",
        selectIndex: s.boardIndex,
      };
    if (s.menuIndex === 1)
      return {
        ...load(s, generate(1)),
        mode: "cascade",
        solvedCount: 0,
        tier: 1,
        menuIndex: 0,
      };
    return screen(s, "howto");
  }
  if (s.screen === "complete")
    return s.menuIndex === 0 ? screen(s, "select") : screen(s, "title", 0);
  if (s.mode === "cascade")
    return {
      ...load(s, generate(s.menuIndex === 1 ? 1 : s.tier)),
      solvedCount: s.menuIndex === 1 ? 0 : s.solvedCount,
      tier: s.menuIndex === 1 ? 1 : s.tier,
      menuIndex: 0,
    };
  if (s.boardIndex < C.CAMPAIGN_LENGTH - 1 && s.menuIndex === 0)
    return enter(s, s.boardIndex + 1);
  if (s.menuIndex === (s.boardIndex < C.CAMPAIGN_LENGTH - 1 ? 1 : 0))
    return enter(s, s.boardIndex);
  return screen(s, "select");
}
function check(s: S): RefractState {
  if (s.screen !== "playing" || !solved(s)) return { ...s };
  if (s.mode === "cascade") {
    const solvedCount = s.solvedCount + 1;
    return {
      ...screen(s, "solved"),
      solvedCount,
      tier: Math.min(Math.floor(solvedCount / C.TIER_ADVANCE) + 1, C.MAX_TIER),
    };
  }
  const solvedBoards = [...new Set([...s.solvedBoards, s.boardIndex])].sort(
    (a, b) => a - b,
  );
  return {
    ...screen(
      s,
      solvedBoards.length === C.CAMPAIGN_LENGTH ? "complete" : "solved",
    ),
    solvedBoards,
    unlockedCount: Math.max(
      s.unlockedCount,
      Math.min(s.boardIndex + 2, C.CAMPAIGN_LENGTH),
    ),
    selectIndex: s.boardIndex,
  };
}
function replace(s: S, channel: Channel, cells: readonly Cell[]): RefractState {
  return {
    ...s,
    beams: s.beams.map((b) => (b.channel === channel ? { ...b, cells } : b)),
  };
}
export function pointer(
  s: S,
  type: "down" | "move" | "up",
  x: number,
  y: number,
  device: PointerDevice = "mouse",
): RefractState {
  let next: RefractState = {
    ...s,
    pointer: {
      x,
      y,
      device,
      down: type === "down" ? true : type === "up" ? false : s.pointer.down,
    },
  };
  const target = targets(s).find(
    (t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h,
  );
  if (target && (type === "down" || !s.pointer.down)) {
    if (target.id.startsWith("menu-"))
      next = { ...next, menuIndex: Number(target.id.slice(5)) };
    if (target.id.startsWith("board-"))
      next = { ...next, selectIndex: Number(target.id.slice(6)) - 1 };
  }
  if (type === "up") {
    const armed = s.armedTarget;
    next = {
      ...next,
      armedTarget: null,
      tracing: null,
      beams: next.beams.map((b) =>
        b.cells.length === 1 ? { ...b, cells: [] } : b,
      ),
    };
    if (target?.id === armed)
      next = action(
        next,
        target.id === "back"
          ? "back"
          : target.id === "clear"
            ? "clear"
            : "confirm",
      );
    return next;
  }
  if (type === "down") next = { ...next, armedTarget: target?.id ?? null };
  if (target && type === "down") return next;
  if (s.screen !== "playing") return next;
  const node = s.board.nodes.find(
    (n) =>
      Math.hypot(
        x - cellX(n.col, s.board.cols),
        y - cellY(n.row, s.board.rows),
      ) <= C.NODE_HIT_R,
  );
  if (!node) return next;
  if (type === "down") {
    const fresh = s.beams.find(
      (b) =>
        node.kind === "emitter" &&
        b.channel === node.channel &&
        b.cells.length < 2,
    );
    const end = s.beams.find(
      (b) => same(b.cells[0], node) || same(b.cells[b.cells.length - 1], node),
    );
    const through = s.beams.filter((b) => b.cells.some((c) => same(c, node)));
    const beam =
      fresh ?? end ?? (through.length === 1 ? through[0] : undefined);
    if (!beam) return next;
    let cells = beam.cells;
    if (fresh) cells = [{ col: node.col, row: node.row }];
    else if (same(cells[0], node)) cells = [...cells].reverse();
    else {
      let index = cells.length - 1;
      while (index >= 0 && !same(cells[index], node)) index--;
      cells = cells.slice(0, index + 1);
    }
    return check({
      ...replace(next, beam.channel, cells),
      tracing: { channel: beam.channel },
    });
  }
  if (!s.tracing || !s.pointer.down) return next;
  const beam = s.beams.find((b) => b.channel === s.tracing!.channel)!;
  if (same(beam.cells[beam.cells.length - 2], node))
    return check(replace(next, beam.channel, beam.cells.slice(0, -1)));
  if (legal(s.board, s.beams, beam.channel, node))
    return check(
      replace(next, beam.channel, [
        ...beam.cells,
        { col: node.col, row: node.row },
      ]),
    );
  return next;
}
export function snapshot(s: S) {
  return {
    version: C.REFRACT_DEBUG_VERSION,
    screen: s.screen,
    mode: s.mode,
    menuIndex: s.menuIndex,
    boardIndex: s.boardIndex,
    solvedBoards: [...s.solvedBoards],
    unlockedCount: s.unlockedCount,
    selectIndex: s.selectIndex,
    solvedCount: s.solvedCount,
    tier: s.tier,
    board: {
      ...s.board,
      nodes: s.board.nodes.map((n) => ({
        ...n,
        x: cellX(n.col, s.board.cols),
        y: cellY(n.row, s.board.rows),
        spent: n.kind === "crystal" ? spent(s.beams, n) : null,
      })),
    },
    beams: Object.fromEntries(
      s.beams.map((b) => [
        b.channel,
        {
          cells: b.cells.map((c) => ({ ...c })),
          complete: complete(s.board, b),
        },
      ]),
    ),
    solved: solved(s),
    tracing: s.tracing
      ? {
          channel: s.tracing.channel,
          live: {
            ...s.beams
              .find((b) => b.channel === s.tracing!.channel)!
              .cells.slice(-1)[0],
          },
        }
      : null,
    pointer: { ...s.pointer },
    targets: targets(s),
    muted: s.muted,
    simTime: s.simTime,
  };
}
export interface RefractDebugApi {
  readonly version: number;
  reset(state: S): RefractState;
  snapshot(state: S): ReturnType<typeof snapshot>;
  reconcile(state: S): RefractState;
  setMode(state: S, mode: Mode): RefractState;
  setScreen(state: S, screen: Screen): RefractState;
  setMenuIndex(state: S, index: number): RefractState;
  setSolvedCount(state: S, count: number): RefractState;
  setTier(state: S, tier: number): RefractState;
  generateBoard(state: S, tier: number): RefractState;
  loadBoard(state: S, board: readonly string[]): RefractState;
  pointerDown(
    state: S,
    x: number,
    y: number,
    device?: PointerDevice,
  ): RefractState;
  pointerMove(
    state: S,
    x: number,
    y: number,
    device?: PointerDevice,
  ): RefractState;
  pointerUp(state: S, device?: PointerDevice): RefractState;
  clear(state: S): RefractState;
}
export const debug: RefractDebugApi = {
  version: C.REFRACT_DEBUG_VERSION,
  reset: (s) => initial(s.muted),
  snapshot,
  reconcile: (s) => ({ ...s }),
  setMode: (s, mode) => ({ ...s, mode }),
  setScreen: (s, screen) => ({ ...s, screen, armedTarget: null }),
  setMenuIndex: (s, menuIndex) => ({ ...s, menuIndex }),
  setSolvedCount: (s, solvedCount) => ({ ...s, solvedCount }),
  setTier: (s, tier) => ({ ...s, tier }),
  generateBoard: (s, tier) => load(s, generate(tier)),
  loadBoard: load,
  pointerDown: (s, x, y, d) => pointer(s, "down", x, y, d),
  pointerMove: (s, x, y, d) => pointer(s, "move", x, y, d),
  pointerUp: (s, d) => pointer(s, "up", s.pointer.x, s.pointer.y, d),
  clear,
};
export const game: Game<RefractState, RefractDebugApi> = {
  initialize(api) {
    for (const name of C.ACTIONS)
      api.input.register(name, { keys: [...C.BINDINGS[name]] });
    const frequencies = [520, 320, 780, 1040, 180];
    Object.values(C.CUES).forEach((cue, i) =>
      api.audio.define(cue, {
        wave: i === 4 ? "triangle" : "sine",
        freq: frequencies[i],
        freqTo: frequencies[i] * (i === 1 ? 0.7 : 1.4),
        durationMs: 80 + i * 35,
        gain: 0.12,
      }),
    );
    api.diagnostics.register("screen", (s) => s.screen);
    api.diagnostics.register("mode", (s) => s.mode);
    api.diagnostics.register("cols", (s) => s.board.cols);
    api.diagnostics.register("rows", (s) => s.board.rows);
    for (const channel of C.CHANNELS) {
      api.diagnostics.register(
        channel + " length",
        (s) => s.beams.find((b) => b.channel === channel)?.cells.length ?? 0,
      );
      api.diagnostics.register(channel + " complete", (s) => {
        const b = s.beams.find((b) => b.channel === channel);
        return b ? complete(s.board, b) : false;
      });
    }
    api.diagnostics.register(
      "crystals",
      (s) =>
        s.board.nodes
          .filter((n) => n.kind === "crystal")
          .map((n) => `${spent(s.beams, n)}/${n.charges}`)
          .join(" · ") || "none",
    );
    api.diagnostics.register("solved", solved);
    api.diagnostics.register(
      "pointer",
      (s) =>
        `${s.pointer.x.toFixed(0)},${s.pointer.y.toFixed(0)} ${s.pointer.device}`,
    );
    return [initial(), debug];
  },
  update(state, api, dt) {
    let s: RefractState = { ...state, simTime: state.simTime + dt };
    const cues = new Set<string>();
    const transition = (next: RefractState) => {
      // Navigation discards a board; only editing the live board raises beam cues.
      if (
        s.screen !== "playing" ||
        next.board !== s.board ||
        next.screen === "title" ||
        next.screen === "select"
      ) {
        s = next;
        return;
      }
      const before = s.beams.reduce(
          (n, b) => n + Math.max(0, b.cells.length - 1),
          0,
        ),
        after = next.beams.reduce(
          (n, b) => n + Math.max(0, b.cells.length - 1),
          0,
        );
      if (after > before) cues.add(C.CUES.connect);
      if (after < before) cues.add(C.CUES.retract);
      for (const b of next.beams) {
        const old = s.beams.find((a) => a.channel === b.channel);
        if (complete(next.board, b) && (!old || !complete(s.board, old)))
          cues.add(C.CUES.channelComplete);
      }
      if (
        s.screen === "playing" &&
        (next.screen === "solved" || next.screen === "complete")
      )
        cues.add(C.CUES.solved);
      s = next;
    };
    for (const a of C.ACTIONS)
      if (api.input.pressed(a)) {
        if (a === "mute") api.audio.setMuted(!api.audio.muted());
        else {
          const had = s.beams.some((b) => b.cells.length > 1);
          const next = action(s, a);
          if (a === "clear" && s.screen === "playing" && had) {
            cues.add(C.CUES.clear);
            s = next;
          } else transition(next);
        }
      }
    for (const sample of api.input.pointerSamples())
      if (
        sample.primary &&
        (sample.type === "move" || sample.button === "primary")
      ) {
        const isClear =
          sample.type === "up" &&
          s.armedTarget === "clear" &&
          targets(s).some(
            (t) =>
              t.id === "clear" &&
              sample.x >= t.x &&
              sample.x <= t.x + t.w &&
              sample.y >= t.y &&
              sample.y <= t.y + t.h,
          );
        const next = pointer(s, sample.type, sample.x, sample.y, sample.device);
        if (isClear && s.beams.some((b) => b.cells.length > 1)) {
          cues.add(C.CUES.clear);
          s = next;
        } else transition(next);
      }
    const p = api.input.pointer();
    s = {
      ...s,
      pointer: { x: p.x, y: p.y, down: p.down, device: p.device },
      muted: api.audio.muted(),
    };
    transition(check(s));
    for (const cue of cues) api.audio.play(cue);
    return s;
  },
  render(s, api) {
    draw(s, api.ctx);
  },
};
