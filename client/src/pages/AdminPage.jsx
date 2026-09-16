import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { signInAdmin, signOut } from '../firebase/auth'
import {
  useScheduleData,
  saveTemplateMeta, saveTemplateDay, importTemplateFromJson,
  saveDayOverride, deleteDayOverride,
} from '../firebase/data'
import DayEditor from '../components/DayEditor.jsx'
import AttendanceTab from '../components/AttendanceTab.jsx'
import AdminTabBar from '../components/AdminTabBar.jsx'
import { dayMeta } from '../utils/scheduleModel'
import { useForceRepaint } from '../utils/useForceRepaint'
import { WEEK_KEYS, DAY_LABELS, WEEKDAY_TITLES, todayISO, formatRuDate, weekdayKeyOf } from '../utils/dates'

/* ------------------------------ Вход ------------------------------ */

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await signInAdmin(email, password)
    } catch (err) {
      console.error(err)
      setError(err.code === 'auth/invalid-credential'
        ? 'Неверный email или пароль'
        : 'Не удалось войти. Попробуйте ещё раз.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-card">
      <h1>Вход для администратора</h1>
      <form className="admin-form" onSubmit={submit}>
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
        </label>
        <label className="field">
          <span>Пароль</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Вхожу…' : 'Войти'}
        </button>
      </form>
      <Link className="admin-back" to="/">← К расписанию</Link>
    </div>
  )
}

function NotAdmin({ user, isLeader }) {
  return (
    <div className="admin-card">
      {isLeader ? (
        <>
          <h1>Вы вошли как староста</h1>
          <p>
            Староста может <b>удалять конспекты</b> — прямо на главной странице,
            под нужной парой (кнопка <code>×</code> рядом с конспектом).
          </p>
          <div className="day-editor-actions">
            <Link className="btn btn-primary" to="/">К расписанию</Link>
            <button type="button" className="btn btn-ghost" onClick={() => signOut()}>Выйти</button>
          </div>
        </>
      ) : (
        <>
          <h1>Нет доступа</h1>
          <p>
            Пользователь <b>{user.email}</b> есть в Firebase Auth, но не добавлен
            в коллекции <code>admins</code> (полный доступ) или <code>leaders</code>
            {' '}(удаление конспектов) в Firestore.
          </p>
          <p className="muted">
            Добавьте документ с ID <code>{user.uid}</code> в нужную коллекцию,
            затем перезайдите.
          </p>
          <div className="day-editor-actions">
            <button type="button" className="btn btn-ghost" onClick={() => signOut()}>Выйти</button>
            <Link className="btn btn-ghost" to="/">К расписанию</Link>
          </div>
        </>
      )}
    </div>
  )
}

/* -------------------- Вкладка: шаблон недели ---------------------- */

/** Форма метаданных. Инициализируется один раз; пересоздаётся по key,
 *  когда значения в Firestore реально изменились. */
function MetaForm({ template, saving, onSave }) {
  const [meta, setMeta] = useState({
    group: template.group ?? '',
    course: template.course ?? '',
    title: template.title ?? '',
  })

  return (
    <div className="admin-form admin-form-row">
      <label className="field">
        <span>Группа</span>
        <input value={meta.group} onChange={(e) => setMeta({ ...meta, group: e.target.value })} />
      </label>
      <label className="field field-wide">
        <span>Заголовок</span>
        <input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
      </label>
      <label className="field field-wide">
        <span>Подзаголовок (course)</span>
        <input value={meta.course} onChange={(e) => setMeta({ ...meta, course: e.target.value })} />
      </label>
      <button type="button" className="btn btn-primary" disabled={saving} onClick={() => onSave(meta)}>
        Сохранить
      </button>
    </div>
  )
}

