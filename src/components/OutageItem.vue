<script setup lang="ts">
import { computed } from 'vue'
import type { OutageDetail } from '@/types/outage'
import { parseDate } from '@/util/parseDate'
import RelativeDate from './RelativeDate.vue'

const repetitiveMessages = [
  'We are aware of the outage and are working to restore power as quickly as possible.',
  'We are currently assessing the outage and will provide an update as soon as possible.',
  'We are currently experiencing an outage and are working to restore power as quickly as possible.',
]

const plannerGroupFormatted = computed(() => {
  return props.outage.plannerGroup
    ?.split(',')
    .map(group => group.trim())
    .join(' | ')
})

const textColor = computed(() => {
  switch(props.outage.outageType) {
    case 'Fault':
      return 'text-red-500'
    case 'Planned':
      return 'text-yellow-500'
    case 'Restored':
      return 'text-green-500'
    default:
      return 'text-gray-400'
  }
})

const props = defineProps<{
  outage: OutageDetail
}>()
</script>

<template>
  <div class="flex flex-col border rounded-lg bg-gray-800 border-gray-700">
    <div class="p-4 pt-2 pb-3 flex-grow">
      <div class="flex justify-between gap-4">
        <span class="text-sm" :class="textColor">{{ outage.outageType }}</span>
        <span class="text-gray-400 text-sm"><RelativeDate :date="parseDate(outage.startTime)" /></span>
      </div>
      <h5 class="my-3 mt-1 text-2xl font-bold text-white">
        <span>{{ outage.location }}</span>
      </h5>

      <div class="my-1">
        <dl class="flex flex-wrap gap-8">
          <div>
            <dt class="text-xs text-gray-400">Customers Affected</dt>
            <dd class="text-white">{{ outage.numCustAffected.toLocaleString() }}</dd>
          </div>
          <div>
            <dt class="text-xs text-gray-400">Planner Group</dt>
            <dd class="text-white">{{ plannerGroupFormatted }}</dd>
          </div>
        </dl>
      </div>
      <p v-if="!repetitiveMessages.indexOf(outage.statusMessage)" class="text-sm text-gray-400">
        {{ outage.statusMessage }}
      </p>
    </div>

    <div class="p-4 py-1 rounded-lg bg-gray-700">
      <p class="font-normal text-gray-400">
        <span v-if="outage.outageType === 'Restored'">
          Restored <RelativeDate :date="parseDate(outage.restoreTime)" />
        </span>
        <span v-else>
          Estimated restore <RelativeDate :date="parseDate(outage.estRestoreTime)" />
        </span>
      </p>
    </div>
  </div>
</template>
