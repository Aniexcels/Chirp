const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.35],
  ['month', 12],
]

const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'narrow' })

export const timeAgo = (timestamp: number): string => {
  let value = (timestamp - Date.now()) / 1000
  for (const [unit, size] of UNITS) {
    if (Math.abs(value) < size) return formatter.format(Math.round(value), unit)
    value /= size
  }
  return formatter.format(Math.round(value), 'year')
}
