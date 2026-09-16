/**
 * Общий стор «живых» данных Firestore.
 *
 * Зачем: подписки, объявленные внутри компонентов, создавались заново на
 * каждом монтировании страницы (переход по SPA = размонтирование), а одни и
 * те же документы читали несколько компонентов независимо. Firestore
 * тарифицирует каждое полученное клиентом чтение документа, поэтому лишний
 * listen — это лишние платные чтения.
 *
 * Схема:
 *   1. Данные живут в модульном хранилище по ключу запроса (`stores`).
 *   2. На уникальный ключ существует РОВНО одно физическое подключение
 *      (onSnapshot) — все компоненты делят его (refcount).
 *   3. После ухода последнего подписчика подключение живёт ещё `keepAliveMs`:
 *      переходы между страницами не рвут соединение и не запускают новый
 *      listen, а первый снапшот сразу приходит из локального кэша SDK.
 *   4. Данные из памяти отдаются подписчику мгновенно, поэтому возврат на
 *      страницу рисуется без ожидания сети.
 *   5. «Холодные» (редко нужные) данные читаются разово через useCachedQuery
 *      с TTL-кэшем — без постоянного подключения и без чтения всей истории.
 *   6. Записи применяются оптимистично через patchStore: UI обновляется сразу,
 *      не дожидаясь снапшота и не перечитывая коллекцию.
 *
 * Диагностика (dev): счётчики в `fsStats`, доступны в консоли как `__fsStats`.
 */
import { useEffect, useState } from 'react'
import { getDocs, onSnapshot } from 'firebase/firestore'

export const DEFAULT_KEEP_ALIVE = 60 * 1000 // listen живёт минуту после ухода подписчиков
export const DEFAULT_CACHE_TTL = 15 * 60 * 1000 // холодные чтения — не чаще раза в 15 минут

const EMPTY = []

/** Хранилища: ключ запроса → состояние (одно на всё приложение) */
const stores = new Map()

/** Незавершённые холодные чтения — конкурентные вызовы схлопываются */
const inflight = new Map()

/** dev-счётчики: сколько подключений и документов реально уходит в Firestore */
export const fsStats = { liveAttaches: 0, liveDetaches: 0, docsDelivered: 0, coldFetches: 0 }

if (import.meta.env.DEV && typeof window !== 'undefined') {
  /* В консоли: __fsStats.liveAttaches — сколько listen-ов пришлось создать за сессию */
  window.__fsStats = fsStats
}

function getStore(key) {
  let store = stores.get(key)
  if (!store) {
    store = {
      key,
      data: undefined,
      fetchedAt: 0,
      mode: null,
      unsubscribe: null,
      timer: null,
      refs: 0,
      listeners: new Set(),
    }
    stores.set(key, store)
  }
  return store
}

function notify(store) {
  for (const listener of store.listeners) listener()
}

/** Данные стора без подписки (модульное состояние, живёт пока открыт таб) */
export function getStoreData(key) {
  return stores.get(key)?.data
}

/**
 * Локальное применение записи (оптимистичное обновление) к стору с этим
 * ключом: UI обновляется сразу, не дожидаясь снапшота. Серверные данные
 * затем заменят локальную версию авторитетно.
 */
export function patchStore(key, updater) {
  const store = getStore(key)
  store.data = updater(store.data)
  notify(store)
}

/** То же, но только если стор уже существует (не создаёт пустой записи) */
export function patchStoreIfExists(key, updater) {
  const store = stores.get(key)
  if (!store) return
  store.data = updater(store.data)
  notify(store)
}

/** То же, но для всех сторов с указанным префиксом ключа (например все страницы истории) */
export function patchStoresByPrefix(prefix, updater) {
  for (const store of stores.values()) {
    if (!store.key.startsWith(prefix)) continue
    store.data = updater(store.data)
    notify(store)
  }
}

