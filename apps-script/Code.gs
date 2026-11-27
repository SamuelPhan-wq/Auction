/**
 * LCTW Silent Auction — Google Sheets backend
 * ------------------------------------------------------------
 * 1. Create a new Google Sheet (e.g. "LCTW Auction Bids").
 * 2. Extensions → Apps Script. Delete the sample code, paste this whole file.
 * 3. Save. Then set the admin password: ⚙️ Project Settings → Script properties →
 *    Add script property → Property: ADMIN_PASSWORD   Value: your password → Save.
 *    (Keeping it there means pasting new code never wipes or publishes it.)
 * 4. Deploy → New deployment → type "Web app".
 *      Execute as: Me      Who has access: Anyone
 *    Copy the Web app URL into assets/config.js (apiUrl).
 * When you change this code later: Deploy → Manage deployments → Edit → Version: New version.
 */

// Leave this as is. Set the real password in Project Settings → Script properties (ADMIN_PASSWORD).
const ADMIN_PASSWORD = 'change-me-please';
const SHEET_NAME = 'Bids';
const HEADERS = ['Bid ID', 'Time', 'Lot ID', 'Lot title', 'Amount', 'Name', 'Phone', 'Email', 'Anonymous', 'Status'];
const HISTORY_LENGTH = 8;
// Bids that REACH the server up to this many seconds after the closing time are still accepted. It
// absorbs slow phone networks and the queue of last-second bids (Apps Script handles them one by one).
const CLOSE_GRACE_SECONDS = 5;
// How long a guest-facing snapshot is reused. Any change (bid, admin action) clears it immediately.
const STATE_CACHE_SECONDS = 20;
// Sheet rows read once per request instead of several times
let BIDS_MEMO = null;

