/* LCTW Silent Auction — shared code for all pages */
(function () {
  const CFG = window.AUCTION_CONFIG || {};
  const ITEMS = (window.AUCTION_ITEMS || []).map(function (it) {
    return Object.assign({
      startingBid: CFG.startingBid || 0,
      minIncrement: CFG.minIncrement || 1,
      medium: window.AUCTION_DEFAULT_MEDIUM || '',
    }, it);
  });
  const DEMO = !CFG.apiUrl;

  // ---------- small helpers ----------
  const $ = function (sel, root) { return (root || document).querySelector(sel); };
  const $$ = function (sel, root) { return Array.from((root || document).querySelectorAll(sel)); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    const v = Number(n) || 0;
    const opts = Number.isInteger(v) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    return (CFG.currencySymbol || '') + v.toLocaleString(undefined, opts);
  }
  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(key) || 'null');
      if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(val));
    } catch (_) { return null; }
  }
  function timeAgo(t) {
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    return new Date(t).toLocaleDateString();
  }
  function toast(msg) {
    let el = $('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { el.classList.remove('show'); }, 3200);
  }
  function itemById(id) { return ITEMS.find(function (i) { return i.id === id; }); }
  function thumb(it) { return 'images/thumb/' + it.image; }
  function full(it) { return 'images/full/' + it.image; }
  function itemUrl(it) { return 'item.html?id=' + encodeURIComponent(it.id); }
  function siteBase() {
    if (CFG.siteUrl) return CFG.siteUrl.replace(/\/?$/, '/');
    return location.href.replace(/[^/]*([?#].*)?$/, '');
  }

  // ---------- API: Google Apps Script, or a browser-only demo ----------
  const remote = {
    state: function () {
      return fetch(CFG.apiUrl + '?action=state&t=' + Date.now()).then(function (r) { return r.json(); }).then(check);
    },
    post: function (body) {
      return fetch(CFG.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json(); }).then(check);
    },
  };
  function check(res) { if (!res || !res.ok) throw new Error((res && res.error) || 'Something went wrong. Please try again.'); return res; }

  const demo = (function () {
    const KEY = 'lctw-auction-demo';
    function db() { return store(KEY) || { bids: [], settings: { closed: false, endsAt: null } }; }
    function save(d) { store(KEY, d); }
    function isClosed(s) { return s.closed || (s.endsAt && Date.now() >= s.endsAt); }
    function shortName(n) { const p = String(n).trim().split(/\s+/); return p.length < 2 ? p[0] : p[0] + ' ' + p[p.length - 1][0].toUpperCase() + '.'; }
    function state() {
      const d = db(); const items = {};
      d.bids.filter(function (b) { return b.status !== 'removed'; }).forEach(function (b) {
        const it = items[b.itemId] || (items[b.itemId] = { high: 0, highName: '', count: 0, history: [] });
        const shown = b.anonymous ? 'Anonymous' : shortName(b.name);
        it.count++; if (b.amount > it.high) { it.high = b.amount; it.highName = shown; }
        it.history.push({ amount: b.amount, name: shown, time: b.time, id: b.id });
      });
      Object.keys(items).forEach(function (k) { items[k].history.sort(function (a, b) { return b.amount - a.amount; }); items[k].history = items[k].history.slice(0, 8); });
      const s = Object.assign({}, d.settings); s.isClosed = !!isClosed(s);
      return { ok: true, items: items, settings: s, serverTime: Date.now() };
    }
    function admin() { const d = db(); const s = Object.assign({}, d.settings); s.isClosed = !!isClosed(s); return { ok: true, bids: d.bids, settings: s, serverTime: Date.now() }; }
    function delay(v) { return new Promise(function (res) { setTimeout(function () { res(v); }, 250); }); }
    return {
      state: function () { return delay(state()); },
      post: function (b) {
        try {
          const d = db();
          if (b.action === 'bid') {
            if (isClosed(d.settings)) throw new Error('Sorry — bidding has closed.');
            const cur = state().items[b.itemId];
            const min = cur ? cur.high + Number(b.minIncrement) : Number(b.startingBid);
            if (Number(b.amount) < min) throw new Error('Someone just bid! The minimum bid is now ' + money(min) + '.');
            const id = Math.random().toString(36).slice(2, 10);
            d.bids.push({ id: id, time: Date.now(), itemId: b.itemId, itemTitle: b.itemTitle, amount: Number(b.amount), name: b.name, phone: b.phone, email: b.email || '', anonymous: !!b.anonymous, status: 'active' });
            save(d); return delay({ ok: true, bidId: id, state: state() });
          }
          if (b.key !== 'demo') throw new Error('Wrong admin password. (Demo mode password is: demo)');
          if (b.action === 'admin') return delay(admin());
          if (b.action === 'removeBid' || b.action === 'restoreBid') {
            const bid = d.bids.find(function (x) { return x.id === b.bidId; });
            if (bid) bid.status = b.action === 'removeBid' ? 'removed' : 'active';
            save(d); return delay(admin());
          }
          if (b.action === 'settings') {
            if ('closed' in b) d.settings.closed = !!b.closed;
            if ('endsAt' in b) d.settings.endsAt = b.endsAt || null;
            save(d); return delay(admin());
          }
          throw new Error('Unknown action');
        } catch (e) { return Promise.reject(e); }
      },
    };
  })();

  const api = DEMO ? demo : remote;

  // ---------- live state with polling ----------
  let STATE = { items: {}, settings: {}, serverTime: Date.now() };
  let clockOffset = 0;
  const listeners = [];
  function setState(s) {
    STATE = s; clockOffset = (s.serverTime || Date.now()) - Date.now();
    listeners.forEach(function (fn) { try { fn(STATE); } catch (e) { console.error(e); } });
  }
  function refresh() {
    return api.state().then(setState).catch(function (e) { console.warn('Refresh failed', e); });
  }
  function onState(fn) { listeners.push(fn); }
  function startPolling() {
    refresh();
    const every = Math.max(5, CFG.refreshSeconds || 15) * 1000;
    setInterval(function () { if (!document.hidden) refresh(); }, every);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
  }
  function now() { return Date.now() + clockOffset; }

  function info(it) {
    const s = (STATE.items && STATE.items[it.id]) || { high: 0, highName: '', count: 0, history: [] };
    const minimum = s.count ? s.high + Number(it.minIncrement) : Number(it.startingBid);
    const my = myBids()[it.id];
    let mine = null;
    if (my && s.count) mine = my.amount >= s.high ? 'winning' : 'outbid';
    return { high: s.high, highName: s.highName, count: s.count, history: s.history || [], minimum: minimum, mine: mine };
  }
  function isClosed() {
    const st = STATE.settings || {};
    return !!(st.closed || (st.endsAt && now() >= st.endsAt));
  }

  // ---------- "my bids" saved on this phone ----------
  function myBids() { return store('lctw-auction-mybids') || {}; }
  function rememberBid(itemId, amount, bidId) {
    const m = myBids(); if (!m[itemId] || amount >= m[itemId].amount) m[itemId] = { amount: amount, bidId: bidId, time: Date.now() };
    store('lctw-auction-mybids', m);
  }

  // ---------- countdown / status text ----------
  function statusText() {
    const st = STATE.settings || {};
    if (isClosed()) return { closed: true, text: 'Bidding has closed — thank you!' };
    if (!st.endsAt) return { closed: false, text: 'Bidding is open' };
    const ms = st.endsAt - now();
    const d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24, m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
    let left;
    if (d > 0) left = d + 'd ' + h + 'h';
    else if (h > 0) left = h + 'h ' + m + 'm';
    else left = m + 'm ' + String(s).padStart(2, '0') + 's';
    const at = new Date(st.endsAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    return { closed: false, text: 'Bidding closes in ' + left + ' (' + at + ')' };
  }
  function mountStatus(el) {
    function draw() {
      const s = statusText();
      el.classList.toggle('closed', s.closed);
      el.innerHTML = '<span class="dot"></span>' + esc(s.text);
    }
    draw(); setInterval(draw, 1000); onState(draw);
  }

  // ---------- header / footer ----------
  function renderChrome(active) {
    const top = document.createElement('header');
    top.className = 'topbar';
    top.innerHTML =
      '<div class="topbar-inner">' +
      '<a class="brand" href="index.html"><img src="assets/lctw-logo.png" alt="LCTW logo"><span>LCTW Silent Auction</span></a>' +
      '<div class="spacer"></div>' +
      '<nav class="topnav">' +
      '<a href="index.html"' + (active === 'gallery' ? ' class="active"' : '') + '>All art</a>' +
      '<a href="index.html#mine"' + (active === 'mine' ? ' class="active"' : '') + '>My bids</a>' +
      '</nav></div>';
    document.body.prepend(top);
    if (DEMO) {
      const b = document.createElement('div');
      b.className = 'demo-banner';
      b.innerHTML = '<strong>Demo mode:</strong> bids are only saved on this device. Add your Google Apps Script URL in <code>assets/config.js</code> to go live.';
      const page = $('.page'); if (page) page.prepend(b);
    }
    const f = document.createElement('footer');
    f.className = 'footer no-print';
    f.innerHTML = '<div class="footer-host"><span>Hosted by</span><img src="assets/le-charme-logo.jpg" alt="Le Charme Vientiane Hotel"></div>' +
      'Lao Conservation Trust for Wildlife · All proceeds support wildlife rescue and conservation in Laos';
    document.body.appendChild(f);
  }

  // ---------- Bid form (used in a pop-up sheet or inline) ----------
  function bidFormHtml(it) {
    const me = store('lctw-auction-me') || {};
    return '' +
      '<form class="bid-form" novalidate>' +
      '<div class="form-msg"></div>' +
      '<label class="field"><span>Your bid <em>*</em> <small class="min-note"></small></span>' +
      '<div class="amount-wrap"><span class="cur">' + esc(CFG.currencySymbol || '') + '</span>' +
      '<input type="number" name="amount" inputmode="decimal" min="0" step="any" required autocomplete="off"></div>' +
      '<div class="quick-amounts"></div></label>' +
      '<label class="field"><span>Full name <em>*</em></span><input type="text" name="name" required autocomplete="name" maxlength="80" value="' + esc(me.name || '') + '"></label>' +
      '<label class="field"><span>Phone number <em>*</em> <small>(so we can contact the winner)</small></span><input type="tel" name="phone" required autocomplete="tel" maxlength="30" value="' + esc(me.phone || '') + '"></label>' +
      '<label class="field"><span>Email <small>(optional)</small></span><input type="email" name="email" autocomplete="email" maxlength="120" value="' + esc(me.email || '') + '"></label>' +
      '<label class="check"><input type="checkbox" name="anonymous"' + (me.anonymous ? ' checked' : '') + '><span>Show me as <b>Anonymous</b> on the public bid list</span></label>' +
      '<label class="check"><input type="checkbox" name="remember"' + (me.name || !store('lctw-auction-me') ? ' checked' : '') + '><span>Remember my details on this device</span></label>' +
      '<button class="btn block" type="submit">Place bid</button>' +
      '<p class="muted small" style="margin:.7rem 0 0;text-align:center">Your phone number is only seen by the LCTW auction team. Bids are binding.</p>' +
      '</form>';
  }

  function wireBidForm(form, it, onDone) {
    const amount = form.elements.amount;
    const msg = $('.form-msg', form);
    const btn = $('button[type=submit]', form);

    function updateMin() {
      const i = info(it);
      $('.min-note', form).textContent = '(minimum ' + money(i.minimum) + ')';
      amount.min = i.minimum;
      if (!amount.value || Number(amount.value) < i.minimum) amount.placeholder = String(i.minimum);
      const q = $('.quick-amounts', form);
      const inc = Number(it.minIncrement);
      const opts = [i.minimum, i.minimum + inc, i.minimum + inc * 3];
      q.innerHTML = opts.map(function (v) { return '<button type="button" class="btn secondary small" data-v="' + v + '">' + money(v) + '</button>'; }).join('');
      if (isClosed()) { btn.disabled = true; btn.textContent = 'Bidding has closed'; }
    }
    updateMin(); onState(updateMin);
    form.addEventListener('click', function (e) {
      const b = e.target.closest('[data-v]'); if (!b) return;
      amount.value = b.dataset.v; amount.classList.remove('invalid');
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      msg.innerHTML = '';
      $$('.invalid', form).forEach(function (x) { x.classList.remove('invalid'); });
      const i = info(it);
      const data = {
        amount: Number(amount.value),
        name: form.elements.name.value.trim(),
        phone: form.elements.phone.value.trim(),
        email: form.elements.email.value.trim(),
        anonymous: form.elements.anonymous.checked,
      };
      const errors = [];
      if (!amount.value || !(data.amount > 0)) { errors.push('Enter your bid amount.'); amount.classList.add('invalid'); }
      else if (data.amount < i.minimum) { errors.push('Your bid must be at least ' + money(i.minimum) + '.'); amount.classList.add('invalid'); }
      if (data.name.length < 2) { errors.push('Enter your full name.'); form.elements.name.classList.add('invalid'); }
      if (data.phone.replace(/\D/g, '').length < 6) { errors.push('Enter a phone number we can reach you on.'); form.elements.phone.classList.add('invalid'); }
      if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) { errors.push('Check your email address.'); form.elements.email.classList.add('invalid'); }
      if (errors.length) { msg.innerHTML = '<div class="alert error">' + errors.map(esc).join('<br>') + '</div>'; const f = $('.invalid', form); if (f) f.focus(); return; }

      // Catch typos like an extra zero
      if (data.amount >= Math.max(i.minimum * 3, i.minimum + Number(it.minIncrement) * 10) &&
          !confirm('Please confirm: bid ' + money(data.amount) + ' on "' + it.title + '"?')) return;

      if (form.elements.remember.checked) store('lctw-auction-me', { name: data.name, phone: data.phone, email: data.email, anonymous: data.anonymous });
      else store('lctw-auction-me', null);

      btn.disabled = true; btn.textContent = 'Placing bid…';
      api.post(Object.assign({ action: 'bid', itemId: it.id, itemTitle: 'Lot ' + it.lot + ' — ' + it.title, startingBid: it.startingBid, minIncrement: it.minIncrement }, data))
        .then(function (res) {
          rememberBid(it.id, data.amount, res.bidId);
          if (res.state) setState(res.state);
          onDone && onDone(data);
        })
        .catch(function (err) {
          msg.innerHTML = '<div class="alert error">' + esc(err.message || 'Could not place bid. Check your connection and try again.') + '</div>';
          refresh();
        })
        .finally(function () { btn.disabled = false; btn.textContent = 'Place bid'; updateMin(); });
    });
  }

  function successHtml(it, data) {
    return '<div class="success-box">' +
      '<div class="big-check"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>' +
      '<h2>You’re the top bidder!</h2>' +
      '<p>Your bid of <b>' + money(data.amount) + '</b> on <b>' + esc(it.title) + '</b> is in. We’ll call <b>' + esc(data.phone) + '</b> if you win.</p>' +
      '<p class="muted small">Check back on this page — it shows if someone outbids you.</p>' +
      '</div>';
  }

  // Pop-up bid sheet
  function openBidSheet(it) {
    let modal = $('#bid-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'bid-modal'; modal.className = 'modal';
      modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
      modal.innerHTML = '<div class="sheet"></div>';
      document.body.appendChild(modal);
      modal.addEventListener('click', function (e) { if (e.target === modal || e.target.closest('.close-x, [data-close]')) closeBidSheet(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeBidSheet(); });
    }
    const i = info(it);
    const sheet = $('.sheet', modal);
    sheet.innerHTML =
      '<div class="sheet-head"><img src="' + esc(thumb(it)) + '" alt=""><div><div class="kicker">Lot ' + esc(it.lot) + '</div><h2>' + esc(it.title) + '</h2>' +
      '<div class="muted small">' + (i.count ? 'Current bid ' + money(i.high) + ' · ' + i.count + ' bid' + (i.count > 1 ? 's' : '') : 'No bids yet · starts at ' + money(it.startingBid)) + '</div></div>' +
      '<button class="close-x" aria-label="Close">×</button></div>' + bidFormHtml(it);
    wireBidForm($('form', sheet), it, function (data) {
      sheet.innerHTML = successHtml(it, data) + '<button class="btn block" data-close>Done</button>' +
        '<a class="btn secondary block" style="margin-top:.5rem" href="' + esc(itemUrl(it)) + '">View this artwork</a>';
    });
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(function () { const a = $('input[name=amount]', sheet); if (a && window.matchMedia('(min-width: 600px)').matches) a.focus(); }, 50);
  }
  function closeBidSheet() {
    const m = $('#bid-modal'); if (!m) return;
    m.classList.remove('open'); document.body.style.overflow = '';
  }

  function mineTag(i) {
    if (i.mine === 'winning') return '<span class="tag ok">★ You’re winning</span>';
    if (i.mine === 'outbid') return '<span class="tag bad">You’ve been outbid</span>';
    return '';
  }

  window.Auction = {
    CFG: CFG, ITEMS: ITEMS, DEMO: DEMO, api: api,
    $: $, $$: $$, esc: esc, money: money, store: store, toast: toast, timeAgo: timeAgo,
    itemById: itemById, thumb: thumb, full: full, itemUrl: itemUrl, siteBase: siteBase,
    refresh: refresh, onState: onState, startPolling: startPolling, getState: function () { return STATE; },
    info: info, isClosed: isClosed, myBids: myBids, mountStatus: mountStatus, renderChrome: renderChrome,
    bidFormHtml: bidFormHtml, wireBidForm: wireBidForm, successHtml: successHtml, openBidSheet: openBidSheet, mineTag: mineTag,
  };
})();
