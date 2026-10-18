// Small HTML building blocks shared by the pages.
import { html, raw } from "./util.js";
import { icon } from "./icons.js";

export function stat(ic, label, value, sub, meter) {
  return html`<div class="card stat">
    <div class="label">${raw(icon(ic))}${label}</div>
    <div class="value">${value}</div>
    ${sub ? html`<div class="sub">${sub}</div>` : ""}
    ${meter != null ? html`<div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(meter * 100)}" aria-label="${label}"><i style="width:${(Math.min(1, meter) * 100).toFixed(1)}%"></i></div>` : ""}
  </div>`;
}

export function story(n, title, text) {
  return html`<section class="story"><div class="story-head"><div class="story-num" aria-hidden="true">${n}</div>
    <div><h2>${title}</h2><p>${text}</p></div></div></section>`;
}

export const breadcrumb = (items) => html`<nav class="breadcrumb" aria-label="Breadcrumb">${items.map((it, i) => html`
  ${i ? html`<span aria-hidden="true">›</span>` : ""}${it.href ? html`<a href="${it.href}">${it.label}</a>` : html`<span aria-current="page">${it.label}</span>`}`)}</nav>`;

export const kv = (pairs) => html`<dl class="kv">${pairs.filter((p) => p[1] != null && p[1] !== "").map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl>`;
