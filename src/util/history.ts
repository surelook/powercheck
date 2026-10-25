import type { OutageDetail } from '@/types/outage'
import type { HistoryDay, HistoryIndex, HistoryPoint } from '@/types/history'

// Only built when history was recorded (CI, or `npm run history` locally)
const [indexUrl] = Object.values(
  import.meta.glob<string>('../../data/history/index.json', {
    query: '?url',
    import: 'default',
    eager: true,
  }),
)
const dayUrls = import.meta.glob<string>('../../data/history/days/*.json', {
  query: '?url',
  import: 'default',
  eager: true,
})

export const hasHistory = !!indexUrl

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`)
  return response.json()
}

let historyRequest: Promise<HistoryPoint[]> | null = null
const dayRequests = new Map<string, Promise<HistoryDay>>()

// Failed requests are dropped so the next attempt retries
export const loadHistory = () =>
  (historyRequest ??= fetchJson<HistoryIndex>(indexUrl)
    .then(({ snapshots }) => snapshots.map((at) => ({ at, time: Date.parse(at) })))
    .catch((error) => {
      historyRequest = null
      throw error
    }))

const loadDay = (url: string) => {
  if (!dayRequests.has(url)) {
    dayRequests.set(
      url,
      fetchJson<HistoryDay>(url).catch((error) => {
        dayRequests.delete(url)
        throw error
      }),
    )
  }
  return dayRequests.get(url)!
}

export const loadSnapshot = async (at: string): Promise<OutageDetail[]> => {
  const url = dayUrls[`../../data/history/days/${at.slice(0, 10)}.json`]
  if (!url) throw new Error(`No history for ${at}`)
  const day = await loadDay(url)
  const snapshot = day.snapshots.find((snapshot) => snapshot.at === at)
  if (!snapshot) throw new Error(`No snapshot at ${at}`)
  return snapshot.outages.map((index) => day.outages[index])
}
