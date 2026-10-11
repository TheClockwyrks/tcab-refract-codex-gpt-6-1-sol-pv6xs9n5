import type { DeepReadonly } from "ts-essentials";
import type { RefractState, Channel } from "./game";
import { menu, targets } from "./game";
import * as C from "./constants";
import { cellX, cellY, complete, spent } from "./rules";
export const COLORS: Record<Channel, string> = {
  triangle: "#7af1ca",
  square: "#ffb477",
  diamond: "#ad9cff",
};
type Context = CanvasRenderingContext2D;
function text(
  ctx: Context,
  value: string,
  x: number,
  y: number,
  size = 16,
  color = "#9dafbc",
  font = "monospace",
  align: CanvasTextAlign = "left",
) {
  ctx.font = `${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(value, x, y);
}
function line(
  ctx: Context,
  x: number,
  y: number,
  xx: number,
  yy: number,
  color: string,
  width = 1,
) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(xx, yy);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}
function form(ctx: Context, channel: Channel, x: number, y: number, r: number) {
  ctx.beginPath();
  if (channel === "triangle") {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.866, y + r / 2);
    ctx.lineTo(x - r * 0.866, y + r / 2);
  }
  if (channel === "square")
    ctx.rect(x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4);
  if (channel === "diamond") {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
  }
  ctx.closePath();
}
function button(
  ctx: Context,
  label: string,
  x: number,
  y: number,
  w: number,
  h: number,
  active: boolean,
  index?: number,
) {
  ctx.fillStyle = active ? "#172f36" : "#0d1923";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = active ? "#7af1ca" : "#233542";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (active) {
    ctx.fillStyle = "#7af1ca";
    ctx.fillRect(x, y, 3, h);
  }
  if (index !== undefined)
    text(
      ctx,
      String(index + 1).padStart(2, "0"),
      x + 20,
      y + h / 2 + 5,
      12,
      active ? "#7af1ca" : "#637582",
    );
  text(
    ctx,
    label,
    x + (index !== undefined ? 58 : 22),
    y + h / 2 + 6,
    17,
    active ? "#edfdf8" : "#b2c2cd",
  );
  text(
    ctx,
    active ? "↗" : "→",
    x + w - 26,
    y + h / 2 + 6,
    20,
    active ? "#7af1ca" : "#536571",
    "sans-serif",
    "center",
  );
}
function bench(ctx: Context) {
  const g = ctx.createRadialGradient(
    C.STAGE_CX,
    C.STAGE_CY,
    30,
    C.STAGE_CX,
    C.STAGE_CY,
    780,
  );
  g.addColorStop(0, "#112330");
  g.addColorStop(1, "#080f17");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  ctx.fillStyle = "#22323d";
  for (let x = 32; x < C.STAGE_W; x += 32)
    for (let y = 24; y < C.STAGE_H; y += 32) ctx.fillRect(x, y, 1, 1);
  line(ctx, 40, 106, 1240, 106, "#26343f");
  line(ctx, 40, 620, 1240, 620, "#26343f");
  text(ctx, "R /", 54, 67, 26, "#7af1ca");
  text(ctx, "REFRACT", 118, 65, 15, "#d5e4ea");
  text(ctx, "OPTICAL PUZZLES", 236, 65, 11, "#617989");
  text(
    ctx,
    "LIGHT LAB  /  EST. 01",
    1228,
    64,
    11,
    "#72899a",
    "monospace",
    "right",
  );
}
function board(ctx: Context, s: DeepReadonly<RefractState>) {
  const b = s.board;
  const left = cellX(0, b.cols) - C.CELL_PITCH / 2,
    top = cellY(0, b.rows) - C.CELL_PITCH / 2;
  ctx.fillStyle = "#09141ec9";
  ctx.fillRect(left, top, b.cols * C.CELL_PITCH, b.rows * C.CELL_PITCH);
  for (let y = 0; y < b.rows; y++)
    for (let x = 0; x < b.cols; x++) {
      const px = cellX(x, b.cols),
        py = cellY(y, b.rows);
      ctx.strokeStyle = "#1a2b37";
      ctx.lineWidth = 1;
      ctx.strokeRect(
        px - C.CELL_PITCH / 2,
        py - C.CELL_PITCH / 2,
        C.CELL_PITCH,
        C.CELL_PITCH,
      );
      ctx.fillStyle = "#3a4b58";
      ctx.fillRect(px - 1, py - 1, 2, 2);
    }
  for (const beam of s.beams) {
    const color = COLORS[beam.channel];
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 1; i < beam.cells.length; i++) {
      const a = beam.cells[i - 1],
        b = beam.cells[i];
      const x = cellX(a.col, s.board.cols),
        y = cellY(a.row, s.board.rows),
        xx = cellX(b.col, s.board.cols),
        yy = cellY(b.row, s.board.rows);
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      line(ctx, x, y, xx, yy, color + "35", 12);
      line(ctx, x, y, xx, yy, color, 4);
      ctx.shadowBlur = 0;
      line(ctx, x, y, xx, yy, "#ffffffb0", 1);
    }
  }
  for (const n of b.nodes) {
    const x = cellX(n.col, b.cols),
      y = cellY(n.row, b.rows);
    ctx.fillStyle = "#09141e";
    ctx.beginPath();
    ctx.arc(x, y, C.NODE_R, 0, Math.PI * 2);
    ctx.fill();
    if (n.kind === "crystal") {
      const count = spent(s.beams, n);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const xx = x + Math.cos(a) * 27,
          yy = y + Math.sin(a) * 27;
        if (i === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      }
      ctx.closePath();
      ctx.fillStyle = count === n.charges ? "#c9e5f22b" : "#182936";
      ctx.fill();
      ctx.strokeStyle = "#d5e9f3";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      text(
        ctx,
        `${count}/${n.charges}`,
        x,
        y + 5,
        15,
        "#e8f5fc",
        "monospace",
        "center",
      );
      for (let i = 0; i < (n.charges ?? 0); i++) {
        ctx.fillStyle = i < count ? "#d8f8ff" : "#536571";
        ctx.fillRect(x - ((n.charges ?? 0) * 7 - 3) / 2 + i * 7, y + 13, 4, 3);
      }
    } else {
      const color = COLORS[n.channel!];
      form(ctx, n.channel!, x, y, 22);
      ctx.strokeStyle = color;
      ctx.lineWidth = n.kind === "emitter" ? 3 : 1;
      ctx.fillStyle = n.kind === "lens" ? color : "#0b1822";
      ctx.fill();
      ctx.stroke();
      if (n.kind === "emitter") {
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
    }
  }
  if (s.tracing) {
    const beam = s.beams.find((b) => b.channel === s.tracing!.channel)!;
    const end = beam.cells[beam.cells.length - 1];
    ctx.beginPath();
    ctx.arc(cellX(end.col, b.cols), cellY(end.row, b.rows), 36, 0, Math.PI * 2);
    ctx.strokeStyle = COLORS[beam.channel] + "99";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
function title(ctx: Context, s: DeepReadonly<RefractState>) {
  text(ctx, "01 — THE OPTICAL BENCH", 132, 171, 12, "#7af1ca");
  text(ctx, C.TITLE_TEXT, 126, 266, 88, "#e7f4f7", "sans-serif");
  text(ctx, C.TAGLINE_TEXT, 132, 308, 18, "#95b4c3");
  targets(s).forEach((t, i) =>
    button(ctx, C.TITLE_ITEMS[i], t.x, t.y, t.w, t.h, i === s.menuIndex, i),
  );
  const points = [
    [722, 220],
    [818, 316],
    [914, 220],
    [1010, 316],
    [914, 412],
    [818, 508],
    [1010, 508],
  ];
  const glow = ctx.createRadialGradient(874, 357, 0, 874, 357, 290);
  glow.addColorStop(0, "#65f7c71b");
  glow.addColorStop(1, "#65f7c700");
  ctx.fillStyle = glow;
  ctx.fillRect(610, 130, 540, 470);
  for (let x = 674; x <= 1106; x += 48)
    for (let y = 172; y <= 556; y += 48) {
      ctx.fillStyle = "#34535b";
      ctx.fillRect(x, y, 2, 2);
    }
  points.slice(1).forEach((p, i) => {
    ctx.shadowColor = "#7af1ca";
    ctx.shadowBlur = 18;
    line(ctx, points[i][0], points[i][1], p[0], p[1], "#7af1ca", 3);
    ctx.shadowBlur = 0;
  });
  points.forEach((p, i) => {
    ctx.fillStyle = "#0b1a23";
    form(ctx, "triangle", p[0], p[1], 23);
    ctx.strokeStyle = "#7af1ca";
    ctx.lineWidth = 2;
    ctx.fillStyle = i === 0 || i === points.length - 1 ? "#0b1a23" : "#7af1ca";
    ctx.fill();
    ctx.stroke();
  });
  text(
    ctx,
    "A THOUGHT, TRACED IN LIGHT.",
    898,
    580,
    11,
    "#7fa4aa",
    "monospace",
    "center",
  );
  text(
    ctx,
    "24 handcrafted boards. Infinite possibilities.",
    132,
    660,
    13,
    "#8098a8",
  );
  text(
    ctx,
    "DRAG TO TRACE  /  M TO MUTE",
    1228,
    660,
    11,
    "#718998",
    "monospace",
    "right",
  );
}
function howto(ctx: Context, s: DeepReadonly<RefractState>) {
  text(ctx, "HOW TO PLAY", 104, 180, 40, "#e7f4f7", "sans-serif");
  text(ctx, "One continuous thought. One beam per shape.", 104, 218, 17);
  const cards = [
    [
      "01",
      "DRAW A BEAM",
      "Press an outlined emitter. Drag through neighboring nodes.",
      "Release to keep your beam; grab either end to continue.",
      "Connect the two emitters and visit every filled lens.",
    ],
    [
      "02",
      "FOLLOW THE SHAPE",
      "Triangles, squares and diamonds each carry their own light.",
      "Move to any of eight neighbors, including diagonals.",
      "Stay on your channel. Never jump across an empty cell.",
    ],
    [
      "03",
      "SPEND THE CRYSTALS",
      "Any channel can cross a crystal. Spend every charge exactly.",
      "The counter shows spent / total. Enter, then leave.",
      "A crystal can be crossed again while a charge remains.",
    ],
    [
      "04",
      "MAKE ROOM FOR LIGHT",
      "Use each segment once. Beams cannot share a segment.",
      "The two diagonals of a four-cell square cannot cross.",
      "An illegal move simply stays put. Backtrack to undo.",
    ],
  ];
  cards.forEach((c, i) => {
    const x = 104 + (i % 2) * 554,
      y = 258 + Math.floor(i / 2) * 168;
    ctx.fillStyle = "#101f2a";
    ctx.fillRect(x, y, 528, 146);
    text(ctx, c[0], x + 18, y + 29, 13, "#7af1ca");
    text(ctx, c[1], x + 62, y + 30, 18, "#e4f3f7");
    c.slice(2).forEach((v, j) =>
      text(ctx, v, x + 18, y + 65 + j * 25, 13, "#a4bac7"),
    );
  });
  const t = targets(s)[0];
  button(ctx, C.BACK_LABEL, t.x, t.y, t.w, t.h, false);
  text(
    ctx,
    `DRAG: TRACE  /  ${C.BINDINGS.clear[0].replace("Key", "")}: CLEAR  /  ESC: BACK  /  M: SOUND`,
    298,
    681,
    13,
  );
}
function select(ctx: Context, s: DeepReadonly<RefractState>) {
  text(ctx, "THE CAMPAIGN", 300, 171, 38, "#e7f4f7", "sans-serif");
  text(ctx, "24 studies in light", 300, 201, 14);
  text(
    ctx,
    `${s.solvedBoards.length} / ${C.CAMPAIGN_LENGTH} SOLVED`,
    964,
    183,
    13,
    "#7af1ca",
    "monospace",
    "right",
  );
  C.SET_LABELS.forEach((label, i) =>
    text(ctx, label, 200, 263 + i * 92, 13, "#819aaa"),
  );
  targets(s)
    .filter((t) => t.id.startsWith("board-"))
    .forEach((t, i) => {
      const done = s.solvedBoards.includes(i),
        locked = i >= s.unlockedCount,
        active = i === s.selectIndex;
      ctx.fillStyle = active ? "#1b343c" : locked ? "#0b1721" : "#122631";
      ctx.fillRect(t.x, t.y, t.w, t.h);
      ctx.strokeStyle = active ? "#7af1ca" : locked ? "#1a2a35" : "#38535f";
      ctx.lineWidth = active ? 2 : 1;
      ctx.strokeRect(t.x, t.y, t.w, t.h);
      text(
        ctx,
        String(i + 1).padStart(2, "0"),
        t.x + 18,
        t.y + 33,
        23,
        locked ? "#657785" : "#e1f0f5",
      );
      text(
        ctx,
        done ? "✓ SOLVED" : locked ? "LOCKED" : "OPEN",
        t.x + 18,
        t.y + 57,
        10,
        done ? "#7af1ca" : locked ? "#657785" : "#a9c1ca",
      );
    });
  const t = targets(s).slice(-1)[0];
  button(ctx, C.BACK_LABEL, t.x, t.y, t.w, t.h, false);
  text(ctx, "Choose a study. Trace every lens. Open the next.", 300, 680, 13);
}
function playing(ctx: Context, s: DeepReadonly<RefractState>) {
  text(
    ctx,
    s.mode === "campaign"
      ? `CAMPAIGN / STUDY ${String(s.boardIndex + 1).padStart(2, "0")}`
      : "CASCADE / AN ENDLESS STUDY",
    54,
    143,
    13,
    "#d2e6ed",
  );
  if (s.mode === "cascade") {
    text(
      ctx,
      `${C.HUD_SOLVED_LABEL}  ${s.solvedCount}`,
      1040,
      176,
      16,
      "#edf8fc",
    );
    text(ctx, `${C.HUD_TIER_LABEL}    ${s.tier}`, 1040, 208, 16, "#edf8fc");
  } else
    text(
      ctx,
      `SET ${String.fromCharCode(65 + Math.floor(s.boardIndex / 6))}`,
      54,
      174,
      12,
      "#6e8b9b",
    );
  board(ctx, s);
  text(ctx, "CHANNELS", 1040, 287, 11, "#819aaa");
  s.beams.forEach((b, i) => {
    const y = 328 + i * 66;
    form(ctx, b.channel, 1056, y, 12);
    ctx.fillStyle = COLORS[b.channel];
    ctx.fill();
    text(
      ctx,
      complete(s.board, b) ? "COMPLETE" : "OPEN",
      1082,
      y + 5,
      13,
      COLORS[b.channel],
    );
  });
  text(ctx, "PRESS AN EMITTER", 54, 310, 11, "#97b2bf");
  text(ctx, "TRACE THE NODES", 54, 333, 11, "#97b2bf");
  text(ctx, "RELEASE TO KEEP", 54, 356, 11, "#97b2bf");
  const ts = targets(s);
  ts.forEach((t) =>
    button(
      ctx,
      t.id === "clear" ? C.CLEAR_LABEL : C.BACK_LABEL,
      t.x,
      t.y,
      t.w,
      t.h,
      false,
    ),
  );
  text(
    ctx,
    `${C.BINDINGS.clear[0].replace("Key", "")} / RESET`,
    1144,
    630,
    10,
    "#8ca7b7",
    "monospace",
    "center",
  );
  text(
    ctx,
    "DRAG TO CONNECT · BACKTRACK TO RETRACT",
    640,
    695,
    11,
    "#8ca7b7",
    "monospace",
    "center",
  );
}
export function draw(s: DeepReadonly<RefractState>, ctx: Context): void {
  ctx.save();
  bench(ctx);
  if (s.screen === "title") title(ctx, s);
  else if (s.screen === "howto") howto(ctx, s);
  else if (s.screen === "select") select(ctx, s);
  else if (s.screen === "playing") playing(ctx, s);
  else {
    board(ctx, s);
    ctx.fillStyle = "#080f17b8";
    ctx.fillRect(30, 180, 275, 410);
    text(
      ctx,
      s.screen === "complete" ? "COURSE COMPLETE" : C.SOLVED_TITLE_TEXT,
      38,
      228,
      22,
      "#7af1ca",
      "sans-serif",
    );
    text(
      ctx,
      s.screen === "complete"
        ? `ALL ${C.CAMPAIGN_LENGTH} STUDIES SOLVED`
        : s.mode === "campaign"
          ? `STUDY ${s.boardIndex + 1} / ${C.CAMPAIGN_LENGTH}`
          : `${C.HUD_SOLVED_LABEL} ${s.solvedCount}`,
      38,
      259,
      13,
      "#d3e6ed",
    );
    const items = menu(s);
    targets(s).forEach((t, i) =>
      button(ctx, items[i], t.x, t.y, t.w, t.h, i === s.menuIndex),
    );
    text(
      ctx,
      "A COMPLETE PICTURE OF LIGHT.",
      640,
      695,
      12,
      "#9db8c7",
      "monospace",
      "center",
    );
  }
  text(
    ctx,
    s.muted ? "SOUND OFF" : "SOUND ON",
    1228,
    705,
    9,
    "#678292",
    "monospace",
    "right",
  );
  ctx.restore();
}