function attachLive(store, queryRef, transform) {
  store.mode = 'live'
  store.queryRef = queryRef
  fsStats.liveAttaches += 1
  store.unsubscribe = onSnapshot(
    queryRef,
    (snap) => {
      fsStats.docsDelivered += snap.size
      store.data = transform(snap)
      store.fetchedAt = Date.now()
      notify(store)
    },
    (err) => {
      /* Офлайн / нет прав — работаем на том, что уже есть в памяти */
      console.error(`${store.key}:`, err)
    },
  )
}

function detach(store) {
  if (store.unsubscribe) {
    store.unsubscribe()
    store.unsubscribe = null
    fsStats.liveDetaches += 1
  }
  store.mode = null
  store.queryRef = null
}

/**
 * Подключает стор к запросу, а если тот же ключ пришёл с другим запросом —
 * перепривязывается (ключ обязан включать все параметры выборки, но такая
 * проверка защищает от «залипшей» подписки на устаревший запрос).
 */
function attachIfNeeded(store, queryRef, transform) {
  if (store.mode === 'live' && store.queryRef === queryRef) return
  detach(store)
  attachLive(store, queryRef, transform)
}

function fetchCold(store, queryRef, transform, ttl) {
  /* Свежие данные из памяти — в сеть не идём вовсе */
  if (store.data !== undefined && Date.now() - store.fetchedAt < ttl) return
  if (inflight.has(store.key)) return
  fsStats.coldFetches += 1
  const request = getDocs(queryRef)
    .then((snap) => {
      fsStats.docsDelivered += snap.size
      store.data = transform(snap)
      store.fetchedAt = Date.now()
      notify(store)
    })
    .catch((err) => {
      console.error(`${store.key}:`, err)
    })
    .finally(() => { inflight.delete(store.key) })
  inflight.set(store.key, request)
}

/**
 * Подписка на живой запрос. Один физический listen на ключ, общий для всех
 * компонентов; после ухода последнего подписчика подключение держится ещё
 * `keepAliveMs` (переходы по приложению не создают новых чтений).
 *
 * @param {string} key уникальный ключ запроса (включает параметры выборки)
 * @param {import('firebase/firestore').Query|null} queryRef null — Firebase не настроен
 * @param {(snap: import('firebase/firestore').QuerySnapshot) => unknown} transform
 * @param {number} [keepAliveMs] сколько держать listen после ухода подписчиков
 * @param {unknown} [fallback] значение, пока данных нет
 */
export function useLiveQuery(key, queryRef, transform, keepAliveMs = DEFAULT_KEEP_ALIVE, fallback = EMPTY) {
  const [data, setData] = useState(() => (key ? getStoreData(key) : undefined))

  useEffect(() => {
    if (!key || !queryRef) return undefined
    const store = getStore(key)
    const listener = () => setData(store.data)
    store.listeners.add(listener)
    store.refs += 1
    if (store.timer) {
      clearTimeout(store.timer)
      store.timer = null
    }
    attachIfNeeded(store, queryRef, transform)
    listener()
    return () => {
      store.listeners.delete(listener)
      store.refs -= 1
      if (store.refs > 0) return
      store.timer = setTimeout(() => {
        store.timer = null
        if (store.refs === 0) detach(store)
      }, keepAliveMs)
    }
  }, [key, queryRef, transform, keepAliveMs])

  return data === undefined ? fallback : data
}

/**
 * Разовое чтение с TTL-кэшем: подходит для данных, которым не нужна
 * постоянная подписка (история за прошлые даты, редкие страницы).
 * Повторные обращения внутри TTL читаются из памяти, без сети.
 */
export function useCachedQuery(key, queryRef, transform, ttl = DEFAULT_CACHE_TTL, fallback = EMPTY) {
  const [data, setData] = useState(() => (key ? getStoreData(key) : undefined))

  useEffect(() => {
    if (!key || !queryRef) return undefined
    const store = getStore(key)
    const listener = () => setData(store.data)
    store.listeners.add(listener)
    fetchCold(store, queryRef, transform, ttl)
    return () => { store.listeners.delete(listener) }
  }, [key, queryRef, transform, ttl])

  return data === undefined ? fallback : data
}