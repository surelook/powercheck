<template>
  <div class="place-self-stretch">
    <l-map ref="map" v-model:zoom="zoom" :center="[53.5, -7.5]">
      <l-tile-layer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        layer-type="base"
        name="OpenStreetMap"
      ></l-tile-layer>
      <l-circle-marker v-for="outage in props.outages"
        :key="outage.outageId"
        :lat-lng="outage.point.c.split(',').map(Number)"
        :radius="10"
        :color="getMarkerColor(outage.outageType)"
        />
    </l-map>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import "leaflet/dist/leaflet.css";
import { LMap, LTileLayer, LCircleMarker } from "@vue-leaflet/vue-leaflet";

const getMarkerColor = (outageType) => {
  switch (outageType) {
    case 'Fault':
      return 'var(--color-red-500)'
    case 'Planned':
      return 'var(--color-orange-500)'
    case 'Restored':
      return 'var(--color-green-500)'
    default:
      return
  }
}

const props = defineProps({
  outages: {
    type: Array,
    required: true,
  },
});

const zoom = ref(7)

</script>

<style></style>
