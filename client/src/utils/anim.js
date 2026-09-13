/* Общие пресеты анимаций (motion) для всего приложения.
   Лёгкие spring-переходы: появление уроков, секций, страниц.
   Уважает reduced-motion через MotionConfig в main.jsx. */

export const springSoft = { type: 'spring', stiffness: 380, damping: 34 }
export const springSnappy = { type: 'spring', stiffness: 500, damping: 40 }

/* Контейнер расписания дня: stagger-дети появляются каскадом */
export const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.04 } },
}

/* Карточка урока: мягкое появление снизу вверх */
export const itemVariants = {
  hidden: { opacity: 0, y: 22, scale: 0.985 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: springSoft,
  },
  exit: { opacity: 0, y: -12, transition: { duration: 0.16 } },
}

/* Секция/страница: короткое появление */
export const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: springSoft },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
}

/* Пружина доводки трека карусели после свайпа */
export const trackSettle = { type: 'spring', stiffness: 420, damping: 42, mass: 0.9 }

/* Пороги свайпа карусели */
export const SWIPE_OFFSET = 60 // px смещения — достаточно для перехода
export const SWIPE_VELOCITY = 450 // px/s — резкий флик переключает и с меньшим смещением
