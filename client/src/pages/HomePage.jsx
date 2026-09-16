import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { animate, motion, useMotionValue } from 'motion/react'
import { CalendarDays } from 'lucide-react'
import LessonCard from '../components/LessonCard.jsx'
import CalendarPopup from '../components/CalendarPopup.jsx'
import { fadeUp, listVariants, springSoft, trackSettle, SWIPE_OFFSET, SWIPE_VELOCITY } from '../utils/anim'
import { useDaysMaterials, useScheduleData } from '../firebase/data'
import { EMPTY_MATERIALS, indexDayMaterials } from '../utils/materials'
import { useForceRepaint } from '../utils/useForceRepaint'
import {
  getDaySchedule, lessonKey, computeStatuses, dayMeta, toMinutes,
} from '../utils/scheduleModel'
import {
  toISODate, fromISODate, addDays, startOfWeek,
  formatRuDate, isToday, weekdayKeyOf, DAY_LABELS,
} from '../utils/dates'
import { readDayParam, withDayParam } from '../utils/dayParam'

/**
 * Контент одного дня. Анимируется через родителя (варианты fadeUp/listVariants):
 * заголовок и карточки появляются каскадом. Side-панели (вчера/завтра) статичны.
 * `materials` — материалы этого дня, которые приходят из `useDaysMaterials`
 * родительской страницы (см. комментарий там про перерисовку на iOS).
 */
function DayPane({ iso, side, intro, template, overrides, materials = EMPTY_MATERIALS, nowMinutes, today }) {
  const dayMaterials = useMemo(
    () => indexDayMaterials(materials.notes, materials.links, materials.homework),
    [materials],
  )

  const day = useMemo(
    () => getDaySchedule(template, overrides, iso),
    [template, overrides, iso],
  )

  const statuses = useMemo(
    () => (iso === today ? computeStatuses(day.lessons ?? [], nowMinutes) : {}),
    [day, iso, today, nowMinutes],
  )

  return (
    <section
      className={`day-pane${side ? ` ${side}` : ' current'}`}
      aria-hidden={side ? true : undefined}
    >
      <motion.div
        className="day-head"
        variants={side || !intro ? undefined : fadeUp}
        initial={side || !intro ? false : 'hidden'}
        animate="show"
        key={side ? `side-${iso}` : `day-${iso}`}
      >
        <h2 className="day-title">
          {day.title}
          <span className="day-date"> · {formatRuDate(iso)}</span>
          {isToday(iso) && <span className="today-chip">сегодня</span>}
          {day.isOverride && (
            <span className="override-chip" title="Расписание на эту дату изменено админом">
              изменено
            </span>
          )}
        </h2>
        <div className="day-meta">{dayMeta(day)}</div>
      </motion.div>

      <motion.div
        className="schedule"
        variants={side || !intro ? undefined : listVariants}
        initial={side || !intro ? false : 'hidden'}
        animate="show"
        key={side ? `side-list-${iso}` : `day-list-${iso}`}
      >
        {day.lessons.length === 0 && (
          <article className="lesson">
            <div className="time">
              <div className="time-main">—</div>
              <div className="time-num">весь день</div>
            </div>
            <div className="card empty">Занятий нет</div>
          </article>
        )}

        {day.lessons.map((lesson) => {
          const status = statuses[lessonKey(lesson)]
          let progress
          if (status === 'now') {
            const start = toMinutes(lesson.start)
            const end = toMinutes(lesson.end)
            progress = (nowMinutes - start) / (end - start)
          }
          return (
            <LessonCard
              key={lessonKey(lesson)}
              lesson={lesson}
              date={iso}
              status={status}
              progress={progress}
              materials={dayMaterials}
              animated={!side && intro}
            />
          )
        })}
      </motion.div>
    </section>
  )
}

