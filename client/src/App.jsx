import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import HomePage from './pages/HomePage.jsx'
import TabBar from './components/TabBar.jsx'
import { fadeUp } from './utils/anim'
import { useForceRepaint } from './utils/useForceRepaint'

/* Второстепенные страницы грузим лениво: их JS не входит в стартовый бандл,
   который блокирует первый рендер главной (на медленной мобильной сети
   большой монолит = десятки секунд пустого экрана). Пока chunk едет,
   Suspense рисует пустоту внутри уже анимируемой обёртки. */
const HomeworkPage = lazy(() => import('./pages/HomeworkPage.jsx'))
const MaterialsPage = lazy(() => import('./pages/MaterialsPage.jsx'))
const ProfilePage = lazy(() => import('./pages/ProfilePage.jsx'))
const AdminPage = lazy(() => import('./pages/AdminPage.jsx'))
const LessonPage = lazy(() => import('./pages/LessonPage.jsx'))

/* На вложенных/flow-страницах (урок, админка) таб-бар прячем,
 * чтобы не мешал формам и навигации назад */
const TAB_HIDDEN_PREFIXES = ['/lesson/', '/admin']

function Shell() {
  const { pathname } = useLocation()
  const showTabs = !TAB_HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))
  /* Страница появляется внутри motion-обёртки (только transform-анимации:
     анимированный opacity на iOS Safari может закоммититься непрокрашенным
     слоем — кнопки активны, контент не виден). Форсируем перерисовку после
     каждого перехода. */
  useForceRepaint(pathname)
  /* Возврат вкладки/PWA из фона после долгого отсутствия: WebKit иногда
     оставляет слой страницы непрокрашенным (DOM живой, кнопки работают,
     контент невидим), а spring-анимация, замороженная на фоне (rAF не
     тикает), может не завершиться. Надёжный фикс — повторная навигация
     создаёт новый motion-элемент со свежим слоем, поэтому при возврате
     меняем key обёртки → AnimatePresence перемонтирует страницу.
     ВАЖНО: реагируем только на реально долгое пребывание в фоне (>= 1 c).
     Мобильные браузеры шлют спорадические visibilitychange почти сразу
     после открытия/возврата — перемонтирование по ним обрывает entrance-
     анимацию на середине и проигрывает её заново («всплывает дважды»). */
  const [returnTick, setReturnTick] = useState(0)
  const hiddenAtRef = useRef(0)
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now()
      } else if (hiddenAtRef.current && Date.now() - hiddenAtRef.current >= 1000) {
        hiddenAtRef.current = 0
        setReturnTick((t) => t + 1)
      } else {
        hiddenAtRef.current = 0
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])
  return (
    <>
      {/* Появление страницы (только entrance, без exit): AnimatePresence
          с mode="wait" на iOS Safari становится источником «двойного
          всплытия» и непрокрашенных слоёв — старая страница уходит с
          анимацией, пока новая ещё не смонтирована. Простой монтируемый
          по ключу элемент играет entrance и сразу остаётся в DOM. */}
      <motion.div
        className="page-transition"
        key={`${pathname}:${returnTick}`}
        variants={fadeUp}
        initial="hidden"
        animate="show"
      >
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/homework" element={<Suspense fallback={null}><HomeworkPage /></Suspense>} />
          <Route path="/materials" element={<Suspense fallback={null}><MaterialsPage /></Suspense>} />
          <Route path="/profile" element={<Suspense fallback={null}><ProfilePage /></Suspense>} />
          <Route path="/admin" element={<Suspense fallback={null}><AdminPage /></Suspense>} />
          <Route path="/lesson/:date/:lessonKey" element={<Suspense fallback={null}><LessonPage /></Suspense>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </motion.div>
      {showTabs && <TabBar />}
    </>
  )
}

/**
 * HashRouter, а не BrowserRouter: GitHub Pages отдаёт 404 для путей вида
 * /oneoneeight/admin (нет server-side rewrite). С hash-роутером адрес
 * админки — https://<user>.github.io/oneoneeight/#/admin
 */
function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  )
}

export default App

