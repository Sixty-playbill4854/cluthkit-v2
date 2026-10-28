(function () {
  'use strict';
  var KEY = 'clutchkit.v1';
  var SENS = [['general', 'General'], ['redDot', 'Red Dot'], ['scope2x', '2x Scope'], ['scope4x', '4x Scope'], ['sniper', 'Sniper Scope'], ['gyro', 'Gyro / Free Look']];
  var $ = function (id) { return document.getElementById(id); };
  var ui = { tab: 'session', modal: false, onOk: null, pending: null, rating: 0 };
  var state = load();

  /* ---------- helpers ---------- */
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v, d, lo, hi) { v = Number(v); if (!isFinite(v)) return d; return Math.min(hi, Math.max(lo, v)); }
  function str(v, n) { return String(v == null ? '' : v).trim().slice(0, n); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtClock(ms) { var s = Math.floor(ms / 1000); return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s % 3600 / 60)) + ':' + pad(s % 60); }
  function fmtDur(ms) { var m = Math.round(ms / 60000), h = Math.floor(m / 60); if (h) return h + 'h ' + pad(m % 60) + 'm'; if (m) return m + 'm'; return Math.round(ms / 1000) + 's'; }
  function fmtDate(t) { var d = new Date(t); return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function stars(n) { return '<span class="star">' + '\u2605'.repeat(n) + '\u2606'.repeat(5 - n) + '</span>'; }
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 2600); }

  /* ---------- data / storage ---------- */
  function blank() { return { version: 1, profiles: [], sessions: [], active: null }; }
  function cleanProfile(p) {
    if (!p || typeof p !== 'object') return null;
    var sens = {}, src = p.sens && typeof p.sens === 'object' ? p.sens : {};
    SENS.forEach(function (f) { sens[f[0]] = Math.round(num(src[f[0]], 50, 0, 200)); });
    return { id: str(p.id, 40) || uid(), name: str(p.name, 60) || 'Untitled', game: str(p.game, 60), device: str(p.device, 60), dpi: p.dpi === '' || p.dpi == null ? '' : Math.round(num(p.dpi, 0, 0, 100000)) || '', notes: str(p.notes, 500), sens: sens, createdAt: num(p.createdAt, Date.now(), 0, 9e15), updatedAt: num(p.updatedAt, Date.now(), 0, 9e15) };
  }
  function cleanSession(s) {
    if (!s || typeof s !== 'object') return null;
    var a = Number(s.startedAt), b = Number(s.endedAt);
    if (!isFinite(a) || !isFinite(b) || b < a) return null;
    return { id: str(s.id, 40) || uid(), profileId: str(s.profileId, 40), profileName: str(s.profileName, 60), game: str(s.game, 60), startedAt: a, endedAt: b, rating: Math.round(num(s.rating, 0, 0, 5)), note: str(s.note, 500) };
  }
  function cleanActive(a) {
    if (!a || typeof a !== 'object' || !isFinite(Number(a.startedAt))) return null;
    return { id: str(a.id, 40) || uid(), profileId: str(a.profileId, 40), profileName: str(a.profileName, 60), game: str(a.game, 60), startedAt: Number(a.startedAt), note: str(a.note, 500) };
  }
  function normalize(o) {
    o = o && typeof o === 'object' ? o : {};
    return { version: 1, profiles: (Array.isArray(o.profiles) ? o.profiles : []).map(cleanProfile).filter(Boolean), sessions: (Array.isArray(o.sessions) ? o.sessions : []).map(cleanSession).filter(Boolean), active: cleanActive(o.active) };
  }
  function load() { try { var r = localStorage.getItem(KEY); return r ? normalize(JSON.parse(r)) : blank(); } catch (e) { return blank(); } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast('Could not save data'); } }
  function profileById(id) { return state.profiles.filter(function (p) { return p.id === id; })[0]; }

  /* ---------- modal ---------- */
  function openModal(html) {
    var m = $('modal'); m.innerHTML = '<div class="sheet">' + html + '</div>'; m.hidden = false;
    if (!ui.modal) { ui.modal = true; try { history.pushState({ m: 1 }, ''); } catch (e) {} }
  }
  function closeModal(fromPop) {
    if (!ui.modal) return;
    ui.modal = false; ui.onOk = null; $('modal').hidden = true; $('modal').innerHTML = '';
    if (!fromPop && history.state && history.state.m) history.back();
  }
  window.addEventListener('popstate', function () { if (ui.modal) closeModal(true); });
  function confirmBox(title, msg, okLabel, onOk, danger) {
    ui.onOk = onOk;
    openModal('<h3>' + esc(title) + '</h3><p class="mute">' + esc(msg) + '</p><div class="row"><button class="btn ghost" data-act="close">Cancel</button><button class="btn' + (danger ? ' danger' : '') + '" data-act="ok">' + esc(okLabel) + '</button></div>');
  }

  /* ---------- views ---------- */
  function render() {
    Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) { b.classList.toggle('on', b.dataset.tab === ui.tab); });
    var v = $('view'), h = '';
    if (ui.tab === 'session') h = viewSession();
    else if (ui.tab === 'profiles') h = viewProfiles();
    else if (ui.tab === 'history') h = viewHistory();
    else h = viewData();
    v.innerHTML = h;
    $('sub').textContent = state.profiles.length + ' profiles \u00B7 ' + state.sessions.length + ' sessions';
    tick();
  }
  function viewSession() {
    var a = state.active;
    if (a) {
      return '<h2>Live session</h2><div class="card"><div class="row sp"><span><span class="pulse"></span><b>' + esc(a.game || 'Gaming session') + '</b></span><span class="mute">' + esc(a.profileName || 'No profile') + '</span></div>' +
        '<div class="timer" id="timer">00:00:00</div><label>Session notes</label><textarea id="liveNote" maxlength="500" placeholder="Rank push, warm-up, settings tried...">' + esc(a.note) + '</textarea>' +
        '<div class="row" style="margin-top:12px"><button class="btn ghost" data-act="discard">Discard</button><button class="btn" style="flex:1" data-act="endSession">End session</button></div></div>' + sessionStats();
    }
    var opts = '<option value="">No profile</option>' + state.profiles.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>'; }).join('');
    var last = state.sessions.length ? state.sessions[state.sessions.length - 1].game : '';
    return '<h2>Start session</h2><div class="card"><label>Sensitivity profile</label><select id="selProfile">' + opts + '</select><label>Game</label><input type="text" id="selGame" maxlength="60" placeholder="e.g. Free Fire, BGMI, COD Mobile" value="' + esc(last) + '"><button class="btn block" style="margin-top:16px" data-act="startSession">\u25B6 Start session</button></div>' + sessionStats();
  }
  function sessionStats() {
    var now = new Date(), d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(), today = 0, total = 0;
    state.sessions.forEach(function (s) { var d = s.endedAt - s.startedAt; total += d; if (s.startedAt >= d0) today += d; });
    return '<div class="stats"><div class="stat"><b>' + fmtDur(today) + '</b><small>Today</small></div><div class="stat"><b>' + fmtDur(total) + '</b><small>Total</small></div><div class="stat"><b>' + state.sessions.length + '</b><small>Sessions</small></div></div>';
  }
  function viewProfiles() {
    var h = '<div class="row sp"><h2>Profiles</h2><button class="btn sm" data-act="newProfile">+ New</button></div>';
    if (!state.profiles.length) return h + '<div class="empty">No sensitivity profiles yet.<br>Create one to keep your settings safe.</div>';
    return h + state.profiles.map(function (p) {
      var chips = SENS.map(function (f) { return '<span class="chip">' + f[1] + ' <b>' + p.sens[f[0]] + '</b></span>'; }).join('');
      return '<div class="card" data-id="' + esc(p.id) + '"><div class="row sp"><h3>' + esc(p.name) + '</h3><span class="mute">' + esc(p.game) + '</span></div>' +
        ((p.device || p.dpi) ? '<div class="mute">' + esc(p.device) + (p.dpi ? ' \u00B7 ' + esc(p.dpi) + ' DPI' : '') + '</div>' : '') +
        '<div class="chips">' + chips + '</div>' + (p.notes ? '<div class="mute">' + esc(p.notes) + '</div>' : '') +
        '<div class="row" style="margin-top:10px"><button class="btn ghost sm" data-act="editProfile">Edit</button><button class="btn ghost sm" data-act="dupProfile">Duplicate</button><button class="btn danger sm" data-act="delProfile">Delete</button></div></div>';
    }).join('');
  }
  function viewHistory() {
    var h = '<h2>History</h2>' + sessionStats();
    if (!state.sessions.length) return h + '<div class="empty">No sessions logged yet.</div>';
    return h + state.sessions.slice().sort(function (a, b) { return b.startedAt - a.startedAt; }).map(function (s) {
      return '<div class="card" data-id="' + esc(s.id) + '"><div class="row sp"><h3>' + esc(s.game || 'Gaming session') + '</h3><b>' + fmtDur(s.endedAt - s.startedAt) + '</b></div>' +
        '<div class="mute">' + fmtDate(s.startedAt) + (s.profileName ? ' \u00B7 ' + esc(s.profileName) : '') + '</div>' + (s.rating ? '<div>' + stars(s.rating) + '</div>' : '') +
        (s.note ? '<div class="mute" style="margin-top:6px">' + esc(s.note) + '</div>' : '') + '<div class="row" style="margin-top:8px"><button class="btn danger sm" data-act="delSession">Delete</button></div></div>';
    }).join('');
  }
  function viewData() {
    return '<h2>Backup &amp; restore</h2><div class="card"><p class="mute">All data lives only on this phone. Save a backup file before uninstalling or switching phones.</p>' +
      '<div class="row"><button class="btn" data-act="export">Save backup file</button><button class="btn ghost" data-act="copy">Copy JSON</button></div></div>' +
      '<div class="card"><h3>Restore</h3><div class="row"><button class="btn ghost" data-act="pickFile">Choose backup file</button><button class="btn ghost" data-act="pasteRestore">Paste JSON</button></div></div>' +
      '<div class="card"><h3>Danger zone</h3><div class="row"><button class="btn danger sm" data-act="clearHistory">Clear history</button><button class="btn danger sm" data-act="wipe">Erase everything</button></div></div>' +
      '<div class="card"><h3>About</h3><p class="mute">ClutchKit v1.0 \u00B7 fully offline \u00B7 no account, ads, analytics or network access.</p></div>';
  }
  function tick() {
    var t = $('timer'); if (t && state.active) t.textContent = fmtClock(Date.now() - state.active.startedAt);
  }
  setInterval(tick, 1000);

  /* ---------- profile form ---------- */
  function profileForm(p) {
    var isNew = !p; p = p || cleanProfile({ name: '' });
    ui.editId = isNew ? null : p.id;
    var rows = SENS.map(function (f) { return '<div class="sens"><span>' + f[1] + '</span><input type="range" min="0" max="200" data-k="' + f[0] + '" value="' + p.sens[f[0]] + '"><output>' + p.sens[f[0]] + '</output></div>'; }).join('');
    openModal('<h3>' + (isNew ? 'New profile' : 'Edit profile') + '</h3><label>Name</label><input type="text" id="pName" maxlength="60" value="' + esc(isNew ? '' : p.name) + '" placeholder="e.g. Ranked main">' +
      '<label>Game</label><input type="text" id="pGame" maxlength="60" value="' + esc(p.game) + '"><label>Device</label><input type="text" id="pDevice" maxlength="60" value="' + esc(p.device) + '">' +
      '<label>DPI</label><input type="number" id="pDpi" inputmode="numeric" value="' + esc(p.dpi) + '"><label>Sensitivity (0\u2013200)</label>' + rows +
      '<label>Notes</label><textarea id="pNotes" maxlength="500">' + esc(p.notes) + '</textarea><div class="row" style="margin-top:14px"><button class="btn ghost" data-act="close">Cancel</button><button class="btn" style="flex:1" data-act="saveProfile">Save</button></div>');
  }
  function saveProfile() {
    var name = str($('pName').value, 60);
    if (!name) { toast('Give the profile a name'); return; }
    var sens = {}; Array.prototype.forEach.call($('modal').querySelectorAll('input[data-k]'), function (i) { sens[i.dataset.k] = i.value; });
    var existing = ui.editId ? profileById(ui.editId) : null;
    var p = cleanProfile({ id: existing ? existing.id : uid(), name: name, game: $('pGame').value, device: $('pDevice').value, dpi: $('pDpi').value, notes: $('pNotes').value, sens: sens, createdAt: existing ? existing.createdAt : Date.now(), updatedAt: Date.now() });
    if (existing) state.profiles[state.profiles.indexOf(existing)] = p; else state.profiles.push(p);
    save(); closeModal(); render(); toast('Profile saved');
  }

  /* ---------- sessions ---------- */
  function startSession() {
    var pid = $('selProfile').value, p = profileById(pid), game = str($('selGame').value, 60) || (p ? p.game : '');
    state.active = { id: uid(), profileId: pid, profileName: p ? p.name : '', game: game, startedAt: Date.now(), note: '' };
    save(); render();
  }
  function endSessionForm() {
    ui.rating = 0;
    openModal('<h3>How did it go?</h3><div class="stars" id="stars">' + [1, 2, 3, 4, 5].map(function (n) { return '<button data-act="rate" data-n="' + n + '">\u2605</button>'; }).join('') + '</div><div class="row" style="margin-top:12px"><button class="btn ghost" data-act="close">Back</button><button class="btn" style="flex:1" data-act="finish">Save session</button></div>');
  }
  function finishSession() {
    var a = state.active; if (!a) { closeModal(); return; }
    var s = cleanSession({ id: a.id, profileId: a.profileId, profileName: a.profileName, game: a.game, startedAt: a.startedAt, endedAt: Date.now(), rating: ui.rating, note: a.note });
    state.sessions.push(s); state.active = null; save(); closeModal(); ui.tab = 'history'; render(); toast('Session saved');
  }

  /* ---------- backup / restore ---------- */
  function makeBackup() { return { app: 'ClutchKit', version: 1, exportedAt: new Date().toISOString(), data: { profiles: state.profiles, sessions: state.sessions, active: state.active } }; }
  function stamp() { var d = new Date(); return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()); }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return Promise.reject(new Error('no clipboard'));
  }
  async function exportBackup() {
    var text = JSON.stringify(makeBackup(), null, 2), name = 'ClutchKit-backup-' + stamp() + '.json';
    var cap = window.Capacitor, P = cap && cap.Plugins;
    if (cap && cap.isNativePlatform && cap.isNativePlatform() && P && P.Filesystem && P.Share) {
      try {
        var r = await P.Filesystem.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
        await P.Share.share({ title: 'ClutchKit backup', url: r.uri, dialogTitle: 'Save ClutchKit backup' });
        return;
      } catch (e) { if (e && /cancel/i.test(String(e.message || e))) return; }
    }
    try {
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name;
      document.body.appendChild(a); a.click(); a.remove(); toast('Backup downloaded');
    } catch (e) { copyText(text).then(function () { toast('Backup copied to clipboard'); }, function () { toast('Backup failed'); }); }
  }
  function parseBackup(text) {
    var o; try { o = JSON.parse(text); } catch (e) { return null; }
    var d = o && o.data && typeof o.data === 'object' ? o.data : o;
    if (!d || (!Array.isArray(d.profiles) && !Array.isArray(d.sessions))) return null;
    return normalize(d);
  }
  function offerRestore(text) {
    var b = parseBackup(text);
    if (!b) { toast('Not a valid ClutchKit backup'); return; }
    ui.pending = b;
    openModal('<h3>Restore backup</h3><p class="mute">Found ' + b.profiles.length + ' profiles and ' + b.sessions.length + ' sessions.</p><div class="row"><button class="btn ghost" data-act="close">Cancel</button><button class="btn ghost" data-act="merge">Merge</button><button class="btn danger" data-act="replace">Replace all</button></div>');
  }
  function applyRestore(mode) {
    var b = ui.pending; if (!b) return;
    if (mode === 'replace') { state = b; }
    else {
      var pi = {}, si = {}; state.profiles.forEach(function (p) { pi[p.id] = 1; }); state.sessions.forEach(function (s) { si[s.id] = 1; });
      b.profiles.forEach(function (p) { if (!pi[p.id]) state.profiles.push(p); });
      b.sessions.forEach(function (s) { if (!si[s.id]) state.sessions.push(s); });
      if (!state.active) state.active = b.active;
    }
    ui.pending = null; save(); closeModal(); render(); toast('Restore complete');
  }

  /* ---------- events ---------- */
  document.addEventListener('click', function (e) {
    var tb = e.target.closest('#tabs button'); if (tb) { ui.tab = tb.dataset.tab; render(); return; }
    var el = e.target.closest('[data-act]'); if (!el) return;
    var act = el.dataset.act, card = el.closest('[data-id]'), id = card && card.dataset.id;
    switch (act) {
      case 'close': closeModal(); break;
      case 'ok': var f = ui.onOk; closeModal(); if (f) f(); break;
      case 'newProfile': profileForm(null); break;
      case 'editProfile': profileForm(profileById(id)); break;
      case 'saveProfile': saveProfile(); break;
      case 'dupProfile': var p = profileById(id); if (p) { var c = cleanProfile(JSON.parse(JSON.stringify(p))); c.id = uid(); c.name = str(p.name + ' (copy)', 60); c.createdAt = c.updatedAt = Date.now(); state.profiles.splice(state.profiles.indexOf(p) + 1, 0, c); save(); render(); toast('Profile duplicated'); } break;
      case 'delProfile': var dp = profileById(id); if (dp) confirmBox('Delete profile?', '\u201C' + dp.name + '\u201D will be removed. Past sessions are kept.', 'Delete', function () { state.profiles = state.profiles.filter(function (x) { return x.id !== id; }); save(); render(); }, true); break;
      case 'startSession': startSession(); break;
      case 'endSession': endSessionForm(); break;
      case 'rate': ui.rating = Number(el.dataset.n); Array.prototype.forEach.call(document.querySelectorAll('#stars button'), function (b) { b.classList.toggle('on', Number(b.dataset.n) <= ui.rating); }); break;
      case 'finish': finishSession(); break;
      case 'discard': confirmBox('Discard session?', 'This session will not be saved.', 'Discard', function () { state.active = null; save(); render(); }, true); break;
      case 'delSession': confirmBox('Delete session?', 'This cannot be undone.', 'Delete', function () { state.sessions = state.sessions.filter(function (x) { return x.id !== id; }); save(); render(); }, true); break;
      case 'export': exportBackup(); break;
      case 'copy': copyText(JSON.stringify(makeBackup(), null, 2)).then(function () { toast('Backup copied'); }, function () { toast('Clipboard unavailable'); }); break;
      case 'pickFile': $('file').value = ''; $('file').click(); break;
      case 'pasteRestore': openModal('<h3>Paste backup JSON</h3><textarea id="pasteBox" style="min-height:160px"></textarea><div class="row" style="margin-top:12px"><button class="btn ghost" data-act="close">Cancel</button><button class="btn" data-act="doPaste">Continue</button></div>'); break;
      case 'doPaste': var t = $('pasteBox').value; closeModal(); offerRestore(t); break;
      case 'merge': applyRestore('merge'); break;
      case 'replace': applyRestore('replace'); break;
      case 'clearHistory': confirmBox('Clear history?', 'All logged sessions will be deleted.', 'Clear', function () { state.sessions = []; save(); render(); }, true); break;
      case 'wipe': confirmBox('Erase everything?', 'Profiles, sessions and the active session will be deleted. Make a backup first.', 'Erase', function () { state = blank(); save(); render(); }, true); break;
    }
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.matches && t.matches('input[type=range][data-k]')) t.nextElementSibling.textContent = t.value;
    if (t.id === 'liveNote' && state.active) { state.active.note = t.value.slice(0, 500); save(); }
  });
  $('file').addEventListener('change', function () {
    var f = this.files && this.files[0]; if (!f) return;
    var r = new FileReader(); r.onload = function () { offerRestore(String(r.result)); }; r.onerror = function () { toast('Could not read file'); }; r.readAsText(f);
  });
  window.__clutchkit = { get state() { return state; } };
  render();
})();
