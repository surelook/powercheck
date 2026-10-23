#!/usr/bin/env python3
"""Build approximate ESB Networks planner group areas for the map. See README.md."""
import argparse
import glob
import hashlib
import json
import urllib.request
from pathlib import Path

import numpy as np
import shapely
from PIL import Image
from pyproj import Transformer
from rasterio import features
from rasterio.transform import Affine
from scipy import ndimage, optimize
from scipy.optimize import linear_sum_assignment
from shapely.geometry import Point, box, mapping, shape
from shapely.ops import unary_union

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
OUT = REPO / 'src/assets/planner-group-areas.geojson'

SOURCES = {
    'map.jpg': 'https://media.esbnetworks.ie/media/images/default-source/databaseimages/flex-images/map-of-regions-200kb.jpg?sfvrsn=8eac6ade_1',
    'provinces.geojson': 'https://data-osi.opendata.arcgis.com/api/download/v1/items/1b341039d3344c74b95293012312f44d/geojson?layers=0',
    'eds.geojson': 'https://data-osi.opendata.arcgis.com/api/download/v1/items/11d9ed0931d446889e3ba42ae1b4db73/geojson?layers=0',
    'land.geojson': 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_land.geojson',
}
# The frame, palette and thresholds below are tuned to this exact image
MAP_SHA256 = '835e2806487d238248937d09f19030e8d2e184c3122488395ff48c4287f76e77'

CLASSES = ['white', 'cream', 'black', 'NW', 'SC', 'C', 'SW', 'NE', 'SE']
PALETTE = np.array([
    (255, 255, 255), (252, 249, 230), (20, 20, 20),
    (243, 135, 50), (0, 82, 133), (0, 134, 204), (103, 52, 147), (104, 184, 84), (0, 166, 160),
])
REGION_CLASSES = [CLASSES.index(r) for r in ('NW', 'SC', 'C', 'SW', 'NE', 'SE')]
WHITE, CREAM, BLACK = 0, 1, 2

# Pixels further than this from their region colour are treated as outline; JPEG blurs the thin outlines
COLOUR_TOLERANCE = 35
MIN_AREA_PX = 300
TRACE_TOLERANCE_M = 60
# ESB's image draws no line between these; the shared area is split halfway between the two offices
SHARED = [('Dublin South', 'Arklow')]

to_itm = Transformer.from_crs('EPSG:4326', 'EPSG:2157', always_xy=True)
to_wgs = Transformer.from_crs('EPSG:2157', 'EPSG:4326', always_xy=True)


def project(geom, transformer):
    return shapely.transform(geom, lambda c: np.column_stack(transformer.transform(c[:, 0], c[:, 1])))


def fetch_sources(cache):
    cache.mkdir(parents=True, exist_ok=True)
    for name, url in SOURCES.items():
        path = cache / name
        if not path.exists():
            print(f'Downloading {name}...')
            request = urllib.request.Request(url, headers={'User-Agent': 'powercheck planner-group-areas'})
            with urllib.request.urlopen(request) as response:
                path.write_bytes(response.read())
    digest = hashlib.sha256((cache / 'map.jpg').read_bytes()).hexdigest()
    if digest != MAP_SHA256:
        raise SystemExit(f'ESB map image changed (sha256 {digest}); re-tune the frame and thresholds before trusting output')


def classify(image):
    distance = ((image[:, :, None, :] - PALETTE[None, None]) ** 2).sum(-1)
    return distance.argmin(-1)


def map_frame(shape_):
    frame = np.zeros(shape_, bool)
    frame[30:1265, 340:1300] = True
    frame[:215, :520] = False  # ESB logo
    return frame


def georeference(land, cache):
    """Affine from image pixels to ITM, fitted by maximising overlap with Ireland's real outline."""
    clip = box(-11, 51.2, -5.3, 55.5)
    pieces = unary_union([shape(f['geometry']).intersection(clip) for f in json.loads((cache / 'land.geojson').read_text())['features']])
    island = next(g for g in getattr(pieces, 'geoms', [pieces]) if g.contains(Point(-8, 53.4)))
    island = project(island, to_itm)

    height, width = land.shape
    minx, miny, maxx, maxy = island.bounds
    ys, xs = np.nonzero(land)
    sx = (maxx - minx) / (xs.max() - xs.min())
    sy = (maxy - miny) / (ys.max() - ys.min())
    start = np.array([sx, sy, minx - xs.min() * sx, maxy + ys.min() * sy, 0.0])
    target = ndimage.gaussian_filter(land.astype(float), 3)

    def affine(p):
        a, e, c, f, rot = p
        return Affine(a * np.cos(rot), -a * np.sin(rot), c, e * np.sin(rot), -e * np.cos(rot), f)

    def rasterise(t):
        return features.rasterize([mapping(island)], out_shape=(height, width), transform=t)

    def loss(p):
        r = ndimage.gaussian_filter(rasterise(affine(p)).astype(float), 3)
        return -(r * target).sum() / np.sqrt((r * r).sum() * (target * target).sum())

    result = optimize.minimize(loss, start, method='Nelder-Mead', options={'maxiter': 1500, 'xatol': 1e-6, 'fatol': 1e-7})
    t = affine(result.x)
    fitted = rasterise(t).astype(bool)
    print(f'Georeferenced: {(fitted & land).sum() / (fitted | land).sum():.1%} overlap with Ireland outline')
    return t, fitted


