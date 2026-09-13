import { weekdayKeyOf, WEEKDAY_TITLES } from './dates'

export const emptyDay = () => ({ label: '', title: '', lessons: [] })

/** Заготовка новой пары для редактора */
export const makeLesson = (index) => ({
  start: '',
  end: '',
  pair: `${index + 1} пара`,
  kind: 'other',
  type: '',
  subject: '',
  teacher: '',
  room: '',
  note: '',
})

/**
 * Расписание на конкретную дату:
 * берём шаблон по дню недели и накладываем оверрайд (если есть) на эту дату.
 * Оверрайд полностью заменяет список пар на этот день.
 */
export function getDaySchedule(template, overrides, isoDate) {
  const key = weekdayKeyOf(isoDate)
  const base = template?.days?.[key] ?? emptyDay()
  const override = overrides?.[isoDate]
  if (override && Array.isArray(override.lessons)) {
    return {
      ...base,
      title: base.title || WEEKDAY_TITLES[key] || '',
      lessons: override.lessons,
      isOverride: true,
      overrideUpdatedAt: override.updatedAt,
    }
  }
  return {
    ...base,
    title: base.title || WEEKDAY_TITLES[key] || '',
    lessons: Array.isArray(base.lessons) ? base.lessons : [],
    isOverride: false,
  }
}

/** Уникальные предметы из шаблона (для селекта «предмет» в админке) */
export function collectSubjects(template) {
  const set = new Set()
  for (const day of Object.values(template?.days ?? {})) {
    for (const lesson of day.lessons ?? []) {
      if (lesson.subject) set.add(lesson.subject)
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'ru'))
}

export const lessonKey = (l) => `${l.start}-${l.end}-${l.subject ?? l.empty ?? ''}`

/* ---------------- Отображение статусов пар «сегодня» ---------------- */

export function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function plural(n, one, few, many) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

export function dayMeta(day) {
  const lessons = day.lessons ?? []
  const real = lessons.filter((l) => !l.empty)
  if (real.length === 0) return 'Выходной · занятий нет'
  const windows = lessons.length - real.length
  const base = `${real.length} ${plural(real.length, 'пара', 'пары', 'пар')}`
  return windows
    ? `${base} · ${windows} ${plural(windows, 'окно', 'окна', 'окон')}`
    : base
}

/**
 * Возвращает map: ключ занятия -> статус ('now' | 'next' | 'past').
 * Статусы считаются только для сегодняшнего дня.
 */
export function computeStatuses(lessons, nowMinutes) {
  const map = {}
  let nextAssigned = false
  for (const lesson of lessons) {
    if (lesson.empty) continue
    const start = toMinutes(lesson.start)
    const end = toMinutes(lesson.end)
    if (nowMinutes >= start && nowMinutes < end) {
      map[lessonKey(lesson)] = 'now'
    } else if (nowMinutes >= end) {
      map[lessonKey(lesson)] = 'past'
    } else if (!nextAssigned && nowMinutes < start) {
      map[lessonKey(lesson)] = 'next'
      nextAssigned = true
    }
  }
  return map
}

