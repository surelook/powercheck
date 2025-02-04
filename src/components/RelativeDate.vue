<template>
  <span :title="relativeTime.title">{{ relativeTime.text }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getRelativeTime } from '@/util/getRelativeTime'

const props = defineProps<{
  date: Date
}>()

const relativeTime = computed(() => getRelativeTime(props.date))
</script>
