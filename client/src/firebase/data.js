import { useEffect, useMemo, useState } from 'react'
import { doc, collection, addDoc, deleteDoc, setDoc,
  getDoc, getDocs, query, where, orderBy, limit,
  serverTimestamp, Timestamp,
} from 'firebase/firestore'
import { db } from './config'
import {
  DEFAULT_KEEP_ALIVE, patchStore, patchStoreIfExists, patchStoresByPrefix,
  useCachedQuery, useLiveQuery,
} from './liveStore'
import { addDays, fromISODate, startOfWeek, toISODate } from '../utils/dates'
import templateFallback from '../data/schedule.json'

/* ------------------------------------------------------------------ */
/*  Чтение: шаблон недели + оверрайды дат (кэш-first, экономия чтений)  */
/* ------------------------------------------------------------------ */

/*
 * Расписание меняется редко, поэтому постоянные onSnapshot-подписки на
 * schedule/template и dayOverrides слишком дороги: каждый заход = платное
 * чтение каждого документа заново. Стратегия cache-first:
 *   1. Состояние хранится в localStorage — рендер мгновенный, без чтений.
 *   2. С сервера обновляем только если кэшу больше SCHEDULE_TTL (или его нет).
 *   3. Записи (админка) обновляют локальный кэш оптимистично и запускают
 *     фоновое перечитывание — админ сразу видит актуальные данные.
 * Для «живых» коллекций (ДЗ, конспекты, ссылки, посещаемость) — та же идея,
 * но на общем сторе с дедупликацией подписок: см. секцию ниже и liveStore.js.
 */

const SCHEDULE_CACHE_KEY = 'schedule-cache-v1'
const SCHEDULE_TTL = 15 * 60 * 1000 // 15 минут между серверными перечитываниями

let scheduleState = { template: templateFallback, overrides: {}, isFallback: true }
let scheduleFetchedAt = 0
let scheduleFetchInFlight = null
const scheduleListeners = new Set()

/** Оживляем Firestore Timestamp после JSON-сериализации ({seconds, nanoseconds}) */
function reviveTimestamps(value) {
  if (Array.isArray(value)) return value.map(reviveTimestamps)
  if (value && typeof value === 'object') {
    if (typeof value.seconds === 'number' && typeof value.nanoseconds === 'number') {
      return new Timestamp(value.seconds, value.nanoseconds)
    }
    const out = {}
    for (const [key, val] of Object.entries(value)) out[key] = reviveTimestamps(val)
    return out
  }
  return value
}

function persistScheduleCache() {
  try {
    localStorage.setItem(SCHEDULE_CACHE_KEY, JSON.stringify({
      template: scheduleState.template,
      overrides: scheduleState.overrides,
      savedAt: scheduleFetchedAt,
    }))
  } catch { /* приватный режим / переполненная квота */ }
}

function notifySchedule() {
  for (const listener of scheduleListeners) listener()
}

/* Инициализация из localStorage — модуль загружается до первого рендера,
   поэтому первый рендер страницы сразу получает закэшированные данные */
try {
  const raw = localStorage.getItem(SCHEDULE_CACHE_KEY)
  if (raw) {
    const parsed = JSON.parse(raw)
    if (parsed?.template) {
      scheduleState = {
        template: reviveTimestamps(parsed.template),
        overrides: reviveTimestamps(parsed.overrides ?? {}),
        isFallback: false,
      }
      scheduleFetchedAt = parsed.savedAt ?? 0
    }
  }
} catch { /* битый JSON или недоступный localStorage — остаёмся на fallback */ }

/**
 * Локальное применение записи (админка) к кэшу и подписчикам,
 * затем фоновое перечитывание с сервера за авторитетными данными
 * (серверные Timestamp'ы, возможные последствия merge).
 */
function applyScheduleWrite(mutation) {
  scheduleState = mutation(scheduleState)
  scheduleFetchedAt = 0
  persistScheduleCache()
  notifySchedule()
  refreshSchedule({ force: true })
}

/**
 * Перечитывает шаблон и оверрайды с сервера, если кэш устарел.
 * Вызывается при монтировании хука; конкурентные вызовы схлопываются.
 */
