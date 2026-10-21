// About - what the project is for and where it is heading (awareness -> live levels -> flood analysis).
import { html, raw, mount, fmt } from "../util.js";
import { getSummary } from "../data.js";
import { icon } from "../icons.js";
import { CREDITS } from "../config.js";
import { stat, breadcrumb } from "../components.js";

const PHASES = [
  {
    n: 1, status: "Live now", ic: "river", title: "Know the water system",
    text: "Before we can understand floods, we need to know how water moves and where it is held back.",
    points: [
      "Where each river begins and where it ends or joins another river",
      "Where the dams and reservoirs are, and what they are built for",
      "How much water each reservoir can store, and how large it is",
    ],
  },
  {
    n: 2, status: "Next", ic: "storage", title: "Live reservoir levels",
    text: "Add current water levels for dams and reservoirs, so the map shows how full each one is right now.",
    points: [
      "Current level and storage compared with each reservoir's capacity",
      "How levels change through the monsoon and across years",
      "Reservoirs that are close to full",
    ],
  },
  {
    n: 3, status: "Planned", ic: "alert", title: "Flood analysis",
    text: "Bring the river network, reservoir storage and live levels together to study flooding across India.",
    points: [
      "Which basins and rivers are most exposed to floods",
      "How full reservoirs upstream relate to flooding downstream",
      "Clear, map-based views of flood risk for the public",
    ],
  },
];

export async function render(root) {
  const s = await getSummary();
  const k = s.kpis, rk = s.reservoirs.kpis;

  mount(root, html`
  <div class="page container about">
    <div class="page-head"><div>
      ${breadcrumb([{ label: "Overview", href: "#/overview" }, { label: "About" }])}
      <h1>About this project</h1>
      <p>The long-term goal is to <strong>analyse floods in India</strong>. Floods are shaped by where rivers flow
        and how much water the dams and reservoirs along them are holding. So the project starts by mapping
        that water system, and builds towards flood analysis in three phases.</p>
    </div></div>

    <section class="grid g-3 roadmap" aria-label="Project roadmap">
      ${PHASES.map((p) => html`<div class="card phase ${p.n === 1 ? "current" : ""}">
        <div class="phase-top"><span class="story-num" aria-hidden="true">${p.n}</span>
          <span class="chip">${p.n === 1 ? html`<span class="dot" style="background:var(--series-3)"></span>` : ""}${p.status}</span></div>
        <h3>${raw(icon(p.ic))}${p.title}</h3>
        <p>${p.text}</p>
        <ul class="notes">${p.points.map((t) => html`<li>${t}</li>`)}</ul>
      </div>`)}
    </section>

    <section class="story"><div class="story-head"><div class="story-num" aria-hidden="true">${raw(icon("map"))}</div>
      <div><h2>What you can explore today</h2>
        <p>Phase 1 covers India's mapped river network, its large dams and the reservoirs behind them.</p></div></div></section>
    <section class="grid g-4 kpi-row" aria-label="Data in this release">
      ${stat("river", "River reaches", fmt.int(k.river_count), `${fmt.int(k.river_length_km)} km, each traced from source to mouth`)}
      ${stat("dam", "Dams", fmt.int(k.dam_count), `${fmt.int(k.large_dam_count)} are large dams (15 m+)`)}
      ${stat("storage", "Reservoirs", fmt.int(rk.reservoir_count), `${fmt.int(rk.area_km2)} km² of water surface`)}
      ${stat("target", "Gross storage", html`${fmt.num1(k.storage_mcm / 1000)}<small>BCM</small>`, "Design capacity of the recorded dams")}
    </section>

    <div class="grid g-2" style="margin-top:16px">
      <div class="card">
        <div class="card-head"><div><h3>Data sources</h3><p>Official Government of India datasets</p></div></div>
        <ul class="notes">${CREDITS.map((c) => html`<li><strong>${c.label}:</strong>
          <a href="${c.url}" target="_blank" rel="noopener">${c.source}</a><br><small>${c.note}</small></li>`)}</ul>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>How the data was prepared</h3><p>Processed in Python (GeoPandas)</p></div></div>
        <ul class="notes">
          <li>Each dam is linked to the nearest mapped river within 5 km.</li>
          <li>Each reservoir is linked to its dam(s) through the dam's register code; ${fmt.int(rk.multi_dam_reservoirs)} reservoirs are held back by more than one dam.</li>
          <li>Storage figures are design capacities from the dam register, not current levels. Live levels arrive in phase 2.</li>
          <li>Obvious data-entry errors are kept out of totals and flagged on the profiles; see the notes on the Overview page.</li>
        </ul>
      </div>
    </div>

    <section class="cta-band">
      <div><h2>Start with the map</h2>
        <p>Follow a river from its source to the sea, and see every dam and reservoir along the way.</p></div>
      <a class="btn primary" href="#/explore">Explore the map ${raw(icon("arrow"))}</a>
    </section>
  </div>`);
}
