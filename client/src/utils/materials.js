/**
 * Индекс материалов урока: `lessonKey` → { notes, links, homework }.
 *
 * Строится один раз на изменение сторов, поэтому карточка урока в карусели
 * дней не перебирает три коллекции на каждый рендер.
 */
export const EMPTY_MATERIALS = { notes: [], links: [], homework: [] }

const slotOf = (index, lessonKey) => {
  let slot = index.get(lessonKey)
  if (!slot) {
    slot = { notes: [], links: [], homework: [] }
    index.set(lessonKey, slot)
  }
  return slot
}

/** Материалы одного дня (уже отфильтрованные по дате), сгруппированные по уроку */
export function indexDayMaterials(notes, links, homework) {
  const index = new Map()
  for (const note of notes ?? []) {
    if (!note.lessonKey) continue
    slotOf(index, note.lessonKey).notes.push(note)
  }
  /* На карточке — только ссылки «к уроку»: у ссылок «к предмету» и общих
     lessonKey/date равны null (см. addLessonLink / addGeneralLink) */
  for (const link of links ?? []) {
    if (!link.lessonKey || !link.date) continue
    slotOf(index, link.lessonKey).links.push(link)
  }
  for (const item of homework ?? []) {
    if (!item.lessonKey) continue
    slotOf(index, item.lessonKey).homework.push(item)
  }
  return index
}

export function dayMaterialsFor(index, lessonKey) {
  return index.get(lessonKey) ?? EMPTY_MATERIALS
}