"""Static scientific configuration for the ENSO 3D pipeline.

Everything here is either (a) a real-world reference (city coordinates, dam
locations, crop belts, historical ENSO events) or (b) a documented model
parameter (teleconnection kernels) whose amplitude is later checked against
ERA5 observations for 30 cities (see ``era5.py`` / ``cities.py``).
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PIPELINE_DIR = ROOT / "pipeline"
DATA_DIR = PIPELINE_DIR / "data"
RAW_DIR = DATA_DIR / "raw"
CACHE_DIR = DATA_DIR / "cache"
FALLBACK_DIR = DATA_DIR / "fallback"
OUTPUT_DIR = ROOT / "web" / "public" / "data"

HTTP_TIMEOUT = 40
USER_AGENT = "enso3d-climate-pipeline/1.0 (+https://github.com/)"

ONI_SOURCES = [
    ("NOAA CPC", "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt", "cpc"),
    ("NOAA PSL", "https://psl.noaa.gov/data/correlation/oni.data", "psl"),
]

FORECAST_MONTHS = 6          # months shown in the UI, starting with the current month
ANALOG_WINDOW = 12           # length (months) of the moving window used for analogs
N_ANALOGS = 3

# Latin America bounding box used for the land grid.
LAT_MIN, LAT_MAX = -56.0, 33.0
LNG_MIN, LNG_MAX = -118.5, -33.0
GRID_SPACING_DEG = 0.85      # hexagon centre-to-centre spacing (great-circle degrees)

LATAM_SUBREGIONS = {"South America", "Central America", "Caribbean"}
EXCLUDED_ISO = {"USA", "CAN", "GRL", "BMU", "SPM"}

MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
             "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
SEASONS = ["DJF", "JFM", "FMA", "MAM", "AMJ", "MJJ", "JJA", "JAS", "ASO", "SON", "OND", "NDJ"]

# ---------------------------------------------------------------------------
# 30 cities (WGS84 city-centre coordinates, metro population in millions)
# ---------------------------------------------------------------------------
CITIES = [
    ("buenos-aires", "Buenos Aires", "Argentina", -34.6037, -58.3816, 15.6),
    ("cordoba", "Córdoba", "Argentina", -31.4201, -64.1888, 1.6),
    ("rosario", "Rosario", "Argentina", -32.9442, -60.6505, 1.4),
    ("sao-paulo", "São Paulo", "Brasil", -23.5505, -46.6333, 22.4),
    ("rio-de-janeiro", "Río de Janeiro", "Brasil", -22.9068, -43.1729, 13.6),
    ("brasilia", "Brasilia", "Brasil", -15.7939, -47.8828, 4.8),
    ("curitiba", "Curitiba", "Brasil", -25.4284, -49.2733, 3.7),
    ("santiago", "Santiago", "Chile", -33.4489, -70.6693, 6.9),
    ("valparaiso", "Valparaíso", "Chile", -33.0472, -71.6127, 1.0),
    ("lima", "Lima", "Perú", -12.0464, -77.0428, 11.0),
    ("arequipa", "Arequipa", "Perú", -16.4090, -71.5375, 1.1),
    ("bogota", "Bogotá", "Colombia", 4.7110, -74.0721, 11.3),
    ("medellin", "Medellín", "Colombia", 6.2442, -75.5812, 4.1),
    ("cali", "Cali", "Colombia", 3.4516, -76.5320, 2.8),
    ("quito", "Quito", "Ecuador", -0.1807, -78.4678, 2.0),
    ("guayaquil", "Guayaquil", "Ecuador", -2.1709, -79.9224, 3.1),
    ("caracas", "Caracas", "Venezuela", 10.4806, -66.9036, 2.9),
    ("la-paz", "La Paz", "Bolivia", -16.4897, -68.1193, 1.9),
    ("santa-cruz", "Santa Cruz de la Sierra", "Bolivia", -17.8146, -63.1561, 1.8),
    ("montevideo", "Montevideo", "Uruguay", -34.9011, -56.1645, 1.8),
    ("asuncion", "Asunción", "Paraguay", -25.2637, -57.5759, 2.4),
    ("ciudad-de-mexico", "Ciudad de México", "México", 19.4326, -99.1332, 21.8),
    ("guadalajara", "Guadalajara", "México", 20.6597, -103.3496, 5.3),
    ("monterrey", "Monterrey", "México", 25.6866, -100.3161, 5.3),
    ("san-jose", "San José", "Costa Rica", 9.9281, -84.0907, 1.4),
    ("panama", "Ciudad de Panamá", "Panamá", 8.9824, -79.5199, 2.0),
    ("santo-domingo", "Santo Domingo", "República Dominicana", 18.4861, -69.9312, 3.6),
    ("san-juan", "San Juan", "Puerto Rico", 18.4655, -66.1057, 2.0),
    ("la-habana", "La Habana", "Cuba", 23.1136, -82.3666, 2.1),
    ("guatemala", "Ciudad de Guatemala", "Guatemala", 14.6349, -90.5069, 3.0),
]

# ---------------------------------------------------------------------------
# Teleconnection kernels.
# Each kernel is an elliptical Gaussian footprint with monthly coefficients:
#   rain: % change of precipitation per +1 °C of ONI (El Niño branch)
#   temp: °C change of 2 m temperature per +1 °C of ONI (El Niño branch)
#   neg_rain / neg_temp: amplitude of the La Niña branch relative to El Niño
#   (ENSO teleconnections are asymmetric, e.g. La Niña droughts in the
#   La Plata basin are stronger than El Niño's mirror signal).
# Monthly arrays are Jan..Dec. Sources for sign/season: Ropelewski & Halpert
# (1987, 1989), Grimm (2003, 2011), Cai et al. (2020, Nat. Rev. Earth Env.),
# Magaña et al. (2003), Garreaud et al. (2009), Takahashi & Martínez (2017).
# ---------------------------------------------------------------------------
KERNELS = [
    dict(id="peru_ecuador_coast", name="Costa norte de Perú y Ecuador",
         lat=-4.0, lng=-80.2, sig_lat=3.2, sig_lng=1.8, max_elev=1600,
         rain=[45, 70, 80, 60, 30, 10, 5, 5, 5, 8, 15, 30],
         temp=[0.8, 0.9, 0.9, 0.8, 0.7, 0.6, 0.5, 0.5, 0.5, 0.5, 0.6, 0.7],
         neg_rain=0.45, neg_temp=0.8),
    dict(id="la_plata", name="Cuenca del Plata",
         lat=-29.0, lng=-57.5, sig_lat=6.0, sig_lng=6.5,
         rain=[9, 8, 10, 14, 15, 10, 8, 8, 12, 18, 20, 14],
         temp=[-0.15, -0.1, 0.0, 0.1, 0.25, 0.3, 0.3, 0.25, 0.1, -0.1, -0.2, -0.2],
         neg_rain=1.25, neg_temp=1.0),
    dict(id="south_brazil", name="Sur de Brasil",
         lat=-27.5, lng=-51.0, sig_lat=3.5, sig_lng=4.0,
         rain=[6, 5, 6, 10, 14, 12, 10, 8, 10, 14, 16, 10],
         temp=[0.0, 0.0, 0.1, 0.2, 0.3, 0.3, 0.3, 0.2, 0.1, 0.0, 0.0, 0.0],
         neg_rain=1.1, neg_temp=1.0),
    dict(id="amazonia", name="Amazonía central y norte",
         lat=-2.5, lng=-60.0, sig_lat=7.0, sig_lng=11.0,
         rain=[-12, -13, -12, -10, -7, -5, -5, -6, -8, -10, -11, -12],
         temp=[0.55, 0.6, 0.55, 0.5, 0.45, 0.4, 0.4, 0.45, 0.5, 0.55, 0.55, 0.55],
         neg_rain=0.9, neg_temp=0.7),
    dict(id="ne_brazil", name="Nordeste de Brasil",
         lat=-7.0, lng=-39.5, sig_lat=4.5, sig_lng=4.5,
         rain=[-12, -16, -20, -20, -15, -8, -5, -5, -5, -6, -8, -10],
         temp=[0.4, 0.45, 0.45, 0.4, 0.35, 0.3, 0.3, 0.3, 0.3, 0.35, 0.35, 0.4],
         neg_rain=0.9, neg_temp=0.7),
    dict(id="northern_sa", name="Colombia y Venezuela",
         lat=6.0, lng=-71.0, sig_lat=4.5, sig_lng=6.5,
         rain=[-18, -18, -15, -10, -8, -10, -14, -15, -12, -10, -12, -16],
         temp=[0.45, 0.45, 0.4, 0.35, 0.35, 0.35, 0.4, 0.4, 0.4, 0.4, 0.4, 0.45],
         neg_rain=1.0, neg_temp=0.8),
    dict(id="central_america", name="Corredor Seco centroamericano",
         lat=13.0, lng=-87.0, sig_lat=3.0, sig_lng=5.0,
         rain=[-5, -5, -5, -6, -10, -14, -20, -22, -16, -10, -6, -5],
         temp=[0.3, 0.3, 0.3, 0.35, 0.4, 0.4, 0.45, 0.45, 0.4, 0.35, 0.3, 0.3],
         neg_rain=0.9, neg_temp=0.8),
    dict(id="caribbean", name="Caribe insular",
         lat=18.0, lng=-71.0, sig_lat=3.5, sig_lng=8.0,
         rain=[6, 5, 3, 0, -5, -10, -14, -14, -12, -8, 0, 5],
         temp=[0.2, 0.2, 0.2, 0.25, 0.3, 0.3, 0.35, 0.35, 0.3, 0.25, 0.2, 0.2],
         neg_rain=0.9, neg_temp=0.8),
    dict(id="cuba_winter", name="Occidente de Cuba (frentes invernales)",
         lat=22.0, lng=-80.5, sig_lat=2.0, sig_lng=4.0,
         rain=[28, 25, 18, 8, 0, 0, 0, 0, 0, 5, 15, 24],
         temp=[-0.2, -0.2, -0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, -0.1, -0.2],
         neg_rain=0.8, neg_temp=0.8),
    dict(id="nw_mexico", name="Noroeste y norte de México",
         lat=27.5, lng=-106.0, sig_lat=4.5, sig_lng=6.0,
         rain=[25, 25, 20, 10, 0, -6, -10, -8, -4, 5, 15, 22],
         temp=[-0.35, -0.35, -0.3, -0.15, 0.0, 0.1, 0.15, 0.15, 0.1, 0.0, -0.2, -0.3],
         neg_rain=1.0, neg_temp=0.9),
    dict(id="south_mexico", name="Sur de México",
         lat=17.5, lng=-96.5, sig_lat=3.0, sig_lng=4.5,
         rain=[8, 8, 5, 0, -6, -12, -16, -15, -10, -5, 0, 6],
         temp=[0.1, 0.1, 0.15, 0.2, 0.3, 0.35, 0.4, 0.4, 0.35, 0.25, 0.15, 0.1],
         neg_rain=0.9, neg_temp=0.8),
    dict(id="central_chile", name="Chile central",
         lat=-34.5, lng=-71.0, sig_lat=3.5, sig_lng=1.6,
         rain=[5, 5, 10, 18, 25, 28, 28, 25, 20, 12, 6, 5],
         temp=[0.1, 0.1, 0.1, 0.15, 0.2, 0.2, 0.2, 0.2, 0.15, 0.1, 0.1, 0.1],
         neg_rain=1.0, neg_temp=0.8),
    dict(id="patagonia", name="Patagonia y sur de Chile",
         lat=-44.0, lng=-71.0, sig_lat=5.0, sig_lng=4.0,
         rain=[-8, -8, -6, -4, -2, 0, 0, 0, -2, -4, -6, -8],
         temp=[0.2, 0.2, 0.15, 0.1, 0.05, 0.0, 0.0, 0.05, 0.1, 0.15, 0.2, 0.2],
         neg_rain=0.8, neg_temp=0.8),
    dict(id="altiplano", name="Altiplano andino",
         lat=-16.5, lng=-68.5, sig_lat=3.5, sig_lng=3.0, min_elev=2500,
         rain=[-18, -18, -15, -8, -3, 0, 0, 0, -3, -6, -10, -15],
         temp=[0.5, 0.55, 0.5, 0.4, 0.35, 0.3, 0.3, 0.35, 0.4, 0.45, 0.5, 0.5],
         neg_rain=0.9, neg_temp=0.7),
    dict(id="southeast_brazil", name="Sudeste de Brasil",
         lat=-21.0, lng=-46.0, sig_lat=4.0, sig_lng=5.0,
         rain=[-3, -3, -2, 0, 2, 3, 3, 2, 0, -2, -3, -3],
         temp=[0.35, 0.35, 0.3, 0.3, 0.35, 0.4, 0.4, 0.35, 0.3, 0.3, 0.3, 0.35],
         neg_rain=1.0, neg_temp=0.8),
    # Broad tropical background warming that follows ENSO with ~1 season delay.
    dict(id="tropical_background", name="Fondo tropical",
         lat=2.0, lng=-70.0, sig_lat=16.0, sig_lng=30.0,
         rain=[0] * 12,
         temp=[0.2] * 12,
         neg_rain=1.0, neg_temp=0.8),
]

# Targets for the atmospheric "energy arcs" drawn from Niño 3.4.
NINO34 = dict(lat_min=-5.0, lat_max=5.0, lng_min=-170.0, lng_max=-120.0, lat=0.0, lng=-145.0)

# ---------------------------------------------------------------------------
# Agricultural belts (crop, centre, footprint, monthly sensitivity weight 0..1)
# Weights follow crop calendars: planting/flowering/grain-fill months are 1.
# ---------------------------------------------------------------------------
CROP_REGIONS = [
    ("Soja y maíz pampeano", "soja", -33.5, -61.5, 3.6, 4.2, 0.95,
     [1.0, 1.0, 0.8, 0.5, 0.3, 0.2, 0.2, 0.2, 0.4, 0.6, 0.85, 1.0]),
    ("Soja del sur de Brasil y Paraguay", "soja", -25.5, -53.5, 3.5, 4.0, 0.9,
     [1.0, 1.0, 0.7, 0.4, 0.3, 0.3, 0.3, 0.3, 0.5, 0.8, 0.9, 1.0]),
    ("Soja y maíz del Cerrado (Mato Grosso)", "soja", -13.0, -55.0, 4.5, 5.0, 0.9,
     [1.0, 1.0, 0.9, 0.7, 0.4, 0.2, 0.1, 0.1, 0.3, 0.8, 1.0, 1.0]),
    ("Soja de Santa Cruz (Bolivia)", "soja", -17.3, -62.8, 2.2, 2.2, 0.7,
     [1.0, 1.0, 0.8, 0.6, 0.6, 0.5, 0.4, 0.4, 0.5, 0.7, 0.9, 1.0]),
    ("Café del Eje Cafetero (Colombia)", "café", 4.8, -75.6, 2.2, 1.6, 0.85,
     [0.7, 0.7, 0.8, 1.0, 1.0, 0.8, 0.7, 0.7, 0.8, 1.0, 1.0, 0.8]),
    ("Café del sur de Minas Gerais", "café", -21.3, -45.5, 2.5, 2.5, 0.85,
     [0.8, 0.8, 0.7, 0.6, 0.5, 0.6, 0.7, 0.7, 1.0, 1.0, 1.0, 0.9]),
    ("Café centroamericano", "café", 14.5, -88.5, 2.5, 4.0, 0.85,
     [0.6, 0.6, 0.6, 0.7, 0.9, 1.0, 1.0, 1.0, 1.0, 0.9, 0.8, 0.7]),
    ("Banano de la costa ecuatoriana", "banano", -2.0, -79.7, 2.2, 1.2, 0.9,
     [1.0, 1.0, 1.0, 1.0, 0.8, 0.7, 0.7, 0.7, 0.7, 0.8, 0.9, 1.0]),
    ("Banano del Caribe colombiano y Centroamérica", "banano", 10.5, -80.0, 3.0, 5.0, 0.75,
     [0.8, 0.8, 0.8, 0.8, 0.9, 1.0, 1.0, 1.0, 1.0, 0.9, 0.8, 0.8]),
    ("Maíz temporalero del centro de México", "maíz", 20.0, -101.5, 3.0, 4.0, 0.85,
     [0.2, 0.2, 0.2, 0.3, 0.6, 1.0, 1.0, 1.0, 1.0, 0.8, 0.4, 0.2]),
    ("Agricultura de secano del Nordeste", "maíz", -7.0, -38.5, 3.5, 3.5, 0.8,
     [0.6, 0.9, 1.0, 1.0, 1.0, 0.7, 0.4, 0.2, 0.2, 0.2, 0.3, 0.4]),
    ("Fruticultura de Chile central", "frutales", -34.5, -71.0, 2.2, 1.2, 0.7,
     [1.0, 1.0, 0.8, 0.5, 0.3, 0.3, 0.4, 0.6, 0.9, 1.0, 1.0, 1.0]),
    ("Agroexportación de la costa norte peruana", "frutales", -7.5, -79.3, 2.0, 1.2, 0.7,
     [1.0, 1.0, 1.0, 0.8, 0.6, 0.6, 0.6, 0.6, 0.6, 0.7, 0.8, 0.9]),
    ("Arroz y ganadería del Uruguay", "arroz", -32.5, -55.5, 2.5, 2.8, 0.7,
     [1.0, 1.0, 0.9, 0.6, 0.4, 0.3, 0.3, 0.3, 0.4, 0.7, 0.9, 1.0]),
    ("Llanos de Venezuela y Colombia", "maíz", 7.0, -68.5, 2.5, 4.5, 0.6,
     [0.3, 0.3, 0.3, 0.5, 0.9, 1.0, 1.0, 1.0, 0.9, 0.7, 0.4, 0.3]),
    ("Caña y tabaco de Cuba y La Española", "caña", 20.5, -76.0, 2.0, 6.0, 0.6,
     [1.0, 1.0, 1.0, 0.8, 0.6, 0.6, 0.6, 0.6, 0.6, 0.7, 0.9, 1.0]),
]

# ---------------------------------------------------------------------------
# Large hydropower plants / water infrastructure (lat, lng, capacity GW)
# ---------------------------------------------------------------------------
HYDRO_SITES = [
    ("Itaipú", -25.408, -54.589, 14.0),
    ("Yacyretá", -27.482, -56.726, 3.2),
    ("Salto Grande", -31.275, -57.938, 1.9),
    ("Belo Monte", -3.126, -51.775, 11.2),
    ("Tucuruí", -3.832, -49.647, 8.4),
    ("Santo Antônio y Jirau", -9.0, -64.2, 7.3),
    ("Ilha Solteira", -20.383, -51.362, 3.4),
    ("Furnas", -20.669, -46.318, 1.2),
    ("Sobradinho", -9.432, -40.828, 1.1),
    ("Xingó y Paulo Afonso", -9.62, -38.2, 7.4),
    ("Guri", 7.764, -62.999, 10.2),
    ("Hidroituango", 7.135, -75.66, 2.4),
    ("Chivor y Guavio", 4.85, -73.4, 2.2),
    ("Coca Codo Sinclair", -0.2, -77.68, 1.5),
    ("Paute-Mazar", -2.58, -78.62, 1.8),
    ("Mantaro", -12.3, -74.6, 1.0),
    ("El Chocón y Piedra del Águila", -39.8, -69.5, 2.6),
    ("Ralco y Pangue", -38.0, -71.5, 1.1),
    ("Chixoy", 15.36, -90.66, 0.3),
    ("Sistema Grijalva (Chicoasén, Malpaso)", 16.94, -93.1, 4.8),
    ("El Cajón", 15.03, -87.75, 0.3),
    ("Canal de Panamá (lago Gatún)", 9.2, -79.9, 1.5),
    ("Arenal", 10.47, -84.9, 0.4),
]

# ---------------------------------------------------------------------------
# Historical ENSO episodes (CPC ONI peaks). Used for (1) the calibrated
# fallback reconstruction of the ONI series and (2) the analog narratives.
# (start YYYY-MM, peak YYYY-MM, end YYYY-MM, peak ONI)
# ---------------------------------------------------------------------------
ENSO_EVENTS = [
    ("1949-10", "1950-01", "1951-02", -1.5), ("1951-06", "1951-11", "1952-01", 1.2),
    ("1954-05", "1955-11", "1956-11", -1.7), ("1957-04", "1958-01", "1958-07", 1.8),
    ("1963-06", "1963-12", "1964-02", 1.4), ("1964-05", "1964-11", "1965-01", -0.8),
    ("1965-05", "1965-09", "1966-04", 2.0), ("1968-10", "1969-02", "1970-01", 1.1),
    ("1970-07", "1971-01", "1972-01", -1.4), ("1972-05", "1972-11", "1973-03", 2.1),
    ("1973-05", "1973-12", "1976-04", -2.0), ("1976-09", "1976-11", "1977-02", 0.9),
    ("1977-09", "1977-11", "1978-01", 0.8), ("1982-04", "1982-12", "1983-06", 2.2),
    ("1983-09", "1984-12", "1985-06", -0.9), ("1986-09", "1987-08", "1988-02", 1.7),
    ("1988-05", "1988-12", "1989-05", -1.8), ("1991-05", "1992-01", "1992-06", 1.7),
    ("1994-09", "1994-12", "1995-03", 1.1), ("1995-08", "1995-12", "1996-03", -1.0),
    ("1997-05", "1997-12", "1998-05", 2.4), ("1998-07", "1999-12", "2001-02", -1.7),
    ("2002-06", "2002-11", "2003-02", 1.3), ("2004-07", "2004-10", "2005-02", 0.7),
    ("2005-10", "2006-01", "2006-03", -0.9), ("2006-09", "2006-12", "2007-01", 0.9),
    ("2007-06", "2008-01", "2008-06", -1.6), ("2009-07", "2009-12", "2010-04", 1.6),
    ("2010-06", "2010-12", "2012-04", -1.6), ("2014-10", "2015-12", "2016-05", 2.6),
    ("2016-08", "2016-11", "2016-12", -0.7), ("2017-10", "2018-01", "2018-03", -0.9),
    ("2018-09", "2019-02", "2019-06", 0.9), ("2020-08", "2020-11", "2023-02", -1.3),
    ("2023-05", "2023-12", "2024-04", 2.0), ("2024-10", "2025-01", "2025-03", -0.6),
]

# Narratives of what actually happened in Latin America during notable cycles.
EVENT_NARRATIVES = {
    1957: "El Niño fuerte de 1957-58: lluvias torrenciales en la costa norte peruana, colapso de la pesca de anchoveta y un verano anómalamente cálido en gran parte de Sudamérica tropical.",
    1965: "El Niño fuerte de 1965-66: inundaciones en el litoral argentino y el sur de Brasil, mientras Colombia, Venezuela y el nordeste brasileño sufrían déficit de lluvias.",
    1972: "El Niño muy fuerte de 1972-73: el colapso histórico de la pesquería de anchoveta peruana, sequía en el nordeste de Brasil y Centroamérica, y fuertes lluvias en la Cuenca del Plata.",
    1973: "La Niña larga y profunda de 1973-76: sequías persistentes en el centro-este de Argentina, Uruguay y sur de Brasil, y lluvias abundantes en Colombia, Venezuela y el nordeste brasileño.",
    1982: "El Niño extraordinario de 1982-83: inundaciones catastróficas en el norte de Perú y Ecuador (lluvias más de 10 veces lo normal), crecidas récord del Paraná, y sequía severa en el nordeste brasileño, Bolivia y Centroamérica.",
    1986: "El Niño de 1987-88: sequía en el nordeste brasileño y Colombia, lluvias superiores a lo normal en el sur de Brasil y el litoral argentino.",
    1988: "La Niña intensa de 1988-89: sequía severa en la Pampa húmeda, pérdidas importantes en la cosecha argentina de soja y maíz, y lluvias abundantes en el norte de Sudamérica.",
    1991: "El Niño de 1991-92: crecidas del Paraná y del Uruguay, sequía e incendios en la Amazonía y un déficit hídrico marcado en Centroamérica.",
    1997: "El Niño extraordinario de 1997-98: el más costoso del siglo XX en la región. Lluvias e inundaciones devastadoras en Perú y Ecuador, crecidas del Paraná, sequía e incendios en Roraima y la Amazonía, y racionamiento hidroeléctrico en Colombia.",
    1998: "La Niña de 1998-2001: tres años de déficit hídrico en el Cono Sur, temporadas de huracanes activas en el Caribe y lluvias excesivas en Venezuela (tragedia de Vargas, 1999).",
    2002: "El Niño moderado de 2002-03: inundaciones en el litoral argentino (Santa Fe, 2003) y una sequía relevante en Centroamérica y el norte de Sudamérica.",
    2007: "La Niña fuerte de 2007-08: sequía en la Pampa y Uruguay, inundaciones en Bolivia y Colombia, y un invierno frío en el Cono Sur.",
    2009: "El Niño de 2009-10: sequía y racionamiento eléctrico en Venezuela (embalse de Guri en mínimos históricos), lluvias abundantes en el sur de Brasil y Uruguay.",
    2010: "La Niña de 2010-11: una de las más intensas del registro. Inundaciones devastadoras en Colombia y Venezuela, deslizamientos en la región serrana de Río de Janeiro y sequía en la Pampa argentina.",
    2014: "El Niño de 2014-16: déficit hídrico extremo en el Corredor Seco centroamericano, sequía en Colombia y Venezuela, incendios en la Amazonía e inundaciones en Paraguay, Uruguay y el litoral argentino.",
    2015: "El Niño extremo de 2015-16 (pico ONI +2.6): sequía histórica en la Amazonía y el nordeste brasileño, racionamiento eléctrico en Venezuela y Colombia, inundaciones récord en Paraguay, Uruguay y el litoral argentino, y brotes de dengue y zika en Brasil.",
    2018: "El Niño débil de 2018-19: lluvias intensas en el litoral argentino y Uruguay y un verano cálido en el sur de Sudamérica.",
    2020: "La Niña triple 2020-23: tres años consecutivos de sequía en Argentina, Uruguay y el sur de Brasil (el Paraná en mínimos de 77 años), pérdidas agrícolas multimillonarias y lluvias excesivas en Colombia y Venezuela.",
    2023: "El Niño fuerte de 2023-24: sequía histórica en la Amazonía (ríos en mínimos récord), restricciones en el Canal de Panamá, ola de calor en Sudamérica y brotes récord de dengue en Brasil, Argentina y Paraguay, junto con inundaciones en Rio Grande do Sul.",
}
