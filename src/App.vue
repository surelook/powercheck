<script setup lang="ts">
import OutageReport from './components/OutageReport.vue'
import type { OutageDetail } from './types/outage'
import type { PlannerGroup } from './types/planner-group'
import './analytics'

const outageDefailtFiles = import.meta.glob<{ default: OutageDetail }>('../data/details/*.json', { eager: true })
const plannerGroupFile = import.meta.glob<{ plannerGroup?: PlannerGroup[] }>(
  '../data/plannergroups.json',
  { eager: true }
);

const outages: OutageDetail[] = Object.values(outageDefailtFiles).map((mod) => mod.default)

const plannerGroups: PlannerGroup[] = Object.values(plannerGroupFile).flatMap(
  data => data.plannerGroup ?? []
);
</script>

<template>
  <main>
    <OutageReport :outages="outages" :plannerGroups="plannerGroups" />
  </main>
</template>

<style scoped></style>
