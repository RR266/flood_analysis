// Step 1 of the journey - the big picture, told as a short story with charts.
import { html, raw, mount, fmt, riverHref, damHref, plural } from "../util.js";
import { getSummary, getDams } from "../data.js";
import { icon, damBadgeURL } from "../icons.js";
import { createMap } from "../map.js";
import { hbar, columns, areaLine, tableToggle } from "../charts.js";
import { stat, story } from "../components.js";

export async function render(root) {
  const s = await getSummary();
  const k = s.kpis;
  const cleanups = [];

  const decades = s.decades.filter((d) => d.decade);
  const peak = decades.reduce((a, b) => (b.dams_completed > a.dams_completed ? b : a));
  const sinceIndep = decades.filter((d) => parseInt(d.decade) >= 1950).reduce((t, d) => t + d.dams_completed, 0);
  const datedDams = decades.reduce((t, d) => t + d.dams_completed, 0);
  const topBasin = [...s.basins].sort((a, b) => b.dam_count - a.dam_count)[0];
  const densest = [...s.basins].filter((b) => b.total_river_length_km > 5000).sort((a, b) => b.dams_per_1000km - a.dams_per_1000km)[0];
  const irrig = s.purposes.find((p) => p.purpose === "Irrigation");
  const topState = s.states[0];
  const storageBcm = k.storage_mcm / 1000;
  const res = s.reservoirs, rk = res.kpis;
  const small = res.size_classes.filter((c) => ["<10 ha", "10-50 ha", "50-100 ha"].includes(c.area_class));
  const smallShare = small.reduce((t, c) => t + c.pct_of_reservoirs, 0) / 100;
  const smallArea = small.reduce((t, c) => t + c.pct_of_area, 0) / 100;
  const topResBasins = res.basins.slice(0, 3);

  mount(root, html`
  <div class="page container">
    <section class="hero" aria-label="Introduction">
      <div class="hero-map" id="hero-map"></div>
      <div class="hero-overlay"></div>
      <div class="hero-content">
        <div class="eyebrow">India's rivers &amp; dams</div>
        <h1>Where India's rivers run, and where they're held back</h1>
        <div class="hero-figure">${fmt.int(k.dam_count)}</div>
        <div class="hero-figure-label">dams across ${fmt.int(k.river_count)} river reaches in ${k.basins} basins</div>
        <p class="lead">Follow the water from source to sea. See which rivers carry the most dams,
          when the reservoirs were built, and what each one is for.</p>
        <div class="hero-cta">
          <a class="btn primary" href="#/explore">${raw(icon("map"))} Explore the map</a>
          <a class="btn" href="${riverHref(s.longest_rivers[0].river_id)}">${raw(icon("river"))} Follow the ${s.longest_rivers[0].river_name}</a>
        </div>
      </div>
      <div class="hero-legend" aria-label="Map legend">
        <div class="map-legend" style="position:static;background:none;border:0;padding:0;backdrop-filter:none">
          <div class="row"><span class="flow"></span>River flow, source → mouth</div>
          <div class="row"><img src="${damBadgeURL("irrigation")}" alt="">Irrigation dam</div>
          <div class="row"><img src="${damBadgeURL("hydropower")}" alt="">Hydropower dam</div>
        </div>
      </div>
    </section>

    <section class="grid g-6 kpi-row" aria-label="Key figures">
      ${stat("river", "River reaches", fmt.int(k.river_count), `${fmt.int(k.interstate_rivers)} cross state lines`)}
      ${stat("ruler", "Total river length", html`${fmt.compact(k.river_length_km)}<small>km</small>`, `${fmt.int(k.river_length_km)} km mapped`)}
      ${stat("dam", "Large dams (15 m+)", fmt.int(k.large_dam_count), `${fmt.pct(k.large_dam_count / k.dam_count)} of all dams`, k.large_dam_count / k.dam_count)}
      ${stat("storage", "Gross storage", html`${fmt.num1(storageBcm)}<small>BCM</small>`, `${fmt.int(k.storage_mcm)} million m³`)}
      ${stat("target", "Rivers with a dam", `${k.pct_rivers_dammed}%`, `${fmt.int(k.rivers_with_dams)} of ${fmt.int(k.river_count)}`, k.pct_rivers_dammed / 100)}
      ${stat("calendar", "Median year completed", String(k.median_year), `Tallest: ${fmt.m(k.tallest_dam_m)}`)}
    </section>

    ${story(1, "The network: 23 basins, very different loads",
      "Every reach in the dataset belongs to a basin. Switch the measure to compare how much river each basin has against how intensively it has been dammed. Click a basin to explore it on the map.")}
    <div class="grid g-3">
      <div class="card span-2" id="basin-card">
        <div class="card-head"><div><h3 id="basin-title">Dams by basin</h3><p id="basin-sub">Count of dams linked to a river in each basin</p></div>
          <div class="card-actions">
            <div class="seg" role="group" aria-label="Basin measure">
              <button type="button" data-m="dam_count" aria-pressed="true">Dams</button>
              <button type="button" data-m="dams_per_1000km" aria-pressed="false">Per 1,000 km</button>
              <button type="button" data-m="total_river_length_km" aria-pressed="false">River km</button>
              <button type="button" data-m="total_storage_mcm" aria-pressed="false">Storage</button>
              <button type="button" data-m="reservoir_area_km2" aria-pressed="false">Water surface</button>
            </div>
          </div>
        </div>
        <div class="chart" id="basin-chart"></div>
        <div class="insight">${raw(icon("info"))}<span><strong>${topBasin.basin}</strong> has the most dams (${fmt.int(topBasin.dam_count)}).
          Relative to its river length, <strong>${densest.basin}</strong> is the most heavily dammed: ${fmt.num1(densest.dams_per_1000km)} dams per 1,000 km.</span></div>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>Longest rivers</h3><p>Open a river to follow it from source to mouth</p></div></div>
        <ol class="rank-list">${s.longest_rivers.map((r) => html`<li><a href="${riverHref(r.river_id)}">
          <span><span class="name">${r.river_name}</span><span class="meta">${r.basin} · ${plural((r.states || "").split(",").filter(Boolean).length, "state")}</span></span>
          <span class="num">${fmt.km(r.length_km)}<small>${plural(r.dam_count, "dam")}</small></span></a></li>`)}</ol>
      </div>
    </div>

    ${story(2, "A century of building",
      `Most dams with a known completion date were finished after Independence. Construction peaked in the ${peak.decade}.`)}
    <div class="grid g-2">
      <div class="card" id="decade-card">
        <div class="card-head"><div><h3>Dams completed per decade</h3><p>${fmt.int(datedDams)} dams with a recorded completion year</p></div><div class="card-actions"></div></div>
        <div class="chart" id="decade-chart"></div>
        <div class="insight">${raw(icon("info"))}<span><strong>${fmt.pct(sinceIndep / datedDams)}</strong> of dated dams were completed in 1950 or later.
          The ${peak.decade} alone added <strong>${fmt.int(peak.dams_completed)}</strong>.</span></div>
      </div>
      <div class="card" id="storage-card">
        <div class="card-head"><div><h3>Cumulative gross storage</h3><p>Million cubic metres (MCM) held behind dams completed by each decade</p></div><div class="card-actions"></div></div>
        <div class="chart" id="storage-chart"></div>
        <div class="insight">${raw(icon("info"))}<span>Storage keeps rising even as fewer dams are built, because recent dams are larger.</span></div>
      </div>
    </div>

    ${story(3, "Where they are and why they were built",
      `${topState.state} alone has ${fmt.int(topState.dam_count)} dams, ${fmt.pct(topState.dam_count / k.dam_count)} of the national total. Most dams serve more than one purpose, and irrigation is the main one.`)}
    <div class="grid g-2">
      <div class="card" id="state-card">
        <div class="card-head"><div><h3>Top 12 states by number of dams</h3><p>Click a state to filter the map</p></div><div class="card-actions"></div></div>
        <div class="chart" id="state-chart"></div>
      </div>
      <div class="card" id="purpose-card">
        <div class="card-head"><div><h3>Share of dams serving each purpose</h3><p>A dam can serve several purposes, so shares add up to more than 100%</p></div><div class="card-actions"></div></div>
        <div class="chart" id="purpose-chart"></div>
        <div class="insight">${raw(icon("info"))}<span><strong>${fmt.pct(irrig.dam_count / k.dam_count)}</strong> of dams list irrigation as a purpose.</span></div>
      </div>
    </div>

    ${story(4, "How big are they?",
      "Most dams are modest earthen embankments of 15-30 m. A few giants hold most of the water.")}
    <div class="grid g-3">
      <div class="card" id="height-card">
        <div class="card-head"><div><h3>Dams by height</h3><p>15 m and taller counts as a large dam (ICOLD)</p></div><div class="card-actions"></div></div>
        <div class="chart" id="height-chart"></div>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>Tallest dams</h3><p>Height above the lowest foundation</p></div></div>
        <ol class="rank-list">${s.tallest_dams.slice(0, 6).map((d) => html`<li><a href="${damHref(d.dam_id)}">
          <span><span class="name">${d.dam_name}</span><span class="meta">${d.nearest_river || "-"} · ${d.state}</span></span>
          <span class="num">${fmt.m(d.height_m)}<small>${fmt.year(d.completion_year)}</small></span></a></li>`)}</ol>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>Largest reservoirs</h3><p>Gross storage capacity</p></div></div>
        <ol class="rank-list">${s.largest_reservoirs.slice(0, 6).map((d) => html`<li><a href="${damHref(d.dam_id)}">
          <span><span class="name">${d.dam_name}</span><span class="meta">${d.nearest_river || "-"} · ${d.state}</span></span>
          <span class="num">${fmt.mcm(d.gross_storage_mcm)}<small>${fmt.year(d.completion_year)}</small></span></a></li>`)}</ol>
      </div>
    </div>

    ${story(5, "The water behind the dams",
      `${fmt.int(rk.reservoir_count)} mapped reservoirs cover ${fmt.int(rk.area_km2)} km². Most are small irrigation tanks, but a handful of giants hold most of the water surface.`)}
    <section class="grid g-3 kpi-row" aria-label="Reservoir figures">
      ${stat("storage", "Reservoir water surface", html`${fmt.int(rk.area_km2)}<small>km²</small>`, `${fmt.int(rk.reservoir_count)} reservoirs · median ${fmt.area(rk.median_area_ha)}`)}
      ${stat("target", "Held by the largest 1%", `${Math.round(rk.top1pct_area_share)}%`, `of all reservoir area, in ${fmt.int(Math.max(1, Math.floor(rk.reservoir_count / 100)))} reservoirs`, rk.top1pct_area_share / 100)}
      ${stat("height", "Typical average depth", fmt.m(rk.median_mean_depth_m), "Storage ÷ surface area: wide and shallow")}
    </section>
    <div class="grid g-3">
      <div class="card span-2" id="ressize-card">
        <div class="card-head"><div><h3>Share of water surface by reservoir size</h3><p>Hover a bar to compare with the share of reservoirs in that size band</p></div><div class="card-actions"></div></div>
        <div class="chart" id="ressize-chart"></div>
        <div class="insight">${raw(icon("info"))}<span>Reservoirs under 100 ha are <strong>${fmt.pct(smallShare)}</strong> of the total
          but only <strong>${fmt.pct(smallArea)}</strong> of the water surface.
          ${topResBasins.map((b) => b.basin).join(", ")} together hold
          <strong>${Math.round(topResBasins.reduce((t, b) => t + b.pct_of_reservoir_area, 0))}%</strong> of it.</span></div>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>Largest by water surface</h3><p>Open the dam that holds it back</p></div></div>
        <ol class="rank-list">${res.largest.slice(0, 6).map((r) => html`<li><a href="${damHref(r.primary_dam_id)}">
          <span><span class="name">${r.reservoir_name}</span><span class="meta">${r.nearest_river || "-"} · ${r.state}</span></span>
          <span class="num">${fmt.area(r.area_km2 * 100)}<small>${r.mean_depth_m != null ? `${fmt.num1(r.mean_depth_m)} m deep` : fmt.year(r.first_completion_year)}</small></span></a></li>`)}</ol>
      </div>
    </div>

    ${story(6, "The most dammed rivers",
      "These rivers have the most dams within 5 km of their course. Open one to see each dam in order and when it was built.")}
    <div class="grid g-2">
      <div class="card" id="dammed-card">
        <div class="card-head"><div><h3>Dams per river</h3><p>Top 10 rivers by number of dams</p></div><div class="card-actions"></div></div>
        <div class="chart" id="dammed-chart"></div>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>About this data</h3><p>How the figures were produced</p></div></div>
        <ul class="notes">
          <li>Each dam is linked to the <strong>nearest mapped river within 5 km</strong>.
            ${fmt.int(k.unmatched_dams)} dams had no river that close and are counted by state only.</li>
          <li><strong>${k.storage_suspect}</strong> dams list a storage figure that is impossible for their height (e.g. 125,639 MCM for a 15 m dam).
            They are left out of storage totals.</li>
          <li>Completion years of 0 and water levels above 9,000 m were treated as missing.</li>
          <li>River lengths come from the source shapefile. Map lines are simplified to 250 m for speed.</li>
          <li>Reservoir outlines are from the <a href="https://nwdp.nwic.gov.in/dataset/reservoir" target="_blank" rel="noopener">NWIC reservoir layer</a>.
            Depth is storage ÷ surface area; <strong>${fmt.int(rk.depth_suspect)}</strong> outlines would be deeper than their dam
            (partial outlines or unfilled reservoirs) and are left out of depth figures.</li>
        </ul>
      </div>
    </div>

    <section class="cta-band">
      <div><h2>Next: find the rivers and dams near you</h2>
        <p>Filter by basin, state, purpose or era, then open any river or dam for its full profile.</p></div>
      <a class="btn primary" href="#/explore">Continue to Explore ${raw(icon("arrow"))}</a>
    </section>
  </div>`);

  // ---------------------------------------------------------------- charts
  const basinMeasures = {
    dam_count: { title: "Dams by basin", sub: "Count of dams linked to a river in each basin", f: fmt.int, name: "Dams" },
    dams_per_1000km: { title: "Dam density by basin", sub: "Dams per 1,000 km of mapped river", f: fmt.num1, name: "Dams per 1,000 km" },
    total_river_length_km: { title: "River length by basin", sub: "Total length of mapped river reaches", f: fmt.km, name: "River length" },
    total_storage_mcm: { title: "Storage by basin", sub: "Gross storage of dams in each basin", f: fmt.mcm, name: "Gross storage" },
    reservoir_area_km2: { title: "Reservoir water surface by basin", sub: "Area of mapped reservoirs in each basin", f: (v) => fmt.area(v * 100), name: "Water surface" },
  };
  let basinCleanup = null;
  const basinCard = root.querySelector("#basin-card");
  const drawBasins = (m) => {
    basinCleanup?.();
    const cfg = basinMeasures[m];
    root.querySelector("#basin-title").textContent = cfg.title;
    root.querySelector("#basin-sub").textContent = cfg.sub;
    const data = [...s.basins].sort((a, b) => b[m] - a[m]).map((b) => ({
      label: b.basin, value: b[m], href: `#/explore?basin=${encodeURIComponent(b.basin)}`,
      extra: [
        { label: "Rivers", value: fmt.int(b.river_count), color: "var(--series-other)" },
        { label: "Rivers with a dam", value: `${fmt.num1(b.pct_rivers_dammed)}%`, color: "var(--series-other)" },
      ],
    }));
    basinCleanup = hbar(root.querySelector("#basin-chart"), data, { format: cfg.f, valueName: cfg.name, labelWidth: 230, rowHeight: 26, ariaLabel: cfg.title });
  };
  drawBasins("dam_count");
  basinCard.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => {
    basinCard.querySelectorAll(".seg button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    drawBasins(b.dataset.m);
  }));
  cleanups.push(() => basinCleanup?.());

  const decadeData = decades.map((d) => ({
    label: d.decade, value: d.dams_completed,
    extra: [{ label: "Avg height", value: fmt.m(d.avg_height_m), color: "var(--series-other)" },
            { label: "Storage added", value: fmt.mcm(d.storage_added_mcm), color: "var(--series-other)" }],
  }));
  cleanups.push(columns(root.querySelector("#decade-chart"), decadeData, {
    valueName: "Dams completed", highlight: (d) => d.label === peak.decade, ariaLabel: "Dams completed per decade" }));
  tableToggle(root.querySelector("#decade-card"), root.querySelector("#decade-chart"),
    [{ key: "decade", label: "Decade" }, { key: "dams_completed", label: "Dams", num: true, format: fmt.int },
     { key: "storage_added_mcm", label: "Storage added (MCM)", num: true, format: fmt.int }], decades);

  cleanups.push(areaLine(root.querySelector("#storage-chart"), decades.map((d) => ({
    label: d.decade, value: d.cumulative_storage_mcm,
    extra: [{ label: "Added this decade", value: fmt.mcm(d.storage_added_mcm), color: "var(--series-other)" }],
  })), { format: fmt.compact, valueName: "Cumulative storage (MCM)", ariaLabel: "Cumulative storage by decade" }));
  tableToggle(root.querySelector("#storage-card"), root.querySelector("#storage-chart"),
    [{ key: "decade", label: "Decade" }, { key: "cumulative_storage_mcm", label: "Cumulative MCM", num: true, format: fmt.int }], decades);

  const states = s.states.slice(0, 12);
  cleanups.push(hbar(root.querySelector("#state-chart"), states.map((st) => ({
    label: st.state, value: st.dam_count, href: `#/explore?state=${encodeURIComponent(st.state)}`,
    extra: [{ label: "Large dams", value: fmt.int(st.large_dam_count), color: "var(--series-other)" },
            { label: "Storage", value: fmt.mcm(st.total_storage_mcm), color: "var(--series-other)" },
            { label: "Tallest", value: fmt.m(st.tallest_dam_m), color: "var(--series-other)" }],
  })), { valueName: "Dams", labelWidth: 150, ariaLabel: "Dams by state" }));
  tableToggle(root.querySelector("#state-card"), root.querySelector("#state-chart"),
    [{ key: "state", label: "State" }, { key: "dam_count", label: "Dams", num: true, format: fmt.int },
     { key: "large_dam_count", label: "Large", num: true, format: fmt.int }, { key: "total_storage_mcm", label: "Storage MCM", num: true, format: fmt.int }],
    s.states);

  const purposes = s.purposes.map((p) => ({
    label: p.purpose, value: p.dam_count / k.dam_count, href: `#/explore?purpose=${encodeURIComponent(p.purpose)}`,
    extra: [{ label: "Dams", value: fmt.int(p.dam_count), color: "var(--series-other)" },
            { label: "Avg height", value: fmt.m(p.avg_height_m), color: "var(--series-other)" }],
  }));
  cleanups.push(hbar(root.querySelector("#purpose-chart"), purposes, { format: fmt.pct, valueName: "Share of dams", labelWidth: 140, ariaLabel: "Share of dams by purpose" }));
  tableToggle(root.querySelector("#purpose-card"), root.querySelector("#purpose-chart"),
    [{ key: "purpose", label: "Purpose" }, { key: "dam_count", label: "Dams", num: true, format: fmt.int },
     { key: "total_storage_mcm", label: "Storage MCM", num: true, format: fmt.int }], s.purposes);

  const order = ["<15 m", "15-30 m", "30-60 m", "60-100 m", "100+ m"];
  const heights = order.map((c) => ({ label: c, value: s.height_classes.find((h) => h.class === c)?.count || 0 }));
  cleanups.push(columns(root.querySelector("#height-chart"), heights, { valueName: "Dams", height: 260, ariaLabel: "Dams by height class",
    onClick: (d) => { location.hash = `#/explore?height=${encodeURIComponent(d.label)}`; } }));
  tableToggle(root.querySelector("#height-card"), root.querySelector("#height-chart"),
    [{ key: "label", label: "Height" }, { key: "value", label: "Dams", num: true, format: fmt.int }], heights);

  const sizes = res.size_classes.map((c) => ({
    label: c.area_class, value: c.pct_of_area / 100,
    extra: [{ label: "Share of reservoirs", value: fmt.pct(c.pct_of_reservoirs / 100), color: "var(--series-other)" },
            { label: "Reservoirs", value: fmt.int(c.reservoir_count), color: "var(--series-other)" },
            { label: "Water surface", value: fmt.area(c.total_area_km2 * 100), color: "var(--series-other)" }],
  }));
  cleanups.push(hbar(root.querySelector("#ressize-chart"), sizes, { format: fmt.pct, valueName: "Share of water surface", labelWidth: 130, ariaLabel: "Share of reservoir water surface by size band" }));
  tableToggle(root.querySelector("#ressize-card"), root.querySelector("#ressize-chart"),
    [{ key: "area_class", label: "Size" }, { key: "reservoir_count", label: "Reservoirs", num: true, format: fmt.int },
     { key: "pct_of_reservoirs", label: "% of reservoirs", num: true, format: fmt.num1 },
     { key: "pct_of_area", label: "% of area", num: true, format: fmt.num1 }], res.size_classes);

  const dammed = s.top_dammed_rivers.map((r) => ({
    label: r.river_name, value: r.dam_count, href: riverHref(r.river_id), sub: `${r.basin} › ${r.sub_basin}`,
    extra: [{ label: "Length", value: fmt.km(r.length_km), color: "var(--series-other)" },
            { label: "Dams per 100 km", value: fmt.num1(r.dams_per_100km), color: "var(--series-other)" },
            { label: "Storage", value: fmt.mcm(r.total_storage_mcm), color: "var(--series-other)" }],
  }));
  cleanups.push(hbar(root.querySelector("#dammed-chart"), dammed, { valueName: "Dams", labelWidth: 150, ariaLabel: "Most dammed rivers" }));
  tableToggle(root.querySelector("#dammed-card"), root.querySelector("#dammed-chart"),
    [{ key: "river_name", label: "River" }, { key: "dam_count", label: "Dams", num: true },
     { key: "length_km", label: "Length km", num: true, format: fmt.int }], s.top_dammed_rivers);

  // ---------------------------------------------------------------- hero map (non-blocking)
  let heroMap = null, alive = true;
  getDams().then((dams) => {
    if (!alive) return;
    heroMap = createMap(root.querySelector("#hero-map"), {
      rivers: true, dams: dams.list, compact: true, scrollZoom: false,
      view: { center: matchMedia("(max-width: 860px)").matches ? [80.5, 17] : [71.5, 22.6], zoom: 3.85 },
      flowMin: 250,
      damLookup: (id) => dams.byId.get(id),
      onDamClick: (d) => { location.hash = damHref(d.id); },
      onRiverClick: (p) => { location.hash = riverHref(p.id); },
    });
  }).catch((e) => console.error(e));

  return () => { alive = false; heroMap?.destroy(); cleanups.forEach((c) => c?.()); };
}