// ---------- HTTP entry points ----------
function doGet(e) {
  BIDS_MEMO = null;
  const action = (e && e.parameter && e.parameter.action) || 'state';
  try {
    if (action === 'state') return json_(publicState_());
    return json_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  const receivedAt = Date.now();   // when the request arrived, before waiting in the bid queue
  BIDS_MEMO = null;
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (_) { return json_({ ok: false, error: 'Bad request' }); }
  try {
    switch (body.action) {
      case 'bid':        return json_(placeBid_(body, receivedAt));
      case 'admin':      requireAdmin_(body); return json_(adminData_());
      case 'removeBid':  requireAdmin_(body); return json_(setBidStatus_(body.bidId, 'removed'));
      case 'restoreBid': requireAdmin_(body); return json_(setBidStatus_(body.bidId, 'active'));
      case 'settings':   requireAdmin_(body); return json_(saveSettings_(body));
      case 'rules':      requireAdmin_(body); return json_(saveRules_(body));
      case 'order':      requireAdmin_(body); return json_(saveOrder_(body));
      case 'lockLots':   requireAdmin_(body); return json_(setLotsLocked_(body));
      case 'removeArt':  requireAdmin_(body); return json_(setArtRemoved_(body));
      case 'start':      requireAdmin_(body); return json_(setStarted_(body));
      case 'reset':      requireAdmin_(body); return json_(resetAuction_(body));
      default:           return json_({ ok: false, error: 'Unknown action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

// ---------- Bidding ----------
function placeBid_(b, receivedAt) {
  const itemId = String(b.itemId || '').trim();
  const itemTitle = clean_(b.itemTitle, 120);
  const name = clean_(b.name, 80);
  const phone = clean_(b.phone, 30);
  const email = clean_(b.email, 120);
  const anonymous = b.anonymous ? 'yes' : '';
  const amount = Math.round(Number(b.amount) * 100) / 100;
  // Rules set on the admin page win; otherwise use the values from items.js / config.js
  const rule = ruleFor_(itemId);
  const startingBid = rule.startingBid != null ? rule.startingBid : Math.max(0, Number(b.startingBid) || 0);
  const minIncrement = rule.minIncrement != null ? rule.minIncrement : Math.max(1, Number(b.minIncrement) || 1);

  if (!/^[a-z0-9-]{1,60}$/.test(itemId)) throw new Error('Unknown artwork.');
  if (name.length < 2) throw new Error('Please enter your name.');
  if (phone.replace(/\D/g, '').length < 6) throw new Error('Please enter a valid phone number.');
  if (!isFinite(amount) || amount <= 0) throw new Error('Please enter a bid amount.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('That email address does not look right.');

  const requestId = String(b.requestId || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40);
  const lock = LockService.getScriptLock();
  try { lock.waitLock(20000); }
  catch (_) { throw new Error('The auction is very busy right now. Please press Place bid again.'); }
  try {
    const cache = CacheService.getScriptCache();
    // A retry of a bid that already went through (e.g. the reply was lost on a weak connection)
    // must not create a second bid.
    if (requestId) {
      const seen = cache.get('req-' + requestId);
      if (seen) return { ok: true, bidId: seen, state: publicState_(true) };
    }
    if (getRemoved_().indexOf(itemId) >= 0) throw new Error('This artwork is no longer in the auction.');
    const settings = getSettings_();
    if (isClosed_(settings, (receivedAt || Date.now()) - CLOSE_GRACE_SECONDS * 1000)) throw new Error('Sorry — bidding has closed.');
    if (!settings.started) throw new Error('Bidding has not started yet.');

    const bids = activeBids_().filter(function (r) { return r.itemId === itemId; });
    const high = bids.reduce(function (m, r) { return Math.max(m, r.amount); }, 0);
    const minimum = bids.length ? high + minIncrement : startingBid;
    if (amount < minimum) {
      throw new Error(bids.length
        ? 'Someone just bid! The minimum bid is now ' + minimum + '.'
        : 'The starting bid is ' + minimum + '.');
    }

    const id = Utilities.getUuid().slice(0, 8);
    const now = new Date();
    sheet_().appendRow([id, now, itemId, safe_(itemTitle), amount, safe_(name), "'" + phone, safe_(email), anonymous, 'active']);
    // keep this request's copy of the rows current instead of reading the sheet again
    if (BIDS_MEMO) BIDS_MEMO.push({ id: id, time: now, itemId: itemId, itemTitle: itemTitle, amount: amount, name: name,
                                    phone: phone, email: email, anonymous: !!anonymous, status: 'active' });
    if (requestId) cache.put('req-' + requestId, id, 600);
    cache.remove('state');
    return { ok: true, bidId: id, state: publicState_(true) };
  } finally {
    lock.releaseLock();
  }
}

// ---------- Public view (never includes phone or email) ----------
function publicState_(skipCache) {
  const cache = CacheService.getScriptCache();
  if (!skipCache) {
    const hit = cache.get('state');
    if (hit) {
      const cached = JSON.parse(hit);
      cached.serverTime = Date.now();                       // clocks/countdowns must never run on old time
      cached.settings.isClosed = isClosed_(cached.settings);
      return cached;
    }
  }
  const items = {};
  activeBids_().forEach(function (r) {
    const it = items[r.itemId] || (items[r.itemId] = { high: 0, highName: '', count: 0, history: [] });
    it.count++;
    const shown = r.anonymous ? 'Anonymous' : shortName_(r.name);
    if (r.amount > it.high) { it.high = r.amount; it.highName = shown; }
    it.history.push({ amount: r.amount, name: shown, time: r.time.getTime(), id: r.id });
  });
  Object.keys(items).forEach(function (k) {
    items[k].history.sort(function (a, b) { return b.amount - a.amount; });
    items[k].history = items[k].history.slice(0, HISTORY_LENGTH);
  });
  const state = { ok: true, items: items, settings: getSettings_(), rules: getRules_(),
                  order: getOrder_(), removed: getRemoved_(), lotsLocked: lotsLocked_(), serverTime: Date.now() };
  state.settings.isClosed = isClosed_(state.settings);
  try { cache.put('state', JSON.stringify(state), STATE_CACHE_SECONDS); } catch (_) {}
  return state;
}

// ---------- Admin ----------
function requireAdmin_(b) {
  const pw = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD') || ADMIN_PASSWORD;
  if (!pw || pw === 'change-me-please') {
    throw new Error('Admin password not set. In Apps Script: Project Settings → Script properties → add ADMIN_PASSWORD.');
  }
  if (String(b.key || '') !== pw) throw new Error('Wrong admin password.');
}

function adminData_() {
  const rows = allBids_().map(function (r) {
    return { id: r.id, time: r.time.getTime(), itemId: r.itemId, itemTitle: r.itemTitle, amount: r.amount,
             name: r.name, phone: r.phone, email: r.email, anonymous: !!r.anonymous, status: r.status };
  });
  const settings = getSettings_();
  settings.isClosed = isClosed_(settings);
  return { ok: true, bids: rows, settings: settings, rules: getRules_(), order: getOrder_(), removed: getRemoved_(), lotsLocked: lotsLocked_(),
           lockedByBids: allBids_().length > 0, serverTime: Date.now(),
           sheetUrl: SpreadsheetApp.getActiveSpreadsheet().getUrl() };
}

function setBidStatus_(bidId, status) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = sheet_();
    const ids = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(bidId)) {
        sh.getRange(i + 2, HEADERS.indexOf('Status') + 1).setValue(status);
        BIDS_MEMO = null;
        CacheService.getScriptCache().remove('state');
        return adminData_();
      }
    }
    throw new Error('Bid not found.');
  } finally {
    lock.releaseLock();
  }
}

// ---------- Starting bids & increments set from the admin page ----------
// Stored as { defaults: {startingBid, minIncrement}, lots: { lotId: {startingBid, minIncrement} } }
function getRules_() {
  try {
    const r = JSON.parse(PropertiesService.getScriptProperties().getProperty('rules') || '{}');
    return { defaults: r.defaults || {}, lots: r.lots || {} };
  } catch (_) { return { defaults: {}, lots: {} }; }
}
function ruleFor_(itemId) {
  const r = getRules_();
  const lot = r.lots[itemId] || {};
  return {
    startingBid: lot.startingBid != null ? lot.startingBid : (r.defaults.startingBid != null ? r.defaults.startingBid : null),
    minIncrement: lot.minIncrement != null ? lot.minIncrement : (r.defaults.minIncrement != null ? r.defaults.minIncrement : null),
  };
}
function cleanRule_(x) {
  if (!x) return null;
  const out = {};
  if (x.title != null && String(x.title).trim()) out.title = clean_(x.title, 120);
  if (x.description != null && String(x.description).trim()) out.description = clean_(x.description, 600);
  if (x.startingBid !== '' && x.startingBid != null) {
    const s = Number(x.startingBid);
    if (!isFinite(s) || s < 0) throw new Error('Starting bid must be 0 or more.');
    out.startingBid = s;
  }
  if (x.minIncrement !== '' && x.minIncrement != null) {
    const m = Number(x.minIncrement);
    if (!isFinite(m) || m <= 0) throw new Error('Increment must be more than 0.');
    out.minIncrement = m;
  }
  return Object.keys(out).length ? out : null;
}
function saveRules_(b) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const r = getRules_();
    if ('defaults' in b) r.defaults = cleanRule_(b.defaults) || {};
    if (b.lotId) {
      if (!/^[a-z0-9-]{1,60}$/.test(String(b.lotId))) throw new Error('Unknown artwork.');
      const rule = cleanRule_(b.rule);
      if (rule) r.lots[b.lotId] = rule; else delete r.lots[b.lotId];
    }
    PropertiesService.getScriptProperties().setProperty('rules', JSON.stringify(r));
    CacheService.getScriptCache().remove('state');
    return adminData_();
  } finally {
    lock.releaseLock();
  }
}

// ---------- Lot order & locking ----------
// The order is a list of lot ids; a lot's number is its position in the list (1, 2, 3 ...).
// Lot numbers lock automatically once the first bid is placed, or when the admin locks them.
function getOrder_() {
  try {
    const o = JSON.parse(PropertiesService.getScriptProperties().getProperty('order') || '[]');
    return Array.isArray(o) ? o : [];
  } catch (_) { return []; }
}
// Bidding has started when the admin clicked Start bidding, or any bid exists (older auctions).
function started_() {
  return PropertiesService.getScriptProperties().getProperty('started') === 'yes' || allBids_().length > 0;
}
function lotsLocked_() {
  return PropertiesService.getScriptProperties().getProperty('lotsLocked') === 'yes' || started_();
}
// Wipes the auction back to "not started" without losing data: the Bids tab is renamed to
// "Bids archive <date>" and a fresh, empty Bids tab is created. Lot order, names, starting bids
// and the end time are kept.
function resetAuction_(b) {
  if (String(b.confirm || '') !== 'RESET') throw new Error('Type RESET to confirm.');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName(SHEET_NAME);
    let archived = '';
    if (sh && sh.getLastRow() > 1) {
      archived = 'Bids archive ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH.mm.ss');
      sh.setName(archived);
      BIDS_MEMO = null;
    }
    const p = PropertiesService.getScriptProperties();
    p.setProperty('started', '');
    p.setProperty('lotsLocked', '');
    p.setProperty('closed', '');
    p.setProperty('resetAt', String(Date.now()));
    CacheService.getScriptCache().remove('state');
    const data = adminData_();
    data.archived = archived;
    return data;
  } finally {
    lock.releaseLock();
  }
}