export function refreshSchedule({ force = false } = {}) {
  if (!db) return
  if (!force && Date.now() - scheduleFetchedAt < SCHEDULE_TTL) return
  if (scheduleFetchInFlight) return
  scheduleFetchInFlight = (async () => {
    try {
      const [templateSnap, overridesSnap] = await Promise.all([
        getDoc(doc(db, 'schedule', 'template')),
        getDocs(collection(db, 'dayOverrides')),
      ])
      const overrides = {}
      overridesSnap.forEach((d) => { overrides[d.id] = d.data() })
      if (templateSnap.exists()) {
        scheduleState = { template: templateSnap.data(), overrides, isFallback: false }
      } else {
        /* Шаблон ещё не импортирован — остаёмся на schedule.json,
           но оверрайды, если есть, показываем */
        scheduleState = { ...scheduleState, overrides }
      }
      scheduleFetchedAt = Date.now()
      persistScheduleCache()
      notifySchedule()
    } catch (err) {
      /* Офлайн / нет прав — работаем на локальном кэше, как раньше на onSnapshot-ошибке */
      console.error('schedule refresh:', err)
    } finally {
      scheduleFetchInFlight = null
    }
  })()
}

/**
 * Подписывается на состояние расписания (шаблон недели + оверрайды).
 * Данные приходят из localStorage-кэша мгновенно; с сервера — только
 * при устаревании кэша (см. SCHEDULE_TTL). Пока Firebase не настроен
 * (или шаблон ещё не импортирован) — локальный schedule.json как fallback.
 */
export function useScheduleData() {
  const [state, setState] = useState(scheduleState)
  useEffect(() => {
    const listener = () => setState(scheduleState)
    scheduleListeners.add(listener)
    refreshSchedule()
    return () => { scheduleListeners.delete(listener) }
  }, [])
  return state
}

/* ------------------------------------------------------------------ */
/*  «Живые» коллекции: один listen на запрос, общий для всех страниц   */
/* ------------------------------------------------------------------ */

/*
 * Раньше на каждую коллекцию создавалась подписка «вся коллекция целиком»
 * внутри каждого компонента: главная держала 3 подписки, страница урока —
 * ещё 3, вкладка «Дз» — ещё одну, и каждая навигация создавала их заново.
 * Теперь:
 *   • «горячее окно» (сегодня ± HOT_DAYS_*): ДЗ, конспекты и ссылки «к уроку»
 *     читаются одним диапазонным запросом по дате и ОДНИМ подключением на всё
 *     приложение (главная, «Дз», страница урока внутри окна — общие данные);
 *   • HOT_LIMIT страхует от чтения всей истории коллекции;
 *   • даты вне окна (календарь на дальнюю дату, старый урок) читаются точечно
 *     и попадают в TTL-кэш (useCachedQuery) — без постоянного подключения;
 *   • записи применяются оптимистично (patchStore) — UI не ждёт снапшота.
 */

const HOT_DAYS_BACK = 14
const HOT_DAYS_AHEAD = 14
const HOT_LIMIT = 400 // страховка: даже «горячий» запрос не читает всю историю
const LESSON_LIMIT = 100 // материалы одного урока
const DAY_LIMIT = 100 // материалы одного дня вне «горячего окна»

/** Границы «горячего окна» — считаются один раз за загрузку страницы */
const HOT = (() => {
  const today = new Date()
  return {
    from: toISODate(addDays(today, -HOT_DAYS_BACK)),
    to: toISODate(addDays(today, HOT_DAYS_AHEAD)),
  }
})()

const inHotWindow = (iso) => Boolean(iso) && iso >= HOT.from && iso <= HOT.to

