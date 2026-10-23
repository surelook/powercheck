<script setup lang="ts">
defineProps<{
  label: string
}>()
</script>

<template>
  <div class="min-w-0 text-white">
    <p class="text-xs text-gray-400">{{ label }}</p>
    <p class="text-xl break-words" v-if="$slots.value">
      <slot name="value"></slot>
    </p>
    <p class="truncate text-xs text-gray-400" v-if="$slots.secondaryValue">
      <slot name="secondaryValue"></slot>
    </p>
  </div>
</template>
