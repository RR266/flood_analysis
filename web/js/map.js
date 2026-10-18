// Standard style lights custom layers too; "*-emissive-strength: 1" keeps our colours true at night.
// Mapbox GL map with rivers (+ animated flow source -> mouth), dam icons, tooltips.
import { MAPBOX_TOKEN, MAP_STYLE, LIGHT_PRESET, INDIA_VIEW, FLOW_MIN_LENGTH_KM, INDIA_BOUNDS } from "./config.js";
import { isDark, prefersReducedMotion, html } from "./util.js";
import { damBadgeURL, endpointBadgeURL, loadImage } from "./icons.js";
import { damsToGeoJSON, RIVER_TILES } from "./data.js";
import { showTooltip, moveTooltip, hideTooltip, damTooltip, riverTooltip, ttRows } from "./tooltip.js";

const mapboxgl = window.mapboxgl;
const DAM_SLUGS = ["irrigation", "hydropower", "water-supply", "other"];
const FONT = ["DIN Offc Pro Medium", "Arial Unicode MS Bold"];

// ------------------------------------------------------------------ flow animation
// The flow is a line-pattern image that redraws itself every frame: a soft streak with a
// bright head and a fading tail slides along the pattern's x axis, which Mapbox aligns with
// the line's drawing direction (source -> mouth). Only the image changes per frame, so the
// motion is continuous and the line geometry is never re-laid out (unlike dash animation).
const FLOW_W = 256, FLOW_H = 16;      // image pixels; must be powers of two to tile seamlessly
const FLOW_PERIOD_MS = 2600;          // time for one streak to travel one pattern length

function flowImage(isOn) {
  const data = new Uint8Array(FLOW_W * FLOW_H * 4);
  // vertical profile: bright core, soft edges
  const prof = Array.from({ length: FLOW_H }, (_, y) => {
    const v = Math.abs(((y + 0.5) / FLOW_H) * 2 - 1);
    return Math.max(0, 1 - v * v * 1.15);
  });
  return {
    width: FLOW_W, height: FLOW_H, data,
    onAdd(map) { this.map = map; },
    render() {
      if (!isOn()) return false;
      const phase = (performance.now() / FLOW_PERIOD_MS) % 1;
      for (let x = 0; x < FLOW_W; x++) {
        let u = (x / FLOW_W - phase) % 1;
        if (u < 0) u += 1;
        // u: 0..0.45 tail (rising), 0.45..0.5 head, then gap
        const a = u < 0.45 ? Math.pow(u / 0.45, 2.2) : u < 0.5 ? 1 - (u - 0.45) / 0.05 : 0;
        for (let y = 0; y < FLOW_H; y++) {
          const i = (y * FLOW_W + x) * 4;
          data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
          data[i + 3] = Math.round(255 * a * prof[y]);
        }
      }
      return true; // keep repainting
    },
  };
}

const palette = () => (isDark()
  ? { river: "#5598e7", riverHover: "#cde2fb", highlight: "#86b6ef",
      cluster: "#3987e5", clusterRing: "#1a1a19", clusterText: "#ffffff", halo: "#ffffff", label: "#ffffff", labelHalo: "#0d0d0d" }
  : { river: "#2a78d6", riverHover: "#104281", highlight: "#104281",
      cluster: "#2a78d6", clusterRing: "#ffffff", clusterText: "#ffffff", halo: "#0b0b0b", label: "#0b0b0b", labelHalo: "#ffffff" });

// Rivers are drawn as three size tiers with constant styling. Per-feature (data-driven)
// paint on 30k lines overflows GPU uniform limits on some devices, so none is used.
const TIERS = [
  { id: "small", filter: ["all", ["!", ["get", "major"]], ["<", ["get", "len"], 100]], w: [3, 0.3, 7, 0.8, 10, 1.3, 13, 2.2], o: 0.65 },
  { id: "long", filter: ["all", ["!", ["get", "major"]], [">=", ["get", "len"], 100]], w: [3, 0.8, 7, 1.8, 11, 3], o: 0.9 },
  { id: "major", filter: ["get", "major"], w: [3, 1.8, 7, 3.2, 11, 5], o: 1 },
];
const zoomWidth = (stops) => ["interpolate", ["linear"], ["zoom"], ...stops];
const tierLayer = (t) => `rivers-${t.id}`;
const withFilter = (base, expr) => (expr ? ["all", base, expr] : base);

