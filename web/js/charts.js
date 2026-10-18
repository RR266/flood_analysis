// Reusable D3 charts. Colours come from CSS classes/tokens, so a theme switch
// restyles them without a re-render. Every chart: hover + keyboard tooltip,
// thin marks with 4px rounded data-ends, hairline grid, and a table-view twin.
import * as d3 from "d3";
import { html, mount, fmt, onResize } from "./util.js";
import { showTooltip, moveTooltip, hideTooltip, ttRows } from "./tooltip.js";

const BAR = 16;          // bar thickness (<= 24px)
const GAP = 2;           // surface gap between adjacent columns

// Point at the element's centre for keyboard-triggered tooltips.
const focusEvt = (node) => {
  const r = node.getBoundingClientRect();
  return { clientX: r.left + r.width / 2, clientY: r.top };
};

function bindTip(sel, content) {
  sel
    .attr("tabindex", 0)
    .on("pointerenter", function (e, d) { d3.select(this).classed("hover", true); showTooltip(e, content(d)); })
    .on("pointermove", (e) => moveTooltip(e))
    .on("pointerleave", function () { d3.select(this).classed("hover", false); hideTooltip(); })
    .on("focus", function (e, d) { showTooltip(focusEvt(this), content(d)); })
    .on("blur", hideTooltip);
}

// Horizontal bar, square at the baseline, 4px rounded at the data end.
function hPath(x0, y, w, h, r = 4) {
  if (w <= 0) return "";
  r = Math.min(r, w, h / 2);
  return `M${x0},${y}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-(w - r)}z`;
}
// Vertical column, rounded at the top.
function vPath(x, y0, w, h, r = 4) {
  if (h <= 0) return "";
  r = Math.min(r, h, w / 2);
  return `M${x},${y0}v${-(h - r)}a${r},${r} 0 0 1 ${r},${-r}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${h - r}z`;
}

function svgIn(el, w, h) {
  const svg = d3.select(el).append("svg").attr("width", w).attr("height", h).attr("viewBox", `0 0 ${w} ${h}`);
  return svg;
}

// Wrap each chart: renders now, re-renders on width change, returns cleanup.
function responsive(el, draw) {
  const run = () => { el.innerHTML = ""; if (el.clientWidth > 0) draw(el.clientWidth); };
  run();
  return onResize(el, run);
}

// ------------------------------------------------------------------ hbar
/**
 * data: [{label, value, sub?, href?, highlight?}]
 * opts: {format, valueName, labelWidth, onClick(d), tip(d)}
 */
export function hbar(el, data, opts = {}) {
  const format = opts.format || fmt.int;
  const rowH = opts.rowHeight || 30;
  return responsive(el, (width) => {
    const labelW = Math.min(opts.labelWidth || 170, width * 0.42);
    const valueW = 64;
    const m = { top: 4, right: valueW, bottom: 4, left: labelW };
    const h = data.length * rowH + m.top + m.bottom;
    const x = d3.scaleLinear().domain([0, d3.max(data, (d) => d.value) || 1]).range([0, width - m.left - m.right]);
    const svg = svgIn(el, width, h).attr("role", "img").attr("aria-label", opts.ariaLabel || "Bar chart");
    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

    const row = g.selectAll("g.row").data(data).join("g").attr("class", "row")
      .attr("transform", (_, i) => `translate(0,${i * rowH})`);

    row.append("text").attr("class", (d) => `cat-label${d.href || opts.onClick ? " link" : ""}`)
      .attr("x", -10).attr("y", rowH / 2).attr("dy", "0.35em").attr("text-anchor", "end")
      .text((d) => truncate(d.label, labelW - 14, 12.5))
      .on("click", (e, d) => { if (d.href) location.hash = d.href; else opts.onClick?.(d); })
      .append("title").text((d) => d.label);

    row.append("path")
      .attr("class", (d) => `mark ${d.cls || ""} ${opts.highlight && !d.highlight ? "muted" : ""}`)
      .attr("d", (d) => hPath(0, (rowH - BAR) / 2, x(d.value), BAR));

    row.append("text").attr("class", "val-label").attr("x", (d) => x(d.value) + 6).attr("y", rowH / 2).attr("dy", "0.35em")
      .text((d) => format(d.value));

    const hit = row.append("rect").attr("class", "hit").attr("x", -labelW).attr("width", width).attr("height", rowH)
      .attr("aria-label", (d) => `${d.label}: ${format(d.value)}`)
      .on("click", (e, d) => { if (d.href) location.hash = d.href; else opts.onClick?.(d); });
    bindTip(hit, opts.tip || ((d) => html`<div class="tt-title">${d.label}</div>
      ${d.sub ? html`<div class="tt-sub">${d.sub}</div>` : ""}
      ${ttRows([{ label: opts.valueName || "Value", value: format(d.value) }, ...(d.extra || [])])}
      ${d.href ? html`<div class="tt-foot">${d.href.startsWith("#/explore") ? "Click to explore on the map" : "Click to open profile"}</div>` : ""}`));
    if (!d3.some(data, (d) => d.href) && !opts.onClick) hit.style("cursor", "default");
  });
}

