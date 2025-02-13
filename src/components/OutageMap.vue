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

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
  updateMarkers();
});

watch(() => props.outages, updateMarkers, { deep: true });

function updateMarkers() {
  if (!map || !markersLayer) return;
  markersLayer.clearLayers();

  props.outages.forEach(outage => {
    const [lat, lon] = outage.point.c.split(',').map(Number);
    if (!isNaN(lat) && !isNaN(lon)) {
      L.marker([lat, lon])
        .bindPopup(`<strong>${outage.location}</strong><br>${outage.statusMessage}`)
        .addTo(markersLayer);
    }
  });
}
</script>
