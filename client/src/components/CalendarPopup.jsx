import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  addDays, fromISODate, startOfWeek, toISODate, todayISO,
  formatRuDate, formatMonthYear, weekdayKeyOf, DAY_LABELS, WEEK_KEYS,
} from '../utils/dates'
import { springSoft } from '../utils/anim'

const WEEKEND = new Set(['sat', 'sun'])

/* Первое число месяца, которому принадлежит ISO-дата */
function monthStartOf(iso) {
  const d = fromISODate(iso)
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

/**
 * Содержимое окна календаря. Монтируется только когда окно открыто, поэтому
 * показываемый месяц задаётся инициализатором useState: при каждом открытии
 * это месяц выбранной даты (без setState в эффекте).
 */
function CalendarWindow({ selectedDate, onPick, onClose }) {
  const [viewMonth, setViewMonth] = useState(() => monthStartOf(selectedDate))

  // Escape закрывает окно
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Пока окно открыто — фон не прокручивается
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const days = useMemo(() => {
    const start = startOfWeek(viewMonth)
    return Array.from({ length: 42 }, (_, i) => toISODate(addDays(start, i)))
  }, [viewMonth])

  const month = viewMonth.getMonth()
  const today = todayISO()
  const shift = (n) => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1))
  const pick = (iso) => { onPick(iso); onClose() }

  return (
    <motion.div
      className="calendar"
      role="dialog"
      aria-modal="true"
      aria-label="Календарь"
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97, transition: { duration: 0.14 } }}
      transition={springSoft}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="calendar-head">
        <button
          type="button"
          className="calendar-nav-btn"
          onClick={() => shift(-1)}
          aria-label="Предыдущий месяц"
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <div className="calendar-month" aria-live="polite">{formatMonthYear(viewMonth)}</div>
        <button
          type="button"
          className="calendar-nav-btn"
          onClick={() => shift(1)}
          aria-label="Следующий месяц"
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="calendar-grid">
        {WEEK_KEYS.map((key) => (
          <span
            key={key}
            className={`calendar-weekday${WEEKEND.has(key) ? ' weekend' : ''}`}
            aria-hidden="true"
          >
            {DAY_LABELS[key]}
          </span>
        ))}

        {days.map((iso) => {
          const d = fromISODate(iso)
          const out = d.getMonth() !== month
          const selected = iso === selectedDate
          const isToday = iso === today
          return (
            <button
              key={iso}
              type="button"
              className={[
                'calendar-day',
                out ? 'out' : '',
                selected ? 'selected' : '',
                isToday ? 'today' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => pick(iso)}
              tabIndex={out ? -1 : 0}
              aria-label={`${DAY_LABELS[weekdayKeyOf(iso)]}, ${formatRuDate(iso)}`}
              aria-current={selected ? 'date' : undefined}
            >
              {d.getDate()}
            </button>
          )
        })}
      </div>

      <div className="calendar-foot">
        <button type="button" className="calendar-today-btn" onClick={() => pick(today)}>
          Сегодня
        </button>
      </div>
    </motion.div>
  )
}

/**
 * Плавно всплывающее стеклянное окно-календарь для выбора даты без
 * ручного листания. Рендерится порталом в <body>, поэтому position: fixed
 * всегда считается от вьюпорта и не ломается transform/backdrop-filter
 * у предков. Сетка идёт с понедельника (как WEEK_KEYS), всегда 6 недель —
 * высота окна не «прыгает» при листании месяцев.
 */
export default function CalendarPopup({ open, selectedDate, onPick, onClose }) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="calendar-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
        >
          <CalendarWindow selectedDate={selectedDate} onPick={onPick} onClose={onClose} />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}