# Venezuela Earthquake (2026): Copernicus EMS Web GIS Dashboard

Unofficial public dashboard for the 2026 Venezuela earthquake response context, using public Copernicus EMS Rapid Mapping data for activation **EMSR884**.

![Dashboard Screenshot](assets/img1.jpeg)



## Purpose

This project translates public Copernicus EMS Rapid Mapping data into a lightweight, mobile-friendly, multilingual web dashboard.

The dashboard is designed for public situational awareness. It helps non-specialist users view Copernicus satellite-derived grading layers, AOI status, map context, and data freshness without needing GIS desktop software.

The project started as a Caracas / AOI02 prototype and has now been expanded into a dynamic EMSR884 AOI dashboard.

## Live demo to visit:

https://yin-renlong.github.io/venezuela-earthquake-copernicus-data-dashboard-2026/

## Important disclaimer

This dashboard is for public information only.

It is **not** an official rescue, evacuation, emergency response, government, military, medical, or civil-protection command tool.

Always follow local authorities, emergency services, and official humanitarian coordination channels.

Copernicus damage classes are remote satellite assessments. They may require field verification and may not reflect the latest ground conditions.

## Current activation coverage (27 June 2026)

The dashboard reads AOIs dynamically from the EMSR884 manifest.

Current AOIs listed by the activation include:

* **AOI00 Central Coastal Venezuela**
  * Ground Movement: ✅ Completed (situation as of 25/06/2026, 22:42 (UTC))
* **AOI01 Petare**
  * Grading: 🕒 Planned (28/06/2026 afternoon (UTC))
* **AOI02 Caracas**
  * Grading Monitoring 1: 🔄 In progress (27/06/2026 morning (UTC))
  * Grading: ✅ Completed (situation as of 25/06/2026, 14:59 (UTC))
* **AOI03 Antimano**
  * Grading: ❌ Not produced (situation as of 25/06/2026, 15:17 (UTC))
* **AOI04 Maracay**
  * Grading: 🕒 Planned (28/06/2026 early morning (UTC))
* **AOI05 Santa Cruz**
  * Grading: 🕒 Planned (27/06/2026 afternoon (UTC))
* **AOI06 Moron**
  * Grading Monitoring 1: ✅ Completed (situation as of 26/06/2026, 15:11 (UTC))
  * Grading: ✅ Completed (situation as of 25/06/2026, 20:36 (UTC))
* **AOI07 Puerto Cabello**
  * Grading Monitoring 1: 🕒 Planned (28/06/2026 early morning (UTC))
  * Grading: ❌ Not produced (situation as of 26/06/2026, 14:03 (UTC))
* **AOI08 San Felipe**
  * Grading Monitoring 1: 🕒 Planned (Waiting confirmation)
  * Grading: ✅ Completed (situation as of 25/06/2026, 20:37 (UTC))
* **AOI09 Valencia**
  * Grading: ❌ Not produced (situation as of 26/06/2026, 14:04 (UTC))
* **AOI10 Guacara**
  * Grading: ❌ Not produced (situation as of 25/06/2026, 14:59 (UTC))
* **AOI11 Villa de Cura**
  * Grading: ❌ Not produced (situation as of 26/06/2026, 15:19 (UTC))
* **AOI12 Caraballeda**
  * Grading Monitoring 1: 🔄 In progress (27/06/2026 early morning (UTC))
  * Grading: ✅ Completed (situation as of 26/06/2026, 10:00 (UTC))

AOIs with published public vector layers are shown as available. AOIs that are planned, in progress, waiting confirmation, or not produced are shown as placeholders until Copernicus publishes usable public layers.

At the time of this update, completed public grading vector layers are available for:

- **AOI00 Central Coastal Venezuela** (Ground Movement)
- **AOI02 Caracas** (Grading)
- **AOI06 Moron** (Grading)

This can change as Copernicus updates the official activation.

## Data source

Official Copernicus EMSR884 public activation API:

```text
https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations/?code=EMSR884
```

Copernicus EMS Rapid Mapping website:

```text
https://rapidmapping.emergency.copernicus.eu/
```

The dashboard reads the live public activation manifest from Copernicus and then selects public layer URLs from the AOI product metadata.



## Copernicus EMSR884 API structure and developer interpretation notes

This project uses the official public Copernicus EMS Rapid Mapping activation endpoint:

```text
https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations/?code=EMSR884
```

The dashboard does **not** use local downloaded files in production. Local ZIP/JSON files were only used during development to understand the schema and verify layer attributes. The live dashboard reads the official Copernicus manifest and layer URLs from the public API.

### High-level API structure

The EMSR884 endpoint returns a JSON response with this general shape:

```json
{
  "count": 1,
  "next": null,
  "previous": null,
  "results": [
    {
      "code": "EMSR884",
      "name": "Earthquake in Venezuela",
      "reason": "...",
      "category": "Earthquake",
      "subCategory": "Ground shaking",
      "eventTime": "2026-06-24T16:04:00",
      "activationTime": "2026-06-25T03:51:00",
      "closed": false,
      "countries": [
        {
          "name": "Venezuela"
        }
      ],
      "aois": [],
      "reportLink": "...",
      "productsPath": "...",
      "aws_bucket": "..."
    }
  ]
}
```

For this dashboard, the most important top-level path is:

```text
results[0].aois
```

Each AOI contains its name, AOI number, geometry extent, products, and sometimes a BLP path.

### AOI structure

Each AOI generally looks like this:

```json
{
  "name": "Caracas",
  "number": 2,
  "activationCode": "EMSR884",
  "extent": "POLYGON ((...))",
  "products": [],
  "blpPath": "https://rapidmapping.emergency.copernicus.eu/backend/EMSR884/AOI02/EMSR884_AOI02_BLP.zip"
}
```

Important AOI fields:

| Field      | Meaning                                 | Dashboard use                        |
| ---------- | --------------------------------------- | ------------------------------------ |
| `name`     | AOI display name                        | Sidebar AOI label                    |
| `number`   | AOI number                              | Direct link via `?aoi=NUMBER`        |
| `extent`   | AOI polygon in WKT format               | Map fit bounds and green AOI outline |
| `products` | Product list for this AOI               | Used to find usable GRA/GRM products |
| `blpPath`  | Baseline product ZIP path, if available | Currently informational / future use |

The dashboard reads all AOIs dynamically instead of hard-coding only Caracas or Moron.

Observed EMSR884 AOIs include:

|   AOI | Name                      |
| ----: | ------------------------- |
| AOI00 | Central Coastal Venezuela |
| AOI01 | Petare                    |
| AOI02 | Caracas                   |
| AOI03 | Antimano                  |
| AOI04 | Maracay                   |
| AOI05 | Santa Cruz                |
| AOI06 | Moron                     |
| AOI07 | Puerto Cabello            |
| AOI08 | San Felipe                |
| AOI09 | Valencia                  |
| AOI10 | Guacara                   |
| AOI11 | Villa de Cura             |
| AOI12 | Caraballeda               |

### Product structure

Each AOI contains one or more products. A product generally looks like this:

```json
{
  "id": 2600,
  "type": "GRA",
  "monitoring": false,
  "monitoringNumber": 0,
  "feasible": true,
  "images": [],
  "stats": {},
  "mapsCount": 1,
  "activationCode": "EMSR884",
  "aoiName": "Caracas",
  "aoiNumber": 2,
  "extent": "POLYGON ((...))",
  "expectedDelivery": "2026-06-26T05:00:00",
  "layers": [],
  "downloadPath": "https://rapidmapping.emergency.copernicus.eu/backend/EMSR884/AOI02/GRA_PRODUCT/EMSR884_AOI02_GRA_PRODUCT_v1.zip",
  "version": {
    "uuid": "...",
    "number": 1,
    "reason": "",
    "deliveryTime": "2026-06-26T04:01:10.948274",
    "statusCode": "F"
  }
}
```

Important product fields:

| Field                  | Meaning                             | Dashboard use                      |
| ---------------------- | ----------------------------------- | ---------------------------------- |
| `id`                   | Copernicus product ID               | Data status panel                  |
| `type`                 | Product type, e.g. `GRA`, `GRM`     | Product selection                  |
| `monitoring`           | Whether this is a monitoring update | Product label                      |
| `monitoringNumber`     | Monitoring sequence number          | Product label                      |
| `images`               | Source satellite images             | Acquisition time display           |
| `expectedDelivery`     | Expected product delivery           | Placeholder status                 |
| `layers`               | Public layer list                   | Main source for map layer URLs     |
| `downloadPath`         | Product ZIP download                | Data source link                   |
| `version.deliveryTime` | Actual delivery/publication time    | Data freshness                     |
| `version.statusCode`   | Product status                      | AOI availability/placeholder state |

### Product types observed

| Type  | Meaning                             | Dashboard handling                                           |
| ----- | ----------------------------------- | ------------------------------------------------------------ |
| `GRA` | Grading / damage assessment product | Main product type used for built-up, transportation, and not-analysed layers |
| `GRM` | Ground Movement product             | Displayed as product status / placeholder where relevant     |

### Product status codes observed

The API uses short status codes in:

