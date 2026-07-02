# Data folder

Runtime Sentinel-1 comparison-layer files expected by the dashboard:

- data/sentinel1_emsr884_analyzed_area.geojson
- data/sentinel1_emsr884_damaged_structures.pmtiles

The local source files are stored under source_data/ and are ignored by git by default.

PMTiles source layer name for damaged structures:

- s1_damaged_structures

Local PMTiles testing note
--------------------------

The Sentinel-1 damaged-structures layer is served as PMTiles. PMTiles normally requires HTTP byte-range support. GitHub Pages supports this in production. The basic Python local server may not support it correctly, so the PMTiles layer may fail locally even when it works on GitHub Pages.
