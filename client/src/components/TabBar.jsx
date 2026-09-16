import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'motion/react'
import { CalendarDays, BookOpenText, NotebookPen, UserRound } from 'lucide-react'
import { tabPillMove } from '../utils/anim'

const TABS = [
  { to: '/', label: 'Расписание', Icon: CalendarDays, end: true },
  { to: '/homework', label: 'Дз', Icon: NotebookPen, end: false },
  { to: '/materials', label: 'Материалы', Icon: BookOpenText, end: false },
  { to: '/profile', label: 'Профиль', Icon: UserRound, end: false },
]

/**
 * Нижний стеклянный таб-бар в стиле iOS: фиксирован внизу, отодвинут
 * от safe-area (home-индикатор), иконка + подпись. Активная вкладка —
 * motion-пилюля (layoutId): фон плавно перелетает между вкладками.
 */
function TabBar() {
  const { pathname } = useLocation()
  const activeTo = pathname.startsWith('/homework')
    ? '/homework'
    : pathname.startsWith('/materials')
      ? '/materials'
      : pathname.startsWith('/profile')
        ? '/profile'
        : '/'
  return (
    <nav className="tab-bar" aria-label="Основные разделы">
      {TABS.map(({ to, label, Icon, end }) => {
        const active = to === activeTo
        return (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={`tab-item${active ? ' active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            {active && (
              <motion.span
                className="tab-pill"
                layoutId="tab-pill"
                transition={tabPillMove}
              />
            )}
            <Icon size={22} aria-hidden="true" />
            <span className="tab-label">{label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}

export default TabBar
