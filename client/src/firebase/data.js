import { useEffect, useState } from 'react'
import { doc, onSnapshot, collection, addDoc, deleteDoc, setDoc,
  serverTimestamp, Timestamp,
} from 'firebase/firestore'
import { db } from './config'
import { announcementsEnabled } from '../config/features'
import templateFallback from '../data/schedule.json'

/* ------------------------------------------------------------------ */
/*  Чтение: шаблон недели + оверрайды дат (подписка в реальном времени) */
/* ------------------------------------------------------------------ */

/**
 * Подписывается на schedule/template и коллекцию dayOverrides.
 * Пока Firebase не настроен (или шаблон ещё не импортирован) —
 * возвращает локальный schedule.json как fallback.
 */
export function useScheduleData() {
  const [template, setTemplate] = useState(templateFallback)
  const [overrides, setOverrides] = useState({})
  const [isFallback, setIsFallback] = useState(true)

  useEffect(() => {
    if (!db) return undefined

    const unsubTemplate = onSnapshot(
      doc(db, 'schedule', 'template'),
      (snap) => {
        if (snap.exists()) {
          setTemplate(snap.data())
          setIsFallback(false)
        }
      },
      (err) => console.error('schedule/template:', err),
    )

    const unsubOverrides = onSnapshot(
      collection(db, 'dayOverrides'),
      (snap) => {
        const map = {}
        snap.forEach((d) => { map[d.id] = d.data() })
        setOverrides(map)
      },
      (err) => console.error('dayOverrides:', err),
    )

    return () => { unsubTemplate(); unsubOverrides() }
  }, [])

  return { template, overrides, isFallback }
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
}

export async function saveTemplateDay(dayKey, day) {
  await setDoc(
    doc(db, 'schedule', 'template'),
    { days: { [dayKey]: day } },
    { merge: true },
  )
}

export async function importTemplateFromJson() {
  await setDoc(doc(db, 'schedule', 'template'), {
    ...templateFallback,
    importedAt: serverTimestamp(),
  })
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
}

export async function deleteDayOverride(isoDate) {
  await deleteDoc(doc(db, 'dayOverrides', isoDate))
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
