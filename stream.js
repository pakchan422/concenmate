// ===================== Study with me 直播（v1.227.0） =====================
// 主播開播、觀眾觀看及留言。影像經自建 LiveKit（live.concenmate.com）傳送；
// 開播、入場、留言、刪留言、封鎖全部經 Cloud Functions，前端不能直接寫入。
(function () {
  const LK_URL = 'https://cdn.jsdelivr.net/npm/livekit-client@2.22.4/dist/livekit-client.esm.mjs';
  const QUALITY = {
    '360p': { width: 480, height: 360, maxBitrate: 350000 },
    '480p': { width: 640, height: 480, maxBitrate: 600000 },
    '720p': { width: 1280, height: 720, maxBitrate: 1500000 }
  };
  let LK = null;
  let settings = { enabled: false, requiredDays: 30, minMinutesPerDay: 15, minStreamAge: 16 };
  let settingsUnsub = null, lobbyUnsub = null, chatUnsub = null, streamDocUnsub = null, blockedUnsub = null;
  let lobbyStreams = [];
  let initUid = null;
  // 目前狀態：mode = 'lobby' | 'host' | 'viewer'
  const st = { mode: 'lobby', room: null, streamId: null, stream: null, heartbeat: null, endTimer: null, micOn: false };

  const t = (k, fb) => (window.t ? window.t(k, fb) : fb);
  const esc = (s) => (window.escapeHtml ? window.escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s));
  const toast = (m, i) => window.showToast && window.showToast(m, i || '');
  const errText = (e) => (window.friendlyErrorText ? window.friendlyErrorText(e) : ((e && e.message) || String(e)));
  const isAdmin = () => typeof window.isCurrentUserAdmin === 'function' && window.isCurrentUserAdmin();
  const me = () => window.currentUser || {};
  const fresh = (s) => s && s.status === 'live' && typeof s.lastActiveAt === 'number' && (Date.now() - s.lastActiveAt) < 3 * 60 * 1000;

  // v1.227.3：直播與視訊溫習室只可以二選一
  window.swmIsBusy = function () { return st.mode !== 'lobby'; };
  function inStudyRoom() {
    return typeof window.isInStudyRoom === 'function' && window.isInStudyRoom();
  }
  function blockIfInRoom() {
    if (inStudyRoom()) { toast(t('stream.busyStream', '你正在視訊溫習室，請先退出溫習室再使用直播'), '⚠️'); return true; }
    return false;
  }

  async function loadLK() {
    if (!LK) LK = await import(LK_URL);
    return LK;
  }

  // ---------- 功能表顯示 ----------
  function canSee() {
    const u = me();
    if (!u.uid) return false;
    if (isAdmin()) return true;
    if (u.accountType === 'tutor' || u.role === 'tutor') return false;
    // v1.228.2：是否在功能表顯示，改由後台「功能表及圖示」控制（app-features.js 的 navVisibility）；
    // 總開關只決定按鈕可否點擊（見 isLocked）
    return true;
  }
  // 總開關關閉時，一般用戶的功能表按鈕變灰，不能點擊（管理員除外）。
  // 真正的權限檢查在伺服器（startStream／joinStream／sendStreamMessage 均會檢查總開關），
  // 用戶就算自行改動網頁亦無法開播或觀看。
  function isLocked() {
    return !isAdmin() && settings.enabled !== true;
  }
  // v1.227.5：記住上次是否顯示，重新載入時即時套用，避免功能表遲半秒才彈出
  const NAV_KEY = 'swmNavVisible';
  function refreshNav() {
    const btn = document.getElementById('nav-btn-stream');
    const show = canSee();
    if (btn) {
      btn.style.display = show ? '' : 'none';
      const locked = show && isLocked();
      btn.classList.toggle('nav-btn-locked', locked);
      btn.setAttribute('aria-disabled', locked ? 'true' : 'false');
      btn.title = locked ? t('stream.notOpen', '直播功能暫未開放') : '';
      if (locked && isTabOpen() && typeof window.switchTab === 'function') window.switchTab('home', document.getElementById('nav-btn-home'));
    }
    try { if (me().uid) localStorage.setItem(NAV_KEY, show ? '1' : '0'); else localStorage.removeItem(NAV_KEY); } catch (_) {}
  }
  // 灰色按鈕：攔截點擊（在 document 捕獲階段，早過按鈕本身的 onclick）
  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest && e.target.closest('#nav-btn-stream');
    if (btn && btn.classList.contains('nav-btn-locked')) {
      e.preventDefault(); e.stopImmediatePropagation();
      toast(t('stream.notOpen', '直播功能暫未開放'), '');
    }
  }, true);
  (function applyCachedNav() {
    let cached = null;
    try { cached = localStorage.getItem(NAV_KEY); } catch (_) {}
    if (cached !== '1') return;
    const apply = () => { const b = document.getElementById('nav-btn-stream'); if (b) b.style.display = ''; };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
  })();

  function init() {
    const u = me();
    if (!u.uid || !window.db || !window.fs) return;
    if (initUid === u.uid) { refreshNav(); return; }
    initUid = u.uid;
    if (settingsUnsub) settingsUnsub();
    settingsUnsub = window.fs.onSnapshot(window.fs.doc(window.db, 'admin_config', 'streaming'), (snap) => {
      settings = Object.assign({ enabled: false, requiredDays: 30, minMinutesPerDay: 15, minStreamAge: 16 }, snap.exists() ? snap.data() : {});
      refreshNav();
      if (st.mode === 'lobby' && isTabOpen()) renderLobby();
    }, () => {});
  }
  // 登入後盡快初始化（首 10 秒每 0.3 秒檢查一次，之後每 2 秒）
  let navTicks = 0;
  function navTick() {
    if (window.currentUser && window.currentUser.uid) init();
    else if (initUid) { initUid = null; refreshNav(); }
    navTicks++;
    setTimeout(navTick, navTicks < 33 ? 300 : 2000);
  }
  navTick();

  function isTabOpen() {
    const tab = document.getElementById('tab-stream');
    return !!(tab && tab.classList.contains('active'));
  }

  // ---------- 大廳 ----------
  window.openStreamTab = function () {
    init();
    if (isLocked()) {
      const box = document.getElementById('swm-root');
      if (box) box.innerHTML = `<p style="font-size:14px; color:var(--brand-700);">${esc(t('stream.notOpen', '直播功能暫未開放'))}</p>`;
      return;
    }
    if (st.mode === 'lobby') renderLobby();
    else renderStage();
  };

  function userAge(u) {
    const y = Number(u && u.birthYear);
    if (!Number.isFinite(y) || y < 1900) return null;
    const m = Number(u.birthMonth);
    const now = new Date();
    let age = now.getFullYear() - y;
    if (Number.isFinite(m) && m >= 1 && m <= 12 && now.getMonth() + 1 < m) age--;
    return age;
  }
  function eligibility() {
    const u = me();
    const days = typeof u.qualifiedDays === 'number' ? u.qualifiedDays : 0;
    const need = settings.requiredDays || 0;
    // v1.228.4：最低開播年齡（只影響開播，觀看不受限制）；伺服器 startStream 會再檢查
    const minAge = typeof settings.minStreamAge === 'number' ? settings.minStreamAge : 16;
    const age = userAge(u);
    const ageOk = minAge <= 0 || (age != null && age >= minAge);
    return { days, need, minAge, age, ageOk, ok: isAdmin() || (settings.enabled && ageOk && days >= need && u.streamBanned !== true) };
  }

  function renderLobby() {
    const box = document.getElementById('swm-root');
    if (!box) return;
    const el = eligibility();
    const testNote = !settings.enabled && isAdmin()
      ? `<p style="font-size:13px; color:#8a6d1f; background:#FFF7E6; border:1px solid #F0D9A0; border-radius:8px; padding:8px 10px; margin:0 0 12px;">${esc(t('stream.testMode', '測試模式：直播功能尚未開放，只有管理員可以開播及觀看。'))}</p>`
      : '';
    const startCard = el.ok
      ? `<button type="button" class="btn btn-primary" onclick="window.swmOpenStartForm()">${esc(t('stream.startBtn', '開始直播'))}</button>`
      // v1.228.2：未合資格亦顯示「開始直播」按鈕，但設為不可點擊；伺服器 startStream 會再檢查日數
      : `<div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
          <button type="button" class="btn btn-primary" disabled aria-disabled="true" style="opacity:.45; cursor:not-allowed;">${esc(t('stream.startBtn', '開始直播'))}</button>
          <p style="font-size:13px; color:var(--brand-700); margin:0; text-align:right;">${!el.ageOk
            ? esc((el.age == null ? t('stream.ageUnknownTemplate', '年滿 {age} 歲方可開始直播。你的帳戶未有出生年月資料，請電郵 support@concenmate.com 聯絡我們補填。') : t('stream.ageTemplate', '年滿 {age} 歲方可開始直播。')).replace('{age}', el.minAge))
            : esc(t('stream.progressTemplate', '累積溫習 {need} 日即可開始直播（現時 {days} 日；每日溫習滿 {min} 分鐘計一日）。').replace('{need}', el.need).replace('{days}', el.days).replace('{min}', settings.minMinutesPerDay || 15))}</p>
        </div>`;
    box.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
        <h2 style="font-size:18px; font-weight:bold; color:var(--brand-800); margin:0;">Study with me</h2>
        <div>${startCard}</div>
      </div>
      ${testNote}
      <div id="swm-start-form"></div>
      <div id="swm-list" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:12px;"></div>`;
    startLobbyListener();
    renderLobbyList();
    loadLK().catch(() => {}); // 預先載入直播程式，入場更快
  }

  function stopLobbyListener() {
    if (lobbyUnsub) { try { lobbyUnsub(); } catch (_) {} lobbyUnsub = null; }
  }
  function startLobbyListener() {
    if (lobbyUnsub || !window.db) return;
    const q = window.fs.query(window.fs.collection(window.db, 'streams'), window.fs.where('status', '==', 'live'), window.fs.limit(100));
    lobbyUnsub = window.fs.onSnapshot(q, (snap) => {
      // v1.227.9：已離開大廳（轉了分頁或正在觀看／主持直播）就停止更新，節省讀取次數；
      // 再開大廳時 renderLobby() 會重新開始
      if (!isTabOpen() || st.mode !== 'lobby') { stopLobbyListener(); return; }
      lobbyStreams = snap.docs.map(d => Object.assign({ id: d.id }, d.data())).filter(fresh).sort((a, b) => (b.viewerCount || 0) - (a.viewerCount || 0));
      if (st.mode === 'lobby') renderLobbyList();
    }, (err) => console.warn('讀取直播列表失敗:', err));
  }

  function elapsedText(ms) {
    const m = Math.max(0, Math.floor(ms / 60000));
    return m >= 60 ? `${Math.floor(m / 60)} 小時 ${m % 60} 分鐘` : `${m} 分鐘`;
  }

  function renderLobbyList() {
    const list = document.getElementById('swm-list');
    if (!list) return;
    if (!lobbyStreams.length) {
      list.innerHTML = `<div class="admin-card" style="grid-column:1/-1; text-align:center; color:#8A94A8;">${esc(t('stream.noLive', '暫時沒有直播'))}</div>`;
      return;
    }
    list.innerHTML = lobbyStreams.map(s => `
      <button type="button" onclick="window.swmWatch('${esc(s.id)}')" style="text-align:left; background:#fff; border:1px solid var(--brand-200); border-radius:14px; padding:12px; cursor:pointer; font:inherit; display:flex; flex-direction:column; gap:6px;">
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="background:#C0392B; color:#fff; font-size:11px; font-weight:700; border-radius:6px; padding:1px 6px;">LIVE</span>
          <span style="font-size:12px; color:#6B7894;">${esc(t('stream.viewersTemplate', '{n} 人觀看').replace('{n}', s.viewerCount || 0))}</span>
        </div>
        <div style="font-size:15px; font-weight:700; color:var(--brand-800); word-break:break-all;">${esc(s.title)}</div>
        <div style="font-size:13px; color:var(--brand-700);">${esc(s.hostName)}${s.subject ? ' · ' + esc(s.subject) : ''}</div>
        <div style="font-size:12px; color:#8A94A8;">${esc(t('stream.elapsedTemplate', '已溫習 {t}').replace('{t}', elapsedText(Date.now() - (s.startedAt || Date.now()))))}${s.plannedMinutes ? esc(t('stream.plannedTemplate', '（預計 {t}）').replace('{t}', elapsedText(s.plannedMinutes * 60000))) : ''}</div>
      </button>`).join('');
  }

  // 開播表格：跟「建立公開溫習房」同一款式的彈出視窗
  window.swmOpenStartForm = function () {
    if (blockIfInRoom()) return;
    const old = document.getElementById('modal-create-stream');
    if (old) old.remove();
    const u = me();
    const minor = u.isSecondaryStudent === true || (typeof u.birthYear === 'number' && new Date().getFullYear() - u.birthYear < 18);
    const needConsent = minor && !u.parentConsentAt;
    const roomSubject = document.getElementById('modal-room-subject');
    const subjectOptions = roomSubject ? roomSubject.innerHTML : '<option value="其他">其他</option>';
    const maxH = Math.max(1, Math.min(12, parseInt(settings.maxDurationHours, 10) || 4));
    const durations = [30, 60, 90, 120, 180, 240, 300, 360, 480, 600, 720].filter(m => m <= maxH * 60);
    const durLabel = (m) => m < 60 ? `${m} 分鐘` : (m % 60 ? `${Math.floor(m / 60)} 小時 ${m % 60} 分鐘` : `${m / 60} 小時`);
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.id = 'modal-create-stream';
    wrap.innerHTML = `
      <div class="modal-box">
        <div style="text-align:center; margin-bottom:12px;">
          <h3 style="font-size:18px; font-weight:bold; color:var(--brand-800);">${esc(t('stream.createTitle', '開始 Study with me 直播'))}</h3>
          <p style="font-size:13px; color:#666; margin-top:2px;">${esc(t('stream.createSubtitle', '其他同學可以在大廳看到你的直播並留言'))}</p>
        </div>
        <form id="swm-create-form" style="display:flex; flex-direction:column; gap:10px;">
          <div>
            <label style="font-size:13px; font-weight:bold; color:#555; display:block;">${esc(t('stream.titleLabel', '直播標題 *'))}</label>
            <input type="text" id="swm-title" class="input-field" required maxlength="40" value="Study with me">
          </div>
          <div>
            <label style="font-size:13px; font-weight:bold; color:#555; display:block;">${esc(t('stream.subjectLabel', '溫習學科 *'))}</label>
            <select id="swm-subject" class="input-field">${subjectOptions}</select>
          </div>
          <div>
            <label style="font-size:13px; font-weight:bold; color:#555; display:block;">${esc(t('stream.durationLabel', '預計直播時間'))}</label>
            <select id="swm-duration" class="input-field">${durations.map(m => `<option value="${m}" ${m === Math.min(120, maxH * 60) ? 'selected' : ''}>${esc(durLabel(m))}</option>`).join('')}</select>
            <p style="font-size:13px; color:#999; margin-top:4px;">${esc(t('stream.durationHint', '時間到會自動結束直播，你亦可以隨時提早結束。'))}</p>
          </div>
          <p style="font-size:13px; color:#6B7894; margin:0;">${esc(t('stream.privacyTip', '開播前請留意：建議只拍攝書桌及雙手，避免拍到校服、校徽、住址等個人資料。咪高峰預設關閉。'))}</p>
          ${needConsent ? `<label style="display:flex; gap:8px; align-items:flex-start; font-size:13px;"><input type="checkbox" id="swm-consent" style="margin-top:3px;"> <span>${esc(t('stream.consentLabel', '本人確認已取得父母或監護人同意使用直播功能。'))}</span></label>` : ''}
          <div style="display:flex; gap:8px; margin-top:4px;">
            <button type="submit" class="btn btn-primary" id="swm-go-btn" style="flex:1;">${esc(t('stream.goLive', '開始直播'))}</button>
            <button type="button" class="btn btn-outline" id="swm-cancel-btn" style="flex:1;">${esc(t('common.cancel', '取消'))}</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(wrap);
    const subjectSel = wrap.querySelector('#swm-subject');
    if (subjectSel) subjectSel.selectedIndex = roomSubject ? roomSubject.selectedIndex : 0;
    wrap.querySelector('#swm-cancel-btn').onclick = () => wrap.remove();
    wrap.querySelector('#swm-create-form').onsubmit = (e) => { e.preventDefault(); window.swmStart(); };
  };

  // ---------- 主播 ----------
  window.swmStart = async function () {
    if (blockIfInRoom()) return;
    const consentEl = document.getElementById('swm-consent');
    let started = null;
    if (consentEl && !consentEl.checked) { toast(t('stream.needConsent', '請先確認已取得家長或監護人同意'), '⚠️'); return; }
    const btn = document.getElementById('swm-go-btn');
    if (btn) { btn.disabled = true; btn.innerText = t('stream.starting', '準備中…'); }
    try {
      const lk = await loadLK();
      const res = await window.callCloudFunction('startStream', {
        title: (document.getElementById('swm-title') || {}).value || '',
        subject: (document.getElementById('swm-subject') || {}).value || '',
        plannedMinutes: parseInt((document.getElementById('swm-duration') || {}).value, 10) || 0,
        parentConsent: !!(consentEl && consentEl.checked)
      });
      started = res.streamId;
      if (consentEl && consentEl.checked && window.currentUser) window.currentUser.parentConsentAt = Date.now();
      const q = QUALITY[res.quality] || QUALITY['480p'];
      const room = new lk.Room({ adaptiveStream: true, dynacast: true });
      await room.connect(res.url, res.token);
      await room.localParticipant.setCameraEnabled(true,
        { resolution: { width: q.width, height: q.height, frameRate: 15 } },
        { simulcast: true, videoEncoding: { maxBitrate: q.maxBitrate, maxFramerate: 15 }, videoSimulcastLayers: [lk.VideoPresets43.h180, lk.VideoPresets43.h360] });
      Object.assign(st, { mode: 'host', room, streamId: res.streamId, micOn: false }); stopLobbyListener();
      room.on(lk.RoomEvent.Disconnected, () => {
        if (st.mode !== 'host') return;
        const id = st.streamId;
        stopAll(t('stream.disconnected', '直播連線已中斷，直播已結束'));
        // 主播連線中斷（例如同一帳戶在另一部機登入）：即時結束直播，避免大廳留下無人直播
        if (id) window.callCloudFunction('endStream', { streamId: id }).catch(() => {});
      });
      st.heartbeat = setInterval(sendHeartbeat, 60 * 1000);
      st.endTimer = setTimeout(() => window.swmEnd(true), Math.max(60000, res.maxEndAt - Date.now()));
      watchStreamDoc(res.streamId);
      const modal = document.getElementById('modal-create-stream');
      if (modal) modal.remove();
      renderStage();
      const track = room.localParticipant.getTrackPublication(lk.Track.Source.Camera);
      if (track && track.track) track.track.attach(document.getElementById('swm-video'));
      toast(t('stream.started', '已開始直播'), '✅');
    } catch (e) {
      toast(t('stream.startFailed', '未能開始直播：') + errText(e), '❌');
      if (btn) { btn.disabled = false; btn.innerText = t('stream.goLive', '開始直播'); }
      if (st.room && st.mode !== 'host') { try { st.room.disconnect(); } catch (_) {} st.room = null; }
      // 伺服器已建立直播但連線失敗：即時結束，避免大廳出現無畫面的直播
      if (started && st.mode !== 'host') window.callCloudFunction('endStream', { streamId: started }).catch(() => {});
    }
  };

  async function sendHeartbeat() {
    if (st.mode !== 'host' || !st.room) return;
    try {
      // v1.227.9：觀看人數由伺服器向直播伺服器查詢後回傳
      const res = await window.callCloudFunction('streamHeartbeat', { streamId: st.streamId });
      const viewers = res && typeof res.viewerCount === 'number' ? res.viewerCount : Math.max(0, (st.room.numParticipants || 1) - 1);
      const vc = document.getElementById('swm-viewers');
      if (vc) vc.innerText = t('stream.viewersTemplate', '{n} 人觀看').replace('{n}', viewers);
      if (res && res.ended) stopAll(t('stream.endedMax', '直播已結束'));
    } catch (e) {
      console.warn('直播心跳失敗:', e);
    }
  }

  window.swmToggleMic = async function () {
    if (st.mode !== 'host' || !st.room) return;
    try {
      st.micOn = !st.micOn;
      await st.room.localParticipant.setMicrophoneEnabled(st.micOn);
      const b = document.getElementById('swm-mic-btn');
      if (b) b.innerText = st.micOn ? t('stream.micOff', '關閉咪高峰') : t('stream.micOn', '開啟咪高峰');
    } catch (e) {
      st.micOn = false;
      toast(errText(e), '❌');
    }
  };

  window.swmEnd = async function (auto) {
    if (st.mode !== 'host') return;
    if (!auto && !(await window.appConfirm(t('stream.confirmEnd', '確定結束直播？')))) return;
    const id = st.streamId;
    stopAll(auto ? t('stream.endedMax', '直播已結束') : t('stream.ended', '已結束直播'));
    try { await window.callCloudFunction('endStream', { streamId: id }); } catch (e) { console.warn(e); }
  };

  // ---------- 觀眾 ----------
  window.swmWatch = async function (streamId) {
    if (st.mode !== 'lobby') return;
    if (blockIfInRoom()) return;
    Object.assign(st, { mode: 'viewer', room: null, streamId }); stopLobbyListener();
    st.stream = lobbyStreams.find(x => x.id === streamId) || null;
    watchStreamDoc(streamId);
    renderStage();
    setLoading(true);
    try {
      const [lk, res] = await Promise.all([loadLK(), window.callCloudFunction('joinStream', { streamId })]);
      if (st.mode !== 'viewer' || st.streamId !== streamId) return;
      const room = new lk.Room({ adaptiveStream: true, dynacast: true });
      st.room = room;
      room.on(lk.RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === 'video') { track.attach(document.getElementById('swm-video')); setLoading(false); }
        if (track.kind === 'audio') { const a = track.attach(); a.style.display = 'none'; const h = document.getElementById('swm-audio-holder'); if (h) h.appendChild(a); }
      });
      room.on(lk.RoomEvent.AudioPlaybackStatusChanged, () => {
        const b = document.getElementById('swm-audio-btn');
        if (b) b.style.display = room.canPlaybackAudio ? 'none' : '';
      });
      room.on(lk.RoomEvent.Disconnected, () => { if (st.mode === 'viewer') stopAll(t('stream.viewerEnded', '直播已結束或你已離開')); });
      // 主播離開房間：觀眾自動返回大廳
      room.on(lk.RoomEvent.ParticipantDisconnected, (p) => {
        if (st.mode === 'viewer' && st.stream && p.identity === st.stream.hostUid) stopAll(t('stream.hostLeft', '主播已離開直播'));
      });
      await room.connect(res.url, res.token);
      watchBlocked(streamId);
      setTimeout(() => setLoading(false), 8000);
    } catch (e) {
      toast(t('stream.joinFailed', '未能觀看直播：') + errText(e), '❌');
      stopAll();
    }
  };
  function setLoading(on) {
    const el = document.getElementById('swm-loading');
    if (el) el.style.display = on ? 'flex' : 'none';
  }
  window.swmStartAudio = function () { if (st.room) st.room.startAudio().catch(() => {}); };
  window.swmLeave = function () { stopAll(); };

  function watchBlocked(streamId) {
    if (blockedUnsub) blockedUnsub();
    blockedUnsub = window.fs.onSnapshot(window.fs.doc(window.db, 'streams', streamId, 'blocked', me().uid), (snap) => {
      if (snap.exists() && st.mode === 'viewer') stopAll(t('stream.blocked', '你已被主播移出這個直播'));
    }, () => {});
  }

  // ---------- 共用 ----------
  function watchStreamDoc(streamId) {
    if (streamDocUnsub) streamDocUnsub();
    streamDocUnsub = window.fs.onSnapshot(window.fs.doc(window.db, 'streams', streamId), (snap) => {
      st.stream = snap.exists() ? snap.data() : null;
      if (!st.stream || st.stream.status !== 'live') {
        if (st.mode === 'viewer') stopAll(t('stream.viewerEnded', '直播已結束'));
        else if (st.mode === 'host') stopAll(t('stream.endedByAdmin', '直播已被結束'));
        return;
      }
      const title = document.getElementById('swm-stage-title');
      if (title) title.innerText = st.stream.title || '';
      const newPin = (st.stream.pinned && st.stream.pinned.messageId) || '';
      if (newPin !== st.lastPinId) { st.lastPinId = newPin; drawChat(); }
      renderPinned();
      const host = document.getElementById('swm-stage-host');
      // v1.227.6：主播名字可點擊，彈出資訊卡
      if (host) host.innerHTML = `<span class="swm-name" onclick="window.swmViewUser('${esc(st.stream.hostUid || '')}')" style="cursor:pointer;">${esc(st.stream.hostName || '')}</span>` + (st.stream.subject ? ' · ' + esc(st.stream.subject) : '');
      if (st.mode === 'viewer') {
        const vc = document.getElementById('swm-viewers');
        if (vc) vc.innerText = t('stream.viewersTemplate', '{n} 人觀看').replace('{n}', st.stream.viewerCount || 0);
      }
    }, () => {});
  }

  // ---------- 全螢幕：畫面加留言區一齊放大 ----------
  window.swmToggleFullscreen = function () {
    const stage = document.getElementById('swm-stage');
    if (!stage) return;
    const on = !stage.classList.contains('swm-full');
    stage.classList.toggle('swm-full', on);
    document.body.classList.toggle('swm-full-open', on);
    try {
      if (on && stage.requestFullscreen && !document.fullscreenElement) stage.requestFullscreen().catch(() => {});
      if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch (_) {}
    const list = document.getElementById('swm-msgs');
    if (list) list.scrollTop = list.scrollHeight;
  };
  document.addEventListener('fullscreenchange', () => {
    const stage = document.getElementById('swm-stage');
    if (!document.fullscreenElement && stage && stage.classList.contains('swm-full')) {
      stage.classList.remove('swm-full');
      document.body.classList.remove('swm-full-open');
    }
  });
  document.addEventListener('keydown', (e) => {
    const stage = document.getElementById('swm-stage');
    if (e.key === 'Escape' && stage && stage.classList.contains('swm-full') && !document.fullscreenElement) window.swmToggleFullscreen();
  });

  function stopAll(message) {
    document.body.classList.remove('swm-full-open');
    if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (_) {} }
    const room = st.room;
    clearInterval(st.heartbeat); clearTimeout(st.endTimer);
    if (chatUnsub) { chatUnsub(); chatUnsub = null; }
    if (streamDocUnsub) { streamDocUnsub(); streamDocUnsub = null; }
    if (blockedUnsub) { blockedUnsub(); blockedUnsub = null; }
    Object.assign(st, { mode: 'lobby', room: null, streamId: null, stream: null, heartbeat: null, endTimer: null, micOn: false, pending: [], lastMsgs: null, hiddenIds: null });
    if (room) { try { room.disconnect(); } catch (_) {} }
    if (message) toast(message, '');
    if (isTabOpen()) renderLobby();
  }
  window.addEventListener('beforeunload', () => { if (st.room) { try { st.room.disconnect(); } catch (_) {} } });

  function renderStage() {
    const box = document.getElementById('swm-root');
    if (!box) return;
    const host = st.mode === 'host';
    const canModerate = host || isAdmin();
    box.innerHTML = `
      <div class="swm-stage" id="swm-stage">
        <div class="swm-left">
          <div class="swm-video-box" style="position:relative; background:#111; border-radius:14px; overflow:hidden; aspect-ratio:4/3;">
            <button type="button" class="swm-fs-btn" onclick="window.swmToggleFullscreen()" title="${esc(t('stream.fullscreen', '全螢幕'))}" aria-label="${esc(t('stream.fullscreen', '全螢幕'))}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>
            </button>
            <video id="swm-video" autoplay playsinline muted style="width:100%; height:100%; object-fit:contain; ${host ? 'transform:scaleX(-1);' : ''}"></video>
            <div style="position:absolute; top:10px; left:10px; display:flex; gap:6px; align-items:center;">
              <span style="background:#C0392B; color:#fff; font-size:12px; font-weight:700; border-radius:6px; padding:2px 8px;">LIVE</span>
              <span id="swm-viewers" style="background:rgba(0,0,0,.55); color:#fff; font-size:12px; border-radius:6px; padding:2px 8px;">${esc(t('stream.viewersTemplate', '{n} 人觀看').replace('{n}', (st.stream && st.stream.viewerCount) || 0))}</span>
            </div>
            <div id="swm-audio-holder"></div>
            <div id="swm-loading" style="display:none; position:absolute; inset:0; align-items:center; justify-content:center; flex-direction:column; gap:10px; color:#fff; font-size:14px; background:#111;">
              <div class="swm-spinner"></div>${esc(t('stream.connecting', '正在連接直播…'))}
            </div>
          </div>
          <div class="swm-titlebox" style="margin-top:10px;">
            <div id="swm-stage-title" style="font-size:16px; font-weight:700; color:var(--brand-800); word-break:break-all;"></div>
            <div id="swm-stage-host" style="font-size:13px; color:var(--brand-700); margin-top:2px;"></div>
          </div>
          <div class="swm-controls" style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
            ${host
              ? `<button type="button" class="btn btn-outline" id="swm-mic-btn" onclick="window.swmToggleMic()">${esc(t('stream.micOn', '開啟咪高峰'))}</button>
                 <button type="button" class="btn btn-red" onclick="window.swmEnd(false)">${esc(t('stream.endBtn', '結束直播'))}</button>`
              : `<button type="button" class="btn btn-outline" id="swm-audio-btn" style="display:none;" onclick="window.swmStartAudio()">${esc(t('stream.enableAudio', '開啟聲音'))}</button>
                 <button type="button" class="btn btn-outline" onclick="window.swmReport(null)">${esc(t('stream.reportHost', '舉報直播'))}</button>
                 ${isAdmin() ? `<button type="button" class="btn btn-red" onclick="window.swmAdminEnd()">${esc(t('stream.adminEnd', '中止直播（管理員）'))}</button>` : ''}
                 <button type="button" class="btn btn-outline" onclick="window.swmLeave()">${esc(t('stream.leave', '離開'))}</button>`}
          </div>
        </div>
        <div class="swm-chat">
          <div style="font-size:14px; font-weight:700; color:var(--brand-800); padding:10px 12px; border-bottom:1px solid var(--brand-100);">${esc(t('stream.chat', '留言'))}</div>
 <div id="swm-pinned" style="display:none; margin:8px 12px 0; padding:8px 10px; background:#FFF8DB; border:1px solid #FFD84D; border-radius:10px; font-size:13px; line-height:1.5; word-break:break-word;"></div>
          <div id="swm-msgs" style="flex:1; overflow-y:auto; padding:8px 12px; display:flex; flex-direction:column; gap:6px;"></div>
          <form onsubmit="event.preventDefault(); window.swmSend();" style="display:flex; gap:6px; padding:10px; border-top:1px solid var(--brand-100);">
            <input id="swm-input" class="input-field" maxlength="200" autocomplete="off" placeholder="${esc(t('stream.chatPlaceholder', '輸入留言（請勿留下聯絡資料）'))}" style="flex:1; margin:0;">
            <button type="submit" class="btn btn-primary" style="white-space:nowrap;">${esc(t('stream.send', '發送'))}</button>
          </form>
        </div>
      </div>`;
    box.dataset.canModerate = canModerate ? '1' : '';
    startChat();
    renderPinned();
    if (st.room && host && LK) {
      const pub = st.room.localParticipant.getTrackPublication(LK.Track.Source.Camera);
      if (pub && pub.track) pub.track.attach(document.getElementById('swm-video'));
    }
    if (st.room && !host) {
      st.room.remoteParticipants.forEach(p => p.trackPublications.forEach(pub => {
        if (pub.track && pub.track.kind === 'video') pub.track.attach(document.getElementById('swm-video'));
      }));
    }
  }

  function renderPinned() {
    const box = document.getElementById('swm-pinned');
    if (!box) return;
    const p = st.stream && st.stream.pinned;
    if (!p || !p.text) { box.style.display = 'none'; box.innerHTML = ''; return; }
    const canUnpin = st.mode === 'host' || isAdmin();
    box.innerHTML = `<div style="display:flex; justify-content:space-between; gap:6px; align-items:flex-start;">
        <div><span style="font-size:11px; font-weight:700; color:#1F2F55; background:#FFD84D; border-radius:4px; padding:1px 5px; margin-right:4px;">${esc(t('stream.pinnedLabel', '置頂'))}</span>
        <span style="font-weight:700; color:#C0392B;">${esc(p.name)}</span> <span style="color:var(--brand-800);">${esc(p.text)}</span></div>
        ${canUnpin ? `<button type="button" onclick="window.swmUnpin()" style="border:none; background:none; color:#8A94A8; font-size:11px; cursor:pointer; white-space:nowrap; padding:0;">${esc(t('stream.unpin', '取消置頂'))}</button>` : ''}
      </div>`;
    box.style.display = '';
  }
  window.swmPin = async function (messageId) {
    try { await window.callCloudFunction('moderateStream', { streamId: st.streamId, action: 'pin', messageId }); }
    catch (e) { toast(errText(e), '❌'); }
  };
  window.swmUnpin = async function () {
    try { await window.callCloudFunction('moderateStream', { streamId: st.streamId, action: 'unpin' }); }
    catch (e) { toast(errText(e), '❌'); }
  };

  st.pending = [];
  function drawChat() {
    const list = document.getElementById('swm-msgs');
    const root = document.getElementById('swm-root');
    if (!list || !root) return;
    const docs = st.lastMsgs || [];
    const canModerate = !!root.dataset.canModerate;
    const myUid = me().uid;
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    const pinnedId = st.stream && st.stream.pinned && st.stream.pinned.messageId;
    const hidden = st.hiddenIds || new Set();
    const rows = docs.slice().reverse().filter(d => !d.data().deleted && !hidden.has(d.id)).map(d => {
      const m = d.data();
      const actions = [];
      if (st.mode === 'host' && m.uid === myUid && d.id !== pinnedId) {
        actions.push(`<button type="button" onclick="window.swmPin('${esc(d.id)}')" style="border:none; background:none; color:#8A94A8; font-size:11px; cursor:pointer; padding:0 2px;">${esc(t('stream.pin', '置頂'))}</button>`);
      }
      if (canModerate && m.uid !== myUid) {
        actions.push(`<button type="button" onclick="window.swmDeleteMsg('${esc(d.id)}')" style="border:none; background:none; color:#8A94A8; font-size:11px; cursor:pointer; padding:0 2px;">${esc(t('stream.delete', '刪除'))}</button>`);
        if (!m.isHost) actions.push(`<button type="button" onclick="window.swmBlock('${esc(m.uid)}')" style="border:none; background:none; color:#C0392B; font-size:11px; cursor:pointer; padding:0 2px;">${esc(t('stream.block', '封鎖'))}</button>`);
      } else if (m.uid !== myUid) {
        actions.push(`<button type="button" onclick="window.swmReport('${esc(d.id)}')" style="border:none; background:none; color:#8A94A8; font-size:11px; cursor:pointer; padding:0 2px;">${esc(t('stream.report', '舉報'))}</button>`);
      }
      return `<div class="swm-msg" style="font-size:13px; line-height:1.5; word-break:break-word;">
        <span class="swm-name" onclick="window.swmViewUser('${esc(m.uid)}')" style="font-weight:700; cursor:pointer; color:${m.isHost ? '#C0392B' : 'var(--brand-700)'};">${esc(m.name)}</span>
        <span style="color:var(--brand-800);">${esc(m.text)}</span> ${actions.join('')}
      </div>`;
    });
    const pend = (st.pending || []).map(p => `<div class="swm-msg" style="font-size:13px; line-height:1.5; word-break:break-word; opacity:.6;">
        <span style="font-weight:700; color:var(--brand-700);">${esc(me().username || '')}</span>
        <span style="color:var(--brand-800);">${esc(p.text)}</span>
        <span style="font-size:11px; color:#8A94A8;">${p.failed ? esc(t('stream.sendFailed', '未能送出')) : esc(t('stream.sending', '傳送中…'))}</span>
      </div>`);
    list.innerHTML = rows.concat(pend).join('');
    if (atBottom || pend.length) list.scrollTop = list.scrollHeight;
  }

  function startChat() {
    if (chatUnsub) chatUnsub();
    const q = window.fs.query(window.fs.collection(window.db, 'streams', st.streamId, 'messages'), window.fs.orderBy('at', 'desc'), window.fs.limit(60));
    chatUnsub = window.fs.onSnapshot(q, (snap) => {
      st.lastMsgs = snap.docs;
      // 伺服器已收到的留言：移除對應的「傳送中」
      const myUid = me().uid;
      snap.docChanges().forEach(ch => {
        if (ch.type !== 'added') return;
        const m = ch.doc.data();
        if (m.uid !== myUid) return;
        const i = (st.pending || []).findIndex(p => !p.failed && m.at >= p.at - 5000);
        if (i >= 0) st.pending.splice(i, 1);
      });
      drawChat();
    }, (err) => console.warn('讀取留言失敗:', err));
  }

  window.swmSend = async function () {
    const input = document.getElementById('swm-input');
    const text = input ? input.value.trim() : '';
    if (!text || !st.streamId) return;
    input.value = '';
    const p = { text, at: Date.now() };
    st.pending.push(p);
    drawChat();
    try {
      const res = await window.callCloudFunction('sendStreamMessage', { streamId: st.streamId, text });
      if (res && res.filtered) toast(t('stream.filtered', '留言中的部分字詞或聯絡資料已被遮蓋'), '');
    } catch (e) {
      const i = st.pending.indexOf(p);
      if (i >= 0) st.pending.splice(i, 1);
      drawChat();
      if (!input.value) input.value = text;
      toast(errText(e), '❌');
    }
  };
  // v1.227.6：刪除前先確認；確認後即時在畫面隱藏（不用等伺服器回覆），失敗才還原
  window.swmDeleteMsg = async function (messageId) {
    if (!(await window.appConfirm(t('stream.confirmDelete', '確定刪除這則留言？')))) return;
    if (!st.hiddenIds) st.hiddenIds = new Set();
    st.hiddenIds.add(messageId);
    drawChat();
    try { await window.callCloudFunction('moderateStream', { streamId: st.streamId, action: 'deleteMessage', messageId }); }
    catch (e) { st.hiddenIds.delete(messageId); drawChat(); toast(errText(e), '❌'); }
  };
  window.swmBlock = async function (targetUid) {
    if (!(await window.appConfirm(t('stream.confirmBlock', '確定封鎖這位觀眾？對方將被移出直播，並不能再進入。')))) return;
    try { await window.callCloudFunction('moderateStream', { streamId: st.streamId, action: 'block', targetUid }); toast(t('stream.blockedDone', '已封鎖'), '✅'); }
    catch (e) { toast(errText(e), '❌'); }
  };
  window.swmAdminEnd = async function () {
    if (!(await window.appConfirm(t('stream.confirmAdminEnd', '確定中止這個直播？')))) return;
    try { await window.callCloudFunction('endStream', { streamId: st.streamId }); }
    catch (e) { toast(errText(e), '❌'); }
  };

  // ---------- 舉報 ----------
  // v1.227.5：點擊留言區的名字，彈出該用戶的資訊卡（全螢幕時先退出，否則資訊卡會被遮住）
  window.swmViewUser = function (uid) {
    if (!uid || typeof window.viewUserProfile !== 'function') return;
    const stage = document.getElementById('swm-stage');
    if (stage && stage.classList.contains('swm-full')) window.swmToggleFullscreen();
    window.viewUserProfile(uid);
  };

  window.swmReport = function (messageId) {
    const s = st.stream || {};
    let reportedUid = s.hostUid, reportedName = s.hostName, quoted = '';
    if (messageId && st.lastMsgs) {
      const d = st.lastMsgs.find(x => x.id === messageId);
      if (d) { reportedUid = d.data().uid; reportedName = d.data().name; quoted = d.data().text; }
    }
    if (!reportedUid) return;
    const reasons = ['不當言論', '騷擾', '色情或不雅內容', '索取聯絡資料', '直播內容不當', '其他'];
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `
      <div class="modal-box">
        <h3 style="font-size:17px; font-weight:bold; color:var(--brand-800); margin:0 0 10px;">${esc(t('stream.reportTitle', '舉報'))}：${esc(reportedName)}</h3>
        ${quoted ? `<p style="font-size:13px; color:#6B7894; background:var(--brand-50); border-radius:8px; padding:6px 8px;">${esc(quoted)}</p>` : ''}
        <select id="swm-report-reason" class="input-field">${reasons.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('')}</select>
        <textarea id="swm-report-notes" class="input-field" rows="3" maxlength="300" placeholder="${esc(t('stream.reportNotes', '補充說明（可留空）'))}" style="margin-top:8px;"></textarea>
        <div style="display:flex; gap:8px; margin-top:12px;">
          <button type="button" class="btn btn-red" id="swm-report-send" style="flex:1;">${esc(t('stream.reportSend', '送出舉報'))}</button>
          <button type="button" class="btn btn-outline" id="swm-report-cancel" style="flex:1;">${esc(t('common.cancel', '取消'))}</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    wrap.querySelector('#swm-report-cancel').onclick = () => wrap.remove();
    wrap.querySelector('#swm-report-send').onclick = async () => {
      const notes = (quoted ? `留言內容：「${quoted}」\n` : '') + wrap.querySelector('#swm-report-notes').value.trim();
      try {
        await window.callCloudFunction('submitReport', {
          reportedUid, reportedName, roomId: 'stream:' + st.streamId, roomName: 'Study with me：' + (s.title || ''),
          reason: wrap.querySelector('#swm-report-reason').value, notes
        });
        toast(t('stream.reportDone', '已送出舉報，管理員會盡快處理'), '✅');
        wrap.remove();
      } catch (e) { toast(errText(e), '❌'); }
    };
  };
})();