```text
product.version.statusCode
```

Observed meanings during EMSR884 development:

| Status code | Interpreted meaning                      | Dashboard behavior                                  |
| ----------- | ---------------------------------------- | --------------------------------------------------- |
| `F`         | Finished / completed                     | AOI can be active if usable public layers exist     |
| `I`         | In progress                              | AOI shown as placeholder unless usable layers exist |
| `W`         | Waiting / planned / waiting confirmation | AOI shown as placeholder                            |
| `N`         | Not produced                             | AOI shown as unavailable / not produced             |

The dashboard does not rely only on status code. It also checks whether usable layer URLs exist.

A product with `statusCode: "F"` but no usable public vector layers should still be treated cautiously. A product with `layers: []` is not directly displayable by this dashboard.

### Product selection logic

For a selected AOI, the dashboard tries to choose the most useful product in this order:

1. `GRA` product with `statusCode: "F"` and usable public vector layers
2. Any `GRA` product with usable public vector layers
3. Any finished product with usable public vector layers
4. Any product with usable public vector layers
5. In-progress or waiting `GRA` product as placeholder metadata
6. First available product as fallback metadata

This lets the UI show AOIs even before public layers are available.

### Layer structure inside a product

A completed grading product may contain layers like this:

```json
{
  "name": "EMSR884/AOI02/GRA_PRODUCT/EMSR884_AOI02_GRA_PRODUCT_builtUpA_v1_VT",
  "format": "vt",
  "sld": "https://rapidmapping-viewer.s3.eu-west-1.amazonaws.com/EMSR884/AOI02/GRA_PRODUCT/EMSR884_AOI02_GRA_PRODUCT_builtUpA_v1.sld",
  "json": "https://rapidmapping-viewer.s3.eu-west-1.amazonaws.com/EMSR884/AOI02/GRA_PRODUCT/EMSR884_AOI02_GRA_PRODUCT_builtUpA_v1.json"
}
```

Important layer fields:

| Field    | Meaning                        | Dashboard use                                    |
| -------- | ------------------------------ | ------------------------------------------------ |
| `name`   | Layer path/name                | Used to classify layer type                      |
| `format` | Layer format, e.g. `vt`, `cog` | `vt` layers are used for vector display          |
| `sld`    | Official style descriptor      | Used during development to verify legend classes |
| `json`   | GeoJSON or TileJSON endpoint   | Main map source URL                              |

The dashboard currently looks for these layer names:

| Layer key         | Copernicus layer naming pattern | Dashboard use                                  |
| ----------------- | ------------------------------- | ---------------------------------------------- |
| `builtUpA`        | `builtUpA`                      | Built-up grading polygons                      |
| `transportationL` | `transportationL`               | Road/rail line network                         |
| `notAnalysedA`    | `notAnalysedA`                  | Not-analysed polygons / cloud-obstructed areas |

The product ZIP may also include additional files such as:

| Layer/file                         | Meaning                    | Current dashboard status                                     |
| ---------------------------------- | -------------------------- | ------------------------------------------------------------ |
| `areaOfInterestA`                  | Official AOI polygon layer | The dashboard currently uses AOI WKT `extent` from the API instead |
| `imageFootprintA`                  | Satellite image footprint  | Not currently displayed                                      |
| `source`                           | Source metadata            | Not currently displayed                                      |
| `*.sld`                            | Official styling           | Used to verify styling rules                                 |
| `*.xml`                            | Metadata                   | Not currently displayed                                      |
| `*.shp`, `*.dbf`, `*.shx`, `*.prj` | Shapefile components       | Not used directly in the browser dashboard                   |

### GeoJSON vs TileJSON handling

The Copernicus `json` URL may point to either:

1. Raw GeoJSON / FeatureCollection
2. TileJSON for vector tiles

The dashboard auto-detects both.

GeoJSON-like response:

```json
{
  "type": "FeatureCollection",
  "features": []
}
```

TileJSON-like response:

```json
{
  "tilejson": "2.2.0",
  "tiles": [
    "..."
  ],
  "vector_layers": [
    {
      "id": "..."
    }
  ]
}
```

For TileJSON, the dashboard resolves tile URLs and detects the vector source layer from `vector_layers`.

### AOI boundary handling

The API provides AOI geometry as WKT:

```text
POLYGON ((lng lat, lng lat, ...))
```

The dashboard parses this WKT polygon to:

1. fit the map to the selected AOI
2. draw a green AOI outline on the map
3. allow the AOI outline to be toggled from the map legend

This means the dashboard does not need to wait for `areaOfInterestA` vector layers to show the AOI boundary.

### Built-up layer interpretation

The built-up grading layer is expected to contain building or built-up-area damage classes.

The dashboard defensively checks several possible damage fields, including:

```text
damage_gra
damage_grade
Damage_Grade
DAMAGE_GRA
damage
Damage
```

Observed / expected damage values include:

```text
Destroyed
Damaged
Possibly damaged
No visible damage
```

The dashboard displays:

| Damage class     | Style  |
| ---------------- | ------ |
| Destroyed        | Red    |
| Damaged          | Orange |
| Possibly damaged | Yellow |

No-visible-damage built-up features are filtered out from the main damage overlay so that the map focuses on visible damage classes.

### Not-analysed layer interpretation

The `notAnalysedA` layer represents areas that were not analysed, often because of cloud cover, obstruction, or unavailable satellite visibility.

Dashboard behavior:

- off by default
- user-toggleable from the map legend
- displayed as a grey hatched polygon layer when enabled

This avoids overwhelming the satellite basemap while still allowing users to inspect not-analysed areas.

### Transportation layer interpretation

The `transportationL` layer is a line layer for road and rail features.

During development, local downloaded Copernicus product files were used only to inspect schema and verify styling. For AOI02, the downloaded GRA transportation file had this structure:

```text
File:
EMSR884_AOI02_GRA_PRODUCT_transportationL_v1.json

Feature count:
9135

Property keys:
obj_type
name
info
simplified
damage_gra
det_method
notation
or_src_id
dmg_src_id
cd_value
```

Important fields for transportation styling:

| Field        | Meaning                                                      |
| ------------ | ------------------------------------------------------------ |
| `simplified` | Simplified transport class                                   |
| `info`       | More detailed transport code/class                           |
| `obj_type`   | Broad object type, e.g. roads or railways                    |
| `damage_gra` | Damage/analysis status                                       |
| `det_method` | Detection method                                             |
| `cd_value`   | Copernicus damage-related field, often not applicable for no-damage transport |

For AOI02 GRA transportation, observed `simplified` values were:

| `simplified` value | Count |
| ------------------ | ----: |
| `Local roads`      |  6283 |
| `Main roads`       |  2158 |
| `Highway`          |   622 |
| `Subways`          |    46 |
| `Tracks`           |    22 |
| `Railways`         |     4 |

Observed `info` values were:

| `info` value                  | Count |
| ----------------------------- | ----: |
| `21122-Local Road`            |  6283 |
| `21120-Primary Road`          |  1395 |
| `21121-Secondary Road`        |   763 |
| `2111-Highways`               |   622 |
| `21221-Subway`                |    46 |
| `21124-Cart Track`            |    22 |
| `2121-Long-distance railways` |     4 |

Observed `damage_gra` values were:

| `damage_gra` value  | Count |
| ------------------- | ----: |
| `Not Analysed`      |  5704 |
| `No visible damage` |  3431 |

The official SLD legend titles for the AOI02 GRA transportation layer included:

```text
Highway, No visible damage
Main road, No visible damage
Local road, No visible damage
Track, No visible damage
Railway, No visible damage
Subway, No visible damage
```

Dashboard transportation behavior:

- Transportation is separated into selectable sublayers.
- Highway is styled separately from other roads.
- Main road, local road, track, and railway/subway can be toggled independently.
- Railway and subway are grouped together in the public-facing legend.
- Features with `damage_gra: "Not Analysed"` are not displayed as `No visible damage`.
- Unknown/fallback road features should default to local-road styling, not highway styling.

Current public-facing transportation toggles:

| Toggle                              | Data classification                                          |
| ----------------------------------- | ------------------------------------------------------------ |
| Highway, No visible damage          | `simplified = Highway` or `info` contains highway class      |
| Main road, No visible damage        | `simplified = Main roads`, or primary/secondary road in `info` |
| Local road, No visible damage       | `simplified = Local roads`, or local road in `info`, plus safe fallback |
| Track, No visible damage            | `simplified = Tracks`, or cart track in `info`               |
| Railway / subway, No visible damage | `simplified = Railways` or `Subways`, or railway/subway in `info`/`obj_type` |

### BLP vs GRA product note

Some AOIs include a BLP ZIP path:

```text
blpPath
```

BLP transportation data may contain baseline road/rail classes but not grading damage fields such as `damage_gra`.

For example, the AOI02 BLP transportation file had fields such as:

```text
obj_type
name
info
simplified
det_method
notation
or_src_id
```

The GRA product transportation file included additional grading fields:

```text
damage_gra
dmg_src_id
cd_value
```

For the live dashboard, GRA products are preferred because they include the grading context needed for the public legend.

### Data status and freshness interpretation