// ------------------------------------------------------------------ columns
/**
 * data: [{label, value}] (ordered); opts: {format, valueName, height, highlight(label), annotate}
 */
export function columns(el, data, opts = {}) {
  const format = opts.format || fmt.int;
  const H = opts.height || 240;
  return responsive(el, (width) => {
    const m = { top: 22, right: 8, bottom: 26, left: 44 };
    const iw = width - m.left - m.right, ih = H - m.top - m.bottom;
    const x = d3.scaleBand().domain(data.map((d) => d.label)).range([0, iw]).paddingInner(0.12).paddingOuter(0.05);
    const y = d3.scaleLinear().domain([0, d3.max(data, (d) => d.value) || 1]).nice().range([ih, 0]);
    const svg = svgIn(el, width, H).attr("role", "img").attr("aria-label", opts.ariaLabel || "Column chart");
    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

    g.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickFormat(""));
    g.append("g").attr("class", "axis no-line").call(d3.axisLeft(y).ticks(4).tickFormat(fmt.compact).tickSize(0).tickPadding(8));
    const every = Math.ceil(data.length / Math.max(1, Math.floor(iw / 46)));
    g.append("g").attr("class", "axis").attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).tickSize(0).tickPadding(8)
        .tickValues(data.map((d) => d.label).filter((_, i) => i % every === 0)));

    const bw = Math.min(24, x.bandwidth());
    const off = (x.bandwidth() - bw) / 2;
    const top = d3.greatest(data, (d) => d.value);
    g.selectAll("path.mark").data(data).join("path")
      .attr("class", (d) => `mark ${opts.highlight && !opts.highlight(d) ? "muted" : ""}`)
      .attr("d", (d) => vPath(x(d.label) + off, ih, bw, ih - y(d.value)));

    // label only the peak (selective direct label)
    if (top && opts.labelPeak !== false) {
      g.append("text").attr("class", "val-label").attr("text-anchor", "middle")
        .attr("x", x(top.label) + x.bandwidth() / 2).attr("y", y(top.value) - 6).text(format(top.value));
    }

    const hit = g.selectAll("rect.hit").data(data).join("rect").attr("class", "hit")
      .attr("x", (d) => x(d.label) - (x.step() - x.bandwidth()) / 2).attr("width", x.step())
      .attr("y", 0).attr("height", ih).style("cursor", opts.onClick ? "pointer" : "default")
      .attr("aria-label", (d) => `${d.label}: ${format(d.value)}`)
      .on("click", (e, d) => opts.onClick?.(d));
    bindTip(hit, opts.tip || ((d) => html`<div class="tt-title">${d.label}</div>
      ${ttRows([{ label: opts.valueName || "Value", value: format(d.value) }, ...(d.extra || [])])}`));
  });
}

