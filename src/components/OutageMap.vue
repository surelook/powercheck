<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { OutageDetail } from '@/types/outage'
import areasUrl from '@/assets/planner-group-areas.geojson?url'

export type MapPadding = { topLeft: [number, number]; bottomRight: [number, number] }

const props = defineProps<{
  outages: OutageDetail[]
  selectedId: string | null
  plannerGroup: string | null
  padding: MapPadding
}>()

const emit = defineEmits<{ select: [outageId: string | null] }>()

// Leaflet sets SVG presentation attributes, which don't resolve CSS variables
const typeColors: Record<OutageDetail['outageType'], string> = {
  Fault: '#ef4444',
  Planned: '#eab308',
  Restored: '#22c55e',
}

const IRELAND_BOUNDS = L.latLngBounds([51.4, -10.6], [55.4, -5.4])

const container = ref<HTMLElement>()
let map: L.Map | null = null
let markerLayer: L.FeatureGroup | null = null
let labelLayer: L.LayerGroup | null = null
const markers = new Map<string, L.CircleMarker>()
let fitTimer: ReturnType<typeof setTimeout> | undefined
let areaLayer: L.GeoJSON | null = null
// Group whose area has been resolved (drawn, or found missing); fits wait for it to avoid a double flight
let areaFor: string | null = null
let areasRequest: Promise<GeoJSON.FeatureCollection | null> | null = null

// Canvas gives a hit tolerance around small markers (SVG has none) and keeps markers out of the tab order
const renderer = L.canvas({ tolerance: window.matchMedia('(pointer: coarse)').matches ? 10 : 3 })

