export function localDateKey(timestamp: number): string {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function nextLocalMidnight(timestamp: number): number {
  const d = new Date(timestamp);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

/** Every day key of the calendar month containing `timestamp`. */
export function monthKeys(timestamp: number): string[] {
  const d = new Date(timestamp);
  const month = d.getMonth();
  const keys: string[] = [];
  const cursor = new Date(d.getFullYear(), month, 1);
  while (cursor.getMonth() === month) {
    keys.push(localDateKey(cursor.getTime()));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

/** Every day key from 1 January of the year containing `timestamp` through that day. */
export function yearKeysToDate(timestamp: number): string[] {
  const end = new Date(timestamp);
  end.setHours(0, 0, 0, 0);
  const keys: string[] = [];
  const cursor = new Date(end.getFullYear(), 0, 1);
  while (cursor.getTime() <= end.getTime()) {
    keys.push(localDateKey(cursor.getTime()));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

export function dayKeysEndingAt(timestamp: number, days: number): string[] {
  const end = new Date(timestamp);
  end.setHours(0, 0, 0, 0);
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(end);
    day.setDate(day.getDate() - i);
    keys.push(localDateKey(day.getTime()));
  }
  return keys;
}
