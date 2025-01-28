<script setup lang="ts">
import { computed, ref } from 'vue'
import type { OutageDetail } from '../types/outage'
import OutageItem from './OutageItem.vue'
import SummaryValue from './SummaryValue.vue'
import { parseDate } from '../util/parseDate.ts'
import { getRelativeTime } from '../util/getRelativeTime.ts'

const plannerGroupFilter = ref<string | null>(null)
const sortOption = ref('newest')
const typeFilter = ref<'Fault' | 'Planned' | 'Restored' | null>(null)
const search = ref('')

const props = defineProps<{
  outages: OutageDetail[]
}>()

const buildDate = computed(() => {
  return new Date(__BUILD_DATE__)
})

const isFiltersActive = computed(() => {
  return (
    search.value !== '' ||
    plannerGroupFilter.value !== null ||
    typeFilter.value !== null ||
    sortOption.value !== 'newest'
  )
})

const resetFilters = () => {
  search.value = ''
  plannerGroupFilter.value = null
  typeFilter.value = null
  sortOption.value = 'newest'
}

const numberCustomersAffected = computed(() => {
  return sortedOutages.value
    .filter((outage) => outage.outageType === 'Fault')
    .reduce((acc, curr) => {
      return acc + curr.numCustAffected
    }, 0)
})

const activeFaults = computed(() => {
  return sortedOutages.value.filter((outage) => outage.outageType === 'Fault')
})

const newestFault = computed(() => {
  const filteredOutages = sortedOutages.value.filter((outage) => outage.outageType === 'Fault')

  if (filteredOutages.length === 0) {
    return
  }

  return filteredOutages.reduce((acc, curr) => {
    return parseDate(curr.startTime) > parseDate(acc.startTime) ? curr : acc
  }, filteredOutages[0])
})

const mostCustomersAffected = computed(() => {
  const filteredOutages = sortedOutages.value.filter((outage) => outage.outageType === 'Fault')

  if (filteredOutages.length === 0) {
    return
  }

  return filteredOutages.reduce((acc, curr) => {
    return curr.numCustAffected > acc.numCustAffected ? curr : acc
  }, filteredOutages[0])
})

const sortedOutages = computed(() => {
  let filtered = props.outages

  // Apply search filter
  if (search.value) {
    const searchLower = search.value.toLowerCase()
    filtered = filtered.filter(
      (outage) =>
        outage.location.toLowerCase().includes(searchLower) ||
        outage.plannerGroup.toLowerCase().includes(searchLower),
    )
  }

  // Apply filtering first
  if (plannerGroupFilter.value) {
    filtered = filtered.filter(
      (outage) =>
        outage.plannerGroup
          ?.split(',')
          .map((group) => group.trim())
          .includes(plannerGroupFilter.value as string), // Ensure it's a string
    )
  }

  if (typeFilter.value) {
    filtered = filtered.filter((outage) => outage.outageType === typeFilter.value)
  }

  return [...filtered].sort((a, b) => {
    switch (sortOption.value) {
      case 'location-asc':
        return a.location.localeCompare(b.location)
      case 'location-desc':
        return b.location.localeCompare(a.location)
      case 'newest':
        return parseDate(b.startTime).getTime() - parseDate(a.startTime).getTime()
      case 'oldest':
        return parseDate(a.startTime).getTime() - parseDate(b.startTime).getTime()
      case 'restore-earliest':
        return parseDate(a.estRestoreTime).getTime() - parseDate(b.estRestoreTime).getTime()
      case 'restore-latest':
        return parseDate(b.estRestoreTime).getTime() - parseDate(a.estRestoreTime).getTime()
      case 'most-affected':
        return b.numCustAffected - a.numCustAffected
      case 'least-affected':
        return a.numCustAffected - b.numCustAffected
      default:
        return 0
    }
  })
})

const uniquePlannerGroups = computed(() => {
  return [
    ...new Set(
      props.outages
        .flatMap((outage) => outage.plannerGroup.split(','))
        .map((group) => group.trim()), // Trim whitespace for consistency
    ),
  ].sort()
})
</script>

<template>
  <div class="text-gray-400 p-4 text-xs">Updated: {{ buildDate.toLocaleString('en-IE') }}</div>
  <div class="flex flex-wrap gap-12 p-4 py-8">
    <SummaryValue label="Active Faults" :value="activeFaults.length.toLocaleString()" />
    <SummaryValue label="Customers Affected" :value="numberCustomersAffected.toLocaleString()" />
    <SummaryValue
      v-if="mostCustomersAffected"
      label="Largest Fault"
      :value="mostCustomersAffected.location"
      :secondaryValue="mostCustomersAffected.numCustAffected?.toLocaleString() + ' customers'"
    />
    <SummaryValue
      v-if="newestFault"
      label="Newest Fault"
      :value="newestFault.location"
      :secondaryValue="getRelativeTime(parseDate(newestFault.startTime))"
    />
  </div>

  <div class="flex flex-wrap gap-4 p-4 items-center text-sm text-gray-400">
    <div class="flex items-center gap-2">
      <label class="font-semibold">Search:</label>
      <input v-model="search" type="text" class="bg-gray-800 text-white p-2 rounded" />
    </div>
    <div class="flex items-center gap-2">
      <label class="font-semibold">Planner Group:</label>
      <select v-model="plannerGroupFilter" class="bg-gray-800 text-white p-2 rounded">
        <option :value="null">All</option>
        <option v-for="group in uniquePlannerGroups" :key="group" :value="group">
          {{ group }}
        </option>
      </select>
    </div>

    <div class="flex items-center gap-2">
      <label class="font-semibold">Type:</label>
      <select v-model="typeFilter" class="bg-gray-800 text-white p-2 rounded">
        <option :value="null">All</option>
        <option v-for="type in ['Fault', 'Planned', 'Restored']" :key="type" :value="type">
          {{ type }}
        </option>
      </select>
    </div>

    <div class="flex items-center gap-2">
      <label class="font-semibold">Sort by:</label>
      <select v-model="sortOption" class="bg-gray-800 text-white p-2 rounded">
        <option value="location-asc">A - Z</option>
        <option value="location-desc">Z - A</option>
        <option value="newest">Newest Outages</option>
        <option value="oldest">Oldest Outages</option>
        <option value="restore-earliest">Earliest Restore Date</option>
        <option value="restore-latest">Latest Restore Date</option>
        <option value="most-affected">Most Customers Affected</option>
        <option value="least-affected">Least Customers Affected</option>
      </select>

    </div>
    <button
      class="bg-indigo-500 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded cursor-pointer disabled:opacity-50 disabled:cursor-default"
      @click="resetFilters"
      :disabled="!isFiltersActive"
    >
      Reset Filters
    </button>
  </div>
  <div class="grid gap-4 p-4 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
    <OutageItem v-for="outage in sortedOutages" :key="outage.outageId" :outage="outage" />
  </div>
</template>
