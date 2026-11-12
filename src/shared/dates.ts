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
