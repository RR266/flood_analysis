// Icon glyphs (24x24, stroke) + badge builder shared by the map, tooltips and lists.
import { css } from "./util.js";

export const GLYPHS = {
  irrigation: '<path d="M7 20h10"/><path d="M12 20v-8"/><path d="M12 12c0-3.5-2.5-5.5-6-5.5 0 3.5 2.5 5.5 6 5.5z"/><path d="M12 10c0-3 2.2-5 5.5-5 0 3-2.2 5-5.5 5z"/>',
  hydropower: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
  "water-supply": '<path d="M12 3s6 6.2 6 10.5a6 6 0 0 1-12 0C6 9.2 12 3 12 3z"/>',
  other: '<path d="M3 8c1.5 1.2 3 1.2 4.5 0s3-1.2 4.5 0 3 1.2 4.5 0 3-1.2 4.5 0"/><path d="M3 14c1.5 1.2 3 1.2 4.5 0s3-1.2 4.5 0 3 1.2 4.5 0 3-1.2 4.5 0"/>',
  source: '<path d="m3 20 6.5-11 4 6 2.5-3.5L21 20z"/><path d="M8 5.5 9.5 3l1.5 2.5"/>',
  mouth: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  river: '<path d="M4 4c4 2 2 6 6 8s2 6 6 8"/><path d="M9 3c3 2 1.5 5 4.5 7S15 15 20 16"/>',
  dam: '<path d="M3 20h18"/><path d="M6 20V8l4-3v15"/><path d="M14 20V10c2 1 4 1 7 0v10"/>',
  basin: '<path d="M3 17 9 7l4 6 3-4 5 8z"/><path d="M3 21h18"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  height: '<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/>',
  storage: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  ruler: '<path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>',
  map: '<path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  pause: '<path d="M8 4v16M16 4v16"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  state: '<path d="M4 6 9 3l6 3 5-2v14l-5 2-6-3-5 2z"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
};

// Inline SVG for UI use (inherits currentColor).
export const icon = (name, cls = "") =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[name] || ""}</svg>`;

// Round badge: coloured disc + surface ring + white glyph. Used as <img> and as map images.
export function badgeSVG(glyph, fill, { size = 48, ring = "#ffffff", ink = "#ffffff" } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48">
    <circle cx="24" cy="24" r="21" fill="${fill}" stroke="${ring}" stroke-width="3.5"/>
    <g transform="translate(12 12)" fill="none" stroke="${ink}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[glyph]}</g>
  </svg>`;
}

export const svgDataURL = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

// Colour for a purpose-group slug, read from the active theme's tokens.
export function purposeColor(slug) {
  const v = { irrigation: "--series-1", hydropower: "--series-2", "water-supply": "--series-3" }[slug] || "--series-other";
  return css(v);
}

export function damBadgeURL(slug, size = 48) {
  return svgDataURL(badgeSVG(slug, purposeColor(slug), { size, ring: css("--surface") || "#fff" }));
}

export function endpointBadgeURL(kind, size = 48) {
  // Source / mouth: inverse badge (surface disc, accent glyph) so they never read as a dam purpose.
  return svgDataURL(badgeSVG(kind === "source" ? "source" : "mouth", css("--surface") || "#fff",
    { size, ring: css("--accent"), ink: css("--accent") }));
}

export function loadImage(url, size) {
  return new Promise((resolve, reject) => {
    const img = new Image(size, size);
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
