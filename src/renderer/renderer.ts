import type { AppBridge, AppState, DayAggregate, RecapStats, ShareTarget } from "../shared/model.js";
import type { RecapPeriod } from "../shared/constants.js";
import { absurdConversion } from "../shared/conversions.js";
import { pngDataUrlToBlob } from "./card-preview.js";

declare global {
  interface Window {
    pcWrapped: AppBridge;
  }
}

let period: RecapPeriod = "day";
let latestState: AppState | undefined;
let previewObjectUrl: string | undefined;
let savedCardPath: string | null = null;
let previewedSignature = "";
const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing UI element: ${id}`);
  return element as T;
};

function isRecapPeriod(value: string | undefined): value is RecapPeriod {
  return value === "day" || value === "week" || value === "month" || value === "year";
}

function duration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

function currentData(state: AppState): { day: DayAggregate; stats: RecapStats; archetype: AppState["todayArchetype"] } {
  switch (period) {
    case "day":
      return { day: state.today, stats: state.todayStats, archetype: state.todayArchetype };
    case "week":
      return { day: state.week, stats: state.weekStats, archetype: state.weekArchetype };
    case "month":
      return { day: state.month, stats: state.monthStats, archetype: state.monthArchetype };
    case "year":
      return { day: state.year, stats: state.yearStats, archetype: state.yearArchetype };
  }
}

function render(state: AppState): void {
  latestState = state;
  const selected = currentData(state);
  const { stats, day } = selected;
  const hasCardData = stats.totalActiveMs > 0;
  byId("status-dot").classList.toggle("on", state.tracking);
  byId("status-text").textContent = state.tracking ? "Tracking is on" : "Tracking is paused";
  byId<HTMLButtonElement>("tracking-button").textContent = state.tracking ? "Pause tracking" : "Start tracking";
  byId("active-time").textContent = duration(stats.totalActiveMs);
  byId("longest-streak").textContent = duration(stats.longestStreakMs);
  byId("app-changes").textContent = stats.appChanges.toLocaleString();
  const archetypeEmoji = byId<HTMLDivElement>("archetype-emoji");
  const archetypeLine = byId<HTMLParagraphElement>("archetype-line");
  archetypeEmoji.textContent = hasCardData ? selected.archetype.emoji : "";
  archetypeEmoji.hidden = !hasCardData;
  byId("archetype-name").textContent = hasCardData ? selected.archetype.name : "Your character appears after some tracking.";
  archetypeLine.textContent = hasCardData ? selected.archetype.line : "";
  archetypeLine.hidden = !hasCardData;
  byId("conversion").textContent = absurdConversion(stats.totalActiveMs / 60_000);
  byId("app-count").textContent = `${stats.uniqueApps} ${stats.uniqueApps === 1 ? "app" : "apps"}`;
  byId("return-summary").textContent = stats.completedInterruptions
    ? `${stats.completedInterruptions} confirmed return${stats.completedInterruptions === 1 ? "" : "s"} · avg ${duration(stats.averageReturnMs)} of active detour time`
    : "No confirmed long-visit returns yet.";
  const warning = byId<HTMLDivElement>("warning");
  warning.textContent = state.warning;
  warning.hidden = !state.warning;
  byId<HTMLInputElement>("startup-toggle").checked = state.startAtLogin;
  byId<HTMLButtonElement>("preview-button").disabled = !hasCardData;
  byId<HTMLButtonElement>("save-button").disabled = !hasCardData;
  byId<HTMLParagraphElement>("card-empty-message").hidden = hasCardData;
  if (!hasCardData) clearCardPreview();
  renderApps(day);
  renderPreferenceLists(state);
}

function renderApps(day: DayAggregate): void {
  const host = byId<HTMLDivElement>("apps-list");
  const apps = Object.entries(day.apps)
    .filter(([, value]) => value.activeMs > 0)
    .sort((a, b) => b[1].activeMs - a[1].activeMs);
  host.replaceChildren();
  if (!apps.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML =
      "<span>☁️</span><p>No app time yet.</p><small>Start tracking when you're ready. Tracking is off until you choose.</small>";
    host.append(empty);
    return;
  }
  const max = apps[0][1].activeMs;
  for (const [executableId, app] of apps.slice(0, 7)) {
    const row = document.createElement("div");
    row.className = "app-row";
    const name = document.createElement("div");
    name.className = "app-name";
    name.textContent = app.label;
    const bar = document.createElement("div");
    bar.className = "app-bar";
    const fill = document.createElement("progress");
    fill.max = 100;
    fill.value = Math.max(3, (app.activeMs / max) * 100);
    fill.setAttribute("aria-label", `${app.label} share of active app time`);
    bar.append(fill);
    const time = document.createElement("div");
    time.className = "app-time";
    time.textContent = duration(app.activeMs);
    const actions = document.createElement("div");
    actions.className = "app-actions";
    actions.append(
      makeActionButton(
        Object.hasOwn(latestState?.excludedApps ?? {}, executableId) ? "Include again" : "Exclude future tracking",
        async () => {
          const excluded = !Object.hasOwn(latestState?.excludedApps ?? {}, executableId);
          const next = await window.pcWrapped.setExcludedApp(executableId, app.label, excluded);
          latestState = next;
          render(next);
          showNotice(
            excluded
              ? `${app.label} is excluded from future tracking. Existing history is unchanged.`
              : `${app.label} will be tracked again.`
          );
        }
      ),
      makeActionButton(Object.hasOwn(latestState?.hiddenApps ?? {}, executableId) ? "Show on cards" : "Hide on cards", async () => {
        const hidden = !Object.hasOwn(latestState?.hiddenApps ?? {}, executableId);
        const next = await window.pcWrapped.setHiddenOnCard(executableId, app.label, hidden);
        latestState = next;
        render(next);
        showNotice(hidden ? `${app.label} remains in totals and is hidden on cards.` : `${app.label} will appear on cards again.`);
      })
    );
    row.append(name, bar, time, actions);
    host.append(row);
  }
}

function renderPreferenceLists(state: AppState): void {
  const excludedHost = byId<HTMLDivElement>("excluded-apps-list");
  excludedHost.replaceChildren();
  const excludedEntries = Object.entries(state.excludedApps);
  if (!excludedEntries.length)
    excludedHost.append(makeEmptyPreference("No apps are excluded. Use “Exclude future tracking” on an app in Apps on stage to add one."));
  for (const [id, label] of excludedEntries) {
    const row = preferenceRow(id, label);
    row.append(
      makeActionButton("Re-include", async () => {
        const next = await window.pcWrapped.setExcludedApp(id, label, false);
        render(next);
        showNotice(`${label} will be tracked again. Existing history was not changed.`);
      }),
      makeActionButton(
        "Also remove past data",
        async () => {
          const result = await window.pcWrapped.removeAppPastData(id);
          if (result.confirmed) {
            const next = await window.pcWrapped.getState();
            render(next);
            showNotice(`Removed ${duration(result.removedActiveMs)} from ${result.removedDays} saved day(s).`);
          } else showNotice("No past data was removed.");
        },
        true
      )
    );
    excludedHost.append(row);
  }
  // Hidden app settings are managed independently from tracking exclusions.
  const hiddenHost = byId<HTMLDivElement>("hidden-apps-list");
  hiddenHost.replaceChildren();
  const hiddenEntries = Object.entries(state.hiddenApps);
  if (!hiddenEntries.length)
    hiddenHost.append(makeEmptyPreference("No apps are hidden. Use “Hide on cards” on an app in Apps on stage to add one."));
  for (const [id, label] of hiddenEntries) {
    const row = preferenceRow(id, label);
    row.append(
      makeActionButton("Show on cards", async () => {
        const next = await window.pcWrapped.setHiddenOnCard(id, label, false);
        render(next);
        showNotice(`${label} will appear on cards again.`);
      })
    );
    hiddenHost.append(row);
  }
}

function preferenceRow(id: string, label: string): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "preference-item";
  const text = document.createElement("div");
  text.className = "preference-label";
  const name = document.createElement("strong");
  name.textContent = label;
  const identifier = document.createElement("small");
  identifier.textContent = id;
  text.append(name, identifier);
  row.append(text);
  return row;
}

function makeEmptyPreference(text: string): HTMLParagraphElement {
  const empty = document.createElement("p");
  empty.className = "preference-empty";
  empty.textContent = text;
  return empty;
}

function makeActionButton(text: string, action: () => Promise<void>, danger = false): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = danger ? "mini-button mini-danger" : "mini-button";
  button.type = "button";
  button.textContent = text;
  button.addEventListener(
    "click",
    () =>
      void action().catch((error: unknown) => {
        showNotice(error instanceof Error ? error.message : "The setting could not be saved.");
      })
  );
  return button;
}

function showNotice(text: string): void {
  const notice = byId<HTMLDivElement>("action-notice");
  notice.textContent = text;
  notice.hidden = false;
}

byId("tracking-button").addEventListener("click", () => {
  void (async () => {
    render(await window.pcWrapped.setTracking(!latestState?.tracking));
  })();
});
byId("startup-toggle").addEventListener("change", (event) => {
  void window.pcWrapped.setStartAtLogin((event.currentTarget as HTMLInputElement).checked);
});
byId("export-csv-button").addEventListener("click", () => {
  void (async () => {
    const saved = await window.pcWrapped.exportHistoryCsv();
    showNotice(saved ? `History exported to ${saved}` : "Nothing saved to export yet.");
  })().catch((error: unknown) => showNotice(error instanceof Error ? error.message : "The history could not be exported."));
});
byId("delete-button").addEventListener("click", () => {
  void (async () => {
    await window.pcWrapped.deleteHistory();
    render(await window.pcWrapped.getState());
  })();
});
byId("create-card-button").addEventListener("click", () => {
  const section = byId<HTMLElement>("card-section");
  section.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  section.focus({ preventScroll: true });
});
byId("settings-button").addEventListener("click", () => {
  const section = byId<HTMLElement>("settings-section");
  section.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  section.focus({ preventScroll: true });
});
document.querySelectorAll<HTMLButtonElement>(".period-button").forEach((button) =>
  button.addEventListener("click", () => {
    clearCardPreview();
    period = isRecapPeriod(button.dataset.period) ? button.dataset.period : "day";
    document.querySelectorAll(".period-button").forEach((item) => {
      item.classList.toggle("active", item === button);
      item.setAttribute("aria-selected", String(item === button));
    });
    byId("interruption-copy").textContent =
      period === "day"
        ? "Time from an app visit of at least 10 minutes until you return and stay for 30 seconds. Idle time is excluded."
        : "For visits of at least 10 minutes, the active time until a 30-second steady return. Idle time is excluded.";
    if (latestState) render(latestState);
  })
);

async function previewCard(): Promise<void> {
  if (!latestState || currentData(latestState).stats.totalActiveMs <= 0) {
    byId<HTMLParagraphElement>("card-empty-message").hidden = false;
    return;
  }
  const format = byId<HTMLSelectElement>("card-format").value as "story" | "square";
  const dataUrl = await window.pcWrapped.previewCard(format, period);
  const previewBlob = pngDataUrlToBlob(dataUrl);
  const nextUrl = URL.createObjectURL(previewBlob);
  const image = byId<HTMLImageElement>("card-preview");
  image.onerror = () => {
    clearCardPreview();
    showNotice("The card preview could not be displayed. Please try previewing it again.");
  };
  image.src = nextUrl;
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = nextUrl;
  byId("preview-wrap").hidden = false;
  byId("export-message").textContent = format === "story" ? "Story card · 1080 × 1920 px" : "Square card · 1080 × 1080 px";
  previewedSignature = `${format}:${period}`;
  refreshShareRow();
}

/**
 * Sharing is offered only for the card the user previewed and saved: a card has to be seen before
 * it can leave the app, and the file handed to the share route is the PNG this app just wrote.
 */
function refreshShareRow(): void {
  const currentSignature = `${byId<HTMLSelectElement>("card-format").value}:${period}`;
  const canShare = Boolean(savedCardPath) && previewedSignature === currentSignature;
  byId<HTMLDivElement>("share-row").hidden = !canShare;
  if (!canShare) byId("share-message").textContent = "";
}

async function shareCard(target: ShareTarget): Promise<void> {
  if (!savedCardPath) {
    byId("share-message").textContent = "Save the PNG first, then share the saved card.";
    return;
  }
  const format = byId<HTMLSelectElement>("card-format").value as "story" | "square";
  const outcome = await window.pcWrapped.shareCard(target, format, period, savedCardPath);
  byId("share-message").textContent = outcome.message;
}

document.querySelectorAll<HTMLButtonElement>(".share-button").forEach((button) =>
  button.addEventListener("click", () => {
    const target = button.dataset.share as ShareTarget | undefined;
    if (!target) return;
    void shareCard(target).catch((error: unknown) => {
      byId("share-message").textContent = error instanceof Error ? error.message : "The share page could not be opened.";
    });
  })
);
byId("preview-button").addEventListener("click", () => void previewCard());
byId("save-button").addEventListener("click", () => {
  void saveCard();
});
async function saveCard(): Promise<void> {
  if (!latestState || currentData(latestState).stats.totalActiveMs <= 0) return;
  const format = byId<HTMLSelectElement>("card-format").value as "story" | "square";
  const saved = await window.pcWrapped.exportCard(format, period);
  if (saved) {
    savedCardPath = saved;
    byId("export-message").textContent = `Saved locally: ${saved}`;
    await previewCard();
    refreshShareRow();
  }
}

window.addEventListener("beforeunload", () => {
  clearCardPreview();
});

function clearCardPreview(): void {
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = undefined;
  previewedSignature = "";
  savedCardPath = null;
  byId<HTMLImageElement>("card-preview").removeAttribute("src");
  byId<HTMLDivElement>("preview-wrap").hidden = true;
  byId<HTMLDivElement>("share-row").hidden = true;
  byId("share-message").textContent = "";
}

window.pcWrapped.onState(render);
void window.pcWrapped.getState().then(render);