// ------------------------------------------------------------------ area + line
/** data: [{label, value}] ordered; crosshair snaps to nearest label. */
export function areaLine(el, data, opts = {}) {
  const format = opts.format || fmt.int;
  const H = opts.height || 240;
  return responsive(el, (width) => {
    const m = { top: 22, right: 16, bottom: 26, left: 52 };
    const iw = width - m.left - m.right, ih = H - m.top - m.bottom;
    const x = d3.scalePoint().domain(data.map((d) => d.label)).range([0, iw]).padding(0.3);
    const y = d3.scaleLinear().domain([0, d3.max(data, (d) => d.value) || 1]).nice().range([ih, 0]);
    const svg = svgIn(el, width, H).attr("role", "img").attr("aria-label", opts.ariaLabel || "Area chart");
    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

    g.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickFormat(""));
    g.append("g").attr("class", "axis no-line").call(d3.axisLeft(y).ticks(4).tickFormat(fmt.compact).tickSize(0).tickPadding(8));
    const every = Math.ceil(data.length / Math.max(1, Math.floor(iw / 46)));
    g.append("g").attr("class", "axis").attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).tickSize(0).tickPadding(8).tickValues(x.domain().filter((_, i) => i % every === 0)));

    g.append("path").datum(data).attr("class", "area")
      .attr("d", d3.area().x((d) => x(d.label)).y0(ih).y1((d) => y(d.value)).curve(d3.curveMonotoneX));
    g.append("path").datum(data).attr("class", "line")
      .attr("d", d3.line().x((d) => x(d.label)).y((d) => y(d.value)).curve(d3.curveMonotoneX));

    const last = data[data.length - 1];
    g.append("circle").attr("class", "dot mark").attr("r", 4.5).attr("cx", x(last.label)).attr("cy", y(last.value));
    g.append("text").attr("class", "val-label").attr("text-anchor", "end")
      .attr("x", x(last.label) - 8).attr("y", y(last.value) - 8).text(format(last.value));

    const cross = g.append("line").attr("class", "crosshair").attr("y1", 0).attr("y2", ih).style("display", "none");
    const hoverDot = g.append("circle").attr("class", "dot mark").attr("r", 4.5).style("display", "none");
    const overlay = g.append("rect").attr("class", "hit").attr("width", iw).attr("height", ih).style("cursor", "crosshair");
    const nearest = (px) => data[d3.minIndex(data, (d) => Math.abs(x(d.label) - px))];
    overlay
      .on("pointermove", (e) => {
        const d = nearest(d3.pointer(e)[0]);
        cross.style("display", null).attr("x1", x(d.label)).attr("x2", x(d.label));
        hoverDot.style("display", null).attr("cx", x(d.label)).attr("cy", y(d.value));
        showTooltip(e, (opts.tip || ((d) => html`<div class="tt-title">${d.label}</div>
          ${ttRows([{ label: opts.valueName || "Value", value: format(d.value) }, ...(d.extra || [])])}`))(d));
      })
      .on("pointerleave", () => { cross.style("display", "none"); hoverDot.style("display", "none"); hideTooltip(); });
  });
}

// ------------------------------------------------------------------ scatter
/**
 * data: [{x, y, cls, label, sub, href}]; opts: {xLabel, yLabel, xFormat, yFormat, tip}
 * Nearest-point hover via Delaunay so readers don't have to hit an 8px dot.
 */
export function scatter(el, data, opts = {}) {
  const H = opts.height || 280;
  return responsive(el, (width) => {
    const m = { top: 14, right: 16, bottom: 36, left: 48 };
    const iw = width - m.left - m.right, ih = H - m.top - m.bottom;
    const xs = d3.extent(data, (d) => d.x);
    const x = d3.scaleLinear().domain([xs[0] - 2, xs[1] + 2]).range([0, iw]).nice();
    const y = d3.scaleLinear().domain([0, d3.max(data, (d) => d.y) || 1]).nice().range([ih, 0]);
    const svg = svgIn(el, width, H).attr("role", "img").attr("aria-label", opts.ariaLabel || "Scatter chart");
    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

    g.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat(""));
    g.append("g").attr("class", "axis no-line").call(d3.axisLeft(y).ticks(5).tickSize(0).tickPadding(8).tickFormat(opts.yFormat || fmt.compact));
    g.append("g").attr("class", "axis").attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(Math.max(2, Math.floor(iw / 70))).tickFormat(opts.xFormat || d3.format("d")).tickSize(0).tickPadding(8));
    if (opts.yLabel) g.append("text").attr("class", "note-label").attr("x", 0).attr("y", -4).text(opts.yLabel);
    if (opts.xLabel) g.append("text").attr("class", "note-label").attr("x", iw).attr("y", ih + 32).attr("text-anchor", "end").text(opts.xLabel);

    const dots = g.selectAll("circle.d").data(data).join("circle")
      .attr("class", (d) => `d dot mark ${d.cls || ""}`).attr("r", 5)
      .attr("cx", (d) => x(d.x)).attr("cy", (d) => y(d.y));

    const delaunay = d3.Delaunay.from(data, (d) => x(d.x), (d) => y(d.y));
    let active = null;
    g.append("rect").attr("class", "hit").attr("width", iw).attr("height", ih)
      .on("pointermove", (e) => {
        const [px, py] = d3.pointer(e);
        const i = delaunay.find(px, py);
        const d = data[i];
        if (Math.hypot(x(d.x) - px, y(d.y) - py) > 30) { dots.classed("hover", false).attr("r", 5); active = null; hideTooltip(); return; }
        active = d;
        dots.classed("hover", (o) => o === d).attr("r", (o) => (o === d ? 7 : 5));
        showTooltip(e, opts.tip(d));
        e.currentTarget.style.cursor = d.href ? "pointer" : "default";
      })
      .on("pointerleave", () => { dots.classed("hover", false).attr("r", 5); active = null; hideTooltip(); })
      .on("click", () => { if (active?.href) location.hash = active.href; });
  });
}