function setStarted_(b) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const p = PropertiesService.getScriptProperties();
    if (b.started) {
      p.setProperty('started', 'yes');
    } else {
      if (allBids_().length > 0) throw new Error('Bidding cannot be un-started once bids have been placed.');
      p.setProperty('started', '');
    }
    CacheService.getScriptCache().remove('state');
    return adminData_();
  } finally {
    lock.releaseLock();
  }
}
function saveOrder_(b) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (lotsLocked_()) throw new Error('Lot numbers are locked, so they cannot be changed now.');
    const ids = Array.isArray(b.order) ? b.order.map(String) : null;
    if (!ids || ids.length > 500) throw new Error('Bad lot order.');
    const seen = {};
    ids.forEach(function (id) {
      if (!/^[a-z0-9-]{1,60}$/.test(id) || seen[id]) throw new Error('Bad lot order.');
      seen[id] = true;
    });
    PropertiesService.getScriptProperties().setProperty('order', JSON.stringify(ids));
    CacheService.getScriptCache().remove('state');
    return adminData_();
  } finally {
    lock.releaseLock();
  }
}
// ---------- Removing artworks ----------
// An artwork can be taken out of the auction (and put back) until the lot numbers are locked, because
// removing one renumbers everything after it. Nothing is erased: the list of removed ids is just kept here.
function getRemoved_() {
  try {
    const r = JSON.parse(PropertiesService.getScriptProperties().getProperty('removed') || '[]');
    return Array.isArray(r) ? r : [];
  } catch (_) { return []; }
}
function setArtRemoved_(b) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (lotsLocked_()) throw new Error('Lot numbers are locked, so artworks cannot be removed or restored now.');
    const id = String(b.lotId || '');
    if (!/^[a-z0-9-]{1,60}$/.test(id)) throw new Error('Unknown artwork.');
    let list = getRemoved_().filter(function (x) { return x !== id; });
    if (b.removed) list.push(id);
    PropertiesService.getScriptProperties().setProperty('removed', JSON.stringify(list));
    CacheService.getScriptCache().remove('state');
    return adminData_();
  } finally {
    lock.releaseLock();
  }
}

