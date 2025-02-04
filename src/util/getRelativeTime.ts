export const getRelativeTime = (date: Date): string => {
  const now = new Date()
  // Calculate the difference in milliseconds.
  // A positive diff means the date is in the future, and a negative diff means it’s in the past.
  const diffMs = date.getTime() - now.getTime()

  // Compute the differences in various units.
  // Note that these values may be negative, which is fine: the Intl.RelativeTimeFormat
  // will format them as “in X” for positive values (future) and “X ago” for negative ones (past).
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)
  const diffMonths = Math.floor(diffDays / 30)

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

  // If the difference is very small (less than 5 seconds), display “just now”
  if (Math.abs(diffSeconds) < 5) return 'just now'
  if (Math.abs(diffSeconds) < 60) return rtf.format(diffSeconds, 'seconds')
  if (Math.abs(diffMinutes) < 60) return rtf.format(diffMinutes, 'minutes')
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, 'hours')
  if (Math.abs(diffDays) < 30) return rtf.format(diffDays, 'days')
  if (Math.abs(diffMonths) < 12) return rtf.format(diffMonths, 'months')

  // For differences longer than a year, fallback to a full date.
  return date.toLocaleDateString('en-IE')
}
