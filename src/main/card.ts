import { createCanvas, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";
import path from "node:path";
import { absurdConversion } from "../shared/conversions";
import type { PeriodComparison } from "../shared/comparison";
import { STORY_CARD, SQUARE_CARD, type CardFormat, type RecapPeriod } from "../shared/constants";

/** Card headline for each range. */
const PERIOD_HEADING: Record<RecapPeriod, string> = { day: "TODAY", week: "THIS WEEK", month: "THIS MONTH", year: "THIS YEAR" };
import { chooseArchetype } from "../shared/archetypes";
import { recapStats } from "../shared/aggregation";
import type { Archetype, DayAggregate, RecapStats } from "../shared/model";

/** Card palette: bright, saturated and high contrast, so a card reads like a celebration, not a notice. */
const ink = "#1b1233";
const inkSoft = "#4a3a6b";
const cream = "#fffaf2";
const sun = "#ffd23f";
const coral = "#ff5f6d";
const tangerine = "#ff8a3d";
const mint = "#00e5a0";
const sky = "#4fc3f7";
const grape = "#8e7bff";
const pink = "#ff6fb5";

/** Card text face, with a colour emoji fallback so archetype emoji are not drawn as empty boxes. */
const CARD_FONT = `"Segoe UI", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", Arial, sans-serif`;
/** Emoji-only face: Arial cannot draw emoji, so every emoji run is drawn with this face instead. */
const EMOJI_FONT = `"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Segoe UI Symbol", sans-serif`;

export interface CardViewData {
  stats: RecapStats;
  archetype?: Archetype;
  comparison?: PeriodComparison;
}

let emojiFontsRegistered = false;

/**
 * Make the platform colour-emoji face known to the canvas.
 *
 * Registration is best effort and never loads a remote font: the faces are the ones already
 * installed on this machine. When none is found, emoji fall back to the card font.
 */
export function registerCardFonts(): void {
  if (emojiFontsRegistered) return;
  emojiFontsRegistered = true;
  const roots =
    process.platform === "win32"
      ? [process.env.WINDIR ? path.join(process.env.WINDIR, "Fonts") : "C:/Windows/Fonts"]
      : ["/System/Library/Fonts", "/Library/Fonts", "/usr/share/fonts", "/usr/local/share/fonts"];
  const faces = ["seguiemj.ttf", "Apple Color Emoji.ttc", "NotoColorEmoji.ttf", "NotoEmoji-Regular.ttf"];
  for (const root of roots) {
    for (const face of faces) {
      try {
        GlobalFonts.registerFromPath(path.join(root, face));
      } catch {
        /* The face is optional. */
      }
    }
  }
}

/** Split text into emoji runs and everything else so each run can use a face that can draw it. */
export function splitEmojiRuns(text: string): Array<{ text: string; emoji: boolean }> {
  const runs: Array<{ text: string; emoji: boolean }> = [];
  for (const character of text) {
    const emoji = /\p{Extended_Pictographic}|\p{Emoji_Presentation}|\uFE0F|\u20E3/u.test(character);
    const last = runs[runs.length - 1];
    if (last && last.emoji === emoji) last.text += character;
    else runs.push({ text: character, emoji });
  }
  return runs;
}

/** Measure a string across both card faces, so layout maths matches what is drawn. */
export function measureCardText(ctx: SKRSContext2D, text: string, size: number, weight = 500): number {
  let width = 0;
  for (const run of splitEmojiRuns(text)) {
    ctx.font = cardFont(run.emoji, size, weight);
    width += ctx.measureText(run.text).width;
  }
  return width;
}

/** Draw text with a colour-emoji fallback and return the drawn width. */
export function drawCardText(ctx: SKRSContext2D, text: string, x: number, y: number, size: number, weight = 500): number {
  let cursor = x;
  for (const run of splitEmojiRuns(text)) {
    ctx.font = cardFont(run.emoji, size, weight);
    ctx.fillText(run.text, cursor, y);
    cursor += ctx.measureText(run.text).width;
  }
  return cursor - x;
}

/** Shorten text with an ellipsis until it fits maxWidth, never cutting a surrogate pair or emoji sequence. */
export function fitCardText(ctx: SKRSContext2D, text: string, maxWidth: number, size: number, weight = 500): string {
  if (measureCardText(ctx, text, size, weight) <= maxWidth) return text;
  const characters = [...text];
  while (characters.length > 1) {
    characters.pop();
    const candidate = `${characters.join("").trimEnd()}…`;
    if (measureCardText(ctx, candidate, size, weight) <= maxWidth) return candidate;
  }
  return "…";
}

function cardFont(emoji: boolean, size: number, weight: number): string {
  return `${weight} ${size}px ${emoji ? EMOJI_FONT : CARD_FONT}`;
}

/** Build the only app-specific data allowed to reach card rendering. Hidden IDs and labels are omitted. */
export function buildCardData(day: DayAggregate, hiddenAppIds: ReadonlySet<string> = new Set()): CardViewData {
  const stats = recapStats(day);
  const topApp = Object.entries(day.apps).sort((a, b) => b[1].activeMs - a[1].activeMs)[0];
  if (topApp && hiddenAppIds.has(topApp[0])) stats.topAppLabel = "Hidden app";
  return { stats, archetype: stats.totalActiveMs > 0 ? chooseArchetype(stats) : undefined };
}

/** The three apps with the most active time, as label and share only; hidden apps lose their name. */
export function topAppRows(day: DayAggregate, hiddenAppIds: ReadonlySet<string>, count: number): Array<{ label: string; share: number }> {
  const total = Object.values(day.apps).reduce((sum, app) => sum + app.activeMs, 0);
  if (!total) return [];
  return Object.entries(day.apps)
    .filter(([, app]) => app.activeMs > 0)
    .sort((a, b) => b[1].activeMs - a[1].activeMs)
    .slice(0, count)
    .map(([id, app]) => ({ label: hiddenAppIds.has(id) ? "Hidden app" : app.label, share: app.activeMs / total }));
}

/** Card formats a recap can be rendered at, shared by the renderer, the IPC layer and the tests. */
export const CARD_FORMATS: readonly CardFormat[] = ["story", "square"];

/** Whether a value is a card format this app can render. */
export function isCardFormat(value: unknown): value is CardFormat {
  return typeof value === "string" && (CARD_FORMATS as readonly string[]).includes(value);
}

export function renderCard(
  day: DayAggregate,
  format: CardFormat,
  period: RecapPeriod,
  hiddenAppIds: ReadonlySet<string> = new Set(),
  comparisonParam?: PeriodComparison
): Buffer {
  registerCardFonts();
  const size = format === "story" ? STORY_CARD : SQUARE_CARD;
  const canvas = createCanvas(size.width, size.height);
  const ctx = canvas.getContext("2d");
  const { stats, archetype, comparison: dataComparison } = buildCardData(day, hiddenAppIds);
  const comparison = comparisonParam ?? dataComparison;
  const compact = format === "square";
  const margin = 64;
  const left = 112;
  const innerWidth = size.width - 224;

  const gradient = ctx.createLinearGradient(0, 0, size.width, size.height);
  gradient.addColorStop(0, sun);
  gradient.addColorStop(0.42, tangerine);
  gradient.addColorStop(0.72, pink);
  gradient.addColorStop(1, grape);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size.width, size.height);
  if (stats.totalActiveMs <= 0) {
    drawEmptyCard(ctx, size.width, size.height, left, innerWidth, compact, period);
    return canvas.toBuffer("image/png");
  }
  confetti(ctx, size.width, size.height);
  ctx.fillStyle = cream;
  roundRect(ctx, margin, margin, size.width - margin * 2, size.height - margin * 2, 44);
  ctx.fill();
  ctx.fillStyle = coral;
  roundRect(ctx, left, compact ? 168 : 188, 168, 10, 5);
  ctx.fill();

  ctx.fillStyle = mint;
  ctx.beginPath();
  ctx.arc(size.width - 150, 122, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = sky;
  ctx.beginPath();
  ctx.arc(size.width - 198, 158, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = pink;
  ctx.beginPath();
  ctx.arc(size.width - 108, 168, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = ink;
  drawCardText(ctx, "PC WRAPPED", left, compact ? 150 : 170, 34, 700);
  ctx.fillStyle = inkSoft;
  drawCardText(ctx, `${PERIOD_HEADING[period]} · YOUR DESKTOP, RECAP`, left, compact ? 200 : 226, 24);

  const headline = ctx.createLinearGradient(left, 0, left + 520, 0);
  headline.addColorStop(0, coral);
  headline.addColorStop(0.55, tangerine);
  headline.addColorStop(1, grape);
  ctx.fillStyle = headline;
  drawCardText(ctx, formatDuration(stats.totalActiveMs), left, compact ? 312 : 396, compact ? 68 : 78, 700);
  ctx.fillStyle = inkSoft;
  drawCardText(ctx, "in app time, with the breaks between chapters left out", left, compact ? 356 : 452, compact ? 26 : 28);

  if (compact) {
    // The square card has room for two metric rows, a labelled cast strip and the footer only:
    // anything else would collide with them.
    const boxY = 392;
    characterBox(ctx, left, boxY, innerWidth, 172, archetype, true);
    const tileWidth = 420;
    const gap = 36;
    compactMetric(ctx, left, 588, tileWidth, "Longest stretch", formatDuration(stats.longestStreakMs), 0);
    compactMetric(ctx, left + tileWidth + gap, 588, tileWidth, "App changes", stats.appChanges.toLocaleString(), 1);
    compactMetric(ctx, left, 700, tileWidth, "Top app", `${Math.round(stats.topAppShare * 100)}% · ${stats.topAppLabel}`, 2);
    compactMetric(ctx, left + tileWidth + gap, 700, tileWidth, "Detour comparison", absurdConversion(stats.totalActiveMs / 60_000), 3);
    const squareCast = topAppRows(day, hiddenAppIds, 3);
    if (squareCast.length) {
      ctx.fillStyle = ink;
      drawCardText(ctx, "THE CAST", left, 828, 22, 700);
      squareCast.forEach((app, index) => {
        castBar(ctx, left, 852 + index * 40, innerWidth, app.label, app.share, 10, index);
      });
    }
  } else {
    characterBox(ctx, left, 500, innerWidth, 260, archetype, false);
    const rows: Array<[string, string]> = [
      ["Longest single-app stretch", formatDuration(stats.longestStreakMs)],
      ["App changes", stats.appChanges.toLocaleString()]
    ];
    const versus = comparisonLine(comparison);
    if (versus) rows.push(["Versus the period before", versus]);
    rows.push(["Top app", `${stats.topAppLabel} · ${Math.round(stats.topAppShare * 100)}%`]);
    rows.push(["A very scientific comparison", absurdConversion(stats.totalActiveMs / 60_000)]);
    if (stats.completedInterruptions) rows.push(["Return after a long app visit", `avg ${formatDuration(stats.averageReturnMs)}`]);
    const y0 = 830;
    const step = rows.length > 4 ? 132 : 148;
    rows.forEach(([label, value], index) => metric(ctx, left, y0 + index * step, innerWidth, label, value, index));
    const cast = topAppRows(day, hiddenAppIds, 5);
    if (cast.length) {
      const castTop = y0 + rows.length * step + 6;
      const slot = Math.min(74, Math.floor((size.height - 150 - castTop - 30) / cast.length));
      ctx.fillStyle = ink;
      drawCardText(ctx, "THE CAST", left, castTop, 24, 700);
      cast.forEach((app, index) =>
        castBar(ctx, left, castTop + 42 + index * slot, innerWidth, app.label, app.share, Math.min(12, slot - 28), index)
      );
    }
  }

  const bottom = size.height - (compact ? 78 : 82);
  ctx.fillStyle = inkSoft;
  drawCardText(ctx, "Local recap · no titles or screenshots", left, bottom - (compact ? 30 : 36), 20);
  ctx.fillStyle = coral;
  drawCardText(ctx, "A little desktop folklore.", left, bottom, 22, 700);
  return canvas.toBuffer("image/png");
}

function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

function metric(ctx: SKRSContext2D, x: number, y: number, maxWidth: number, label: string, value: string, index = 0): void {
  const [tint, accent] = TILE_TINTS[index % TILE_TINTS.length];
  ctx.fillStyle = tint;
  roundRect(ctx, x, y, maxWidth, 100, 24);
  ctx.fill();
  ctx.fillStyle = accent;
  roundRect(ctx, x, y + 18, 8, 64, 4);
  ctx.fill();
  ctx.fillStyle = inkSoft;
  drawCardText(ctx, label, x + 30, y + 34, 25);
  ctx.fillStyle = ink;
  drawCardText(ctx, fitCardText(ctx, value, maxWidth - 60, 39, 700), x + 30, y + 80, 39, 700);
}

/** Story-card version of THE CAST: one horizontal band of top apps, each in its own colour. */
const BAR_COLORS = [coral, sky, mint, grape, tangerine];
function castBar(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  label: string,
  share: number,
  barHeight: number,
  index = 0
): void {
  const barWidth = width - 150;
  ctx.fillStyle = inkSoft;
  drawCardText(ctx, fitCardText(ctx, label, barWidth - 24, 22), x, y + 15, 22);
  ctx.fillStyle = ink;
  const percent = `${Math.round(share * 100)}%`;
  drawCardText(ctx, percent, x + width - measureCardText(ctx, percent, 22, 700), y + 15, 22, 700);
  ctx.fillStyle = "#efe6f7";
  roundRect(ctx, x, y + 24, barWidth, barHeight, barHeight / 2);
  ctx.fill();
  const fill = ctx.createLinearGradient(x, 0, x + barWidth, 0);
  fill.addColorStop(0, BAR_COLORS[index % BAR_COLORS.length]);
  fill.addColorStop(1, sun);
  ctx.fillStyle = fill;
  roundRect(ctx, x, y + 24, Math.max(barHeight, barWidth * share), barHeight, barHeight / 2);
  ctx.fill();
}

/** Draw the desktop-character panel, sized so its contents never spill into the metrics below. */
function characterBox(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  archetype: Archetype | undefined,
  compact: boolean
): void {
  const panel = ctx.createLinearGradient(x, y, x + width, y + height);
  panel.addColorStop(0, "#ede8ff");
  panel.addColorStop(0.5, "#ffe6f4");
  panel.addColorStop(1, "#fff3d6");
  ctx.fillStyle = panel;
  roundRect(ctx, x, y, width, height, 28);
  ctx.fill();
  ctx.fillStyle = grape;
  roundRect(ctx, x, y, 12, height, 6);
  ctx.fill();
  const innerX = x + 36;
  const innerWidth = width - 72;
  ctx.fillStyle = grape;
  drawCardText(ctx, "YOUR DESKTOP CHARACTER", innerX + 8, y + 48, 27, 700);
  if (!archetype) {
    ctx.fillStyle = ink;
    drawCardText(ctx, "Your character appears after some tracking.", innerX + 8, y + (compact ? 110 : 132), 29, 600);
    return;
  }
  ctx.fillStyle = ink;
  const name = fitCardText(ctx, `${archetype.emoji}  ${archetype.name}`, innerWidth - 8, compact ? 38 : 46, 700);
  drawCardText(ctx, name, innerX + 8, y + (compact ? 102 : 128), compact ? 38 : 46, 700);
  ctx.fillStyle = inkSoft;
  wrapText(ctx, archetype.line, innerX + 8, y + (compact ? 142 : 180), innerWidth - 8, 34, 25);
}

/** Metric tiles, each in its own bright tint so the grid reads as a colour wheel, not a spreadsheet. */
const TILE_TINTS: Array<[string, string]> = [
  ["#e4f8ff", sky],
  ["#e6fff2", mint],
  ["#fff0f6", pink],
  ["#efeaff", grape],
  ["#fff6dd", sun],
  ["#ffeae3", coral]
];

function compactMetric(ctx: SKRSContext2D, x: number, y: number, width: number, label: string, value: string, index = 0): void {
  const [tint, accent] = TILE_TINTS[index % TILE_TINTS.length];
  ctx.fillStyle = tint;
  roundRect(ctx, x, y, width, 105, 20);
  ctx.fill();
  ctx.fillStyle = accent;
  roundRect(ctx, x, y + 18, 8, 69, 4);
  ctx.fill();
  ctx.fillStyle = inkSoft;
  drawCardText(ctx, label, x + 26, y + 32, 20);
  ctx.fillStyle = ink;
  drawCardText(ctx, fitCardText(ctx, value, width - 46, 27, 700), x + 26, y + 72, 27, 700);
}

/** Soft confetti behind the card: deterministic, so the same recap always draws the same card. */
function confetti(ctx: SKRSContext2D, width: number, height: number): void {
  const colours = [cream, sun, mint, sky, pink, coral, grape];
  let seed = 20251113;
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  ctx.save();
  ctx.globalAlpha = 0.75;
  for (let index = 0; index < 46; index++) {
    const x = next() * width;
    const y = next() * height;
    const radius = 5 + next() * 9;
    ctx.fillStyle = colours[index % colours.length];
    ctx.beginPath();
    if (index % 3 === 0) {
      ctx.arc(x, y, radius, 0, Math.PI * 2);
    } else {
      ctx.roundRect(x, y, radius * 1.9, radius * 0.9, radius * 0.3);
    }
    ctx.fill();
  }
  ctx.restore();
}

function roundRect(ctx: SKRSContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function wrapText(ctx: SKRSContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, size: number): void {
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (measureCardText(ctx, next, size) > maxWidth && line) {
      drawCardText(ctx, line, x, y, size);
      y += lineHeight;
      line = word;
    } else line = next;
  }
  if (line) drawCardText(ctx, line, x, y, size);
}

/** A deliberately quiet card for a day or week with no tracked time; it never shows zeroed metrics. */
function drawEmptyCard(
  ctx: SKRSContext2D,
  width: number,
  height: number,
  left: number,
  innerWidth: number,
  compact: boolean,
  period: RecapPeriod
): void {
  const margin = 64;
  ctx.fillStyle = cream;
  roundRect(ctx, margin, margin, width - margin * 2, height - margin * 2, 44);
  ctx.fill();
  ctx.fillStyle = coral;
  roundRect(ctx, left, compact ? 168 : 188, 168, 10, 5);
  ctx.fill();
  ctx.fillStyle = ink;
  drawCardText(ctx, "PC WRAPPED", left, compact ? 150 : 170, 34, 700);
  ctx.fillStyle = inkSoft;
  drawCardText(ctx, `${PERIOD_HEADING[period]} · YOUR DESKTOP, RECAP`, left, compact ? 200 : 226, 24);

  const panel = ctx.createLinearGradient(left, 0, left + innerWidth, 0);
  panel.addColorStop(0, "#ede8ff");
  panel.addColorStop(0.55, "#ffe6f4");
  panel.addColorStop(1, "#fff3d6");
  ctx.fillStyle = panel;
  roundRect(ctx, left, compact ? 300 : 360, innerWidth, compact ? 240 : 280, 28);
  ctx.fill();
  ctx.fillStyle = grape;
  roundRect(ctx, left, compact ? 300 : 360, 12, compact ? 240 : 280, 6);
  ctx.fill();
  ctx.fillStyle = ink;
  drawCardText(ctx, "Nothing tracked yet", left + 44, compact ? 384 : 444, compact ? 40 : 46, 700);
  ctx.fillStyle = inkSoft;
  wrapText(
    ctx,
    "Start tracking to find out where the hours wander. Your character, your numbers and your cast appear here once there is something to report.",
    left + 44,
    compact ? 432 : 500,
    innerWidth - 84,
    34,
    25
  );
}

/** "+3.7% versus the previous period", or nothing when there is no previous period to compare with. */
export function comparisonLine(comparison?: PeriodComparison): string | null {
  if (!comparison || comparison.isFirst) return null;
  const pct = Math.round(comparison.ratioChange * 100);
  if (pct === 0) return "about the same as the period before";
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct)}% versus the period before`;
}
