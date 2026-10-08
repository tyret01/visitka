/* Выполняется до первой отрисовки: восстанавливает выбранную тему и включает анимации появления.
   Если app.js не загрузится, через 3 секунды анимации отключаются, чтобы контент не остался скрытым. */
(() => {
  const root = document.documentElement;
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') root.dataset.theme = saved;
  } catch { /* хранилище недоступно — остаётся системная тема */ }
  root.classList.add('js');
  setTimeout(() => { if (!root.dataset.ready) root.classList.remove('js'); }, 3000);
})();