const parsePoint = (outage: OutageDetail): L.LatLng | null => {
  const [lat, lng] = (outage.point?.c ?? '').split(',').map(Number)
  return Number.isFinite(lat) && Number.isFinite(lng) ? L.latLng(lat, lng) : null
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

// Stepped so large outages can't bury their neighbours; labels carry the exact counts
const radiusFor = (customers: number) => (customers >= 1000 ? 8 : customers >= 100 ? 5.5 : 3.5)

// Restored outages are hollow so finished work recedes
const styleFor = (outage: OutageDetail): L.CircleMarkerOptions => {
  const selected = outage.outageId === props.selectedId
  const restored = outage.outageType === 'Restored'
  return {
    radius: radiusFor(outage.numCustAffected),
    color: selected ? '#ffffff' : restored ? typeColors.Restored : '#111827',
    weight: selected ? 3 : restored ? 2 : 1.5,
    opacity: selected ? 1 : restored ? 0.95 : 0.8,
    fillColor: restored ? '#111827' : typeColors[outage.outageType],
    fillOpacity: restored ? 0.22 : 1,
  }
}

const fitPadding = () => ({
  paddingTopLeft: L.point(props.padding.topLeft),
  paddingBottomRight: L.point(props.padding.bottomRight),
})

const stackRank: Record<OutageDetail['outageType'], number> = { Restored: 0, Planned: 1, Fault: 2 }

// Restored at the bottom, and smaller outages above larger ones so they stay clickable
const byStackOrder = (a: OutageDetail, b: OutageDetail) =>
  stackRank[a.outageType] - stackRank[b.outageType] || b.numCustAffected - a.numCustAffected

// Selection above all
const restack = () => {
  for (const outage of [...props.outages].sort(byStackOrder)) markers.get(outage.outageId)?.bringToFront()
  markers.get(props.selectedId ?? '')?.bringToFront()
}

const renderMarkers = () => {
  if (!map || !markerLayer) return
  markerLayer.clearLayers()
  markers.clear()

  for (const outage of [...props.outages].sort(byStackOrder)) {
    const latLng = parsePoint(outage)
    if (!latLng) continue
    const marker = L.circleMarker(latLng, { ...styleFor(outage), renderer })
      .bindTooltip(
        `<strong>${escapeHtml(outage.location)}</strong><br>` +
          `${outage.outageType} · ${outage.numCustAffected.toLocaleString()} customers`,
        { direction: 'top', offset: [0, -4] },
      )
      .on('click', (event) => {
        L.DomEvent.stopPropagation(event)
        emit('select', outage.outageId)
      })
    marker.addTo(markerLayer)
    markers.set(outage.outageId, marker)
  }
  markers.get(props.selectedId ?? '')?.bringToFront()
  placeLabels()
}

type Box = { left: number; top: number; right: number; bottom: number }

const overlaps = (a: Box, b: Box, gap = 0) =>
  a.left < b.right + gap &&
  b.left < a.right + gap &&
  a.top < b.bottom + gap &&
  b.top < a.bottom + gap

// Match .outage-label, so widths are known before the labels exist
const LABEL_NAME_FONT = '500 12px system-ui, sans-serif'
const LABEL_COUNT_FONT = '700 12px system-ui, sans-serif'
const LABEL_HEIGHT = 20
// Padding, borders and the gap between name and count, plus slack for rounding
const LABEL_CHROME = 20

const measureContext = document.createElement('canvas').getContext('2d')
const textWidth = (text: string, font: string) => {
  if (!measureContext) return text.length * 7
  measureContext.font = font
  return measureContext.measureText(text).width
}

// More fit as outages spread apart
const labelLimit = (zoom: number) => (zoom < 7.5 ? 8 : zoom < 9 ? 12 : zoom < 11 ? 18 : 30)

// Largest first, each taking the first free side of its dot; outages under the overlays get none
const placeLabels = () => {
  if (!map || !labelLayer) return
  labelLayer.clearLayers()
  const size = map.getSize()
  const [left, top] = props.padding.topLeft
  const [right, bottom] = props.padding.bottomRight
  const visible: Box = { left, top, right: size.x - right, bottom: size.y - bottom }
  const inside = (box: Box) =>
    box.left >= visible.left &&
    box.top >= visible.top &&
    box.right <= visible.right &&
    box.bottom <= visible.bottom

  const candidates = []
  for (const outage of props.outages) {
    const marker = markers.get(outage.outageId)
    if (!marker || outage.outageType === 'Restored') continue
    const latLng = marker.getLatLng()
    const point = map.latLngToContainerPoint(latLng)
    if (!inside({ left: point.x, top: point.y, right: point.x, bottom: point.y })) continue
    candidates.push({ outage, latLng, point, radius: radiusFor(outage.numCustAffected) })
  }
  candidates.sort((a, b) => b.outage.numCustAffected - a.outage.numCustAffected)

  const limit = labelLimit(map.getZoom())
  // Small dots may be covered; the dots of outages big enough to be labelled are kept clear where possible
  const dots: Box[] = candidates.slice(0, limit * 2).map(({ point, radius }) => ({
    left: point.x - radius,
    top: point.y - radius,
    right: point.x + radius,
    bottom: point.y + radius,
  }))
  const placed: Box[] = []
  const isFree = (box: Box, index: number, strict: boolean) =>
    inside(box) &&
    !placed.some((other) => overlaps(other, box, 3)) &&
    !dots.some((dot, d) => d !== index && (strict || d < index) && overlaps(dot, box))

  for (const [index, { outage, latLng, point, radius }] of candidates.entries()) {
    if (placed.length >= limit) break
    const count = outage.numCustAffected.toLocaleString()
    const width =
      Math.ceil(textWidth(outage.location, LABEL_NAME_FONT) + textWidth(count, LABEL_COUNT_FONT)) +
      LABEL_CHROME
    const gap = radius + 4
    // Icon anchors for right of, left of, above and below the dot
    const anchors: [number, number][] = [
      [-gap, LABEL_HEIGHT / 2],
      [width + gap, LABEL_HEIGHT / 2],
      [width / 2, LABEL_HEIGHT + gap],
      [width / 2, -gap],
    ]
    const boxFor = ([x, y]: [number, number]): Box => ({
      left: point.x - x,
      top: point.y - y,
      right: point.x - x + width,
      bottom: point.y - y + LABEL_HEIGHT,
    })
    // Failing a side clear of every large dot, settle for one that only covers smaller outages
    const anchor =
      anchors.find((a) => isFree(boxFor(a), index, true)) ??
      anchors.find((a) => isFree(boxFor(a), index, false))
    if (!anchor) continue
    placed.push(boxFor(anchor))
    L.marker(latLng, {
      icon: L.divIcon({
        className: 'outage-label',
        html: `<span>${escapeHtml(outage.location)}</span><strong>${count}</strong>`,
        iconSize: [width, LABEL_HEIGHT],
        iconAnchor: anchor,
      }),
      // Kept out of the tab order, like the dots
      keyboard: false,
    })
      .on('click', (event) => {
        L.DomEvent.stopPropagation(event)
        emit('select', outage.outageId)
      })
      .addTo(labelLayer)
  }
}

const fitToOutages = (animate = true) => {
  if (!map || !markerLayer) return
  const bounds = L.latLngBounds([])
  if (markerLayer.getLayers().length) bounds.extend(markerLayer.getBounds())
  if (areaLayer) bounds.extend(areaLayer.getBounds())
  const target = bounds.isValid() ? bounds : IRELAND_BOUNDS
  if (animate) map.flyToBounds(target, { ...fitPadding(), maxZoom: 11, duration: 0.6 })
  else map.fitBounds(target, { ...fitPadding(), maxZoom: 11 })
}

const scheduleFit = () => {
  clearTimeout(fitTimer)
  fitTimer = setTimeout(() => fitToOutages(), 300)
}

// Only needed once a planner group is picked, so fetched on first use
const loadAreas = () =>
  (areasRequest ??= fetch(areasUrl)
    .then((response) => (response.ok ? (response.json() as Promise<GeoJSON.FeatureCollection>) : null))
    .catch(() => null)
    .then((areas) => {
      if (!areas) areasRequest = null
      return areas
    }))

const showPlannerGroupArea = async (name: string | null) => {
  if (!name) {
    areaLayer?.remove()
    areaLayer = null
    areaFor = null
    scheduleFit()
    return
  }
  const areas = await loadAreas()
  if (!map || props.plannerGroup !== name) return
  areaLayer?.remove()
  const feature = areas?.features.find((area) => area.properties?.name === name)
  areaLayer = feature
    ? L.geoJSON(feature, {
        pane: 'plannerGroupArea',
        interactive: false,
        style: { color: '#ffffff', weight: 2, opacity: 0.9, fillColor: '#ffffff', fillOpacity: 0.08 },
        attribution:
          'Area approximated from <a href="https://www.esbnetworks.ie/customer-support/contact-us/map-of-regions">ESB Networks</a> · ' +
          'boundaries © <a href="https://data-osi.opendata.arcgis.com/datasets/osi::electoral-divisions-national-statutory-boundaries-2019-generalised-20m">Tailte Éireann</a>, ' +
          '<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>, modified',
      }).addTo(map)
    : null
  areaFor = name
  scheduleFit()
}

// Centres the outage within the area not covered by overlays
const focusOutage = (outageId: string) => {
  const marker = markers.get(outageId)
  if (!map || !marker) return
  const zoom = Math.max(map.getZoom(), 11)
  const [left, top] = props.padding.topLeft
  const [right, bottom] = props.padding.bottomRight
  const offset = L.point((left - right) / 2, (top - bottom) / 2)
  const target = map.unproject(map.project(marker.getLatLng(), zoom).subtract(offset), zoom)
  map.flyTo(target, zoom, { duration: 0.6 })
  marker.openTooltip()
}

const closeOtherTooltips = () => {
  for (const [outageId, marker] of markers) if (outageId !== props.selectedId) marker.closeTooltip()
}

// Heroicons arrows-pointing-out / arrows-pointing-in
const enterIcon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"/></svg>'
const exitIcon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25"/></svg>'

class FullscreenControl extends L.Control {
  private sync = () => {}

  onAdd() {
    const bar = L.DomUtil.create('div', 'leaflet-bar')
    const button = L.DomUtil.create('a', 'outage-map-fullscreen', bar)
    button.href = '#'
    button.setAttribute('role', 'button')
    this.sync = () => {
      const active = !!document.fullscreenElement
      button.innerHTML = active ? exitIcon : enterIcon
      button.title = active ? 'Exit full screen' : 'Full screen'
      button.setAttribute('aria-label', button.title)
    }
    this.sync()
    document.addEventListener('fullscreenchange', this.sync)
    L.DomEvent.disableClickPropagation(bar)
    L.DomEvent.on(button, 'click', (event) => {
      L.DomEvent.preventDefault(event)
      if (document.fullscreenElement) document.exitFullscreen()
      else document.documentElement.requestFullscreen()
    })
    return bar
  }

  onRemove() {
    document.removeEventListener('fullscreenchange', this.sync)
  }
}

// Pans only if the marker is hidden under an overlay, keeping the current zoom
const revealOutage = (outageId: string) => {
  const marker = markers.get(outageId)
  if (!map || !marker) return
  const [left, top] = props.padding.topLeft
  const [right, bottom] = props.padding.bottomRight
  const size = map.getSize()
  const visible = L.bounds([left, top], [size.x - right, size.y - bottom])
  const point = map.latLngToContainerPoint(marker.getLatLng())
  if (visible.contains(point)) return
  const centre = visible.getCenter()
  map.panBy(point.subtract(centre), { duration: 0.4 })
}

onMounted(() => {
  map = L.map(container.value!, { zoomControl: false, attributionControl: false })
  map.fitBounds(IRELAND_BOUNDS, fitPadding())
  L.control.zoom({ position: 'topright' }).addTo(map)
  // Unsupported on iPhone Safari, so only offer it where it works
  if (document.fullscreenEnabled) new FullscreenControl({ position: 'topright' }).addTo(map)
  L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map)
  map.on('click', () => emit('select', null))
  // Below the markers, and click-through so it never catches marker taps
  const areaPane = map.createPane('plannerGroupArea')
  areaPane.style.zIndex = '350'
  areaPane.style.pointerEvents = 'none'
  markerLayer = L.featureGroup().addTo(map)
  labelLayer = L.layerGroup().addTo(map)
  // Also fires after zooms, so labels are re-chosen for whatever is now in view
  map.on('moveend', placeLabels)
  renderMarkers()
  fitToOutages(false)
  if (props.plannerGroup) showPlannerGroupArea(props.plannerGroup)
})

