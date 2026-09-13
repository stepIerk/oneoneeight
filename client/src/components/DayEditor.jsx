import { useState } from 'react'
import { makeLesson } from '../utils/scheduleModel'

const KIND_OPTIONS = [
  { value: 'lecture', label: 'Лекция' },
  { value: 'practice', label: 'Семинар' },
  { value: 'consult', label: 'Консультация' },
  { value: 'other', label: 'Другое' },
]

/**
 * Редактор списка пар одного дня (используется и для шаблона недели,
 * и для оверрайда конкретной даты). Локальное состояние + сохранение по кнопке.
 */
function DayEditor({ initial, onSave, saving }) {
  const [lessons, setLessons] = useState(initial)

  const update = (index, field, value) => {
    setLessons((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)))
  }

  const toggleEmpty = (index, checked) => {
    setLessons((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l
        if (checked) return { ...l, empty: 'Окно', subject: '', teacher: '', room: '', note: '' }
        const rest = { ...l }
        delete rest.empty
        return rest
      }),
    )
  }

  const move = (index, dir) => {
    setLessons((prev) => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const remove = (index) => setLessons((prev) => prev.filter((_, i) => i !== index))

  const add = () => setLessons((prev) => [...prev, makeLesson(prev.length)])

  return (
    <div className="day-editor">
      {lessons.map((lesson, i) => (
        <fieldset className="lesson-edit" key={`lesson-${i}`}>
          <legend>
            Пара {i + 1}
            <span className="lesson-edit-tools">
              <button type="button" title="Выше" onClick={() => move(i, -1)}>↑</button>
              <button type="button" title="Ниже" onClick={() => move(i, 1)}>↓</button>
              <button type="button" className="danger" title="Удалить" onClick={() => remove(i)}>×</button>
            </span>
          </legend>

          <div className="lesson-edit-grid">
            <label className="field">
              <span>Начало</span>
              <input type="time" value={lesson.start ?? ''} onChange={(e) => update(i, 'start', e.target.value)} />
            </label>
            <label className="field">
              <span>Конец</span>
              <input type="time" value={lesson.end ?? ''} onChange={(e) => update(i, 'end', e.target.value)} />
            </label>
            <label className="field">
              <span>Подпись</span>
              <input type="text" value={lesson.pair ?? ''} placeholder="3 пара" onChange={(e) => update(i, 'pair', e.target.value)} />
            </label>
            <label className="field field-checkbox">
              <span>Окно</span>
              <input type="checkbox" checked={Boolean(lesson.empty)} onChange={(e) => toggleEmpty(i, e.target.checked)} />
            </label>
            {!lesson.empty && (
              <>
                <label className="field">
                  <span>Вид</span>
                  <select value={lesson.kind ?? 'other'} onChange={(e) => update(i, 'kind', e.target.value)}>
                    {KIND_OPTIONS.map((k) => (
                      <option key={k.value} value={k.value}>{k.label}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Тип</span>
                  <input type="text" value={lesson.type ?? ''} placeholder="Лекция / Семинар" onChange={(e) => update(i, 'type', e.target.value)} />
                </label>
                <label className="field field-wide">
                  <span>Предмет</span>
                  <input type="text" value={lesson.subject ?? ''} onChange={(e) => update(i, 'subject', e.target.value)} />
                </label>
                <label className="field field-wide">
                  <span>Преподаватель</span>
                  <input type="text" value={lesson.teacher ?? ''} onChange={(e) => update(i, 'teacher', e.target.value)} />
                </label>
                <label className="field">
                  <span>Кабинет</span>
                  <input type="text" value={lesson.room ?? ''} onChange={(e) => update(i, 'room', e.target.value)} />
                </label>
                <label className="field">
                  <span>Заметка</span>
                  <input type="text" value={lesson.note ?? ''} onChange={(e) => update(i, 'note', e.target.value)} />
                </label>
              </>
            )}
            {lesson.empty && (
              <label className="field field-wide">
                <span>Текст окна</span>
                <input type="text" value={lesson.empty ?? ''} onChange={(e) => update(i, 'empty', e.target.value)} />
              </label>
            )}
          </div>
        </fieldset>
      ))}

      <div className="day-editor-actions">
        <button type="button" className="btn btn-ghost" onClick={add}>+ Добавить пару</button>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={() => onSave(lessons)}>
          {saving ? 'Сохраняю…' : 'Сохранить'}
        </button>
      </div>
    </div>
  )
}

export default DayEditor
