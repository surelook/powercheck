export const parseDate = (dateStr: string) => {
  const match = dateStr?.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/)
  if (!match) return new Date(NaN) // Return invalid date if format is wrong

  const [, day, month, year, hours, minutes] = match.map(Number)
  return new Date(year, month - 1, day, hours, minutes) // JS months are 0-based
}
