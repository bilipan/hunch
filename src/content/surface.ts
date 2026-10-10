export type Surface = "light" | "dark";

// Perceived luminance, Rec. 709. The midpoint is the usual cut for deciding whether
// a background wants light or dark text on top of it.
const DARK_LUMA = 0.5;

// Read at most two candidates rather than walking the tree: body's own background if
// it sets one, then the root's. Sites that only style an inner wrapper still land on
// the root or fall through to the system preference, which is the right guess anyway.
const roots = () => [document.body, document.documentElement];

export function pageSurface(): Surface {
  for (const el of roots()) {
    if (!el) continue;
    const bg = parseColor(getComputedStyle(el).backgroundColor);
    if (bg) return bg.luma < DARK_LUMA ? "dark" : "light";
  }
  return prefersDark() ? "dark" : "light";
}

export const prefersDark = () => matchMedia("(prefers-color-scheme: dark)").matches;

// Handles both the legacy `rgb(r, g, b)` / `rgba(r, g, b, a)` and the modern
// `rgb(r g b / a)` spellings, since which one you get depends on the browser.
function parseColor(color: string): { luma: number } | undefined {
  const parts = color.match(/[\d.]+/g);
  if (!parts || parts.length < 3) return undefined;
  const [r, g, b] = parts.map(Number);
  // A transparent layer tells us nothing about what shows through it.
  if (parts.length > 3 && Number(parts[3]) === 0) return undefined;
  return { luma: (0.2126 * r! + 0.7152 * g! + 0.0722 * b!) / 255 };
}