onBeforeUnmount(() => {
  clearTimeout(fitTimer)
  map?.remove()
  map = null
})

// Keyed on IDs so keystrokes that don't change the matching set leave the map alone
watch(
  () => props.outages.map((outage) => outage.outageId).join(','),
  () => {
    renderMarkers()
    if (props.plannerGroup === areaFor) scheduleFit()
  },
)

watch(() => props.plannerGroup, showPlannerGroupArea)

watch(() => props.selectedId, () => {
  for (const outage of props.outages) markers.get(outage.outageId)?.setStyle(styleFor(outage))
  restack()
  closeOtherTooltips()
})

// The overlays moved, so labels that were clear of them may not be any more
watch(() => props.padding, placeLabels)

defineExpose({ focusOutage, revealOutage, fitToOutages })
</script>

<template>
  <!-- Lifts bottom controls (attribution) above the mobile bottom sheet -->
  <div
    ref="container"
    class="outage-map"
    :style="{ '--overlay-bottom': `${Math.max(0, padding.bottomRight[1] - 24)}px` }"
  ></div>
</template>

<style>
.outage-map {
  background: #b5b3ae;
}

/* Tone the tiles down so the overlays and markers stand out */
.outage-map .leaflet-tile-pane {
  filter: brightness(0.75) saturate(0.6);
}

