function InstallHint() {
  return (
    <section className="install" aria-label="Как добавить на главный экран">
      <div className="install-callout">
        <span className="install-emoji" aria-hidden="true">📲</span>
        <div>
          <strong>Добавь расписание на главный экран</strong>
          <p>
            Установи его как приложение — откроется без адресной строки,
            с иконкой на рабочем столе и будет работать даже без интернета.
          </p>
        </div>
      </div>

      <details className="install-item">
        <summary>
          <span className="install-platform">iPhone · Safari</span>
          <span className="install-chevron" aria-hidden="true">▾</span>
        </summary>
        <ol>
          <li>Открой этот сайт в <b>Safari</b> (в Chrome этого пункта нет).</li>
          <li>Нажми кнопку «Поделиться» — квадратик со стрелкой вверх.</li>
          <li>В списке выбери <b>«На экран “Домой”»</b>.</li>
          <li>Нажми «Добавить» — иконка появится на рабочем столе.</li>
        </ol>
      </details>

      <details className="install-item">
        <summary>
          <span className="install-platform">Android · Chrome</span>
          <span className="install-chevron" aria-hidden="true">▾</span>
        </summary>
        <ol>
          <li>Открой этот сайт в <b>Chrome</b>.</li>
          <li>Нажми меню <b>⋮</b> (три точки справа вверху).</li>
          <li>Выбери <b>«Установить приложение»</b> или «Добавить на главный экран».</li>
          <li>Подтверди установку — иконка появится в списке приложений.</li>
        </ol>
      </details>
    </section>
  )
}

export default InstallHint
