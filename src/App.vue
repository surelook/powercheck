<script setup lang="ts">
import { ref } from 'vue'
import OutageReport from './components/OutageReport.vue'
import OutageMap from './components/OutageMap.vue'
import type { OutageDetail } from './types/outage'
import type { PlannerGroup } from './types/planner-group'
import './analytics'

const outageDefailtFiles = import.meta.glob<{ default: OutageDetail }>('../data/details/*.json', { eager: true })
const plannerGroupFile = import.meta.glob<{ plannerGroup?: PlannerGroup[] }>(
  '../data/plannergroups.json',
  { eager: true }
);

const outages: OutageDetail[] = Object.values(outageDefailtFiles).map((mod) => mod.default);

const plannerGroups: PlannerGroup[] = Object.values(plannerGroupFile).flatMap(
  data => data.plannerGroup ?? []
);

const filteredOutages = ref<OutageDetail[]>([...outages]);

const updateFiltered = (newFiltered: OutageDetail[]) => {
  filteredOutages.value = newFiltered;
}
</script>

<template>
  <main class="h-screen grid md:grid-cols-2">
    <OutageMap class="md-max:display-none" :outages="filteredOutages" />
    <OutageReport
      :outages="outages"
      :plannerGroups="plannerGroups"
      @updateFiltered="updateFiltered"
    />
  </main>
</template>

<style>
  .leaflet-bar a {
    padding: 0;
  }
</style>
