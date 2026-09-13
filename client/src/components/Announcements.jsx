import { tsToDate } from '../firebase/data'

const formatDate = (ts) => {
  const d = tsToDate(ts)
  if (!d) return ''
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

function Announcements({ announcements, limit = 5 }) {
  if (!announcements.length) return null
  return (
    <section className="announcements" aria-label="Объявления">
      <h2 className="announcements-title">📢 Объявления</h2>
      {announcements.slice(0, limit).map((a) => (
        <article key={a.id} className="announcement">
          <div className="announcement-head">
            <strong>{a.title}</strong>
            {formatDate(a.createdAt) && <span className="announcement-date">{formatDate(a.createdAt)}</span>}
          </div>
          {a.body && <p>{a.body}</p>}
        </article>
      ))}
    </section>
  )
}

export default Announcements
