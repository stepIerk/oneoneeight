/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { firebaseReady, auth } from '../firebase/config'
import { checkAdmin, checkLeader, onAuthStateChanged } from '../firebase/auth'

const AuthContext = createContext({ user: null, isAdmin: false, isLeader: false, loading: true })

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isLeader, setIsLeader] = useState(false)
  // Без firebase-конфига загрузки нет — сразу «не ждём»
  const [loading, setLoading] = useState(firebaseReady)

  useEffect(() => {
    if (!firebaseReady) return undefined
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      setIsAdmin(u ? await checkAdmin(u) : false)
      setIsLeader(u ? await checkLeader(u) : false)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  const value = useMemo(
    () => ({ user, isAdmin, isLeader, loading, firebaseReady }),
    [user, isAdmin, isLeader, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