function HomePage() {
  const { template, overrides } = useScheduleData()
  const [searchParams, setSearchParams] = useSearchParams()

  /* День из URL (?d=YYYY-MM-DD) или сегодняшний, если параметра нет.
     Нужен для возврата «К расписанию» из урока: страница расписания при
     переходе перемонтируется и своё состояние теряет — день помнит только URL */
  const initialDay = readDayParam(searchParams) ?? toISODate(new Date())

  // Выбранная дата — основа навигации (и по дням, и по неделям)
  const [selectedDate, setSelectedDate] = useState(initialDay)
  // Дата, подсвеченная в точках недели: обновляется СРАЗУ в момент жеста
  // (goPage/pickDate), а не по завершении доводки трека, — фиолетовая пилюля
  // и числа недели реагируют мгновенно, без «опоздания» за анимацией
  const [dotDate, setDotDate] = useState(initialDay)
  const [now, setNow] = useState(() => new Date())

  const selectedDateRef = useRef(selectedDate)
  useEffect(() => { selectedDateRef.current = selectedDate }, [selectedDate])

  /* Смена дня — сразу в URL (replace: листание дней не должно засорять
     историю браузера десятками записей, «назад» из урока обязан вернуть
     на расписание, а не листать предыдущие дни). Эффект срабатывает уже
     после доводки трека (selectedDate меняется в finishTransition),
     поэтому анимации карусели он не задевает. */
  useEffect(() => {
    if (readDayParam(searchParams) === selectedDate) return
    setSearchParams((prev) => withDayParam(prev, selectedDate), { replace: true })
  }, [selectedDate, searchParams, setSearchParams])

  // Трек карусели: motion value (не state!) — палец ведёт панели 1:1 без ре-рендеров.
  // ВАЖНО: drag свободный, без dragConstraints — встроенный возврат motion в 0
  // после отпускания гонялся бы с нашей программной доводкой до края
  // (два писателя в trackX = дёрганный свайп). Доводку всегда делаем сами.
  const trackX = useMotionValue(0)
  // Ref на вьюпорт карусели — для ширины шага при программном переходе
  const viewportRef = useRef(null)
  // Ref на сам трек — для резерва высоты при смене дня
  const trackRef = useRef(null)
  // Переход «трек едет к краю»: { target, dir, controls } или null.
  // Закрывается по концу анимации (promise), а не по selectedDate:
  // тап по точкам недели во время доводки её не срывает.
  const transitionRef = useRef(null)
  // Контролы ЛЮБОЙ текущей анимации трека (доводка к краю или возврат в 0):
  // новый жест обязан их остановить, иначе два писателя в trackX = рывки
  const settleAnimRef = useRef(null)
  // Клик давим только в коротком окне после свайпа, а не «до следующего клика»
  const lastDragEndRef = useRef(0)
  // Продолжение отпущенной доводки новым жестом: направление + сдвиг на старте
  const resumeRef = useRef({ dir: 0, startX: 0 })
  // Режим появления центральной панели: 'cascade' — каскад карточек
  // (первый mount, прыжок через несколько дней), 'slide' — приехала свайпом
  const [navMode, setNavMode] = useState('cascade')
  const [dragActive, setDragActive] = useState(false)
  // Открыто ли всплывающее окно-календарь (кнопка в панели дней)
  const [calendarOpen, setCalendarOpen] = useState(false)
  // Трек сбросим в useLayoutEffect ВМЕСТЕ с монтажом новых панелей:
  // trackX.set(0) синхронно ДО рендера показывал бы старый день на один кадр
  const trackResetRef = useRef(false)

  const finishTransition = useCallback(() => {
    const t = transitionRef.current
    transitionRef.current = null
    resumeRef.current = { dir: 0, startX: 0 }
    if (!t) return
    setNavMode('slide')
    setSelectedDate(t.target)
    setDotDate(t.target) // страховка: точки всегда в финальном положении
    trackResetRef.current = true
  }, [setDotDate])

  // Вызовется после КАЖДОГО рендера; флаг гарантирует, что сброс трека
  // выполнится ровно один раз — в кадре, где новые панели уже в DOM,
  // но браузер ещё не рисовал (после layout-effect до paint).
  useLayoutEffect(() => {
    if (trackResetRef.current) {
      trackResetRef.current = false
      trackX.set(0)
    }
    // Резерв высоты: трек держит высоту = самый высокий из трёх дней
    // (текущий + соседи). Смена дня пересоздаёт панели, и без резерва
    // высота трека «схлопывалась/растягивалась», из-за чего контент под
    // расписанием резко подпрыгивал сразу после доводки.
    const track = trackRef.current
    if (!track) return
    let maxH = 0
    for (const pane of track.children) {
      if (pane && pane.clientHeight > maxH) maxH = pane.clientHeight
    }
    if (maxH > 0) {
      const px = `${Math.ceil(maxH)}px`
      if (track.style.minHeight !== px) track.style.minHeight = px
    }
  })

  // Остановить любую текущую анимацию трека (доводку/возврат).
  // Вызывается перед началом нового жеста или программного перехода.
  const stopSettle = useCallback(() => {
    const s = settleAnimRef.current
    if (s) {
      s.stop()
      settleAnimRef.current = null
    }
  }, [])

  // Единая «приземляющая» доводка трека: возврат в 0 (не-свайп)
  // или доезд к краю (смена дня). Контролы сохраняются в settleAnimRef.
  const settleTo = useCallback((x) => {
    stopSettle()
    const anim = animate(trackX, x, trackSettle)
    settleAnimRef.current = anim
    anim.then(
      () => { if (settleAnimRef.current === anim) settleAnimRef.current = null },
      () => {},
    )
  }, [stopSettle, trackX])

  // Свайп/флик за порог: программный переход — трек пружиной до края
  const goPage = useCallback((dir) => {
    if (transitionRef.current) return
    stopSettle() // прерываем возврат в 0, если он ещё ехал
    const from = selectedDateRef.current
    const target = toISODate(addDays(fromISODate(from), dir))
    // Точки недели обновляем МГНОВЕННО — пилюля летит, пока трек едет к краю
    setDotDate(target)
    const width = viewportRef.current?.clientWidth || 0
    if (width <= 0) {
      setNavMode('slide')
      setSelectedDate(target)
      trackResetRef.current = true
      return
    }
    const controls = animate(trackX, -dir * width, trackSettle)
    transitionRef.current = { target, dir, controls }
    // Второй колбэк гасит отмену (новый жест прервал доводку через .stop())
    controls.then(finishTransition, () => {})
  }, [finishTransition, setDotDate, stopSettle, trackX])

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000)
    return () => clearInterval(id)
  }, [])

  const today = toISODate(now)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  const weekStart = useMemo(() => startOfWeek(fromISODate(dotDate)), [dotDate])
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => toISODate(addDays(weekStart, i))),
    [weekStart],
  )

  const prevDate = useMemo(
    () => toISODate(addDays(fromISODate(selectedDate), -1)),
    [selectedDate],
  )
  const nextDate = useMemo(
    () => toISODate(addDays(fromISODate(selectedDate), 1)),
    [selectedDate],
  )

  /* Материалы видимых дней (вчера / сегодня / завтра) получает сама страница:
     когда они приходят из Firestore, страница перерисовывается — вместе с ней
     пересчитывается резерв высоты трека карусели и принудительно
     перерисовывается контент (иначе на iOS Safari панель может остаться
     в DOM, но непрокрашенной: кнопки активны, а содержимого не видно) */
  const visibleDates = useMemo(
    () => [prevDate, selectedDate, nextDate],
    [prevDate, selectedDate, nextDate],
  )
  const materialsByDate = useDaysMaterials(visibleDates)
  useForceRepaint(materialsByDate)

  const onTrackDragStart = useCallback(() => {
    // Если отпущенная ранее доводка ещё едет к краю — новый жест её
    // перехватывает и продолжает от текущего сдвига (без скачка).
    // ВАЖНО: останавливаем контролы и доводки СРАЗУ, иначе программная
    // анимация продолжит писать в trackX параллельно с пальцем = борьба.
    stopSettle()
    setDragActive(true)
    const t = transitionRef.current
    if (t) {
      t.controls.stop()
      transitionRef.current = null
      resumeRef.current = { dir: t.dir, startX: trackX.get() }
      return
    }
    resumeRef.current = { dir: 0, startX: 0 }
  }, [stopSettle, trackX])

  // Конец жеста: сдвиг/флик за порог — смена дня (трек пружиной до края),
  // иначе пружина возвращает трек в 0. Доводку всегда делаем сами,
  // т.к. у трека нет dragConstraints (см. выше).
  const onTrackDragEnd = useCallback((_, info) => {
    setDragActive(false)
    lastDragEndRef.current = performance.now()
    const width = viewportRef.current?.clientWidth || 1
    // Жест продолжил едущий к краю переход: прогресс считаем от сдвига
    // на старте перехвата (а не от 0 — иначе «доеханный» переход отменится)
    const resume = resumeRef.current
    resumeRef.current = { dir: 0, startX: 0 }
    if (transitionRef.current) return
    if (resume.dir !== 0) {
      const total = resume.startX + info.offset.x // сдвиг от начала доводки
      const done = -resume.dir * total / width // доля пути к краю [0..1+]
      if (done > 0.4 || (-resume.dir * info.velocity.x > SWIPE_VELOCITY && done > 0.12)) {
        goPage(resume.dir)
      } else {
        // Захваченный переход отменили — возвращаемся на текущую дату
        setDotDate(selectedDateRef.current)
        settleTo(0)
      }
      return
    }
    const { offset, velocity } = info
    let dir = 0
    if (offset.x <= -SWIPE_OFFSET || velocity.x <= -SWIPE_VELOCITY) dir = 1
    else if (offset.x >= SWIPE_OFFSET || velocity.x >= SWIPE_VELOCITY) dir = -1
    if (dir === 0) {
      settleTo(0)
      return
    }
    goPage(dir)
  }, [goPage, setDotDate, settleTo])

  // Тап по точке недели: несколько дней подряд — каскад (видно, куда прыгнули),
  // соседний день — как свайп (трек пружиной до края). Доводка не прерывается.
  const pickDate = useCallback((iso) => {
    stopSettle() // тап во время возврата в 0 — начинаем прыжок с чистого трека
    const from = selectedDateRef.current
    if (iso === from || transitionRef.current) return
    const diffDays = Math.round((fromISODate(iso) - fromISODate(from)) / 86400000)
    if (Math.abs(diffDays) === 1) {
      goPage(diffDays)
      return
    }
    setDotDate(iso) // при каскадном прыжке точки обновляем сразу же
    setNavMode('cascade')
    setSelectedDate(iso)
  }, [goPage, setDotDate, stopSettle])

  // Активная точка недели: motion-пилюля перелетает между датами (layoutId)
  const dotPill = (date) => (date === dotDate
    ? <motion.span className="dot-pill" layoutId="day-dot-pill" transition={springSoft} />
    : null)

  // Клик после свайпа не должен открывать урок: ловим на capture-фазе,
  // но только в коротком окне (~350мс) после конца жеста
  const onClickCapture = useCallback((e) => {
    if (performance.now() - lastDragEndRef.current < 350) {
      e.preventDefault()
      e.stopPropagation()
    }
  }, [])

  return (
    <div className="wrap page-home">

      <nav className="day-dots" aria-label="Дни недели">
        {weekDates.map((date) => {
          const key = weekdayKeyOf(date)
          return (
            <button
              key={date}
              type="button"
              className={`day-dot${date === dotDate ? ' active' : ''}${isToday(date) ? ' today' : ''}`}
              onClick={() => pickDate(date)}
              aria-label={`${DAY_LABELS[key]}, ${formatRuDate(date)}`}
              aria-current={date === dotDate ? 'date' : undefined}
            >
              <span className="dot-label">{DAY_LABELS[key]}</span>
              <span className="dot-num">
                {dotPill(date)}
                <span className="dot-num-text">{fromISODate(date).getDate()}</span>
              </span>
            </button>
          )
        })}

        {/* Выбор дальней даты без листания: открывает стеклянный календарь */}
        <button
          type="button"
          className="day-dots-cal"
          onClick={() => setCalendarOpen(true)}
          aria-label="Открыть календарь"
          aria-haspopup="dialog"
          aria-expanded={calendarOpen}
        >
          <CalendarDays size={17} aria-hidden="true" />
        </button>
      </nav>

      <main>
        {/* Карусель на motion: три панели (вчера/сегодня/завтра) всегда
            смонтированы — соседний день виден уже во время жеста.
            Палец ведёт панели 1:1 (trackX), вертикальный жест уходит скроллу
            страницы (dragDirectionLock), свайп/флик за порог — программный
            переход пружиной до края (goPage), недотянули — пружина в 0 */}
        <div className={`day-carousel${dragActive ? ' dragging' : ''}`} ref={viewportRef}>
          <motion.div
            className="day-track"
            ref={trackRef}
            style={{ x: trackX, touchAction: 'pan-y' }}
            drag="x"
            dragDirectionLock
            dragMomentum={false}
            onDragStart={onTrackDragStart}
            onDragEnd={onTrackDragEnd}
            onClickCapture={onClickCapture}
          >
            <DayPane
              key={prevDate}
              iso={prevDate}
              side="prev"
              intro={false}
              template={template}
              overrides={overrides}
              materials={materialsByDate[prevDate]}
              nowMinutes={nowMinutes}
              today={today}
            />
            <DayPane
              key={selectedDate}
              iso={selectedDate}
              intro={navMode === 'cascade'}
              template={template}
              overrides={overrides}
              materials={materialsByDate[selectedDate]}
              nowMinutes={nowMinutes}
              today={today}
            />
            <DayPane
              key={nextDate}
              iso={nextDate}
              side="next"
              intro={false}
              template={template}
              overrides={overrides}
              materials={materialsByDate[nextDate]}
              nowMinutes={nowMinutes}
              today={today}
            />
          </motion.div>
        </div>

      </main>

      {/* <InstallHint /> */}

      <div className="footer">
        {/* <span>
          Группа {template.group} · {String(template.course).split('·').pop()?.trim()}
        </span>
        <span className="hint-swipe">Свайп листает дни и недели</span>
        <Link className="admin-link" to="/admin">Для админа</Link> */}
      </div>

      {/* Календарь: выбор любой даты. pickDate сам решает —
          соседний день перелистываем свайпом, дальний прыгаем каскадом */}
      <CalendarPopup
        open={calendarOpen}
        selectedDate={selectedDate}
        onPick={pickDate}
        onClose={() => setCalendarOpen(false)}
      />
    </div>
  )
}

export default HomePage


