import * as d3 from "d3";

// ---------------------------------------------------------------- safe HTML
// html`...` escapes every interpolated value unless it is itself html`` / raw().
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => {
    if (v instanceof Raw) out += v.s;
    else if (Array.isArray(v)) out += v.map((x) => (x instanceof Raw ? x.s : esc(x))).join("");
    else if (v === false || v === null || v === undefined) out += "";
    else out += esc(v);
    out += strings[i + 1];
  });
  return new Raw(out);
}

export function mount(el, content) {
  el.innerHTML = String(content);
  return el;
}

// ---------------------------------------------------------------- formatting
const fComma = d3.format(",");
const fComma1 = d3.format(",.1f");
export const fmt = {
  int: (v) => (v == null ? "-" : fComma(Math.round(v))),
  num1: (v) => (v == null ? "-" : fComma1(v)),
  compact: (v) => {
    if (v == null) return "-";
    const a = Math.abs(v);
    if (a >= 1e9) return d3.format(".3~s")(v).replace("G", "B");
    if (a >= 1e4) return d3.format(".3~s")(v);
    return fComma(Math.round(v));
  },
  km: (v) => (v == null ? "-" : `${v >= 100 ? fComma(Math.round(v)) : fComma1(v)} km`),
  m: (v) => (v == null ? "-" : `${fComma1(v)} m`),
  mcm: (v) => (v == null ? "-" : `${v >= 100 ? fComma(Math.round(v)) : d3.format(",.2~f")(v)} MCM`),
  year: (v) => (v == null ? "Unknown" : String(v)),
  pct: (v) => (v == null ? "-" : v > 0 && v < 0.005 ? "<1%" : `${Math.round(v * 100)}%`),
  ordinal: (p) => {
    const n = Math.round(p * 100);
    const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th");
    return `${n}${s}`;
  },
};

export const plural = (n, one, many = `${one}s`) => `${fmt.int(n)} ${n === 1 ? one : many}`;

// Percentile rank -> "longer than 72% of rivers in its basin" / "the longest in its basin".
export const longerThan = (p, group = "rivers in its basin") =>
  p == null ? "" : p >= 1 ? `The longest of the ${group}` : `Longer than ${Math.floor(p * 100)}% of ${group}`;

// Generic rank phrase: rankPhrase(0.72, "Taller than", "dams", "The tallest dam") -> "Taller than 72% of dams".
export const rankPhrase = (p, lead, group, top) =>
  p == null ? "" : p >= 1 ? top : `${lead} ${Math.floor(p * 100)}% of ${group}`;

export const titleCase = (s) => (s ? s.replace(/\b\w/g, (c) => c.toUpperCase()) : s);
export const splitList = (s, sep = ",") => (s ? s.split(sep).map((x) => x.trim()).filter(Boolean) : []);

// ---------------------------------------------------------------- misc
export function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function storage(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch (e) { /* private mode / blocked storage - fine */ }
  return null;
}

export function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export const isDark = () => document.documentElement.dataset.theme === "dark";

// Re-render a chart whenever its container changes width.
export function onResize(el, fn) {
  let w = el.clientWidth;
  const ro = new ResizeObserver(() => {
    if (Math.abs(el.clientWidth - w) > 4) { w = el.clientWidth; fn(); }
  });
  ro.observe(el);
  return () => ro.disconnect();
}

export function queryParams() {
  const q = location.hash.split("?")[1] || "";
  return Object.fromEntries(new URLSearchParams(q));
}

export function setQuery(params) {
  const base = location.hash.split("?")[0] || "#/explore";
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "" && v != null)).toString();
  history.replaceState(null, "", qs ? `${base}?${qs}` : base);
}

export const riverHref = (id) => `#/details/river/${encodeURIComponent(id)}`;
export const damHref = (id) => `#/details/dam/${encodeURIComponent(id)}`;
