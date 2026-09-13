import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import LessonCard from '../components/LessonCard.jsx'
import Announcements from '../components/Announcements.jsx'
import { announcementsEnabled } from '../config/features'
import {
  useScheduleData, useNotes, useLessonLinks, useAnnouncements, useHomework,
} from '../firebase/data'
import {
  getDaySchedule, lessonKey, computeStatuses, dayMeta, toMinutes,
} from '../utils/scheduleModel'
import {
  toISODate, fromISODate, addDays, startOfWeek,
  formatRuDate, isToday, weekdayKeyOf, DAY_LABELS,
} from '../utils/dates'

/** Длительность доводки свайпа (анимация приведения панели к краю) */
const SETTLE_MS = 280

/**
 * Панель одного дня внутри карусели. Соседние панели («вчера»/«завтра»)
 * смонтированы всегда и стоят за краями — при свайпе содержимое следующего
 * дня появляется мгновенно, включая переход на соседнюю неделю (после
 * воскресенья — понедельник следующей).
 */
function DayPane({ iso, side, template, overrides, notes, links, homework, nowMinutes, today }) {
  const day = useMemo(
    () => getDaySchedule(template, overrides, iso),
    [template, overrides, iso],
  )

  const statuses = useMemo(
    () => (iso === today ? computeStatuses(day.lessons ?? [], nowMinutes) : {}),
    [day, iso, today, nowMinutes],
  )

  return (
    <section
      className={`day-pane${side ? ` ${side}` : ' current'}`}
      aria-hidden={side ? true : undefined}
    >
      <div className="day-head">
        <h2 className="day-title">
          {day.title}
          <span className="day-date"> · {formatRuDate(iso)}</span>
          {isToday(iso) && <span className="today-chip">сегодня</span>}
          {day.isOverride && (
            <span className="override-chip" title="Расписание на эту дату изменено админом">
              изменено
            </span>
          )}
        </h2>
        <div className="day-meta">{dayMeta(day)}</div>
      </div>

      <div className="schedule">
        {day.lessons.length === 0 && (
          <article className="lesson">
            <div className="time">
              <div className="time-main">—</div>
              <div className="time-num">весь день</div>
            </div>
            <div className="card empty">Занятий нет</div>
          </article>
        )}

        {day.lessons.map((lesson) => {
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
              date={iso}
              status={status}
              progress={progress}
              notes={notes}
              links={links}
              homework={homework}
            />
          )
        })}
      </div>
    </section>
  )
}

