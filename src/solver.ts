/** Exact graph search used to certify Cascade motifs. This does not advance game state. */
import type { BoardState, BeamState } from "./game";
import { CHANNELS } from "./constants";
export interface Analysis {
  routes: number[];
  solutions: number;
  determinedShare: number;
  branching: number;
  shared: number;
  example: readonly BeamState[];
}
interface Edge {
  to: number;
  bit: bigint;
  cross: bigint;
}
interface Route {
  path: number[];
  mask: bigint;
  forbidden: bigint;
  visits: number[];
}
export function analyze(board: BoardState, limit = 1000000): Analysis | null {
  const nodes = board.nodes;
  const graph: Edge[][] = nodes.map(() => []);
  const links: { a: number; b: number; bit: bigint }[] = [];
  for (let a = 0; a < nodes.length; a++)
    for (let b = a + 1; b < nodes.length; b++) {
      if (
        Math.abs(nodes[a].col - nodes[b].col) <= 1 &&
        Math.abs(nodes[a].row - nodes[b].row) <= 1
      )
        links.push({ a, b, bit: 1n << BigInt(links.length) });
    }
  for (const e of links) {
    const a = nodes[e.a],
      b = nodes[e.b];
    let cross = 0n;
    if (a.col !== b.col && a.row !== b.row)
      for (const f of links) {
        const c = nodes[f.a],
          d = nodes[f.b];
        if (
          f !== e &&
          c.col !== d.col &&
          c.row !== d.row &&
          a.col + b.col === c.col + d.col &&
          a.row + b.row === c.row + d.row
        )
          cross |= f.bit;
      }
    graph[e.a].push({ to: e.b, bit: e.bit, cross });
    graph[e.b].push({ to: e.a, bit: e.bit, cross });
  }
  graph.forEach((edges) => edges.sort((a, b) => a.to - b.to));
  const channels = CHANNELS.filter((c) => nodes.some((n) => n.channel === c));
  const crystals = nodes
    .map((n, i) => (n.kind === "crystal" ? i : -1))
    .filter((i) => i >= 0);
  const routes: Route[][] = [];
  let work = 0;
  for (const channel of channels) {
    const emitters = nodes
      .map((n, i) => (n.kind === "emitter" && n.channel === channel ? i : -1))
      .filter((i) => i >= 0);
    if (emitters.length !== 2) return null;
    const lensCount = nodes.filter(
      (n) => n.kind === "lens" && n.channel === channel,
    ).length;
    const visits = nodes.map(() => 0);
    visits[emitters[0]] = 1;
    const found = new Map<bigint, Route>();
    const walk = (
      path: number[],
      mask: bigint,
      forbidden: bigint,
      left: number,
    ) => {
      if (++work > limit) throw new Error("Search limit");
      const end = path[path.length - 1];
      if (end === emitters[1]) {
        if (left === 0 && !found.has(mask))
          found.set(mask, {
            path: [...path],
            mask,
            forbidden,
            visits: [...visits],
          });
        return;
      }
      for (const e of graph[end]) {
        const node = nodes[e.to];
        if (
          (node.channel !== null && node.channel !== channel) ||
          visits[e.to] >= (node.kind === "crystal" ? node.charges! : 1) ||
          (e.bit & (mask | forbidden)) !== 0n
        )
          continue;
        visits[e.to]++;
        path.push(e.to);
        walk(
          path,
          mask | e.bit,
          forbidden | e.cross,
          left - (node.kind === "lens" ? 1 : 0),
        );
        path.pop();
        visits[e.to]--;
      }
    };
    try {
      walk([emitters[0]], 0n, 0n, lensCount);
    } catch {
      return null;
    }
    routes.push([...found.values()]);
  }
  let count = 0,
    branchSum = 0,
    lengthSum = 0,
    shared = 0;
  let common: bigint[] | null = null;
  let example: BeamState[] = [];
  const visits = nodes.map(() => 0);
  function combine(
    index: number,
    mask: bigint,
    forbidden: bigint,
    chosen: Route[],
    branching: number,
    length: number,
  ) {
    if (++work > limit) throw new Error("Search limit");
    if (index === channels.length) {
      if (crystals.some((i) => visits[i] !== nodes[i].charges)) return;
      count++;
      branchSum += branching;
      lengthSum += length;
      common =
        common === null
          ? chosen.map((r) => r.mask)
          : common.map((m, i) => m & chosen[i].mask);
      shared = Math.max(
        shared,
        crystals.filter(
          (i) => chosen.filter((r) => r.visits[i] > 0).length >= 2,
        ).length,
      );
      example = chosen.map((r, i) => ({
        channel: channels[i],
        cells: r.path.map((j) => ({ col: nodes[j].col, row: nodes[j].row })),
      }));
      return;
    }
    for (const route of routes[index]) {
      if (
        (route.mask & (mask | forbidden)) !== 0n ||
        (route.forbidden & mask) !== 0n ||
        crystals.some((i) => visits[i] + route.visits[i] > nodes[i].charges!)
      )
        continue;
      let options = 0,
        currentMask = mask,
        currentForbidden = forbidden;
      const currentVisits = [...visits];
      currentVisits[route.path[0]]++;
      for (let i = 1; i < route.path.length; i++) {
        const last = route.path[i - 1],
          next = route.path[i];
        options += graph[last].filter((e) => {
          const n = nodes[e.to];
          return (
            (n.channel === null || n.channel === channels[index]) &&
            currentVisits[e.to] < (n.kind === "crystal" ? n.charges! : 1) &&
            (e.bit & (currentMask | currentForbidden)) === 0n
          );
        }).length;
        const edge = graph[last].find((e) => e.to === next)!;
        currentMask |= edge.bit;
        currentForbidden |= edge.cross;
        currentVisits[next]++;
      }
      crystals.forEach((i) => (visits[i] += route.visits[i]));
      combine(
        index + 1,
        mask | route.mask,
        forbidden | route.forbidden,
        [...chosen, route],
        branching + options,
        length + route.path.length - 1,
      );
      crystals.forEach((i) => (visits[i] -= route.visits[i]));
    }
  }
  try {
    combine(0, 0n, 0n, [], 0, 0);
  } catch {
    return null;
  }
  const popcount = (mask: bigint) => mask.toString(2).replace(/0/g, "").length;
  return {
    routes: routes.map((r) => r.length),
    solutions: count,
    determinedShare: count
      ? ((common as bigint[] | null)?.reduce((n, m) => n + popcount(m), 0) ??
          0) /
        (lengthSum / count)
      : 1,
    branching: branchSum / lengthSum,
    shared,
    example,
  };
}
