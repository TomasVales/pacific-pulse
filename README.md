# Pacific Pulse

**An interactive 3D globe that shows how El Niño and La Niña reshape rain, heat and risk across Latin America over the next six months.**

Pacific Pulse links cause and effect in one 3D space. A glowing heat anomaly over the equatorial Pacific (the Niño 3.4 region) feeds atmospheric "energy arcs" into a dense grid of about 2,600 hexagonal columns covering Latin America, from Mexico and the Caribbean to Tierra del Fuego. Each column rises and changes colour with the expected rain anomaly, temperature anomaly or sector risk. The whole map animates month by month.

Everything is driven by real data. The Oceanic Niño Index (ONI) comes from NOAA, and city-level observations come from the ERA5 reanalysis. A Python pipeline produces a statistical forecast, models the regional teleconnections and exports compact JSON for the web app.

## What you can do

- **Explore the globe.** The interface is a dark, translucent, Apple Find My–style UI rendered with WebGL (three.js / globe.gl). It includes wind-flow particles and a pulsing Pacific anomaly.
- **Switch layers.** Four layers are available: *Climate* (rain or temperature), *Agriculture*, *Energy & dams*, and *Urban health*.
- **Play the next six months.** A media-style timeline smoothly interpolates every column month by month.
- **Search with ⌘K / Ctrl K.** Type any of 30 major cities or any Latin American country and the camera flies there.
- **Open a location card.** The Apple Weather–style card shows a 6-month forecast, a sector risk breakdown, the closest historical analog year, practical recommendations and a downloadable PNG share card.
- **Run the What-If simulator.** Drag the ONI from −2.0 °C (extreme La Niña) to +2.5 °C (extreme El Niño). Every column and city is recomputed live in the browser.
- **Compare with the past.** Switch the globe to the three most similar historical ENSO cycles, found by a k-NN search over 12-month ONI windows since 1950.
- **Take the guided tour.** A four-stop cinematic story (Pacific → Amazon & northern Andes → Southern Cone & La Plata basin → Central America & Caribbean) uses figures computed from the live data.

## Project layout

```
pipeline/   Python data pipeline: fetch → clean → model → export  →  web/public/data/*.json
web/        Vite + React + TypeScript + globe.gl / three.js front end
.github/    Monthly GitHub Action that refreshes the data and commits it
```

## Running locally

Requirements: Python ≥ 3.9 and Node ≥ 20.

```bash
# 1) Data pipeline
python3 -m venv .venv
.venv/bin/pip install -r pipeline/requirements.txt
.venv/bin/python pipeline/run.py            # add --offline to use only snapshots/caches
.venv/bin/python -m unittest discover -s pipeline/tests

# 2) Web app
cd web
npm install
npm run dev        # http://localhost:5173
npm test           # Python ↔ TypeScript model parity tests
npm run build      # static production build in web/dist
```

The generated JSON files are committed in `web/public/data`, so the app runs without executing the pipeline first.

## How the data science works

### 1. ONI acquisition with layered fallbacks (`oni_sources.py`)
The ONI is the 3-month running mean of SST anomalies in Niño 3.4 (5°N–5°S, 170°–120°W). The pipeline tries the following sources in order:

1. NOAA CPC (`oni.ascii.txt`)
2. NOAA PSL (`oni.data`)
3. The last validated snapshot committed to the repo
4. A reconstruction calibrated on the catalogue of real ENSO events: 1957-58, 1972-73, 1982-83, 1997-98, 2010-11, 2015-16, 2020-23, 2023-24 and others. The tests check that it correlates with the real ONI at r > 0.75.

Every source goes through the same validation: monthly continuity since 1950, physical range, and known anchors (Dec 1997, Dec 2015, Dec 1988).

### 2. Six-month projection (`forecast.py`)
The projection is a hybrid ensemble of two classic methods:
- **Seasonal regression.** `ONI(t+L) = a + b·ONI(t) + c·[ONI(t) − ONI(t−3)]`, fitted separately for each start month and lead time.
- **Analog k-NN.** The last 12 months are matched against every historical window that ends in the same calendar month, and the continuations of the 8 nearest windows are averaged.

The blend weight and the 80 % uncertainty band are calibrated per lead time by a leave-one-year-out hindcast (1980 to present).

### 3. Analog years (`analogs.py`)
The query is the 12-month trajectory made of recent observations plus the projection. It is compared with every moving window since 1950, using a weighted RMSE (amplitude) and a Pearson correlation (shape):

