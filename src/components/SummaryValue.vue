<script setup lang="ts">
defineProps<{
  label: string
  value: string | number
  secondaryValue?: string | number
}>()
</script>

<template>
  <div class="text-white">
    <p class="text-gray-400">{{ label }}</p>
    <p class="text-2xl">{{ value }}</p>
    <p v-if="secondaryValue" class="text-gray-400">{{ secondaryValue }}</p>
  </div>
</template>
