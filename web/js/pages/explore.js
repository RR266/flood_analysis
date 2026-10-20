// Step 2 of the journey - filter, map and short information.
import * as d3 from "d3";
import { html, raw, mount, fmt, debounce, setQuery, riverHref, damHref, longerThan, plural } from "../util.js";
import { getDams, getRivers, purposeGroup } from "../data.js";
import { icon, damBadgeURL, endpointBadgeURL } from "../icons.js";
import { createMap, boundsOf, riverBounds } from "../map.js";
import { hbar, columns } from "../charts.js";
import { stat, breadcrumb, kv } from "../components.js";
import { attachAutocomplete, MIN_CHARS } from "../search.js";
import { INDIA_BOUNDS } from "../config.js";

const HEIGHTS = ["<15 m", "15-30 m", "30-60 m", "60-100 m", "100+ m"];
const ERAS = ["Pre-Independence", "1947-1979", "1980-1999", "2000+"];
const PAGE = 40;

export async function render(root, route) {
  const [dams, rivers] = await Promise.all([getDams(), getRivers()]);
  const q0 = Object.fromEntries(route.query);
  const f = {
    q: q0.q || "", basin: q0.basin || "", state: q0.state || "", purpose: q0.purpose || "",
    height: q0.height || "", era: q0.era || "",
  };
  // ui.sel = the selected river/dam. While set, the map and panel show ONLY that record,
  // its river and the dams on that river ("focus mode"); clearing it restores the filters.
  const ui = { tab: q0.tab === "rivers" ? "rivers" : "dams", sort: "storage", shown: PAGE, sel: null };
  const [selType, selId] = (q0.sel || "").split(":");
  const initialSel = q0.river ? { type: "river", id: Number(q0.river) }   // links from profile pages
    : selType === "river" ? { type: "river", id: Number(selId) }
    : selType === "dam" ? { type: "dam", id: selId } : null;

  const basins = [...new Set(rivers.list.map((r) => r.basin).filter(Boolean))].sort();
  const states = [...new Set(dams.list.map((d) => d.state).filter(Boolean))].sort();
  const purposes = [...new Set(dams.list.flatMap((d) => d.purposes))].sort();

  const option = (v, cur, label = v) => html`<option value="${v}" ${v === cur ? raw("selected") : ""}>${label}</option>`;
  const select = (id, label, opts, cur, all) => html`<div class="field"><label for="${id}">${label}</label>
    <select id="${id}">${option("", cur, all)}${opts.map((o) => option(o, cur))}</select></div>`;

  mount(root, html`
  <div class="page" style="width:min(1440px, 100% - 32px);margin-inline:auto">
    <div class="page-head">
      <div>
        ${breadcrumb([{ label: "Overview", href: "#/overview" }, { label: "Explore" }])}
        <h1>Explore rivers and dams</h1>
        <p>Filter the map, hover for quick facts, and click any river or dam for a short profile. Open the full profile for everything about it.</p>
      </div>
    </div>

    <form class="card filter-bar" id="filters" role="search" aria-label="Filters" onsubmit="return false">
      <div class="field search-field"><label for="f-q">Name</label>
        <input id="f-q" type="search" placeholder="River, dam, state or basin (4+ letters)" value="${f.q}"></div>
      ${select("f-basin", "Basin", basins, f.basin, "All basins")}
      ${select("f-state", "State", states, f.state, "All states")}
      ${select("f-purpose", "Purpose", purposes, f.purpose, "Any purpose")}
      ${select("f-height", "Dam height", HEIGHTS, f.height, "Any height")}
      ${select("f-era", "Completed", ERAS, f.era, "Any time")}
      <div class="filter-actions">
        <button class="btn" type="button" id="f-reset">${raw(icon("reset"))} Reset <span class="active-count" id="f-count" hidden></span></button>
      </div>
    </form>

    <div class="explore-layout">
      <div class="card map-card">
        <div class="map" id="explore-map"></div>
        <div class="focus-bar" id="focus-bar" role="status" hidden></div>
        <details class="map-legend map-layers" open>
          <summary class="title">Map layers</summary>
          <div class="layer-rows" role="group" aria-label="Map layers">
            ${[["rivers", "river", "Rivers"], ["flow", "play", "Flow"], ["dams", "dam", "Dams"], ["reservoirs", "storage", "Reservoirs"]].map(([k, ic, label]) =>
              html`<label class="row"><input type="checkbox" data-layer="${k}" checked>${raw(icon(ic))}${label}</label>`)}
          </div>
        </details>
        <div class="map-tools">
          <button class="btn sm" type="button" id="fit">${raw(icon("fit"))} Fit to results</button>
        </div>
        <details class="map-legend" open>
          <summary class="title">Legend</summary>
          <div class="legend-rows">
          <div class="row"><span class="line"></span>River (thicker = longer)</div>
          <div class="row"><span class="flow"></span>Flow direction, source → mouth</div>
          <div class="row"><span class="water"></span>Reservoir (zoom in for small ones)</div>
          ${["Irrigation", "Hydropower", "Water Supply", "Other"].map((p) => html`<div class="row"><img src="${damBadgeURL(purposeGroup(p).slug)}" alt="">${p === "Other" ? "Other purpose dam" : `${p} dam`}</div>`)}
          <div class="row"><img src="${endpointBadgeURL("source")}" alt="">River source</div>
          <div class="row"><img src="${endpointBadgeURL("mouth")}" alt="">Mouth / confluence</div>
          </div>
        </details>
      </div>

      <aside class="side-panel" aria-label="Results">
        <div id="selection" hidden></div>
        <div class="grid g-2" id="kpis"></div>
        <div class="card"><div class="card-head"><div><h3>Completed per decade</h3><p id="mini-decades-sub">Dams matching the filters</p></div></div><div class="chart" id="mini-decades"></div></div>
        <div class="card"><div class="card-head"><div><h3>Purposes</h3><p id="mini-purpose-sub">Share of matching dams serving each purpose</p></div></div><div class="chart" id="mini-purpose"></div></div>
        <div class="card">
          <div class="results-head">
            <div class="seg" role="group" aria-label="Result type">
              <button type="button" data-tab="dams" aria-pressed="${String(ui.tab === "dams")}">Dams</button>
              <button type="button" data-tab="rivers" aria-pressed="${String(ui.tab === "rivers")}">Rivers</button>
            </div>
            <select id="sort" aria-label="Sort results" class="btn sm" style="padding-right:8px"></select>
          </div>
          <div id="results-count" class="sel-sub" style="margin-bottom:8px"></div>
          <div class="result-list" id="results" role="list"></div>
          <button class="btn more" type="button" id="more" hidden>Show more</button>
        </div>
      </aside>
    </div>
  </div>`);

  const $ = (sel) => root.querySelector(sel);
  const cleanups = [];
  // filtered* = what the filters match; view* = what is shown (the focus set when something is selected)
  let filteredDams = [], filteredRivers = [], viewDams = [], viewRivers = [], riverDamCount = new Map();

  // ---------------------------------------------------------------- map
  const mapCtl = createMap($("#explore-map"), {
    rivers: true, dams: dams.list, reservoirs: true,
    damLookup: (id) => dams.byId.get(id),
    riverLookup: (id) => rivers.byId.get(id),
    onDamClick: (d) => selectDam(d),
    onRiverClick: (p) => { const r = rivers.byId.get(p.id); if (r) selectRiver(r); },
  });
  cleanups.push(() => mapCtl.destroy());
  if (!mapCtl.flowOn) $('[data-layer="flow"]').checked = false;

  root.querySelectorAll("[data-layer]").forEach((b) => b.addEventListener("change", () => {
    if (b.dataset.layer === "flow") mapCtl.setFlow(b.checked); else mapCtl.setVisible(b.dataset.layer, b.checked);
  }));
  $("#fit").addEventListener("click", () => fitResults());

  // ---------------------------------------------------------------- filtering
  const damFilterActive = () => !!(f.purpose || f.height || f.era);
  const anyFilter = () => Object.values(f).some((v) => v !== "" && v != null);

  // The river a selection is about: the river itself, or the dam's linked river (may be null).
  function focusRiver() {
    if (!ui.sel) return null;
    if (ui.sel.type === "river") return rivers.byId.get(ui.sel.id) || null;
    const d = dams.byId.get(ui.sel.id);
    return d?.river_id != null ? rivers.byId.get(d.river_id) || null : null;
  }

  function apply({ fit = false } = {}) {
    const q = f.q.trim().length >= MIN_CHARS ? f.q.trim().toLowerCase() : "";
    filteredDams = dams.list.filter((d) =>
      (!f.basin || d.river_basin === f.basin) &&
      (!f.state || d.state === f.state) &&
      (!f.purpose || d.purposes.includes(f.purpose)) &&
      (!f.height || d.height_class === f.height) &&
      (!f.era || d.era === f.era) &&
      (!q || (d.name || "").toLowerCase().includes(q) || (d.nearest_river || "").toLowerCase().includes(q)));
    const filteredCount = d3.rollup(filteredDams.filter((d) => d.river_id != null), (v) => v.length, (d) => d.river_id);
    filteredRivers = rivers.list.filter((r) =>
      (!f.basin || r.basin === f.basin) &&
      (!f.state || r.stateList.includes(f.state)) &&
      (!damFilterActive() || filteredCount.has(r.id)) &&
      (!q || (r.name || "").toLowerCase().includes(q) || filteredCount.has(r.id)));

    // focus mode: only the selected record, its river and that river's dams
    const fr = focusRiver();
    if (ui.sel) {
      viewRivers = fr ? [fr] : [];
      viewDams = fr ? dams.list.filter((d) => d.river_id === fr.id)
        : [dams.byId.get(ui.sel.id)].filter(Boolean);
    } else {
      viewRivers = filteredRivers;
      viewDams = filteredDams;
    }
    riverDamCount = d3.rollup(viewDams.filter((d) => d.river_id != null), (v) => v.length, (d) => d.river_id);

    // map
    mapCtl.setDams(viewDams);
    // reservoirs follow the dams on screen: only those held back by a shown dam
    mapCtl.setReservoirFilter(ui.sel || anyFilter()
      ? [...new Set(viewDams.map((d) => d.reservoir_id).filter((id) => id != null))] : null);
    if (ui.sel) {
      mapCtl.setRiverFilter(["==", ["get", "id"], fr ? fr.id : -1], 0);
    } else {
      const parts = [];
      if (f.basin) parts.push(["==", ["get", "basin"], f.basin]);
      if (f.state || damFilterActive()) parts.push(["in", ["get", "id"], ["literal", filteredRivers.map((r) => r.id)]]);
      mapCtl.setRiverFilter(parts.length ? ["all", ...parts] : null, parts.length ? 30 : 150);
    }
    renderFocusBar(fr);

    // url + reset badge
    setQuery({ q: f.q, basin: f.basin, state: f.state, purpose: f.purpose, height: f.height, era: f.era,
               sel: ui.sel ? `${ui.sel.type}:${ui.sel.id}` : "", tab: ui.tab === "rivers" ? "rivers" : "" });
    const n = ["basin", "state", "purpose", "height", "era"].filter((k) => f[k]).length + (f.q.trim().length >= MIN_CHARS ? 1 : 0);
    $("#f-count").hidden = !n; $("#f-count").textContent = n;

    renderPanel();
    if (fit) fitResults();
  }

  function renderFocusBar(fr) {
    const bar = $("#focus-bar");
    bar.hidden = !ui.sel;
    if (!ui.sel) return;
    const d = ui.sel.type === "dam" ? dams.byId.get(ui.sel.id) : null;
    const what = d ? html`<strong>${d.name}</strong>${fr ? html` on the <strong>${fr.name}</strong>` : " (not linked to a river)"}`
      : html`<strong>${fr?.name || "River"}</strong>`;
    mount(bar, html`<span>${raw(icon("target"))} Showing only ${what} · ${plural(viewDams.length, "dam")}</span>
      <span class="focus-actions">
        <button class="btn sm" type="button" id="focus-deselect" title="Clear the selection and keep the current map view">✕ Clear selection</button>
        <button class="btn sm" type="button" id="focus-clear" title="Clear the selection and zoom out to everything">${raw(icon("reset"))} Show everything</button>
      </span>`);
    bar.querySelector("#focus-deselect").addEventListener("click", () => clearSelection({ fit: false }));
    bar.querySelector("#focus-clear").addEventListener("click", () => clearSelection());
  }

  function fitResults() {
    const fr = focusRiver();
    if (ui.sel) {
      const pts = viewDams.map((d) => [d.longitude, d.latitude]);
      const rb = fr ? riverBounds(fr) : null;
      if (rb) pts.push(...rb);
      const b = boundsOf(pts);
      if (b) mapCtl.fitBounds(b, { maxZoom: ui.sel.type === "dam" && !fr ? 11 : 10, padding: 70 });
      return;
    }
    const pts = viewDams.map((d) => [d.longitude, d.latitude]);
    if (!pts.length) viewRivers.slice(0, 500).forEach((r) => { pts.push([r.start_lon, r.start_lat], [r.end_lon, r.end_lat]); });
    const b = anyFilter() ? boundsOf(pts) : INDIA_BOUNDS;
    if (b) mapCtl.fitBounds(b, { maxZoom: 9 });
  }

  // ---------------------------------------------------------------- side panel
  let miniCleanups = [];
  function renderPanel() {
    miniCleanups.forEach((c) => c?.()); miniCleanups = [];
    const D = viewDams, R = viewRivers;
    const large = D.filter((d) => d.is_large_dam).length;
    const storage = d3.sum(D, (d) => d.gross_storage_mcm);
    const totalLen = d3.sum(R, (r) => r.length_km);
    mount($("#kpis"), html`
      ${stat("dam", "Dams", fmt.int(D.length), `${fmt.pct(D.length / dams.list.length)} of all dams`, D.length / dams.list.length)}
      ${stat("height", "Large dams (15 m+)", fmt.int(large), D.length ? `${fmt.pct(large / D.length)} of these` : "-")}
      ${stat("storage", "Gross storage", html`${fmt.compact(storage)}<small>MCM</small>`, `Avg height ${fmt.m(d3.mean(D, (d) => d.height_m))}`)}
      ${stat("river", "Rivers", fmt.int(R.length), `${fmt.compact(totalLen)} km of river`)}`);

    const scope = ui.sel ? "Dams on the selected river" : "Dams matching the filters";
    $("#mini-decades-sub").textContent = scope;
    $("#mini-purpose-sub").textContent = ui.sel ? "Share of the selected river's dams serving each purpose" : "Share of matching dams serving each purpose";

    const byDecade = d3.rollups(D.filter((d) => d.decade), (v) => v.length, (d) => d.decade)
      .sort((a, b) => d3.ascending(a[0], b[0])).map(([label, value]) => ({ label, value }));
    const md = $("#mini-decades");
    if (byDecade.length) miniCleanups.push(columns(md, byDecade, { height: 170, valueName: "Dams completed", labelPeak: true }));
    else mount(md, html`<p class="sel-sub">No dated dams to show.</p>`);

    const byPurpose = d3.rollups(D.flatMap((d) => d.purposes), (v) => v.length, (p) => p)
      .sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([label, n]) => ({ label, value: D.length ? n / D.length : 0, highlight: label === f.purpose,
        extra: [{ label: "Dams", value: fmt.int(n), color: "var(--series-other)" }] }));
    const mp = $("#mini-purpose");
    if (byPurpose.length) miniCleanups.push(hbar(mp, byPurpose, { format: fmt.pct, valueName: "Share of dams", labelWidth: 120, rowHeight: 26,
      highlight: !!f.purpose && !ui.sel, onClick: (d) => { f.purpose = d.label; $("#f-purpose").value = d.label; ui.sel = null; hideCard(); apply({ fit: true }); } }));
    else mount(mp, html`<p class="sel-sub">No dams to show.</p>`);

    renderResults();
  }

  const SORTS = {
    dams: { storage: ["Largest storage", (d) => -(d.gross_storage_mcm ?? -1)], height: ["Tallest", (d) => -(d.height_m ?? 0)],
            newest: ["Newest", (d) => -(d.completion_year ?? 0)], oldest: ["Oldest", (d) => d.completion_year ?? 9999], name: ["Name A-Z", (d) => d.name] },
    rivers: { dams: ["Most dams", (r) => -(riverDamCount.get(r.id) || 0)], length: ["Longest", (r) => -(r.length_km ?? 0)],
              storage: ["Most storage", (r) => -(r.total_storage_mcm ?? 0)], name: ["Name A-Z", (r) => r.name || "~"] },
  };

  function renderSortOptions() {
    const opts = SORTS[ui.tab];
    if (!opts[ui.sort]) ui.sort = Object.keys(opts)[0];
    mount($("#sort"), html`${Object.entries(opts).map(([k, [label]]) => html`<option value="${k}" ${k === ui.sort ? raw("selected") : ""}>${label}</option>`)}`);
  }

  function renderResults() {
    const isDams = ui.tab === "dams";
    const list = isDams ? viewDams : viewRivers;
    const key = SORTS[ui.tab][ui.sort][1];
    const sorted = [...list].sort((a, b) => d3.ascending(key(a), key(b)));
    const shown = sorted.slice(0, ui.shown);
    $("#results-count").textContent = `${fmt.int(list.length)} ${isDams ? "dams" : "rivers"} · showing ${fmt.int(shown.length)}`;
    mount($("#results"), shown.length ? html`${shown.map((x) => isDams ? damItem(x) : riverItem(x))}`
      : html`<div class="empty-state" style="padding:24px"><p>${ui.sel ? (isDams ? "No dams are linked to this river." : "This dam isn't linked to a mapped river.") : "Nothing matches these filters."}</p></div>`);
    $("#more").hidden = shown.length >= sorted.length;
  }

  const damItem = (d) => html`<div class="result ${ui.sel?.type === "dam" && ui.sel.id === d.id ? "active" : ""}" role="listitem" tabindex="0" data-dam="${d.id}">
    <img class="icon" src="${damBadgeURL(purposeGroup(d.purpose_group).slug)}" alt="${d.purpose_group} dam">
    <div><div class="name">${d.name}</div><div class="meta">${[d.nearest_river || d.river_reported, d.state].filter(Boolean).join(" · ")}</div></div>
    <div class="num">${ui.sort === "height" ? fmt.m(d.height_m) : ui.sort === "newest" || ui.sort === "oldest" ? fmt.year(d.completion_year) : fmt.mcm(d.gross_storage_mcm)}
      <small>${ui.sort === "height" ? fmt.year(d.completion_year) : fmt.m(d.height_m)}</small></div></div>`;

  const riverItem = (r) => html`<div class="result ${ui.sel?.type === "river" && ui.sel.id === r.id ? "active" : ""}" role="listitem" tabindex="0" data-river="${r.id}">
    <span class="icon" style="display:grid;place-items:center;color:var(--accent)">${raw(icon("river"))}</span>
    <div><div class="name">${r.name || "Unnamed river"}</div><div class="meta">${[r.basin, r.stateList.slice(0, 2).join(", ")].filter(Boolean).join(" · ")}</div></div>
    <div class="num">${fmt.km(r.length_km)}<small>${plural(riverDamCount.get(r.id) || 0, "dam")}</small></div></div>`;

  // ---------------------------------------------------------------- selection
  function selectDam(d, { fit = true } = {}) {
    ui.sel = { type: "dam", id: d.id };
    ui.tab = "dams"; ui.shown = PAGE; syncTabs();
    const fr = focusRiver();
    mapCtl.highlightRiver(fr, { fit: false });
    mapCtl.selectDam(d, { fly: false });
    apply({ fit });
    const g = purposeGroup(d.purpose_group);
    const el = $("#selection");
    el.hidden = false;
    mount(el, html`<div class="card selection-card">
      <div class="card-head">
        <div style="display:flex;gap:12px;align-items:center">
          <img src="${damBadgeURL(g.slug)}" width="40" height="40" alt="">
          <div><h3>${d.name}</h3><div class="sel-sub">${[d.district, d.state].filter(Boolean).join(", ")}</div></div>
        </div>
        <button class="btn sm ghost" type="button" id="sel-close" aria-label="Close and show everything">✕</button>
      </div>
      ${kv([
        ["River", d.nearest_river || d.river_reported || "Not linked"],
        ["Height", d.height_m != null ? `${fmt.m(d.height_m)} · ${fmt.ordinal(d.height_pct)} percentile` : null],
        ["Storage", d.gross_storage_mcm != null ? `${fmt.mcm(d.gross_storage_mcm)} · ${fmt.ordinal(d.storage_pct)} percentile` : "Not recorded"],
        ["Completed", fmt.year(d.completion_year)],
        ["Purpose", d.purpose || "Not recorded"],
        ["Type", d.dam_type || "Not recorded"],
      ])}
      <div class="chips" style="gap:8px">
        <a class="btn sm primary" href="${damHref(d.id)}">Full profile ${raw(icon("arrow"))}</a>
        ${fr ? html`<button class="btn sm" type="button" id="sel-river">${raw(icon("river"))} About the ${fr.name}</button>` : ""}
        <button class="btn sm" type="button" id="sel-zoom">${raw(icon("target"))} Zoom to dam</button>
      </div></div>`);
    el.querySelector("#sel-close").addEventListener("click", clearSelection);
    el.querySelector("#sel-zoom").addEventListener("click", () => mapCtl.selectDam(d, { fly: true, zoom: 12 }));
    el.querySelector("#sel-river")?.addEventListener("click", () => selectRiver(fr));
    markActive();
  }

  function selectRiver(r, { fit = true } = {}) {
    ui.sel = { type: "river", id: r.id };
    ui.tab = "dams"; ui.shown = PAGE; syncTabs();
    mapCtl.selectDam(null, { fly: false });
    mapCtl.highlightRiver(r, { fit: false });
    apply({ fit });
    const el = $("#selection");
    el.hidden = false;
    mount(el, html`<div class="card selection-card">
      <div class="card-head">
        <div style="display:flex;gap:12px;align-items:center">
          <span style="color:var(--accent);width:40px;height:40px;display:grid;place-items:center;border-radius:12px;background:var(--accent-wash)">${raw(icon("river"))}</span>
          <div><h3>${r.name || "Unnamed river"}</h3><div class="sel-sub">${[r.basin, r.sub_basin].filter(Boolean).join(" › ")}</div></div>
        </div>
        <button class="btn sm ghost" type="button" id="sel-close" aria-label="Close and show everything">✕</button>
      </div>
      ${kv([
        ["Length", `${fmt.km(r.length_km)}${r.len_pct_basin != null ? ` · ${longerThan(r.len_pct_basin).toLowerCase()}` : ""}`],
        ["Flows through", r.stateList.join(", ") || null],
        ["Source", [r.start_district, r.start_state].filter(Boolean).join(", ") || null],
        ["Joins", r.confluence || [r.end_district, r.end_state].filter(Boolean).join(", ") || null],
        ["Dams", plural(r.dam_count, "dam")],
      ])}
      <div class="chips" style="gap:8px">
        <a class="btn sm primary" href="${riverHref(r.id)}">Full profile ${raw(icon("arrow"))}</a>
      </div></div>`);
    el.querySelector("#sel-close").addEventListener("click", clearSelection);
    markActive();
  }

  const hideCard = () => {
    $("#selection").hidden = true;
    mapCtl.highlightRiver(null);
    mapCtl.selectDam(null, { fly: false });
  };

  // fit: false keeps the current map view (the "Clear selection" button)
  function clearSelection({ fit = true } = {}) {
    if (!ui.sel) return;
    ui.sel = null;
    hideCard();
    apply({ fit });
    markActive();
  }

  function markActive() {
    root.querySelectorAll(".result").forEach((el) => el.classList.toggle("active",
      (ui.sel?.type === "dam" && el.dataset.dam === ui.sel.id) || (ui.sel?.type === "river" && Number(el.dataset.river) === ui.sel.id)));
  }

  // ---------------------------------------------------------------- events
  const results = $("#results");
  const activate = (el) => {
    if (!el) return;
    if (el.dataset.dam) selectDam(dams.byId.get(el.dataset.dam));
    else selectRiver(rivers.byId.get(Number(el.dataset.river)));
  };
  results.addEventListener("click", (e) => activate(e.target.closest(".result")));
  results.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(e.target.closest(".result")); } });
  $("#more").addEventListener("click", () => { ui.shown += PAGE; renderResults(); });
  $("#sort").addEventListener("change", (e) => { ui.sort = e.target.value; ui.shown = PAGE; renderResults(); });

  function syncTabs() {
    root.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tab === ui.tab)));
    renderSortOptions();
  }
  root.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
    ui.tab = b.dataset.tab; ui.shown = PAGE; syncTabs(); renderResults();
    setQuery({ ...Object.fromEntries(new URLSearchParams(location.hash.split("?")[1] || "")), tab: ui.tab === "rivers" ? "rivers" : "" });
  }));

  const leaveFocus = () => { if (ui.sel) { ui.sel = null; hideCard(); } };
  const bind = (id, k) => $(id).addEventListener("change", (e) => {
    f[k] = e.target.value; ui.shown = PAGE; const was = !!ui.sel; leaveFocus();
    apply({ fit: was || k === "basin" || k === "state" });
  });
  bind("#f-basin", "basin"); bind("#f-state", "state"); bind("#f-purpose", "purpose"); bind("#f-height", "height"); bind("#f-era", "era");
  // Typing (4+ letters) filters the list; picking a suggestion selects it directly.
  $("#f-q").addEventListener("input", debounce((e) => {
    const was = f.q.trim().length >= MIN_CHARS, now = e.target.value.trim().length >= MIN_CHARS;
    f.q = e.target.value;
    if (was || now) { ui.shown = PAGE; leaveFocus(); apply(); }
  }, 220));
  const ac = attachAutocomplete($("#f-q"), {
    onPick: (m) => {
      f.q = "";
      if (m.type === "river") { apply(); selectRiver(m.item); }
      else if (m.type === "dam") { apply(); selectDam(m.item); }
      else {
        f[m.type] = m.label;                       // "state" or "basin"
        $(`#f-${m.type}`).value = m.label;
        ui.shown = PAGE; leaveFocus(); apply({ fit: true });
      }
    },
  });
  cleanups.push(() => ac.destroy());
  $("#f-reset").addEventListener("click", () => {
    Object.assign(f, { q: "", basin: "", state: "", purpose: "", height: "", era: "" });
    root.querySelectorAll("#filters select, #filters input").forEach((el) => { el.value = ""; });
    leaveFocus();
    apply({ fit: true });
  });

  syncTabs();
  apply();
  mapCtl.ready.then(() => {
    // restore a selection from the URL (?sel=river:12 / ?sel=dam:ID, or ?river=12 from profile pages)
    const r = initialSel?.type === "river" ? rivers.byId.get(initialSel.id) : null;
    const d = initialSel?.type === "dam" ? dams.byId.get(initialSel.id) : null;
    if (r) selectRiver(r);
    else if (d) selectDam(d);
    else if (anyFilter()) fitResults();
  });

  return () => { miniCleanups.forEach((c) => c?.()); cleanups.forEach((c) => c?.()); };
}
