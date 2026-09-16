/* Выбранный день расписания, запомненный в URL: '/?d=YYYY-MM-DD'.
   Зачем: при переходе на страницу урока расписание размонтируется (Routes
   подменяет страницу), поэтому его состояние (selectedDate) теряется, и
   возврат «К расписанию» открывал сегодняшний день вместо того, в котором
   был открыт урок. День в URL решает это и для возврата из урока, и для
   перезагрузки/PWA. Модуль без импортов намеренно — чистые функции. */

export const DAY_PARAM = 'd'

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

/** Дата в формате 'YYYY-MM-DD' (иначе false) */
export function isDayISO(value) {
  return typeof value === 'string' && ISO_RE.test(value)
}

/**
 * День из query-строки страницы расписания.
 * @param {URLSearchParams|null} searchParams
 * @returns {string|null} 'YYYY-MM-DD' или null, если параметра нет/он битый
 */
export function readDayParam(searchParams) {
  const value = searchParams?.get?.(DAY_PARAM)
  return isDayISO(value) ? value : null
}

/**
 * Ссылка на расписание конкретного дня. Без валидной даты — просто '/'.
 * @param {string|null|undefined} iso
 * @returns {string}
 */
export function dayLink(iso) {
  return isDayISO(iso) ? `/?${DAY_PARAM}=${iso}` : '/'
}

/**
 * Копия search-параметров с проставленным днём — для setSearchParams.
 * Остальные параметры сохраняются, повторного добавления ключа нет.
 * @param {URLSearchParams|null|undefined} searchParams
 * @param {string|null|undefined} iso
 * @returns {URLSearchParams}
 */
export function withDayParam(searchParams, iso) {
  const next = new URLSearchParams(searchParams ?? undefined)
  if (isDayISO(iso)) next.set(DAY_PARAM, iso)
  else next.delete(DAY_PARAM)
  return next
}
