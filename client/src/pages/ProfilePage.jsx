import { useState } from 'react'
import { motion } from 'motion/react'
import { listVariants, itemVariants } from '../utils/anim'
import { Link } from 'react-router-dom'
import {
  BookOpen, CalendarDays, GraduationCap, Hash, LogIn, LogOut,
  Moon, Settings2, ShieldCheck, Sun, UserRound, Users,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useScheduleData } from '../firebase/data'
import { signInAdmin, signOut } from '../firebase/auth'
import InstallHint from '../components/InstallHint.jsx'

function LoginForm({ onCollapse }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await signInAdmin(email, password)
    } catch (err) {
      console.error(err)
      setError(err.code === 'auth/invalid-credential'
        ? 'Неверный email или пароль'
        : 'Не удалось войти. Попробуйте ещё раз.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.section className="profile-card" variants={itemVariants}>
      <h2>
        <LogIn size={18} aria-hidden="true" />
        Вход
      </h2>
      <form className="admin-form" onSubmit={submit}>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
        </label>
        <label className="field">
          <span>Пароль</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="profile-actions profile-actions-top">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Вхожу…' : 'Войти'}
          </button>
          {onCollapse && (
            <button type="button" className="btn btn-ghost" onClick={onCollapse}>
              Свернуть
            </button>
          )}
        </div>
      </form>
    </motion.section>
  )
}

export default function ProfilePage() {
  const { user, isAdmin, isLeader, loading, firebaseReady } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { template } = useScheduleData()
  // Форма входа скрыта по умолчанию — раскрывается по кнопке «Вход для админа»
  const [loginOpen, setLoginOpen] = useState(false)

  const role = isAdmin ? 'Администратор' : isLeader ? 'Староста' : 'Студент'

  return (
    <motion.div className="wrap page-profile" variants={listVariants} initial="hidden" animate="show">
      <header className="page-head">
        <span className="page-head-icon" aria-hidden="true">
          <UserRound />
        </span>
        <div className="page-head-text">
          <h1>Профиль</h1>
          <p>Вход, роль и данные группы</p>
        </div>
      </header>

      

      {/* Оформление: переключатель светлой/тёмной темы */}
      <motion.section className="profile-card theme-card" variants={itemVariants}>
        <h2>
          {theme === 'dark' ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
          Оформление
        </h2>
        <div className="theme-row">
          <p className="muted">
            {theme === 'dark' ? 'Тёмная тема включена' : 'Светлая тема включена'}
          </p>
          <button
            type="button"
            className="btn btn-ghost theme-toggle"
            onClick={toggleTheme}
            aria-pressed={theme === 'dark'}
          >
            {theme === 'dark' ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
            {theme === 'dark' ? 'Светлая' : 'Тёмная'}
          </button>
        </div>
      </motion.section>

      <motion.section className="profile-card" variants={itemVariants}>
        <h2>
          <Users size={18} aria-hidden="true" />
          Моя группа
        </h2>
        <dl className="profile-facts">
          <div>
            <dt>
              <Hash size={13} aria-hidden="true" />
              Группа
            </dt>
            <dd>{template.group ?? '—'}</dd>
          </div>
          <div>
            <dt>
              <GraduationCap size={14} aria-hidden="true" />
              Курс
            </dt>
            <dd>{String(template.course ?? '').split('·').pop()?.trim() || '—'}</dd>
          </div>
          <div>
            <dt>
              <BookOpen size={13} aria-hidden="true" />
              Направление
            </dt>
            <dd>{template.title ?? '—'}</dd>
          </div>
          <div>
            <dt>
              <CalendarDays size={13} aria-hidden="true" />
              Формат
            </dt>
            <dd>Недельное расписание</dd>
          </div>
        </dl>
      </motion.section>

      {loading ? (
        <motion.div className="profile-card muted" variants={itemVariants}>Загрузка…</motion.div>
      ) : user ? (
        <>
          <motion.section className="profile-hero" variants={itemVariants}>
            <span className="profile-avatar-lg" aria-hidden="true">
              <UserRound size={26} />
            </span>
            <div className="profile-hero-text">
              <strong>{user.email}</strong>
              <span className={`role-badge${isAdmin ? ' admin' : isLeader ? ' leader' : ''}`}>
                {isAdmin && <ShieldCheck size={12} aria-hidden="true" />}
                {role}
              </span>
            </div>
          </motion.section>

          <motion.section className="profile-card" variants={itemVariants}>
            <div className="profile-actions profile-actions-top">
              {(isAdmin || isLeader) && (
                <Link className="btn btn-primary" to="/admin">
                  <Settings2 size={14} aria-hidden="true" />
                  Панель управления
                </Link>
              )}
              <button type="button" className="btn btn-ghost" onClick={() => signOut()}>
                <LogOut size={14} aria-hidden="true" />
                Выйти
              </button>
            </div>
          </motion.section>
        </>
      ) : (
        firebaseReady
          ? (loginOpen
              ? <LoginForm onCollapse={() => setLoginOpen(false)} />
              : (
                <motion.section className="profile-card" variants={itemVariants}>
                  <div className="login-collapsed">
                    <button
                      type="button"
                      className="btn btn-primary login-open-btn"
                      onClick={() => setLoginOpen(true)}
                    >
                      <LogIn size={15} aria-hidden="true" />
                      Вход для админа
                    </button>
                  </div>
                </motion.section>
              ))
          : (
            <motion.section className="profile-card" variants={itemVariants}>
              <h2>
                <LogIn size={18} aria-hidden="true" />
                Вход недоступен
              </h2>
            </motion.section>
          )
      )}

      <InstallHint />
    </motion.div>
  )
}
