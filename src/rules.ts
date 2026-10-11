import * as C from "./constants";
import type {
  BoardState,
  Cell,
  BeamState,
  Channel,
  RefractState,
} from "./game";
import type { DeepReadonly } from "ts-essentials";
export const cellX = (col: number, cols: number) =>
  C.BOARD_CX - ((cols - 1) * C.CELL_PITCH) / 2 + col * C.CELL_PITCH;
export const cellY = (row: number, rows: number) =>
  C.BOARD_CY - ((rows - 1) * C.CELL_PITCH) / 2 + row * C.CELL_PITCH;
export const same = (a: Cell | undefined, b: Cell | undefined) =>
  !!a && !!b && a.col === b.col && a.row === b.row;
export function parseBoard(rows: readonly string[]): BoardState {
  if (
    !rows.length ||
    !rows[0].length ||
    rows.length > C.GRID_MAX_ROWS ||
    rows[0].length > C.GRID_MAX_COLS ||
    rows.some((r) => r.length !== rows[0].length)
  )
    throw new Error("Invalid board dimensions");
  const nodes: BoardState["nodes"][number][] = [];
  rows.forEach((line, row) =>
    [...line].forEach((v, col) => {
      if (v === ".") return;
      const index = "TSD".indexOf(v.toUpperCase());
      if (index >= 0)
        nodes.push({
          col,
          row,
          kind: v === v.toUpperCase() ? "emitter" : "lens",
          channel: C.CHANNELS[index],
          charges: null,
        });
      else if (/^[123]$/.test(v))
        nodes.push({
          col,
          row,
          kind: "crystal",
          channel: null,
          charges: Number(v),
        });
      else throw new Error("Unknown board character: " + v);
    }),
  );
  return { cols: rows[0].length, rows: rows.length, nodes };
}
export function emptyBeams(board: BoardState): BeamState[] {
  return C.CHANNELS.filter((channel) =>
    board.nodes.some((n) => n.channel === channel),
  ).map((channel) => ({ channel, cells: [] }));
}
export function spent(beams: readonly BeamState[], cell: Cell): number {
  return beams.reduce(
    (sum, b) => sum + b.cells.filter((c) => same(c, cell)).length,
    0,
  );
}
export function complete(board: BoardState, beam: BeamState): boolean {
  const nodes = board.nodes.filter((n) => n.channel === beam.channel);
  const emitters = nodes.filter((n) => n.kind === "emitter");
  return (
    beam.cells.length > 1 &&
    emitters.length === 2 &&
    emitters.every(
      (e) =>
        same(beam.cells[0], e) || same(beam.cells[beam.cells.length - 1], e),
    ) &&
    nodes
      .filter((n) => n.kind === "lens")
      .every(
        (n) =>
          beam.cells.filter((c) => same(c, n)).length === 1 &&
          !same(beam.cells[0], n) &&
          !same(beam.cells[beam.cells.length - 1], n),
      )
  );
}
export function solved(s: Pick<RefractState, "board" | "beams">): boolean {
  return (
    s.beams.length > 0 &&
    s.beams.every((b) => complete(s.board, b)) &&
    s.board.nodes
      .filter((n) => n.kind === "crystal")
      .every(
        (n) =>
          spent(s.beams, n) === n.charges &&
          s.beams.every(
            (b) =>
              !same(b.cells[0], n) && !same(b.cells[b.cells.length - 1], n),
          ),
      )
  );
}
export function legal(
  board: BoardState,
  beams: readonly BeamState[],
  channel: Channel,
  dest: Cell,
): boolean {
  const beam = beams.find((b) => b.channel === channel)!;
  const from = beam.cells[beam.cells.length - 1];
  const node = board.nodes.find((n) => same(n, dest));
  if (
    !from ||
    !node ||
    same(from, dest) ||
    Math.abs(from.col - dest.col) > 1 ||
    Math.abs(from.row - dest.row) > 1 ||
    (node.channel !== null && node.channel !== channel)
  )
    return false;
  const at = board.nodes.find((n) => same(n, from))!;
  if (at.kind === "emitter" && beam.cells.length > 1) return false;
  if (
    node.kind === "crystal"
      ? spent(beams, dest) >= (node.charges ?? 0)
      : beam.cells.some((c) => same(c, dest))
  )
    return false;
  for (const b of beams)
    for (let i = 1; i < b.cells.length; i++) {
      const a = b.cells[i - 1],
        z = b.cells[i];
      if ((same(a, from) && same(z, dest)) || (same(z, from) && same(a, dest)))
        return false;
      if (
        from.col !== dest.col &&
        from.row !== dest.row &&
        a.col !== z.col &&
        a.row !== z.row &&
        a.col + z.col === from.col + dest.col &&
        a.row + z.row === from.row + dest.row
      )
        return false;
    }
  return true;
}
export type ReadState = DeepReadonly<RefractState>;
