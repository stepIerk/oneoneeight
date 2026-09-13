import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { ClipboardList, DoorOpen, FileText, Link2, User } from 'lucide-react'
import { lessonKey } from '../utils/scheduleModel'
import { itemVariants } from '../utils/anim'

function formatTimeRange(start, end) {
  return `${start}–${end}`
}

function LessonCard({ lesson, date, status, progress, notes = [], links = [], homework = [], animated = false }) {
  const navigate = useNavigate()
  const isEmpty = Boolean(lesson.empty)
  const kind = lesson.kind ?? 'other'

  // На карточке — только материалы ЭТОГО урока В ЭТОТ день
  // (lessonKey не содержит дату, поэтому фильтруем ещё и по ней)
  const key = lessonKey(lesson)
  const lessonNotes = isEmpty ? [] : notes.filter((n) => n.lessonKey === key && n.date === date)
  const lessonLinks = isEmpty ? [] : links.filter((l) => l.lessonKey === key && l.date === date)
  const lessonHw = isEmpty ? [] : homework.filter((h) => h.lessonKey === key && h.date === date)

  const articleProps = animated ? { variants: itemVariants } : {}
  const Article = animated ? motion.article : 'article'

  return (
    <Article
      className={[
        'lesson',
        kind,
        status === 'now' ? 'active' : '',
        status === 'past' ? 'past' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...articleProps}
    >
      <div className="time">
        <div className="time-main">{formatTimeRange(lesson.start, lesson.end)}</div>
        <div className="time-num">{lesson.pair}</div>
      </div>

      {isEmpty ? (
        <div className="card empty">{lesson.empty}</div>
      ) : (
        <div className="card">
          {/* Клик по карточке открывает страницу предмета */}
          <button
            type="button"
            className="card-head"
            onClick={() => navigate(`/lesson/${date}/${encodeURIComponent(lessonKey(lesson))}`)}
            aria-label={`Открыть урок «${lesson.subject}»`}
          >
            <div className="topline">
              <span className={`type ${kind}`}>{lesson.type}</span>
              {status === 'now' && (
                <span className="active-badge">
                  <span className="pulse" />
                  Идёт сейчас
                </span>
              )}
              {status === 'next' && <span className="next-badge">Следующая</span>}
            </div>

            <div className="subject">{lesson.subject}</div>

            {status === 'now' && typeof progress === 'number' && (
              <div className="progress" aria-hidden="true">
                <span style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} />
              </div>
            )}

            {lesson.note && <div className="note">{lesson.note}</div>}

            {(lesson.teacher || lesson.room) && (
              <div className="details">
                {lesson.teacher && (
                  <span className="detail">
                    <User size={14} aria-hidden="true" />
                    {lesson.teacher}
                  </span>
                )}
                {lesson.room && (
                  <span className="detail">
                    <DoorOpen size={14} aria-hidden="true" />
                    {lesson.room}
                  </span>
                )}
              </div>
            )}

            {/* Домашнее задание — текст прямо в карточке */}
            {lessonHw.length > 0 && (
              <div className="hw-preview" title={lessonHw.map((h) => h.text).join('\n---\n')}>
                <span className="hw-preview-head">
                  <ClipboardList size={13} aria-hidden="true" />
                  ДЗ
                  {lessonHw.length > 1 && (
                    <span className="hw-preview-more">+{lessonHw.length - 1}</span>
                  )}
                </span>
                {lessonHw.slice(0, 2).map((h) => (
                  <span key={h.id} className="hw-preview-text">{h.text}</span>
                ))}
              </div>
            )}

            {/* Количество материалов предмета */}
            <div className="attach-summary">
              <span className="attach-counts">
                {lessonNotes.length > 0 && (
                  <span className="attach-count notes" title="Конспекты этого урока">
                    <FileText size={14} aria-hidden="true" />
                    {lessonNotes.length}
                  </span>
                )}
                {lessonLinks.length > 0 && (
                  <span className="attach-count links" title="Ссылки этого урока">
                    <Link2 size={14} aria-hidden="true" />
                    {lessonLinks.length}
                  </span>
                )}
              </span>
            </div>
          </button>
        </div>
      )}
    </Article>
  )
}

export default LessonCard

