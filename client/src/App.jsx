import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { lazy, Suspense, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
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
  /* Страница появляется внутри motion-обёртки (opacity/transform): на iOS
     Safari новый слой может закоммититься непрокрашенным (кнопки активны,
     контент не виден). Форсируем перерисовку после каждого перехода. */
  useForceRepaint(pathname)
  /* Возврат вкладки/PWA из фона: WebKit иногда оставляет слой страницы
     непрокрашенным (DOM живой, кнопки работают, контент невидим), а spring-
     анимация, замороженная на фоне (rAF не тикает), может не завершиться.
     Надёжный фикс — тот же, что и ручной: повторная навигация создаёт новый
     motion-элемент со свежим слоем. Поэтому при возврате видимости меняем
     key обёртки → AnimatePresence перемонтирует страницу, и она гарантированно
     отрисовывается заново (entrance-анимация проигрывается повторно). */
  const [returnTick, setReturnTick] = useState(0)
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) setReturnTick((t) => t + 1)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])
  return (
    <>
      {/* Плавный переход между страницами: уходит старая, приходит новая */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          className="page-transition"
          key={`${pathname}:${returnTick}`}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          exit="exit"
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
      </AnimatePresence>
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

