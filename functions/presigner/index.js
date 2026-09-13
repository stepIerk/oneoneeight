/**
 * Yandex Cloud Function: генератор pre-signed URL для Yandex Object Storage.
 *
 * Статические ключи Object Storage хранятся в переменных окружения ФУНКЦИИ
 * (YA_ACCESS_KEY_ID, YA_SECRET_ACCESS_KEY) и никогда не попадают на сайт.
 *
 * API (POST, JSON):
 *   { action: 'put', fileName, contentType }              → { url, key, publicUrl }
 *     — публичный pre-signed PUT на 10 минут (все пользователи).
 *
 *   { action: 'delete', key, idToken }                    → { url }
 *     — pre-signed DELETE только для старосты (leaders/{uid})
 *       или админа (admins/{uid}). ID-токен Firebase проверяется.
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
}

const PRESIGN_TTL = 600 // 10 минут
const MAX_KEY_LEN = 300

const response = (statusCode, payload) => ({
  statusCode,
  headers: CORS_HEADERS,
  body: JSON.stringify(payload),
})

let s3 = null

function getS3() {
  if (s3) return s3
  const { YA_ACCESS_KEY_ID, YA_SECRET_ACCESS_KEY } = process.env
  if (!YA_ACCESS_KEY_ID || !YA_SECRET_ACCESS_KEY) {
    throw new Error('S3 credentials не настроены (env функции)')
  }
  s3 = new S3Client({
    region: 'ru-central1',
    endpoint: 'https://storage.yandexcloud.net',
    credentials: {
      accessKeyId: YA_ACCESS_KEY_ID,
      secretAccessKey: YA_SECRET_ACCESS_KEY,
    },
    // S3-совместимый провайдер: без этих опций SDK может добавить
    // x-amz-checksum-*/параметры в подписанный URL, от которых Yandex
    // Object Storage отвечает 400.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
  return s3
}

/** Имя файла → безопасное имя объекта (сохраняем расширение и кириллицу) */
const safeFileName = (name) => {
  const cleaned = String(name ?? 'file')
    .replace(/[^\w.\-А-Яа-яЁё ]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return (cleaned || 'file').slice(-120)
}

const publicUrlOf = (key) =>
  `https://storage.yandexcloud.net/${process.env.YA_BUCKET}/${key}`

/** Проверка Firebase ID-токена через Identity Toolkit (Web API key — публичный) */
async function verifyIdToken(idToken) {
  if (!idToken || !process.env.FIREBASE_API_KEY) return null
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      },
    )
    if (!res.ok) return null
    const data = await res.json()
    const user = data.users?.[0]
    return user?.localId ? { uid: user.localId, email: user.email ?? null } : null
  } catch (err) {
    console.error('verifyIdToken:', err)
    return null
  }
}

/**
 * Проверка роли через Firestore REST с токеном самого пользователя:
 * правила запрещают читать чужие admins/{uid} и leaders/{uid}, но свой — можно.
 */
async function hasRole(idToken, uid, role) {
  const url =
    `https://firestore.googleapis.com/v1/projects/${process.env.FIREBASE_PROJECT_ID}` +
    `/databases/(default)/documents/${role}/${uid}`
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } })
    return res.ok
  } catch (err) {
    console.error(`hasRole(${role}):`, err)
    return false
  }
}

/* ------------------------ Yandex Cloud Functions handler ------------------------ */

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return response(405, { error: 'Метод не поддерживается' })
  }

  let body
  try {
    body = JSON.parse(event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body)
  } catch {
    return response(400, { error: 'Некорректный JSON' })
  }

  const bucket = process.env.YA_BUCKET
  if (!bucket) return response(500, { error: 'YA_BUCKET не настроен' })

  try {
    /* ------------------------- pre-signed PUT (публичный) ------------------------- */
    if (body.action === 'put') {
      const fileName = safeFileName(body.fileName)
      const key = `notes/${Date.now()}-${fileName}`
      if (key.length > MAX_KEY_LEN) return response(400, { error: 'Слишком длинное имя файла' })

      const contentType = String(body.contentType || 'application/octet-stream').slice(0, 100)
      const url = await getSignedUrl(
        getS3(),
        new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
        { expiresIn: PRESIGN_TTL },
      )
      return response(200, { url, key, publicUrl: publicUrlOf(key) })
    }

    /* -------------------- pre-signed DELETE (староста / админ) -------------------- */
    if (body.action === 'delete') {
      const identity = await verifyIdToken(body.idToken)
      if (!identity) return response(401, { error: 'Требуется вход' })

      const allowed =
        (await hasRole(body.idToken, identity.uid, 'leaders')) ||
        (await hasRole(body.idToken, identity.uid, 'admins'))
      if (!allowed) return response(403, { error: 'Удаление доступно только старосте' })

      const key = String(body.key || '')
      if (!key.startsWith('notes/') || key.includes('..') || key.length > MAX_KEY_LEN) {
        return response(400, { error: 'Некорректный путь объекта' })
      }

      const url = await getSignedUrl(
        getS3(),
        new DeleteObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: PRESIGN_TTL },
      )
      return response(200, { url })
    }

    return response(400, { error: 'Неизвестное действие' })
  } catch (err) {
    console.error('handler:', err)
    return response(500, { error: err.message || 'Внутренняя ошибка' })
  }
}

