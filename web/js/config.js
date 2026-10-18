// Site-wide settings. Edit here, not in the page modules.

// Public Mapbox token (pk.*) - safe in client code; restrict its allowed URLs
// in your Mapbox account before hosting this anywhere public.
export const MAPBOX_TOKEN =
  "pk.eyJ1IjoicmFodWxyYW1lc2gtMjAwMCIsImEiOiJjbXV3ZHU5dXcwMHl5Mnlvc3lmaG9qMjN2In0.0iK8grX9o5zhImrG2zXZTA";

// Your "Dark 2D" style (Mapbox Standard, night preset). The theme toggle switches
// its lightPreset between "night" and "day" instead of loading a second style.
export const MAP_STYLE = "mapbox://styles/rahulramesh-2000/cmuwdxzcx00ex01ss7qpqhp3s";
export const LIGHT_PRESET = { dark: "night", light: "day" };

export const INDIA_VIEW = { center: [80.5, 22.6], zoom: 3.75 };
export const INDIA_BOUNDS = [[67.5, 6.5], [97.5, 36.5]];

// Rivers at least this long get the flow animation at national zoom.
export const FLOW_MIN_LENGTH_KM = 150;

export const DATA_URL = "data/";

export const CREDITS = [
  {
    label: "River network",
    source: "India-WRIS - India Water Resources Information System (Ministry of Jal Shakti)",
    url: "https://indiawris.gov.in",
    note: "River_Network shapefile: 30,395 reaches",
  },
  {
    label: "Dams",
    source: "India-WRIS dam layer, attributes per the National Register of Large Dams (Central Water Commission)",
    url: "https://cwc.gov.in",
    note: "dam.geojson: 6,644 dams",
  },
];
