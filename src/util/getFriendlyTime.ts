export const getFriendlyTime = (date: Date) => {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);

  // Create Date objects stripped to the day to compare calendar days
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const givenDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // Difference in whole days (can be negative if in the past)
  const dayDiff = Math.round((givenDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  // Get a consistent time string (e.g. "19:00")
  const timeString = date.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' });

  let formatted: string;

  // For very recent events
  if (Math.abs(diffSeconds) < 5) {
    formatted = 'just now';
  }
  // For events occurring later today or earlier today
  else if (dayDiff === 0) {
    formatted = `Today at ${timeString}`;
  }
  // For events that occurred yesterday
  else if (dayDiff === -1) {
    formatted = `Yesterday at ${timeString}`;
  }
  // For events occurring tomorrow
  else if (dayDiff === 1) {
    formatted = `Tomorrow at ${timeString}`;
  }
  // For events within the next or last week
  else if (Math.abs(dayDiff) < 7) {
    // Use weekday (e.g. "Wednesday") and always include the time
    const weekday = date.toLocaleDateString('en-IE', { weekday: 'long' });
    formatted = `${weekday} at ${timeString}`;
  }
  // For events further away, show an absolute date (with or without the year)
  else {
    // Always include day and month
    const options: Intl.DateTimeFormatOptions = {
      day: 'numeric',
      month: 'short'
    };

    // Only include the year if the event is not in the current year
    if (date.getFullYear() !== now.getFullYear()) {
      options.year = 'numeric';
    }

    const dateString = date.toLocaleDateString('en-IE', options);
    formatted = `${dateString} at ${timeString}`;
  }

  // Use the full date and time as a tooltip
  const title = date.toLocaleString('en-IE');

  return { text: formatted, title };
};
