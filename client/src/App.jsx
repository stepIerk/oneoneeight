import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import HomePage from './pages/HomePage.jsx'
import MaterialsPage from './pages/MaterialsPage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import LessonPage from './pages/LessonPage.jsx'
import TabBar from './components/TabBar.jsx'

/* На вложенных/flow-страницах (урок, админка) таб-бар прячем,
 * чтобы не мешал формам и навигации назад */
const TAB_HIDDEN_PREFIXES = ['/lesson/', '/admin']

function Shell() {
  const { pathname } = useLocation()
  const showTabs = !TAB_HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))
  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/materials" element={<MaterialsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/lesson/:date/:lessonKey" element={<LessonPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
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

