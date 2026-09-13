/**
 * Фича-флаги через env-переменные VITE_* (см. .env.example).
 * Значения читаются на этапе сборки: чтобы включить/выключить
 * возможность, нужно поменять переменную и пересобрать приложение.
 */

/**
 * Объявления (блок «📢 Объявления» на главной + вкладка в админке).
 * Сейчас отключены; чтобы включить снова:
 *   VITE_ENABLE_ANNOUNCEMENTS=true  (в .env.local или в секретах CI)
 */
export const announcementsEnabled =
  import.meta.env.VITE_ENABLE_ANNOUNCEMENTS === 'true'