/**
 * Скрипт настройки CORS для бакета Yandex Object Storage.
 * Запускается ЛОКАЛЬНО один раз — ключи не коммитятся и не попадают на сайт.
 *
 * Запуск (без зависимостей, нужен только Node):
 *   YA_BUCKET=имя-бакета \
 *   YA_ACCESS_KEY_ID=YCAJ... \
 *   YA_SECRET_ACCESS_KEY=YCPJ... \
 *   node scripts/set-bucket-cors.js
 *
 * Дополнительно: включите в консоли Yandex Cloud (бакет → «Общедоступный доступ»)
 * чтение объектов = PUBLIC, чтобы все могли открывать загруженные конспекты по ссылке.
 *
 * ВАЖНО: запрос подписывается вручную (SigV4), БЕЗ AWS SDK — свежие версии SDK
 * шлют заголовки/чексуммы, от которых Yandex Object Storage отвечает
 * 400 BadRequest на PutBucketCors. Ручная подпись работает.
 */
import { createHash, createHmac } from 'node:crypto'

const { YA_BUCKET, YA_ACCESS_KEY_ID, YA_SECRET_ACCESS_KEY, SITE_ORIGINS } = process.env

if (!YA_BUCKET || !YA_ACCESS_KEY_ID || !YA_SECRET_ACCESS_KEY) {
  console.error('Задайте переменные: YA_BUCKET, YA_ACCESS_KEY_ID, YA_SECRET_ACCESS_KEY')
  process.exit(1)
}

// Сайт GitHub Pages + локальная разработка; можно переопределить через SITE_ORIGINS
const origins = SITE_ORIGINS
  ? SITE_ORIGINS.split(',')
  : [
      'https://stepierk.github.io',
      'http://localhost:5173',
      'http://localhost:4173',
    ]

const REGION = 'ru-central1'
const sha256 = (data) => createHash('sha256').update(data).digest('hex')
const hmac = (key, data) => createHmac('sha256', key).update(data).digest()

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<CORSConfiguration>',
  '<CORSRule>',
  '<AllowedHeader>*</AllowedHeader>',
  '<AllowedMethod>GET</AllowedMethod>',
  '<AllowedMethod>PUT</AllowedMethod>',
  '<AllowedMethod>DELETE</AllowedMethod>',
  '<AllowedMethod>HEAD</AllowedMethod>',
  ...origins.map((o) => `<AllowedOrigin>${o}</AllowedOrigin>`),
  '<ExposeHeader>ETag</ExposeHeader>',
  '<MaxAgeSeconds>3600</MaxAgeSeconds>',
  '</CORSRule>',
  '</CORSConfiguration>',
].join('')

const payloadHash = sha256(xml)
const contentMd5 = createHash('md5').update(xml).digest('base64')

const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '')
const dateStamp = amzDate.slice(0, 8)
const host = `${YA_BUCKET}.storage.yandexcloud.net`

const canonicalHeaders =
  `content-md5:${contentMd5}\nhost:${host}\n` +
  `x-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
const signedHeaders = 'content-md5;host;x-amz-content-sha256;x-amz-date'

const canonicalRequest = [
  'PUT',
  '/',
  'cors=',
  canonicalHeaders,
  signedHeaders,
  payloadHash,
].join('\n')

const scope = `${dateStamp}/${REGION}/s3/aws4_request`
const stringToSign = [
  'AWS4-HMAC-SHA256',
  amzDate,
  scope,
  sha256(canonicalRequest),
].join('\n')

const kDate = hmac(`AWS4${YA_SECRET_ACCESS_KEY}`, dateStamp)
const signature = createHmac('sha256', hmac(hmac(hmac(kDate, REGION), 's3'), 'aws4_request'))
  .update(stringToSign).digest('hex')

const authorization =
  `AWS4-HMAC-SHA256 Credential=${YA_ACCESS_KEY_ID}/${scope}, ` +
  `SignedHeaders=${signedHeaders}, Signature=${signature}`

const res = await fetch(`https://${host}/?cors=`, {
  method: 'PUT',
  headers: {
    'content-md5': contentMd5,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    Authorization: authorization,
  },
  body: xml,
})

if (res.status === 200) {
  console.log(`CORS настроен для бакета "${YA_BUCKET}"`)
  console.log('Разрешённые origin:', origins.join(', '))
} else {
  const text = await res.text()
  console.error(`Ошибка ${res.status}:`, text.slice(0, 500))
  process.exit(1)
}
