"""
Indian Rivers & Dams analysis -> Power BI ready tables.

Inputs  (Data Source/):
    river_network_shape/River_Network.shp   30k river reaches (Lambert Conformal Conic, metres)
    dam.geojson                             6.6k dams (same LCC coordinates, despite the file saying WGS84)

Outputs (Output/):
    CSV + Parquet for every table below (Power BI: Get Data > Text/CSV or Parquet),
    plus a simplified rivers GeoJSON (WGS84) for map visuals (Icon Map / Azure Maps).

Run standalone:      python main.py
Run inside Power BI: Get Data > Python script, paste (only this line holds a path):
                         __file__ = r"<full path>\main.py"
                         exec(open(__file__, encoding="utf-8").read())
                     Power BI will list every pandas DataFrame below as a table
                     (dim_river, fact_dam, basin_summary, ...).
"""

import os
import re
import warnings
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

def find_base_dir() -> Path:
    """
    Checked in order:
      1. RIVERS_BASE_DIR environment variable
      2. the folder this file lives in (python main.py, import main, VS Code)
      3. the current working directory and its parents
    Power BI runs the code via exec() from a temp folder, so there set __file__ to this
    file's path before exec (see the module docstring) and step 2 finds it.
    """
    candidates = []
    if os.environ.get("RIVERS_BASE_DIR"):
        candidates.append(Path(os.environ["RIVERS_BASE_DIR"]))
    try:
        candidates.append(Path(__file__).resolve().parent)
    except NameError:  # exec() without __file__
        pass
    cwd = Path.cwd().resolve()
    candidates += [cwd, *cwd.parents]

    for c in candidates:
        if (c / "Data Source").is_dir():
            return c
    raise FileNotFoundError(
        'Could not find the "Data Source" folder. Run from the project folder, set the '
        "RIVERS_BASE_DIR environment variable, or (in Power BI) set __file__ to main.py's path "
        "before exec().")


BASE_DIR = find_base_dir()

DATA_DIR = BASE_DIR / "Data Source"
OUT_DIR = BASE_DIR / "Output"
RIVER_PATH = DATA_DIR / "river_network_shape" / "River_Network.shp"
DAM_PATH = DATA_DIR / "dam.geojson"

WGS84 = "EPSG:4326"
MAX_SNAP_DISTANCE_M = 5_000      # a dam further than this from any mapped river is "unmatched"
LARGE_DAM_HEIGHT_M = 15          # ICOLD definition of a large dam


# --------------------------------------------------------------------------- load

def load_rivers() -> gpd.GeoDataFrame:
    rivers = gpd.read_file(RIVER_PATH, engine="pyogrio")
    print(f"Rivers loaded: {len(rivers):,} reaches, CRS = LCC metres")
    return rivers


def load_dams(river_crs) -> gpd.GeoDataFrame:
    dams = gpd.read_file(DAM_PATH, engine="pyogrio")
    # GeoJSON always reports EPSG:4326, but the coordinates are the river LCC metres.
    if dams.geometry.x.abs().max() > 360:
        dams = dams.set_crs(river_crs, allow_override=True)
    print(f"Dams loaded:   {len(dams):,} dams")
    return dams


# --------------------------------------------------------------------------- clean

def dms_to_decimal(value):
    """'11° 37' 28.000" N' -> 11.6244. Tolerates mangled degree symbols."""
    if not isinstance(value, str):
        return np.nan
    nums = re.findall(r"\d+(?:\.\d+)?", value)
    if not nums:
        return np.nan
    d, m, s = (list(map(float, nums)) + [0, 0])[:3]
    dec = d + m / 60 + s / 3600
    return -dec if value.strip()[-1:].upper() in ("S", "W") else dec


def clean_text(s: pd.Series) -> pd.Series:
    s = s.astype("string").str.strip()
    return s.replace({"": pd.NA, "zzz": pd.NA, "Data Partially Available": pd.NA,
                      "Not Available": pd.NA, "N/A": pd.NA, "NA": pd.NA})


