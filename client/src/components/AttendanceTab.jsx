import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useAttendance, useAttendanceHistory, saveAttendance, tsToDate } from '../firebase/data'
import { itemVariants, listVariants } from '../utils/anim'
import { useForceRepaint } from '../utils/useForceRepaint'
import studentsData from '../data/students.json'
import {
  formatRuDate, todayISO, weekdayKeyOf, WEEKDAY_TITLES, DAY_LABELS,
  toISODate, fromISODate, addDays, startOfWeek,
} from '../utils/dates'

const STUDENTS = studentsData.students ?? []

/* Статусы: null = ещё не отмечен (никаких дефолтных «присутствует») */
const STATUSES = [
  { id: 'present', emoji: '✅', title: 'Присутствует' },
  { id: 'absent', emoji: '❌', title: 'Отсутствует' },
  { id: 'sick', emoji: '🤒', title: 'Болеет' },
]

const plural = (n, one, few, many) => {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

/* Чипы дней одной недели вокруг выбранной даты */
function WeekChips({ weekStart, selectedDate, markedDates, onPick }) {
  return (
    <div className="attendance-week">
      <button
        type="button"
        className="attendance-week-nav"
        aria-label="Предыдущая неделя"
        onClick={() => onPick(toISODate(addDays(weekStart, -7)))}
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </button>
      {Array.from({ length: 7 }, (_, i) => {
        const iso = toISODate(addDays(weekStart, i))
        const marked = markedDates.has(iso)
        return (
          <button
            key={iso}
            type="button"
            className={`attendance-day-chip${iso === selectedDate ? ' active' : ''}${marked ? ' marked' : ''}`}
            aria-label={`${WEEKDAY_TITLES[weekdayKeyOf(iso)]}, ${formatRuDate(iso)}${marked ? ' · отмечено' : ''}`}
            aria-pressed={iso === selectedDate}
            onClick={() => onPick(iso)}
          >
            <span className="chip-label">{DAY_LABELS[weekdayKeyOf(iso)]}</span>
            <span className="chip-num">{fromISODate(iso).getDate()}</span>
            <span className="chip-dot" aria-hidden="true" />
          </button>
        )
      })}
      <button
        type="button"
        className="attendance-week-nav"
        aria-label="Следующая неделя"
        onClick={() => onPick(toISODate(addDays(weekStart, 7)))}
      >
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </div>
  )
}

/**
 * Вкладка «Посещаемость»: присутствует / отсутствует / болеет.
 * Никаких дефолтных статусов: пока студента не отметили — статуса нет.
 * Отметки хранятся per-date в attendance/{date}, историю можно открыть позже.
 */
function AttendanceTab() {
  const { user } = useAuth()
  const [date, setDate] = useState(todayISO())
  const { recordsByName: saved, updatedAt, updatedBy, exists } = useAttendance(date)
  const history = useAttendanceHistory()
  /* Отметки и история приходят асинхронно (onSnapshot) внутри анимированной
     вкладки — на iOS форсируем перерисовку после их получения */
  useForceRepaint(history)
  useForceRepaint(exists ? saved : null)
  // Локальные правки поверх сохранённого: { имя: статус }
  const [edits, setEdits] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  /* Эффективные отметки: сохранённое в базе → локальные правки.
     Отсутствие в map = «не отмечен» */
  const records = useMemo(() => ({ ...saved, ...edits }), [saved, edits])
  const dirty = Object.keys(edits).length > 0

  const markedDates = useMemo(() => new Set(history.map((h) => h.date)), [history])
  const weekStart = useMemo(() => startOfWeek(fromISODate(date)), [date])

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, sick: 0, marked: 0 }
    for (const name of STUDENTS) {
      const st = records[name]
      if (st && c[st] !== undefined) {
        c[st] += 1
        c.marked += 1
      }
    }
    return c
  }, [records])

  const pickDate = (iso) => {
    setDate(iso)
    setEdits({})
    setError('')
  }

  const setStatus = (name, status) => {
    setEdits((prev) => {
      /* Повторное нажатие на активную кнопку снимает отметку */
      if (prev[name] === status) {
        const rest = { ...prev }
        delete rest[name]
        return rest
      }
      return { ...prev, [name]: status }
    })
  }

  /* Явная отметка всех одним статусом; повторное нажатие снимает отметки */
  const markAll = (status) => {
    setEdits((prev) => {
      const everyone = STUDENTS.every((n) => records[n] === status)
      if (everyone) return {}
      const marked = Object.fromEntries(STUDENTS.map((n) => [n, status]))
      return { ...prev, ...marked }
    })
  }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      /* Сохраняем только отмеченных: список статусов на эту дату */
      const chosen = STUDENTS
        .map((name) => ({ name, status: records[name] }))
        .filter((r) => r.status)
      await saveAttendance(date, chosen, user?.email)
      setEdits({})
    } catch (err) {
      console.error(err)
      setError(err.message || 'Не удалось сохранить. Проверьте, что правила Firestore опубликованы.')
    } finally {
      setSaving(false)
    }
  }

  const updated = updatedAt ? tsToDate(updatedAt) : null
  const notMarked = STUDENTS.length - counts.marked

  return (
    <div>
      <div className="admin-card">
        <h2>Отметить · {formatRuDate(date)}</h2>
        <p className="muted">
          {WEEKDAY_TITLES[weekdayKeyOf(date)]}
          {exists ? ' · отмечено ранее' : ' · ещё не отмечалось'}
          {updated ? ` · ${updated.toLocaleString('ru-RU')}${updatedBy ? ` · ${updatedBy}` : ''}` : ''}
        </p>

        <WeekChips
          weekStart={weekStart}
          selectedDate={date}
          markedDates={markedDates}
          onPick={pickDate}
        />

        <div className="attendance-summary">
          <span className="attendance-chip present">✅ {counts.present}</span>
          <span className="attendance-chip absent">❌ {counts.absent}</span>
          <span className="attendance-chip sick">🤒 {counts.sick}</span>
          {notMarked > 0 && (
            <span className="attendance-chip unmarked">нет статуса: {notMarked}</span>
          )}
        </div>

        <motion.ul
          className="attendance-list"
          variants={listVariants}
          initial="hidden"
          animate="show"
          key={date}
        >
          {STUDENTS.map((name) => {
            const st = records[name] ?? null
            return (
              <motion.li
                className="attendance-item"
                variants={itemVariants}
                key={name}
              >
                <span className="attendance-name">{name}</span>
                <span className="attendance-status" role="group" aria-label={`Статус: ${name}`}>
                  {STATUSES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      title={s.title}
                      aria-label={s.title}
                      aria-pressed={st === s.id}
                      className={`attendance-seg ${s.id}${st === s.id ? ' active' : ''}`}
                      onClick={() => setStatus(name, s.id)}
                    >
                      {s.emoji}
                    </button>
                  ))}
                </span>
              </motion.li>
            )
          })}
          {!STUDENTS.length && (
            <motion.li className="muted" variants={itemVariants}>
              Список пуст — добавьте студентов в <code>src/data/students.json</code>
            </motion.li>
          )}
        </motion.ul>

        {error && <p className="form-error">{error}</p>}

        <div className="day-editor-actions">
          <button type="button" className="btn btn-primary" disabled={saving || !dirty} onClick={save}>
            {saving ? 'Сохраняю…' : dirty ? 'Сохранить' : 'Сохранено'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => markAll('present')}>
            Все ✅
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => markAll('absent')}>
            Все ❌
          </button>
        </div>
      </div>

      <div className="admin-card">
        <h2>История</h2>
        <p className="muted">Нажмите на дату, чтобы открыть и изменить отметки.</p>
        <ul className="admin-list">
          {history.map((h) => {
            const c = { present: 0, absent: 0, sick: 0 }
            for (const r of h.records ?? []) {
              if (r?.status && c[r.status] !== undefined) c[r.status] += 1
            }
            const absent = c.absent + c.sick
            return (
              <li key={h.date}>
                <button
                  type="button"
                  className="attendance-history-row"
                  onClick={() => pickDate(h.date)}
                >
                  <b>{WEEKDAY_TITLES[weekdayKeyOf(h.date)]}, {formatRuDate(h.date)}</b>
                  <span className="muted">
                    {c.present} ✅ · {c.absent} ❌ · {c.sick} 🤒
                    {absent > 0 && ` · нет ${absent} ${plural(absent, 'человек', 'человека', 'человек')}`}
                  </span>
                </button>
              </li>
            )
          })}
          {!history.length && <li className="muted">Отмеченных дат пока нет</li>}
        </ul>
      </div>
    </div>
  )
}

export default AttendanceTab