import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpenCheck } from 'lucide-react'
import { motion } from 'motion/react'
import { listVariants, itemVariants } from '../utils/anim'
import { useScheduleData, useHomework } from '../firebase/data'
import { getDaySchedule, lessonKey as makeLessonKey } from '../utils/scheduleModel'
import {
  addDays, toISODate, todayISO, weekdayKeyOf,
  DAY_LABELS, WEEKDAY_TITLES, formatRuDate,
} from '../utils/dates'

/* Ключ localStorage с отметками выполнения: { [homeworkId]: true }.
   Отметки локальные (без сервера) — у каждого устройства свои */
const STORAGE_KEY = 'homework-done'

function loadDone() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch { /* localStorage недоступен или битый JSON */ }
  return {}
}

/* Строка одного задания: клик по всей строке переключает «выполнено».
   Класс task-text переиспользован со страницы урока (lesson-page.css) */
function HwTask({ item, done, onToggle }) {
  return (
    <button
      type="button"
      className={`hw-task${done ? ' done' : ''}`}
      onClick={() => onToggle(item.id)}
      aria-pressed={done}
      title={done ? 'Снять отметку' : 'Отметить выполненным'}
    >
      <span className="hw-task-check" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      <span className="task-text">{item.text}</span>
      {/* {done && <span className="hw-task-badge">выполнено</span>} */}
    </button>
  )
}

/* Блок дня: день недели + дата, ниже — задания по парам.
   Пары без ДЗ не показываем вовсе */
function HwDay({ iso, lessons, doneMap, onToggle }) {
  const dayKey = weekdayKeyOf(iso)
  return (
    <motion.section className={`hw-day${iso === todayISO() ? ' today' : ''}`} variants={itemVariants}>
      <header className="hw-day-head">
        <span className="hw-day-label" aria-hidden="true">{DAY_LABELS[dayKey]}</span>
        <h2 className="hw-day-title">
          {WEEKDAY_TITLES[dayKey]}
        </h2>
        <h2 className="hw-day-date">{formatRuDate(iso)}</h2>

        {iso === todayISO() && <span className="hw-day-today">сегодня</span>}
      </header>

      {lessons.map(({ lesson, hw }) => (
        <div key={makeLessonKey(lesson)} className="hw-lesson">
          <Link
            className="hw-lesson-head"
            to={`/lesson/${iso}/${encodeURIComponent(makeLessonKey(lesson))}`}
          >
            <span className="hw-lesson-subject">{lesson.subject}</span>
            <span className="hw-lesson-time">{lesson.start}–{lesson.end}</span>
            
          </Link>
          <div className="hw-task-list">
            {hw.map((item) => (
              <HwTask key={item.id} item={item} done={Boolean(doneMap[item.id])} onToggle={onToggle} />
            ))}
          </div>
        </div>
      ))}
    </motion.section>
  )
}

/**
 * Вкладка «Дз»: все домашние задания на 7 дней вперёд (включая сегодня).
 * Задания берутся из Firebase (коллекция homework, привязаны к дате и паре),
 * отметки «выполнено» — локально в localStorage, без сервера.
 */
function HomeworkPage() {
  const { template, overrides } = useScheduleData()
  const homework = useHomework()

  const [doneMap, setDoneMap] = useState(loadDone)

  /* Отметки заданий, которых больше нет в Firebase (удалены админом),
     отфильтровываем во время рендера — состояние не мутируем эффектом */
  const knownIds = useMemo(() => new Set(homework.map((h) => h.id)), [homework])
  const activeDone = useMemo(() => {
    const filtered = {}
    let stale = false
    for (const [id, val] of Object.entries(doneMap)) {
      if (knownIds.has(id)) filtered[id] = val
      else stale = true
    }
    if (stale) {
      /* Заодно чистим localStorage, чтобы отметки удалённых заданий не копились */
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
      } catch { /* приватный режим */ }
    }
    return filtered
  }, [doneMap, knownIds])

  /* Группируем: 7 дней от сегодняшнего, для каждого — пары с ДЗ */
  const days = useMemo(() => {
    const base = new Date()
    return Array.from({ length: 7 }, (_, i) => toISODate(addDays(base, i))).map((iso) => {
      const day = getDaySchedule(template, overrides, iso)
      const lessons = (day.lessons ?? [])
        .filter((l) => !l.empty)
        .map((lesson) => ({
          lesson,
          hw: homework.filter((h) => h.date === iso && h.lessonKey === makeLessonKey(lesson)),
        }))
        .filter(({ hw }) => hw.length > 0)
      return { iso, lessons }
    })
  }, [template, overrides, homework])

  const withHw = days.filter((d) => d.lessons.length > 0)
  const total = withHw.reduce((acc, d) => acc + d.lessons.reduce((s, l) => s + l.hw.length, 0), 0)
  const doneCount = withHw.reduce(
    (acc, d) => acc + d.lessons.reduce((s, l) => s + l.hw.filter((h) => activeDone[h.id]).length, 0),
    0,
  )

  const toggle = (id) => {
    setDoneMap((prev) => {
      const next = { ...prev }
      if (next[id]) delete next[id]
      else next[id] = true
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch { /* приватный режим */ }
      return next
    })
  }

  return (
    <motion.div className="wrap page-homework" variants={listVariants} initial="hidden" animate="show">
      <header className="page-head">
        <span className="page-head-icon" aria-hidden="true">
          <BookOpenCheck />
        </span>
        <div className="page-head-text">
          <h1>Дз</h1>
          <p>
            {total === 0
              ? 'Заданий на неделю нет'
              : `Выполнено ${doneCount} из ${total}${doneCount === total ? ' · всё сделано 🎉' : ' · на 7 дней'}`}
          </p>
        </div>
      </header>

      {withHw.length === 0 ? (
        <motion.section className="hw-day" variants={itemVariants}>
          <p className="hw-empty">Домашних заданий на ближайшую неделю нет — можно выдохнуть.</p>
        </motion.section>
      ) : (
        withHw.map((day) => (
          <HwDay
            key={day.iso}
            iso={day.iso}
            lessons={day.lessons}
            doneMap={activeDone}
            onToggle={toggle}
          />
        ))
      )}
    </motion.div>
  )
}

export default HomeworkPage