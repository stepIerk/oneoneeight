import { motion } from 'motion/react'
import { CalendarRange, ClipboardCheck, Repeat2 } from 'lucide-react'
import { springSnappy } from '../utils/anim'

const TABS = [
  { id: 'template', label: 'Шаблон', Icon: Repeat2 },
  { id: 'date', label: 'Дата', Icon: CalendarRange },
  { id: 'attendance', label: 'Отметки', Icon: ClipboardCheck },
]

/**
 * Нижний таб-бар админки — тот же стеклянный стиль, что у
 * основного TabBar главной страницы (.tab-bar), но управляется
 * состоянием (кнопки вместо NavLink). Активная вкладка — motion-пилюля.
 */
function AdminTabBar({ tab, onChange }) {
  return (
    <nav className="tab-bar" aria-label="Разделы админ-панели">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={`tab-item${tab === id ? ' active' : ''}`}
          aria-current={tab === id ? 'page' : undefined}
          onClick={() => onChange(id)}
        >
          {tab === id && (
            <motion.span
              className="tab-pill"
              layoutId="admin-tab-pill"
              transition={springSnappy}
            />
          )}
          <Icon size={22} aria-hidden="true" />
          <span className="tab-label">{label}</span>
        </button>
      ))}
    </nav>
  )
}

export default AdminTabBar