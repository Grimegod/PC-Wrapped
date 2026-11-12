import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { absurdConversion } from "../shared/conversions";
import { STORY_CARD, SQUARE_CARD, type CardFormat } from "../shared/constants";
import { chooseArchetype } from "../shared/archetypes";
import { recapStats } from "../shared/aggregation";
import type { Archetype, DayAggregate, RecapStats } from "../shared/model";

const ink = "#fff2e4";
const muted = "#d9c1b2";
const gold = "#f4c58c";
const peach = "#efad94";
const mint = "#b7dfc4";

export interface CardViewData {
  stats: RecapStats;
  archetype?: Archetype;
}

/** Build the only app-specific data allowed to reach card rendering. Hidden IDs and labels are omitted. */
export function buildCardData(day: DayAggregate, hiddenAppIds: ReadonlySet<string> = new Set()): CardViewData {
  const stats = recapStats(day);
  const topApp = Object.entries(day.apps).sort((a, b) => b[1].activeMs - a[1].activeMs)[0];
  if (topApp && hiddenAppIds.has(topApp[0])) stats.topAppLabel = "Hidden app";
  return { stats, archetype: stats.totalActiveMs > 0 ? chooseArchetype(stats) : undefined };
}

export function renderCard(day: DayAggregate, format: CardFormat, period: "day" | "week", hiddenAppIds: ReadonlySet<string> = new Set()): Buffer {
  const size = format === "story" ? STORY_CARD : SQUARE_CARD;
  const canvas = createCanvas(size.width, size.height);
  const ctx = canvas.getContext("2d");
  const { stats, archetype } = buildCardData(day, hiddenAppIds);
  const compact = format === "square";

  const gradient = ctx.createLinearGradient(0, 0, size.width, size.height);
  gradient.addColorStop(0, "#493331");
  gradient.addColorStop(0.54, "#382a2d");
  gradient.addColorStop(1, "#2f3a34");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.fillStyle = "rgba(35,26,27,.72)";
  roundRect(ctx, 64, 64, size.width - 128, size.height - 128, 44);
  ctx.fill();

  ctx.fillStyle = gold;
  ctx.font = "700 34px Arial";
  ctx.fillText("PC WRAPPED", 112, compact ? 160 : 170);
  ctx.fillStyle = muted;
  ctx.font = "500 24px Arial";
  ctx.fillText(`${period === "day" ? "TODAY" : "THIS WEEK"} · YOUR DESKTOP, RECAP`, 112, compact ? 208 : 220);

  ctx.fillStyle = ink;
  ctx.font = `700 ${compact ? 65 : 74}px Arial`;
  ctx.fillText(formatDuration(stats.totalActiveMs), 112, compact ? 340 : 390);
  ctx.fillStyle = muted;
  ctx.font = "500 28px Arial";
  ctx.fillText("in app time, with the breaks between chapters left out", 112, compact ? 390 : 446);

  ctx.fillStyle = "#493635";
  roundRect(ctx, 112, compact ? 420 : 540, size.width - 224, compact ? 190 : 260, 28);
  ctx.fill();
  ctx.fillStyle = mint;
  ctx.font = "700 27px Arial";
  ctx.fillText("YOUR DESKTOP CHARACTER", 148, compact ? 468 : 600);
  ctx.fillStyle = ink;
  ctx.font = `700 ${compact ? 38 : 46}px Arial`;
  if (archetype) {
    ctx.fillStyle = ink;
    ctx.fillText(`${archetype.emoji}  ${archetype.name}`, 148, compact ? 522 : 668);
    ctx.fillStyle = muted;
    ctx.font = "500 25px Arial";
    wrapText(ctx, archetype.line, 148, compact ? 562 : 720, size.width - 300, 34);
  } else {
    ctx.fillStyle = ink;
    ctx.font = "600 29px Arial";
    ctx.fillText("Your character appears after some tracking.", 148, compact ? 535 : 670);
  }

  if (compact) {
    compactMetric(ctx, 112, 620, "Longest stretch", formatDuration(stats.longestStreakMs));
    compactMetric(ctx, 568, 620, "App changes", stats.appChanges.toLocaleString());
    compactMetric(ctx, 112, 740, "Top app", `${Math.round(stats.topAppShare * 100)}% · ${stats.topAppLabel}`);
    compactMetric(ctx, 568, 740, "Detour comparison", absurdConversion(stats.totalActiveMs / 60_000));
    if (stats.completedInterruptions) {
      ctx.fillStyle = muted;
      ctx.font = "500 20px Arial";
      ctx.fillText(`↩ Average steady return: ${formatDuration(stats.averageReturnMs)}`, 112, 880);
    }
  } else {
    const y0 = 890;
    metric(ctx, 112, y0, "Longest single-app stretch", formatDuration(stats.longestStreakMs));
    metric(ctx, 112, y0 + 155, "App changes", stats.appChanges.toLocaleString());
    metric(ctx, 112, y0 + 310, "Top app", `${stats.topAppLabel} · ${Math.round(stats.topAppShare * 100)}%`);
    metric(ctx, 112, y0 + 465, "A very scientific comparison", absurdConversion(stats.totalActiveMs / 60_000));
    if (stats.completedInterruptions) {
      metric(ctx, 112, y0 + 620, "Return after a long app visit", `avg ${formatDuration(stats.averageReturnMs)}`);
    }
  }
  ctx.fillStyle = peach;
  ctx.beginPath();
  ctx.arc(size.width - 150, 120, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = muted;
  ctx.font = "500 20px Arial";
  ctx.fillText("Local recap · no titles or screenshots", 112, size.height - 118);
  ctx.fillStyle = gold;
  ctx.font = "700 22px Arial";
  ctx.fillText("A little desktop folklore.", 112, size.height - 82);
  return canvas.toBuffer("image/png");
}

function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

function metric(ctx: SKRSContext2D, x: number, y: number, label: string, value: string): void {
  ctx.fillStyle = muted;
  ctx.font = "500 25px Arial";
  ctx.fillText(label, x, y);
  ctx.fillStyle = ink;
  ctx.font = "700 39px Arial";
  ctx.fillText(value.length > 35 ? `${value.slice(0, 32)}…` : value, x, y + 52);
}

function compactMetric(ctx: SKRSContext2D, x: number, y: number, label: string, value: string): void {
  ctx.fillStyle = "#493733";
  roundRect(ctx, x, y, 420, 105, 20);
  ctx.fill();
  ctx.fillStyle = muted;
  ctx.font = "500 20px Arial";
  ctx.fillText(label, x + 18, y + 32);
  ctx.fillStyle = ink;
  ctx.font = "700 27px Arial";
  ctx.fillText(value.length > 23 ? `${value.slice(0, 20)}…` : value, x + 18, y + 72);
}

function roundRect(ctx: SKRSContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function wrapText(ctx: SKRSContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number): void {
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      line = word;
    } else line = next;
  }
  if (line) ctx.fillText(line, x, y);
}