function setLotsLocked_(b) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const p = PropertiesService.getScriptProperties();
    if (b.locked) {
      p.setProperty('lotsLocked', 'yes');
    } else {
      if (started_()) throw new Error('Lot numbers cannot be unlocked after bidding has started.');
      p.setProperty('lotsLocked', '');
    }
    CacheService.getScriptCache().remove('state');
    return adminData_();
  } finally {
    lock.releaseLock();
  }
}

function saveSettings_(b) {
  const p = PropertiesService.getScriptProperties();
  if ('closed' in b) p.setProperty('closed', b.closed ? 'yes' : '');
  if ('endsAt' in b) p.setProperty('endsAt', b.endsAt ? String(Number(b.endsAt)) : '');
  CacheService.getScriptCache().remove('state');
  return adminData_();
}

// ---------- Helpers ----------
function getSettings_() {
  const p = PropertiesService.getScriptProperties();
  return { closed: p.getProperty('closed') === 'yes', endsAt: Number(p.getProperty('endsAt')) || null, started: started_(),
           resetAt: Number(p.getProperty('resetAt')) || null };
}
function isClosed_(s, at) { return s.closed || (s.endsAt && (at || Date.now()) >= s.endsAt); }

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#1c7a66').setFontColor('#ffffff');
  }
  return sh;
}

function allBids_() {
  if (BIDS_MEMO) return BIDS_MEMO;
  const sh = sheet_();
  if (sh.getLastRow() < 2) return (BIDS_MEMO = []);
  BIDS_MEMO = sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS.length).getValues().map(function (v) {
    return { id: String(v[0]), time: new Date(v[1]), itemId: String(v[2]), itemTitle: String(v[3]),
             amount: Number(v[4]) || 0, name: String(v[5]), phone: String(v[6]), email: String(v[7]),
             anonymous: String(v[8]) === 'yes', status: String(v[9] || 'active') };
  });
  return BIDS_MEMO;
}
function activeBids_() { return allBids_().filter(function (r) { return r.status !== 'removed'; }); }

function shortName_(name) {
  const parts = String(name).trim().split(/\s+/);
  if (parts.length < 2) return parts[0] || 'Bidder';
  return parts[0] + ' ' + parts[parts.length - 1].charAt(0).toUpperCase() + '.';
}
function clean_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max); }
// Stop text like "=SUM(...)" being treated as a spreadsheet formula
function safe_(v) { return /^[=+\-@]/.test(v) ? "'" + v : v; }
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
