/* Дублёр — поведение страницы. Без зависимостей. */
(() => {
  'use strict';

  /* Куда отправлять заявки. Пусто — откроется почтовый клиент с готовым письмом на адрес из блока контактов.
     Подойдёт любой приёмник форм, принимающий POST с FormData: Formspree, Web3Forms, Getform. */
  const FORM_ENDPOINT = '';

  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasIO = 'IntersectionObserver' in window;
  const esc = s => s.replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

  /* ---------- Тема ---------- */
  function initTheme() {
    const btn = $('themeBtn');
    const systemDark = matchMedia('(prefers-color-scheme: dark)');
    const current = () => root.dataset.theme || (systemDark.matches ? 'dark' : 'light');
    const syncLabel = () => btn.setAttribute('aria-label', current() === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему');
    btn.addEventListener('click', () => {
      const next = current() === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch { /* хранилище недоступно — тема просто не запомнится */ }
      syncLabel();
    });
    systemDark.addEventListener('change', syncLabel);
    syncLabel();
  }

  /* ---------- Шапка: подложка при прокрутке и активный раздел ---------- */
  function initHeader() {
    const bar = $('bar');
    const onScroll = () => bar.classList.toggle('scrolled', scrollY > 8);
    addEventListener('scroll', onScroll, {passive: true});
    onScroll();

    if (!hasIO) return;
    const links = [...document.querySelectorAll('.nav a')];
    const io = new IntersectionObserver(entries => {
      entries.filter(e => e.isIntersecting).forEach(e => {
        links.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id));
      });
    }, {rootMargin: '-45% 0px -50% 0px'});
    document.querySelectorAll('main section[id]').forEach(s => io.observe(s));
  }

  /* ---------- Появление блоков ---------- */
  function initReveal() {
    const items = document.querySelectorAll('.rv');
    if (reduceMotion || !hasIO) { items.forEach(el => el.classList.add('in')); return; }
    const io = new IntersectionObserver((entries, obs) => {
      entries.filter(e => e.isIntersecting).forEach(e => { e.target.classList.add('in'); obs.unobserve(e.target); });
    }, {rootMargin: '0px 0px -8% 0px', threshold: 0.08});
    items.forEach(el => io.observe(el));
  }

  /* ---------- ИНН физлица: 12 цифр, две контрольные по алгоритму ФНС ---------- */
  const C11 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
  const C12 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
  const checkDigit = (digits, coefs) => coefs.reduce((sum, c, i) => sum + c * digits[i], 0) % 11 % 10;
  function makeInn12(first10) {
    const d = [...first10].map(Number);
    const d11 = [...d, checkDigit(d, C11)];
    return [...d11, checkDigit(d11, C12)].join('');
  }
  function isValidInn12(inn) {
    const d = [...inn].map(Number);
    return d.length === 12 && checkDigit(d, C11) === d[10] && checkDigit(d, C12) === d[11];
  }
  const INN_FROM = makeInn12('5003124417');
  const INN_TO = makeInn12('7718093526');

  /* ---------- Демо: одна запись в трёх режимах ---------- */
  const RECORD = [
    {col: 'fio', type: 'varchar', free: false, parts: [{t: 'ФИО', o: 'Петров Алексей Ильич', s: 'Смирнов Илья Павлович'}]},
    {col: 'phone', type: 'varchar', free: false, parts: [{t: 'ТЕЛ', o: '+7 916 555-12-34', s: '+7 916 382-90-47'}]},
    {col: 'inn', type: 'char(12)', free: false, parts: [{t: 'ИНН', o: INN_FROM, s: INN_TO}]},
    {col: 'comment', type: 'text', free: true, parts: [
      'Перезвонить ', {t: 'ФИО', o: 'Петрову', s: 'Смирнову'}, ' после 18:00. Жена — ',
      {t: 'ИМЯ', o: 'Марина', s: 'Ольга'}, ', тел. ', {t: 'ТЕЛ', o: '8 (903) 410-22-61', s: '8 (903) 157-36-08'}, '.']},
    {col: 'meta', type: 'jsonb', free: true, json: true, parts: [
      '{"from": "', {t: 'EMAIL', o: 'alexey.petrov@mail.ru', s: 'ilya.smirnov@mail.ru'},
      '", "msg": "паспорт ', {t: 'ПАСПОРТ', o: '4510 123456', s: '4617 905281'}, ' прикрепил"}']}
  ];
  const TOKENS = RECORD.flatMap(f => f.parts.filter(p => typeof p === 'object').map(p => ({...p, free: f.free})));
  const CAPTIONS = {
    raw: 'Копия рабочей базы как есть: восемь значений с персональными данными уходят на стенд.',
    column: 'Колонки замаскированы, но в комментарии и JSON остались фамилия, имя, телефон, e-mail и паспорт.',
    dubler: 'Заменены все восемь значений. Петров стал Смирновым везде: в колонке, в почте и в дательном падеже внутри комментария.'
  };
  const INTRO = [['raw', 1700], ['column', 2900], ['dubler', 0]];
  const isReplaced = (tok, mode) => mode === 'dubler' || (mode === 'column' && !tok.free);
  const tokState = (tok, mode) => isReplaced(tok, mode) ? 'masked' : mode === 'column' ? 'leak' : 'raw';

  function recordHtml(prev, next) {
    return RECORD.map(f => {
      const value = f.parts.map(p => {
        if (typeof p === 'string') return esc(p);
        const tok = {...p, free: f.free};
        const changed = prev && isReplaced(tok, prev) !== isReplaced(tok, next);
        const text = isReplaced(tok, next) ? p.s : p.o;
        return `<span class="tok ${tokState(tok, next)}"><span class="v${changed ? ' swap' : ''}">${esc(text)}</span><span class="tag">${p.t}</span></span>`;
      }).join('');
      return `<div class="f-name"><b>${f.col}</b>${f.type}${f.free ? '<span class="free">поиск в тексте</span>' : ''}</div>
        <div class="f-val${f.json ? ' json' : ''}">${value}</div>`;
    }).join('');
  }

  function initDemo() {
    const buttons = [...document.querySelectorAll('.mode')];
    let mode = null;
    let timers = [];

    function render(next) {
      $('rec').innerHTML = recordHtml(mode, next);
      mode = next;
      const done = TOKENS.filter(t => isReplaced(t, next)).length;
      const open = TOKENS.length - done;
      $('sFound').textContent = TOKENS.length;
      $('sDone').textContent = done;
      $('sLeak').textContent = open;
      $('sLeak').className = open ? 'bad' : 'good';
      $('specCap').textContent = CAPTIONS[next];
      buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === next)));
    }
    function showTimer(active, hold) {
      buttons.forEach(b => {
        const on = hold > 0 && b.dataset.mode === active;
        b.classList.toggle('timing', on);
        if (on) b.style.setProperty('--dur', hold + 'ms');
      });
    }
    function stopIntro() {
      timers.forEach(clearTimeout);
      timers = [];
      showTimer(null, 0);
    }
    function playIntro() {
      let at = 0;
      timers = INTRO.map(([m, hold]) => {
        const id = setTimeout(() => { render(m); showTimer(m, hold); }, at);
        at += hold;
        return id;
      });
    }

    buttons.forEach(b => b.addEventListener('click', () => { stopIntro(); render(b.dataset.mode); }));

    if (reduceMotion || !hasIO) { render('dubler'); return; }
    render('raw');
    const io = new IntersectionObserver((entries, obs) => {
      if (!entries.some(e => e.isIntersecting)) return;
      obs.disconnect();
      if (!timers.length && mode === 'raw') playIntro();
    }, {threshold: 0.35});
    io.observe($('demo'));
  }

  /* ---------- Вафля: 100 клеток, 3 закрашены (3,1%) ---------- */
  function initWaffle() {
    $('waffle').innerHTML = Array.from({length: 100}, (_, i) => `<i${i < 3 ? ' class="on"' : ''}></i>`).join('');
  }

  /* ---------- Контрольные суммы ИНН считаются и проверяются прямо на странице ---------- */
  function initInn() {
    const withCheck = inn => `${inn.slice(0, 10)}<span class="ck">${inn.slice(10)}</span>`;
    const valid = isValidInn12(INN_FROM) && isValidInn12(INN_TO);
    $('innDemo').innerHTML = `
      <div class="ln"><span class="from">${withCheck(INN_FROM)}</span><span class="ar">→</span><span class="to">${withCheck(INN_TO)}</span></div>
      <div class="okl">${valid ? '✓ контрольные цифры верны — проверено на этой странице' : 'контрольные цифры не сошлись'}</div>`;
  }

  /* ---------- Подсветка команд в терминале при наведении на шаг ---------- */
  function initSteps() {
    const term = $('term');
    document.querySelectorAll('#steps li[data-step]').forEach(li => {
      li.addEventListener('pointerenter', () => { term.dataset.active = li.dataset.step; });
      li.addEventListener('pointerleave', () => { delete term.dataset.active; });
    });
  }

  /* ---------- Копирование команды ---------- */
  function initCopy() {
    const btn = $('copyBtn');
    const text = 'dubler init --db postgres://replica/shop';
    const flash = (label, ok) => {
      btn.textContent = label;
      btn.classList.toggle('done', ok);
      setTimeout(() => { btn.textContent = 'Копировать'; btn.classList.remove('done'); }, 1800);
    };
    const selectFallback = () => {
      const range = document.createRange();
      range.selectNodeContents($('cmdText'));
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      flash('Выделено', false);
    };
    btn.addEventListener('click', () => {
      if (!navigator.clipboard) { selectFallback(); return; }
      navigator.clipboard.writeText(text).then(() => flash('Скопировано', true), selectFallback);
    });
  }

  /* ---------- Заявка на пилот ---------- */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function mailtoUrl(to, data) {
    const body = [
      'Здравствуйте! Хотим попробовать Дублёр на своей базе.',
      '',
      `База данных: ${data.get('db')}`,
      `Записей: ${data.get('rows')}`,
      `Почта для ответа: ${data.get('email')}`,
      data.get('comment') ? `\n${data.get('comment')}` : ''
    ].join('\n');
    return `mailto:${to}?subject=${encodeURIComponent('Пилот Дублёра')}&body=${encodeURIComponent(body)}`;
  }

  function initForm() {
    const form = $('form');
    const email = $('email');
    const status = $('formStatus');
    const submit = form.querySelector('button[type="submit"]');
    const contactEmail = document.querySelector('[data-contact-email]').textContent.trim();

    const showStatus = (kind, text) => { status.dataset.kind = kind; status.textContent = text; status.hidden = false; };
    const validate = () => {
      const ok = EMAIL_RE.test(email.value.trim());
      email.setAttribute('aria-invalid', String(!ok));
      $('emailErr').textContent = ok ? '' : 'Укажите почту в формате name@company.ru, на неё придёт инструкция.';
      return ok;
    };
    email.addEventListener('input', () => { if (email.getAttribute('aria-invalid') === 'true') validate(); });

    async function send(data) {
      submit.disabled = true;
      try {
        const res = await fetch(FORM_ENDPOINT, {method: 'POST', body: data, headers: {Accept: 'application/json'}});
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        form.reset();
        showStatus('ok', 'Заявка отправлена. Ответим в течение рабочего дня.');
      } catch {
        showStatus('err', `Не получилось отправить заявку. Напишите нам на ${contactEmail}, ответим так же быстро.`);
      } finally {
        submit.disabled = false;
      }
    }

    form.addEventListener('submit', e => {
      e.preventDefault();
      if (!validate()) { email.focus(); return; }
      const data = new FormData(form);
      /* Ловушка для ботов: люди это поле не видят */
      if (data.get('website')) { showStatus('ok', 'Заявка отправлена. Ответим в течение рабочего дня.'); return; }
      data.delete('website');
      if (FORM_ENDPOINT) { send(data); return; }
      location.href = mailtoUrl(contactEmail, data);
      showStatus('ok', `Открыли почту с готовым письмом. Если ничего не произошло, напишите на ${contactEmail}.`);
    });
  }

  initTheme();
  initHeader();
  initReveal();
  initDemo();
  initWaffle();
  initInn();
  initSteps();
  initCopy();
  initForm();
  root.dataset.ready = '1';
})();
