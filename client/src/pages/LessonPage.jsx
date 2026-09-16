import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowLeft, Clock, MapPin, Plus, Trash2, User, X,
} from 'lucide-react'
import {
  useLessonHomework, useLessonLinksFor, useLessonNotes, useScheduleData, useSubjectLinks,
  addHomework, deleteHomework,
} from '../firebase/data'
import { useAuth } from '../context/AuthContext'
import { getDaySchedule, lessonKey as makeLessonKey } from '../utils/scheduleModel'
import { useForceRepaint } from '../utils/useForceRepaint'
import { fadeUp, itemVariants, listVariants } from '../utils/anim'
import { fromISODate, formatRuDate, WEEKDAY_TITLES, weekdayKeyOf } from '../utils/dates'
import { dayLink } from '../utils/dayParam'
import { LessonNotes, LessonLinks } from '../components/LessonMaterials.jsx'
import floorPlanPdf from '../assets/Планы этажей.pdf'

/** '09:00-10:30-Мат-анализ' -> { start, end, subject } (fallback, если урок не найден) */
function parseLessonKey(key) {
  const [start, end, ...rest] = key.split('-')
  return { start: start ?? '', end: end ?? '', subject: rest.join('-') }
}

/**
 * Страница конкретного урока: преподаватель, кабинет, ДЗ, конспекты и ссылки.
 * Урок однозначно определяется датой и ключом пары (start-end-subject).
 */
