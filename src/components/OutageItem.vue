<script setup lang="ts">
import { computed } from 'vue'
import type { OutageDetail } from '@/types/outage'
import { parseDate } from '@/util/parseDate'
import { getRelativeTime } from '@/util/getRelativeTime'

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
  <div class="border rounded-lg shadow-sm bg-gray-800 border-gray-700">
    <div class="p-4 pt-2 pb-3">
      <div class="flex justify-between gap-4">
        <span :class="textColor">{{ outage.outageType }}</span>
        <span class="text-gray-400 text-sm"> {{ getRelativeTime(parseDate(outage.startTime)) }}</span>
      </div>
      <h5 class="mb-2 text-2xl font-bold tracking-tight text-white">
        <span>{{ outage.location }}</span>
        <span class="text-gray-400 text-lg"> {{ plannerGroupFormatted }}</span>
      </h5>

      <p class="font-normal text-gray-400">
        {{ outage.numCustAffected.toLocaleString() }} customers affected
      </p>
      <p v-if="!repetitiveMessages.indexOf(outage.statusMessage)" class="font-normal text-gray-400">
        {{ outage.statusMessage }}
      </p>
    </div>

    <div class="p-4 py-1 rounded-lg bg-gray-700">
      <p class="font-normal text-gray-400">
        <span v-if="outage.outageType === 'Restored'">
          Restored: {{ parseDate(outage.restoreTime).toLocaleString('en-IE') }}
        </span>
        <span v-else>
          Estimated Restore: {{ parseDate(outage.estRestoreTime).toLocaleString('en-IE') }}
        </span>
      </p>
    </div>
  </div>
</template>