.outage-map .leaflet-bottom {
  bottom: var(--overlay-bottom, 0);
}

.outage-map .leaflet-control-attribution {
  background: rgb(17 24 39 / 0.7);
  color: #9ca3af;
}

.outage-map .leaflet-control-attribution a,
.outage-map .leaflet-bar a {
  padding: 0;
  color: inherit;
}

.outage-map .leaflet-bar a {
  background: #1f2937;
  border-color: #374151;
  color: #e5e7eb;
}

.outage-map .outage-map-fullscreen {
  display: grid;
  place-items: center;
}

.outage-map .leaflet-bar a:hover {
  background: #374151;
}

.outage-map .leaflet-tooltip {
  background: #111827;
  border-color: #374151;
  color: #f3f4f6;
}

.outage-map .leaflet-tooltip-top::before {
  border-top-color: #374151;
}

/* Fonts match LABEL_NAME_FONT and LABEL_COUNT_FONT */
.outage-map .outage-label {
  display: flex;
  align-items: center;
  gap: 4px;
  box-sizing: border-box;
  padding: 0 6px;
  border: 1px solid #374151;
  border-radius: 4px;
  background: rgb(17 24 39 / 0.88);
  color: #d1d5db;
  font: 500 12px/18px system-ui, sans-serif;
  white-space: nowrap;
}

.outage-map .outage-label strong {
  color: #ffffff;
  font-weight: 700;
}
</style>
