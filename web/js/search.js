// Site-wide autocomplete over rivers, dams, states and basins.
// attachAutocomplete(input, {onPick}) gives any text box the same dropdown: it opens once
// MIN_CHARS characters are typed and supports mouse, keyboard (up/down/enter/esc) and screen readers.
import { html, mount, fmt, esc, raw, debounce, riverHref, damHref } from "./util.js";
import { getRivers, getDams, purposeGroup } from "./data.js";
import { damBadgeURL, icon } from "./icons.js";

export const MIN_CHARS = 4;

let index = null;
let indexPromise = null;

export function ensureIndex() {
  if (index) return Promise.resolve(index);
  if (!indexPromise) {
    indexPromise = Promise.all([getRivers(), getDams()]).then(([rivers, dams]) => {
      const stateDams = new Map(), stateRivers = new Map(), basinRivers = new Map();
      dams.list.forEach((d) => d.state && stateDams.set(d.state, (stateDams.get(d.state) || 0) + 1));
      rivers.list.forEach((r) => {
        r.stateList.forEach((s) => stateRivers.set(s, (stateRivers.get(s) || 0) + 1));
        if (r.basin) basinRivers.set(r.basin, (basinRivers.get(r.basin) || 0) + 1);
      });
      const states = [...new Set([...stateDams.keys(), ...stateRivers.keys()])];
      index = {
        river: rivers.list.filter((r) => r.name).map((r) => ({ type: "river", k: r.name.toLowerCase(), label: r.name, item: r, rank: r.length_km || 0 })),
        dam: dams.list.filter((d) => d.name).map((d) => ({ type: "dam", k: d.name.toLowerCase(), label: d.name, item: d, rank: d.height_m || 0 })),
        state: states.map((s) => ({ type: "state", k: s.toLowerCase(), label: s, item: { name: s, dams: stateDams.get(s) || 0, rivers: stateRivers.get(s) || 0 }, rank: stateDams.get(s) || 0 })),
        basin: [...basinRivers].map(([b, n]) => ({ type: "basin", k: b.toLowerCase(), label: b, item: { name: b, rivers: n }, rank: n })),
      };
      return index;
    });
  }
  return indexPromise;
}

/** Matches by group. Starts-with > word-start > contains; within a tier the biggest
 *  (longest river, tallest dam, most dams/rivers) comes first, so "Godavari" finds the
 *  1,661 km Godavari River before small streams that share the name. */
export function searchAll(q, limits = { state: 3, basin: 3, river: 5, dam: 5 }) {
  const out = { state: [], basin: [], river: [], dam: [] };
  if (!index) return out;
  q = q.trim().toLowerCase();
  const score = (k) => (k.startsWith(q) ? 0 : k.includes(` ${q}`) ? 1 : 2);
  for (const type of Object.keys(out)) {
    out[type] = index[type].filter((x) => x.k.includes(q))
      .sort((a, b) => score(a.k) - score(b.k) || b.rank - a.rank)
      .slice(0, limits[type] ?? 5);
  }
  return out;
}

// Default action: profiles for rivers/dams, Explore filtered for states/basins.
export function hrefFor(m) {
  if (m.type === "river") return riverHref(m.item.id);
  if (m.type === "dam") return damHref(m.item.id);
  return `#/explore?${m.type}=${encodeURIComponent(m.label)}`;
}

const GROUPS = [["state", "States"], ["basin", "Basins"], ["river", "Rivers"], ["dam", "Dams"]];

// Bold the matched part of a label (escaped).
function mark(label, q) {
  const i = label.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return esc(label);
  return `${esc(label.slice(0, i))}<mark>${esc(label.slice(i, i + q.length))}</mark>${esc(label.slice(i + q.length))}`;
}

