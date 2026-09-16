/* Общие пресеты анимаций (motion) для всего приложения.
   Лёгкие spring-переходы: появление уроков, секций, страниц.
   Уважает reduced-motion через MotionConfig в main.jsx. */

export const springSoft = { type: 'spring', stiffness: 380, damping: 34 }
export const springSnappy = { type: 'spring', stiffness: 500, damping: 40 }

/* ── Пилюля активной вкладки таб-бара: «переезд» между вкладками ──
   РЕГУЛИРОВКА ДЛИТЕЛЬНОСТИ ПЕРЕМЕЩЕНИЯ — ЗДЕСЬ:

   • Spring-вариант (текущий): ощущение живого «доехал и немного пружинит».
       stiffness  — жёсткость пружины: БОЛЬШЕ = быстрее переезд.
                    250 — ленивый (~0.8 c), 350 — мягкий (~0.5 c),
                    600 — резкий (~0.25 c).
       damping    — гашение колебаний: МЕНЬШЕ = заметнее пружинит в конце,
                    БОЛЬШЕ (≥ 40) = доезжает без покачивания.
   • Если нужен точный тайминг в секундах, замените на tween:
       export const tabPillMove = { type: 'tween', duration: 0.45, ease: [0.32, 0.72, 0, 1] }
     duration — ровное время перелёта (в секундах), без пружинения. */
export const tabPillMove = { type: 'spring', stiffness: 350, damping: 32 }

/* Контейнер расписания дня: stagger-дети появляются каскадом */
export const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.04 } },
}

/* Карточка урока: мягкое появление снизу вверх.
   ВАЖНО: без opacity — анимированный opacity создаёт полупрозрачный
   композитный слой, который на iOS Safari может закоммититься
   непрокрашенным (контент не виден, кнопки работают). */
export const itemVariants = {
  hidden: { y: 22, scale: 0.985 },
  show: {
    y: 0,
    scale: 1,
    transition: springSoft,
  },
  exit: { y: -12, transition: { duration: 0.16 } },
}

/* Секция/страница: короткое появление (только transform, см. выше) */
export const fadeUp = {
  hidden: { y: 14 },
  show: { y: 0, transition: springSoft },
  exit: { y: -8, transition: { duration: 0.15 } },
}

/* Пружина доводки трека карусели после свайпа */
export const trackSettle = { type: 'spring', stiffness: 420, damping: 42, mass: 0.9 }

/* Пороги свайпа карусели */
export const SWIPE_OFFSET = 60 // px смещения — достаточно для перехода
export const SWIPE_VELOCITY = 450 // px/s — резкий флик переключает и с меньшим смещением
