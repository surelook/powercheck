<script setup lang="ts">
defineProps<{
  label: string
}>()
</script>

<template>
  <div class="text-white">
    <p class="text-gray-400">{{ label }}</p>
    <p class="text-2xl" v-if="$slots.value">
      <slot name="value"></slot>
    </p>
    <p class="text-gray-400" v-if="$slots.secondaryValue">
      <slot name="secondaryValue"></slot>
    </p>
  </div>
</template>
