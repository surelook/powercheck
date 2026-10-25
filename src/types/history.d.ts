// Formats written by scripts/recordHistory.js
import type { OutageDetail } from './outage'

export type HistoryDay = {
  outages: OutageDetail[]
  snapshots: { at: string; outages: number[] }[]
}

export type HistoryIndex = {
  snapshots: string[]
}

export type HistoryPoint = {
  at: string
  time: number
}

export type HistorySnapshot = {
  at: Date
  outages: OutageDetail[]
}
