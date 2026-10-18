"""
Build the JSON / GeoJSON files the dashboard website (web/) reads.

    python build_web_data.py

Reuses the cleaning + spatial join from main.py, then writes web/data/:
    tiles/{z}/{x}/{y}.pbf  river lines as Mapbox vector tiles (zoom 2-10) built from the full
                     shapefile geometry, each line oriented source -> mouth for the flow animation
    rivers.json      river attributes (+ bounding box) for search, filters and profiles (columnar)
    dams.json        dam attributes + percentiles used by tooltips (columnar)
    summary.json     pre-aggregated numbers for the Overview page
"""

import json
import math
import shutil
import time

import geopandas as gpd
import mapbox_vector_tile
import numpy as np
import pandas as pd
import shapely
from shapely.geometry import LineString, MultiLineString, Point
from shapely.ops import linemerge

import main  # runs the pipeline and exposes the cleaned tables

WEB_DATA = main.BASE_DIR / "web" / "data"
TILE_DIR = WEB_DATA / "tiles"
TILE_ZOOMS = range(2, 11)   # the map over-zooms z10 tiles beyond zoom 10 (z10 ~ 10 m per tile unit)
EXTENT = 4096                # tile coordinate grid
BUFFER = 64                  # tile units of overlap so lines don't show seams at tile edges
# Short rivers are left out of the most zoomed-out tiles, where they'd be sub-pixel anyway.
MIN_LEN_KM = {2: 100, 3: 50, 4: 20, 5: 8}
ORIGIN = 20037508.342789244  # web-mercator half-width

PURPOSE_GROUPS = ["Irrigation", "Hydropower", "Water Supply"]  # everything else -> "Other"


def clean(v):
    """JSON-safe scalar: NaN/NA -> None, numpy -> python."""
    if v is None or v is pd.NA:
        return None
    if isinstance(v, (float, np.floating)):
        return None if math.isnan(v) else round(float(v), 3)
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.bool_,)):
        return bool(v)
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    return v


def records(df: pd.DataFrame) -> list:
    return [{k: clean(v) for k, v in row.items()} for row in df.to_dict("records")]


# ------------------------------------------------------------------ river geometry

def orient_parts(geom, start):
    """Merge touching pieces, then point every piece away from the river's recorded source.

    The shapefile stores many rivers as dozens of separate pieces drawn in mixed directions
    (the Ganga has 269). Merged and consistently oriented lines draw cleanly and make the
    flow animation run source -> mouth everywhere.
    """
    if geom is None or geom.is_empty:
        return geom
    merged = linemerge(geom) if isinstance(geom, MultiLineString) else geom
    lines = list(merged.geoms) if isinstance(merged, MultiLineString) else [merged]
    if start is None:
        return merged
    fixed = []
    for line in lines:
        a, b = Point(line.coords[0]), Point(line.coords[-1])
        fixed.append(LineString(line.coords[::-1]) if b.distance(start) < a.distance(start) else line)
    fixed.sort(key=lambda l: Point(l.coords[0]).distance(start))
    return fixed[0] if len(fixed) == 1 else MultiLineString(fixed)


def load_river_geometry(dim_river: pd.DataFrame) -> gpd.GeoDataFrame:
    """Full-detail river lines from the shapefile, oriented, with the tile properties attached."""
    shp = gpd.read_file(main.RIVER_PATH, engine="pyogrio")[["OBJECTID", "geometry"]]
    shp = shp.rename(columns={"OBJECTID": "river_id"}).merge(
        dim_river[["river_id", "river_name", "basin", "length_km", "dam_count", "is_major_river",
                   "start_lon", "start_lat"]], on="river_id")
    starts = gpd.GeoSeries(gpd.points_from_xy(shp["start_lon"], shp["start_lat"]),
                           crs="EPSG:4326").to_crs(shp.crs)
    shp["geometry"] = [orient_parts(g, None if s.is_empty or pd.isna(s.x) else s)
                       for g, s in zip(shp.geometry, starts)]
    return shp


def river_bboxes(geo: gpd.GeoDataFrame) -> dict:
    b = geo.to_crs("EPSG:4326").geometry.bounds.round(4)
    return {int(i): [r.minx, r.miny, r.maxx, r.maxy] for i, r in zip(geo["river_id"], b.itertuples())}