function TemplateTab() {
  const { template } = useScheduleData()
  const [dayKey, setDayKey] = useState('mon')
  const [saving, setSaving] = useState(false)

  /* Шаблон приходит асинхронно (Firestore) уже внутри анимированной
     вкладки — на iOS без принудительной перерисовки может не закраситься */
  useForceRepaint(template)

  const day = template.days?.[dayKey] ?? {
    label: DAY_LABELS[dayKey],
    title: WEEKDAY_TITLES[dayKey],
    lessons: [],
  }

  const saveDay = async (lessons) => {
    setSaving(true)
    try {
      await saveTemplateDay(dayKey, {
        label: day.label || DAY_LABELS[dayKey],
        title: day.title || WEEKDAY_TITLES[dayKey],
        lessons,
      })
    } finally {
      setSaving(false)
    }
  }

  const saveMeta = async (meta) => {
    setSaving(true)
    try {
      await saveTemplateMeta(template, meta)
    } finally {
      setSaving(false)
    }
  }

  const runImport = async () => {
    if (!window.confirm('Перезаписать шаблон расписания локальным JSON?')) return
    setSaving(true)
    try {
      await importTemplateFromJson()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>

      <div className="admin-card">
        <h2>Метаданные</h2>
        <MetaForm
          key={`${template.group}|${template.title}|${template.course}`}
          template={template}
          saving={saving}
          onSave={saveMeta}
        />
      </div>

      <div className="admin-card">
        <h2>Шаблон недели</h2>
        <div className="admin-tabs">
          {WEEK_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              className={`tab${k === dayKey ? ' active' : ''}`}
              onClick={() => setDayKey(k)}
            >
              <span className="short">{DAY_LABELS[k]}</span>
            </button>
          ))}
        </div>
        <p className="muted">
          Шаблон применяется ко всем неделям, где нет переопределения конкретной даты.
        </p>
        <p className="muted">{dayMeta(day)}</p>
        <DayEditor
          key={dayKey}
          initial={day.lessons ?? []}
          onSave={saveDay}
          saving={saving}
        />
      </div>

      <div className="admin-card">
        <h2>Первичный импорт</h2>
        <p className="muted">
          Переносит локальный файл <code>schedule.json</code> в Firestore
          (документ <code>schedule/template</code>).
        </p>
        <button type="button" className="btn btn-ghost" disabled={saving} onClick={runImport}>
          Импортировать из JSON
        </button>
      </div>
    </div>
  )
}

/* -------------- Вкладка: расписание на конкретную дату -------------- */

