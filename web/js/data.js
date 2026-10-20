// Loads and caches the JSON produced by build_web_data.py.
import { DATA_URL } from "./config.js";

const cache = new Map();
const progressEl = () => document.getElementById("progress");
let pending = 0;

function progress(delta) {
  pending += delta;
  const el = progressEl();
  if (!el) return;
  if (pending > 0) { el.classList.add("active"); el.style.width = "70%"; }
  else { el.style.width = "100%"; setTimeout(() => { el.classList.remove("active"); el.style.width = "0"; }, 300); }
}

function load(name, transform = (x) => x) {
  if (!cache.has(name)) {
    progress(1);
    const p = fetch(DATA_URL + name)
      .then((r) => {
        if (!r.ok) throw new Error(`${name}: HTTP ${r.status}. Run "python build_web_data.py" first.`);
        return r.json();
      })
      .then(transform)
      .finally(() => progress(-1));
    p.catch(() => cache.delete(name));
    cache.set(name, p);
  }
  return cache.get(name);
}

// {columns, rows} -> array of objects
const fromColumnar = ({ columns, rows }) =>
  rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]])));

export const getSummary = () => load("summary.json");

// Vector-tile URL template for the river lines (absolute, as Mapbox requires).
export const RIVER_TILES = `${location.origin}${location.pathname.replace(/[^/]*$/, "")}${DATA_URL}tiles/{z}/{x}/{y}.pbf`;
export const RESERVOIR_TILES = RIVER_TILES.replace("tiles/", "reservoir_tiles/");

export const getDams = () => load("dams.json", (raw) => {
  const list = fromColumnar(raw);
  return { list, byId: new Map(list.map((d) => [d.id, d])) };
});

export const getRivers = () => load("rivers.json", (raw) => {
  const list = fromColumnar(raw);
  list.forEach((r) => { r.stateList = r.states ? r.states.split(",").map((s) => s.trim()).filter(Boolean) : []; });
  return { list, byId: new Map(list.map((r) => [r.id, r])) };
});

// Dam purpose groups used for colour + icon (max 3 colours + neutral "Other" on the map).
export const PURPOSE_GROUPS = [
  { key: "Irrigation", slug: "irrigation", cls: "", cssVar: "--series-1" },
  { key: "Hydropower", slug: "hydropower", cls: "s2", cssVar: "--series-2" },
  { key: "Water Supply", slug: "water-supply", cls: "s3", cssVar: "--series-3" },
  { key: "Other", slug: "other", cls: "other", cssVar: "--series-other" },
];
export const purposeGroup = (key) => PURPOSE_GROUPS.find((g) => g.key === key) || PURPOSE_GROUPS[3];

export function damsToGeoJSON(dams) {
  return {
    type: "FeatureCollection",
    features: dams.filter((d) => d.latitude != null && d.longitude != null).map((d) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [d.longitude, d.latitude] },
      properties: {
        id: d.id, name: d.name, pg: purposeGroup(d.purpose_group).slug,
        h: d.height_m ?? 0, s: d.gross_storage_mcm ?? 0,
      },
    })),
  };
}