def tile_bounds(z, x, y):
    size = 2 * ORIGIN / 2 ** z
    minx, maxy = -ORIGIN + x * size, ORIGIN - y * size
    return minx, maxy - size, minx + size, maxy


def build_tiles(geo: gpd.GeoDataFrame) -> int:
    """Write web-mercator vector tiles (layer "rivers") for every zoom in TILE_ZOOMS."""
    merc = geo.to_crs("EPSG:3857")
    props = [{k: v for k, v in {
        "id": int(r.river_id), "name": clean(r.river_name), "basin": clean(r.basin),
        "len": clean(r.length_km), "dams": int(r.dam_count), "major": bool(r.is_major_river),
    }.items() if v is not None} for r in merc.itertuples(index=False)]
    lengths = merc["length_km"].fillna(0).to_numpy()
    geoms = merc.geometry.to_numpy()
    minx, miny, maxx, maxy = merc.total_bounds

    if TILE_DIR.exists():
        shutil.rmtree(TILE_DIR)
    written = 0
    for z in TILE_ZOOMS:
        t0 = time.time()
        size = 2 * ORIGIN / 2 ** z
        keep = np.where(lengths >= MIN_LEN_KM.get(z, 0))[0]
        simple = shapely.simplify(geoms[keep], size / EXTENT, preserve_topology=False)  # ~1 tile unit
        tree = shapely.STRtree(simple)
        buf = size * BUFFER / EXTENT
        x0, x1 = int((minx + ORIGIN) // size), int((maxx + ORIGIN) // size)
        y0, y1 = int((ORIGIN - maxy) // size), int((ORIGIN - miny) // size)
        n = 0
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                bx0, by0, bx1, by1 = tile_bounds(z, x, y)
                hit = tree.query(shapely.box(bx0 - buf, by0 - buf, bx1 + buf, by1 + buf))
                if not len(hit):
                    continue
                clipped = shapely.clip_by_rect(simple[hit], bx0 - buf, by0 - buf, bx1 + buf, by1 + buf)
                feats = [{"geometry": g, "properties": props[keep[i]]}
                         for g, i in zip(clipped, hit) if not g.is_empty]
                if not feats:
                    continue
                data = mapbox_vector_tile.encode(
                    [{"name": "rivers", "features": feats}],
                    default_options={"quantize_bounds": (bx0, by0, bx1, by1), "extents": EXTENT})
                out = TILE_DIR / str(z) / str(x) / f"{y}.pbf"
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_bytes(data)
                n += 1
        written += n
        print(f"  tiles z{z:<2} {n:>5} tiles  ({time.time() - t0:.1f}s)")
    return written


def build_rivers(dim_river: pd.DataFrame, bboxes: dict) -> list:
    cols = ["river_id", "river_name", "alt_name", "basin", "sub_basin", "length_km", "length_band",
            "origin", "major_tributaries", "confluence", "states", "state_count", "is_interstate",
            "is_major_river", "start_lat", "start_lon", "start_state", "start_district",
            "start_subdistrict", "start_village", "end_lat", "end_lon", "end_state", "end_district",
            "end_subdistrict", "end_village", "dam_count", "large_dam_count", "total_storage_mcm",
            "tallest_dam_m", "dams_per_100km"]
    rows = records(dim_river[cols].rename(columns={"river_id": "id", "river_name": "name"}))
    # Percentile of length within its basin, for the "how long is it" comparison
    # (rows without a basin are dropped by groupby, so align on the index, not by position)
    pct = dim_river.groupby("basin")["length_km"].rank(pct=True).round(3).reindex(dim_river.index)
    for row, p in zip(rows, pct.values):
        row["len_pct_basin"] = clean(p)
        row["bbox"] = bboxes.get(row["id"])
    return rows


def build_dams(fact_dam: pd.DataFrame) -> list:
    d = fact_dam.copy()
    d["purpose_group"] = d["primary_purpose"].where(d["primary_purpose"].isin(PURPOSE_GROUPS), "Other")
    for c, out in [("height_m", "height_pct"), ("gross_storage_mcm", "storage_pct"),
                   ("length_m", "length_pct"), ("spillway_capacity_cumecs", "spillway_pct")]:
        d[out] = d[c].rank(pct=True).round(3)
    cols = ["dam_id", "dam_name", "state", "district", "sdso", "incharge", "river_reported",
            "basin_reported", "river_id", "nearest_river", "river_basin", "river_sub_basin",
            "distance_to_river_m", "river_match", "height_m", "completion_year", "decade", "era",
            "max_water_level_m", "full_reservoir_level_m", "gross_storage_mcm", "gross_storage_mcm_raw",
            "storage_suspect", "spillway_capacity_cumecs", "length_m", "dam_type", "purpose",
            "primary_purpose", "purpose_group", "is_multipurpose", "height_class", "is_large_dam",
            "storage_class", "latitude", "longitude", "latitude_dms", "longitude_dms",
            "height_pct", "storage_pct", "length_pct", "spillway_pct"]
    rows = records(d[cols].rename(columns={"dam_id": "id", "dam_name": "name"}))
    for row in rows:
        row["purposes"] = [p.strip() for p in (row["purpose"] or "").split("/") if p.strip()]
    return rows


def build_summary(t: dict) -> dict:
    r, d = t["dim_river"], t["fact_dam"]
    return {
        "kpis": {
            "river_count": len(r),
            "river_length_km": round(float(r["length_km"].sum())),
            "interstate_rivers": int(r["is_interstate"].sum()),
            "basins": int(r["basin"].nunique()),
            "dam_count": len(d),
            "large_dam_count": int(d["is_large_dam"].sum()),
            "storage_mcm": round(float(d["gross_storage_mcm"].sum())),
            "rivers_with_dams": int(r["has_dam"].sum()),
            "pct_rivers_dammed": round(float(r["has_dam"].mean() * 100), 1),
            "median_year": int(d["completion_year"].median()),
            "tallest_dam_m": float(d["height_m"].max()),
            "states": int(d["state"].nunique()),
            "storage_suspect": int(d["storage_suspect"].sum()),
            "unmatched_dams": int((d["river_match"] != "Matched").sum()),
        },
        "decades": records(t["decade_summary"]),
        "basins": records(t["basin_summary"]),
        "states": records(t["state_summary"].dropna(subset=["state"])),
        "purposes": records(t["purpose_summary"]),
        "dam_types": records(t["dam_type_summary"]),
        "height_classes": records(d["height_class"].value_counts().rename_axis("class")
                                  .reset_index(name="count")),
        "eras": records(d["era"].value_counts().rename_axis("era").reset_index(name="count")),
        "top_dammed_rivers": records(t["top_dammed_rivers"].head(10)),
        "longest_rivers": records(r.nlargest(10, "length_km")[
            ["river_id", "river_name", "basin", "length_km", "dam_count", "states"]]),
        "tallest_dams": records(d.nlargest(10, "height_m")[
            ["dam_id", "dam_name", "state", "nearest_river", "height_m", "completion_year"]]),
        "largest_reservoirs": records(d.nlargest(10, "gross_storage_mcm")[
            ["dam_id", "dam_name", "state", "nearest_river", "gross_storage_mcm", "completion_year"]]),
    }


def columnar(rows: list) -> dict:
    """{"columns": [...], "rows": [[...], ...]} - repeats no keys, ~3x smaller than records."""
    cols = list(rows[0].keys())
    return {"columns": cols, "rows": [[r[c] for c in cols] for r in rows]}


def write(name, obj):
    path = WEB_DATA / name
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  {name:<16} {path.stat().st_size / 1e6:6.2f} MB")


if __name__ == "__main__":
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    for old in ("rivers.geojson", "rivers_major.geojson"):  # replaced by vector tiles
        (WEB_DATA / old).unlink(missing_ok=True)
    print("\nPreparing river geometry...")
    geo = load_river_geometry(main.dim_river)
    print("Writing vector tiles...")
    total = build_tiles(geo)
    print(f"  {total:,} tiles -> {TILE_DIR}")
    print("Writing web data...")
    write("rivers.json", columnar(build_rivers(main.dim_river, river_bboxes(geo))))
    write("dams.json", columnar(build_dams(main.fact_dam)))
    write("summary.json", build_summary(main.tables))
    print(f"Done -> {WEB_DATA}")