/* Ключи сторов: один listen на ключ на всё приложение */
const KEY = {
  notesHot: `notes:hot:${HOT.from}:${HOT.to}`,
  linksHot: `links:hot:${HOT.from}:${HOT.to}`,
  homeworkHot: `homework:hot:${HOT.from}:${HOT.to}`,
  linksMeta: 'links:meta', // ссылки «к предмету» и общие (date == null)
  dayNotes: (date) => `notes:day:${date}`,
  dayLinks: (date) => `links:day:${date}`,
  dayHomework: (date) => `homework:day:${date}`,
  lessonNotes: (lessonKey, date) => `notes:lesson:${lessonKey}:${date}`,
  lessonLinks: (lessonKey, date) => `links:lesson:${lessonKey}:${date}`,
  lessonHomework: (lessonKey, date) => `homework:lesson:${lessonKey}:${date}`,
  attendanceWeek: (weekStart) => `attendance:week:${weekStart}`,
  attendanceHistory: (pageLimit) => `attendance:history:${pageLimit}`,
}

const ATTENDANCE_HISTORY_PREFIX = 'attendance:history:'

/* Преобразования снапшотов: трансформы модульные, чтобы подписки не
   пересоздавались на каждом рендере (см. deps в liveStore) */
const listFromSnap = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }))
const datedFromSnap = (snap) => snap.docs.map((d) => ({ date: d.id, ...d.data() }))

/* Запросы общих («горячих») сторов строятся один раз при загрузке модуля:
   одинаковый объект запроса = одно физическое подключение */
const NOTES_HOT_QUERY = db
  ? query(
    collection(db, 'notes'),
    where('date', '>=', HOT.from),
    where('date', '<=', HOT.to),
    orderBy('date', 'asc'),
    limit(HOT_LIMIT),
  )
  : null

const HOMEWORK_HOT_QUERY = db
  ? query(
    collection(db, 'homework'),
    where('date', '>=', HOT.from),
    where('date', '<=', HOT.to),
    orderBy('date', 'asc'),
    limit(HOT_LIMIT),
  )
  : null

/* Ссылки «к уроку»: у них заполнена дата (у ссылок без урока date == null) */
const LINKS_HOT_QUERY = db
  ? query(
    collection(db, 'lessonLinks'),
    where('date', '>=', HOT.from),
    where('date', '<=', HOT.to),
    orderBy('date', 'asc'),
    limit(HOT_LIMIT),
  )
  : null

/* Ссылки «к предмету» (subject != null) и общие (subject == null): у обоих
   lessonKey == null, поэтому отдельный компактный запрос без диапазона дат */
const LINKS_META_QUERY = db
  ? query(collection(db, 'lessonLinks'), where('lessonKey', '==', null), limit(HOT_LIMIT))
  : null

/** ДЗ «горячего окна»: главная (3 дня), «Дз» (7 дней), урок внутри окна */
export function useHomework() {
  return useLiveQuery(KEY.homeworkHot, HOMEWORK_HOT_QUERY, listFromSnap)
}

/** Конспекты «горячего окна» (счётчики на карточках главной) */
export function useNotes() {
  return useLiveQuery(KEY.notesHot, NOTES_HOT_QUERY, listFromSnap)
}

/** Ссылки «к уроку» «горячего окна» (карточки главной) */
export function useLessonLinks() {
  return useLiveQuery(KEY.linksHot, LINKS_HOT_QUERY, listFromSnap)
}

/** Ссылки «к предмету» и общие: страница материалов + блок ссылок урока */
export function useSubjectLinks() {
  return useLiveQuery(KEY.linksMeta, LINKS_META_QUERY, listFromSnap)
}

/* ------------------------------------------------------------------ */
/*  Материалы дня и урока: горячее окно → общий стор, иначе точечный   */
/*  TTL-кэш без постоянного подключения                                */
/* ------------------------------------------------------------------ */

/**
 * Материалы одного дня карусели { notes, links, homework }.
 * Внутри «горячего окна» — из общих сторов (никаких новых чтений),
 * вне окна (календарь на дальнюю дату) — разовый запрос по дате,
 * результат кэшируется на CACHE_TTL.
 */
