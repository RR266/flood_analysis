// Step 3 of the journey - full profiles for a river or a dam.
import * as d3 from "d3";
import { html, raw, mount, fmt, storage, riverHref, damHref, longerThan, plural, rankPhrase } from "../util.js";
import { getDams, getRivers, getSummary, purposeGroup, PURPOSE_GROUPS } from "../data.js";
import { icon, damBadgeURL } from "../icons.js";
import { createMap, riverBounds } from "../map.js";
import { scatter, distribution, legend, tableToggle } from "../charts.js";
import { stat, breadcrumb } from "../components.js";
import { ttRows } from "../tooltip.js";
import { attachAutocomplete, ensureIndex, MIN_CHARS } from "../search.js";

export async function render(root, route) {
  const [kind, id] = route.rest;
  if (kind === "river" && id) return renderRiver(root, Number(id));
  if (kind === "dam" && id) return renderDam(root, id);
  return renderPicker(root);
}

// ------------------------------------------------------------------ recently viewed
function remember(item) {
  let list = [];
  try { list = JSON.parse(storage("rd-recent") || "[]"); } catch (e) { list = []; }
  list = [item, ...list.filter((x) => !(x.type === item.type && x.id === item.id))].slice(0, 6);
  storage("rd-recent", JSON.stringify(list));
}
function recent() {
  try { return JSON.parse(storage("rd-recent") || "[]"); } catch (e) { return []; }
}

const notFound = (root, what) => mount(root, html`<div class="container empty-state">
  <h2>${what} not found</h2><p>It may have been removed from the dataset.</p>
  <p style="margin-top:14px"><a class="btn" href="#/details">Pick another</a></p></div>`);

// ------------------------------------------------------------------ picker
async function renderPicker(root) {
  const s = await getSummary();
  const rec = recent();
  mount(root, html`
  <div class="page container picker">
    <div class="page-head"><div>
      ${breadcrumb([{ label: "Overview", href: "#/overview" }, { label: "Explore", href: "#/explore" }, { label: "Details" }])}
      <h1>Pick a river, dam or state</h1>
      <p>Each profile follows the river from source to mouth or opens a dam's full specification, with comparisons against the rest of India.</p>
    </div></div>
    <div class="card">
      <div class="picker-search"><input id="pick-q" type="search" placeholder="Type at least ${MIN_CHARS} letters of a river, dam, state or basin…"
        aria-label="Search rivers, dams, states and basins" autofocus></div>
    </div>
    ${rec.length ? html`<div class="card"><div class="card-head"><div><h3>Recently viewed</h3></div></div>
      <div class="chips">${rec.map((r) => html`<a class="chip" href="${r.type === "river" ? riverHref(r.id) : damHref(r.id)}">${raw(icon(r.type === "river" ? "river" : "dam", ""))}${r.name}</a>`)}</div></div>` : ""}
    <div class="grid g-4">
      ${featured("Longest rivers", s.longest_rivers.slice(0, 6), (r) => riverHref(r.river_id), (r) => r.river_name, (r) => r.basin, (r) => fmt.km(r.length_km))}
      ${featured("Most dammed rivers", s.top_dammed_rivers.slice(0, 6), (r) => riverHref(r.river_id), (r) => r.river_name, (r) => r.basin, (r) => plural(r.dam_count, "dam"))}
      ${featured("Tallest dams", s.tallest_dams.slice(0, 6), (d) => damHref(d.dam_id), (d) => d.dam_name, (d) => d.state, (d) => fmt.m(d.height_m))}
      ${featured("Largest reservoirs", s.largest_reservoirs.slice(0, 6), (d) => damHref(d.dam_id), (d) => d.dam_name, (d) => d.state, (d) => fmt.compact(d.gross_storage_mcm) + " MCM")}
    </div>
  </div>`);

  // rivers/dams open their profile; states/basins open Explore filtered to them
  const ac = attachAutocomplete(root.querySelector("#pick-q"));
  ensureIndex();
  return () => ac.destroy();
}

