export const getRelativeTime = (date: Date): string => {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)
  const diffMonths = Math.floor(diffDays / 30)

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

  if (diffSeconds < 60) return rtf.format(-diffSeconds, 'seconds')
  if (diffMinutes < 60) return rtf.format(-diffMinutes, 'minutes')
  if (diffHours < 24) return rtf.format(-diffHours, 'hours')
  if (diffDays < 7) return rtf.format(-diffDays, 'days')
  if (diffDays < 30) return `${diffDays} days ago`
  if (diffMonths < 12) return `${diffMonths} months ago`

  return date.toLocaleDateString('en-IE') // Fallback to full date
}
