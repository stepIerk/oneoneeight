import { useEffect } from 'react'

/**
 * Принудительная перерисовка (reflow + repaint) после асинхронных обновлений.
 *
 * Зачем: на iOS Safari контент, который появляется или заменяется внутри
 * анимируемого (opacity/transform от motion) контейнера в результате
 * асинхронного колбэка (Firebase auth, Firestore), иногда
 * остаётся «непрокрашенным»: DOM и layout корректны, тапы обрабатываются,
 * но paint не происходит (виден только фон/стили страницы). Симптом
 * «страница появляется только через ~15 секунд» — это первый тик
 * setInterval в HomePage: ре-рендер по таймеру заставляет WebKit
 * перерисовать слой, поэтому контент внезапно «проявляется».
 *
 * Как работает: двойной requestAnimationFrame (гарантирует, что браузер
 * уже закоммитил текущий DOM), затем:
 *   1) чтение document.body.offsetHeight — синхронный reflow;
 *   2) кратковременная мутация transform у body с рекомпозицией —
 *      одного чтения layout недостаточно: iOS перерисовывает слой только
 *      при реальном изменении стиля (иначе отдаёт устаревшую текстуру).
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
    let raf1 = 0
    let raf2 = 0
    let raf3 = 0
    const repaint = () => {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          const body = document.body
          void body.offsetHeight // чтение layout = принудительный reflow
          /* Мутация стиля = реальная рекомпозиция: слой перерастеризуется */
          body.style.transform = 'translateZ(0)'
          raf3 = requestAnimationFrame(() => {
            body.style.transform = ''
          })
        })
      })
    }
    repaint()
    /* Страховка после entrance-анимации страницы (spring ~0.5с):
       слой может закоммититься непрокрашенным именно по её завершении,
       когда данные уже не меняются и перерисовывать больше нечему */
    const delayed = setTimeout(repaint, 700)
    /* Перерисовка при возврате из фона (вкладка снова видима) */
    document.addEventListener('visibilitychange', repaint)
    return () => {
      clearTimeout(delayed)
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      cancelAnimationFrame(raf3)
      document.removeEventListener('visibilitychange', repaint)
    }
  }, [dep])
}
