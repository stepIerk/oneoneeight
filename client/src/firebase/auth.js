import { signInWithEmailAndPassword, signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from './config'

/**
 * Админ: документ admins/{uid} в Firestore (создаётся вручную в Firebase Console).
 * Староста: документ leaders/{uid} — удалять конспекты.
 */
export async function checkAdmin(user) {
  if (!user || !db) return false
  try {
    const snap = await getDoc(doc(db, 'admins', user.uid))
    return snap.exists()
  } catch (err) {
    console.error('checkAdmin failed:', err)
    return false
  }
}

export async function checkLeader(user) {
  if (!user || !db) return false
  try {
    const snap = await getDoc(doc(db, 'leaders', user.uid))
    return snap.exists()
  } catch (err) {
    console.error('checkLeader failed:', err)
    return false
  }
}

export async function signInAdmin(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password)
  return { user: cred.user, isAdmin: await checkAdmin(cred.user) }
}

/**
 * Обёртка выхода: SDK-функция signOut(auth) требует аргументом
 * инстанс Auth — без него падает «Cannot read properties of
 * undefined (reading 'signOut')». Кнопки в UI вызывают signOut()
 * без аргументов, поэтому передаём auth здесь.
 * Без настроенного Firebase просто ничего не делает.
 */
export async function signOut() {
  if (!auth) return
  await firebaseSignOut(auth)
}

export { onAuthStateChanged }
