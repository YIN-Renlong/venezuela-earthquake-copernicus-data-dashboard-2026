# Venezuela Earthquake Copernicus Data Dashboard 2026

Unofficial public dashboard for the 2026 Venezuela earthquakes, using public Copernicus EMS Rapid Mapping data for activation **EMSR884**.

## Purpose

This project translates public Copernicus satellite damage mapping data into a lightweight, mobile-friendly, multilingual web dashboard.

The first MVP focuses on **Caracas / AOI02**.

## Important disclaimer

This dashboard is for public information only.

It is **not** an official rescue, evacuation, emergency response, or government tool. Always follow local authorities and emergency services.

Damage classes are remote satellite assessments and may require field verification.

## Data source

Official Copernicus EMSR884 activation API:

https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations/?code=EMSR884

Copernicus EMS website:

https://rapidmapping.emergency.copernicus.eu/

## Features

- Multilingual UI: Spanish, English, Italian, Chinese
- Caracas AOI02 focus
- Copernicus `builtUpA`, `transportationL`, and `notAnalysedA` layers
- Interactive legend with layer toggles
- Satellite basemap
- Street map basemap switch
- Data freshness panel
- 30-minute browser-side Copernicus manifest cache
- Hidden maintainer refresh via `?refresh=1`

Example hidden refresh URL:

https://YIN-Renlong.github.io/venezuela-earthquake-copernicus-data-dashboard-2026/?refresh=1

## Tech stack

- Static GitHub Pages hosting
- Vanilla HTML/CSS/JS
- MapLibre GL JS
- Esri World Imagery satellite basemap
- OpenStreetMap street tiles for prototype street-map mode
- CARTO label tiles for street names over satellite
- Public Copernicus EMSR884 API and layer data

## Basemap note

OpenStreetMap public tiles are used here for first prototype testing only.

If the project receives large public traffic, replace the street-map tile source with a production tile provider, self-hosted tiles, or a humanitarian-supported map provider.

## Local development

Run:

`python3 -m http.server 8080`

Then open:

http://localhost:8080

To bypass the 30-minute local cache as maintainer, open:

http://localhost:8080/?refresh=1

## Ethical scope

No casualty, missing-person, rescue, evacuation, medical, or private personal data is collected or displayed by this project.

This is an unofficial public-interest interface for viewing public Copernicus EMSR884 satellite-derived mapping data.
