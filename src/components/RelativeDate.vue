<template>
  <span :title="relativeTime.title">{{ relativeTime.text }}</span>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { getFriendlyTime } from '@/util/getFriendlyTime.ts'

const props = defineProps<{ date: Date }>()

const relativeTime = ref(getFriendlyTime(props.date))

let intervalId: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  intervalId = setInterval(() => {
    relativeTime.value = getFriendlyTime(props.date)
  }, 60 * 1000) // Update every 60 seconds
})

onBeforeUnmount(() => {
  if (intervalId) clearInterval(intervalId)
})
</script>