The dashboard displays several timestamps:

| Field                          | Meaning                                                      |
| ------------------------------ | ------------------------------------------------------------ |
| `product.version.deliveryTime` | When Copernicus delivered/published the product              |
| `product.expectedDelivery`     | Expected delivery time if product is not finished            |
| `images[].acquisitionTime`     | Satellite image acquisition time                             |
| dashboard `lastChecked`        | When the browser last checked the Copernicus manifest        |
| dashboard `successfulLoadTime` | When the selected AOI layers were successfully loaded in the dashboard |

The dashboard uses browser local storage to cache the Copernicus manifest for 30 minutes.

Maintainer refresh parameters:

```text
?refresh=1
?forceRefresh=1
?nocache=1
```

Example:

```text
https://yin-renlong.github.io/venezuela-earthquake-copernicus-data-dashboard-2026/?refresh=1&aoi=6
```

### Direct AOI linking

The dashboard supports AOI direct links using:

```text
?aoi=NUMBER
```

Examples:

```text
?aoi=2
?aoi=6
```

This is useful when sharing a direct view of Caracas, Moron, or any future AOI that receives usable public vector layers.

### Development workflow for future AOI/layer updates

When Copernicus updates the activation:

1. Open the dashboard with `?refresh=1`.
2. Check the AOI list in the sidebar.
3. If a new AOI has public vector layers, the dashboard should detect it automatically.
4. If layers do not display, inspect the AOI product `layers[]` array in the official manifest.
5. Confirm whether the layer names still include `builtUpA`, `transportationL`, or `notAnalysedA`.
6. Open the layer `json` URL and check whether it is GeoJSON or TileJSON.
7. If styling fails, download the official product ZIP and inspect:
   - `.json` attribute fields
   - `.sld` legend rules
   - unique values in relevant fields

Useful fields to inspect for transportation layers:

```text
simplified
info
obj_type
damage_gra
```

Useful fields to inspect for built-up layers:

```text
damage_gra
damage_grade
Damage_Grade
DAMAGE_GRA
damage
Damage
```

### Suggested local schema inspection command

During development, the following kind of local inspection can help verify downloaded product ZIP contents. This is not used by the live dashboard.

```bash
python3 <<'PY'
from pathlib import Path
import json
from collections import Counter, defaultdict

root = Path("/Users/Username/Downloads/EMSR884")
files = sorted(root.glob("**/*transportationL_v1.json"))

for path in files:
    print("=" * 80)
    print(path)

    data = json.loads(path.read_text())
    features = data.get("features", [])

    print("Feature count:", len(features))

    key_counts = Counter()
    values_by_key = defaultdict(Counter)

    for feature in features:
        props = feature.get("properties") or {}

        for key, value in props.items():
            key_counts[key] += 1
            if value not in (None, ""):
                values_by_key[key][str(value)] += 1

    print("\nProperty keys:")
    for key, count in key_counts.most_common():
        print(f"  {key}: {count}")

    print("\nSmall unique-value fields:")
    for key in sorted(values_by_key):
        values = values_by_key[key]
        if 1 <= len(values) <= 30:
            print(f"\n  {key}:")
            for value, count in values.most_common(30):
                print(f"    {value!r}: {count}")
PY
```

### Important caution for future contributors

The official Copernicus API is the source of truth. This dashboard is only a public-facing interface over selected public data.

Future contributors should avoid:

- treating satellite-derived damage classes as field-verified ground truth
- presenting this dashboard as an emergency response or evacuation tool
- mixing not-analysed features into no-damage categories
- collecting personal, rescue, casualty, or medical data
- depending on local downloaded files for the production dashboard
- assuming layer schemas will never change

If Copernicus changes layer field names or styling rules, inspect the official `json` and `sld` files again and update the dashboard filters accordingly.



## Direct AOI links

Default dashboard:

```text
https://yin-renlong.github.io/venezuela-earthquake-copernicus-data-dashboard-2026/
```

Open Caracas / AOI02:

```text
https://yin-renlong.github.io/venezuela-earthquake-copernicus-data-dashboard-2026/?aoi=2
```

Open Moron / AOI06:

```text
https://yin-renlong.github.io/venezuela-earthquake-copernicus-data-dashboard-2026/?aoi=6
```

Force a fresh Copernicus manifest check:

```text
https://yin-renlong.github.io/venezuela-earthquake-copernicus-data-dashboard-2026/?refresh=1
```

Open Moron and force refresh:

```text
https://yin-renlong.github.io/venezuela-earthquake-copernicus-data-dashboard-2026/?refresh=1&aoi=6
```

## Features

- Static public web dashboard hosted on GitHub Pages
- Live Copernicus EMSR884 manifest loading
- Dynamic AOI selector for all EMSR884 AOIs
- Placeholder AOI cards for planned, in-progress, waiting, or not-produced products
- AOI direct linking with `?aoi=NUMBER`
- Maintainer cache bypass with `?refresh=1`
- Multilingual UI:
  - Spanish
  - English
  - Italian
  - Chinese
- Mobile-friendly responsive layout
- MapLibre GL JS interactive map
- Satellite basemap
- Street-map basemap switch
- Optional street labels over satellite imagery
- Data freshness panel
- Copernicus delivery time display
- Satellite acquisition time display
- Last checked time display
- Last successful dashboard load time display
- Browser-side Copernicus manifest cache
- Map legend moved onto the map for faster visual interpretation
- Layer toggles directly in the map legend
- Green Area of Interest outline for the selected AOI
- Public Copernicus product/report/download links where available

## Copernicus layers used

The dashboard currently uses these public Copernicus layer groups when they are available for an AOI:

- `builtUpA`
- `transportationL`
- `notAnalysedA`

The dashboard automatically detects whether the Copernicus JSON is:

- raw GeoJSON / FeatureCollection, or
- TileJSON for vector tiles

No Mapbox token is required.

## Built-up grading

The built-up grading layer is styled as:

- Destroyed
- Damaged
- Possibly damaged

The dashboard filters out no-damage building classes from the built-up damage overlay so that the map focuses on relevant visible damage grades.

## Transportation / road and rail network

The transportation legend is split into selectable sublayers:

- Highway, No visible damage
- Main road, No visible damage
- Local road, No visible damage
- Track, No visible damage
- Railway / subway, No visible damage

The EMSR884 transportation data uses attributes such as:

- `simplified`
- `info`
- `damage_gra`

For the tested AOI02 transportation layer, Copernicus exposes values such as:

- `Highway`
- `Main roads`
- `Local roads`
- `Tracks`
- `Railways`
- `Subways`

The dashboard uses these fields to separate the transportation classes. Transport features marked `Not Analysed` are not displayed as `No visible damage`.

Railway and subway are grouped under one public-facing railway toggle because the current Copernicus legend includes both railway and subway transport classes.

## Not analysed layer

The `notAnalysedA` layer represents areas that were not analysed, for example because of cloud cover, obstruction, or unavailable satellite visibility.

It is:

- off by default
- available as a user-controlled toggle
- shown with a grey hatched style when enabled

This avoids visually overwhelming the satellite basemap while still allowing users to inspect unavailable analysis areas when needed.

## AOI placeholders

The dashboard does not hard-code only one city.

It reads all AOIs from the Copernicus activation manifest and renders them in the sidebar.

If an AOI has not yet received public vector layers, it remains visible as a placeholder. When Copernicus later publishes usable public layers, the AOI can become active without redesigning the interface.

Status labels are based on Copernicus product metadata, including product status and expected delivery where available.

## Data freshness and cache behavior

The dashboard checks the official Copernicus activation manifest and caches it in the browser.

Default cache duration:

```text
30 minutes
```

Maintainer refresh parameters:

```text
?refresh=1
?forceRefresh=1
?nocache=1
```

Examples:

```text
http://localhost:8080/?refresh=1
```

```text
http://localhost:8080/?refresh=1&aoi=6
```

The cache only stores the public Copernicus manifest in the user's browser local storage. It does not store personal data.

## Basemaps

The dashboard currently includes:

- Esri World Imagery satellite basemap
- OpenStreetMap-based street basemap for prototype use
- CARTO label tiles for street names over satellite mode

## Basemap note

OpenStreetMap public tiles are used here for prototype testing only.

If this project receives large public traffic, the street-map source should be replaced with one of the following:

- a production tile provider
- self-hosted map tiles
- a humanitarian-supported tile provider
- an approved emergency mapping infrastructure provider

This is important to respect public tile usage policies.

## Tech stack

- GitHub Pages
- Vanilla HTML
- Vanilla CSS
- Vanilla JavaScript
- MapLibre GL JS
- Public Copernicus EMSR884 activation API
- Public Copernicus vector/GeoJSON/TileJSON layer data
- Esri World Imagery
- OpenStreetMap / CARTO tiles for prototype basemap context

## Local development

Start a local server:

```bash
python3 -m http.server 8080
```

Open the dashboard:

```text
http://localhost:8080
```

Open Caracas / AOI02:

```text
http://localhost:8080/?aoi=2
```

Open Moron / AOI06:

```text
http://localhost:8080/?aoi=6
```

Force fresh Copernicus manifest loading:

