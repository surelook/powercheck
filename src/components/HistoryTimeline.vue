<script setup lang="ts">
import { ClockIcon, PauseIcon, PlayIcon, XMarkIcon } from '@heroicons/vue/24/solid'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { loadHistory, loadSnapshot } from '@/util/history'
import type { HistoryPoint, HistorySnapshot } from '@/types/history'

// Null while showing the latest data, which is already baked into the build
const snapshot = defineModel<HistorySnapshot | null>({ required: true })

const DAYS = 7
const HOUR_MS = 60 * 60 * 1000
const FRAME_MS = 400

const points = ref<HistoryPoint[]>([])
const selected = ref(0)
const hovered = ref<number | null>(null)
const playing = ref(false)
// Phones fold the timeline into a button; wider screens always show it
const open = ref(false)
// Clipped while it grows out of the button, then freed so the time label can sit above it
const revealed = ref(false)
const track = ref<HTMLElement>()
let dragging = false

const last = computed(() => points.value.length - 1)
const isLatest = computed(() => selected.value === last.value)
const selectedTime = computed(() => points.value[selected.value].time)

// Built from date parts so days stay calendar days across clock changes
const midnight = (time: number, addDays = 0) => {
  const date = new Date(time)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + addDays).getTime()
}

// Whole days, so each gets an even share of the track; the rest of today is left empty
const end = computed(() => midnight(points.value[last.value].time, 1))
const start = computed(() => Math.max(midnight(points.value[0].time), midnight(end.value, -DAYS)))
const first = computed(() => points.value.findIndex((point) => point.time >= start.value))

const x = (time: number) => ((time - start.value) / (end.value - start.value)) * 100

const dayName = (time: number) =>
  midnight(time) === midnight(Date.now())
    ? 'Today'
    : new Date(time).toLocaleDateString('en-IE', { weekday: 'short' })

const describe = (index: number) => {
  if (index === last.value) return 'Now'
  const time = points.value[index].time
  const clock = new Date(time).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })
  return `${dayName(time)} ${clock}`
}

const days = computed(() => {
  const result: { x: number; centre: number; name: string }[] = []
  for (let day = start.value; day < end.value; day = midnight(day, 1)) {
    result.push({ x: x(day), centre: x((day + midnight(day, 1)) / 2), name: dayName(day) })
  }
  return result
})

const recorded = computed(() => {
  const from = x(points.value[first.value].time)
  return { left: `${from}%`, width: `${x(points.value[last.value].time) - from}%` }
})

// Shown while pointing at the track, and while looking back
const label = computed(() => {
  const index = hovered.value ?? (isLatest.value ? null : selected.value)
  if (index === null) return null
  const left = x(points.value[index].time)
  return { left: `clamp(2.5rem, ${left}%, calc(100% - 2.5rem))`, text: describe(index) }
})

const nearest = (time: number) => {
  let best = first.value
  for (let index = best + 1; index <= last.value; index++) {
    if (Math.abs(points.value[index].time - time) < Math.abs(points.value[best].time - time)) {
      best = index
    }
  }
  return best
}

const select = async (index: number) => {
  index = Math.min(last.value, Math.max(first.value, index))
  if (index === selected.value) return
  selected.value = index
  if (index === last.value) {
    snapshot.value = null
    return
  }
  const point = points.value[index]
  try {
    const outages = await loadSnapshot(point.at)
    // Dragging or playback can move on before the day's file arrives
    if (selected.value === index) snapshot.value = { at: new Date(point.time), outages }
  } catch {
    // The view stays on the last snapshot that loaded
  }
}

// Anything the viewer does takes over from playback
const jump = (index: number) => {
  playing.value = false
  return select(index)
}

const play = async () => {
  if (playing.value) {
    playing.value = false
    return
  }
  playing.value = true
  // Nothing lies ahead of the latest data, so replay the last day
  if (isLatest.value) await select(nearest(selectedTime.value - 24 * HOUR_MS))
  while (playing.value && !isLatest.value) {
    await new Promise((resolve) => setTimeout(resolve, FRAME_MS))
    if (!playing.value) break
    // An hour per frame keeps the pace even however often snapshots were taken
    const next = points.value.findIndex((point) => point.time >= selectedTime.value + HOUR_MS)
    await select(next === -1 ? last.value : next)
  }
  playing.value = false
}

const indexAt = (event: PointerEvent) => {
  const box = track.value!.getBoundingClientRect()
  const fraction = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width))
  return nearest(start.value + fraction * (end.value - start.value))
}

const onPointerDown = (event: PointerEvent) => {
  dragging = true
  track.value!.setPointerCapture(event.pointerId)
  jump(indexAt(event))
}

const onPointerMove = (event: PointerEvent) => {
  // Touch has no hover, so only a drag shows the time
  if (event.pointerType === 'mouse' || dragging) hovered.value = indexAt(event)
  if (dragging) jump(hovered.value!)
}

