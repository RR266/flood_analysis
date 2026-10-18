// One shared tooltip for charts and maps. Content is built with html`` (escaped).
import { html, mount, fmt, longerThan, rankPhrase } from "./util.js";
import { damBadgeURL } from "./icons.js";
import { purposeGroup } from "./data.js";

const el = () => document.getElementById("tooltip");

export function showTooltip(evt, content) {
  const t = el();
  mount(t, content);
  t.hidden = false;
  t.classList.add("show");
  moveTooltip(evt);
}

export function moveTooltip(evt) {
  const t = el();
  if (t.hidden) return;
  const pad = 14;
  const { innerWidth: W, innerHeight: H } = window;
  const r = t.getBoundingClientRect();
  let x = evt.clientX + pad, y = evt.clientY + pad;
  if (x + r.width > W - 8) x = evt.clientX - r.width - pad;
  if (y + r.height > H - 8) y = evt.clientY - r.height - pad;
  t.style.left = `${Math.max(8, x)}px`;
  t.style.top = `${Math.max(8, y)}px`;
}

export function hideTooltip() {
  const t = el();
  t.classList.remove("show");
  t.hidden = true;
}

// --------------------------------------------------------------- builders

// "Value leads, label follows", keyed with a short line in the series colour.
export const ttRows = (rows) => html`${rows.map((r) => html`
  <div class="tt-row"><span class="key" style="background:${r.color || "var(--series-1)"}"></span>
    <span class="lbl">${r.label}</span><span class="v">${r.value}</span></div>`)}`;

// Metric with a percentile bar - mirrors the comparison bars on the detail pages.
export const ttMetric = (label, value, pct, caption) => html`
  <div class="tt-metric">
    <div class="top"><span class="lbl">${label}</span><span class="v">${value}</span></div>
    ${pct != null ? html`<div class="pct-bar"><i style="width:${Math.round(pct * 100)}%"></i></div>
    <div class="cap">${caption}</div>` : ""}
  </div>`;

export function damTooltip(d) {
  const g = purposeGroup(d.purpose_group);
  return html`
    <div class="tt-head"><img src="${damBadgeURL(g.slug, 56)}" alt="">
      <div><div class="tt-title">${d.name}</div>
      <div class="tt-sub">${[d.nearest_river || d.river_reported, d.district, d.state].filter(Boolean).join(" · ")}</div></div>
    </div>
    ${ttMetric("Height", fmt.m(d.height_m), d.height_pct, rankPhrase(d.height_pct, "Taller than", "dams", "The tallest dam in the dataset"))}
    ${ttMetric("Gross storage", d.gross_storage_mcm != null ? fmt.mcm(d.gross_storage_mcm) : "Not recorded", d.storage_pct,
      rankPhrase(d.storage_pct, "Holds more than", "reservoirs", "The largest reservoir in the dataset"))}
    ${ttRows([
      { label: "Completed", value: fmt.year(d.completion_year), color: "var(--series-other)" },
      { label: "Purpose", value: d.purpose || "Not recorded", color: `var(${g.cssVar})` },
    ])}
    <div class="tt-foot">Click for the short profile</div>`;
}

export function riverTooltip(p, extra = {}) {
  // p = map feature properties {id,name,basin,len,dams}; extra = full river record (optional)
  const r = extra;
  return html`
    <div class="tt-head"><div><div class="tt-title">${p.name || "Unnamed river"}</div>
      <div class="tt-sub">${[p.basin, r.sub_basin].filter(Boolean).join(" › ")}</div></div></div>
    ${ttMetric("Length", fmt.km(p.len), r.len_pct_basin,
      longerThan(r.len_pct_basin))}
    ${ttRows([
      { label: "Dams on this river", value: fmt.int(p.dams) },
      ...(r.stateList ? [{ label: "States", value: r.stateList.length ? r.stateList.join(", ") : "-", color: "var(--series-other)" }] : []),
    ])}
    <div class="tt-foot">Flow animates from source to mouth · click to select</div>`;
}
