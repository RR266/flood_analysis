# Flood Analysis of India

**Live site:** https://rr266.github.io/flood_analysis/

The long-term goal of this project is to analyse floods in India. Floods depend on where rivers flow and how much water the dams and reservoirs along them are holding. So the project starts by mapping that water system, and builds towards flood analysis in three phases.

## Roadmap

| Phase | Status | What it covers |
|---|---|---|
| **1. Know the water system** | Live | Where each river begins and where it ends or joins another river; where the dams and reservoirs are, what they are built for, and how much water they can store. |
| **2. Live reservoir levels** | Next | Current water levels in dams and reservoirs, shown against each one's capacity, and how they change through the monsoon. |
| **3. Flood analysis** | Planned | Combining the river network, reservoir storage and live levels to study which basins and rivers are most exposed to floods. |

## What's in phase 1

- **30,395 river reaches** (594,000 km), each traced from source to mouth
- **6,644 dams**, linked to the nearest river, with height, storage, purpose and completion year
- **6,152 reservoirs** (25,289 km² of water surface), linked to the dams that hold them back
- An interactive website (Overview, Explore map, Details profiles) and Power BI–ready tables in `Output/`

## Data sources

| Dataset | Source |
|---|---|
| River network | [India-WRIS](https://indiawris.gov.in), Ministry of Jal Shakti |
| Dams | India-WRIS dam layer, attributes per the National Register of Large Dams ([Central Water Commission](https://cwc.gov.in)) |
| Reservoirs | [National Water Data Portal - reservoir layer](https://nwdp.nwic.gov.in/dataset/reservoir), National Water Informatics Centre |

## Built with

Python (GeoPandas) for processing, Power BI and QGIS for analysis, and D3.js with Mapbox GL JS for the website.
