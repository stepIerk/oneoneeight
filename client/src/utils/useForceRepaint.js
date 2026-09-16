import { useEffect } from 'react'

/**
 * Принудительная перерисовка (reflow) после асинхронных обновлений.
 *
 * Зачем: на iOS Safari контент, который появляется или заменяется внутри
 * анимируемого (opacity/transform от motion) контейнера в результате
 * асинхронного колбэка (Firebase auth, Firestore), иногда
 * остаётся «непрокрашенным»: DOM и layout корректны, тапы обрабатываются,
 * но paint не происходит (виден только фон/стили страницы).
 *
 * Как работает: двойной requestAnimationFrame (гарантирует, что браузер
 * уже закоммитил текущий DOM) + чтение document.body.offsetHeight —
 * синхронный принудительный reflow. Случай возврата вкладки из фона
 * (залипший слой страницы) решается перемонтированием страницы в App.jsx.
 *
 * @param {unknown} [dep] значение, после изменения которого нужна
 *   перерисовка (например, данные, пришедшие из Firestore);
 *   без аргумента — один раз при монтировании компонента
 */
export function useForceRepaint(dep) {
  useEffect(() => {
    let raf1 = 0
    let raf2 = 0
    const repaint = () => {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          void document.body.offsetHeight // чтение layout = принудительный reflow
        })
      })
    }
    repaint()
    /* Страховка после entrance-анимации страницы (spring ~0.5с):
       слой может закоммититься непрокрашенным именно по её завершении,
       когда данные уже не меняются и перерисовывать больше нечему */
    const delayed = setTimeout(repaint, 700)
    return () => {
      clearTimeout(delayed)
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [dep])
}
