import { CalendarRange, ClipboardCheck, Repeat2 } from 'lucide-react'

const TABS = [
  { id: 'template', label: 'Шаблон', Icon: Repeat2 },
  { id: 'date', label: 'Дата', Icon: CalendarRange },
  { id: 'attendance', label: 'Отметки', Icon: ClipboardCheck },
]

/**
 * Нижний таб-бар админки — тот же стеклянный стиль, что у
 * основного TabBar главной страницы (.tab-bar), но управляется
 * состоянием (кнопки вместо NavLink).
 *
 * БЕЗ motion-пилюли (layoutId): это часть админки, где анимации убраны
 * полностью (обход бага перерисовки iOS Safari). Активная вкладка
 * подсвечивается обычным CSS-фоном (.admin-tab-bar в motion.css).
 */
function AdminTabBar({ tab, onChange }) {
  return (
    <nav className="tab-bar admin-tab-bar" aria-label="Разделы админ-панели">
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