def segment(classes, strict, frame):
    """Label each enclosed area of region colour, then give every other pixel its nearest area's label."""
    labels = np.zeros(classes.shape, int)
    count = 0
    for c in REGION_CLASSES:
        # Eroding first breaks 1px bridges through gaps in the anti-aliased outlines
        lab, k = ndimage.label(ndimage.binary_erosion(frame & (strict == c), iterations=1))
        labels[lab > 0] = lab[lab > 0] + count
        count += k
    sizes = ndimage.sum(np.ones_like(labels), labels, index=np.arange(count + 1))
    keep = sizes >= MIN_AREA_PX
    keep[0] = False
    seeds = np.where(keep[labels], labels, 0)

    # Northern Ireland gets a label of its own so areas don't spill across the border
    ni_labels, _ = ndimage.label(frame & (classes == CREAM))
    ni = count + 1
    seeds[ni_labels == np.bincount(ni_labels.ravel())[1:].argmax() + 1] = ni

    _, (iy, ix) = ndimage.distance_transform_edt(seeds == 0, return_indices=True)
    full = seeds[iy, ix]
    full[~frame] = 0
    return full, ni


def name_areas(full, ni, classes, offices, office_px):
    """Match each office to an area of its region's colour; unmatched fragments join a neighbour."""
    labels = [int(l) for l in np.unique(full) if l not in (0, ni)]
    colour = {}
    for l in labels:
        values = classes[(full == l) & np.isin(classes, REGION_CLASSES)]
        colour[l] = CLASSES[np.bincount(values, minlength=len(CLASSES)).argmax()]

    names = {}
    second = {b for _, b in SHARED}
    for region in sorted({o['region'] for o in offices.values()}):
        groups = [g for g, o in offices.items() if o['region'] == region and g not in second]
        areas = [l for l in labels if colour[l] == region]
        cost = np.zeros((len(groups), len(areas)))
        for j, l in enumerate(areas):
            distance = ndimage.distance_transform_edt(full != l)
            size = (full == l).sum()
            for i, g in enumerate(groups):
                y, x = office_px[g]
                # A slight preference for big areas stops fragments claiming offices near a border
                cost[i, j] = distance[int(round(y)), int(round(x))] - 0.002 * size ** 0.5
        for i, j in zip(*linear_sum_assignment(cost)):
            names[areas[j]] = groups[i]

    merged = full.copy()
    for l in labels:
        if l in names:
            continue
        fragment = full == l
        ring = ndimage.binary_dilation(fragment, iterations=2) & ~fragment
        neighbours = [n for n in merged[ring] if n in names and colour[n] == colour[l]] or [n for n in merged[ring] if n in names]
        target = np.bincount(neighbours).argmax()
        merged[fragment] = target
        print(f'  fragment of {fragment.sum()}px joined {names[target]}')

    masks = {}
    for l, name in names.items():
        mask = merged == l
        partner = next((b for a, b in SHARED if a == name), None)
        if partner:
            yy, xx = np.nonzero(mask)
            (ya, xa), (yb, xb) = office_px[name], office_px[partner]
            nearer = (yy - ya) ** 2 + (xx - xa) ** 2 <= (yy - yb) ** 2 + (xx - xb) ** 2
            masks[name], masks[partner] = np.zeros_like(mask), np.zeros_like(mask)
            masks[name][yy[nearer], xx[nearer]] = True
            masks[partner][yy[~nearer], xx[~nearer]] = True
        else:
            masks[name] = mask
    missing = set(offices) - set(masks)
    if missing:
        raise SystemExit(f'No area found for {sorted(missing)}')
    return masks


def trace(masks, transform, land_roi):
    """Vectorise the image areas in ITM and fit them to the real coastline."""
    polys = {}
    for name, mask in masks.items():
        parts = [shape(g) for g, v in features.shapes(mask.astype(np.uint8), mask=mask, transform=transform) if v == 1]
        polys[name] = unary_union(parts).buffer(0).intersection(land_roi)
    leftover = land_roi.difference(unary_union(list(polys.values())))
    for piece in getattr(leftover, 'geoms', [leftover]):
        if piece.is_empty or piece.area < 1:
            continue
        best = max(polys, key=lambda n: polys[n].buffer(50).intersection(piece.buffer(50)).area or -piece.distance(polys[n]))
        polys[best] = polys[best].union(piece)
    names = sorted(polys)
    return dict(zip(names, shapely.coverage_simplify([shapely.make_valid(polys[n]) for n in names], tolerance=TRACE_TOLERANCE_M)))