export function useDayMaterials(isoDate) {
  const hotNotes = useNotes()
  const hotLinks = useLessonLinks()
  const hotHomework = useHomework()
  const cold = !inHotWindow(isoDate)

  const notesQuery = useMemo(
    () => (cold && db && isoDate
      ? query(collection(db, 'notes'), where('date', '==', isoDate), limit(DAY_LIMIT))
      : null),
    [cold, isoDate],
  )
  const linksQuery = useMemo(
    () => (cold && db && isoDate
      ? query(collection(db, 'lessonLinks'), where('date', '==', isoDate), limit(DAY_LIMIT))
      : null),
    [cold, isoDate],
  )
  const homeworkQuery = useMemo(
    () => (cold && db && isoDate
      ? query(collection(db, 'homework'), where('date', '==', isoDate), limit(DAY_LIMIT))
      : null),
    [cold, isoDate],
  )

  const coldNotes = useCachedQuery(KEY.dayNotes(isoDate), notesQuery, listFromSnap)
  const coldLinks = useCachedQuery(KEY.dayLinks(isoDate), linksQuery, listFromSnap)
  const coldHomework = useCachedQuery(KEY.dayHomework(isoDate), homeworkQuery, listFromSnap)

  return useMemo(() => {
    if (!cold) {
      return {
        notes: hotNotes.filter((n) => n.date === isoDate),
        links: hotLinks.filter((l) => l.date === isoDate),
        homework: hotHomework.filter((h) => h.date === isoDate),
      }
    }
    return { notes: coldNotes, links: coldLinks, homework: coldHomework }
  }, [cold, isoDate, hotNotes, hotLinks, hotHomework, coldNotes, coldLinks, coldHomework])
}

/**
 * Конспекты одного урока. Внутри «горячего окна» — фильтр по общему стору,
 * вне окна (старый урок) — разовый запрос по паре lessonKey + date.
 */
export function useLessonNotes(lessonKey, date) {
  const hot = useNotes()
  const cold = !inHotWindow(date)
  const lessonQuery = useMemo(
    () => (cold && db && lessonKey && date
      ? query(
        collection(db, 'notes'),
        where('lessonKey', '==', lessonKey),
        where('date', '==', date),
        limit(LESSON_LIMIT),
      )
      : null),
    [cold, lessonKey, date],
  )
  const coldNotes = useCachedQuery(KEY.lessonNotes(lessonKey, date), lessonQuery, listFromSnap)
  return useMemo(
    () => (cold
      ? coldNotes
      : hot.filter((n) => n.lessonKey === lessonKey && n.date === date)),
    [cold, hot, coldNotes, lessonKey, date],
  )
}

/** ДЗ одного урока: тот же принцип, что у конспектов */
export function useLessonHomework(lessonKey, date) {
  const hot = useHomework()
  const cold = !inHotWindow(date)
  const lessonQuery = useMemo(
    () => (cold && db && lessonKey && date
      ? query(
        collection(db, 'homework'),
        where('lessonKey', '==', lessonKey),
        where('date', '==', date),
        limit(LESSON_LIMIT),
      )
      : null),
    [cold, lessonKey, date],
  )
  const coldHomework = useCachedQuery(KEY.lessonHomework(lessonKey, date), lessonQuery, listFromSnap)
  return useMemo(
    () => (cold
      ? coldHomework
      : hot.filter((h) => h.lessonKey === lessonKey && h.date === date)),
    [cold, hot, coldHomework, lessonKey, date],
  )
}

/** Ссылки «к этому уроку»: тот же принцип, что у конспектов */
export function useLessonLinksFor(lessonKey, date) {
  const hot = useLessonLinks()
  const cold = !inHotWindow(date)
  const lessonQuery = useMemo(
    () => (cold && db && lessonKey && date
      ? query(
        collection(db, 'lessonLinks'),
        where('lessonKey', '==', lessonKey),
        where('date', '==', date),
        limit(LESSON_LIMIT),
      )
      : null),
    [cold, lessonKey, date],
  )
  const coldLinks = useCachedQuery(KEY.lessonLinks(lessonKey, date), lessonQuery, listFromSnap)
  return useMemo(
    () => (cold
      ? coldLinks
      : hot.filter((l) => l.lessonKey === lessonKey && l.date === date)),
    [cold, hot, coldLinks, lessonKey, date],
  )
}

/* ------------------------------------------------------------------ */
/*  Запись: шаблон расписания                                          */
/* ------------------------------------------------------------------ */

