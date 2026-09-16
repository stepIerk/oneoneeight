import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import HomePage from './pages/HomePage.jsx'
import HomeworkPage from './pages/HomeworkPage.jsx'
import MaterialsPage from './pages/MaterialsPage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import LessonPage from './pages/LessonPage.jsx'
import TabBar from './components/TabBar.jsx'
import { fadeUp } from './utils/anim'
import { useForceRepaint } from './utils/useForceRepaint'

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
  return (
    <>
      {/* Плавный переход между страницами: уходит старая, приходит новая */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          className="page-transition"
          key={pathname}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          exit="exit"
        >
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/homework" element={<HomeworkPage />} />
            <Route path="/materials" element={<MaterialsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/lesson/:date/:lessonKey" element={<LessonPage />} />
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

