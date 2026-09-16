import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Globe, Library, Link2, Map as MapIcon, Plus, Search, X } from 'lucide-react'
import { useSubjectLinks, useScheduleData, addGeneralLink, deleteLessonLink } from '../firebase/data'
import { useAuth } from '../context/AuthContext'
import { useForceRepaint } from '../utils/useForceRepaint'
import { collectSubjects } from '../utils/scheduleModel'
import { listVariants, itemVariants, springSoft } from '../utils/anim'
import SubjectSection from '../components/SubjectLinks.jsx'
import floorPlanPdf from '../assets/Планы этажей.pdf'

/* Секция «Общие ссылки»: складина ссылок, которые могут пригодиться.
   Тот же стиль карточки-секции, что у предметов, удаление — только админ */
function GeneralSection({ links, open, onToggle }) {
  const { isAdmin } = useAuth()
  const [formOpen, setFormOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    let normalized = url.trim()
    if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`
    if (!URL.canParse(normalized)) {
      setError('Некорректная ссылка')
      return
    }
    setBusy(true)
    try {
      await addGeneralLink({ url: normalized, label: label.trim() })
      setUrl('')
      setLabel('')
      setFormOpen(false)
    } catch (err) {
      console.error(err)
      setError(
        err?.code === 'permission-denied'
          ? 'Нет прав на запись — опубликуйте актуальный файл firestore.rules (Firebase Console → Firestore Database → Rules → Publish)'
          : `Не удалось сохранить ссылку${err?.message ? `: ${err.message}` : ''}`,
      )
    } finally {
      setBusy(false)
    }
  }

  const remove = async (link) => {
    if (!window.confirm(`Удалить «${link.label || link.url}»?`)) return
    try {
      await deleteLessonLink(link)
    } catch (err) {
      console.error(err)
    }
  }

  const countWord = links.length === 1 ? 'ссылка' : links.length < 5 ? 'ссылки' : 'ссылок'

  return (
    <section className="subject-card general">
      <button
        type="button"
        className="subject-head"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="subject-icon" aria-hidden="true">
          <Globe size={16} />
        </span>
        <span className="subject-name">Общие ссылки</span>
        <span className="subject-meta">{links.length} {countWord}</span>
        <span className={`subject-chevron${open ? ' open' : ''}`} aria-hidden="true">›</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="general-body"
            className="subject-body-anim"
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={springSoft}
          >
            <div className="subject-body">
              {links.length === 0 && !formOpen && (
                <p className="mat-empty">Пока пусто — добавьте ссылку, которая может пригодиться группе.</p>
              )}
              {links.length > 0 && (
                <motion.div
                  className="mat-list"
                  variants={listVariants}
                  initial="hidden"
                  animate="show"
                >
                  {links.map((l) => (
                    <motion.span
                      key={l.id}
                      className="attach-item link"
                      variants={itemVariants}
                    >
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
                    </motion.span>
                  ))}
                </motion.div>
              )}

              {formOpen ? (
            <div className="subject-form">
              <form className="attach-form" onSubmit={submit}>
                <input
                  type="url"
                  placeholder="https://ссылка"
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
                  <button type="button" className="btn btn-ghost" onClick={() => setFormOpen(false)}>
                    Отмена
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <button type="button" className="attach-add" onClick={() => setFormOpen(true)}>
              <Plus size={14} aria-hidden="true" />
              добавить общую ссылку
            </button>
          )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

export default function MaterialsPage() {
  /* Ссылки «к предмету» и общие (lessonKey == null) — один компактный стор;
     ссылки «к уроку» здесь не нужны */
  const links = useSubjectLinks()
  /* Ссылки приходят асинхронно (Firestore) внутри анимируемых секций:
     на iOS Safari форсируем перерисовку после получения данных */
  useForceRepaint(links)
  const { template } = useScheduleData()
  const [query, setQuery] = useState('')
  const [openSubjects, setOpenSubjects] = useState(() => new Set())
  const [formSubject, setFormSubject] = useState(null)
  const [generalOpen, setGeneralOpen] = useState(false)

  const subjectLinks = useMemo(() => {
    const map = new Map()
    for (const l of links) {
      // На странице материалов — только общие ссылки предмета.
      // Ссылки «к уроку» (с lessonKey) живут на странице конкретного урока,
      // ссылки без subject — в отдельной секции «Общие ссылки»
      if (l.lessonKey || !l.subject) continue
      const s = (l.subject || '').trim()
      if (!s) continue
      if (!map.has(s)) map.set(s, [])
      map.get(s).push(l)
    }
    return map
  }, [links])

  /* Общие ссылки «могут пригодиться»: без предмета и урока */
  const generalLinks = useMemo(
    () => links.filter((l) => !l.lessonKey && !l.subject),
    [links],
  )

  /* Предметы: объединение расписания и предметов из самих ссылок */
  const subjects = useMemo(() => {
    const union = new Set([...collectSubjects(template), ...subjectLinks.keys()])
    return [...union].sort((a, b) => a.localeCompare(b, 'ru'))
  }, [template, subjectLinks])

  const q = query.trim().toLowerCase()

  /* Поиск по общим ссылкам: совпадение в названии или URL */
  const visibleGeneral = useMemo(() => {
    if (!q) return generalLinks
    return generalLinks.filter(
      (l) => (l.label || '').toLowerCase().includes(q)
        || (l.url || '').toLowerCase().includes(q),
    )
  }, [generalLinks, q])

  /* Общая секция скрывается, только если поиск ничего по ней не нашёл */
  const showGeneral = Boolean(generalLinks.length) || !q
  const visibleSubjects = useMemo(() => {
    if (!q) return subjects
    return subjects.filter((s) => {
      if (s.toLowerCase().includes(q)) return true
      return (subjectLinks.get(s) ?? []).some(
        (l) => (l.label || '').toLowerCase().includes(q)
          || (l.url || '').toLowerCase().includes(q),
      )
    })
  }, [subjects, subjectLinks, q])

  const toggle = (subject) => {
    setOpenSubjects((prev) => {
      const next = new Set(prev)
      if (next.has(subject)) next.delete(subject)
      else next.add(subject)
      return next
    })
  }

  const matchedLinks = (subject) => {
    const all = subjectLinks.get(subject) ?? []
    if (!q) return all
    // Совпал сам предмет — показываем все его ссылки, иначе только совпавшие
    if (subject.toLowerCase().includes(q)) return all
    return all.filter(
      (l) => (l.label || '').toLowerCase().includes(q)
        || (l.url || '').toLowerCase().includes(q),
    )
  }

  return (
    <div className="wrap page-materials">
      <header className="page-head">
        <span className="page-head-icon" aria-hidden="true">
          <Library />
        </span>
        <div className="page-head-text">
          <h1>Материалы</h1>
          <p>Ссылки по предметам</p>
        </div>
      </header>

      <a className="floor-banner" href={floorPlanPdf} target="_blank" rel="noreferrer">
        <span className="floor-icon" aria-hidden="true"><MapIcon size={20} /></span>
        <span className="floor-text">
          <strong>Карта этажей</strong>
          <span>PDF · схема корпусов</span>
        </span>
        <span className="action-arrow" aria-hidden="true">↗</span>
      </a>

      <label className="search-bar">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          placeholder="Поиск по названиям ссылок…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            type="button"
            className="search-clear"
            onClick={() => setQuery('')}
            aria-label="Очистить поиск"
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </label>

      {visibleSubjects.length === 0 && !showGeneral ? (
        <p className="mat-empty-page">
          {q ? 'Ничего не найдено — попробуйте другой запрос.' : 'Предметов пока нет.'}
        </p>
      ) : (
        <div className="subject-list">
          {showGeneral && (
            <GeneralSection
              links={visibleGeneral}
              open={q ? true : generalOpen}
              onToggle={() => setGeneralOpen((v) => !v)}
            />
          )}
          {visibleSubjects.map((subject) => (
            <SubjectSection
              key={subject}
              subject={subject}
              links={matchedLinks(subject)}
              open={q ? true : openSubjects.has(subject)}
              onToggle={() => toggle(subject)}
              formOpen={formSubject === subject}
              onFormOpen={() => setFormSubject(subject)}
              onFormClose={() => setFormSubject(null)}
            />
          ))}

        </div>
      )}

    </div>
  )
}