export async function saveTemplateMeta(template, meta) {
  await setDoc(doc(db, 'schedule', 'template'), { ...template, ...meta }, { merge: true })
  applyScheduleWrite((s) => ({ ...s, template: { ...s.template, ...template, ...meta } }))
}

export async function saveTemplateDay(dayKey, day) {
  await setDoc(
    doc(db, 'schedule', 'template'),
    { days: { [dayKey]: day } },
    { merge: true },
  )
  applyScheduleWrite((s) => ({
    ...s,
    template: {
      ...s.template,
      days: { ...s.template.days, [dayKey]: day },
    },
  }))
}

export async function importTemplateFromJson() {
  await setDoc(doc(db, 'schedule', 'template'), {
    ...templateFallback,
    importedAt: serverTimestamp(),
  })
  applyScheduleWrite((s) => ({ ...s, template: { ...templateFallback, importedAt: null } }))
}

/* ------------------------------------------------------------------ */
/*  Запись: оверрайд конкретной даты                                   */
/* ------------------------------------------------------------------ */

export async function saveDayOverride(isoDate, lessons, authorEmail) {
  await setDoc(doc(db, 'dayOverrides', isoDate), {
    date: isoDate,
    lessons,
    updatedAt: serverTimestamp(),
    updatedBy: authorEmail ?? null,
  })
  /* updatedAt серверный — локально ставим null, фоновый refresh подтянет настоящий */
  applyScheduleWrite((s) => ({
    ...s,
    overrides: { ...s.overrides, [isoDate]: { date: isoDate, lessons, updatedAt: null, updatedBy: authorEmail ?? null } },
  }))
}

export async function deleteDayOverride(isoDate) {
  await deleteDoc(doc(db, 'dayOverrides', isoDate))
  applyScheduleWrite((s) => {
    const overrides = { ...s.overrides }
    delete overrides[isoDate]
    return { ...s, overrides }
  })
}

/* ------------------------------------------------------------------ */
/*  Запись: конспекты (Storage + notes)                                */
/* ------------------------------------------------------------------ */

export async function addNote({ lessonKey, date, subject, title, url, storagePath, authorEmail }) {
  const ref = await addDoc(collection(db, 'notes'), {
    lessonKey,
    date,
    subject,
    title,
    url,
    storagePath: storagePath ?? null,
    createdAt: serverTimestamp(),
    createdBy: authorEmail ?? null,
  })
  /* Оптимистично: конспект сразу в сторах — UI не ждёт снапшота */
  const note = {
    id: ref.id,
    lessonKey,
    date,
    subject,
    title,
    url,
    storagePath: storagePath ?? null,
    createdAt: null,
    createdBy: authorEmail ?? null,
  }
  if (inHotWindow(date)) patchStore(KEY.notesHot, (list) => [...(list ?? []), note])
  patchStoreIfExists(KEY.dayNotes(date), (list) => [...(list ?? []), note])
  patchStoreIfExists(KEY.lessonNotes(lessonKey, date), (list) => [...(list ?? []), note])
}

export async function deleteNote(note) {
  await deleteDoc(doc(db, 'notes', note.id))
  const withoutNote = (list) => (list ?? []).filter((n) => n.id !== note.id)
  if (inHotWindow(note.date)) patchStore(KEY.notesHot, withoutNote)
  patchStoreIfExists(KEY.dayNotes(note.date), withoutNote)
  patchStoreIfExists(KEY.lessonNotes(note.lessonKey, note.date), withoutNote)
}

/* ------------------------------------------------------------------ */
/*  Запись: ссылки к предметам (добавляют ВСЕ пользователи)            */
/* ------------------------------------------------------------------ */