const onPointerUp = (event: PointerEvent) => {
  dragging = false
  if (event.pointerType !== 'mouse') hovered.value = null
}

const onKeydown = (event: KeyboardEvent) => {
  const targets: Record<string, number> = {
    ArrowLeft: selected.value - 1,
    ArrowDown: selected.value - 1,
    ArrowRight: selected.value + 1,
    ArrowUp: selected.value + 1,
    Home: first.value,
    End: last.value,
  }
  if (!(event.key in targets)) return
  event.preventDefault()
  jump(targets[event.key])
}

const toggle = () => {
  open.value = !open.value
  revealed.value = false
  if (!open.value) jump(last.value)
}

const onTransitionEnd = (event: TransitionEvent) => {
  if (event.propertyName === 'width' && open.value) revealed.value = true
}

onMounted(async () => {
  try {
    points.value = await loadHistory()
    selected.value = last.value
  } catch {
    // Without history the timeline stays hidden
  }
})

onBeforeUnmount(() => (playing.value = false))
</script>

<template>
  <!-- Grows leftwards out of the button, with its contents already laid out at full width and
       uncovered as it goes, so the button stays put and nothing reflows -->
  <div
    v-if="points.length"
    class="pointer-events-auto ml-auto flex h-11 justify-end rounded-full border border-gray-700/60 bg-gray-900/85 text-gray-400 shadow-lg backdrop-blur-md transition-[width] duration-300 ease-out md:mx-auto md:h-auto md:w-full md:max-w-2xl md:overflow-visible md:shadow-none"
    :class="[open ? 'w-full' : 'w-11', !revealed && 'overflow-hidden']"
    @transitionend="onTransitionEnd"
  >
    <div
      class="flex shrink-0 items-center gap-1 p-1 max-md:w-[calc(100vw-1rem-2px)] md:w-full md:pr-2"
    >
      <div
        class="flex min-w-0 flex-1 items-center gap-1 transition-[opacity,visibility] duration-300"
        :class="!open && 'max-md:invisible max-md:opacity-0'"
      >
        <button
          @click="play"
          :disabled="last <= first"
          :aria-label="playing ? 'Pause' : 'Play'"
          :title="playing ? 'Pause' : 'Play'"
          class="shrink-0 cursor-pointer rounded-full p-1.5 hover:bg-gray-700 hover:text-white disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-400"
        >
          <PauseIcon v-if="playing" class="w-4" />
          <PlayIcon v-else class="w-4" />
        </button>

        <div class="min-w-0 flex-1 px-2">
          <div
            ref="track"
            role="slider"
            tabindex="0"
            aria-label="Look back in time"
            :aria-valuemin="first"
            :aria-valuemax="last"
            :aria-valuenow="selected"
            :aria-valuetext="describe(selected)"
            class="relative h-5 cursor-pointer touch-none rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
            @pointerleave="hovered = dragging ? hovered : null"
            @keydown="onKeydown"
          >
            <div
              class="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-gray-700"
            ></div>
            <div
              class="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-gray-500"
              :style="recorded"
            ></div>
            <div
              v-for="day in days.slice(1)"
              :key="day.x"
              class="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-gray-600"
              :style="{ left: `${day.x}%` }"
            ></div>
            <span
              v-if="label"
              class="pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 rounded-md border border-gray-700 bg-gray-900/90 px-1.5 py-0.5 text-[11px] whitespace-nowrap text-white tabular-nums"
              :style="{ left: label.left }"
            >
              {{ label.text }}
            </span>
            <div
              class="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-gray-900 bg-white"
              :style="{ left: `${x(selectedTime)}%` }"
            ></div>
          </div>

          <div class="relative h-3.5 text-[10px] leading-3.5" aria-hidden="true">
            <span
              v-for="day in days"
              :key="day.x"
              class="absolute -translate-x-1/2"
              :class="{ 'text-gray-200': day.x === x(midnight(selectedTime)) }"
              :style="{ left: `${day.centre}%` }"
            >
              {{ day.name }}
            </span>
          </div>
        </div>

        <!-- Always there, so the track doesn't shift when it becomes clickable -->
        <button
          @click="jump(last)"
          :disabled="isLatest"
          class="shrink-0 cursor-pointer rounded-full px-2 py-1 text-xs font-medium text-white hover:bg-gray-700 disabled:cursor-default disabled:font-normal disabled:text-gray-500 disabled:hover:bg-transparent"
        >
          Now
        </button>
      </div>

      <button
        @click="toggle"
        :aria-expanded="open"
        :aria-label="open ? 'Close and show now' : 'Look back in time'"
        class="flex size-8.5 shrink-0 cursor-pointer items-center justify-center rounded-full text-white hover:bg-gray-700 md:hidden"
      >
        <XMarkIcon v-if="open" class="w-5" />
        <ClockIcon v-else class="w-5" />
      </button>
    </div>
  </div>
</template>