function HomePage() {
  const { template, overrides } = useScheduleData()
  const notes = useNotes()
  const links = useLessonLinks()
  const homework = useHomework()
  const announcements = useAnnouncements()

  // Выбранная дата — основа навигации (и по дням, и по неделям)
  const [selectedDate, setSelectedDate] = useState(() => toISODate(new Date()))
  const [now, setNow] = useState(() => new Date())

  // 'idle' — свайпа нет; 'drag' — палец ведёт панели; 'settling' — доводка
  const [phase, setPhase] = useState('idle')

  const carouselRef = useRef(null)
  const trackRef = useRef(null)
  const gestureRef = useRef(null)
  const suppressClickRef = useRef(false)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000)
    return () => clearInterval(id)
  }, [])

  const today = toISODate(now)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  const changeDay = useCallback((dir) => {
    setSelectedDate((current) => toISODate(addDays(fromISODate(current), dir)))
  }, [])

  const weekStart = useMemo(() => startOfWeek(fromISODate(selectedDate)), [selectedDate])
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => toISODate(addDays(weekStart, i))),
    [weekStart],
  )

  const prevDate = useMemo(
    () => toISODate(addDays(fromISODate(selectedDate), -1)),
    [selectedDate],
  )
  const nextDate = useMemo(
    () => toISODate(addDays(fromISODate(selectedDate), 1)),
    [selectedDate],
  )

  /* ---------- Свайп дней (drag-follow) ----------
   * Позиция трека обновляется напрямую через DOM (без setState на каждый
   * кадр), поэтому жест плавный. Вертикальный скролл страницы не ломается:
   * сначала «замок направления», затем ведение панелей. */
  const onPointerDown = useCallback((e) => {
    if (phase !== 'idle' || gestureRef.current) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    suppressClickRef.current = false
    gestureRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastT: performance.now(),
      vx: 0,
      dx: 0,
      locked: false,
    }
  }, [phase])

  const onPointerMove = useCallback((e) => {
    const g = gestureRef.current
    // Важно: во время ведения phase уже 'drag', поэтому блокируем только 'settling'
    if (!g || e.pointerId !== g.pointerId || phase === 'settling') return
    const dx = e.clientX - g.startX
    const dy = e.clientY - g.startY

    if (!g.locked) {
      if (Math.abs(dx) < 8) return
      if (Math.abs(dx) <= Math.abs(dy)) {
        // Вертикальный жест — отдаём скроллу страницы
        gestureRef.current = null
        return
      }
      g.locked = true
      suppressClickRef.current = true
      setPhase('drag') // класс .dragging: курсор/запрет выделения текста
    }

    const t = performance.now()
    const dt = t - g.lastT
    if (dt > 0) g.vx = g.vx * 0.6 + ((e.clientX - g.lastX) / dt) * 0.4
    g.lastX = e.clientX
    g.lastT = t
    g.dx = dx

    const track = trackRef.current
    if (track) track.style.transform = `translate3d(${dx}px, 0, 0)`
  }, [phase])

  const finishGesture = useCallback((pointerId, allowCommit) => {
    const g = gestureRef.current
    if (!g || pointerId !== g.pointerId) return
    gestureRef.current = null
    if (!g.locked) {
      setPhase('idle')
      return
    }

    const track = trackRef.current
    if (!track) {
      setPhase('idle')
      return
    }

    const width = carouselRef.current?.clientWidth || 1
    const { dx, vx } = g
    // Доводим до соседнего дня: большой сдвиг или быстрый флинг в сторону свайпа
    const commit = allowCommit
      && (Math.abs(dx) > width * 0.22
        || (Math.abs(vx) > 0.45 && Math.sign(vx) === Math.sign(dx) && Math.abs(dx) > 20))

    setPhase('settling')
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dur = reduceMotion ? 0 : SETTLE_MS
    if (commit) {
      const dir = dx < 0 ? 1 : -1
      track.style.transition = `transform ${dur}ms cubic-bezier(0.25, 0.8, 0.35, 1)`
      track.style.transform = `translate3d(${dir * -width}px, 0, 0)`
      window.setTimeout(() => {
        changeDay(dir) // useLayoutEffect ниже мгновенно вернёт трек в 0 уже с новым днём
        setPhase('idle')
      }, dur + 10)
    } else {
      track.style.transition = `transform ${dur}ms cubic-bezier(0.25, 0.8, 0.35, 1)`
      track.style.transform = 'translate3d(0, 0, 0)'
      window.setTimeout(() => {
        track.style.transition = 'none'
        setPhase('idle')
      }, dur + 10)
    }
  }, [changeDay])

  const onPointerUp = useCallback((e) => finishGesture(e.pointerId, true), [finishGesture])
  const onPointerCancel = useCallback((e) => finishGesture(e.pointerId, false), [finishGesture])

  // Гасим клик по карточке/ссылке, если это был свайп
  const onClickCapture = useCallback((e) => {
    if (suppressClickRef.current) {
      e.preventDefault()
      e.stopPropagation()
      suppressClickRef.current = false
    }
  }, [])

  // После смены дня сбрасываем позицию трека в 0 до отрисовки (без «мигания»)
  const lastDateRef = useRef(selectedDate)
  useLayoutEffect(() => {
    if (lastDateRef.current === selectedDate) return
    lastDateRef.current = selectedDate
    const track = trackRef.current
    if (track) {
      track.style.transition = 'none'
      track.style.transform = 'translate3d(0, 0, 0)'
    }
  }, [selectedDate])

  return (
    <div className="wrap page-home">

      <nav className="day-dots" aria-label="Дни недели">
        {weekDates.map((date) => {
          const key = weekdayKeyOf(date)
          return (
            <button
              key={date}
              type="button"
              className={`day-dot${date === selectedDate ? ' active' : ''}${isToday(date) ? ' today' : ''}`}
              onClick={() => setSelectedDate(date)}
              aria-label={`${DAY_LABELS[key]}, ${formatRuDate(date)}`}
              aria-current={date === selectedDate ? 'date' : undefined}
            >
              <span className="dot-label">{DAY_LABELS[key]}</span>
              <span className="dot-num">{fromISODate(date).getDate()}</span>
            </button>
          )
        })}
      </nav>

      <main>
        <div
          className={`day-carousel${phase !== 'idle' ? ' dragging' : ''}`}
          ref={carouselRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onClickCapture={onClickCapture}
        >
          <div className="day-track" ref={trackRef}>
            <DayPane
              key={prevDate}
              iso={prevDate}
              side="prev"
              template={template}
              overrides={overrides}
              notes={notes}
              links={links}
              homework={homework}
              nowMinutes={nowMinutes}
              today={today}
            />
            <DayPane
              key={selectedDate}
              iso={selectedDate}
              template={template}
              overrides={overrides}
              notes={notes}
              links={links}
              homework={homework}
              nowMinutes={nowMinutes}
              today={today}
            />
            <DayPane
              key={nextDate}
              iso={nextDate}
              side="next"
              template={template}
              overrides={overrides}
              notes={notes}
              links={links}
              homework={homework}
              nowMinutes={nowMinutes}
              today={today}
            />
          </div>
        </div>

        {/* Объявления выключены флагом VITE_ENABLE_ANNOUNCEMENTS (config/features.js) */}
        {announcementsEnabled && <Announcements announcements={announcements} />}
      </main>

      {/* <InstallHint /> */}

      <div className="footer">
        {/* <span>
          Группа {template.group} · {String(template.course).split('·').pop()?.trim()}
        </span>
        <span className="hint-swipe">Свайп листает дни и недели</span>
        <Link className="admin-link" to="/admin">Для админа</Link> */}
      </div>
    </div>
  )
}

export default HomePage