def clean_rivers(rivers: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    r = rivers.copy()
    r = r.rename(columns={
        "OBJECTID": "river_id", "rivname": "river_name", "ba_name": "basin",
        "st_pt_lat": "start_lat", "st_pt_long": "start_lon",
        "st_loc_ste": "start_state", "st_loc_dst": "start_district",
        "st_loc_sb_": "start_subdistrict", "st_loc_vil": "start_village",
        "en_pt_lat": "end_lat", "en_pt_long": "end_lon",
        "en_loc_ste": "end_state", "en_loc_dst": "end_district",
        "en_loc_sb_": "end_subdistrict", "en_loc_vil": "end_village",
        "lat": "mid_lat", "long": "mid_lon", "UID_River": "uid_river",
        "state_al": "states", "Confluence": "confluence", "remark": "alt_name",
        "major_trib": "major_tributaries",
    }).drop(columns=["Shape_Leng"])

    text_cols = r.select_dtypes(include="object").columns.drop("geometry", errors="ignore")
    for c in text_cols:
        r[c] = clean_text(r[c])

    r["length_km"] = r["length_km"].round(2)
    r["length_band"] = pd.cut(
        r["length_km"], [0, 10, 25, 50, 100, 250, 500, np.inf],
        labels=["<10 km", "10-25 km", "25-50 km", "50-100 km", "100-250 km", "250-500 km", "500+ km"],
        right=False).astype("string")
    r["state_count"] = r["states"].fillna("").str.split(",").apply(lambda x: len([s for s in x if s.strip()]))
    r["is_interstate"] = r["state_count"] > 1
    r["is_major_river"] = r["sub_basin"].eq("Major River")
    return r


def clean_dams(dams: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    d = dams.copy()
    d = d.rename(columns={
        "PIC": "dam_id", "dm_name": "dam_name", "river": "river_reported",
        "basin": "basin_reported", "ht_found": "height_m", "cmp_year": "completion_year",
        "mx_wt_lel": "max_water_level_m", "frl": "full_reservoir_level_m",
        "gs_st_cap": "gross_storage_mcm", "ds_sp_cap": "spillway_capacity_cumecs",
        "dm_length": "length_m", "dm_type": "dam_type",
        "latitude": "latitude_dms", "longitude": "longitude_dms",
    })

    for c in ["dam_name", "sdso", "state", "district", "river_reported", "incharge",
              "basin_reported", "purpose"]:
        d[c] = clean_text(d[c])

    # dam_type has stray bullet / tab characters ("· HOMOGENEOUS EARTHEN DAM")
    d["dam_type"] = (d["dam_type"].astype("string")
                     .str.replace(r"^[^A-Za-z]+", "", regex=True)
                     .str.replace(r"\s+", " ", regex=True)
                     .str.replace("EARTHFILL(EMBANKMENT)", "EARTHFILL (EMBANKMENT)", regex=False)
                     .str.strip().str.title())

    # Zeros mean "unknown"; levels above Everest are data-entry errors.
    d["completion_year"] = d["completion_year"].where(d["completion_year"].between(1800, 2100)).astype("Int64")
    for c in ["max_water_level_m", "full_reservoir_level_m"]:
        d[c] = d[c].where(d[c].between(0.01, 9000))
    for c in ["length_m", "spillway_capacity_cumecs", "gross_storage_mcm"]:
        d[c] = d[c].where(d[c] > 0)
    # A <20 m dam holding >1,000 MCM is a unit-entry error (e.g. Kekatpur 125,639 MCM vs
    # India's largest reservoir ~12,000 MCM). Keep the raw value, exclude it from totals.
    d["gross_storage_mcm_raw"] = d["gross_storage_mcm"]
    d["storage_suspect"] = (d["gross_storage_mcm"] > 1000) & (d["height_m"] < 20)
    d.loc[d["storage_suspect"], "gross_storage_mcm"] = np.nan

    # The source file's degree symbol is mis-encoded (shows as "�"); restore it.
    for c in ["latitude_dms", "longitude_dms"]:
        d[c] = d[c].astype("string").str.replace(r"[^\x20-\x7E]+", "°", regex=True)
    d["latitude"] = d["latitude_dms"].map(dms_to_decimal).round(6)
    d["longitude"] = d["longitude_dms"].map(dms_to_decimal).round(6)
    # Fall back to the projected geometry where the DMS text is missing or nonsense.
    geo = d.geometry.to_crs(WGS84)
    bad = ~d["latitude"].between(5, 40) | ~d["longitude"].between(65, 100)
    d.loc[bad, "latitude"] = geo.y[bad].round(6)
    d.loc[bad, "longitude"] = geo.x[bad].round(6)

    d["decade"] = (d["completion_year"] // 10 * 10).astype("Int64").astype("string") + "s"
    d["era"] = pd.cut(d["completion_year"].astype(float), [0, 1947, 1980, 2000, 2100],
                      labels=["Pre-Independence", "1947-1979", "1980-1999", "2000+"],
                      right=False).astype("string")
    d["height_class"] = pd.cut(d["height_m"], [0, LARGE_DAM_HEIGHT_M, 30, 60, 100, np.inf],
                               labels=["<15 m", "15-30 m", "30-60 m", "60-100 m", "100+ m"],
                               right=False).astype("string")
    d["is_large_dam"] = d["height_m"] >= LARGE_DAM_HEIGHT_M
    d["storage_class"] = pd.cut(d["gross_storage_mcm"], [0, 1, 10, 100, 1000, np.inf],
                                labels=["<1 MCM", "1-10 MCM", "10-100 MCM", "100-1000 MCM", "1000+ MCM"],
                                right=False).astype("string")
    d["primary_purpose"] = d["purpose"].str.split("/").str[0].str.strip()
    d["purpose_count"] = d["purpose"].fillna("").str.split("/").apply(lambda x: len([p for p in x if p.strip()]))
    d["is_multipurpose"] = d["purpose_count"] > 1
    return d


# --------------------------------------------------------------------------- spatial

def link_dams_to_rivers(dams: gpd.GeoDataFrame, rivers: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Attach the nearest mapped river reach to every dam (projected CRS, metres)."""
    joined = gpd.sjoin_nearest(
        dams, rivers[["river_id", "river_name", "basin", "sub_basin", "geometry"]],
        how="left", distance_col="distance_to_river_m")
    joined = joined.sort_values("distance_to_river_m").drop_duplicates("dam_id").drop(columns="index_right")
    far = joined["distance_to_river_m"] > MAX_SNAP_DISTANCE_M
    joined.loc[far, ["river_id", "river_name", "basin", "sub_basin"]] = pd.NA
    joined["distance_to_river_m"] = joined["distance_to_river_m"].round(1)
    joined["river_match"] = np.where(far, "No river within 5 km", "Matched")
    joined = joined.rename(columns={"river_name": "nearest_river", "basin": "river_basin",
                                    "sub_basin": "river_sub_basin"})
    joined["river_id"] = joined["river_id"].astype("Int64")
    matched = (~far).sum()
    print(f"Dams matched to a river within {MAX_SNAP_DISTANCE_M/1000:.0f} km: {matched:,} / {len(joined):,}")
    return joined.sort_index()


# --------------------------------------------------------------------------- tables

def build_tables(rivers: gpd.GeoDataFrame, dams: gpd.GeoDataFrame) -> dict:
    # Dimension: rivers (no geometry - Power BI cannot import it)
    dam_stats = (dams.dropna(subset=["river_id"]).groupby("river_id")
                 .agg(dam_count=("dam_id", "count"),
                      large_dam_count=("is_large_dam", "sum"),
                      total_storage_mcm=("gross_storage_mcm", "sum"),
                      tallest_dam_m=("height_m", "max")))
    dim_river = pd.DataFrame(rivers.drop(columns="geometry")).merge(
        dam_stats, left_on="river_id", right_index=True, how="left")
    dim_river[["dam_count", "large_dam_count"]] = dim_river[["dam_count", "large_dam_count"]].fillna(0).astype(int)
    dim_river["total_storage_mcm"] = dim_river["total_storage_mcm"].fillna(0).round(2)
    dim_river["dams_per_100km"] = (dim_river["dam_count"] / dim_river["length_km"] * 100).round(3)
    dim_river["has_dam"] = dim_river["dam_count"] > 0
    # Power BI can't import geometry objects, but the Icon Map visual draws WKT text.
    # Simplifying to 250 m keeps every river under Power BI's 32,766-char text limit.
    dim_river["geometry_wkt"] = (rivers.geometry.simplify(250).to_crs(WGS84)
                                 .to_wkt(rounding_precision=5).values)

    # Fact: dams
    fact_dam = pd.DataFrame(dams.drop(columns="geometry"))

    # Bridge: dam <-> purpose (a dam can serve several purposes)
    bridge_dam_purpose = (fact_dam[["dam_id", "purpose"]].dropna()
                          .assign(purpose=lambda x: x["purpose"].str.split("/"))
                          .explode("purpose")
                          .assign(purpose=lambda x: x["purpose"].str.strip())
                          .query("purpose != ''").drop_duplicates())

    # Bridge: river <-> state (a river can flow through several states)
    bridge_river_state = (dim_river[["river_id", "states"]].dropna()
                          .assign(state=lambda x: x["states"].str.split(","))
                          .explode("state")
                          .assign(state=lambda x: x["state"].str.strip())
                          .query("state != ''")[["river_id", "state"]].drop_duplicates())

    # Basin summary (uses the river network's basin so both datasets line up)
    river_basin = dim_river.groupby("basin").agg(
        river_count=("river_id", "count"),
        total_river_length_km=("length_km", "sum"),
        longest_river_km=("length_km", "max"),
        interstate_rivers=("is_interstate", "sum"),
        rivers_with_dams=("has_dam", "sum"))
    dam_basin = fact_dam.dropna(subset=["river_basin"]).groupby("river_basin").agg(
        dam_count=("dam_id", "count"),
        large_dam_count=("is_large_dam", "sum"),
        total_storage_mcm=("gross_storage_mcm", "sum"),
        avg_dam_height_m=("height_m", "mean"),
        median_completion_year=("completion_year", "median"))
    basin_summary = river_basin.join(dam_basin, how="left").fillna(0).reset_index()
    basin_summary["dams_per_1000km"] = (basin_summary["dam_count"] / basin_summary["total_river_length_km"] * 1000)
    basin_summary["pct_rivers_dammed"] = basin_summary["rivers_with_dams"] / basin_summary["river_count"] * 100
    basin_summary = basin_summary.round(2).sort_values("dam_count", ascending=False)

    # State summary
    river_state = bridge_river_state.merge(dim_river[["river_id", "length_km"]], on="river_id") \
        .groupby("state").agg(river_count=("river_id", "nunique"), river_length_km=("length_km", "sum"))
    dam_state = fact_dam.groupby("state").agg(
        dam_count=("dam_id", "count"),
        large_dam_count=("is_large_dam", "sum"),
        total_storage_mcm=("gross_storage_mcm", "sum"),
        avg_dam_height_m=("height_m", "mean"),
        tallest_dam_m=("height_m", "max"),
        oldest_dam_year=("completion_year", "min"),
        newest_dam_year=("completion_year", "max"))
    state_summary = dam_state.join(river_state, how="outer").reset_index().rename(columns={"index": "state"})
    state_summary[["dam_count", "large_dam_count", "river_count"]] = \
        state_summary[["dam_count", "large_dam_count", "river_count"]].fillna(0).astype(int)
    state_summary = state_summary.round(2).sort_values("dam_count", ascending=False)

    # Dams built per decade (time series)
    decade_summary = (fact_dam.dropna(subset=["completion_year"]).groupby("decade")
                      .agg(dams_completed=("dam_id", "count"),
                           storage_added_mcm=("gross_storage_mcm", "sum"),
                           avg_height_m=("height_m", "mean"))
                      .reset_index().sort_values("decade"))
    decade_summary["cumulative_dams"] = decade_summary["dams_completed"].cumsum()
    decade_summary["cumulative_storage_mcm"] = decade_summary["storage_added_mcm"].cumsum()
    decade_summary = decade_summary.round(2)

    # Purpose & type breakdown
    purpose_summary = (bridge_dam_purpose.merge(fact_dam[["dam_id", "gross_storage_mcm", "height_m"]], on="dam_id")
                       .groupby("purpose").agg(dam_count=("dam_id", "count"),
                                               total_storage_mcm=("gross_storage_mcm", "sum"),
                                               avg_height_m=("height_m", "mean"))
                       .round(2).reset_index().sort_values("dam_count", ascending=False))
    dam_type_summary = (fact_dam.assign(dam_type=fact_dam["dam_type"].fillna("Unknown"))
                        .groupby("dam_type").agg(dam_count=("dam_id", "count"),
                                                 avg_height_m=("height_m", "mean"),
                                                 total_storage_mcm=("gross_storage_mcm", "sum"))
                        .round(2).reset_index().sort_values("dam_count", ascending=False))

    # Top rivers by number of dams
    top_dammed_rivers = (dim_river.query("dam_count > 0")
                         .sort_values(["dam_count", "total_storage_mcm"], ascending=False)
                         [["river_id", "river_name", "basin", "sub_basin", "length_km", "dam_count",
                           "large_dam_count", "total_storage_mcm", "tallest_dam_m", "dams_per_100km"]]
                         .head(50))

    # Data quality report - useful as a "notes" page in the report
    dq = []
    for name, df in [("dim_river", dim_river), ("fact_dam", fact_dam)]:
        for c in df.columns:
            dq.append({"table": name, "column": c, "rows": len(df),
                       "missing": int(df[c].isna().sum()),
                       "pct_missing": round(df[c].isna().mean() * 100, 2),
                       "distinct": int(df[c].nunique())})
    data_quality = pd.DataFrame(dq)

    return {
        "dim_river": dim_river,
        "fact_dam": fact_dam,
        "bridge_dam_purpose": bridge_dam_purpose,
        "bridge_river_state": bridge_river_state,
        "basin_summary": basin_summary,
        "state_summary": state_summary,
        "decade_summary": decade_summary,
        "purpose_summary": purpose_summary,
        "dam_type_summary": dam_type_summary,
        "top_dammed_rivers": top_dammed_rivers,
        "data_quality": data_quality,
    }


# --------------------------------------------------------------------------- export

def export(tables: dict, rivers: gpd.GeoDataFrame) -> None:
    # Parquet is optional: it needs pyarrow (pip install pyarrow). CSV always works.
    try:
        import pyarrow  # noqa: F401
        write_parquet = True
    except ImportError:
        write_parquet = False
        print("  pyarrow not installed - skipping Parquet, writing CSV only (pip install pyarrow)")

    (OUT_DIR / "csv").mkdir(parents=True, exist_ok=True)
    if write_parquet:
        (OUT_DIR / "parquet").mkdir(parents=True, exist_ok=True)
    for name, df in tables.items():
        # utf-8-sig so Power BI / Excel read Indian place names correctly
        df.to_csv(OUT_DIR / "csv" / f"{name}.csv", index=False, encoding="utf-8-sig")
        if write_parquet:
            df.to_parquet(OUT_DIR / "parquet" / f"{name}.parquet", index=False)
        print(f"  {name:<22} {len(df):>7,} rows")

    # Lightweight map layer: simplified major rivers + rivers with dams, WGS84 GeoJSON
    keep = rivers["is_major_river"] | rivers["river_id"].isin(
        tables["dim_river"].loc[tables["dim_river"]["has_dam"], "river_id"])
    geo = rivers.loc[keep, ["river_id", "river_name", "basin", "length_km", "geometry"]].copy()
    geo["geometry"] = geo.geometry.simplify(250)  # metres
    geo.to_crs(WGS84).to_file(OUT_DIR / "rivers_map_layer.geojson", driver="GeoJSON")
    print(f"  rivers_map_layer.geojson  {len(geo):,} features")
    print(f"\nExported to: {OUT_DIR}")


# --------------------------------------------------------------------------- main

def print_insights(t: dict) -> None:
    r, d = t["dim_river"], t["fact_dam"]
    print("\n=== Key insights ===")
    print(f"Rivers: {len(r):,} reaches, {r['length_km'].sum():,.0f} km total, "
          f"{r['is_interstate'].sum():,} interstate")
    print(f"Dams:   {len(d):,} total, {d['is_large_dam'].sum():,} large (>=15 m), "
          f"{d['gross_storage_mcm'].sum():,.0f} MCM gross storage")
    print(f"Rivers with at least one dam: {r['has_dam'].sum():,} ({r['has_dam'].mean():.1%})")
    print("Top 5 states by dams:  " + ", ".join(
        f"{s} ({n})" for s, n in t["state_summary"][["state", "dam_count"]].head(5).values))
    print("Top 5 basins by dams:  " + ", ".join(
        f"{b} ({int(n)})" for b, n in t["basin_summary"][["basin", "dam_count"]].head(5).values))
    print("Top 5 dammed rivers:   " + ", ".join(
        f"{rv} ({n})" for rv, n in t["top_dammed_rivers"][["river_name", "dam_count"]].head(5).values))
    peak = t["decade_summary"].sort_values("dams_completed").iloc[-1]
    print(f"Peak construction decade: {peak['decade']} ({int(peak['dams_completed'])} dams)")


rivers_gdf = clean_rivers(load_rivers())
dams_gdf = link_dams_to_rivers(clean_dams(load_dams(rivers_gdf.crs)), rivers_gdf)
tables = build_tables(rivers_gdf, dams_gdf)

# Expose each table as a top-level DataFrame so Power BI's Python connector can pick them up.
dim_river = tables["dim_river"]
fact_dam = tables["fact_dam"]
bridge_dam_purpose = tables["bridge_dam_purpose"]
bridge_river_state = tables["bridge_river_state"]
basin_summary = tables["basin_summary"]
state_summary = tables["state_summary"]
decade_summary = tables["decade_summary"]
purpose_summary = tables["purpose_summary"]
dam_type_summary = tables["dam_type_summary"]
top_dammed_rivers = tables["top_dammed_rivers"]
data_quality = tables["data_quality"]

if __name__ == "__main__":
    print_insights(tables)
    print("\nExporting...")
    export(tables, rivers_gdf)

# GeoDataFrames are not importable by Power BI; drop them from the namespace.
del rivers_gdf, dams_gdf
