<template>
  <span :title="relativeTime.title">{{ relativeTime.text }}</span>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { getRelativeTime } from '@/util/getRelativeTime'

const props = defineProps<{ date: Date }>()

const relativeTime = ref(getRelativeTime(props.date))

let intervalId: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  intervalId = setInterval(() => {
    relativeTime.value = getRelativeTime(props.date)
  }, 60 * 1000) // Update every 60 seconds
})

onBeforeUnmount(() => {
  if (intervalId) clearInterval(intervalId)
})
</script>