const featured = (title, rows, href, name, sub, num) => html`<div class="card">
  <div class="card-head"><div><h3>${title}</h3></div></div>
  <ol class="rank-list">${rows.map((r) => html`<li><a href="${href(r)}"><span><span class="name">${name(r)}</span><span class="meta">${sub(r)}</span></span>
    <span class="num">${num(r)}</span></a></li>`)}</ol></div>`;

// ------------------------------------------------------------------ river profile
async function renderRiver(root, id) {
  const [rivers, dams] = await Promise.all([getRivers(), getDams()]);
  const r = rivers.byId.get(id);
  if (!r) return notFound(root, "River");
  remember({ type: "river", id: r.id, name: r.name || "Unnamed river" });

  const onRiver = dams.list.filter((d) => d.river_id === r.id).sort((a, b) => d3.ascending(a.completion_year ?? 9999, b.completion_year ?? 9999));
  const basinRivers = rivers.list.filter((x) => x.basin === r.basin);
  const siblings = rivers.list.filter((x) => x.sub_basin === r.sub_basin && x.id !== r.id && x.name)
    .sort((a, b) => b.length_km - a.length_km).slice(0, 8);
  const tribs = (r.major_tributaries || "").split(/[,/]/).map((t) => t.trim()).filter(Boolean);
  const storageSum = d3.sum(onRiver, (d) => d.gross_storage_mcm);
  const place = (...p) => p.filter(Boolean).join(", ");

  mount(root, html`
  <div class="page container">
    ${breadcrumb([{ label: "Overview", href: "#/overview" }, { label: "Explore", href: `#/explore?basin=${encodeURIComponent(r.basin || "")}` }, { label: r.name || "River" }])}
    <div class="profile-head" style="margin-top:12px">
      <div class="profile-title">
        <span class="icon" style="display:grid;place-items:center;border-radius:16px;background:var(--accent-wash);color:var(--accent)">${raw(icon("river"))}</span>
        <div><div class="eyebrow">River profile</div><h1>${r.name || "Unnamed river"}</h1>
          <p>${[r.basin && `${r.basin} basin`, r.sub_basin].filter(Boolean).join(" › ")}${r.alt_name ? ` · also known as ${r.alt_name}` : ""}</p></div>
      </div>
      <div class="chips" style="gap:8px">
        <a class="btn" href="#/explore?river=${r.id}">${raw(icon("map"))} Open in Explore</a>
        <a class="btn" href="#/details">${raw(icon("back"))} Pick another</a>
      </div>
    </div>

    <section class="grid g-6" aria-label="Key figures">
      ${stat("ruler", "Length", fmt.km(r.length_km), longerThan(r.len_pct_basin, `${r.basin} basin rivers`), r.len_pct_basin)}
      ${stat("dam", "Dams on this river", fmt.int(r.dam_count), `${fmt.int(r.large_dam_count)} are 15 m or taller`)}
      ${stat("storage", "Gross storage", html`${fmt.compact(storageSum)}<small>MCM</small>`, onRiver.length ? "Across its dams" : "No dams")}
      ${stat("height", "Tallest dam", r.tallest_dam_m != null ? fmt.m(r.tallest_dam_m) : "-", onRiver.length ? (d3.greatest(onRiver, (d) => d.height_m)?.name || "") : "")}
      ${stat("target", "Dams per 100 km", r.dams_per_100km != null ? fmt.num1(r.dams_per_100km) : "-", "Dam density along the course")}
      ${stat("state", "States", fmt.int(r.stateList.length), r.is_interstate ? "Interstate river" : "Within one state")}
    </section>

    <div class="detail-layout" style="margin-top:16px">
      <div class="card mini-map"><div class="map" id="detail-map"></div></div>
      <div class="card">
        <div class="card-head"><div><h3>From source to mouth</h3><p>The flow on the map runs the same way</p></div></div>
        <div class="journey">
          <div class="end"><h4>${raw(icon("source"))} Source</h4>
            <div class="place">${r.start_village || r.start_subdistrict || r.start_district || "Not recorded"}</div>
            <div class="sub">${place(r.start_subdistrict !== r.start_village ? r.start_subdistrict : null, r.start_district, r.start_state)}</div>
            ${r.start_lat != null ? html`<div class="sub">${r.start_lat.toFixed(3)}°N, ${r.start_lon.toFixed(3)}°E</div>` : ""}</div>
          <div class="arrow" aria-hidden="true"><svg viewBox="0 0 40 24"><path d="M2 12h34M30 6l6 6-6 6"/></svg></div>
          <div class="end"><h4>${raw(icon("mouth"))} Mouth</h4>
            <div class="place">${r.confluence ? `Joins ${r.confluence}` : r.end_village || r.end_district || "Not recorded"}</div>
            <div class="sub">${place(r.end_village, r.end_district, r.end_state)}</div>
            ${r.end_lat != null ? html`<div class="sub">${r.end_lat.toFixed(3)}°N, ${r.end_lon.toFixed(3)}°E</div>` : ""}</div>
        </div>
        <table class="spec-table" style="margin-top:14px">
          ${r.origin ? html`<tr><th>Origin</th><td>${r.origin}</td></tr>` : ""}
          <tr><th>Flows through</th><td><div class="chips">${r.stateList.length ? r.stateList.map((st) => html`<a class="chip" href="#/explore?state=${encodeURIComponent(st)}">${st}</a>`) : "-"}</div></td></tr>
          ${tribs.length ? html`<tr><th>Major tributaries</th><td><div class="chips">${tribs.map((t) => html`<span class="chip">${t}</span>`)}</div></td></tr>` : ""}
          <tr><th>Length band</th><td>${r.length_band || "-"}</td></tr>
          <tr><th>River ID</th><td>${r.id}</td></tr>
        </table>
      </div>
    </div>

    <div class="grid g-3" style="margin-top:16px;align-items:start">
      <div class="card span-2" id="dams-card">
        <div class="card-head"><div><h3>Dams on the ${r.name || "river"}, by year and height</h3>
          <p>${onRiver.length ? `${onRiver.length} dams within 5 km of its course. Click a dot for the dam's profile.` : "No dams were linked to this river."}</p></div>
          <div class="card-actions"></div></div>
        ${onRiver.length ? html`${legend(PURPOSE_GROUPS.filter((g) => onRiver.some((d) => d.purpose_group === g.key)).map((g) => ({ label: g.key, color: `var(${g.cssVar})` })))}
          <div class="chart" id="dam-scatter"></div>` : html`<div class="empty-state" style="padding:24px">
          <p>Explore the ${r.basin || ""} basin to see dams on neighbouring rivers.</p>
          <p style="margin-top:12px"><a class="btn" href="#/explore?basin=${encodeURIComponent(r.basin || "")}">Explore the basin</a></p></div>`}
      </div>
      <div class="card">
        <div class="card-head"><div><h3>How long is it?</h3><p>All ${fmt.int(basinRivers.length)} rivers in the ${r.basin} basin (log scale)</p></div></div>
        <div class="chart" id="len-dist"></div>
        <h3 style="font-size:15px;margin:18px 0 6px">Other rivers in ${r.sub_basin || "this sub-basin"}</h3>
        <ol class="rank-list">${siblings.map((x) => html`<li><a href="${riverHref(x.id)}"><span><span class="name">${x.name}</span>
          <span class="meta">${plural(x.dam_count, "dam")}</span></span><span class="num">${fmt.km(x.length_km)}</span></a></li>`)}</ol>
      </div>
    </div>
  </div>`);

  const cleanups = [];
  const mapCtl = createMap(root.querySelector("#detail-map"), {
    // focused: only this river and its dams
    rivers: true, riverFilter: ["==", ["get", "id"], r.id], dams: onRiver, cluster: false, compact: true, flowMin: 0, cooperative: true,
    bounds: riverBounds(r) || undefined,
    damLookup: (x) => dams.byId.get(x), riverLookup: (x) => rivers.byId.get(x),
    onDamClick: (d) => { location.hash = damHref(d.id); },
    onRiverClick: (p) => { if (p.id !== r.id) location.hash = riverHref(p.id); },
  });
  mapCtl.highlightRiver(r);
  cleanups.push(() => mapCtl.destroy());

  if (onRiver.length) {
    const pts = onRiver.filter((d) => d.completion_year != null && d.height_m != null).map((d) => ({
      x: d.completion_year, y: d.height_m, cls: purposeGroup(d.purpose_group).cls, href: damHref(d.id), d,
    }));
    if (pts.length) {
      cleanups.push(scatter(root.querySelector("#dam-scatter"), pts, {
        yLabel: "Height (m)", xLabel: "Year completed", yFormat: (v) => v, height: 340,
        tip: (p) => html`<div class="tt-head"><img src="${damBadgeURL(purposeGroup(p.d.purpose_group).slug, 56)}" alt="">
          <div><div class="tt-title">${p.d.name}</div><div class="tt-sub">${[p.d.district, p.d.state].filter(Boolean).join(", ")}</div></div></div>
          ${ttRows([{ label: "Height", value: fmt.m(p.y), color: `var(${purposeGroup(p.d.purpose_group).cssVar})` },
                    { label: "Completed", value: String(p.x), color: "var(--series-other)" },
                    { label: "Storage", value: fmt.mcm(p.d.gross_storage_mcm), color: "var(--series-other)" }])}
          <div class="tt-foot">Click to open profile</div>`,
      }));
    }
    tableToggle(root.querySelector("#dams-card"), root.querySelector("#dam-scatter"),
      [{ key: "name", label: "Dam" }, { key: "completion_year", label: "Year", num: true, format: fmt.year },
       { key: "height_m", label: "Height m", num: true, format: fmt.num1 }, { key: "gross_storage_mcm", label: "Storage MCM", num: true, format: fmt.num1 },
       { key: "purpose", label: "Purpose" }], onRiver);
  }

  cleanups.push(distribution(root.querySelector("#len-dist"), basinRivers.map((x) => x.length_km), r.length_km,
    { log: true, format: (v) => fmt.km(v), markerLabel: r.name || "This river", unitName: "Rivers in range", height: 130 }));

  return () => cleanups.forEach((c) => c?.());
}

// ------------------------------------------------------------------ dam profile
async function renderDam(root, id) {
  const [dams, rivers] = await Promise.all([getDams(), getRivers()]);
  const d = dams.byId.get(id);
  if (!d) return notFound(root, "Dam");
  remember({ type: "dam", id: d.id, name: d.name });

  const g = purposeGroup(d.purpose_group);
  const river = d.river_id != null ? rivers.byId.get(d.river_id) : null;
  const sameRiver = river ? dams.list.filter((x) => x.river_id === river.id && x.id !== d.id)
    .sort((a, b) => d3.ascending(a.completion_year ?? 9999, b.completion_year ?? 9999)) : [];
  const sameDecade = d.decade ? dams.list.filter((x) => x.state === d.state && x.decade === d.decade && x.id !== d.id) : [];
  const v = (x, f) => (x == null ? "Not recorded" : f(x));

  mount(root, html`
  <div class="page container">
    ${breadcrumb([{ label: "Overview", href: "#/overview" }, { label: "Explore", href: `#/explore?state=${encodeURIComponent(d.state || "")}` },
      ...(river ? [{ label: river.name, href: riverHref(river.id) }] : []), { label: d.name }])}
    <div class="profile-head" style="margin-top:12px">
      <div class="profile-title">
        <img class="icon" src="${damBadgeURL(g.slug, 112)}" alt="${g.key} dam">
        <div><div class="eyebrow">Dam profile</div><h1>${d.name}</h1>
          <p>${[d.nearest_river ? `On the ${d.nearest_river}` : d.river_reported, d.district, d.state].filter(Boolean).join(" · ")}</p>
          <div class="chips" style="margin-top:10px">${d.purposes.map((p) => html`<span class="chip"><span class="dot" style="background:var(${purposeGroup(PURPOSE_GROUPS.some((x) => x.key === p) ? p : "Other").cssVar})"></span>${p}</span>`)}
            ${d.storage_suspect ? html`<span class="badge-warn">${raw(icon("alert"))} Recorded storage looks wrong; left out of totals</span>` : ""}</div>
        </div>
      </div>
      <div class="chips" style="gap:8px">
        ${river ? html`<a class="btn" href="${riverHref(river.id)}">${raw(icon("river"))} River profile</a>` : ""}
        <a class="btn" href="#/explore?state=${encodeURIComponent(d.state || "")}">${raw(icon("map"))} Dams in ${d.state}</a>
      </div>
    </div>

    <section class="grid g-6" aria-label="Key figures">
      ${stat("height", "Height", fmt.m(d.height_m), rankPhrase(d.height_pct, "Taller than", "dams", "The tallest dam in the dataset"), d.height_pct)}
      ${stat("storage", "Gross storage", d.gross_storage_mcm != null ? html`${fmt.compact(d.gross_storage_mcm)}<small>MCM</small>` : "-",
        d.storage_pct != null ? rankPhrase(d.storage_pct, "More than", "reservoirs", "The largest reservoir in the dataset") : "Not recorded", d.storage_pct)}
      ${stat("calendar", "Completed", fmt.year(d.completion_year), d.era || "")}
      ${stat("ruler", "Dam length", d.length_m != null ? fmt.compact(d.length_m) + " m" : "-", d.length_pct != null ? `${fmt.ordinal(d.length_pct)} percentile` : "Not recorded")}
      ${stat("other", "Spillway capacity", d.spillway_capacity_cumecs != null ? html`${fmt.compact(d.spillway_capacity_cumecs)}<small>m³/s</small>` : "-",
        d.spillway_pct != null ? `${fmt.ordinal(d.spillway_pct)} percentile` : "Not recorded")}
      ${stat("target", "Distance to river", d.distance_to_river_m != null ? fmt.m(d.distance_to_river_m) : "-", d.river_match || "")}
    </section>

    <div class="detail-layout" style="margin-top:16px">
      <div class="card mini-map"><div class="map" id="detail-map"></div></div>
      <div class="card">
        <div class="card-head"><div><h3>Specifications</h3><p>As recorded in the national register</p></div></div>
        <table class="spec-table">
          <tr><th>Dam ID</th><td>${d.id}</td></tr>
          <tr><th>Type</th><td>${d.dam_type || "Not recorded"}</td></tr>
          <tr><th>Purpose</th><td>${d.purpose || "Not recorded"}</td></tr>
          <tr><th>River (as reported)</th><td>${d.river_reported || "Not recorded"}</td></tr>
          <tr><th>Nearest mapped river</th><td>${river ? html`<a href="${riverHref(river.id)}">${river.name}</a>` : "None within 5 km"}</td></tr>
          <tr><th>Basin</th><td>${d.river_basin || d.basin_reported || "-"}${d.river_sub_basin ? ` › ${d.river_sub_basin}` : ""}</td></tr>
          <tr><th>Max water level</th><td>${v(d.max_water_level_m, fmt.m)}</td></tr>
          <tr><th>Full reservoir level</th><td>${v(d.full_reservoir_level_m, fmt.m)}</td></tr>
          ${d.storage_suspect ? html`<tr><th>Storage as recorded</th><td>${fmt.mcm(d.gross_storage_mcm_raw)}</td></tr>` : ""}
          <tr><th>In charge</th><td>${d.incharge || "-"}</td></tr>
          <tr><th>Dam safety org.</th><td>${d.sdso || "-"}</td></tr>
          <tr><th>Coordinates</th><td>${d.latitude_dms || d.latitude}, ${d.longitude_dms || d.longitude}</td></tr>
        </table>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-head"><div><h3>How it compares with India's ${fmt.int(dams.list.length)} dams</h3>
        <p>Each histogram shows every dam (log scale); the highlighted bar and line mark ${d.name}</p></div></div>
      <div class="grid g-4">
        <div><strong style="font-size:13.5px">Height</strong><div class="chart" id="cmp-height"></div></div>
        <div><strong style="font-size:13.5px">Gross storage</strong><div class="chart" id="cmp-storage"></div></div>
        <div><strong style="font-size:13.5px">Dam length</strong><div class="chart" id="cmp-length"></div></div>
        <div><strong style="font-size:13.5px">Spillway capacity</strong><div class="chart" id="cmp-spill"></div></div>
      </div>
    </div>

    <div class="grid g-2" style="margin-top:16px">
      <div class="card">
        <div class="card-head"><div><h3>Other dams on the ${river?.name || "same river"}</h3>
          <p>${river ? `${sameRiver.length} more, in order of completion` : "This dam is not linked to a mapped river"}</p></div></div>
        <ol class="rank-list">${sameRiver.slice(0, 10).map((x) => html`<li><a href="${damHref(x.id)}"><span><span class="name">${x.name}</span>
          <span class="meta">${x.district || x.state} · ${x.purpose || "-"}</span></span><span class="num">${fmt.year(x.completion_year)}<small>${fmt.m(x.height_m)}</small></span></a></li>`)}</ol>
        ${sameRiver.length > 10 ? html`<a class="btn sm" style="margin-top:8px" href="#/explore?river=${river.id}">See all ${sameRiver.length} on the map</a>` : ""}
      </div>
      <div class="card">
        <div class="card-head"><div><h3>Built in the same decade in ${d.state}</h3>
          <p>${d.decade ? `${fmt.int(sameDecade.length)} other dams completed in the ${d.decade}; the tallest:` : "Completion year not recorded"}</p></div></div>
        <ol class="rank-list">${[...sameDecade].sort((a, b) => (b.height_m || 0) - (a.height_m || 0)).slice(0, 8).map((x) => html`<li><a href="${damHref(x.id)}">
          <span><span class="name">${x.name}</span><span class="meta">${x.nearest_river || x.district || "-"}</span></span>
          <span class="num">${fmt.m(x.height_m)}<small>${fmt.year(x.completion_year)}</small></span></a></li>`)}</ol>
      </div>
    </div>
  </div>`);

  const cleanups = [];
  const mapCtl = createMap(root.querySelector("#detail-map"), {
    // focused: only this dam, its river and the other dams on that river
    rivers: true, riverFilter: ["==", ["get", "id"], river ? river.id : -1], dams: [d, ...sameRiver],
    cluster: false, compact: true, flowMin: 0, cooperative: true,
    view: d.longitude != null ? { center: [d.longitude, d.latitude], zoom: 9 } : undefined,
    damLookup: (x) => dams.byId.get(x), riverLookup: (x) => rivers.byId.get(x),
    onDamClick: (x) => { if (x.id !== d.id) location.hash = damHref(x.id); },
    onRiverClick: (p) => { location.hash = riverHref(p.id); },
  });
  if (river) mapCtl.highlightRiver(river, { fit: false });
  mapCtl.selectDam(d, { fly: false });
  cleanups.push(() => mapCtl.destroy());

  const cmp = (sel, key, val, format) => cleanups.push(distribution(root.querySelector(sel), dams.list.map((x) => x[key]), val,
    { log: true, format, markerLabel: "This dam", unitName: "Dams in range", height: 120 }));
  cmp("#cmp-height", "height_m", d.height_m, (x) => fmt.m(x));
  cmp("#cmp-storage", "gross_storage_mcm", d.gross_storage_mcm, (x) => `${fmt.compact(x)} MCM`);
  cmp("#cmp-length", "length_m", d.length_m, (x) => `${fmt.compact(x)} m`);
  cmp("#cmp-spill", "spillway_capacity_cumecs", d.spillway_capacity_cumecs, (x) => `${fmt.compact(x)} m³/s`);

  return () => cleanups.forEach((c) => c?.());
}
