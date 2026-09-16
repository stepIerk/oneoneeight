import { useEffect } from 'react'

/**
 * Принудительная перерисовка (reflow + repaint) после асинхронных обновлений.
 *
 * Зачем: на iOS Safari контент, который появляется или заменяется внутри
 * анимируемого (opacity/transform от motion) контейнера в результате
 * асинхронного колбэка (Firebase auth, Firestore), иногда
 * остаётся «непрокрашенным»: DOM и layout корректны, тапы обрабатываются,
 * но paint не происходит (виден только фон/стили страницы). После
 * перезагрузки всё нормально, потому что контент рендерится без
 * входной анимации страницы (AnimatePresence initial={false}).
 *
 * Как работает: двойной requestAnimationFrame (гарантирует, что браузер
 * уже закоммитил текущий DOM) + чтение document.body.offsetHeight —
 * синхронный принудительный reflow, после которого WebKit заново
 * растеризует слой.
 *
 * Дополнительно перерисовка выполняется при возврате вкладки/PWA из фона:
 * после возобновления WebKit иногда показывает устаревший (пустой) слой.
 *
 * @param {unknown} [dep] значение, после изменения которого нужна
 *   перерисовка (например, данные, пришедшие из Firestore);
 *   без аргумента — один раз при монтировании компонента
 */
export function useForceRepaint(dep) {
  useEffect(() => {
    let raf2 = 0
    let raf1 = 0
    const repaint = () => {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          void document.body.offsetHeight // чтение layout = принудительный reflow
        })
      })
    }
    repaint()
    /* Перерисовка при возврате из фона (вкладка снова видима) */
    document.addEventListener('visibilitychange', repaint)
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      document.removeEventListener('visibilitychange', repaint)
    }
  }, [dep])
}
