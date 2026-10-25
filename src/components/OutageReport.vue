<script setup lang="ts">
import { ChevronDownIcon, ChevronUpIcon, XMarkIcon, MagnifyingGlassIcon } from '@heroicons/vue/24/solid'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { parseDate } from '../util/parseDate.ts'
import { hasHistory } from '../util/history.ts'
import HistoryTimeline from './HistoryTimeline.vue'
import OutageItem from './OutageItem.vue'
import OutageMap, { type MapPadding } from './OutageMap.vue'
import RelativeDate from './RelativeDate.vue'
import SummaryValue from './SummaryValue.vue'
import type { OutageDetail } from '../types/outage'
import type { HistorySnapshot } from '../types/history'
import type { PlannerGroup } from '@/types/planner-group.js'

const activeTypes = ref<string[]>(['Fault', 'Planned', 'Restored'])
const plannerGroupFilter = ref<string | null>(null)
const search = ref('')
const sortOption = ref('newest')
const selectedId = ref<string | null>(null)
// Set by clicking a marker; narrows the list to that one outage
const mapFilterId = ref<string | null>(null)
const collapsed = ref(!window.matchMedia('(min-width: 768px)').matches)
// Null while showing the latest outages
const snapshot = ref<HistorySnapshot | null>(null)

const mapRef = ref<InstanceType<typeof OutageMap>>()
const panelRef = ref<HTMLElement>()
const timelineRef = ref<HTMLElement>()
// Height of the panel when it's docked to the bottom as a sheet, which the timeline sits on
const sheetHeight = ref(0)
const mapPadding = ref<MapPadding>({ topLeft: [16, 16], bottomRight: [16, 16] })

let wasSideDocked: boolean | null = null

// Keeps map fits and fly-tos clear of whichever edge the panel is docked to
const updateMapPadding = () => {
  const panel = panelRef.value?.getBoundingClientRect()
  if (!panel) return
  const isSideDocked = panel.width < window.innerWidth * 0.8
  sheetHeight.value = isSideDocked ? 0 : window.innerHeight - panel.top
  // Measured by height, as its position follows the sheet and may not have caught up yet
  const timelineSpace = timelineRef.value?.offsetHeight
    ? timelineRef.value.offsetHeight + (isSideDocked ? 16 : 8)
    : 0
  mapPadding.value = isSideDocked
    ? { topLeft: [panel.right + 24, 24], bottomRight: [24, timelineSpace + 24] }
    : { topLeft: [24, 24], bottomRight: [24, sheetHeight.value + timelineSpace + 24] }

  // The panel jumped edges (e.g. phone rotated), so re-frame for the new free area
  if (wasSideDocked !== null && wasSideDocked !== isSideDocked) reframeMap()
  wasSideDocked = isSideDocked
}

const reframeMap = async () => {
  await nextTick()
  if (selectedId.value) mapRef.value?.focusOutage(selectedId.value)
  else mapRef.value?.fitToOutages()
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  resizeObserver = new ResizeObserver(updateMapPadding)
  if (panelRef.value) resizeObserver.observe(panelRef.value)
  if (timelineRef.value) resizeObserver.observe(timelineRef.value)
  window.addEventListener('resize', updateMapPadding)
  updateMapPadding()
  // The map mounted before the panel was measured, so fit again now padding is known
  nextTick(() => mapRef.value?.fitToOutages(false))
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('resize', updateMapPadding)
})

const toggleTypeFilter = (type: string) => {
  if (!activeTypes.value.includes(type)) {
    return activeTypes.value = [type]
  }

  if (activeTypes.value.length === 1) {
    return activeTypes.value = ['Fault', 'Planned', 'Restored']
  }

  return activeTypes.value = [type]
}

const props = defineProps<{
  outages: OutageDetail[]
  plannerGroups: PlannerGroup[]
}>()

const buildDate = computed(() => {
  return new Date(__BUILD_DATE__)
})

const outages = computed(() => snapshot.value?.outages ?? props.outages)
const asOf = computed(() => snapshot.value?.at ?? buildDate.value)

const numberCustomersAffected = computed(() => {
  return outages.value
    .filter((outage) => outage.outageType === 'Fault')
    .reduce((acc, curr) => {
      return acc + curr.numCustAffected
    }, 0)
})

const numberCustomersAffectedPlanned = computed(() => {
  return outages.value
    .filter((outage) => outage.outageType === 'Planned')
    .reduce((acc, curr) => {
      return acc + curr.numCustAffected
    }, 0)
})

const activeFaults = computed(() => {
  return outages.value.filter((outage) => outage.outageType === 'Fault')
})

