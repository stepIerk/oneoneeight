const pad = (n) => String(n).padStart(2, '0')

/** Date -> 'YYYY-MM-DD' в ЛОКАЛЬНОЙ таймзоне (не UTC!) */
export function toISODate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** 'YYYY-MM-DD' -> Date (локальная полночь; new Date('YYYY-MM-DD') даёт UTC, поэтому вручную) */
export function fromISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(date, n) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + n)
  return copy
}

/** Понедельник недели, которой принадлежит date */
export function startOfWeek(date) {
  return addDays(date, -((date.getDay() + 6) % 7))
}

export const WEEKDAY_TO_KEY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/** Порядок дней недели (с понедельника) */
export const WEEK_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export const DAY_LABELS = {
  mon: 'Пн', tue: 'Вт', wed: 'Ср', thu: 'Чт', fri: 'Пт', sat: 'Сб', sun: 'Вс',
}

const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

/** 'YYYY-MM-DD' -> '8 сентября' */
export function formatRuDate(iso) {
  const d = fromISODate(iso)
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`
}

/** Ключ дня недели (mon..sun) для ISO-даты */
export const weekdayKeyOf = (iso) => WEEKDAY_TO_KEY[fromISODate(iso).getDay()]

export const todayISO = () => toISODate(new Date())

export const isToday = (iso) => iso === todayISO()

/** Полное название дня недели по ключу: mon -> 'Понедельник' */
export const WEEKDAY_TITLES = {
  mon: 'Понедельник', tue: 'Вторник', wed: 'Среда', thu: 'Четверг',
  fri: 'Пятница', sat: 'Суббота', sun: 'Воскресенье',
}

/**
 * '2026-09-08' (любой день недели) -> '8 – 14 сентября'
 * (границы месяца/года учитываются: '29 сентября – 5 октября')
 */
export function formatWeekRange(weekStartDate) {
  const end = addDays(weekStartDate, 6)
  const a = weekStartDate
  const b = end
  if (a.getMonth() === b.getMonth()) {
    return `${a.getDate()} – ${b.getDate()} ${MONTHS_GEN[b.getMonth()]}`
  }
  if (a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()} ${MONTHS_GEN[a.getMonth()]} – ${b.getDate()} ${MONTHS_GEN[b.getMonth()]}`
  }
  return `${a.getDate()} ${MONTHS_GEN[a.getMonth()]} ${a.getFullYear()} – ${b.getDate()} ${MONTHS_GEN[b.getMonth()]} ${b.getFullYear()}`
}
