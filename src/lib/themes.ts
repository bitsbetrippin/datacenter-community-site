/**
 * v1.1 theme packs — built on the v1.0 groundwork (body[data-theme] + CSS
 * variables). Seasonal themes additionally set a `data-festive` attribute
 * that switches on the calendar edge frame, garland strip, and themed
 * headers defined in themes.css.
 */

export interface ThemeDef {
  id: string;
  label: string;
  festive: boolean;
}

export const BASE_THEMES: ThemeDef[] = [
  { id: "classic", label: "Classic (indigo)", festive: false },
  { id: "forest", label: "Forest (green)", festive: false },
  { id: "ocean", label: "Ocean (teal)", festive: false },
  { id: "sunset", label: "Sunset (warm)", festive: false },
];

export const SEASONAL_THEMES: ThemeDef[] = [
  { id: "christmas", label: "🎄 Christmas", festive: true },
  { id: "winter", label: "❄️ Winter", festive: true },
  { id: "thanksgiving", label: "🦃 Thanksgiving", festive: true },
  { id: "halloween", label: "🎃 Halloween", festive: true },
  { id: "summer", label: "☀️ Summer (beaches)", festive: true },
  { id: "fall", label: "🍁 Fall (leaves)", festive: true },
  { id: "spring", label: "🌸 Spring (flowers)", festive: true },
];

export const AUTO_THEME_ID = "auto";

const ALL = new Map([...BASE_THEMES, ...SEASONAL_THEMES].map((t) => [t.id, t]));

/**
 * Auto-by-season mapping (Northern Hemisphere / US holidays):
 *   Dec → Christmas · Jan–Feb → Winter · Mar–May → Spring ·
 *   Jun–Aug → Summer · Sep + Nov 1–14 → Fall · Oct → Halloween ·
 *   Nov 15–30 → Thanksgiving
 */
export function seasonalThemeFor(date: Date): string {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  if (m === 12) return "christmas";
  if (m === 1 || m === 2) return "winter";
  if (m >= 3 && m <= 5) return "spring";
  if (m >= 6 && m <= 8) return "summer";
  if (m === 10) return "halloween";
  if (m === 11) return d >= 15 ? "thanksgiving" : "fall";
  return "fall"; // September
}

export function resolveTheme(id: string | null | undefined, date = new Date()): ThemeDef {
  const concrete = id === AUTO_THEME_ID ? seasonalThemeFor(date) : (id ?? "classic");
  return ALL.get(concrete) ?? ALL.get("classic")!;
}

/** Apply a theme (or "auto") to the whole app, including the wall display. */
export function applyTheme(id: string | null | undefined): void {
  const theme = resolveTheme(id);
  document.body.dataset.theme = theme.id;
  if (theme.festive) {
    document.body.setAttribute("data-festive", "true");
  } else {
    document.body.removeAttribute("data-festive");
  }
}