const activePlanned = computed(() => {
  return outages.value.filter((outage) => outage.outageType === 'Planned')
})

const newestOutage = computed(() => {
  const filteredOutages = outages.value.filter((outage) => outage.outageType !== 'Restored')

  if (filteredOutages.length === 0) {
    return
  }

  return filteredOutages.reduce((acc, curr) => {
    return parseDate(curr.startTime) > parseDate(acc.startTime) ? curr : acc
  }, filteredOutages[0])
})

const mostCustomersAffected = computed(() => {
  const filteredOutages = outages.value.filter((outage) => outage.outageType !== 'Restored')

  if (filteredOutages.length === 0) {
    return
  }

  return filteredOutages.reduce((acc, curr) => {
    return curr.numCustAffected > acc.numCustAffected ? curr : acc
  }, filteredOutages[0])
})

// Kept separate from sorting so re-sorting doesn't refit the map
const visibleOutages = computed(() => {
  let filtered = outages.value

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

  return filtered
})

const sortedOutages = computed(() => {
  return [...visibleOutages.value].sort((a, b) => {
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

const listedOutages = computed(() => {
  if (!mapFilterId.value) return sortedOutages.value
  return sortedOutages.value.filter((outage) => outage.outageId === mapFilterId.value)
})

// Changing filters widens the list back out from an outage picked on the map
watch([search, activeTypes, plannerGroupFilter], () => (mapFilterId.value = null))

// Scrubbing history keeps the selection for as long as the outage exists
watch(visibleOutages, (visible) => {
  const isVisible = (outageId: string | null) =>
    visible.some((outage) => outage.outageId === outageId)
  if (!isVisible(mapFilterId.value)) mapFilterId.value = null
  if (!isVisible(selectedId.value)) selectedId.value = null
})

const selectFromMap = async (outageId: string | null) => {
  selectedId.value = outageId
  mapFilterId.value = outageId
  if (!outageId) return
  collapsed.value = false
  await nextTick()
  updateMapPadding()
  // Let the new padding reach the map's props before measuring against it
  await nextTick()
  mapRef.value?.revealOutage(outageId)
}

const selectFromList = (outageId: string) => {
  selectedId.value = outageId
  mapRef.value?.focusOutage(outageId)
}

const getToggleFilterClass = (type: string) => {
  if (!activeTypes.value.includes(type)) {
    return 'text-gray-700'
  }

  switch (type) {
      case 'Fault':
        return 'text-red-500'
      case 'Planned':
        return 'text-yellow-500'
      case 'Restored':
        return 'text-green-500'
      default:
        return 'text-gray-700'
  }
}
</script>

<template>
  <div class="fixed inset-0 overflow-hidden">
    <aside
      ref="panelRef"
      class="absolute z-[1000] flex flex-col overflow-y-auto overscroll-contain border border-gray-700 bg-gray-900/85 shadow-2xl backdrop-blur-md inset-x-0 bottom-0 max-h-[75dvh] rounded-t-2xl md:inset-x-auto md:top-4 md:bottom-auto md:left-4 md:w-[26rem] md:max-h-[calc(100dvh-2rem)] md:rounded-2xl"
    >
      <div class="flex shrink-0 items-start justify-between gap-4 p-4 pb-2">
        <div class="text-gray-400 text-xs">
          <template v-if="snapshot">Recorded <RelativeDate :date="snapshot.at" /></template>
          <template v-else>Updated <RelativeDate :date="buildDate" /></template>
          from
          <a target="_blank" href="https://powercheck.esbnetworks.ie/">ESB Networks PowerCheck</a>
        </div>
        <button
          @click="collapsed = !collapsed"
          :aria-expanded="!collapsed"
          :aria-label="collapsed ? 'Show outage list' : 'Hide outage list'"
          class="shrink-0 cursor-pointer rounded-full p-1 text-gray-400 hover:bg-gray-700 hover:text-white"
        >
          <!-- Points the way the panel will move: up from the bottom on phones, down from the top
               on wider screens -->
          <ChevronUpIcon class="w-5" :class="collapsed ? 'md:hidden' : 'max-md:hidden'" />
          <ChevronDownIcon class="w-5" :class="collapsed ? 'max-md:hidden' : 'md:hidden'" />
        </button>
      </div>

      <div class="grid shrink-0 grid-cols-2 gap-x-4 gap-y-3 px-4 pb-4">
        <SummaryValue label="Ongoing Faults">
          <template #value>
            {{ activeFaults.length.toLocaleString()}}<span v-if="activePlanned.length" class="text-sm text-yellow-500"> +{{ activePlanned.length.toLocaleString() }} planned</span>
          </template>
        </SummaryValue>
        <SummaryValue label="Customers Affected">
          <template #value>
            {{ numberCustomersAffected.toLocaleString() }}<span v-if="activePlanned.length" class="text-sm text-yellow-500"> +{{ numberCustomersAffectedPlanned.toLocaleString() }} planned</span>
          </template>
        </SummaryValue>
        <template v-if="!collapsed">
          <SummaryValue v-if="mostCustomersAffected" label="Largest Outage">
            <template #value>
              {{ mostCustomersAffected.location }}
            </template>
            <template #secondaryValue>
              {{ mostCustomersAffected.numCustAffected?.toLocaleString() + ' customers' }}
            </template>
          </SummaryValue>
          <SummaryValue v-if="newestOutage" label="Newest Outage">
            <template #value>
              {{ newestOutage.location }}
            </template>
            <template #secondaryValue>
              <RelativeDate :date="parseDate(newestOutage.startTime)" />
            </template>
          </SummaryValue>
        </template>
      </div>

      <template v-if="!collapsed">
        <div class="flex shrink-0 flex-col gap-2 border-t border-gray-700 p-4 text-sm text-gray-400">
          <div class="flex items-center relative">
            <input
              v-model="search"
              placeholder="Search"
              type="text"
              class="w-full bg-gray-800 border border-gray-700 rounded-full hover:bg-gray-700 text-white p-2 px-7"
            />

            <MagnifyingGlassIcon class="absolute left-2 w-4 flex items-center text-current pointer-events-none" />
            <XMarkIcon v-if="search.valueOf()" @click="search = ''" class="absolute right-2 w-4 flex items-center text-current cursor-pointer" />
          </div>

          <div class="flex border rounded-full border-gray-700 overflow-hidden">
            <button
              v-for="type in ['Fault', 'Planned', 'Restored']"
              :key="type"
              @click="toggleTypeFilter(type)"
              :class="[
                'flex-1 cursor-pointer hover:bg-gray-700 px-4 py-2 text-sm bg-gray-800 font-medium transition-colors duration-200 focus:outline-none',
                getToggleFilterClass(type)
              ]"
            >
              {{ type }}
            </button>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div class="flex items-center relative">
              <select
                v-model="plannerGroupFilter"
                class="w-full bg-gray-800 border text-sm border-gray-700 font-medium hover:bg-gray-700 cursor-pointer text-white p-2 px-4 pr-8 rounded-full appearance-none"
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
                class="w-full bg-gray-800 border cursor-pointer text-sm font-medium hover:bg-gray-700 border-gray-700 text-white p-2 px-4 pr-8 rounded-full appearance-none"
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
        </div>

        <div class="flex min-h-48 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4 pt-0">
          <button
            v-if="mapFilterId"
            @click="mapFilterId = null"
            class="flex shrink-0 cursor-pointer items-center justify-between rounded-full border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-400 hover:bg-gray-700 hover:text-white"
          >
            <span>Showing selected outage</span>
            <span class="flex items-center gap-1 font-medium text-white">
              Show all {{ sortedOutages.length.toLocaleString() }}
              <XMarkIcon class="w-4" />
            </span>
          </button>

          <OutageItem
            v-for="outage in listedOutages"
            :key="outage.outageId"
            :outage="outage"
            :selected="outage.outageId === selectedId"
            @select="selectFromList(outage.outageId)"
          />

          <div
            v-if="sortedOutages.length < 1"
            class="flex flex-col border rounded-lg bg-gray-800 border-gray-700 p-4"
          >
            <p class="text-gray-400">There are no results matching your search..</p>
          </div>
        </div>
      </template>
    </aside>

    <!-- Right of the panel on wider screens, riding on top of the sheet on phones -->
    <div
      v-if="hasHistory"
      ref="timelineRef"
      class="pointer-events-none absolute inset-x-2 z-[1000] bottom-[calc(var(--sheet-height)+0.5rem)] md:right-4 md:bottom-4 md:left-[calc(26rem+2rem)]"
      :style="{ '--sheet-height': `${sheetHeight}px` }"
    >
      <HistoryTimeline v-model="snapshot" />
    </div>

    <OutageMap
      ref="mapRef"
      class="absolute inset-0"
      :outages="visibleOutages"
      :selected-id="selectedId"
      :planner-group="plannerGroupFilter"
      :padding="mapPadding"
      :as-of="asOf"
      @select="selectFromMap"
    />
  </div>
</template>
