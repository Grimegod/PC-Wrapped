import type { AppBridge, AppState, DayAggregate, I18nPayload, RecapStats, ShareTarget } from "../shared/model.js";
import type { RecapPeriod } from "../shared/constants.js";
import { conversionText } from "../shared/conversions.js";
import { createTranslator, type Translator } from "../shared/i18n.js";
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
let tr: Translator = createTranslator("en", {});
const t = (key: string, params?: Record<string, string | number>): string => tr.t(key, params);
const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing UI element: ${id}`);
  return element as T;
};

function isRecapPeriod(value: string | undefined): value is RecapPeriod {
  return value === "day" || value === "week" || value === "month" || value === "year";
}

function duration(ms: number): string {
  return tr.duration(ms);
}

/** Put the chosen language on every element marked with data-i18n, and set the page direction. */
function applyI18n(payload: I18nPayload): void {
  tr = createTranslator(payload.locale, payload.messages, payload.fallback);
  document.documentElement.lang = payload.locale;
  document.documentElement.dir = payload.dir;
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n!);
  });
  for (const attribute of ["title", "alt", "aria-label"] as const) {
    const dataName = `i18n${attribute === "aria-label" ? "AriaLabel" : attribute[0].toUpperCase() + attribute.slice(1)}`;
    document.querySelectorAll<HTMLElement>(`[data-i18n-${attribute}]`).forEach((element) => {
      element.setAttribute(attribute, t(element.dataset[dataName]!));
    });
  }
  const select = byId<HTMLSelectElement>("language-select");
  const autoName = payload.languages.find((language) => language.code === payload.autoLocale)?.nativeName ?? payload.autoLocale;
  select.replaceChildren(
    new Option(t("language.auto", { language: autoName }), "auto"),
    ...payload.languages.map((language) => {
      const option = new Option(language.nativeName, language.code);
      option.lang = language.code;
      return option;
    })
  );
  select.value = payload.choice;
  updateInterruptionCopy();
  if (latestState) render(latestState);
}

function updateInterruptionCopy(): void {
  byId("interruption-copy").textContent = t(period === "day" ? "return.copyDay" : "return.copyRange");
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
  byId("status-text").textContent = t(state.tracking ? "status.on" : "status.paused");
  byId<HTMLButtonElement>("tracking-button").textContent = t(state.tracking ? "button.pauseTracking" : "button.startTracking");
  byId("active-time").textContent = duration(stats.totalActiveMs);
  byId("longest-streak").textContent = duration(stats.longestStreakMs);
  byId("app-changes").textContent = tr.number(stats.appChanges);
  const archetypeEmoji = byId<HTMLDivElement>("archetype-emoji");
  const archetypeLine = byId<HTMLParagraphElement>("archetype-line");
  archetypeEmoji.textContent = hasCardData ? selected.archetype.emoji : "";
  archetypeEmoji.hidden = !hasCardData;
  byId("archetype-name").textContent = hasCardData ? selected.archetype.name : t("character.placeholder");
  archetypeLine.textContent = hasCardData ? selected.archetype.line : "";
  archetypeLine.hidden = !hasCardData;
  byId("conversion").textContent = conversionText(stats.totalActiveMs / 60_000, tr);
  byId("app-count").textContent = t("apps.count", { count: tr.number(stats.uniqueApps) });
  byId("return-summary").textContent = stats.completedInterruptions
    ? t("return.summary", { count: tr.number(stats.completedInterruptions), duration: duration(stats.averageReturnMs) })
    : t("return.none");
  const warning = byId<HTMLDivElement>("warning");
  warning.textContent = state.warning;
  warning.hidden = !state.warning;
  byId<HTMLInputElement>("startup-toggle").checked = state.startAtLogin;
  byId<HTMLInputElement>("resume-toggle").checked = state.resumeTracking;
  byId<HTMLInputElement>("fullscreen-toggle").checked = state.countFullscreen;
  byId<HTMLSelectElement>("theme-select").value = state.theme;
  applyTheme(state.theme);
  byId<HTMLButtonElement>("preview-button").disabled = !hasCardData;
  byId<HTMLButtonElement>("save-button").disabled = !hasCardData;
  byId<HTMLParagraphElement>("card-empty-message").hidden = hasCardData;
  if (!hasCardData) clearCardPreview();
  renderApps(day);
  renderPreferenceLists(state);
}

const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
/** Light turquoise, dark blue, or whatever Windows uses; "system" follows changes live. */
function applyTheme(theme: AppState["theme"]): void {
  const dark = theme === "dark" || (theme === "system" && systemDark.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}
systemDark.addEventListener("change", () => {
  if (latestState) applyTheme(latestState.theme);
});

function renderApps(day: DayAggregate): void {
  const host = byId<HTMLDivElement>("apps-list");
  const apps = Object.entries(day.apps)
    .filter(([, value]) => value.activeMs > 0)
    .sort((a, b) => b[1].activeMs - a[1].activeMs);
  host.replaceChildren();
  if (!apps.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const icon = document.createElement("span");
    icon.textContent = "☁️";
    const title = document.createElement("p");
    title.textContent = t("apps.emptyTitle");
    const note = document.createElement("small");
    note.textContent = t("apps.emptyNote");
    empty.append(icon, title, note);
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
    fill.setAttribute("aria-label", t("apps.barAria", { app: app.label }));
    bar.append(fill);
    const time = document.createElement("div");
    time.className = "app-time";
    time.textContent = duration(app.activeMs);
    const actions = document.createElement("div");
    actions.className = "app-actions";
    actions.append(
      makeActionButton(t(Object.hasOwn(latestState?.excludedApps ?? {}, executableId) ? "apps.include" : "apps.exclude"), async () => {
        const excluded = !Object.hasOwn(latestState?.excludedApps ?? {}, executableId);
        const next = await window.pcWrapped.setExcludedApp(executableId, app.label, excluded);
        latestState = next;
        render(next);
        showNotice(t(excluded ? "notice.excluded" : "notice.included", { app: app.label }));
      }),
      makeActionButton(t(Object.hasOwn(latestState?.hiddenApps ?? {}, executableId) ? "apps.show" : "apps.hide"), async () => {
        const hidden = !Object.hasOwn(latestState?.hiddenApps ?? {}, executableId);
        const next = await window.pcWrapped.setHiddenOnCard(executableId, app.label, hidden);
        latestState = next;
        render(next);
        showNotice(t(hidden ? "notice.hidden" : "notice.shown", { app: app.label }));
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
  if (!excludedEntries.length) excludedHost.append(makeEmptyPreference(t("prefs.excludedEmpty")));
  for (const [id, label] of excludedEntries) {
    const row = preferenceRow(id, label);
    row.append(
      makeActionButton(t("prefs.reinclude"), async () => {
        const next = await window.pcWrapped.setExcludedApp(id, label, false);
        render(next);
        showNotice(t("notice.reincluded", { app: label }));
      }),
      makeActionButton(
        t("prefs.removePast"),
        async () => {
          const result = await window.pcWrapped.removeAppPastData(id);
          if (result.confirmed) {
            const next = await window.pcWrapped.getState();
            render(next);
            showNotice(t("notice.removed", { duration: duration(result.removedActiveMs), count: tr.number(result.removedDays) }));
          } else showNotice(t("notice.noneRemoved"));
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
  if (!hiddenEntries.length) hiddenHost.append(makeEmptyPreference(t("prefs.hiddenEmpty")));
  for (const [id, label] of hiddenEntries) {
    const row = preferenceRow(id, label);
    row.append(
      makeActionButton(t("apps.show"), async () => {
        const next = await window.pcWrapped.setHiddenOnCard(id, label, false);
        render(next);
        showNotice(t("notice.shown", { app: label }));
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
        showNotice(error instanceof Error ? cleanError(error) : t("error.setting"));
      })
  );
  return button;
}

/** IPC errors arrive as "Error invoking remote method 'x': Error: message"; keep only the message. */
function cleanError(error: Error): string {
  return error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

function showNotice(text: string): void {
  const notice = byId<HTMLDivElement>("action-notice");
  notice.textContent = text;
  notice.hidden = false;
}

byId("tracking-button").addEventListener("click", () => {
  void (async () => {
    render(await window.pcWrapped.setTracking(!latestState?.tracking));
  })().catch((error: unknown) => showNotice(error instanceof Error ? cleanError(error) : t("error.tracking")));
});
byId("startup-toggle").addEventListener("change", (event) => {
  void window.pcWrapped
    .setStartAtLogin((event.currentTarget as HTMLInputElement).checked)
    .catch((error: unknown) => showNotice(error instanceof Error ? cleanError(error) : t("error.setting")));
});
byId<HTMLSelectElement>("theme-select").addEventListener("change", (event) => {
  const value = (event.currentTarget as HTMLSelectElement).value;
  if (value !== "light" && value !== "dark" && value !== "system") return;
  applyTheme(value);
  void window.pcWrapped
    .setTheme(value)
    .then(render)
    .catch((error: unknown) => showNotice(error instanceof Error ? cleanError(error) : t("error.setting")));
});
byId<HTMLSelectElement>("language-select").addEventListener("change", (event) => {
  const choice = (event.currentTarget as HTMLSelectElement).value;
  void window.pcWrapped
    .setLanguage(choice)
    .then(applyI18n)
    .catch((error: unknown) => showNotice(error instanceof Error ? cleanError(error) : t("error.setting")));
});
for (const [id, setting] of [
  ["resume-toggle", "resumeTracking"],
  ["fullscreen-toggle", "countFullscreen"]
] as const) {
  byId(id).addEventListener("change", (event) => {
    void window.pcWrapped
      .setToggle(setting, (event.currentTarget as HTMLInputElement).checked)
      .then(render)
      .catch((error: unknown) => showNotice(error instanceof Error ? cleanError(error) : t("error.setting")));
  });
}
byId("export-csv-button").addEventListener("click", () => {
  void (async () => {
    const saved = await window.pcWrapped.exportHistoryCsv();
    showNotice(saved ? t("notice.csvExported", { path: saved }) : t("notice.csvEmpty"));
  })().catch((error: unknown) => showNotice(error instanceof Error ? cleanError(error) : t("error.csv")));
});
byId("delete-button").addEventListener("click", () => {
  void (async () => {
    await window.pcWrapped.deleteHistory();
    render(await window.pcWrapped.getState());
  })().catch((error: unknown) => showNotice(error instanceof Error ? cleanError(error) : t("error.delete")));
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
const periodButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".period-button"));
// Tabs follow the ARIA pattern: one tab in the Tab order, arrow keys and Home/End move between them.
periodButtons.forEach((button, index) =>
  button.addEventListener("keydown", (event) => {
    const last = periodButtons.length - 1;
    const next =
      event.key === "ArrowRight"
        ? index === last
          ? 0
          : index + 1
        : event.key === "ArrowLeft"
          ? index === 0
            ? last
            : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : -1;
    if (next < 0) return;
    event.preventDefault();
    periodButtons[next].focus();
    periodButtons[next].click();
  })
);
periodButtons.forEach((button) =>
  button.addEventListener("click", () => {
    clearCardPreview();
    period = isRecapPeriod(button.dataset.period) ? button.dataset.period : "day";
    periodButtons.forEach((item) => {
      item.classList.toggle("active", item === button);
      item.setAttribute("aria-selected", String(item === button));
      item.tabIndex = item === button ? 0 : -1;
    });
    updateInterruptionCopy();
    if (latestState) render(latestState);
  })
);

async function previewCard(): Promise<void> {
  byId<HTMLParagraphElement>("card-error").hidden = true;
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
    showNotice(t("error.previewShow"));
  };
  image.src = nextUrl;
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = nextUrl;
  byId("preview-wrap").hidden = false;
  byId("export-message").textContent = t(format === "story" ? "card.storyInfo" : "card.squareInfo");
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
    byId("share-message").textContent = t("share.saveFirst");
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
      byId("share-message").textContent = error instanceof Error ? cleanError(error) : t("share.openFailed");
    });
  })
);
byId("preview-button").addEventListener("click", () => {
  void previewCard().catch((error: unknown) => showCardError(error, t("error.preview")));
});
byId("save-button").addEventListener("click", () => {
  void saveCard().catch((error: unknown) => showCardError(error, t("error.save")));
});
function showCardError(error: unknown, fallback: string): void {
  const message = byId<HTMLParagraphElement>("card-error");
  message.textContent = error instanceof Error ? cleanError(error) : fallback;
  message.hidden = false;
}
async function saveCard(): Promise<void> {
  if (!latestState || currentData(latestState).stats.totalActiveMs <= 0) return;
  const format = byId<HTMLSelectElement>("card-format").value as "story" | "square";
  const saved = await window.pcWrapped.exportCard(format, period);
  if (saved) {
    savedCardPath = saved;
    byId("export-message").textContent = t("card.savedAt", { path: saved });
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
window.pcWrapped.onI18n(applyI18n);
// Language first, so the first paint is already in the reader's language.
void window.pcWrapped
  .getI18n()
  .then(applyI18n)
  .catch(() => undefined)
  .then(() => window.pcWrapped.getState())
  .then(render);
