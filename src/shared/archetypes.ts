import type { Archetype, RecapStats } from "./model";

export const ARCHETYPES: Archetype[] = [
  { id: "tab-acrobat", name: "The Tab Acrobat", emoji: "🤸", line: "Your apps got a curtain call. Several times." },
  { id: "deep-diver", name: "The Deep Diver", emoji: "🤿", line: "One app, one long scenic route." },
  { id: "home-base", name: "The Home Base Hero", emoji: "🏡", line: "One familiar app kept the kettle warm." },
  { id: "kaleidoscope", name: "The Kaleidoscope", emoji: "🌈", line: "A delightful parade of open apps." },
  { id: "cruise-control", name: "The Cruise Control", emoji: "🛳️", line: "A calm voyage with very few port calls." },
  { id: "time-tourist", name: "The Time Tourist", emoji: "🧳", line: "Every app was a little side quest." }
];

export function chooseArchetype(stats: RecapStats): Archetype {
  const hours = Math.max(stats.totalActiveMs / 3_600_000, 0.25);
  const switchesPerHour = stats.appChanges / hours;
  if (stats.totalActiveMs > 0 && switchesPerHour >= 15) return ARCHETYPES[0];
  if (stats.longestStreakMs >= 45 * 60_000) return ARCHETYPES[1];
  if (stats.topAppShare >= 0.55 && stats.uniqueApps >= 1) return ARCHETYPES[2];
  if (stats.uniqueApps >= 8) return ARCHETYPES[3];
  if (stats.totalActiveMs >= 90 * 60_000 && switchesPerHour <= 3) return ARCHETYPES[4];
  return ARCHETYPES[5];
}