```text
http://localhost:8080/?refresh=1
```

Force refresh and open Moron:

```text
http://localhost:8080/?refresh=1&aoi=6
```

## Development notes

The project is intentionally static and lightweight.

There is no backend server, no database, no user account system, and no private API key.

The dashboard should remain easy to mirror, audit, and redeploy during a humanitarian information situation.

## Ethical scope

This project does **not** collect, store, process, or display:

- casualty data
- missing-person data
- rescue request data
- evacuation request data
- medical data
- private personal data
- phone numbers
- household-level reports
- user-submitted emergency information

The dashboard is an unofficial public-interest interface for viewing public Copernicus EMSR884 satellite-derived mapping data.

## Authorship and status

Built by **YIN Renlong** as an unofficial public-interest interface using public Copernicus EMSR884 data.

This project is independent and unofficial. It is not endorsed by Copernicus, the European Commission, local authorities, or emergency response agencies.





## Development log



**[28 June 2026]**

This section records the main design thinking, debugging, implementation changes, UI iterations, and remaining technical considerations made on **28 June 2026** while adapting the EMSR884 dashboard to the newer Copernicus product structure, especially AOIs with both **Grading** and **Grading Monitoring 1** products.

The main architectural shift on this date was from an AOI-level layer picker to a **product-scoped model**:

    AOI
      -> Product, e.g. Grading, Grading Monitoring 1, Ground Movement
        -> Layer families, e.g. builtUpA, builtUpP, transportationL, notAnalysedA
          -> Legend rows / class toggles
            -> MapLibre layers

This was necessary because the Copernicus EMSR884 API now exposes multiple products per AOI, and those products may use different acquisition dates, different layer names, different geometries, and different official legends.

---

### **1. Problem discovered: AOIs now contain multiple usable products**

Earlier versions of the dashboard selected the “best” available layer per layer type across an AOI. That was acceptable when an AOI had only one usable grading product, but it became incorrect after the API began exposing both original grading products and monitoring products.

Examples observed in the EMSR884 public API:

#### **AOI02 Caracas**

AOI02 contains:

    Grading
      type: GRA
      monitoring: false
      product folder: GRA_PRODUCT
      acquisition: Pleiades Neo - 25/06/2026, 14:59 UTC
      vector layers:
        builtUpA
        notAnalysedA
        transportationL
      source image:
        PNEO_20260625_1459_ORTHO_cog.tif
    
    Grading Monitoring 1
      type: GRA
      monitoring: true
      monitoringNumber: 1
      product folder: GRA_MONIT01
      acquisition: Pleiades Neo - 26/06/2026, 15:19 UTC
      vector layers:
        ancillaryCrisisInfoP
        builtUpP
        notAnalysedA
        transportationL
      source image:
        PNEO_20260626_1519_ORTHO_cog.tif

#### **AOI06 Moron**

AOI06 contains:

    Grading Monitoring 1
      type: GRA
      monitoring: true
      monitoringNumber: 1
      product folder: GRA_MONIT01
      acquisition: Legion - 26/06/2026, 15:11 UTC
      vector layers:
        builtUpP
        notAnalysedA
        transportationL
    
    Grading
      type: GRA
      monitoring: false
      product folder: GRA_PRODUCT
      acquisition: Legion - 25/06/2026, 20:36 UTC
      vector layers:
        builtUpA
        notAnalysedA
        transportationL

#### **AOI08 San Felipe**

AOI08 contains:

    Grading
      vector layers:
        builtUpA
        notAnalysedA
        transportationL
      source images:
        Legion - 25/06/2026, 20:37 UTC
        Pleiades Neo - 25/06/2026, 15:00 UTC
    
    Grading Monitoring 1
      vector layers:
        builtUpP
        notAnalysedA
        transportationL
      source images:
        Pleiades Neo - 26/06/2026, 15:18 UTC
        Legion - 26/06/2026, 20:20 UTC

#### **AOI12 Caraballeda**

AOI12 is the most complex observed example. It contains:

    Grading
      product version: v2
      vector layers:
        builtUpA
        notAnalysedA
        transportationA
        transportationL
    
    Grading Monitoring 1
      vector layers:
        ancillaryCrisisInfoP
        builtUpP
        facilitiesA
        notAnalysedA
        transportationA
        transportationL

This showed that “Grading Monitoring 1” is not just a small update to a previous layer. It is a separate Copernicus product package with its own folder, source image, vector layers, statistics, and legend.

---

### **2. Why the previous AOI-level layer selection was unsafe**

The earlier dashboard logic collected the best available URL for each known layer key across an entire AOI.

That could produce a mixed product view such as:

    builtUpA from Grading
    builtUpP from Grading Monitoring 1
    transportationL from whichever product scored highest
    notAnalysedA from another product

This is misleading because the map would silently combine information from different product dates. For example:

    AOI06 Moron Grading
      situation as of 25/06/2026, 20:36 UTC
    
    AOI06 Moron Grading Monitoring 1
      situation as of 26/06/2026, 15:11 UTC

Mixing these products would make the dashboard look like one coherent Copernicus assessment, when it was actually a hybrid.

The design decision made on 28 June was therefore:

    Do not silently merge layers across products by default.
    Treat every Copernicus product as a separate map package.
    Allow user-controlled multi-product comparison only when explicitly selected.

---

### **3. New product-scoped data model**

The dashboard was redesigned around this model:

    AOI
      products[]
        product
          productKey
          product label
          official status
          source images / COG layers
          vector layer URLs
          loaded source metadata
          legend sections
          class toggles

A product is identified by a stable key:

    product.id if available

or a fallback built from:

    product.type
    product.aoiNumber
    product.monitoringNumber
    product.expectedDelivery
    product.version.deliveryTime

The product label is derived from product metadata:

    if product.type === "GRM":
      "Ground Movement"
    
    if product.type === "GRA" and product.monitoring === true:
      "Grading Monitoring {monitoringNumber}"
    
    if product.type === "GRA":
      "Grading"

This handles future products such as:

    Grading Monitoring 2
    Grading Monitoring 3

without hard-coding AOI numbers.

---

### **4. Product selection design**

The dashboard now supports product selection under each selected AOI.

The selected AOI expands inline and shows its products as selectable checkbox rows.

Example:

    12 Caraballeda
      [x] Grading Monitoring 1
      [ ] Grading

The product selector was deliberately placed under the city/AOI row instead of in a separate sidebar panel. This was chosen because it follows the mental model of the official Copernicus Products Viewer:

    AOI
      Product
        Layers

The earlier version briefly showed a separate “Productos” panel, but this was less intuitive. Product choices now appear directly below the selected AOI, which is easier for users to understand.

---

### **5. Multi-product comparison mode**

The dashboard now allows arbitrary product combinations.

The user can select:

    only Grading Monitoring 1
    only Grading
    both Grading and Grading Monitoring 1
    future combinations such as Monitoring 1 + Monitoring 3

The earlier “Todos los productos” / “All products” button was removed because it was too rigid. It forced all products on/off and did not support user-controlled combinations.

The current model stores selected products in the URL as a comma-separated product key list:

    ?aoi=12&product=2618,2612

The older temporary all-products value is still handled internally for backward compatibility:

    __all__
    all

but it is no longer shown as a visible UI option.

---

### **6. Product rows no longer use separate status LEDs**

Initially, product rows included a small green/red/amber dot similar to the AOI row. This was removed because it duplicated the checkbox state and created visual confusion.

Current design:

    AOI row:
      has official status dot
    
    Product row:
      has checkbox only
      checkbox color follows official product status
      selected product row has subtle status accent

This keeps the AOI status and product selection controls visually distinct.

---

### **7. Official product status handling**

A critical correction was made to distinguish between:

    displayable source imagery exists
    official product status is completed / not produced / planned / in progress

Some Copernicus products marked as `Not produced` still contain a source image COG. For example:

    AOI03 Antimano
      product.statusCode: N
      source image: Legion COG exists
      no damage vector layers
    
    AOI07 Puerto Cabello
      Grading: N
      Grading Monitoring 1: N
      source image COGs exist

Earlier, the dashboard marked these AOIs with a green dot because source imagery was displayable. This contradicted the official Copernicus viewer, which shows a red cross for `Not produced`.

The logic was corrected:

    statusCode F:
      green
    
    statusCode N:
      red
    
    statusCode W:
      amber
    
    statusCode I:
      amber

A product can still be clickable if it has a COG source image, but the status text must remain official:

    Grading · No producido · Imagen fuente disponible

not:

    Grading · Disponible

This prevents misleading users into thinking damage grading layers exist when Copernicus officially did not produce them.

---

### **8. Distinction between vector availability and source-image availability**

The dashboard now distinguishes:

    productHasVectorLayers(product)
      true if the product has usable vector layers such as builtUpA, builtUpP, transportationL, etc.
    
    productHasCogLayers(product)
      true if the product has source image layers with format "cog" or TIFF filenames
    
    productHasUsefulLayers(product)
      true if either vector layers or COG source imagery exist

This allows AOIs/products to be opened even when they only have source imagery, while still preserving official product status.

