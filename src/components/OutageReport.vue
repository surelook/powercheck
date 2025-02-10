<script setup lang="ts">
import { ChevronDownIcon, XMarkIcon, MagnifyingGlassIcon } from '@heroicons/vue/24/solid'
import { computed, onMounted, ref, watch } from 'vue'
import { parseDate } from '../util/parseDate.ts'
import OutageItem from './OutageItem.vue'
import RelativeDate from './RelativeDate.vue'
import SummaryValue from './SummaryValue.vue'
import type { OutageDetail } from '../types/outage'
import type { PlannerGroup } from '@/types/planner-group.js'


const activeTypes = ref<string[]>(['Fault', 'Planned', 'Restored'])
const pinnedOutages = ref<string[]>([])
const plannerGroupFilter = ref<string | null>(null)
const search = ref('')
const sortOption = ref('newest')

onMounted(() => {
  const storedPins = JSON.parse(localStorage.getItem('pinned-outages') || '[]')
  pinnedOutages.value = storedPins
})

watch(
  pinnedOutages,
  (newPins) => {
    localStorage.setItem('pinned-outages', JSON.stringify(newPins))
  },
  { deep: true },
)

const toggleTypeFilter = (type: string) => {
  if (!activeTypes.value.includes(type)) {
    return activeTypes.value = [type]
  }

  if (activeTypes.value.length === 1) {
    return activeTypes.value = ['Fault', 'Planned', 'Restored']
  }

  return activeTypes.value = [type]
}

const updatePinnedOutages = (outageId: string, isPinned: boolean) => {
  if (isPinned) {
    if (!pinnedOutages.value.includes(outageId)) {
      pinnedOutages.value.push(outageId)
    }
  } else {
    pinnedOutages.value = pinnedOutages.value.filter((id) => id !== outageId)
  }
  localStorage.setItem('pinned-outages', JSON.stringify(pinnedOutages.value))
}

const props = defineProps<{
  outages: OutageDetail[]
  plannerGroups: PlannerGroup[]
}>()

const buildDate = computed(() => {
  return new Date(__BUILD_DATE__)
})

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

  if (activeTypes.value.length === 0) {
    filtered = []
  } else {
    filtered = filtered.filter((outage) => activeTypes.value.includes(outage.outageType))
  }

  return [...filtered].sort((a, b) => {
    const aPinned = pinnedOutages.value.includes(a.outageId) ? -1 : 1
    const bPinned = pinnedOutages.value.includes(b.outageId) ? -1 : 1

    // Prioritize pinned items
    if (aPinned !== bPinned) return aPinned - bPinned

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
</script>

<template>
  <div class="text-gray-400 p-4 text-xs">
    Updated <RelativeDate :date="buildDate" /> from
    <a target="_blank" href="https://powercheck.esbnetworks.ie/">ESB Networks PowerCheck</a>
  </div>
  <div class="flex flex-wrap gap-8 gap-y-4 p-4 py-4">
    <SummaryValue label="Active Faults" :value="activeFaults.length.toLocaleString()" />
    <SummaryValue label="Customers Affected" :value="numberCustomersAffected.toLocaleString()" />
    <SummaryValue
      v-if="mostCustomersAffected"
      label="Largest Fault"
      :value="mostCustomersAffected.location"
    >
      <template #secondaryValue>
        {{ mostCustomersAffected.numCustAffected?.toLocaleString() + ' customers' }}
      </template>
    </SummaryValue>
    <SummaryValue v-if="newestFault" label="Newest Fault" :value="newestFault.location">
      <template #secondaryValue>
        <RelativeDate :date="parseDate(newestFault.startTime)" />
      </template>
    </SummaryValue>
  </div>

  <div class="flex flex-wrap gap-4 p-4 items-center text-sm text-gray-400">
    <div class="flex items-center relative">
      <input
        v-model="search"
        placeholder="Search"
        type="text"
        class="bg-gray-800 border border-gray-700 rounded-full hover:bg-gray-700 text-white p-2 px-7"
      />

      <MagnifyingGlassIcon class="absolute left-2 w-4 flex items-center text-current pointer-events-none" />
      <XMarkIcon v-if="search.valueOf()" class="absolute right-2 w-4 flex items-center text-current pointer-events-none" />
    </div>

    <div class="inline-flex border rounded-full border-gray-700 overflow-hidden">
        <button
          v-for="type in ['Fault', 'Planned', 'Restored']"
          :key="type"
          @click="toggleTypeFilter(type)"
          :class="[
            'cursor-pointer hover:bg-gray-700 px-4 py-2 text-sm bg-gray-800 font-medium transition-colors duration-200 focus:outline-none',
            activeTypes.includes(type)
              ? type === 'Fault'
                ? 'text-red-500'
                : type === 'Planned'
                  ? 'text-yellow-500'
                  : type === 'Restored'
                    ? 'text-green-500'
                    : ''
              : 'text-gray-700',
          ]"
        >
          {{ type }}
        </button>
      </div>

    <div class="flex items-center relative">
      <select
        v-model="plannerGroupFilter"
        class="bg-gray-800 border border-gray-700 hover:bg-gray-700 cursor-pointer text-white p-2 px-4 pr-8 rounded-full appearance-none"
      >
        <option :value="null">All Planner Groups</option>
        <option
          v-for="plannerGroup in plannerGroups"
          :key="plannerGroup.name"
          :value="plannerGroup.name"
        >
          {{ plannerGroup.name }}
        </option>
      </select>
      <ChevronDownIcon class="absolute right-2 w-4 flex items-center text-current pointer-events-none" />
    </div>

    <div class="flex items-center relative">
      <select
        v-model="sortOption"
        class="bg-gray-800 border cursor-pointer hover:bg-gray-700 border-gray-700 text-white p-2 px-4 pr-8 rounded-full appearance-none"
      >
        <option value="location-asc">Sort A - Z</option>
        <option value="location-desc">Sort Z - A</option>
        <option value="newest">Sort by Newest</option>
        <option value="oldest">Sort by Oldest</option>
        <option value="restore-earliest">Sort by Earliest Restore</option>
        <option value="restore-latest">Sort by Latest Restore</option>
        <option value="most-affected">Sort by Most Customers</option>
        <option value="least-affected">Sort by Fewest Customers</option>
      </select>
      <ChevronDownIcon class="absolute right-2 w-4 flex items-center text-current pointer-events-none" />
    </div>
  </div>

  <div class="grid gap-4 p-4 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
    <OutageItem
      v-for="outage in sortedOutages"
      :key="outage.outageId"
      :outage="outage"
      @toggle-pin="updatePinnedOutages"
    />

    <div
      v-if="sortedOutages.length < 1"
      class="flex flex-col border rounded-lg col-span-full bg-gray-800 border-gray-700 p-4"
    >
      <p class="text-gray-400">There are no results matching your search..</p>
    </div>
  </div>
</template>