function DateTab() {
  const { template, overrides } = useScheduleData()
  const { user } = useAuth()
  const [date, setDate] = useState(todayISO())
  const [emptyMode, setEmptyMode] = useState(false)
  const [saving, setSaving] = useState(false)

  /* Оверрайды тоже приходят асинхронно (Firestore) — см. useForceRepaint */
  useForceRepaint(overrides)

  const override = overrides[date]
  const key = weekdayKeyOf(date)
  const baseLessons = template.days?.[key]?.lessons ?? []
  const currentLessons = override?.lessons ?? baseLessons

  const pickDate = (iso) => {
    setDate(iso)
    setEmptyMode(false)
  }

  const save = async (lessons) => {
    setSaving(true)
    try {
      await saveDayOverride(date, lessons, user?.email)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!window.confirm(`Убрать переопределение на ${formatRuDate(date)}? Вернётся шаблон недели.`)) return
    setSaving(true)
    try {
      await deleteDayOverride(date)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-card">
      <h2>Расписание на конкретную дату</h2>
      <p className="muted">
        Нужно, когда конкретный день отличается от обычной недели (праздник,
        замена пар и т.п.). Переопределение полностью заменяет пары на эту дату.
      </p>

      <div className="admin-form admin-form-row">
        <label className="field">
          <span>Дата</span>
          <input type="date" value={date} onChange={(e) => pickDate(e.target.value)} />
        </label>
        {override && <span className="override-chip">есть переопределение</span>}
      </div>

      <h3>Уже есть на {formatRuDate(date)}{override ? ' (переопределение)' : ' (шаблон)'}</h3>
      <ul className="day-preview">
        {currentLessons.map((l, i) => (
          <li key={`preview-${i}`}>
            <span className="day-preview-time">{l.start}–{l.end}</span>
            <span className="day-preview-subject">{l.empty ? l.empty : l.subject}</span>
            <span className="day-preview-pair">{l.pair}</span>
          </li>
        ))}
        {!currentLessons.length && <li className="muted">Пар нет</li>}
      </ul>

      <DayEditor
        key={`${date}-${override ? 'ov' : 'tpl'}${emptyMode ? '-empty' : ''}`}
        initial={emptyMode ? [] : (override?.lessons ?? baseLessons)}
        onSave={save}
        saving={saving}
      />

      <div className="day-editor-actions">
        {!emptyMode && (
          <button type="button" className="btn btn-ghost" onClick={() => setEmptyMode(true)}>
            Начать с пустого дня
          </button>
        )}
        {override && (
          <button type="button" className="btn btn-danger" disabled={saving} onClick={remove}>
            Убрать переопределение (вернуть шаблон)
          </button>
        )}
      </div>
    </div>
  )
}

/* --------------------------- Панель -------------------------------- */

function AdminPanel() {
  const { user } = useAuth()
  const [tab, setTab] = useState('template')

  return (
    <div>
      <div className="admin-topbar">
        <span className="page-head-icon" aria-hidden="true">
          <ShieldCheck />
        </span>
        <div className="page-head-text">
          <h1>Админ-панель</h1>
          <p>{user.email}</p>
        </div>
        <div className="admin-user">
          <Link className="btn btn-ghost" to="/">К расписанию</Link>
        </div>
      </div>

      {/* Контент вкладок — БЕЗ motion (обход бага перерисовки iOS Safari:
          контент внутри анимируемого opacity/transform-контейнера оставался
          на opacity 0). Переключение вкладок мгновенное, без анимации.
          Обёртка .admin-composite оставлена: форсированный composite-слой
          для контента, приходящего асинхронно (Firestore). */}
      {tab === 'template' && <div className="admin-composite"><TemplateTab /></div>}
      {tab === 'date' && <div className="admin-composite"><DateTab /></div>}
      {tab === 'attendance' && <div className="admin-composite"><AttendanceTab /></div>}

      {/* Вкладки разделов — в нижнем таб-баре (стиль основного приложения) */}
      <AdminTabBar tab={tab} onChange={setTab} />
    </div>
  )
}

export default function AdminPage() {
  const { user, isAdmin, isLeader, loading } = useAuth()

  /* Обход бага iOS Safari: страница монтируется внутри анимируемой обёртки
     (.page-transition в App.jsx), и контент, появившийся одновременно с
     входной анимацией (или подменённый асинхронным колбэком во время неё),
     может остаться «непрокрашенным»: DOM есть, тапы работают, но paint нет
     (визуально виден только фон, спасает только перезагрузка).
     Поэтому: сразу рисуем лёгкий индикатор загрузки, а реальный контент —
     после небольшой паузы, когда входная анимация страницы уже завершилась.
     Контент рендерится напрямую, без opacity: 0 и анимаций появления. */
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 300)
    return () => clearTimeout(t)
  }, [])

  /* Данные вкладок приходят асинхронно (Firestore) —
     подстраховка: форсируем reflow/repaint после их получения */
  useForceRepaint(loading)
  useForceRepaint(user)

  if (loading || !ready) {
    return <div className="wrap"><div className="admin-card muted">Загрузка…</div></div>
  }
  if (!user) {
    return <div className="wrap"><LoginForm /></div>
  }
  if (!isAdmin) {
    return <div className="wrap"><NotAdmin user={user} isLeader={isLeader} /></div>
  }
  return <div className="wrap"><AdminPanel /></div>
}