This was important because several EMSR884 products have COG source imagery even when the product is `N / Not produced`.

---

### **9. Dynamic legend redesign**

The legend was redesigned to be generated from the selected product or selected product combination.

The dashboard now builds legend sections dynamically based on loaded product layers.

Supported layer families include:

    builtUpA
      Built Up Area
      geometry: polygon
      damage classes:
        Destroyed
        Damaged
        Possibly damaged
    
    builtUpP
      Built Up Points
      geometry: point
      damage classes:
        Destroyed
        Damaged
        Possibly damaged
    
    transportationL
      Transportation Network
      geometry: line
      classes:
        Highway, No visible damage
        Main road, No visible damage
        Local road, No visible damage
        Track, No visible damage
        Airfield runway, No visible damage
        Railway / subway, No visible damage
    
    transportationA
      Transportation Area
      geometry: polygon
      observed class:
        Airfield and Heliport, Damaged
    
    facilitiesA
      Facilities Area
      geometry: polygon
      damage classes:
        Damaged
        Possibly damaged
    
    ancillaryCrisisInfoP
      Crisis Points
      geometry: point
      observed class:
        Blocked road / interruption
    
    notAnalysedA
      Not Analysed
      geometry: polygon
      default visibility: off
    
    groundMovementA
      Ground Movement
      geometry: polygon
      displacement classes:
        -0.5 to -0.2
        -0.2 to -0.1
        -0.1 to -0.05
        -0.05 to 0
        0 to 0.05
        0.05 to 0.1
        0.1 to 0.2
        0.2 to 0.5
        Above 0.5
    
    COG source imagery
      Official Copernicus source image
      geometry: raster COG TIFF
      default visibility: off
      user-controlled opacity

The dynamic legend only shows relevant sections. For example:

    AOI05 Santa Cruz / Grading
      shows:
        Built Up Points
        Transportation Network
        Source Imagery
        AOI outline
    
      does not show:
        Built Up Area
        Facilities Area
        Crisis Points
        Ground Movement

---

### **10. Independent legend toggles**

A bug was discovered after adding `builtUpP` support: toggling a class in `Built Up Points` also toggled the same class in `Built Up Area`.

Example:

    Built Up Area -> Damaged
    Built Up Points -> Damaged

Both used the same internal key:

    damaged

This caused linked behavior.

The fix was to make legend visibility keys product-scoped and layer-family-scoped.

The current visibility key format is conceptually:

    productKey:layerFamily:className

Examples:

    2618:builtUpP:destroyed
    2618:builtUpP:damaged
    2618:builtUpP:possible
    
    2612:builtUpA:destroyed
    2612:builtUpA:damaged
    2612:builtUpA:possible
    
    2618:facilitiesA:damaged
    2618:transportationA:airfieldAndHeliportDamaged
    2618:ancillaryCrisisInfoP:blockedRoadInterruption

This prevents unrelated rows from toggling together.

---

### **11. Product-combination legend behavior**

When one product is selected, the legend displays normal sections:

    Built Up Points
    Transportation Network
    Not Analysed
    Source Imagery
    General Information

When multiple products are selected, the legend groups sections by product:

    Grading Monitoring 1
      Built Up Points
      Transportation Network
      Not Analysed
      Source Imagery
    
    Grading
      Built Up Area
      Transportation Network
      Not Analysed
      Source Imagery

This avoids mixing same-named legend sections from different products.

---

### **12. AOI05 Santa Cruz / builtUpP support**

AOI05 Santa Cruz uses a different built-up layer structure from earlier AOIs.

Observed AOI05 layer:

    EMSR884/AOI05/GRA_PRODUCT/EMSR884_AOI05_GRA_PRODUCT_builtUpP_v1.json

Layer family:

    builtUpP

Geometry:

    Point

Example feature properties:

    obj_type: 11-Residential Buildings
    simplified: Residential
    damage_gra: Destroyed
    notation: Building point

This required adding support for:

    builtUpP point geometries
    point circle rendering
    separate "Built Up Points" legend section
    damage-class detection from point properties

The dashboard now styles built-up point layers as circle layers with:

    red for Destroyed
    orange for Damaged
    yellow for Possibly damaged

Point circles include a subtle halo / stroke for readability on satellite imagery.

---

### **13. Transportation classification updates**

Transportation was refined to support selectable subcategories and future schema variation.

Supported transportation line classes:

    highway
    main
    local
    track
    airfieldRunway
    railway

The classification checks fields including:

    simplified
    info
    obj_type
    damage_gra
    fallback text from all properties

The dashboard avoids classifying `Not Analysed` transportation features as “No visible damage”.

The fallback behavior remains conservative:

    unknown road/transport lines default to local-road styling
    unknown features are never defaulted to highway

Airfield runway line support was added because AOI05 and AOI12 showed airfield/runway-related transportation classes.

Observed transportation-related products include:

    transportationL
      line network
    
    transportationA
      polygon area transport features such as airfield and heliport damage

---

### **14. AOI12 Caraballeda advanced layer support**

AOI12 Caraballeda exposed additional layer families beyond basic built-up and transportation:

    ancillaryCrisisInfoP
      Crisis Points
      Blocked road / interruption
    
    facilitiesA
      Facilities Area
      Damaged
      Possibly damaged
    
    transportationA
      Transportation Area
      Airfield and Heliport, Damaged

These layer families were added generically, not as AOI12-specific hard-coding.

The layer classification function now recognizes layer names containing:

    ancillaryCrisisInfoP
    facilitiesA
    transportationA

This makes the dashboard more future-proof for later Copernicus products using similar layer names.

---

### **15. Basemap controls moved into the map legend**

The original sidebar had a separate “Mapa base / Basemap” panel:

    Satellite + streets
    Muted OSM
    Show street names over satellite

This was moved into the map legend so that basemap and layer visibility controls live together.

The map legend now starts with:

    Basemap
      Satellite + streets
      Muted OSM
      Show street names over satellite

The old sidebar basemap panel is hidden, not removed, to avoid breaking existing DOM references.

A small footer disclosure button was added for the basemap provider note:

    Nota sobre el mapa base

This contains the provider/prototype note:

    Prototipo: satélite por Esri; calles claras por CARTO/OpenStreetMap.
    Para tráfico masivo, cambiar a un proveedor de teselas de producción.

This keeps the sidebar cleaner while preserving attribution/context.

---

### **16. Data status panel redesign**

The data status panel was redesigned after the previous compact list created overlap and readability issues.

Old problematic style:

    Entrega de Copernicus     27 jun 2026, 17:21
    Imagen satelital          26 jun 2026, 20:20
    Última comprobación       28 jun 2026, 9:01
    Carga correcta del visor  28 jun 2026, 9:07

The requested design was a more compact 2×2 block.

Current design:

    Full-width:
      Activation
      Area / product
      Cache
    
    2×2 time tiles:
      Copernicus delivery
      Satellite image
      Last checked
      Last successful dashboard load

The product line was simplified to avoid mixing too much metadata in one row.

Instead of:

    Moron AOI06 · Grading Monitoring 1 · #2614 · status F

the UI now shows a cleaner product summary:

    Moron AOI06 · Grading Monitoring 1

or, for combined products:

    Moron AOI06 · Grading Monitoring 1 + Grading

Product IDs and status codes remain available in console/API metadata but are no longer forced into the compact UI.

---

### **17. Large GeoJSON real download progress**

AOI00 ground movement is a large GeoJSON/TileJSON-like layer and can take time to download.

Previously, the loading bar was an indeterminate “fake” progress animation. It did not show real download percentage.

A real streamed download progress implementation was added for large Copernicus JSON documents.

The `fetchJsonDocument` flow now:

    uses fetch()
    checks Content-Length
    reads response.body with ReadableStream.getReader()
    tracks downloaded bytes
    updates real percentage when Content-Length exists
    shows downloaded bytes if Content-Length is unavailable
    avoids fake percentages when total size is unknown

For example, if Content-Length is available:

    42% · 18.2 MB / 43.5 MB

If Content-Length is not available:

    18.2 MB

This is mainly used for large ground movement layers such as AOI00.

Important distinction:

    Large JSON download:
      real full-file percentage is meaningful
    
    COG source imagery:
      full-file percentage is not meaningful because COG rendering should load byte ranges / visible tiles, not the entire TIFF

---

### **18. Footer credit update**

The footer was rewritten for readability.

Previous footer text included the author name inside a long paragraph.

The author credit was moved to its own line and linked to:

    https://www.yin.roma.it/

Current concept:

    Source:
      Copernicus EMS Rapid Mapping
    
    Unofficial public interface notice:
      no rescue, casualty, or missing-person data collected
      link to GitHub project for issues
    
    Built by:
      YIN Renlong

This makes the disclaimer and author credit easier to scan.

---

### **19. Client-side COG source imagery rendering**

A major new function was added: real rendering of **Imagen fuente de Copernicus**.

The Copernicus API exposes source imagery as COG TIFF layers:

    product.layers[]
      name: EMSR884/AOI05/GRA_PRODUCT/...ORTHO_cog.tif
      format: cog

The product `images[]` metadata provides the human-readable label:

    sensorName: WorldView-3
    acquisitionTime: 2026-06-26T15:10:00

