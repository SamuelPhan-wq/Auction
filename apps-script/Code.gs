/**
 * LCTW Silent Auction — Google Sheets backend
 * ------------------------------------------------------------
 * 1. Create a new Google Sheet (e.g. "LCTW Auction Bids").
 * 2. Extensions → Apps Script. Delete the sample code, paste this whole file.
 * 3. Change ADMIN_PASSWORD below. Save.
 * 4. Deploy → New deployment → type "Web app".
 *      Execute as: Me      Who has access: Anyone
 *    Copy the Web app URL into assets/config.js (apiUrl).
 * When you change this code later: Deploy → Manage deployments → Edit → Version: New version.
 */

const ADMIN_PASSWORD = 'LCTW2018';   // <-- CHANGE THIS
const SHEET_NAME = 'Bids';
const HEADERS = ['Bid ID', 'Time', 'Lot ID', 'Lot title', 'Amount', 'Name', 'Phone', 'Email', 'Anonymous', 'Status'];
const HISTORY_LENGTH = 8;

// ---------- HTTP entry points ----------
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'state';
  try {
    if (action === 'state') return json_(publicState_());
    return json_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (_) { return json_({ ok: false, error: 'Bad request' }); }
  try {
    switch (body.action) {
      case 'bid':        return json_(placeBid_(body));
      case 'admin':      requireAdmin_(body); return json_(adminData_());
      case 'removeBid':  requireAdmin_(body); return json_(setBidStatus_(body.bidId, 'removed'));
      case 'restoreBid': requireAdmin_(body); return json_(setBidStatus_(body.bidId, 'active'));
      case 'settings':   requireAdmin_(body); return json_(saveSettings_(body));
      case 'rules':      requireAdmin_(body); return json_(saveRules_(body));
      default:           return json_({ ok: false, error: 'Unknown action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

// ---------- Bidding ----------
function placeBid_(b) {
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

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const settings = getSettings_();
    if (isClosed_(settings)) throw new Error('Sorry — bidding has closed.');

    const bids = activeBids_().filter(function (r) { return r.itemId === itemId; });
    const high = bids.reduce(function (m, r) { return Math.max(m, r.amount); }, 0);
    const minimum = bids.length ? high + minIncrement : startingBid;
    if (amount < minimum) {
      throw new Error(bids.length
        ? 'Someone just bid! The minimum bid is now ' + minimum + '.'
        : 'The starting bid is ' + minimum + '.');
    }

    const id = Utilities.getUuid().slice(0, 8);
    sheet_().appendRow([id, new Date(), itemId, safe_(itemTitle), amount, safe_(name), "'" + phone, safe_(email), anonymous, 'active']);
    CacheService.getScriptCache().remove('state');
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
    if (hit) return JSON.parse(hit);
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
  const state = { ok: true, items: items, settings: getSettings_(), rules: getRules_(), serverTime: Date.now() };
  state.settings.isClosed = isClosed_(state.settings);
  try { cache.put('state', JSON.stringify(state), 5); } catch (_) {}
  return state;
}

// ---------- Admin ----------
function requireAdmin_(b) {
  if (String(b.key || '') !== ADMIN_PASSWORD) throw new Error('Wrong admin password.');
}

function adminData_() {
  const rows = allBids_().map(function (r) {
    return { id: r.id, time: r.time.getTime(), itemId: r.itemId, itemTitle: r.itemTitle, amount: r.amount,
             name: r.name, phone: r.phone, email: r.email, anonymous: !!r.anonymous, status: r.status };
  });
  const settings = getSettings_();
  settings.isClosed = isClosed_(settings);
  return { ok: true, bids: rows, settings: settings, rules: getRules_(), serverTime: Date.now(),
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
  return { closed: p.getProperty('closed') === 'yes', endsAt: Number(p.getProperty('endsAt')) || null };
}
function isClosed_(s) { return s.closed || (s.endsAt && Date.now() >= s.endsAt); }

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
  const sh = sheet_();
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS.length).getValues().map(function (v) {
    return { id: String(v[0]), time: new Date(v[1]), itemId: String(v[2]), itemTitle: String(v[3]),
             amount: Number(v[4]) || 0, name: String(v[5]), phone: String(v[6]), email: String(v[7]),
             anonymous: String(v[8]) === 'yes', status: String(v[9] || 'active') };
  });
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
