import { NavLink } from 'react-router-dom'
import { CalendarDays, BookOpenText, UserRound } from 'lucide-react'

const TABS = [
  { to: '/', label: 'Расписание', Icon: CalendarDays, end: true },
  { to: '/materials', label: 'Материалы', Icon: BookOpenText, end: false },
  { to: '/profile', label: 'Профиль', Icon: UserRound, end: false },
]

/**
 * Нижний стеклянный таб-бар в стиле iOS: фиксирован внизу, отодвинут
 * от safe-area (home-индикатор), иконка + подпись.
 */
function TabBar() {
  return (
    <nav className="tab-bar" aria-label="Основные разделы">
      {TABS.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => `tab-item${isActive ? ' active' : ''}`}
        >
          <Icon size={22} aria-hidden="true" />
          <span className="tab-label">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

export default TabBar