The dashboard now combines these to show legend rows such as:

    WorldView-3 - 26/06/2026, 15:10 (UTC)
    Legion - 26/06/2026, 15:11 (UTC)
    Pleiades Neo - 26/06/2026, 15:18 (UTC)

The full COG URL is constructed from the activation AWS bucket:

    https://rapidmapping-viewer.s3.eu-west-1.amazonaws.com

plus the layer name.

---

### **20. Why COG rendering needed special implementation**

MapLibre raster sources normally expect tiled image URLs:

    /{z}/{x}/{y}.png
    /{z}/{x}/{y}.jpg

Copernicus provides single COG TIFF files:

    ...ORTHO_cog.tif

Browsers do not natively render georeferenced TIFFs directly as map tiles.

Therefore a client-side COG renderer was added.

Decision chosen:

    Option A: Client-side COG rendering in the browser

Reasons:

    keeps the project static
    works with GitHub Pages
    avoids backend/server infrastructure
    avoids downloading the full TIFF
    loads source imagery only on demand
    preserves fallback links to TIFF files

---

### **21. COG rendering implementation details**

The COG renderer lazy-loads these libraries from CDN:

    geotiff.js
    proj4.js

The dashboard registers a custom MapLibre protocol:

    emsrcog://tile/{z}/{x}/{y}.png?url=...

When MapLibre requests a tile, the custom protocol:

    parses z/x/y and the source COG URL
    reads the needed COG byte ranges using geotiff.js
    projects tile bounds into the COG coordinate system
    reads a raster window from the COG
    draws a 256×256 PNG tile in a canvas
    returns the PNG ArrayBuffer to MapLibre

Important internal structures:

    COG_META_CACHE_V8
      caches parsed GeoTIFF metadata and first image object
    
    COG_TILE_CACHE_V8
      caches rendered PNG tile promises
      bounded to avoid unbounded memory growth
    
    COG_STATE_V8
      stores visibility and opacity per source image
    
    COG_CATALOG_V8
      maps legend image keys to COG metadata items
    
    COG_PROTOCOL_REGISTERED_V8
      ensures the custom protocol is registered only once

---

### **22. COG projection handling**

The renderer attempts to detect the GeoTIFF EPSG code using GeoTIFF geokeys:

    ProjectedCSTypeGeoKey
    GeographicTypeGeoKey
    citation strings containing EPSG codes

If no EPSG is detected, the renderer uses fallbacks:

    if bounding box looks like lon/lat:
      EPSG:4326
    
    if bounding box looks like Web Mercator:
      EPSG:3857
    
    otherwise for EMSR884 Venezuela products:
      EPSG:32619

EPSG definitions are registered with proj4 for:

    EPSG:4326
    EPSG:3857
    UTM north zones EPSG:32601-32660
    UTM south zones EPSG:32701-32760 when needed

This is intended to cover the expected Venezuela products, which are commonly WGS84 / UTM zone 19N.

---

### **23. COG legend UI and opacity**

Source imagery is off by default to protect performance.

The legend now shows each source image as a checkbox row with a TIFF fallback link:

    [ ] WorldView-3 - 26/06/2026, 15:10 (UTC)  TIFF

When enabled, the COG raster layer is added to the map.

Each source image has its own opacity slider:

    Opacity 75%

The opacity is per-image, not global. This supports comparison use cases such as:

    enable Grading source image at 65%
    enable Monitoring source image at 65%
    compare with vector overlays

The map draw order is:

    basemap
    Copernicus source imagery
    notAnalysed / ground movement / area layers
    built-up layers
    transportation layers
    AOI outline
    labels

This lets source imagery provide context without hiding vector overlays.

---

### **24. COG-only product handling**

After adding COG rendering, products with no damage vector layers but with source imagery became displayable.

Examples include:

    AOI01 Petare
    AOI03 Antimano
    AOI07 Puerto Cabello
    AOI09 Valencia
    AOI10 Guacara
    AOI11 Villa de Cura

These products may be officially `Not produced`, but the source image exists.

The UI now treats these as:

    clickable if COG exists
    red status if official status is N
    message indicates source image availability
    no fake “damage layers available” wording

This better matches the official viewer.

---

### **25. Source image loading UX**

COG rendering uses tile/range reads rather than full-file download. Therefore the real full-file download progress UI used for AOI00 GeoJSON is not appropriate for COG imagery.

For source images the dashboard shows:

    Loading Copernicus source image
    Preparing official image tiles...

When the map becomes idle after adding the COG layer, a success notice appears:

    Source image loaded

If COG rendering fails, the dashboard shows an error and keeps the TIFF link available in the legend.

Common possible failure reasons:

    CORS restrictions
    missing HTTP Range support
    unsupported TIFF compression/color structure
    missing projection metadata
    browser memory/performance limits

---

### **26. UI iteration: product selector design**

Several product-selector designs were tried.

#### **Initial product panel**

A separate “Productos” panel was added below AOI selection.

Problem:

    Product selection was disconnected from the AOI row.
    It was less intuitive than the official Copernicus hierarchy.

Result:

    Replaced with inline product choices below the selected AOI.

#### **All products card**

A visible “Todos los productos” card was briefly introduced.

Problem:

    It forced all products on/off.
    It did not support arbitrary combinations.
    It took too much space.
    It would not scale well for Monitoring 2 / Monitoring 3.

Result:

    Removed visible all-products card.
    Replaced by independent product checkboxes.

#### **Rounded product cards**

Product rows initially used rounded selected boxes with strong green backgrounds.

Problem:

    Looked like cards inside a card.
    Too visually heavy.
    Green gradient looked old/noisy.
    Product rows competed with AOI rows.

Result:

    Replaced by flat product timeline/checklist.

#### **Final product selector**

Current design:

    flat timeline/checklist
    no rounded product boxes
    no gradient backgrounds
    thin timeline connector
    checkbox only
    selected row uses subtle official-status rail
    product text is compact

This creates a cleaner hierarchy:

    AOI row = parent item
    Product rows = child timeline options

---

### **27. UI iteration: AOI list design**

The AOI city rows initially used large rounded cards.

This was functional but visually heavy, especially with the product timeline below.

The design was changed to a flatter AOI list:

    no large rounded city boxes
    subtle divider between AOIs
    selected AOI uses thin official-status rail
    selected AOI gets a subtle status-colored tint
    hover uses slight translateX animation
    status dot remains visible and official-status colored

The selected AOI still stands out, but no longer feels like a large card.

Hover behavior:

    background slightly brightens
    row moves slightly to the right
    status dot grows subtly

On mobile, hover movement is reduced/disabled to avoid jumpy behavior.

---

### **28. UI iteration: status color semantics**

Yellow was initially used as the selected-product color because it matched the app accent color.

This was changed because yellow had semantic conflict:

    yellow = selected UI accent
    amber = planned / in progress official status

The current rule is:

    green:
      official completed / status F
    
    red:
      official not produced / status N
    
    amber:
      official planned or in progress / status W or I
    
    neutral:
      unselected / informational structure

This applies to:

    AOI status dots
    selected AOI rail
    product checkbox color
    selected product rail

The design avoids using saturated color fills for selection; it uses thin rails and subtle tints instead.

---

### **29. Syntax/debugging notes**

Several patches were delivered as automated Python scripts using file backups.

Earlier in the project, generated code had introduced JavaScript syntax issues such as accidental tagged-template usage:

    console.warn`Layer ${kind} failed:`, error);

These were repaired to normal function calls:

    console.warn(`Layer ${kind} failed:`, error);

A previous product selector patch failed a sanity check because the check searched for:

    status-green-aoi-card

inside app.js, while the app generated this class dynamically as:

    `${statusClass}-card`

The patch did not actually fail functionally, but the sanity check was too strict. A corrected patch checked for the dynamic expression and successfully completed.

All patch scripts saved timestamped backups before modifying files.

---

### **30. Current important JavaScript structures**

Important state variables and structures now include:

    selectedAoiNumber
      currently selected AOI number
    
    selectedProductKey
      comma-separated selected product keys
      supports one or multiple products
    
    latestAois
      AOI list loaded from Copernicus API
    
    currentProductOptions
      product options for selected AOI
    
    latestSelectedProductInfo
      current AOI/product/layers/cog metadata used by map and legend
    
    layerVisibility
      stores vector-layer and class visibility states
    
    loadedSourceMeta
      MapLibre source metadata for loaded vector/raster data
    
    DYNAMIC_DATA_LAYER_IDS_V4
      dynamically created MapLibre layer IDs
    
    DYNAMIC_SOURCE_IDS_V4
      dynamically created MapLibre source IDs
    
    JSON_DOCUMENT_MEMORY_CACHE
      in-memory cache for fetched JSON documents
    
    COG_META_CACHE_V8
      cache for parsed GeoTIFF metadata
    
    COG_TILE_CACHE_V8
      cache for rendered COG tile PNGs
    
    COG_STATE_V8
      per-source-image visibility and opacity
    
    COG_CATALOG_V8
      source-image registry for legend controls

---

### **31. Current supported Copernicus layer families**