`similarity = 100·[0.5·exp(−(RMSE/0.75)²) + 0.5·max(r, 0)]`

The three most similar non-overlapping windows are exported, each with its narrative and ONI series.

### 4. Geospatial teleconnections (`model.py`)
Each grid cell gets monthly sensitivity coefficients to the ONI: rain in % per °C and temperature in °C per °C. These come from the sum of regional Gaussian kernels based on the literature (Ropelewski & Halpert 1987; Grimm 2003; Cai et al. 2020).
- **Regions covered:** the north Peru/Ecuador coast, the La Plata basin, southern Brazil, the Amazon, northeast Brazil, Colombia–Venezuela, the Central American Dry Corridor, the Caribbean, Mexico, central Chile, Patagonia, the Altiplano and southeast Brazil.
- **Elevation-aware kernels:** some kernels depend on the real elevation (Copernicus DEM), so the Peruvian coast gets wetter while the Altiplano dries.
- **Asymmetric response:** La Niña has its own coefficients.
- **Rain saturation:** rain anomalies saturate smoothly (`tanh`) between −85 % and +150 %.
- **Warming trend:** each location's measured warming trend is added to the temperature anomaly.

### 5. Calibration and validation with ERA5
For the 30 cities, daily ERA5 data (via Open-Meteo) is turned into a 1991-2020 climatology, a warming trend and an empirical regression of seasonal anomalies on the ONI. The kernel model acts as a prior and is merged with that regression in a Bayesian way, weighted by its standard error.

Against observed ERA5 anomalies, the uncalibrated model reaches a mean monthly correlation of r ≈ 0.23 for rain and r ≈ 0.39 for temperature. These values are stored in `manifest.json`.

Downloads respect Open-Meteo's free-tier quota:
- they are incremental;
- a per-minute limit is waited out;
- an hourly or daily limit stops the run, and the next run resumes where it left off.

### 6. Sector risk indices (0–100)
- **Agriculture:** exposure of each crop belt (soy, maize, coffee, banana, fruit, rice, sugar cane) × crop calendar × (drought + waterlogging + heat).
- **Energy & water:** proximity to 23 large dams (Itaipú, Guri, Belo Monte, Hidroituango, the Panama Canal…) × inflow deficit or excess, plus cooling-demand peaks in cities.
- **Urban health:** urban exposure × (heat stress + thermal and moisture suitability for *Aedes aegypti* / dengue), attenuated by altitude.

### 7. In-browser What-If engine
`web/src/model/climate.ts` mirrors the pipeline's response and risk functions one-to-one. `npm test` verifies that the TypeScript code reproduces the values exported by Python.

### Data honesty
- In *Compare with the past* mode, the globe shows the model driven by the ONI actually observed in that analog year. City cards add what ERA5 measured.
- The wind layer is an idealised climatological circulation modulated by the ONI. It is not observed wind.
- The projections are statistical and do not replace official national forecasts.

## Automation
`.github/workflows/update-data.yml` runs on the 12th and 14th of each month, since NOAA publishes its ENSO bulletin on the second Thursday. It:
1. runs the pipeline;
2. runs the Python tests, the model parity test and the production build;
3. commits the refreshed data if anything changed.

It can also be triggered manually (`workflow_dispatch`).

## Data files
| File | Contents |
|---|---|
| `oni.json` | ONI 1950–present, projection with 80 % band, hindcast skill, sources tried |
| `grid.json` | Land grid: coordinates, elevation, country, exposures and, per month, coefficients, base temperature, anomalies and risks |
| `cities.json` | 30 cities: ERA5 climatology, calibrated coefficients, monthly projection, alerts, recommendations, ERA5 observations for the analog years, validation |
| `analogs.json` | Query trajectory and the top 3 analog years with similarity, narrative and ONI series |
| `model.json` | Teleconnection kernels, Niño 3.4, crop belts, dams and countries |
| `countries.json` | Borders (Natural Earth 50m for Latin America, 110m elsewhere) |
| `manifest.json` | Run metadata and validation |

## Data credits
- **ONI:** NOAA Climate Prediction Center and Physical Sciences Laboratory
- **Reanalysis:** ECMWF ERA5, via Open-Meteo
- **Elevation:** Copernicus DEM, via Open-Meteo
- **Borders:** Natural Earth

The app UI is in Spanish.
