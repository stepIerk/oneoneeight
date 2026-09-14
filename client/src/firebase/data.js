import { useEffect, useState } from 'react'
import { doc, onSnapshot, collection, addDoc, deleteDoc, setDoc,
  getDoc, getDocs,
  serverTimestamp, Timestamp,
} from 'firebase/firestore'
import { db } from './config'
import { announcementsEnabled } from '../config/features'
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
 * «Живые» данные (ДЗ, конспекты, ссылки, объявления) по-прежнему через
 * onSnapshot — см. useCollection ниже.
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
/*  Универсальная подписка на коллекцию с сортировкой на клиенте       */
/* ------------------------------------------------------------------ */

function useCollection(name) {
  const [items, setItems] = useState([])
  useEffect(() => {
    /* name == null — коллекция отключена фича-флагом, не слушаем */
    if (!db || !name) return undefined
    return onSnapshot(
      collection(db, name),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        list.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
        setItems(list)
      },
      (err) => console.error(`${name}:`, err),
    )
  }, [name])
  return items
}

export const useNotes = () => useCollection('notes')
export const useLessonLinks = () => useCollection('lessonLinks')
/* Объявления отключаются флагом VITE_ENABLE_ANNOUNCEMENTS (см. config/features.js) */
export const useAnnouncements = () => useCollection(announcementsEnabled ? 'announcements' : null)
export const useHomework = () => useCollection('homework')

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
  await addDoc(collection(db, 'notes'), {
    lessonKey,
    date,
    subject,
    title,
    url,
    storagePath: storagePath ?? null,
    createdAt: serverTimestamp(),
    createdBy: authorEmail ?? null,
  })
}

export async function deleteNote(note) {
  await deleteDoc(doc(db, 'notes', note.id))
}

/* ------------------------------------------------------------------ */
/*  Запись: ссылки к предметам (добавляют ВСЕ пользователи)            */
/* ------------------------------------------------------------------ */

export async function addLessonLink({ subject, lessonKey, date, url, label }) {
  await addDoc(collection(db, 'lessonLinks'), {
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
}

/* ------------------------------------------------------------------ */
/*  Общие ссылки (могут пригодиться): без предмета и урока             */
/* ------------------------------------------------------------------ */

export async function addGeneralLink({ url, label }) {
  await addDoc(collection(db, 'lessonLinks'), {
    // subject == null отличает общую ссылку от предметной
    subject: null,
    lessonKey: null,
    date: null,
    url,
    label: label || url,
    createdAt: serverTimestamp(),
  })
}

export async function deleteLessonLink(link) {
  await deleteDoc(doc(db, 'lessonLinks', link.id))
}

/* ------------------------------------------------------------------ */
/*  Запись: домашние задания (добавляют ВСЕ, удаляют староста/админ)   */
/* ------------------------------------------------------------------ */

export async function addHomework({ lessonKey, date, subject, text, authorEmail }) {
  await addDoc(collection(db, 'homework'), {
    lessonKey,
    date,
    subject,
    text,
    createdAt: serverTimestamp(),
    createdBy: authorEmail ?? null,
  })
}

export async function deleteHomework(item) {
  await deleteDoc(doc(db, 'homework', item.id))
}

/* ------------------------------------------------------------------ */
/*  Запись: объявления                                                 */
/* ------------------------------------------------------------------ */

export async function addAnnouncement({ title, body, authorEmail }) {
  await addDoc(collection(db, 'announcements'), {
    title,
    body,
    createdAt: serverTimestamp(),
    createdBy: authorEmail ?? null,
  })
}

export async function deleteAnnouncement(item) {
  await deleteDoc(doc(db, 'announcements', item.id))
}

/* ------------------------------------------------------------------ */
/*  Запись: посещаемость (документ id = 'YYYY-MM-DD')                  */
/* ------------------------------------------------------------------ */

/**
 * Подписывается на attendance/{isoDate}.
 * records хранится массивом [{ name, status }] — имена могут содержать
 * точки (например «Иванов И.И.»), которые запрещены в ключах Firestore-карты.
 * Возвращает recordsByName: { 'Иванов Иван': 'present' | 'absent' | 'sick' }.
 */
export function useAttendance(isoDate) {
  const [state, setState] = useState({
    recordsByName: {},
    updatedAt: null,
    updatedBy: null,
    exists: false,
  })

  useEffect(() => {
    if (!db) return undefined
    return onSnapshot(
      doc(db, 'attendance', isoDate),
      (snap) => {
        if (!snap.exists()) {
          setState({ recordsByName: {}, updatedAt: null, updatedBy: null, exists: false })
          return
        }
        const data = snap.data()
        const recordsByName = {}
        for (const entry of data.records ?? []) {
          if (entry?.name) recordsByName[entry.name] = entry.status ?? 'present'
        }
        setState({
          recordsByName,
          updatedAt: data.updatedAt ?? null,
          updatedBy: data.updatedBy ?? null,
          exists: true,
        })
      },
      (err) => console.error('attendance:', err),
    )
  }, [isoDate])

  return state
}

/* ------------------------------------------------------------------ */
/*  Чтение: вся история посещаемости (только для админов)              */
/* ------------------------------------------------------------------ */

/**
 * Подписывается на коллекцию attendance целиком.
 * Возвращает список отмеченных дат: [{ date, records, updatedAt, updatedBy }],
 * отсортированный от свежих к старым.
 */
export function useAttendanceHistory() {
  const [items, setItems] = useState([])

  useEffect(() => {
    if (!db) return undefined
    return onSnapshot(
      collection(db, 'attendance'),
      (snap) => {
        const list = snap.docs.map((d) => ({ date: d.id, ...d.data() }))
        list.sort((a, b) => (a.date < b.date ? 1 : -1))
        setItems(list)
      },
      (err) => console.error('attendance history:', err),
    )
  }, [])

  return items
}

export async function saveAttendance(isoDate, records, authorEmail) {
  await setDoc(doc(db, 'attendance', isoDate), {
    date: isoDate,
    records,
    updatedAt: serverTimestamp(),
    updatedBy: authorEmail ?? null,
  })
}

/** Firestore Timestamp -> Date | null */
export const tsToDate = (ts) => (ts instanceof Timestamp ? ts.toDate() : null)