The dashboard currently recognizes:

    builtUpA
      built-up damage polygons
    
    builtUpP
      built-up damage points
    
    transportationL
      transportation line network
    
    transportationA
      transportation area polygons
    
    facilitiesA
      facilities polygons
    
    ancillaryCrisisInfoP
      crisis/ancillary points such as blocked road/interruption
    
    notAnalysedA
      not analysed polygons
    
    groundMovementA
      ground displacement polygons
    
    COG imagery
      official Copernicus source image TIFFs

Layer classification is based on layer names and URLs from product.layers[].

---

### **32. Current data source interpretation**

The dashboard still uses the official Copernicus public activation API:

    https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations/?code=EMSR884

Important paths:

    results[0].aois[]
      list of AOIs
    
    aoi.products[]
      product packages for an AOI
    
    product.layers[]
      public vector/raster layer metadata
    
    product.images[]
      source image metadata
    
    product.version.statusCode
      official product status
    
    product.downloadPath
      official product ZIP
    
    results[0].aws_bucket
      base URL for COG layer names

The dashboard does not require local data files in production.

---

### **33. Current status after 28 June update**

The dashboard now supports:

    Dynamic AOI list from Copernicus EMSR884 API
    
    Official AOI status handling:
      F completed -> green
      N not produced -> red
      W/I planned/in progress -> amber
    
    Product-scoped layer loading
    
    Multiple selected products per AOI
    
    Inline product checkboxes below selected AOI
    
    Dynamic product-scoped legend
    
    Independent layer-family/class toggles
    
    builtUpA polygons
    
    builtUpP points
    
    transportationL line subcategories
    
    transportationA area polygons
    
    facilitiesA polygons
    
    ancillaryCrisisInfoP crisis points
    
    notAnalysedA polygons
    
    groundMovementA displacement classes
    
    COG source imagery rendering in browser
    
    Per-source-image opacity controls
    
    TIFF fallback links
    
    Source-image-only products
    
    Real streamed download progress for large JSON layers
    
    Basemap controls inside map legend
    
    Compact 2×2 data status time panel
    
    Cleaner footer attribution and author link
    
    Flat AOI selector design
    
    Flat product timeline/checklist design

---

### **34. Known limitations and risks**

#### **COG rendering performance**

Client-side COG rendering may be slower on older mobile devices. It depends on:

    CORS
    HTTP Range requests
    COG internal overviews
    TIFF compression
    browser memory

The current implementation is intentionally static-site friendly but may not match the performance of a dedicated tile service.

#### **Projection handling**

The COG renderer attempts EPSG detection and uses common fallbacks. If a future product uses an unexpected projection or unusual GeoTIFF metadata, rendering may fail or be spatially inaccurate.

Future improvement could use a more robust georaster/geotiff rendering pipeline or server-side tiling.

#### **SLD styling**

The dashboard currently uses internal styling rules and data-value inspection. It does not fully parse official SLD files.

This means visual styles are close but not guaranteed identical to Copernicus official symbology.

#### **Dynamic class detection for vector tiles**

For raw GeoJSON, the dashboard can inspect actual features and hide absent classes.

For TileJSON/vector-tile sources, the browser may not know all feature values before tiles load. In those cases, fallback legend rows may appear even if a class is absent.

#### **COG source imagery progress**

COG imagery uses tile/range loading, not full-file download. A full percentage is intentionally not shown for COGs. The status indicates tile preparation/loading instead.

#### **Many active source images**

If users enable multiple COG source images at once, browser memory and CPU usage may rise. This is especially relevant in product comparison mode.

---

### **35. Future improvement plan**

#### **1. More robust COG rendering**

Potential improvements:

    better per-tile reprojection handling
    better color scaling for 16-bit imagery
    support for unusual photometric interpretations
    progress based on visible tile count
    persistent tile cache via Cache Storage or IndexedDB
    optional COG render quality setting

#### **2. Optional server-side tiling**

If traffic grows or COG rendering is too slow, consider a tile service:

    TiTiler
    Cloud-optimized GeoTIFF tile endpoint
    serverless tile proxy
    pre-generated static tiles for selected products

This would improve performance but add infrastructure.

#### **3. SLD parsing**

The official Copernicus SLD files could be parsed to improve:

    exact legend labels
    exact colors
    exact line patterns
    exact polygon hatching
    future schema adaptation

A fallback style table should remain for resilience.

#### **4. Better feature popups**

Future popups could show:

    product name
    layer family
    damage class
    object type
    simplified class
    detection method
    source image date

Care must be taken not to imply field-verified ground truth.

#### **5. Product comparison controls**

For multiple selected products, a future comparison panel could support:

    show only latest monitoring
    show previous grading
    compare before/after source images
    opacity presets
    synchronized on/off by layer family

#### **6. Persistent user settings**

Possible settings:

    preferred language
    preferred basemap
    source image opacity
    selected AOI/product
    notAnalysed default visibility

These could be stored in localStorage.

#### **7. Better mobile legend UX**

The map legend now contains many controls. Future improvements:

    collapsible legend groups
    sticky basemap section
    search/filter legend rows
    compact mode for small screens

#### **8. Automated schema inspection**

A developer utility could inspect new Copernicus product JSON files and report:

    layer families
    geometry types
    property keys
    unique damage classes
    unique transportation classes
    unknown layer names

This would help future AI/developers update the dashboard safely.

#### **9. More explicit “source image only” mode**

For `N / Not produced` AOIs with COG imagery, the UI could show a clearer message:

    Official grading was not produced.
    Only the source satellite image is available.

This would help prevent misinterpretation.

---

### **36. Important design principles established**

The main principles established on 28 June 2026 are:

    1. The official Copernicus product status is authoritative.
    
    2. Source imagery availability does not mean damage assessment availability.
    
    3. Products must be treated as separate temporal packages.
    
    4. Do not silently mix Grading and Grading Monitoring layers.
    
    5. Multi-product comparison must be explicit and user-controlled.
    
    6. Legend rows must be product-scoped and layer-family-scoped.
    
    7. COG imagery should be lazy-loaded and off by default.
    
    8. Large raw JSON downloads should show real progress when possible.
    
    9. The UI should avoid heavy nested cards and use lightweight GIS/data-panel patterns.
    
    10. The dashboard remains unofficial and public-information-only.

---

### **37. Summary of the 28 June 2026 result**

By the end of this iteration, the dashboard moved from a simple grading-layer viewer into a more complete Copernicus product viewer for EMSR884.

It now understands that an AOI can contain multiple products such as:

    Grading
    Grading Monitoring 1
    Ground Movement

and that each product can contain different layer families, source images, official status, legends, and timestamps.

The current implementation is significantly more faithful to the Copernicus Products Viewer while still keeping the project static, lightweight, multilingual, and usable from GitHub Pages.









**[26 June 2026]**

This section records the main design thinking, debugging, and implementation changes made on **26 June 2026** while extending the dashboard beyond the original grading-focused workflow.

### 1. Problem discovered: AOI00 was available but displayed no data

During testing, **AOI00 Central Coastal Venezuela** appeared as an available AOI because the Copernicus EMSR884 API reported a completed product. However, clicking the AOI in the dashboard produced no visible map data.

The reason was that AOI00 did not contain the same grading product structure used by AOI02 Caracas and AOI06 Moron. Instead of a normal `GRA` grading product with layers such as:

```text
builtUpA
transportationL
notAnalysedA
```

AOI00 contained a **GRM / Ground Movement** product with a layer named:

```text
groundMovementA
```

The dashboard’s previous logic only recognized grading-related layers. Therefore, AOI00 was correctly detected as having a finished product, but the product layer itself was not understood or styled by the application.

### 2. Copernicus API and downloaded product comparison

The Copernicus public API exposed the AOI00 ground movement layer in the product metadata, for example:

```text
EMSR884/AOI00/GRM_PRODUCT/EMSR884_AOI00_GRM_PRODUCT_groundMovementA_v1_VT
```

The locally downloaded Copernicus product ZIP contained matching files, including:

```text
EMSR884_AOI00_GRM_PRODUCT_groundMovementA_v1.json
EMSR884_AOI00_GRM_PRODUCT_groundMovementA_v1.shp
EMSR884_AOI00_GRM_PRODUCT_groundMovementA_v1.sld
EMSR884_AOI00_GRM_PRODUCT_groundMovementA_v1.tif
```

Inspection of the local GeoJSON showed that the important styling attribute for ground movement is:

```json
{
  "obj_desc": "LOS Displacement",
  "value": "0.05 to 0.1",
  "det_method": "Automatic extraction"
}
```

The `value` field contains the displacement class used by the official Copernicus legend.

Observed ground movement classes were:

```text
-0.5 to -0.2
-0.2 to -0.1
-0.1 to -0.05
-0.05 to 0
0 to 0.05
0.05 to 0.1
0.1 to 0.2
0.2 to 0.5
Above 0.5
```

This confirmed that the downloaded file and the online API layer describe the same product family, and that the dashboard needed a generic `groundMovementA` handler rather than an AOI00-specific workaround.

### 3. Design decision: support product types generically, not only AOI00

