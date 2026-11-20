/* Cà Mau Portal - ứng dụng xem video (PWA) */
(() => {
  'use strict';

  // ---------- Cấu hình ----------
  // DATA_URL: file danh sách video đi kèm app (được cập nhật bằng tools/update_videos.mjs)
  // REMOTE_URL: (tuỳ chọn) địa chỉ JSON cùng định dạng, nếu bạn có máy chủ/API riêng. Để trống nếu chưa có.
  const CONFIG = {
    DATA_URL: 'data/videos.json',
    NEWS_URL: 'data/news.json',
    REMOTE_URL: '',
    SITE_URL: 'https://camau.gov.vn/media',
    HERO_COUNT: 5,
    HOME_ROW_COUNT: 8,
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const view = $('#view');
  const topbar = $('#topbar');
  const btnBack = $('#btn-back');
  const pageTitle = $('#page-title');
  const brand = $('.brand');

  // ---------- Lưu trữ cục bộ ----------
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* bỏ qua */ }
    },
  };
  let favs = new Set(store.get('cmp.favs', []));
  let watched = store.get('cmp.history', []); // [{id, t}]

  const saveFavs = () => store.set('cmp.favs', [...favs]);
  const addHistory = (id) => {
    watched = [{ id, t: Date.now() }, ...watched.filter((h) => h.id !== id)].slice(0, 60);
    store.set('cmp.history', watched);
  };

  // ---------- Tiện ích ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  const fmtDate = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
  };
  const thumb = (id, q = 'mqdefault') => `https://i.ytimg.com/vi/${encodeURIComponent(id)}/${q}.jpg`;
  const icon = (name) => `<svg class="ic"><use href="#i-${esc(name)}"/></svg>`;

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ---------- Dữ liệu ----------
  let DATA = { categories: [], videos: [] };
  let dataNotice = '';

  async function fetchJson(url, timeoutMs = 8000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal, cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally { clearTimeout(timer); }
  }

  const valid = (d) => d && Array.isArray(d.videos) && Array.isArray(d.categories);

  async function loadData() {
    const remote = CONFIG.REMOTE_URL || (window.CMP_REMOTE_BASE ? window.CMP_REMOTE_BASE + CONFIG.DATA_URL : '');
    if (remote) {
      try {
        const d = await fetchJson(remote);
        if (valid(d)) { DATA = d; store.set('cmp.data', d); return; }
      } catch { /* thử nguồn đi kèm app */ }
    }
    try {
      const d = await fetchJson(CONFIG.DATA_URL);
      if (valid(d)) { DATA = d; store.set('cmp.data', d); return; }
    } catch { /* thử bản lưu trước đó */ }
    const cached = store.get('cmp.data', null);
    if (valid(cached)) { DATA = cached; dataNotice = 'Đang hiển thị dữ liệu đã lưu. Hãy kết nối mạng để cập nhật.'; return; }
    throw new Error('Không tải được danh sách video');
  }

  const byId = (id) => DATA.videos.find((v) => v.id === id);
  const catOf = (id) => DATA.categories.find((c) => c.id === id);
  const inCat = (cid) => sortNew(DATA.videos.filter((v) => v.category === cid));
  const sortNew = (arr) => [...arr].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // Tin tức + du lịch (không bắt buộc: lỗi thì các tab này hiện trạng thái rỗng)
  let NEWS = { news: [], tourism: [] };
  async function loadNews() {
    const urls = [window.CMP_REMOTE_BASE ? window.CMP_REMOTE_BASE + CONFIG.NEWS_URL : '', CONFIG.NEWS_URL].filter(Boolean);
    for (const u of urls) {
      try {
        const d = await fetchJson(u);
        if (d && Array.isArray(d.news)) { NEWS = { ...d, tourism: d.tourism || [] }; store.set('cmp.news', NEWS); return; }
      } catch { /* thử nguồn kế tiếp / bản đã lưu */ }
    }
    const c = store.get('cmp.news', null);
    if (c && Array.isArray(c.news)) NEWS = { ...c, tourism: c.tourism || [] };
  }
  const allArticles = () => [...NEWS.news, ...NEWS.tourism];
  const articleById = (id) => allArticles().find((a) => String(a.id) === String(id));
  const fmtDateTime = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso || '');
    if (!m) return '';
    return `${m[3]}/${m[2]}/${m[1]}` + (m[4] && !(m[4] === '00' && m[5] === '00') ? ` ${m[4]}:${m[5]}` : '');
  };
  const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');

  // ---------- Thành phần giao diện ----------
  function acard(a) {
    const sub = [fmtDateTime(a.date), a.catName].filter(Boolean).join(' · ');
    const img = safeUrl(a.image);
    return `
      <a class="acard" href="#/article/${esc(a.id)}">
        <div class="athumb">${img ? `<img loading="lazy" decoding="async" src="${esc(img)}" alt="" onerror="this.remove()">` : `<img class="ph" src="assets/logo.png" alt="">`}</div>
        <div>
          <h3>${esc(a.title)}</h3>
          <div class="sub">${esc(sub)}</div>
        </div>
      </a>`;
  }

  function vcard(v, { showCat = false } = {}) {
    const c = catOf(v.category);
    const sub = [fmtDate(v.date), showCat && c ? c.name : ''].filter(Boolean).join(' · ');
    return `
      <a class="vcard" href="#/watch/${esc(v.id)}">
        <div class="thumb">
          <img loading="lazy" decoding="async" src="${thumb(v.id)}" alt="">
          <span class="mini-play">${icon('play')}</span>
        </div>
        <div>
          <h3>${esc(v.title)}</h3>
          <div class="sub">${esc(sub)}</div>
        </div>
      </a>`;
  }

  function row(title, cid, vids) {
    if (!vids.length) return '';
    return `
      <section class="section">
        <div class="section-head">
          <h2>${esc(title)}</h2>
          <a href="#/cat/${esc(cid)}">Xem tất cả</a>
        </div>
        <div class="row">${vids.map((v) => vcard(v)).join('')}</div>
      </section>`;
  }

  const emptyState = (title, text) => `
    <div class="empty">
      <img src="assets/logo.png" alt="">
      <b>${esc(title)}</b>${esc(text)}
    </div>`;

  const footer = (src = DATA) => `<div class="foot">Nguồn: <a href="${CONFIG.SITE_URL}" target="_blank" rel="noopener">Cổng thông tin điện tử tỉnh Cà Mau</a>${src.updatedAt ? '<br>Cập nhật: ' + esc(fmtDate(src.updatedAt)) : ''}</div>`;

  const noticeHtml = () => (dataNotice ? `<div class="banner">${esc(dataNotice)}</div>` : '');

  // ---------- Các màn hình ----------
  function screenHome() {
    const latest = sortNew(DATA.videos);
    const hero = latest.slice(0, CONFIG.HERO_COUNT);
    const cats = DATA.categories.filter((c) => c.id !== 'moi-nhat');
    const heroHtml = hero.map((v) => {
      const c = catOf(v.category);
      return `
        <a class="hero-card" href="#/watch/${esc(v.id)}">
          <img src="${thumb(v.id, 'hqdefault')}" alt="" decoding="async">
          <span class="play">${icon('play')}</span>
          <div class="meta">
            <span class="tag">${esc(c ? c.name : 'Video')}</span>
            <h3>${esc(v.title)}</h3>
          </div>
        </a>`;
    }).join('');

    const chips = `<div class="chips">${DATA.categories.map((c) => `<a class="chip" href="#/cat/${esc(c.id)}">${esc(c.name)}</a>`).join('')}</div>`;

    const rows = DATA.categories.map((c) => row(c.name, c.id, inCat(c.id).slice(0, CONFIG.HOME_ROW_COUNT))).join('');

    view.innerHTML = `${noticeHtml()}<div class="hero">${heroHtml}</div>${chips}${rows}${footer()}`;
    return { title: '' };
  }

  function screenCategories() {
    const tiles = DATA.categories.map((c) => {
      const n = DATA.videos.filter((v) => v.category === c.id).length;
      return `<a class="cat-tile" href="#/cat/${esc(c.id)}">${icon(c.icon || 'play')}<div><b>${esc(c.name)}</b><br><small>${n} video</small></div></a>`;
    }).join('');
    view.innerHTML = `<div class="cat-grid">${tiles}</div>${footer()}`;
    return { title: 'Chuyên mục' };
  }

  function screenCategory(cid) {
    const c = catOf(cid);
    if (!c) { view.innerHTML = emptyState('Không tìm thấy chuyên mục', 'Chuyên mục này không còn tồn tại.'); return { title: 'Chuyên mục', back: true }; }
    const vids = inCat(cid);
    view.innerHTML = vids.length
      ? `<div class="grid">${vids.map((v) => vcard(v)).join('')}</div>${footer()}`
      : emptyState('Chưa có video', 'Chuyên mục này chưa có video nào.');
    return { title: c.name, back: true };
  }

  function screenSearch(q) {
    view.innerHTML = `
      <form class="searchbar" id="search-form" role="search">
        <input id="q" type="search" placeholder="Tìm video..." autocomplete="off" enterkeyhint="search" value="${esc(q || '')}">
      </form>
      <div id="results"></div>`;
    const input = $('#q');
    const out = $('#results');
    const run = () => {
      const terms = norm(input.value).split(/\s+/).filter(Boolean);
      if (!terms.length) { out.innerHTML = emptyState('Tìm kiếm video', 'Nhập từ khoá, ví dụ: OCOP, bầu cử, Festival Tôm.'); return; }
      const res = sortNew(DATA.videos.filter((v) => {
        const hay = norm(v.title + ' ' + ((catOf(v.category) || {}).name || ''));
        return terms.every((t) => hay.includes(t));
      }));
      out.innerHTML = res.length
        ? `<div class="list">${res.map((v) => vcard(v, { showCat: true })).join('')}</div>`
        : emptyState('Không có kết quả', 'Thử từ khoá khác ngắn gọn hơn.');
    };
    input.addEventListener('input', run);
    $('#search-form').addEventListener('submit', (e) => { e.preventDefault(); input.blur(); });
    run();
    setTimeout(() => input.focus({ preventScroll: true }), 50);
    return { title: 'Tìm kiếm', back: true };
  }

  function screenFavorites() {
    const vids = sortNew([...favs].map(byId).filter(Boolean));
    view.innerHTML = vids.length
      ? `<div class="list">${vids.map((v) => vcard(v, { showCat: true })).join('')}</div>`
      : emptyState('Chưa có video yêu thích', 'Bấm nút "Yêu thích" khi xem video để lưu lại tại đây.');
    view.innerHTML += `<div class="more-wrap"><a class="btn" href="#/history">${icon('clock')}<span>Video đã xem</span></a></div>`;
    return { title: 'Đã lưu' };
  }

  function screenHistory() {
    const vids = watched.map((h) => byId(h.id)).filter(Boolean);
    view.innerHTML = vids.length
      ? `<div class="section-head" style="padding-top:12px"><h2>Video đã xem</h2><a href="#/history" id="clear-history" role="button">Xoá lịch sử</a></div>
         <div class="list">${vids.map((v) => vcard(v, { showCat: true })).join('')}</div>`
      : emptyState('Chưa xem video nào', 'Những video bạn đã xem sẽ hiện ở đây.');
    const clear = $('#clear-history');
    if (clear) clear.addEventListener('click', (e) => {
      e.preventDefault();
      watched = []; store.set('cmp.history', watched);
      screenHistory(); toast('Đã xoá lịch sử xem');
    });
    return { title: 'Đã xem' };
  }

  function screenWatch(id) {
    const v = byId(id);
    if (!v) { view.innerHTML = emptyState('Không tìm thấy video', 'Video này không còn trong danh sách.'); return { title: 'Video', back: true }; }
    addHistory(id);
    const c = catOf(v.category);
    const related = sortNew(DATA.videos.filter((x) => x.id !== id && x.category === v.category));
    const more = sortNew(DATA.videos.filter((x) => x.id !== id && x.category !== v.category));
    const next = [...related, ...more].slice(0, 12);
    const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&playsinline=1&rel=0&modestbranding=1`;
    const ytUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;

    view.innerHTML = `
      <div class="player-wrap">
        <div class="player">
          <iframe src="${src}" title="${esc(v.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
        </div>
      </div>
      <div class="watch-info">
        <h2>${esc(v.title)}</h2>
        <div class="sub">${esc([fmtDate(v.date), c ? c.name : ''].filter(Boolean).join(' · '))}</div>
        <div class="actions">
          <button class="btn ${favs.has(id) ? 'on' : ''}" id="btn-fav" type="button">${icon('heart')}<span>${favs.has(id) ? 'Đã yêu thích' : 'Yêu thích'}</span></button>
          <button class="btn" id="btn-share" type="button">${icon('share')}<span>Chia sẻ</span></button>
          <a class="btn" href="${ytUrl}" target="_blank" rel="noopener">${icon('ext')}<span>YouTube</span></a>
        </div>
      </div>
      <section class="section">
        <div class="section-head"><h2>Xem tiếp</h2></div>
        <div class="list">${next.map((x) => vcard(x, { showCat: true })).join('')}</div>
      </section>`;

    $('#btn-fav').addEventListener('click', (e) => {
      const b = e.currentTarget;
      if (favs.has(id)) { favs.delete(id); toast('Đã bỏ khỏi yêu thích'); } else { favs.add(id); toast('Đã thêm vào yêu thích'); }
      saveFavs();
      b.classList.toggle('on', favs.has(id));
      b.querySelector('span').textContent = favs.has(id) ? 'Đã yêu thích' : 'Yêu thích';
    });

    $('#btn-share').addEventListener('click', async () => {
      const data = { title: v.title, text: v.title, url: ytUrl };
      try {
        if (navigator.share) await navigator.share(data);
        else { await navigator.clipboard.writeText(ytUrl); toast('Đã sao chép liên kết'); }
      } catch (err) {
        if (err && err.name !== 'AbortError') toast('Không chia sẻ được');
      }
    });
    return { title: '', back: true, watch: true };
  }

  function screenNews() {
    const list = sortNewDt(NEWS.news);
    if (!list.length) {
      view.innerHTML = emptyState('Chưa có tin', 'Tin tức sẽ hiện ở đây sau khi dữ liệu được cập nhật.') + siteButton('Xem tin trên camau.gov.vn', 'https://camau.gov.vn/tin-tuc-su-kien');
      return { title: 'Tin tức' };
    }
    const [first, ...rest] = list;
    const img = safeUrl(first.image);
    view.innerHTML = `
      <a class="hero-news" href="#/article/${esc(first.id)}">
        ${img ? `<img src="${esc(img)}" alt="" decoding="async" onerror="this.remove()">` : ''}
        <div class="meta"><span class="tag">${esc(first.catName || 'Tin tức')}</span><h3>${esc(first.title)}</h3><div class="sub">${esc(fmtDateTime(first.date))}</div></div>
      </a>
      <div class="list alist">${rest.map(acard).join('')}</div>
      ${siteButton('Xem thêm trên camau.gov.vn', 'https://camau.gov.vn/tin-tuc-su-kien')}${footer(NEWS)}`;
    return { title: 'Tin tức' };
  }

  function screenTourism() {
    const list = sortNewDt(NEWS.tourism);
    view.innerHTML = list.length
      ? `<div class="list alist">${list.map(acard).join('')}</div>${siteButton('Xem thêm trên camau.gov.vn', 'https://camau.gov.vn/du-lich-1')}${footer(NEWS)}`
      : emptyState('Chưa có bài du lịch', 'Thông tin du lịch sẽ hiện ở đây sau khi dữ liệu được cập nhật.') + siteButton('Xem du lịch trên camau.gov.vn', 'https://camau.gov.vn/du-lich-1');
    return { title: 'Du lịch' };
  }

  function screenArticle(id) {
    const a = articleById(id);
    if (!a) { view.innerHTML = emptyState('Không tìm thấy bài viết', 'Bài này không còn trong danh sách.'); return { title: 'Bài viết', back: true }; }
    const img = safeUrl(a.image);
    const url = safeUrl(a.url);
    const isTour = NEWS.tourism.some((x) => String(x.id) === String(id));
    const more = sortNewDt((isTour ? NEWS.tourism : NEWS.news).filter((x) => String(x.id) !== String(id))).slice(0, 6);
    view.innerHTML = `
      ${img ? `<div class="article-img"><img src="${esc(img)}" alt="" decoding="async" onerror="this.parentNode.remove()"></div>` : ''}
      <article class="watch-info">
        <span class="tag-red">${esc(a.catName || (isTour ? 'Du lịch' : 'Tin tức'))}</span>
        <h2>${esc(a.title)}</h2>
        <div class="sub">${esc(fmtDateTime(a.date))}</div>
        ${a.summary ? `<p class="lead">${esc(a.summary)}</p>` : ''}
        <div class="actions">
          ${url ? `<a class="btn primary" href="${esc(url)}" target="_blank" rel="noopener">${icon('ext')}<span>Đọc toàn bài</span></a>` : ''}
          <button class="btn" id="btn-share" type="button">${icon('share')}<span>Chia sẻ</span></button>
        </div>
      </article>
      ${more.length ? `<section class="section"><div class="section-head"><h2>Bài liên quan</h2></div><div class="list alist">${more.map(acard).join('')}</div></section>` : ''}`;
    const share = $('#btn-share');
    if (share) share.addEventListener('click', async () => {
      try {
        if (navigator.share) await navigator.share({ title: a.title, text: a.title, url });
        else { await navigator.clipboard.writeText(url); toast('Đã sao chép liên kết'); }
      } catch (err) { if (err && err.name !== 'AbortError') toast('Không chia sẻ được'); }
    });
    return { title: '', back: true };
  }

  const sortNewDt = (arr) => [...arr].sort((a, b) => (b.date || '').localeCompare(a.date || '') || Number(b.id) - Number(a.id));
  const siteButton = (label, url) => `<div class="more-wrap"><a class="btn" href="${esc(url)}" target="_blank" rel="noopener">${icon('ext')}<span>${esc(label)}</span></a></div>`;

  // ---------- Định tuyến ----------
  function route() {
    const hash = location.hash.replace(/^#/, '') || '/home';
    const [, name = 'home', arg = ''] = hash.split('/');
    const param = decodeURIComponent(arg);
    let cfg;
    switch (name) {
      case 'categories': cfg = screenCategories(); break;
      case 'news': cfg = screenNews(); break;
      case 'tourism': cfg = screenTourism(); break;
      case 'article': cfg = screenArticle(param); break;
      case 'cat': cfg = screenCategory(param); break;
      case 'search': cfg = screenSearch(param); break;
      case 'favorites': cfg = screenFavorites(); break;
      case 'history': cfg = screenHistory(); break;
      case 'watch': cfg = screenWatch(param); break;
      default: cfg = screenHome();
    }
    chrome(name, cfg);
    window.scrollTo(0, 0);
    view.focus({ preventScroll: true });
  }

  function chrome(name, cfg) {
    document.body.classList.toggle('in-watch', !!cfg.watch);
    btnBack.hidden = !cfg.back;
    const showTitle = !!cfg.title;
    pageTitle.hidden = !showTitle;
    pageTitle.textContent = cfg.title || '';
    brand.hidden = showTitle || !!cfg.back;
    // Trang con: nút quay lại + (nếu có) tiêu đề
    const tabMap = { home: 'home', categories: 'categories', cat: 'categories', news: 'news', tourism: 'tourism', article: '', favorites: 'favorites', history: 'favorites', watch: '', search: '' };
    document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === (tabMap[name] ?? 'home')));
    document.title = cfg.title ? `${cfg.title} - Cà Mau Portal` : 'Cà Mau Portal';
  }

  btnBack.addEventListener('click', () => {
    if (window.history.length > 1) window.history.back();
    else location.hash = '#/home';
  });
  $('#btn-search').addEventListener('click', () => { location.hash = '#/search'; });

  // ---------- Khởi động ----------
  function skeleton() {
    view.innerHTML = '<div class="skeleton sk-hero"></div><div class="skeleton sk-row"></div><div class="skeleton sk-row"></div>';
  }

  async function start() {
    skeleton();
    try {
      await Promise.all([loadData(), loadNews()]);
    } catch (err) {
      view.innerHTML = emptyState('Không tải được dữ liệu', 'Kiểm tra kết nối mạng rồi mở lại ứng dụng.');
      return;
    }
    window.addEventListener('hashchange', route);
    route();
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  start();
})();
