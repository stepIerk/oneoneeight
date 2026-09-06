function formatTimeRange(start, end) {
  return `${start}–${end}`
}

function LessonCard({ lesson, status, progress }) {
  const isEmpty = Boolean(lesson.empty)
  const kind = lesson.kind ?? 'other'

  return (
    <article
      className={[
        'lesson',
        kind,
        status === 'now' ? 'active' : '',
        status === 'past' ? 'past' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="time">
        <div className="time-main">{formatTimeRange(lesson.start, lesson.end)}</div>
        <div className="time-num">{lesson.pair}</div>
      </div>

      {isEmpty ? (
        <div className="card empty">{lesson.empty}</div>
      ) : (
        <div className="card">
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
                  <span className="icon">👤</span>
                  {lesson.teacher}
                </span>
              )}
              {lesson.room && (
                <span className="detail">
                  <span className="icon">🚪</span>
                  {lesson.room}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  )
}

export default LessonCard
