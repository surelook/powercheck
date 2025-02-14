<template>
  <div ref="mapContainer" class="place-self-stretch rounded-lg"></div>
</template>

<script setup lang="ts">
import { onMounted, watch, ref } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const props = defineProps({
  outages: {
    type: Array,
    required: true,
  },
});

const mapContainer = ref(null);
let map;
let markersLayer;

onMounted(() => {
  if (!mapContainer.value) return;

  map = L.map(mapContainer.value).setView([53.5, -7.5], 7);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

  markersLayer = L.layerGroup().addTo(map);
  updateMarkers();
});

watch(() => props.outages, updateMarkers, { deep: true });

function updateMarkers() {
  if (!map || !markersLayer) return;
  markersLayer.clearLayers();

  props.outages.forEach(outage => {
    const className = () => {
      switch (outage.outageType) {
        case 'Fault':
          return 'rounded bg-red-500 border border-red-600';
        case 'Restored':
          return 'rounded bg-green-500 border border-green-600';
        case 'Planned':
          return 'rounded bg-yellow-500 border border-yellow-600';
        default:
          return 'rounded bg-gray-500 border border-gray-600';
      }
    };

    const [lat, lon] = outage.point.c.split(',').map(Number);
    if (!isNaN(lat) && !isNaN(lon)) {
      L.marker([lat, lon], { icon: L.divIcon({ className: className() }) })
        .addTo(markersLayer);
    }
  });
}
</script>