A key design decision was to avoid hard-coding AOI00.

The dashboard should support:

- AOIs that only have grading products.
- AOIs that only have ground movement products.
- AOIs that later receive both grading and ground movement products.
- Future grading monitoring products when Copernicus publishes usable public vector layers.
- Future AOIs and future product versions without requiring manual code changes for each AOI.

The implementation was therefore extended around layer type detection and product selection rather than around a single AOI number.

### 4. Ground movement layer support added

Support was added for the new Copernicus layer key:

```text
groundMovementA
```

The dashboard now detects this layer name from the Copernicus manifest and can load it from the public `json` URL.

A new MapLibre source was added:

```text
copernicus-ground-movement-a
```

New layer IDs are generated for each displacement class. Each class has a fill layer and outline layer, allowing visibility to be controlled class by class.

The dashboard styles ground movement polygons using the `value` property. The styling follows a blue-to-red displacement scale similar to the official Copernicus legend:

| Ground movement value | Color role                                      |
| --------------------- | ----------------------------------------------- |
| `-0.5 to -0.2`        | strong negative displacement, dark blue         |
| `-0.2 to -0.1`        | medium negative displacement, blue              |
| `-0.1 to -0.05`       | low negative displacement, light blue           |
| `-0.05 to 0`          | near-zero negative displacement, very pale blue |
| `0 to 0.05`           | near-zero positive displacement, pale yellow    |
| `0.05 to 0.1`         | low positive displacement, orange               |
| `0.1 to 0.2`          | medium positive displacement, orange-red        |
| `0.2 to 0.5`          | high positive displacement, red                 |
| `Above 0.5`           | very high positive displacement, dark red       |

### 5. Separate ground movement legend toggles

A new **Ground Movement** legend section was added to the map overlay.

Each displacement class is separately toggleable:

```text
-0.5 to -0.2
-0.2 to -0.1
-0.1 to -0.05
-0.05 to 0
0 to 0.05
0.05 to 0.1
0.1 to 0.2
0.2 to 0.5
Above 0.5
```

This followed the design idea that the legend should not only explain the colors, but also allow the user to isolate specific displacement ranges.

The legend is dynamic:

- If an AOI has no ground movement layer, the ground movement legend section is hidden.
- If an AOI has no transportation layer, the transportation legend section is hidden.
- If an AOI has no built-up grading layer, the built-up grading rows are hidden.
- If an AOI has a not-analysed layer, the not-analysed toggle is shown.
- The AOI outline toggle remains under general information when the AOI boundary is available.

This prevents the legend from showing irrelevant categories for the selected AOI.

### 6. Product selection logic improved

The earlier product selection logic primarily preferred finished `GRA` products. That worked for AOI02 Caracas and AOI06 Moron, but it was not enough for AOI00 because AOI00’s useful layer was in a `GRM` product.

The selection logic was updated so the dashboard can collect the best available product per layer key:

```text
builtUpA
transportationL
notAnalysedA
groundMovementA
```

This means a single selected AOI may use layer URLs from more than one product if Copernicus publishes multiple useful products for the same AOI.

The dashboard now scores products using:

- whether the product has useful public layers,
- product status code,
- product type (`GRA` or `GRM`),
- monitoring flag and monitoring number,
- product delivery time,
- expected delivery time,
- satellite acquisition time.

This helps the dashboard handle both initial products and future monitoring products more gracefully.

### 7. AOI00 now loads as a Ground Movement product

After adding `groundMovementA` support, AOI00 Central Coastal Venezuela can be opened directly:

```text
?aoi=0
```

The dashboard now loads the ground movement layer and displays it using the new displacement legend.

This fixes the earlier behavior where AOI00 appeared available but showed no usable data when selected.

### 8. Syntax issue found and repaired during patching

During the first code patch, a syntax issue was introduced:

```js
async async function loadAoi(...)
```

This happened because the replacement helper inserted a new `async function` while leaving the original `async` keyword in place.

The browser reported:

```text
Uncaught SyntaxError: Unexpected token 'async'
```

A repair patch replaced all occurrences of:

```js
async async function
```

with:

```js
async function
```

After this, the app loaded correctly again.

This debugging step led to a safer replacement helper that recognizes optional `async` prefixes when replacing JavaScript functions.

### 9. Large GeoJSON performance issue identified

AOI00’s ground movement GeoJSON is large, approximately tens of megabytes. The initial public URL tested was:

```text
https://rapidmapping-viewer.s3.eu-west-1.amazonaws.com/EMSR884/AOI00/GRM_PRODUCT/EMSR884_AOI00_GRM_PRODUCT_groundMovementA_v1.json
```

The dashboard originally used `cache: "no-store"` for all JSON fetches. This meant that when a user switched from AOI00 to another AOI and then back to AOI00, the browser could redownload the large ground movement JSON again.

This was identified as a poor design for users with limited bandwidth.

### 10. Browser-session JSON cache added

A practical browser-session cache was added for large Copernicus layer JSON documents.

The dashboard now keeps a memory cache keyed by layer URL:

```js
const JSON_DOCUMENT_MEMORY_CACHE = new Map();
```

When the same layer URL is requested again during the same browser tab/session, the dashboard reuses the already fetched and parsed JSON object instead of downloading it again.

This improves the common interaction:

```text
AOI00 → AOI02 → AOI00
```

The first AOI00 load still has to download the large file, but returning to AOI00 in the same session should reuse cached data.

### 11. Browser HTTP cache allowed for layer JSON

The manifest still uses freshness-oriented loading because it is small and may change. However, layer JSON URLs are versioned product URLs, so they can safely use normal browser HTTP caching.

Layer JSON fetches now use cache behavior appropriate for reusable versioned assets instead of forcing `no-store`.

Design principle:

- The manifest should be checked periodically.
- Large versioned layer files should be reused when the URL has not changed.
- If Copernicus publishes a new product version, the manifest should expose a new or updated layer URL.

### 12. Professional large-layer loading notice added

A user-facing notice was added for large ground movement layers.

When loading a potentially large Copernicus ground movement layer for the first time in the session, the dashboard shows a professional message explaining that the first load may take some time on slower connections and that cached data will be reused when possible during the same browser session.

English text:

```text
Loading large geospatial layer

Downloading a large Copernicus layer. The first load may take some time on slower connections; revisiting this AOI in the same browser session will reuse cached data when possible.
```

Equivalent translations were added in Spanish, Italian, and Chinese.

### 13. Optimization ideas considered but deferred

Several larger optimization ideas were considered.

#### Local raw GeoJSON mirror

One idea was to download the large Copernicus GeoJSON and host it in this repository or through GitHub Pages.

This was not implemented for now because it would still require users to download a large raw GeoJSON file. It would move the bandwidth source from Copernicus S3 to GitHub Pages, but it would not solve the fundamental first-load size problem.

#### GitHub Actions update pipeline

Another idea was to use GitHub Actions to periodically check the Copernicus manifest and mirror or optimize changed files.

This was deferred because the current priority was to keep the project simple and avoid adding an automated build/update pipeline.

#### Vector tiles or PMTiles

A stronger long-term solution would be to convert large GeoJSON layers into vector tiles or PMTiles.

This would allow progressive map loading by visible tile instead of downloading the full AOI layer at once. It would be technically better for large layers, but it adds complexity and was intentionally deferred for this iteration.

The current implementation remains a static browser-only dashboard with a simpler cache-based optimization.

### 14. Title and subtitle updated

The project title and subtitle were updated to better describe the broader scope of the dashboard now that it supports both grading and ground movement products.

New English title:

```text
Venezuela 2026 Earthquake: Geospatial Impact Dashboard (EMSR884)
```

New English subtitle:

```text
Unofficial interface for Copernicus satellite assessments (grading and ground movement).
```

The same concept was translated into Spanish, Italian, and Chinese in the UI.

The HTML `<title>` and meta description were also updated.

### 15. Current result after this iteration [26 June 2026]

After this development session, the dashboard supports:

- Dynamic AOI selection across EMSR884.
- Grading products (`GRA`) with built-up, transportation, and not-analysed layers.
- Ground movement products (`GRM`) with displacement classes.
- AOI00 Central Coastal Venezuela ground movement display.
- Class-by-class ground movement legend toggles.
- Dynamic legend visibility depending on the layers actually available for the selected AOI.
- Improved product selection across GRA, GRM, and monitoring products.
- Browser-session caching for large layer JSON files.
- A professional large-layer loading notice.
- Updated multilingual title and subtitle.

The dashboard still intentionally avoids:

- acting as an official emergency response tool,
- collecting rescue, casualty, or personal data,
- requiring a backend server,
- requiring a Mapbox token,
- requiring GitHub Actions or a preprocessing pipeline for the current version.

### 16. Remaining future improvement ideas

Potential future improvements include:

- persistent browser caching with Cache Storage or IndexedDB,
- optional PMTiles/vector-tile generation for very large layers,
- a lightweight data catalog for optimized static layers,
- better progress indication for very large downloads,
- popup inspection for ground movement polygons,
- more detailed handling of future Copernicus monitoring products,
- automated schema inspection tools for new product types.

These are future enhancements and were not implemented in this session.

