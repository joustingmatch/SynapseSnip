import type { Settings } from "../types";

export const DARK_THEMES: Settings["theme"][] = [
  "dark",
  "slate",
  "midnight",
  "ember",
  "forest",
  "rose",
  "gold",
  "ocean",
  "mint",
  "purple",
  "nord",
  "dracula",
  "gruvbox",
  "solarized",
  "contrast",
];

export function applyTheme(theme: Settings["theme"]) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.classList.toggle("dark", DARK_THEMES.includes(theme));
}
