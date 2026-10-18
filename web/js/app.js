// App shell: router, theme toggle, global search, footer credits.
import { CREDITS } from "./config.js";
import { html, mount, storage, fmt } from "./util.js";
import { getSummary } from "./data.js";
import { attachAutocomplete, hrefFor } from "./search.js";
import * as overview from "./pages/overview.js";
import * as explore from "./pages/explore.js";
import * as details from "./pages/details.js";

const app = document.getElementById("app");
const PAGES = { overview, explore, details };
let cleanup = null;
const visited = new Set();

// ------------------------------------------------------------------ router
function parseRoute() {
  const [path, query] = (location.hash.replace(/^#\/?/, "") || "overview").split("?");
  const [page, ...rest] = path.split("/").filter(Boolean);
  return { page: PAGES[page] ? page : "overview", rest: rest.map(decodeURIComponent), query: new URLSearchParams(query || "") };
}

async function render() {
  const route = parseRoute();
  visited.add(route.page);
  document.querySelectorAll(".tabs a").forEach((a) => {
    const on = a.dataset.route === route.page;
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    a.classList.toggle("done", !on && visited.has(a.dataset.route));
  });

  const swap = async () => {
    try { cleanup?.(); } catch (e) { console.warn(e); }
    cleanup = null;
    mount(app, html`<div class="loading"><div class="spinner"></div><span>Loading data…</span></div>`);
    try {
      cleanup = await PAGES[route.page].render(app, route);
    } catch (err) {
      console.error(err);
      mount(app, html`<div class="container empty-state"><h2>Something went wrong</h2>
        <p>${err.message}</p><p style="margin-top:12px"><a class="btn" href="#/overview">Back to overview</a></p></div>`);
    }
  };

  window.scrollTo({ top: 0, behavior: "instant" });
  if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.startViewTransition(swap);
  } else {
    await swap();
  }
}

window.addEventListener("hashchange", () => {
  // Explore keeps its filters in the query string; only re-render when the page/path changes.
  const key = location.hash.split("?")[0];
  if (key === render.lastKey) return;
  render.lastKey = key;
  render();
});

// ------------------------------------------------------------------ theme
const toggle = document.getElementById("theme-toggle");
function setTheme(t, persist = true) {
  document.documentElement.dataset.theme = t;
  if (persist) storage("rd-theme", t);
  toggle.setAttribute("aria-label", t === "dark" ? "Switch to light theme" : "Switch to dark theme");
  window.dispatchEvent(new CustomEvent("themechange", { detail: t }));
}
toggle.addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
  if (!storage("rd-theme")) setTheme(e.matches ? "dark" : "light", false);
});
setTheme(document.documentElement.dataset.theme, false);

// ------------------------------------------------------------------ global search
// Rivers, dams, states and basins; suggestions start at 4 characters (see search.js).
const input = document.getElementById("global-search");
attachAutocomplete(input, { onPick: (m) => { location.hash = hrefFor(m); input.blur(); } });
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); input.focus(); }
});

// ------------------------------------------------------------------ footer
mount(document.getElementById("credits"), html`${CREDITS.map((c) => html`<li>
  <span>${c.label}: <a href="${c.url}" target="_blank" rel="noopener">${c.source}</a></span><small>${c.note}</small></li>`)}`);
document.getElementById("year").textContent = new Date().getFullYear();
getSummary().then((s) => {
  document.getElementById("f-rivers").textContent = fmt.int(s.kpis.river_count);
  document.getElementById("f-dams").textContent = fmt.int(s.kpis.dam_count);
}).catch(() => {});

render.lastKey = location.hash.split("?")[0];
render();