function optionHTML(m, q, id) {
  const lead = m.type === "dam"
    ? html`<img src="${damBadgeURL(purposeGroup(m.item.purpose_group).slug, 48)}" width="24" height="24" alt="">`
    : html`<span class="ac-icon">${raw(icon({ river: "river", state: "state", basin: "basin" }[m.type]))}</span>`;
  const meta = {
    river: () => [fmt.km(m.item.length_km), m.item.basin],
    dam: () => [fmt.m(m.item.height_m), m.item.state],
    state: () => [`${fmt.int(m.item.dams)} dams`, `${fmt.int(m.item.rivers)} rivers`],
    basin: () => [`${fmt.int(m.item.rivers)} rivers`, "Basin"],
  }[m.type]();
  return html`<div class="ac-option" role="option" id="${id}" aria-selected="false" data-i="${id.split("-").pop()}">
    ${lead}<span class="ac-label">${raw(mark(m.label, q))}</span>
    <span class="meta">${meta[0]}<br>${meta[1] || ""}</span></div>`;
}

let uid = 0;

/**
 * Attach the dropdown to a text input.
 * opts: { onPick(match) - default navigates to hrefFor(match); types: subset of groups; clearOnPick: bool }
 */
export function attachAutocomplete(input, opts = {}) {
  const id = `ac-${++uid}`;
  const types = opts.types || GROUPS.map((g) => g[0]);
  const host = input.parentElement;
  host.classList.add("ac-host");
  const box = document.createElement("div");
  box.className = "search-results ac-list";
  box.id = id;
  box.setAttribute("role", "listbox");
  box.hidden = true;
  host.append(box);

  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", id);
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("autocomplete", "off");

  let matches = [], active = -1;

  const open = () => { box.hidden = false; input.setAttribute("aria-expanded", "true"); };
  const close = () => {
    box.hidden = true; active = -1; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant");
  };

  const pick = (m) => {
    close();
    if (opts.clearOnPick !== false) input.value = "";
    if (opts.onPick) opts.onPick(m);
    else location.hash = hrefFor(m);
  };

  const setActive = (i) => {
    const opts_ = [...box.querySelectorAll(".ac-option")];
    if (!opts_.length) return;
    active = (i + opts_.length) % opts_.length;
    opts_.forEach((o, j) => o.setAttribute("aria-selected", String(j === active)));
    input.setAttribute("aria-activedescendant", opts_[active].id);
    opts_[active].scrollIntoView({ block: "nearest" });
  };

  const run = debounce(async () => {
    const q = input.value.trim();
    if (!q) { close(); return; }
    if (q.length < MIN_CHARS) {
      const left = MIN_CHARS - q.length;
      mount(box, html`<div class="empty">Type ${left} more character${left > 1 ? "s" : ""} to see suggestions</div>`);
      matches = []; open(); return;
    }
    if (!index) { mount(box, html`<div class="empty">Loading…</div>`); open(); }
    await ensureIndex();
    if (input.value.trim() !== q) return; // a newer keystroke will render
    const found = searchAll(q);
    matches = [];
    const parts = GROUPS.filter(([t]) => types.includes(t) && found[t].length).map(([t, title]) => {
      const rows = found[t].map((m) => { matches.push(m); return optionHTML(m, q, `${id}-${matches.length - 1}`); });
      return html`<div class="group" role="presentation">${title}</div>${rows}`;
    });
    active = -1;
    mount(box, parts.length ? html`${parts}` : html`<div class="empty">No river, dam, state or basin matches “${q}”.</div>`);
    open();
  }, 120);

  input.addEventListener("input", run);
  input.addEventListener("focus", () => { ensureIndex(); if (input.value.trim()) run(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (box.hidden) run(); else setActive(active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(active - 1); }
    else if (e.key === "Enter") {
      const m = matches[active] || matches[0];
      if (m && !box.hidden) { e.preventDefault(); pick(m); }
    } else if (e.key === "Escape") { close(); }
  });
  // mousedown (not click) so the choice lands before the input's blur closes the list
  box.addEventListener("mousedown", (e) => {
    const o = e.target.closest(".ac-option");
    if (!o) return;
    e.preventDefault();
    pick(matches[Number(o.dataset.i)]);
  });
  box.addEventListener("mousemove", (e) => {
    const o = e.target.closest(".ac-option");
    if (o && Number(o.dataset.i) !== active) setActive(Number(o.dataset.i));
  });
  input.addEventListener("blur", () => setTimeout(close, 120));

  return { close, destroy: () => box.remove() };
}
