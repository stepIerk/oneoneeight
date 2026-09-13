/**
 * Клиент для Yandex Object Storage через pre-signed URL.
 * Ключи хранятся в Yandex Cloud Function (VITE_PRESIGNER_URL — её публичный адрес),
 * на сайт попадают только временные ссылки.
 */
const PRESIGNER_URL = String(import.meta.env.VITE_PRESIGNER_URL ?? '').replace(/\/+$/, '')

export const yandexReady = Boolean(PRESIGNER_URL)

export const MAX_NOTE_SIZE = 25 * 1024 * 1024 // 25 МБ

async function callPresigner(payload) {
  const res = await fetch(`${PRESIGNER_URL}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Служба хранилища недоступна')
  return data
}

/**
 * Загружает файл в Yandex Object Storage: берёт pre-signed PUT URL у функции
 * и заливает файл напрямую в бакет (мимо функции).
 * Возвращает { key, publicUrl }.
 */
export async function uploadToYandex(file) {
  if (!yandexReady) throw new Error('Хранилище не настроено (VITE_PRESIGNER_URL)')
  const contentType = file.type || 'application/octet-stream'
  const { url, key, publicUrl } = await callPresigner({
    action: 'put',
    fileName: file.name,
    contentType,
  })
  const upload = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  })
  if (!upload.ok) throw new Error('Не удалось загрузить файл в хранилище')
  return { key, publicUrl }
}

/**
 * Удаляет файл из Yandex Object Storage. Доступно только старосте/админу —
 * функцию вызывает с Firebase ID-токеном, она проверяет роль и выдаёт
 * pre-signed DELETE URL.
 */
export async function deleteFromYandex(storagePath, idToken) {
  const { url } = await callPresigner({ action: 'delete', key: storagePath, idToken })
  const del = await fetch(url, { method: 'DELETE' })
  if (!del.ok) throw new Error('Не удалось удалить файл из хранилища')
}
