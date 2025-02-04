export const getRelativeTime = (date: Date) => {
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)
  const diffMonths = Math.floor(diffDays / 30)

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  let formatted: string

  if (Math.abs(diffSeconds) < 5) {
    formatted = 'just now'
  } else if (Math.abs(diffSeconds) < 60) {
    formatted = rtf.format(diffSeconds, 'seconds')
  } else if (Math.abs(diffMinutes) < 60) {
    formatted = rtf.format(diffMinutes, 'minutes')
  } else {
    if (diffMs > 0) {
      if (diffHours < 48) {
        formatted = rtf.format(diffHours, 'hours')
      } else if (diffDays < 14) {
        formatted = rtf.format(diffDays, 'days')
      } else if (diffDays < 30) {
        formatted = rtf.format(diffDays, 'days')
      } else if (diffMonths < 12) {
        formatted = rtf.format(diffMonths, 'months')
      } else {
        formatted = date.toLocaleDateString('en-IE')
      }
    } else {
      if (Math.abs(diffHours) < 24) {
        formatted = rtf.format(diffHours, 'hours')
      } else if (Math.abs(diffDays) < 7) {
        formatted = rtf.format(diffDays, 'days')
      } else if (Math.abs(diffDays) < 30) {
        formatted = rtf.format(diffDays, 'days')
      } else if (Math.abs(diffMonths) < 12) {
        formatted = rtf.format(diffMonths, 'months')
      } else {
        formatted = date.toLocaleDateString('en-IE')
      }
    }
  }

  const title = date.toLocaleString('en-IE')

  return { text: formatted, title }
}