export async function addLessonLink({ subject, lessonKey, date, url, label }) {
  const ref = await addDoc(collection(db, 'lessonLinks'), {
    subject,
    // lessonKey есть только у ссылок, привязанных к конкретному уроку;
    // ссылки без lessonKey — общие для предмета
    lessonKey: lessonKey ?? null,
    // Ссылка «к уроку» — на конкретную дату, «к предмету» — без даты
    date: lessonKey ? (date ?? null) : null,
    url,
    label: label || url,
    createdAt: serverTimestamp(),
  })
  const link = {
    id: ref.id,
    subject,
    lessonKey: lessonKey ?? null,
    date: lessonKey ? (date ?? null) : null,
    url,
    label: label || url,
    createdAt: null,
  }
  /* Оптимистично: ссылка сразу в сторе — UI не ждёт снапшота */
  if (!link.lessonKey) {
    patchStore(KEY.linksMeta, (list) => [...(list ?? []), link])
    return
  }
  if (inHotWindow(link.date)) patchStore(KEY.linksHot, (list) => [...(list ?? []), link])
  patchStoreIfExists(KEY.dayLinks(link.date), (list) => [...(list ?? []), link])
  patchStoreIfExists(KEY.lessonLinks(link.lessonKey, link.date), (list) => [...(list ?? []), link])
}

/* ------------------------------------------------------------------ */
/*  Общие ссылки (могут пригодиться): без предмета и урока             */
/* ------------------------------------------------------------------ */

export async function addGeneralLink({ url, label }) {
  const ref = await addDoc(collection(db, 'lessonLinks'), {
    // subject == null отличает общую ссылку от предметной
    subject: null,
    lessonKey: null,
    date: null,
    url,
    label: label || url,
    createdAt: serverTimestamp(),
  })
  patchStore(KEY.linksMeta, (list) => [...(list ?? []), {
    id: ref.id,
    subject: null,
    lessonKey: null,
    date: null,
    url,
    label: label || url,
    createdAt: null,
  }])
}

export async function deleteLessonLink(link) {
  await deleteDoc(doc(db, 'lessonLinks', link.id))
  const withoutLink = (list) => (list ?? []).filter((l) => l.id !== link.id)
  if (!link.lessonKey) {
    patchStore(KEY.linksMeta, withoutLink)
    return
  }
  if (inHotWindow(link.date)) patchStore(KEY.linksHot, withoutLink)
  patchStoreIfExists(KEY.dayLinks(link.date), withoutLink)
  patchStoreIfExists(KEY.lessonLinks(link.lessonKey, link.date), withoutLink)
}

/* ------------------------------------------------------------------ */
/*  Запись: домашние задания (добавляют ВСЕ, удаляют староста/админ)   */
/* ------------------------------------------------------------------ */

export async function addHomework({ lessonKey, date, subject, text, authorEmail }) {
  const ref = await addDoc(collection(db, 'homework'), {
    lessonKey,
    date,
    subject,
    text,
    createdAt: serverTimestamp(),
    createdBy: authorEmail ?? null,
  })
  /* Оптимистично: задание сразу в сторах — UI не ждёт снапшота */
  const item = {
    id: ref.id,
    lessonKey,
    date,
    subject,
    text,
    createdAt: null,
    createdBy: authorEmail ?? null,
  }
  if (inHotWindow(date)) patchStore(KEY.homeworkHot, (list) => [...(list ?? []), item])
  patchStoreIfExists(KEY.dayHomework(date), (list) => [...(list ?? []), item])
  patchStoreIfExists(KEY.lessonHomework(lessonKey, date), (list) => [...(list ?? []), item])
}

export async function deleteHomework(item) {
  await deleteDoc(doc(db, 'homework', item.id))
  const withoutItem = (list) => (list ?? []).filter((h) => h.id !== item.id)
  if (inHotWindow(item.date)) patchStore(KEY.homeworkHot, withoutItem)
  patchStoreIfExists(KEY.dayHomework(item.date), withoutItem)
  patchStoreIfExists(KEY.lessonHomework(item.lessonKey, item.date), withoutItem)
}

/* ------------------------------------------------------------------ */
/*  Чтение/запись: посещаемость (только админы)                        */
/*  Документ id = 'YYYY-MM-DD', records — [{ name, status }]           */
/* ------------------------------------------------------------------ */

/** Пустой день (нет отметок) — стабильная ссылка, чтобы не дёргать рендер */
export const EMPTY_ATTENDANCE_DAY = {
  recordsByName: {},
  updatedAt: null,
  updatedBy: null,
  exists: false,
}

