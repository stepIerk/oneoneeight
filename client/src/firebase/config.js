import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
} from 'firebase/firestore'

// ⬇️⬇️⬇️  ВСТАВЬТЕ СЮДА firebaseConfig  ⬇️⬇️⬇️
// Firebase Console → Project settings (шестерёнка) → General →
// Your apps → Web app → SDK setup and configuration → Config
const firebaseConfig = {
  apiKey: "AIzaSyAWHvrU8QUIgwEfKGH5CkWxIVvmbrfauis",
  authDomain: "oneoneeight-4c24d.firebaseapp.com",
  projectId: "oneoneeight-4c24d",
  storageBucket: "oneoneeight-4c24d.firebasestorage.app",
  messagingSenderId: "1058095714678",
  appId: "1:1058095714678:web:0d74472ee7a1615f80ea57"
};
// ⬆️⬆️⬆️  конец блока вставки  ⬆️⬆️⬆️

// Пока конфиг не вставлен — приложение работает на локальном schedule.json
// (fallback-режим), не падая на попытках обратиться к Firebase.
export const firebaseReady = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)

let app = null
let auth = null
let db = null

if (firebaseReady) {
  app = initializeApp(firebaseConfig)
  auth = getAuth(app)
  /* Персистентный кэш (IndexedDB) вместо дефолтного in-memory:
     - без интернета (и после перезагрузки страницы) данные Firestore
       рендерятся из локального кэша, потом тихо обновляются с сервера;
     - несколько вкладок разделяют один кэш (persistentMultipleTabManager);
     - при недоступности IndexedDB (приватный режим, квота) SDK сам
       откатывается на memory-cache — приложение не падает. */
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  })
}

/* firebase/storage НЕ подключаем: вложения (конспекты) загружаются напрямую
   в Yandex Object Storage через pre-signed URL (см. yandexStorage.js),
   а SDK Storage весит заметно больше 100 КБ и попал бы в стартовый бандл
   впустую — первый рендер на медленной мобильной сети из-за этого
   задерживался на долгие секунды. */

export { app, auth, db }
