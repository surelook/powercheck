<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { OutageDetail } from '@/types/outage'

export type MapPadding = { topLeft: [number, number]; bottomRight: [number, number] }

const props = defineProps<{
  outages: OutageDetail[]
  selectedId: string | null
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
const markers = new Map<string, L.CircleMarker>()
let fitTimer: ReturnType<typeof setTimeout> | undefined

// Canvas gives a hit tolerance around small markers (SVG has none) and keeps markers out of the tab order
const renderer = L.canvas({ tolerance: window.matchMedia('(pointer: coarse)').matches ? 10 : 3 })

const parsePoint = (outage: OutageDetail): L.LatLng | null => {
  const [lat, lng] = (outage.point?.c ?? '').split(',').map(Number)
  return Number.isFinite(lat) && Number.isFinite(lng) ? L.latLng(lat, lng) : null
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

const radiusFor =(customers: number) => Math.min(28, 5 + Math.sqrt(customers || 0) * 0.6)

const styleFor = (outage: OutageDetail): L.CircleMarkerOptions => {
  const selected = outage.outageId === props.selectedId
  return {
    radius: radiusFor(outage.numCustAffected),
    color: selected ? '#ffffff' : typeColors[outage.outageType],
    weight: selected ? 3 : 1,
    fillColor: typeColors[outage.outageType],
    opacity: outage.outageType === 'Restored' && !selected ? 0.7 : 1,
    fillOpacity: selected ? 0.8 : outage.outageType === 'Restored' ? 0.3 : 0.5,
  }
}

const fitPadding = () => ({
  paddingTopLeft: L.point(props.padding.topLeft),
  paddingBottomRight: L.point(props.padding.bottomRight),
})

const bySizeDescending = (a: OutageDetail, b: OutageDetail) => b.numCustAffected - a.numCustAffected

// Smaller outages on top so they stay clickable inside larger circles, selection above all
const restack = () => {
  for (const outage of [...props.outages].sort(bySizeDescending)) markers.get(outage.outageId)?.bringToFront()
  markers.get(props.selectedId ?? '')?.bringToFront()
}

const renderMarkers = () => {
  if (!map || !markerLayer) return
  markerLayer.clearLayers()
  markers.clear()

  for (const outage of [...props.outages].sort(bySizeDescending)) {
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
}

const fitToOutages = (animate = true) => {
  if (!map || !markerLayer) return
  const markerBounds = markerLayer.getLayers().length ? markerLayer.getBounds() : IRELAND_BOUNDS
  const bounds = markerBounds.isValid() ? markerBounds : IRELAND_BOUNDS
  if (animate) map.flyToBounds(bounds, { ...fitPadding(), maxZoom: 11, duration: 0.6 })
  else map.fitBounds(bounds, { ...fitPadding(), maxZoom: 11 })
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
  markerLayer = L.featureGroup().addTo(map)
  renderMarkers()
  fitToOutages(false)
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
    clearTimeout(fitTimer)
    fitTimer = setTimeout(() => fitToOutages(), 300)
  },
)

watch(() => props.selectedId, () => {
  for (const outage of props.outages) markers.get(outage.outageId)?.setStyle(styleFor(outage))
  restack()
  closeOtherTooltips()
})

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
</style>