def snap_to_eds(traced, cache, overrides):
    """Rebuild each area from the Electoral Divisions it covers most of."""
    names = list(traced)
    tree = shapely.STRtree([traced[n] for n in names])
    members = {n: [] for n in names}
    uncertain = []
    pending = dict(overrides)
    for ed in json.loads((cache / 'eds.geojson').read_text())['features']:
        geom = shapely.make_valid(shape(ed['geometry']))
        overlaps = {names[i]: geom.intersection(traced[names[i]]).area for i in tree.query(geom)}
        if overlaps and max(overlaps.values()) > 0:
            best = max(overlaps, key=overlaps.get)
            share = overlaps[best] / geom.area
        else:
            best = min(names, key=lambda n: traced[n].distance(geom))
            share = 0.0
        key = f"{ed['properties']['ENGLISH']}, {ed['properties']['COUNTY']}"
        if key in pending:
            best = pending.pop(key)['group']
        elif share < 0.75:
            ranked = sorted(overlaps, key=overlaps.get, reverse=True)
            uncertain.append({'ed': key, 'group': best, 'share': round(share, 2), 'runnerUp': ranked[1] if len(ranked) > 1 else None})
        members[best].append(geom)
    if pending:
        raise SystemExit(f'Overrides matched no Electoral Division: {sorted(pending)}')
    return {n: shapely.make_valid(unary_union(members[n])) for n in names}, uncertain


def score(areas_wgs):
    outages = [json.loads(Path(f).read_text()) for f in glob.glob(str(REPO / 'data/details/*.json'))]
    if not outages:
        return
    hits, misses = 0, []
    for o in outages:
        lat, lon = map(float, o['point']['c'].split(','))
        tags = [t.strip() for t in o['plannerGroup'].split(',')]
        inside = next((n for n, g in areas_wgs.items() if g.contains(Point(lon, lat))), None)
        if inside in tags:
            hits += 1
        else:
            misses.append(f'{o["location"]} ({lat:.5f},{lon:.5f}): tagged {"+".join(tags)}, falls in {inside}')
    print(f'Current outages inside a tagged group area: {hits}/{len(outages)}')
    for m in misses:
        print(f'  miss: {m}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, default=REPO / 'data/planner-group-areas', help='downloads and debug output')
    parser.add_argument('--tolerance', type=float, default=200, help='output simplification in metres')
    parser.add_argument('--out', type=Path, default=OUT)
    args = parser.parse_args()

    offices = json.loads((HERE / 'offices.json').read_text())
    overrides = json.loads((HERE / 'overrides.json').read_text())
    api_groups = REPO / 'data/plannergroups.json'
    if api_groups.exists():
        current = {g['name'] for g in json.loads(api_groups.read_text())['plannerGroup']}
        if current != set(offices):
            print(f'WARNING: API planner groups differ from offices.json: +{sorted(current - set(offices))} -{sorted(set(offices) - current)}')

    fetch_sources(args.cache)
    image = np.array(Image.open(args.cache / 'map.jpg').convert('RGB')).astype(int)
    classes = classify(image)
    frame = map_frame(classes.shape)
    land = ndimage.binary_opening(frame & (classes != WHITE), iterations=1)
    transform, fitted = georeference(land, args.cache)

    off_colour = np.sqrt(((image - PALETTE[classes]) ** 2).sum(-1)) > COLOUR_TOLERANCE
    strict = np.where(off_colour & np.isin(classes, REGION_CLASSES), BLACK, classes)
    full, ni = segment(classes, strict, frame)
    inverse = ~transform
    office_px = {}
    for g, o in offices.items():
        px, py = inverse * to_itm.transform(*o['lonLat'])
        office_px[g] = (py, px)
    masks = name_areas(full, ni, classes, offices, office_px)

    provinces = json.loads((args.cache / 'provinces.geojson').read_text())['features']
    land_roi = shapely.make_valid(unary_union([shape(f['geometry']) for f in provinces]))
    traced = trace(masks, transform, land_roi)
    snapped, uncertain = snap_to_eds(traced, args.cache, overrides)

    names = sorted(snapped)
    simplified = shapely.coverage_simplify([snapped[n] for n in names], tolerance=args.tolerance)
    areas_wgs = {n: shapely.set_precision(project(g, to_wgs), 1e-5) for n, g in zip(names, simplified)}
    collection = {
        'type': 'FeatureCollection',
        'features': [{'type': 'Feature', 'properties': {'name': n}, 'geometry': mapping(g)} for n, g in areas_wgs.items()],
    }
    args.out.write_text(json.dumps(collection, separators=(',', ':')))
    print(f'Wrote {len(names)} areas, {args.out.stat().st_size / 1024:.0f} KB -> {args.out}')

    (args.cache / 'uncertain-eds.json').write_text(json.dumps(uncertain, indent=1))
    print(f'{len(uncertain)} Electoral Divisions are split between areas; see {args.cache / "uncertain-eds.json"}')
    check = np.array(Image.open(args.cache / 'map.jpg').convert('RGB'))
    check[fitted ^ ndimage.binary_erosion(fitted, iterations=2)] = (255, 0, 0)
    check[(ndimage.maximum_filter(full, 3) != ndimage.minimum_filter(full, 3)) & frame] = (0, 0, 0)
    Image.fromarray(check).save(args.cache / 'check.png')
    score(areas_wgs)


if __name__ == '__main__':
    main()