const EMPTY_ATTENDANCE_WEEK = {}

/**
 * Документ attendance → состояние дня.
 * records хранится массивом [{ name, status }] — имена могут содержать точки
 * (например «Иванов И.И.»), которые запрещены в ключах Firestore-карты.
 */
function attendanceDayFrom(data) {
  const recordsByName = {}
  for (const entry of data.records ?? []) {
    if (entry?.name) recordsByName[entry.name] = entry.status ?? 'present'
  }
  return {
    recordsByName,
    updatedAt: data.updatedAt ?? null,
    updatedBy: data.updatedBy ?? null,
    exists: true,
  }
}

const attendanceWeekFromSnap = (snap) => {
  const week = {}
  for (const d of snap.docs) week[d.id] = attendanceDayFrom(d.data())
  return week
}

/**
 * Отметки ВСЕЙ недели выбранной даты: один запрос на неделю (≤7 документов)
 * вместо подписки на документ при каждом переключении дня. Отсюда же берутся
 * точки «отмечено» на чипах дней недели.
 * Возвращает { 'YYYY-MM-DD': { recordsByName, updatedAt, updatedBy, exists } }.
 */
export function useAttendanceWeek(isoDate) {
  const weekStart = useMemo(() => toISODate(startOfWeek(fromISODate(isoDate))), [isoDate])
  const weekQuery = useMemo(
    () => (db
      ? query(
        collection(db, 'attendance'),
        where('date', '>=', weekStart),
        where('date', '<=', toISODate(addDays(fromISODate(weekStart), 6))),
        orderBy('date', 'asc'),
      )
      : null),
    [weekStart],
  )
  return useLiveQuery(
    KEY.attendanceWeek(weekStart),
    weekQuery,
    attendanceWeekFromSnap,
    DEFAULT_KEEP_ALIVE,
    EMPTY_ATTENDANCE_WEEK,
  )
}

/** Сколько отметок показываем в истории сразу и добавляем по кнопке */
export const ATTENDANCE_HISTORY_PAGE = 20

/**
 * История отметок: страница последних дат (по убыванию) + догрузка более
 * ранних по кнопке. Живого подключения нет намеренно: за всю историю никто
 * не следит, а дописывается она только из этой же вкладки — после сохранения
 * запись применяется локально (patchStoresByPrefix в saveAttendance).
 */
export function useAttendanceHistory(pageLimit = ATTENDANCE_HISTORY_PAGE) {
  const historyQuery = useMemo(
    () => (db
      ? query(collection(db, 'attendance'), orderBy('date', 'desc'), limit(pageLimit))
      : null),
    [pageLimit],
  )
  return useCachedQuery(KEY.attendanceHistory(pageLimit), historyQuery, datedFromSnap)
}

export async function saveAttendance(isoDate, records, authorEmail) {
  await setDoc(doc(db, 'attendance', isoDate), {
    date: isoDate,
    records,
    updatedAt: serverTimestamp(),
    updatedBy: authorEmail ?? null,
  })
  /* Оптимистично: отметки сразу в сторе недели и во всех загруженных
     «страницах» истории. updatedAt серверный — локально null, следующий
     снапшот/чтение подтянет настоящее значение */
  const weekStart = toISODate(startOfWeek(fromISODate(isoDate)))
  patchStore(KEY.attendanceWeek(weekStart), (week) => ({
    ...(week ?? {}),
    [isoDate]: {
      recordsByName: Object.fromEntries(records.map((r) => [r.name, r.status])),
      updatedAt: null,
      updatedBy: authorEmail ?? null,
      exists: true,
    },
  }))
  const entry = { date: isoDate, records, updatedAt: null, updatedBy: authorEmail ?? null }
  patchStoresByPrefix(ATTENDANCE_HISTORY_PREFIX, (list) => (
    [entry, ...(list ?? []).filter((item) => item.date !== isoDate)]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
  ))
}

/** Firestore Timestamp -> Date | null */
export const tsToDate = (ts) => (ts instanceof Timestamp ? ts.toDate() : null)
