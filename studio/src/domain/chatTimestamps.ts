/** Presentation-only timestamps; stored message timestamps are never rewritten. */
export const CHAT_TIME_GAP_MS = 60 * 60 * 1000;

type TimedMessage = {
  id: string;
  role: 'user' | 'assistant';
  timestamp: number;
  execution?: { finishedAt?: number };
};

const validTime = (value: number | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 && Number.isFinite(new Date(value).getTime());

// Compare local calendar days, not elapsed 24-hour periods (including DST days).
function calendarDay(date: Date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
}

export function chatTimestampIds(messages: TimedMessage[]) {
  const ids = new Set<string>();
  let previousTime: number | undefined;
  let previousUserTime: number | undefined;
  for (const message of messages) {
    if (message.role === 'user' && validTime(message.timestamp)) {
      if (!validTime(previousUserTime) || !validTime(previousTime)
        || calendarDay(new Date(message.timestamp)) !== calendarDay(new Date(previousUserTime))
        || message.timestamp - previousTime > CHAT_TIME_GAP_MS) ids.add(message.id);
      previousUserTime = message.timestamp;
    }
    const time = message.role === 'assistant' && validTime(message.execution?.finishedAt)
      ? message.execution.finishedAt : message.timestamp;
    // An unknown boundary should not silently merge two groups.
    previousTime = validTime(time) ? time : undefined;
  }
  return ids;
}

export function formatChatTimestamp(timestamp: number, now: number, locale: string) {
  if (!validTime(timestamp) || !validTime(now)) return '';
  const date = new Date(timestamp);
  const today = new Date(now);
  const days = calendarDay(today) - calendarDay(date);
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
  if (days === 0) return time;
  const options: Intl.DateTimeFormatOptions = days > 0 && days <= 7
    ? { weekday: 'long' }
    : date.getFullYear() === today.getFullYear()
      ? { month: 'short', day: 'numeric', weekday: 'short' }
      : { year: 'numeric', month: 'short', day: 'numeric' };
  return `${new Intl.DateTimeFormat(locale, options).format(date)} ${time}`;
}