function LessonPage() {
  const { date, lessonKey } = useParams()
  const navigate = useNavigate()
  const { template, overrides } = useScheduleData()
  /* Материалы этого урока: внутри «горячего окна» — фильтр общего стора
     (без дополнительных чтений), для старых дат — точечный TTL-запрос */
  const notes = useLessonNotes(lessonKey, date)
  const lessonLinks = useLessonLinksFor(lessonKey, date)
  const lessonHw = useLessonHomework(lessonKey, date)
  const subjectLinks = useSubjectLinks()
  /* Материалы приходят асинхронно (Firestore) внутри анимируемой страницы:
     на iOS Safari контент внутри opacity/transform-обёртки может остаться
     непрокрашенным — форсируем перерисовку после получения данных */
  const materials = useMemo(
    () => ({ notes, lessonLinks, lessonHw, subjectLinks }),
    [notes, lessonLinks, lessonHw, subjectLinks],
  )
  useForceRepaint(materials)
  const { user, isAdmin, isLeader } = useAuth()

  const [hwText, setHwText] = useState('')
  const [hwFormOpen, setHwFormOpen] = useState(false)
  const [hwBusy, setHwBusy] = useState(false)
  const [hwError, setHwError] = useState('')

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  const parsed = useMemo(
    () => parseLessonKey(decodeURIComponent(lessonKey ?? '')),
    [lessonKey],
  )

  const { lesson, isOverride } = useMemo(() => {
    const day = getDaySchedule(template, overrides, date)
    const found = (day.lessons ?? []).find((l) => makeLessonKey(l) === lessonKey)
    return { lesson: found ?? null, isOverride: Boolean(day.isOverride) }
  }, [template, overrides, date, lessonKey])

  const subject = lesson?.subject ?? parsed.subject
  const teacher = lesson?.teacher ?? ''
  const room = lesson?.room ?? ''
  const note = lesson?.note ?? ''
  const time = lesson ? `${lesson.start}–${lesson.end}` : `${parsed.start}–${parsed.end}`

  const canDeleteHw = isAdmin || isLeader

  /* Номер пары этого предмета в этот день («вторая пара» и т.п.) */
  const pairLabel = useMemo(() => {
    if (!lesson) return ''
    const day = getDaySchedule(template, overrides, date)
    const same = (day.lessons ?? []).filter(
      (l) => !l.empty && (l.subject ?? l.empty) === (lesson.subject ?? lesson.empty),
    )
    const idx = same.findIndex((l) => makeLessonKey(l) === lessonKey)
    if (same.length <= 1) return 'Пара'
    const ordinals = ['Первая', 'Вторая', 'Третья', 'Четвёртая', 'Пятая', 'Шестая', 'Седьмая']
    return idx >= 0 ? `${ordinals[idx] ?? `${idx + 1}-я`} пара` : 'Пара'
  }, [template, overrides, date, lesson, lessonKey])

  /* Тип занятия: sentence case + класс бейджа */
  const kind = lesson?.kind ?? 'other'
  const KIND_LABELS = { lecture: 'Лекция', practice: 'Семинар', consult: 'Консультация' }
  const rawType = lesson?.type ?? ''
  const typeLabel = rawType
    ? rawType.charAt(0).toUpperCase() + rawType.slice(1).toLowerCase()
    : (KIND_LABELS[kind] ?? 'Занятие')

  const openFloorPlan = () => window.open(floorPlanPdf, '_blank', 'noopener')

  const submitHw = async (e) => {
    e.preventDefault()
    const text = hwText.trim()
    if (!text || !subject) return
    setHwError('')
    setHwBusy(true)
    try {
      await addHomework({
        lessonKey,
        date,
        subject,
        text,
        authorEmail: user?.email ?? null,
      })
      setHwText('')
      setHwFormOpen(false)
    } catch (err) {
      console.error(err)
      setHwError('Не удалось сохранить ДЗ')
    } finally {
      setHwBusy(false)
    }
  }

  const removeHw = async (item) => {
    if (!window.confirm('Удалить это ДЗ?')) return
    setHwBusy(true)
    setHwError('')
    try {
      await deleteHomework(item)
    } catch (err) {
      console.error(err)
      setHwError(err.message || 'Не удалось удалить ДЗ')
    } finally {
      setHwBusy(false)
    }
  }

  const dateObj = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? fromISODate(date) : null
  const weekdayTitle = dateObj ? WEEKDAY_TITLES[weekdayKeyOf(date)] : ''

  /* Возврат «К расписанию» — на ТОТ день, в котором открыт урок.
     Если пришли из расписания, navigate(-1) вернёт ровно тот экран: день уже
     зашит в URL расписания (?d=YYYY-MM-DD, см. utils/dayParam.js) и остаётся
     в записи истории. Если урок открыт по прямой ссылке (или история пуста,
     history.state.idx === 0) — уходим на расписание с днём этого урока. */
  const scheduleHref = dayLink(date)
  const backToSchedule = () => {
    const idx = window.history.state?.idx
    if (typeof idx === 'number' && idx > 0) navigate(-1)
    else navigate(scheduleHref)
  }

  return (
    <div className="wrap lesson-page">
      <nav className="lesson-top">
        <button type="button" className="back-btn back-pill" onClick={backToSchedule}>
          <ArrowLeft size={16} aria-hidden="true" />
          Расписание
        </button>
        <span className="lesson-top-date">
          {dateObj ? `${weekdayTitle} · ${formatRuDate(date)}` : ''}
        </span>
      </nav>

      <motion.header
        className="lesson-header"
        data-kind={kind}
        variants={fadeUp}
        initial="hidden"
        animate="show"
      >
        <div className="lesson-kind-row">
          {typeLabel && (
            <span className="kind-badge">
              <span className="kind-dot" aria-hidden="true" />
              {typeLabel}
            </span>
          )}
          {(pairLabel || isOverride) && (
            <span className="lesson-sub">
              {[pairLabel, isOverride ? 'изменено' : ''].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>
        <h1 className="lesson-title">{subject || 'Урок не найден'}</h1>
        <div className="lesson-meta-rows">
          {time && time !== '–' && (
            <span className="meta-row">
              <Clock size={15} aria-hidden="true" />
              {time}
            </span>
          )}
          {teacher && (
            <span className="meta-row">
              <User size={15} aria-hidden="true" />
              {teacher}
            </span>
          )}
          {room && (
            <span className="meta-row room">
              <MapPin size={15} aria-hidden="true" />
              <button
                type="button"
                className="meta-room"
                title="Открыть карту этажей"
                onClick={openFloorPlan}
              >
                {room}
              </button>
            </span>
          )}
        </div>
        {note && <p className="lesson-note">{note}</p>}
        {!lesson && (
          <p className="lesson-missing">
            Урок не найден в расписании на эту дату — возможно, расписание изменилось.
          </p>
        )}
      </motion.header>

      {subject && (
        <motion.div
          className="lesson-body"
          variants={listVariants}
          initial="hidden"
          animate="show"
        >
          <motion.section className="lesson-block" variants={fadeUp}>
            <div className="block-head">
              <h2>Домашнее задание</h2>
              {lessonHw.length > 0 && <span className="block-count">{lessonHw.length}</span>}
            </div>
            {lessonHw.length > 0 && (
              <motion.ul
                className="task-list"
                variants={listVariants}
                initial="hidden"
                animate="show"
              >
                <AnimatePresence initial={false}>
                  {lessonHw.map((h) => (
                    <motion.li
                      key={h.id}
                      className="task-item"
                      variants={itemVariants}
                      exit="exit"
                      layout
                    >
                      <span className="task-check" aria-hidden="true" />
                      <span className="task-text">{h.text}</span>
                      {canDeleteHw && (
                        <button
                          type="button"
                          className="row-delete"
                          title="Удалить задание"
                          aria-label="Удалить домашнее задание"
                          disabled={hwBusy}
                          onClick={() => removeHw(h)}
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      )}
                    </motion.li>
                  ))}
                </AnimatePresence>
              </motion.ul>
            )}

            {!hwFormOpen ? (
              <button type="button" className="attach-add" onClick={() => setHwFormOpen(true)}>
                <Plus size={14} aria-hidden="true" />
                Добавить задание
              </button>
            ) : (
              <form className="attach-form" onSubmit={submitHw}>
                <input
                  type="text"
                  placeholder="Что задали?"
                  value={hwText}
                  maxLength={1000}
                  onChange={(e) => setHwText(e.target.value)}
                  required
                  autoFocus
                />
                {hwError && (
                  <span className="attach-error">
                    {hwError}
                    <button type="button" onClick={() => setHwError('')} aria-label="Скрыть ошибку">
                      <X size={12} aria-hidden="true" />
                    </button>
                  </span>
                )}
                <div className="attach-form-actions">
                  <button type="submit" className="btn btn-primary" disabled={hwBusy || !hwText.trim()}>
                    {hwBusy ? 'Сохраняю…' : 'Добавить'}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setHwFormOpen(false)}>
                    Отмена
                  </button>
                </div>
              </form>
            )}
          </motion.section>

          <section className="lesson-block">
            <div className="block-head">
              <h2>Конспекты</h2>
            </div>
            <LessonNotes
              subject={subject}
              lessonKey={lessonKey}
              date={date}
              notes={notes}
            />
          </section>

          <section className="lesson-block">
            <div className="block-head">
              <h2>Ссылки</h2>
            </div>
            <LessonLinks
              subject={subject}
              lessonKey={lessonKey}
              date={date}
              lessonLinks={lessonLinks}
              subjectLinks={subjectLinks}
            />
          </section>
        </motion.div>
      )}

      <Link className="lesson-bottom-link" to={scheduleHref}>К расписанию</Link>
    </div>
  )
}

export default LessonPage