/**
 * opts: {
 *   rivers: bool (draw the river vector tiles), riverFilter: expression, dams: dam[] | null, cluster: bool, interactive: bool, scrollZoom: bool,
 *   flow: bool, flowMin: km (rivers at least this long animate), view: {center, zoom} | bounds: [[w,s],[e,n]],
 *   riverLookup(id) -> river record, damLookup(id) -> dam,
 *   onDamClick(dam), onRiverClick(props), compact: bool (smaller controls)
 * }
 */
export function createMap(container, opts = {}) {
  mapboxgl.accessToken = MAPBOX_TOKEN;
  const map = new mapboxgl.Map({
    container,
    style: MAP_STYLE,
    config: { basemap: { lightPreset: isDark() ? LIGHT_PRESET.dark : LIGHT_PRESET.light, showPointOfInterestLabels: false } },
    center: opts.view?.center || INDIA_VIEW.center,
    zoom: opts.view?.zoom ?? INDIA_VIEW.zoom,
    bounds: opts.bounds,
    fitBoundsOptions: { padding: 40 },
    interactive: opts.interactive !== false,
    scrollZoom: opts.scrollZoom !== false,
    attributionControl: true,
    cooperativeGestures: !!opts.cooperative,
  });
  if (opts.interactive !== false) {
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
    if (!opts.compact) map.addControl(new mapboxgl.FullscreenControl(), "top-right");
    map.addControl(new mapboxgl.ScaleControl({ unit: "metric" }), "bottom-right");
  }

  const state = {
    flowOn: opts.flow !== false && !prefersReducedMotion(),
    hoverRiver: null, selectedRiver: null,
    flowFilter: ["any", ["get", "major"], [">=", ["get", "len"], opts.flowMin ?? FLOW_MIN_LENGTH_KM]],
  };

  let resolveReady;
  const ready = new Promise((r) => { resolveReady = r; });

  async function addImages() {
    for (const slug of DAM_SLUGS) {
      const img = await loadImage(damBadgeURL(slug, 48), 48);
      if (map.hasImage(`dam-${slug}`)) map.updateImage(`dam-${slug}`, img);
      else map.addImage(`dam-${slug}`, img, { pixelRatio: 2 });
    }
    if (!map.hasImage("flow")) map.addImage("flow", flowImage(() => state.flowOn || state.selectedRiver != null), { pixelRatio: 2 });
    for (const kind of ["source", "mouth"]) {
      const img = await loadImage(endpointBadgeURL(kind, 64), 64);
      if (map.hasImage(`end-${kind}`)) map.updateImage(`end-${kind}`, img);
      else map.addImage(`end-${kind}`, img, { pixelRatio: 2 });
    }
  }

  function addLayers() {
    const c = palette();
    if (opts.rivers) {
      // Vector tiles built from the full shapefile geometry (see build_web_data.py).
      map.addSource("rivers", { type: "vector", tiles: [RIVER_TILES], minzoom: 2, maxzoom: 10, bounds: INDIA_BOUNDS.flat() });
      const SL = "rivers";
      for (const t of TIERS) {
        map.addLayer({
          id: tierLayer(t), type: "line", source: "rivers", "source-layer": SL, slot: "middle",
          filter: withFilter(t.filter, opts.riverFilter),
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-emissive-strength": 1, "line-color": c.river, "line-width": zoomWidth(t.w), "line-opacity": t.o },
        });
      }
      map.addLayer({
        id: "rivers-flow", type: "line", source: "rivers", "source-layer": SL, slot: "middle",
        filter: withFilter(state.flowFilter, opts.riverFilter),
        layout: { "line-cap": "butt", "line-join": "round", visibility: state.flowOn ? "visible" : "none" },
        paint: { "line-emissive-strength": 1, "line-pattern": "flow", "line-width": zoomWidth([3, 1.6, 7, 2.6, 11, 4]), "line-opacity": 0.9 },
      });
      map.addLayer({
        id: "rivers-hover", type: "line", source: "rivers", "source-layer": SL, slot: "middle", filter: ["==", ["get", "id"], -1],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-emissive-strength": 1, "line-color": c.riverHover, "line-width": zoomWidth([3, 2.5, 8, 4.5, 12, 7]) },
      });
      map.addLayer({
        id: "rivers-highlight", type: "line", source: "rivers", "source-layer": SL, slot: "middle", filter: ["==", ["get", "id"], -1],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-emissive-strength": 1, "line-color": c.highlight, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 3.5, 8, 6, 12, 9] },
      });
      map.addLayer({
        id: "rivers-highlight-flow", type: "line", source: "rivers", "source-layer": SL, slot: "middle", filter: ["==", ["get", "id"], -1],
        layout: { "line-cap": "butt", "line-join": "round" },
        paint: { "line-emissive-strength": 1, "line-pattern": "flow", "line-width": ["interpolate", ["linear"], ["zoom"], 3, 3, 8, 5, 12, 8] },
      });
      // wide invisible line = forgiving hover target
      map.addLayer({
        id: "rivers-hit", type: "line", source: "rivers", "source-layer": SL, slot: "middle",
        ...(opts.riverFilter ? { filter: opts.riverFilter } : {}),
        paint: { "line-color": "#000", "line-opacity": 0, "line-width": 12 },
      });
    }

    map.addSource("endpoints", { type: "geojson", data: { type: "FeatureCollection", features: [] } });

    if (opts.dams) {
      map.addSource("dams", {
        type: "geojson", data: damsToGeoJSON(opts.dams),
        // Unclustered maps keep clustering on but capped at zoom 1: an unclustered GeoJSON
        // source rendered no symbols at all with this style (Mapbox GL 3.32).
        cluster: true, clusterMaxZoom: opts.cluster === false ? 1 : 5, clusterRadius: opts.cluster === false ? 1 : 44,
      });
      map.addLayer({
        id: "dam-clusters", type: "circle", source: "dams", slot: "top", filter: ["has", "point_count"],
        paint: {
          "circle-emissive-strength": 1, "circle-color": c.cluster, "circle-opacity": 0.92,
          "circle-radius": ["step", ["get", "point_count"], 13, 25, 17, 100, 22, 400, 28],
          "circle-stroke-width": 2.5, "circle-stroke-color": c.clusterRing,
        },
      });
      map.addLayer({
        id: "dam-cluster-count", type: "symbol", source: "dams", slot: "top", filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": FONT, "text-size": 12, "text-allow-overlap": true },
        paint: { "text-color": c.clusterText, "text-emissive-strength": 1 },
      });
      map.addLayer({
        id: "dam-selected", type: "circle", source: "dams", slot: "top", filter: ["==", ["get", "id"], ""],
        paint: { "circle-emissive-strength": 1, "circle-radius": 18, "circle-color": "rgba(0,0,0,0)", "circle-stroke-width": 3, "circle-stroke-color": c.halo },
      });
      map.addLayer({
        id: "dam-icons", type: "symbol", source: "dams", slot: "top", filter: ["!", ["has", "point_count"]],
        layout: {
          "icon-image": ["concat", "dam-", ["get", "pg"]],
          "icon-size": ["interpolate", ["linear"], ["zoom"], 4, ["case", [">=", ["get", "h"], 60], 0.85, 0.6], 9, ["case", [">=", ["get", "h"], 60], 1.15, 0.9]],
          "icon-allow-overlap": true, "icon-ignore-placement": true,
          "symbol-sort-key": ["get", "h"],
        },
        paint: { "icon-emissive-strength": 1 },
      });
    }

    map.addLayer({
      id: "endpoints", type: "symbol", source: "endpoints", slot: "top",
      layout: {
        "icon-image": ["concat", "end-", ["get", "kind"]], "icon-size": 0.9, "icon-allow-overlap": true,
        "text-field": ["get", "label"], "text-font": FONT, "text-size": 12, "text-offset": [0, 1.6], "text-anchor": "top",
        "text-allow-overlap": false, "text-optional": true,
      },
      paint: { "text-color": c.label, "text-halo-color": c.labelHalo, "text-halo-width": 1.6, "icon-emissive-strength": 1, "text-emissive-strength": 1 },
    });
  }

  function recolor() {
    if (!map.isStyleLoaded()) return;
    const c = palette();
    map.setConfigProperty("basemap", "lightPreset", isDark() ? LIGHT_PRESET.dark : LIGHT_PRESET.light);
    if (map.getLayer("rivers-flow")) {
      TIERS.forEach((t) => map.setPaintProperty(tierLayer(t), "line-color", c.river));
      map.setPaintProperty("rivers-hover", "line-color", c.riverHover);
      map.setPaintProperty("rivers-highlight", "line-color", c.highlight);
    }
    if (map.getLayer("dam-clusters")) {
      map.setPaintProperty("dam-clusters", "circle-color", c.cluster);
      map.setPaintProperty("dam-clusters", "circle-stroke-color", c.clusterRing);
      map.setPaintProperty("dam-selected", "circle-stroke-color", c.halo);
    }
    map.setPaintProperty("endpoints", "text-color", c.label);
    map.setPaintProperty("endpoints", "text-halo-color", c.labelHalo);
    addImages();
  }

  // ---------------------------------------------------------------- interaction
  function setHoverRiver(id) {
    if (state.hoverRiver === id || !map.getLayer("rivers-hover")) return;
    state.hoverRiver = id;
    map.setFilter("rivers-hover", ["==", ["get", "id"], id ?? -1]);
  }

  function bindEvents() {
    const layers = ["dam-icons", "dam-clusters", "rivers-hit"].filter((l) => map.getLayer(l));
    // Dams beat clusters beat rivers when several are under the pointer.
    const pick = (point) => {
      const hits = map.queryRenderedFeatures(point, { layers });
      return layers.map((l) => hits.find((h) => h.layer.id === l)).find(Boolean);
    };
    map.on("mousemove", (e) => {
      const f = pick(e.point);
      const evt = e.originalEvent;
      if (!f) { setHoverRiver(null); hideTooltip(); map.getCanvas().style.cursor = ""; return; }
      map.getCanvas().style.cursor = "pointer";
      if (f.layer.id === "dam-icons") {
        setHoverRiver(null);
        const d = opts.damLookup?.(f.properties.id);
        if (d) showTooltip(evt, damTooltip(d));
      } else if (f.layer.id === "dam-clusters") {
        setHoverRiver(null);
        showTooltip(evt, html`<div class="tt-title">${f.properties.point_count.toLocaleString()} dams</div>
          ${ttRows([{ label: "Zoom in to see each dam", value: "" }])}<div class="tt-foot">Click to zoom in</div>`);
      } else {
        setHoverRiver(f.properties.id);
        showTooltip(evt, riverTooltip(f.properties, opts.riverLookup?.(f.properties.id) || {}));
      }
      moveTooltip(evt);
    });
    map.getCanvas().addEventListener("mouseleave", () => { setHoverRiver(null); hideTooltip(); });

    map.on("click", (e) => {
      const f = pick(e.point);
      if (!f) return;
      hideTooltip();
      if (f.layer.id === "dam-clusters") {
        map.getSource("dams").getClusterExpansionZoom(f.properties.cluster_id, (err, zoom) => {
          if (!err) map.easeTo({ center: f.geometry.coordinates, zoom: zoom + 0.3 });
        });
      } else if (f.layer.id === "dam-icons") {
        const d = opts.damLookup?.(f.properties.id);
        if (d) opts.onDamClick?.(d);
      } else {
        opts.onRiverClick?.(f.properties);
      }
    });
  }

  map.on("style.load", async () => {
    await addImages();
    addLayers();
    bindEvents();
    resolveReady();
  });

  const onTheme = () => recolor();
  window.addEventListener("themechange", onTheme);

  // ---------------------------------------------------------------- public API
  const api = {
    map, ready,
    get flowOn() { return state.flowOn; },

    setDams(list) {
      ready.then(() => map.getSource("dams")?.setData(damsToGeoJSON(list)));
    },
    /** expr: filter for visible rivers (null = all); flowMin: min length (km) that gets the flow animation */
    setRiverFilter(expr, flowMin = FLOW_MIN_LENGTH_KM) {
      state.flowFilter = ["any", ["get", "major"], [">=", ["get", "len"], flowMin]];
      ready.then(() => {
        if (!map.getLayer("rivers-hit")) return;
        TIERS.forEach((t) => map.setFilter(tierLayer(t), withFilter(t.filter, expr)));
        map.setFilter("rivers-hit", expr);
        if (map.getLayer("rivers-flow")) map.setFilter("rivers-flow", expr ? ["all", expr, state.flowFilter] : state.flowFilter);
      });
    },
    setFlow(on) {
      state.flowOn = on;
      ready.then(() => {
        if (map.getLayer("rivers-flow")) map.setLayoutProperty("rivers-flow", "visibility", on ? "visible" : "none");
        map.triggerRepaint(); // restart the pattern's render loop
      });
    },
    setVisible(group, on) {
      const ids = { rivers: [...TIERS.map(tierLayer), "rivers-hit", "rivers-hover"], dams: ["dam-clusters", "dam-cluster-count", "dam-icons", "dam-selected"] }[group];
      ready.then(() => ids.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none")));
    },
    /** river: full river record (with start/end coords) or null */
    highlightRiver(river, { fit = true } = {}) {
      state.selectedRiver = river ? river.id : null;
      ready.then(() => {
        map.triggerRepaint();
        const f = ["==", ["get", "id"], river ? river.id : -1];
        if (map.getLayer("rivers-highlight")) { map.setFilter("rivers-highlight", f); map.setFilter("rivers-highlight-flow", f); }
        const pts = [];
        if (river?.start_lon != null) pts.push(pt([river.start_lon, river.start_lat], "source", `Source${river.start_district ? ` · ${river.start_district}` : ""}`));
        if (river?.end_lon != null) pts.push(pt([river.end_lon, river.end_lat], "mouth", river.confluence ? `Joins ${river.confluence}` : "Mouth"));
        map.getSource("endpoints").setData({ type: "FeatureCollection", features: pts });
        if (river && fit) {
          const b = riverBounds(river);
          if (b) map.fitBounds(b, { padding: 60, maxZoom: 10, duration: 900 });
        }
      });
    },
    selectDam(dam, { fly = true, zoom = 9 } = {}) {
      ready.then(() => {
        if (map.getLayer("dam-selected")) map.setFilter("dam-selected", ["==", ["get", "id"], dam ? dam.id : ""]);
        if (dam && fly && dam.longitude != null) map.flyTo({ center: [dam.longitude, dam.latitude], zoom: Math.max(map.getZoom(), zoom), duration: 1000 });
      });
    },
    fitBounds(b, o = {}) { ready.then(() => map.fitBounds(b, { padding: 50, duration: 800, ...o })); },
    destroy() {
      window.removeEventListener("themechange", onTheme);
      hideTooltip();
      map.remove();
    },
  };
  container.__rdMap = api; // handy for debugging from the console
  return api;
}

const pt = (coordinates, kind, label) => ({ type: "Feature", geometry: { type: "Point", coordinates }, properties: { kind, label } });

// Bounding box from rivers.json (computed from the full geometry), else source/mouth points.
export function riverBounds(river) {
  if (river.bbox) return [[river.bbox[0], river.bbox[1]], [river.bbox[2], river.bbox[3]]];
  return boundsOf([[river.start_lon, river.start_lat], [river.end_lon, river.end_lat]]);
}

export function boundsOf(points) {
  const v = points.filter((p) => p[0] != null && p[1] != null);
  if (!v.length) return null;
  const xs = v.map((p) => p[0]), ys = v.map((p) => p[1]);
  const b = [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
  if (b[0][0] === b[1][0]) { b[0][0] -= 0.2; b[1][0] += 0.2; b[0][1] -= 0.2; b[1][1] += 0.2; }
  return b;
}
