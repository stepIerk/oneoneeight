import { CalendarRange, ClipboardCheck, Megaphone, Repeat2 } from 'lucide-react'
import { announcementsEnabled } from '../config/features'

const TABS = [
  { id: 'template', label: 'Шаблон', Icon: Repeat2 },
  { id: 'date', label: 'Дата', Icon: CalendarRange },
  { id: 'attendance', label: 'Посещаемость', Icon: ClipboardCheck },
  // Вкладка объявлений отключается флагом VITE_ENABLE_ANNOUNCEMENTS
  { id: 'announcements', label: 'Объявления', Icon: Megaphone, flag: announcementsEnabled },
].filter((t) => t.flag !== false)

/**
 * Нижний таб-бар админки — тот же стеклянный стиль, что у
 * основного TabBar главной страницы (.tab-bar), но управляется
 * состоянием (кнопки вместо NavLink).
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
          <Icon size={22} aria-hidden="true" />
          <span className="tab-label">{label}</span>
        </button>
      ))}
    </nav>
  )
}

export default AdminTabBar