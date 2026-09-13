import { useState } from 'react'
import { addNote } from '../firebase/data'
import { uploadToYandex, MAX_NOTE_SIZE } from '../firebase/yandexStorage'

/**
 * Форма добавления конспекта — доступна ВСЕМ посетителям (без входа).
 * Конспект привязывается к конкретному уроку (lessonKey + дата).
 * Файл уходит в Yandex Object Storage через pre-signed URL,
 * ссылка сохраняется в Firestore как есть.
 */
function NotesAddForm({ subject, lessonKey, date, onDone, onCancel }) {
  const [title, setTitle] = useState('')
  const [file, setFile] = useState(null)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!file && !link.trim()) { setError('Выберите файл или укажите ссылку'); return }
    if (file && file.size > MAX_NOTE_SIZE) {
      setError(`Файл больше ${Math.round(MAX_NOTE_SIZE / 1024 / 1024)} МБ`)
      return
    }
    setBusy(true)
    try {
      if (file) {
        const { key, publicUrl } = await uploadToYandex(file)
        await addNote({ lessonKey, date, subject, title: title || file.name, url: publicUrl, storagePath: key })
      } else {
        await addNote({ lessonKey, date, subject, title: title || 'Материал', url: link.trim() })
      }
      onDone()
    } catch (err) {
      console.error(err)
      setError(err.message || 'Не удалось сохранить конспект')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="attach-form" onSubmit={submit}>
      <input
        type="text"
        placeholder="Название (например: конспект лекции №1)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <input
        type="url"
        placeholder="…или ссылка на материал"
        value={link}
        onChange={(e) => setLink(e.target.value)}
      />
      {error && <span className="attach-error">{error}</span>}
      <div className="attach-form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Загружаю…' : 'Добавить'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </form>
  )
}

export default NotesAddForm
