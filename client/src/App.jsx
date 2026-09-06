import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import schedule from './data/schedule.json'
import LessonCard from './components/LessonCard.jsx'
import InstallHint from './components/InstallHint.jsx'
import floorPlanPdf from './assets/Планы этажей.pdf'

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const WEEKDAY_TO_KEY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const lessonKey = (l) => `${l.start}-${l.end}-${l.subject ?? l.empty ?? ''}`

function toMinutes(hhmm) {
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

function dayMeta(day) {
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
function computeStatuses(lessons, nowMinutes) {
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

function App() {
  const [now, setNow] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState(() =>
    WEEKDAY_TO_KEY[new Date().getDay()],
  )
  const touchStart = useRef(null)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000)
    return () => clearInterval(id)
  }, [])

  const todayKey = WEEKDAY_TO_KEY[now.getDay()]
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  const dayKeys = useMemo(() => DAY_ORDER.filter((key) => schedule.days[key]), [])

  const changeDay = useCallback(
    (dir) => {
      setSelectedDay((current) => {
        const idx = dayKeys.indexOf(current)
        const next = Math.min(dayKeys.length - 1, Math.max(0, idx + dir))
        return dayKeys[next]
      })
    },
    [dayKeys],
  )

  const onTouchStart = (e) => {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }

  const onTouchEnd = (e) => {
    if (!touchStart.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - touchStart.current.x
    const dy = t.clientY - touchStart.current.y
    touchStart.current = null
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      changeDay(dx < 0 ? 1 : -1)
    }
  }


  const currentDay = schedule.days[selectedDay]
  const statuses = useMemo(
    () =>
      selectedDay === todayKey
        ? computeStatuses(currentDay.lessons ?? [], nowMinutes)
        : {},
    [currentDay, selectedDay, todayKey, nowMinutes],
  )


  return (
    <div className="wrap">
      <header className="hero">
        <div className="eyebrow">
          <span className="dot" /> {schedule.course}
        </div>
        <h1>{schedule.title}</h1>
      </header>

      <div className="actions">
        <a
          className="action-btn"
          href={floorPlanPdf}
          target="_blank"
          rel="noreferrer"
        >
          <span className="action-icon" aria-hidden="true">🗺️</span>
          Схема этажей
          <span className="action-arrow" aria-hidden="true">↗</span>
        </a>
      </div>

      <nav className="tabs" aria-label="Дни недели">
        {dayKeys.map((key) => (
          <button
            key={key}
            type="button"
            className={`tab${key === selectedDay ? ' active' : ''}`}
            onClick={() => setSelectedDay(key)}
          >
            <span className="short">
              {schedule.days[key].label}
              {key === todayKey && <span className="today-dot" title="сегодня" />}
            </span>
            {/* <span className="full">{schedule.days[key].title.toLowerCase()}</span> */}
          </button>
        ))}
      </nav>

      <main onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <section className="day">
          <div className="day-head">
            <h2 className="day-title">
              {currentDay.title}
              {selectedDay === todayKey && (
                <span className="today-chip">сегодня</span>
              )}
            </h2>
            <div className="day-meta">{dayMeta(currentDay)}</div>
          </div>

          <div className="schedule">
            {currentDay.lessons.length === 0 && (
              <article className="lesson">
                <div className="time">
                  <div className="time-main">—</div>
                  <div className="time-num">весь день</div>
                </div>
                <div className="card empty">Занятий нет</div>
              </article>
            )}

            {currentDay.lessons.map((lesson) => {
              const status = statuses[lessonKey(lesson)]
              let progress
              if (status === 'now') {
                const start = toMinutes(lesson.start)
                const end = toMinutes(lesson.end)
                progress = (nowMinutes - start) / (end - start)
              }
              return (
                <LessonCard
                  key={lessonKey(lesson)}
                  lesson={lesson}
                  status={status}
                  progress={progress}
                />
              )
            })}
          </div>
        </section>
      </main>

      <InstallHint />

      <div className="footer">
        <span>
          Группа {schedule.group} · {schedule.course.split('·').pop()?.trim()}
        </span>
        <span className="hint-swipe">Свайпните, чтобы сменить день</span>
      </div>
    </div>
  )
}

export default App
