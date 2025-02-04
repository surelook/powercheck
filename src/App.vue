<script setup lang="ts">
import OutageReport from './components/OutageReport.vue'
import type { OutageDetail } from './types/outage'
import './analytics'

const files = import.meta.glob<{ default: OutageDetail }>('../data/details/*.json', { eager: true })

// Ensure outages is correctly populated
const outages: OutageDetail[] = Object.values(files).map((mod) => mod.default)
</script>

<template>
  <main>
    <OutageReport :outages="outages" />
  </main>
</template>

<style scoped></style>
