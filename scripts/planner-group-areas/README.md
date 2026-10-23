# Planner group areas

`build.py` generates `src/assets/planner-group-areas.geojson`. The map uses this file to outline the planner group picked in the filter. It has one feature per planner group, and each feature's `name` matches the planner group name the API uses.

ESB Networks doesn't publish these boundaries, so the areas are approximations.

## Accuracy

- Borders are within about 1 km of ESB's own drawing. They follow official Electoral Division lines, and the coastline comes from Tailte Éireann's 20 m data, simplified to 200 m.
- The **Dublin South / Arklow** border is a guess. ESB's image draws no line between them, so their shared area is split halfway between the two offices.
- On 23 Oct 2026, all 35 current outages fell inside the area of a planner group they were tagged with. One of them only does because of the override in `overrides.json`.

## How it works

1. Trace the coloured areas in ESB's [Map of regions](https://www.esbnetworks.ie/customer-support/contact-us/map-of-regions) image.
2. Georeference the image by fitting its land shape to Ireland's real outline, in the Irish Transverse Mercator grid (about 94% overlap).
3. Name each traced area after the office in `offices.json` that falls inside it, keeping to areas of the office's region colour. Roscrea has no label on the image, but this step still finds it, and Thurles is labelled "Tipperary". Fragments the tracing cut off rejoin a neighbour.
4. Fit the areas to the real coastline. Then rebuild each one from the Electoral Divisions it covers most of, applying `overrides.json` along the way.

ESB's areas don't follow counties, baronies, local electoral areas, municipal districts, constituencies or Electoral Divisions. They also don't follow the feeders in ESB's capacity heatmap. Each of those sets lined up with the traced borders little or no better than chance. Electoral Divisions are used only because they give clean, real-world lines at about the same resolution as the trace.

## Running

```sh
python3 -m venv data/planner-group-areas/.venv
data/planner-group-areas/.venv/bin/pip install -r scripts/planner-group-areas/requirements.txt
data/planner-group-areas/.venv/bin/python scripts/planner-group-areas/build.py
```

The script downloads its inputs into `data/planner-group-areas/`, which is gitignored. It also writes `check.png` there, showing the fitted outline and the traced areas over ESB's image, and `uncertain-eds.json`, which lists the Electoral Divisions split between two areas. If `data/details/` exists (the `npm install` step creates it), the script scores the result against the current outages.

The image's pixel frame, colours and thresholds are tuned to the exact file ESB published. If ESB changes the image, the script stops with an error.

## Correcting an area

An outage may land outside every planner group it's tagged with. To fix that:

1. Find the Electoral Division the outage is in.
2. Add it to `overrides.json` as `"NAME, COUNTY"`, along with the correct group and the outage you're relying on.
3. Re-run the script.

The divisions in `uncertain-eds.json` are the most likely ones to need this.

## Sources

- ESB Networks [Map of regions](https://www.esbnetworks.ie/customer-support/contact-us/map-of-regions): region colours, office list and traced borders. The image is downloaded, not redistributed.
- Tailte Éireann [Provinces](https://data-osi.opendata.arcgis.com/datasets/osi::provinces-national-statutory-boundaries-2019-generalised-20m) and [Electoral Divisions](https://data-osi.opendata.arcgis.com/datasets/osi::electoral-divisions-national-statutory-boundaries-2019-generalised-20m), 2019, generalised 20 m, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The map credits these whenever an area is shown.
- [Natural Earth](https://www.naturalearthdata.com/) 10 m land (public domain), used only for georeferencing.
- Office positions geocoded from ESB's addresses with [Nominatim](https://nominatim.openstreetmap.org/), © OpenStreetMap contributors.
