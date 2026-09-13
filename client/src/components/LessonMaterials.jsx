import { useState } from 'react'
import { FileText, Link2, Plus, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { addLessonLink, deleteLessonLink, deleteNote } from '../firebase/data'
import { deleteFromYandex } from '../firebase/yandexStorage'
import NotesAddForm from './NotesAddForm.jsx'

/**
 * Конспекты конкретного урока (привязаны к lessonKey).
 * Добавляют ВСЕ, удаляют — староста/админ.
 */
export function LessonNotes({ subject, lessonKey, date, notes = [] }) {
  const { isAdmin, isLeader, user } = useAuth()
  const [formOpen, setFormOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const lessonNotes = notes.filter((n) => n.lessonKey === lessonKey && n.date === date)

  const removeNote = async (note) => {
    if (!window.confirm(`Удалить конспект «${note.title}»?`)) return
    setBusy(true)
    setError('')
    try {
      if (note.storagePath) {
        await deleteFromYandex(note.storagePath, await user.getIdToken())
      }
      await deleteNote(note)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Не удалось удалить конспект')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {lessonNotes.length > 0 && (
        <div className="file-list">
          {lessonNotes.map((n) => (
            <span key={n.id} className="file-row">
              <a href={n.url} target="_blank" rel="noreferrer">
                <FileText size={15} className="row-icon" aria-hidden="true" />
                {n.title || 'Конспект'}
              </a>
              {(isAdmin || isLeader) && (
                <button
                  type="button"
                  className="row-delete"
                  title="Удалить конспект"
                  aria-label="Удалить конспект"
                  disabled={busy}
                  onClick={() => removeNote(n)}
                >
                  <X size={15} aria-hidden="true" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {formOpen && (
        <NotesAddForm
          subject={subject}
          lessonKey={lessonKey}
          date={date}
          onDone={() => setFormOpen(false)}
          onCancel={() => setFormOpen(false)}
        />
      )}

      {error && <span className="attach-error">{error}</span>}

      {lessonNotes.length === 0 && !formOpen ? (
        <div className="empty-state">
          <span className="empty-icon" aria-hidden="true">
            <FileText size={18} />
          </span>
          <p>Конспектов пока нет</p>
          <button type="button" className="empty-cta" onClick={() => setFormOpen(true)}>
            <Plus size={14} aria-hidden="true" />
            Добавить конспект
          </button>
        </div>
      ) : (!formOpen && (
        <button type="button" className="attach-add" onClick={() => setFormOpen(true)}>
          <Plus size={14} aria-hidden="true" />
          Добавить конспект
        </button>
      ))}
    </>
  )
}

/** Форма добавления ссылки (к уроку или к предмету — зависит от lessonKey) */
function LinkForm({ subject, lessonKey, date, onDone, onCancel }) {
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    let normalized = url.trim()
    if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`
    try {
      new URL(normalized)
    } catch {
      setError('Некорректная ссылка')
      return
    }
    setBusy(true)
    try {
      await addLessonLink({ subject, lessonKey, date, url: normalized, label: label.trim() })
      setUrl('')
      setLabel('')
      onDone()
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
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </form>
  )
}

/**
 * Ссылки двух видов в одной секции:
 *  - к этому уроку на ЭТУ дату (lessonKey + date совпадают);
 *  - к предмету (общие для всех занятий этого предмета).
 */
export function LessonLinks({ subject, lessonKey, date, links = [] }) {
  const { isAdmin } = useAuth()
  const [form, setForm] = useState(null) // null | 'lesson' | 'subject'

  const lessonLinks = links.filter((l) => l.lessonKey === lessonKey && l.date === date)
  const subjectLinks = links.filter((l) => !l.lessonKey && l.subject === subject)

  const renderLink = (l) => (
    <span key={l.id} className="file-row">
      <a href={l.url} target="_blank" rel="noreferrer">
        <Link2 size={15} className="row-icon" aria-hidden="true" />
        {l.label || l.url}
      </a>
      {isAdmin && (
        <button
          type="button"
          className="row-delete"
          title="Удалить ссылку"
          aria-label="Удалить ссылку"
          onClick={() => deleteLessonLink(l)}
        >
          <X size={15} aria-hidden="true" />
        </button>
      )}
    </span>
  )

  return (
    <>
      <div className="link-group">
        <h3>К этому уроку</h3>
        {lessonLinks.length > 0 && (
          <div className="file-list">{lessonLinks.map(renderLink)}</div>
        )}
        {form === 'lesson' ? (
          <LinkForm
            subject={subject}
            lessonKey={lessonKey}
            date={date}
            onDone={() => setForm(null)}
            onCancel={() => setForm(null)}
          />
        ) : lessonLinks.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon" aria-hidden="true">
              <Link2 size={18} />
            </span>
            <p>Ссылок к уроку пока нет</p>
            <button type="button" className="empty-cta" onClick={() => setForm('lesson')}>
              <Plus size={14} aria-hidden="true" />
              Добавить ссылку
            </button>
          </div>
        ) : (
          <button type="button" className="attach-add" onClick={() => setForm('lesson')}>
            <Plus size={14} aria-hidden="true" />
            Добавить ссылку
          </button>
        )}
      </div>

      <div className="link-group">
        <h3>К предмету · для всех занятий</h3>
        {subjectLinks.length > 0 && (
          <div className="file-list">{subjectLinks.map(renderLink)}</div>
        )}
        {form === 'subject' ? (
          <LinkForm
            subject={subject}
            onDone={() => setForm(null)}
            onCancel={() => setForm(null)}
          />
        ) : subjectLinks.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon" aria-hidden="true">
              <Link2 size={18} />
            </span>
            <p>Общих ссылок предмета пока нет</p>
            <button type="button" className="empty-cta" onClick={() => setForm('subject')}>
              <Plus size={14} aria-hidden="true" />
              Добавить ссылку
            </button>
          </div>
        ) : (
          <button type="button" className="attach-add" onClick={() => setForm('subject')}>
            <Plus size={14} aria-hidden="true" />
            Добавить ссылку
          </button>
        )}
      </div>
    </>
  )
}