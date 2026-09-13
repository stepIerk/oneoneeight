import { useState } from 'react'
import { Link2, Plus, X } from 'lucide-react'
import { addLessonLink, deleteLessonLink } from '../firebase/data'
import { useAuth } from '../context/AuthContext'

/** Нормализация URL: добавляем https://, если схемы нет */
function normalizeUrl(raw) {
  let url = raw.trim()
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  return url
}

export function LinkAddForm({ subject, onDone }) {
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const normalized = normalizeUrl(url)
    if (!URL.canParse(normalized)) {
      setError('Некорректная ссылка')
      return
    }
    setBusy(true)
    try {
      await addLessonLink({ subject, url: normalized, label: label.trim() })
      onDone?.()
    } catch (err) {
      console.error(err)
      setError('Не удалось сохранить ссылку')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="attach-form" onSubmit={submit}>
      <input
        type="url"
        placeholder="https://ссылка на материал"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        required
      />
      <input
        type="text"
        placeholder="Название (необязательно)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      {error && <span className="attach-error">{error}</span>}
      <div className="attach-form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Сохраняю…' : 'Добавить'}
        </button>
      </div>
    </form>
  )
}

function SubjectSection({ subject, links, open, onToggle, formOpen, onFormOpen, onFormClose }) {
  const { isAdmin } = useAuth()

  const remove = async (link) => {
    if (!window.confirm(`Удалить ссылку «${link.label || link.url}»?`)) return
    try {
      await deleteLessonLink(link)
    } catch (err) {
      console.error(err)
    }
  }

  const countWord = links.length === 1 ? 'ссылка' : links.length < 5 ? 'ссылки' : 'ссылок'

  return (
    <section className="subject-card">
      <button
        type="button"
        className="subject-head"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="subject-name">{subject}</span>
        <span className="subject-meta">{links.length} {countWord}</span>
        <span className={`subject-chevron${open ? ' open' : ''}`} aria-hidden="true">›</span>
      </button>

      {open && (
        <div className="subject-body">
          {links.length === 0 && !formOpen && (
            <p className="mat-empty">Ссылок по предмету пока нет — добавьте первой.</p>
          )}
          <div className="mat-list">
            {links.map((l) => (
              <span key={l.id} className="attach-item link">
                <a href={l.url} target="_blank" rel="noreferrer">
                  <Link2 size={14} className="attach-icon" aria-hidden="true" />
                  {l.label || l.url}
                </a>
                {isAdmin && (
                  <button
                    type="button"
                    className="attach-delete"
                    title="Удалить ссылку"
                    onClick={() => remove(l)}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                )}
              </span>
            ))}
          </div>

          {formOpen ? (
            <div className="subject-form">
              <LinkAddForm subject={subject} onDone={onFormClose} />
              <button type="button" className="btn btn-ghost btn-small" onClick={onFormClose}>
                Отмена
              </button>
            </div>
          ) : (
            <button type="button" className="attach-add" onClick={onFormOpen}>
              <Plus size={14} aria-hidden="true" />
              добавить ссылку
            </button>
          )}
        </div>
      )}
    </section>
  )
}

export default SubjectSection