// ------------------------------------------------------------------ distribution
/**
 * Histogram of all values (muted) with a marker for one item.
 * values: number[]; marker: number; opts: {log, format, markerLabel, height}
 */
export function distribution(el, values, marker, opts = {}) {
  const H = opts.height || 120;
  const format = opts.format || fmt.compact;
  return responsive(el, (width) => {
    const m = { top: 22, right: 10, bottom: 22, left: 10 };
    const iw = width - m.left - m.right, ih = H - m.top - m.bottom;
    const clean = values.filter((v) => v != null && (!opts.log || v > 0));
    const ext = d3.extent(clean);
    const x = (opts.log ? d3.scaleLog() : d3.scaleLinear()).domain(ext).range([0, iw]).nice();
    const bins = d3.bin().domain(x.domain()).thresholds(opts.log ? d3.range(31).map((i) => x.invert((i / 30) * iw)) : 30)(clean);
    const y = d3.scaleLinear().domain([0, d3.max(bins, (b) => b.length)]).range([ih, 0]);
    const svg = svgIn(el, width, H).attr("role", "img").attr("aria-label", opts.ariaLabel || "Distribution");
    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

    g.selectAll("path.mark").data(bins).join("path")
      .attr("class", (b) => `mark ${marker != null && b.x0 <= marker && marker < b.x1 ? "" : "muted"}`)
      .attr("d", (b) => vPath(x(b.x0) + GAP / 2, ih, Math.max(1, x(b.x1) - x(b.x0) - GAP), ih - y(b.length), 2));
    g.append("g").attr("class", "axis").attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(opts.log ? 4 : 5, opts.log ? "~s" : undefined).tickSize(0).tickPadding(6));

    const hit = g.selectAll("rect.hit").data(bins).join("rect").attr("class", "hit")
      .attr("x", (b) => x(b.x0)).attr("width", (b) => Math.max(1, x(b.x1) - x(b.x0))).attr("y", 0).attr("height", ih)
      .style("cursor", "default");
    bindTip(hit, (b) => html`<div class="tt-title">${format(b.x0)} – ${format(b.x1)}</div>
      ${ttRows([{ label: opts.unitName || "Items in range", value: fmt.int(b.length), color: "var(--series-other)" }])}`);

    if (marker != null && marker >= x.domain()[0]) {
      const mx = x(Math.min(marker, x.domain()[1]));
      g.append("line").attr("class", "marker-line").attr("x1", mx).attr("x2", mx).attr("y1", -6).attr("y2", ih);
      g.append("text").attr("class", "marker-label").attr("x", mx).attr("y", -10)
        .attr("text-anchor", mx > iw * 0.8 ? "end" : mx < iw * 0.2 ? "start" : "middle")
        .text(`${opts.markerLabel || "This"}: ${format(marker)}`);
    }
  });
}

// ------------------------------------------------------------------ legend + table view
export function legend(items) {
  return html`<div class="legend">${items.map((i) => html`<span><i class="${i.line ? "line-key" : ""}" style="background:${i.color}"></i>${i.label}</span>`)}</div>`;
}

/**
 * Adds a Chart/Table toggle button to `card` (.card-actions) that swaps `chartEl`
 * for a table of `rows`. cols: [{key, label, num?, format?}]
 */
export function tableToggle(card, chartEl, cols, rows) {
  const actions = card.querySelector(".card-actions");
  if (!actions) return;
  const btn = document.createElement("button");
  btn.className = "btn sm ghost";
  btn.type = "button";
  btn.setAttribute("aria-pressed", "false");
  btn.textContent = "Table";
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  wrap.hidden = true;
  mount(wrap, html`<table class="table-view"><thead><tr>${cols.map((c) => html`<th class="${c.num ? "n" : ""}">${c.label}</th>`)}</tr></thead>
    <tbody>${rows.map((r) => html`<tr>${cols.map((c) => html`<td class="${c.num ? "n" : ""}">${c.format ? c.format(r[c.key]) : r[c.key] ?? "-"}</td>`)}</tr>`)}</tbody></table>`);
  chartEl.after(wrap);
  btn.addEventListener("click", () => {
    const on = btn.getAttribute("aria-pressed") !== "true";
    btn.setAttribute("aria-pressed", String(on));
    btn.textContent = on ? "Chart" : "Table";
    wrap.hidden = !on;
    chartEl.hidden = on;
  });
  actions.append(btn);
}

// Approximate text truncation without measuring every label in the DOM.
function truncate(s, px, size) {
  const max = Math.floor(px / (size * 0.56));
  return s && s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
