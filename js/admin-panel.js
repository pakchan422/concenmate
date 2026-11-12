// ConcenMate · admin-panel.js
// ------------------------------------------------------------
// Phase 5（程式碼結構化）第四步（呢個 phase 最後一步）：呢個檔案原
// 本係 index.html 入面一個普通（非 module）嘅 <script>…</script> 區
// 塊，而家搬咗出嚟做獨立檔案，用 <script src="admin-panel.js"> 載
// 入。同 app-features.js／room-video.js 一樣，唔係 ES module，同其
// 他普通 <script> 區塊共用全域 scope，搬檔案純粹係物理位置搬走，執
// 行時機同全域可見度完全冇變。
//
// 內容包括：成個管理後台（Admin Panel）——管理員身份判斷、扭蛋機獎
// 品／扭蛋機外觀圖片設定、等級／經驗值設定、QA 管理、問題回報處理、
// 房間管理、用戶管理（停權／改分）等所有後台分頁邏輯。
//
// 載入次序好緊要：呢個檔案要留喺 index.html 原本嘅位置（app-core.js
// ／room-video.js 之後），因為前面已經載入好嘅 db／fs／storage 等
// 物件，同後面其他區塊都會用到呢度定義嘅函式。
//
// 【Phase 5 完成標記】至此，index.html 由原本 11,047 行拆走咗四個獨
// 立模組（app-core.js／app-features.js／room-video.js／
// admin-panel.js），主檔淨返低約 2,800 行，主要係 HTML 結構同少量
// 未拆嘅小型 <script> 區塊。如果之後想再進一步拆（例如將主檔 HTML
// 都模組化），可以參考呢四次做法嘅原則：搵一段完整、相對獨立嘅
// <script> 區塊，確認佢係咪 module，跟住原辦法搬走。

    // ===================== 管理後台（Admin Panel）=====================

    // 邊個帳號 ID 先算係管理員：呢個名單而家由 Firestore 嘅
    // admin_config/adminIds 文件（欄位 ids，一個字串陣列）話事，唔再係
    // 寫死喺呢個檔案入面——想加/減管理員，淨係去 Firebase Console 度
    // 改嗰份文件就得，唔使再逐次改 index.html + firestore.rules 兩邊
    // （見下面 loadAdminIdsFromFirestore()；firestore.rules 嘅
    // isAdmin() 亦已經改成讀返同一份文件）。
    //
    // ADMIN_LOGIN_IDS_FALLBACK 純粹係「岩岩開網站、Firestore 仲未讀
    // 完」嗰一兩秒嘅保險網，唔會影響真正權限判斷（真正判斷永遠以
    // Firestore 安全規則嗰邊為準，前端呢個陣列淨係控制「顯唔顯示管理
    // 後台入口」）。
    const ADMIN_LOGIN_IDS_FALLBACK = ['admin_main', 'admin_02', 'admin_03'];
    window.ADMIN_LOGIN_IDS = ADMIN_LOGIN_IDS_FALLBACK.slice();
    // 管理員權限分級（第四階段第9項）：loginId -> 'super' | 'support'。
    // 冇出現喺呢個map嘅管理員（包括呢個功能推出之前已經存在嘅帳戶）
    // 一律當『super』處理——咁樣先唔會因為加咗呢個新機制，就令舊有
    // 管理員帳戶突然喺Admin後台見少咗分頁、打亂佢哋原本慣用嘅工作
    // 流程。『super』見到全部分頁；『support』淨係見到日常客服／巡查
    // 用得著嗰幾個（數據總覽、房間管理、疑難解答區、用戶管理、舉報
    // 處理、導師申請、用戶支援），唔見網站設定類（扭蛋機／等級系統／
    // Landing page文案／計分規則／房間設定／防掛機參數／全站公告）
    // 同管治類（管理員名單、操作紀錄）嗰幾頁。
    //
    // ✅ 呢個分級而家唔淨係「UI入口限制」：firestore.rules已經加咗
    // isSuperAdmin()，所有『support』喺畫面見唔到嗰啲設定文件
    // （admin_config/gacha、levelSystem、navIcons、landingContent、
    // scoringRules、roomSettings、antiIdleRules、announcement、
    // adminIds）喺資料庫層一樣鎖死淨係super先寫得入——就算『support』
    // 帳戶刻意開瀏覽器開發者工具、直接用Firestore SDK嘅語法去寫，都
    // 一樣會被伺服器拒絕（唔再淨係靠前端唔顯示嗰粒掣）。操作紀錄
    // （adminAuditLog）嘅讀取都同樣鎖返淨係super先睇得到，但寫入
    // （create）保持任何管理員都得——因為『support』帳戶做嘅操作
    // （例如停權用戶）都要寫得入呢份紀錄先追蹤得到。
    window.ADMIN_ROLES = {};

    async function loadAdminIdsFromFirestore() {
      try {
        const snap = await window.fs.getDoc(window.fs.doc(window.db, 'admin_config', 'adminIds'));
        if (snap.exists() && Array.isArray(snap.data().ids) && snap.data().ids.length > 0) {
          window.ADMIN_LOGIN_IDS = snap.data().ids;
        }
        if (snap.exists() && snap.data().roles && typeof snap.data().roles === 'object') {
          window.ADMIN_ROLES = snap.data().roles;
        }
      } catch (e) {
        console.warn('讀取管理員名單（admin_config/adminIds）失敗，暫時使用內建預設名單:', e);
      }
      // 名單啱啱先攞到／有更新，要重新評估一次而家個用戶算唔算管理員
      // （例如岩岩登入嗰陣名單仲未攞到，管理後台入口掣冇顯示，攞到之後
      // 要補顯示返）。
      if (typeof window.updateAdminEntryButton === 'function') window.updateAdminEntryButton();
      if (typeof window.checkAdminHashRoute === 'function') window.checkAdminHashRoute();
      // 管理員身份啱啱確認咗，重新套用功能表顯示（管理員見到已關閉嘅項目）
      if (typeof window.applyNavVisibility === 'function') window.applyNavVisibility();
      // 管理員名單啱啱攞到／更新，順便刷新一次大廳標題，等「🛠️ 查看
      // 邊個池」嗰個管理員專用選單可以喺呢一刻先顯示出嚟（見
      // window.updateRoomLobbyTitle，定義喺 app-core.js）。
      if (typeof window.updateRoomLobbyTitle === 'function') window.updateRoomLobbyTitle();
    }
    window.loadAdminIdsFromFirestore = loadAdminIdsFromFirestore;

    function isCurrentUserAdmin() {
      return !!(window.currentUser && window.currentUser.loginId && window.ADMIN_LOGIN_IDS.includes(window.currentUser.loginId));
    }
    window.isCurrentUserAdmin = isCurrentUserAdmin;

    // 而家呢個管理員帳戶嘅權限等級——冇記錄過就當『super』（見上面
    // window.ADMIN_ROLES 嗰段解釋，為咗向下兼容舊帳戶）。
    function getCurrentAdminRole() {
      if (!window.currentUser || !window.currentUser.loginId) return null;
      return window.ADMIN_ROLES[window.currentUser.loginId] || 'super';
    }
    window.getCurrentAdminRole = getCurrentAdminRole;

    function isCurrentUserSuperAdmin() {
      return isCurrentUserAdmin() && getCurrentAdminRole() === 'super';
    }
    window.isCurrentUserSuperAdmin = isCurrentUserSuperAdmin;

    // 淨係『super』先睇得到／用得到嘅分頁——網站設定類同治理類。
    const SUPER_ADMIN_ONLY_TABS = [
      'gacha', 'level', 'icons', 'landing', 'scoring', 'roomsettings',
      'antiidle', 'announcement', 'adminlist', 'auditlog',
      'subjects', 'districts', 'schools', 'legal', 'snapshotbg', 'navmenu', 'turn', 'streaming',
      'costs', 'lists'
    ];
    // v1.228.0：合併顯示的分頁——撳一個分頁掣，會依次顯示多個原有的分頁內容
    const ADMIN_TAB_GROUPS = {
      roomsettings: ['roomsettings', 'antiidle'],
      navmenu: ['navmenu', 'icons'],
      // v1.229.3：用戶支援（搜尋＋詳情）併入用戶管理（上：搜尋及詳情；下：全部用戶表格）
      users: ['support', 'users'],
      lists: ['subjects', 'districts', 'schools'],
    };
    // 舊分頁名稱 → 合併後的分頁（網址 hash 或其他地方仍然可以用舊名稱）
    const ADMIN_TAB_ALIASES = { support: 'users', antiidle: 'roomsettings', scoring: 'roomsettings', icons: 'navmenu', subjects: 'lists', districts: 'lists', schools: 'lists' };
    // 某個原有分頁的內容而家是否顯示緊（合併分頁後，不可以再只比較 currentAdminTab）
    function adminTabShowing(name) {
      const el = document.getElementById('admin-tab-' + name);
      return !!(el && el.style.display === 'block');
    }

    // 操作紀錄（第四階段第10項）：將重要嘅管治／高風險操作（停權、
    // 補發分數／貼紙、強制關房、審批導師、管理員名單異動等）寫一筆
    // 落 adminAuditLog collection，畀日後有爭議或者想追查「邊個管理員
    // 做咗咩」嗰陣有紀錄可以查。純粹盡力而為（fire-and-forget）：寫入
    // 失敗唔應該阻住主要操作本身完成，所以呢度淨係 console.warn，唔
    // 會再彈 toast 打擾管理員。
    async function logAdminAction(action, details) {
      if (!window.db || !window.fs || !window.currentUser) return;
      try {
        await window.fs.addDoc(window.fs.collection(window.db, 'adminAuditLog'), {
          action,
          details: (typeof details === 'undefined') ? null : details,
          adminEmail: window.currentUser.email || null,
          adminLoginId: window.currentUser.loginId || null,
          createdAt: Date.now()
        });
      } catch (err) {
        console.warn('寫入操作紀錄失敗（唔影響主要操作本身）:', err);
      }
    }
    window.logAdminAction = logAdminAction;

    // 更新 header 度嗰粒「⚙️ 管理後台」入口掣顯唔顯示（淨係俾管理員睇到）
    function updateAdminEntryButton() {
      const btn = document.getElementById('header-admin-btn');
      if (btn) btn.style.display = isCurrentUserAdmin() ? 'inline-flex' : 'none';
    }
    window.updateAdminEntryButton = updateAdminEntryButton;

    let adminAuthCheckTimer = null;
    let adminRoomsUnsubscribe = null;
    let adminQaUnsubscribe = null;
    let adminUsersUnsubscribe = null;
    let adminReportsUnsubscribe = null;
    let adminReportsBadgeUnsubscribe = null;
    let currentAdminTab = null; // v1.228.0：超級管理員預設打開「營運開支」，其他管理員打開「數據總覽」

    // 網址 hash 路由：#admin 先顯示管理後台，離開就切返正常介面。
    // 未登入／auth 仲未 resolve 之前 window.currentUser 係 undefined，
    // 呢度會短時間輪詢等一等，避免一入嚟就即刻誤判做「冇權限」。
    // 頭部「⚙️ 管理後台」按鈕：喺管理後台入面就變成「🏠 返回主頁」，唔使再靠
    // 後台入面嗰粒獨立返回鍵（已移除），減少畫面重複嘅按鈕。
    function setHeaderAdminBtnMode(isOnAdminPage) {
      const btn = document.getElementById('header-admin-btn');
      if (!btn) return;
      if (isOnAdminPage) {
        btn.setAttribute('onclick', "window.location.hash=''");
        btn.innerHTML = `<svg class="header-admin-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg><span class="header-admin-text">返回主頁</span>`;
        btn.setAttribute('aria-label', '返回主頁');
      } else {
        btn.setAttribute('onclick', "window.location.hash='admin'");
        btn.innerHTML = `<svg class="header-admin-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg><span class="header-admin-text">管理後台</span>`;
        btn.setAttribute('aria-label', '管理後台');
      }
    }
    window.setHeaderAdminBtnMode = setHeaderAdminBtnMode;

    function checkAdminHashRoute() {
      const wantsAdmin = window.location.hash === '#admin';
      const appEl = document.querySelector('.app-container');
      const adminEl = document.getElementById('admin-panel-container');
      const deniedEl = document.getElementById('admin-denied-container');

      if (!wantsAdmin) {
        if (appEl) appEl.style.display = '';
        if (adminEl) adminEl.style.display = 'none';
        if (deniedEl) deniedEl.style.display = 'none';
        if (adminRoomsUnsubscribe) { adminRoomsUnsubscribe(); adminRoomsUnsubscribe = null; }
        if (adminQaUnsubscribe) { adminQaUnsubscribe(); adminQaUnsubscribe = null; }
        if (adminUsersUnsubscribe) { adminUsersUnsubscribe(); adminUsersUnsubscribe = null; }
        if (adminReportsUnsubscribe) { adminReportsUnsubscribe(); adminReportsUnsubscribe = null; }
        if (adminReportsBadgeUnsubscribe) { adminReportsBadgeUnsubscribe(); adminReportsBadgeUnsubscribe = null; }
        setHeaderAdminBtnMode(false);
        return;
      }

      if (typeof window.currentUser === 'undefined') {
        clearTimeout(adminAuthCheckTimer);
        adminAuthCheckTimer = setTimeout(checkAdminHashRoute, 200);
        return;
      }

      if (!isCurrentUserAdmin()) {
        if (appEl) appEl.style.display = 'none';
        if (adminEl) adminEl.style.display = 'none';
        if (deniedEl) deniedEl.style.display = 'block';
        return;
      }

      if (appEl) appEl.style.display = 'none';
      if (deniedEl) deniedEl.style.display = 'none';
      if (adminEl) adminEl.style.display = 'block';
      setHeaderAdminBtnMode(true);

      const emailTag = document.getElementById('admin-panel-user-email');
      if (emailTag) emailTag.innerText = `登入身份：${window.currentUser.email}`;
      // 版本資訊（正式網站已收起右下角除錯面板，改為喺呢度顯示）
      const versionTag = document.getElementById('admin-panel-version');
      if (versionTag) {
        const loadEl = document.getElementById('load-timestamp');
        const loadTime = loadEl ? loadEl.innerText : '';
        versionTag.innerText = `網站版本：${window.APP_VERSION || '未知'}` +
          (loadTime ? `　載入時間：${loadTime}` : '') +
          `　環境：${window.IS_PROD_SITE ? '正式網站' : '測試環境'}`;
      }

      // 「🚩 舉報處理」個紅點徽章唔理管理員而家揀緊邊個分頁都要見到，
      // 所以一入管理後台就開始聽，唔使等真係撳入嗰個分頁先識更新
      if (typeof window.startAdminReportsBadgeListener === 'function') window.startAdminReportsBadgeListener();
      // 「🎓 導師申請」個紅點徽章同上，唔理揀緊邊個分頁都要見到
      if (typeof window.startAdminTutorsBadgeListener === 'function') window.startAdminTutorsBadgeListener();
      if (typeof window.startAdminSchoolDomainsBadge === 'function') window.startAdminSchoolDomainsBadge();

      // 管理員權限分級：『support』帳戶見唔到網站設定／治理類分頁嘅
      // 按鈕（見上面 SUPER_ADMIN_ONLY_TABS）。
      const isSuper = isCurrentUserSuperAdmin();
      document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        const tabName = btn.getAttribute('data-tab');
        if (SUPER_ADMIN_ONLY_TABS.includes(tabName)) {
          btn.style.display = isSuper ? '' : 'none';
        }
      });
      // 分頁掣而家分咗三組顯示（日常營運／網站設定／管治）——「網站
      // 設定」「管治」呢兩組入面嘅掣全部都係super限定，『support』
      // 帳戶見唔到任何一粒，咁連個組嘅小標題都一齊隱藏埋，唔會見到
      // 得個「網站設定」四個字、下面乜掣都冇咁奇怪。
      ['admin-tab-group-settings', 'admin-tab-group-governance', 'admin-tab-group-rewards', 'admin-tab-group-content', 'admin-tab-group-lists'].forEach((groupId) => {
        const groupEl = document.getElementById(groupId);
        if (groupEl) groupEl.dataset.allowed = isSuper ? '1' : '0';
      });
      buildAdminCategoryBar();
      // 如果而家記住嘅分頁係『support』見唔到嗰啲，就退返去「數據總覽」，
      // 避免見到一個冇按鈕對應、又撳唔返嘅空白分頁。
      let startTab = currentAdminTab || (isSuper ? 'costs' : 'dashboard');
      if (!isSuper && SUPER_ADMIN_ONLY_TABS.includes(startTab)) startTab = 'dashboard';

      switchAdminTab(startTab);
    }
    window.checkAdminHashRoute = checkAdminHashRoute;
    window.addEventListener('hashchange', checkAdminHashRoute);

    window.switchAdminTab = function(tab) {
      if (ADMIN_TAB_ALIASES[tab]) tab = ADMIN_TAB_ALIASES[tab];
      // 防止『support』帳戶用網址hash或者其他方式直接跳去冇按鈕對應
      // 嘅super限定分頁——退返去「數據總覽」並提示一下。
      if (SUPER_ADMIN_ONLY_TABS.includes(tab) && !isCurrentUserSuperAdmin()) {
        window.showToast('此分頁只限「超級管理員」使用', '🔒');
        tab = 'dashboard';
      }
      currentAdminTab = tab;
      updateAdminCategoryUI(tab);
      document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        const active = btn.getAttribute('data-tab') === tab;
        btn.className = 'btn admin-tab-btn ' + (active ? 'btn-primary active' : 'btn-outline');
      });
      const showPanels = ADMIN_TAB_GROUPS[tab] || [tab];
      document.querySelectorAll('.admin-tab-panel').forEach(panel => {
        panel.style.display = showPanels.some(n => panel.id === 'admin-tab-' + n) ? 'block' : 'none';
      });
      if (ADMIN_TAB_GROUPS[tab]) {
        // 按指定次序排列合併分頁的內容，並逐個渲染
        showPanels.forEach(n => {
          const el = document.getElementById('admin-tab-' + n);
          if (el && el.parentNode) el.parentNode.appendChild(el);
        });
        showPanels.forEach(n => renderSingleAdminTab(n));
        return;
      }
      renderSingleAdminTab(tab);
    };

    // v1.228.1：後台分頁改為兩層 tab——上排是類別（總覽、日常營運……），
    // 下排只顯示所選類別入面的分頁，唔再一路向下排晒所有分頁
    const adminLastTabByGroup = {};
    function adminTabGroups() {
      return Array.from(document.querySelectorAll('#admin-tab-nav > [id^="admin-tab-group-"]'));
    }
    function buildAdminCategoryBar() {
      const nav = document.getElementById('admin-tab-nav');
      if (!nav) return;
      let bar = document.getElementById('admin-cat-bar');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'admin-cat-bar';
        bar.setAttribute('role', 'tablist');
        nav.insertBefore(bar, nav.firstChild);
      }
      bar.innerHTML = adminTabGroups().map(g => {
        const labelEl = g.querySelector('.admin-tab-group-label');
        if (labelEl) labelEl.style.display = 'none';
        const label = labelEl ? labelEl.textContent.trim() : g.id;
        const hidden = g.dataset.allowed === '0' ? ' style="display:none;"' : '';
        return `<button type="button" class="admin-cat-btn" role="tab" data-group="${g.id}"${hidden} onclick="window.switchAdminCategory('${g.id}')">${label}</button>`;
      }).join('');
      updateAdminCategoryUI(currentAdminTab || 'dashboard');
      syncAdminCategoryBadges();
    }
    // 「舉報處理」「導師申請」有待處理項目時，喺「日常營運」類別旁邊顯示紅點，
    // 即使管理員停留喺其他類別都會見到
    function syncAdminCategoryBadges() {
      const badges = ['admin-reports-badge', 'admin-tutors-badge', 'admin-schooldomains-badge'].map(id => document.getElementById(id)).filter(Boolean);
      const update = () => {
        adminTabGroups().forEach(g => {
          const catBtn = document.querySelector(`#admin-cat-bar .admin-cat-btn[data-group="${g.id}"]`);
          if (!catBtn) return;
          const pending = Array.from(g.querySelectorAll('[id$="-badge"]')).some(el => el.style.display !== 'none' && el.textContent.trim() !== '0');
          let dot = catBtn.querySelector('.admin-cat-dot');
          if (pending && !dot) {
            dot = document.createElement('span');
            dot.className = 'admin-cat-dot';
            dot.style.cssText = 'display:inline-block; width:8px; height:8px; border-radius:50%; background:#C0524A; margin-left:5px; vertical-align:middle;';
            catBtn.appendChild(dot);
          } else if (!pending && dot) dot.remove();
        });
      };
      if (!window._adminCatBadgeObserver && window.MutationObserver) {
        window._adminCatBadgeObserver = new MutationObserver(update);
        badges.forEach(el => window._adminCatBadgeObserver.observe(el, { attributes: true, childList: true, characterData: true, subtree: true }));
      }
      update();
    }
    function updateAdminCategoryUI(tab) {
      const btn = document.querySelector(`.admin-tab-btn[data-tab="${tab}"]`);
      const activeGroup = btn ? btn.closest('[id^="admin-tab-group-"]') : null;
      if (activeGroup) adminLastTabByGroup[activeGroup.id] = tab;
      adminTabGroups().forEach(g => {
        g.style.display = (g === activeGroup && g.dataset.allowed !== '0') ? '' : 'none';
      });
      document.querySelectorAll('#admin-cat-bar .admin-cat-btn').forEach(b => {
        const on = !!activeGroup && b.dataset.group === activeGroup.id;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }
    window.switchAdminCategory = function(groupId) {
      const g = document.getElementById(groupId);
      if (!g) return;
      const visibleBtns = Array.from(g.querySelectorAll('.admin-tab-btn')).filter(b => b.style.display !== 'none');
      const remembered = adminLastTabByGroup[groupId];
      const target = (remembered && visibleBtns.some(b => b.dataset.tab === remembered)) ? remembered : (visibleBtns[0] && visibleBtns[0].dataset.tab);
      if (target) window.switchAdminTab(target);
    };

    function renderSingleAdminTab(tab) {
      if (tab === 'costs') window.renderAdminCostsTab();
      else if (tab === 'dashboard') renderAdminDashboardTab();
      else if (tab === 'gacha') renderAdminGachaTab();
      else if (tab === 'rooms') renderAdminRoomsTab();
      else if (tab === 'qa') renderAdminQaTab();
      else if (tab === 'users') renderAdminUsersTab();
      else if (tab === 'level') renderAdminLevelTab();
      else if (tab === 'reports') renderAdminReportsTab();
      else if (tab === 'icons') renderAdminNavIconsTab();
      else if (tab === 'tutors') renderAdminTutorsTab();
      else if (tab === 'landing') renderAdminLandingTab();
      else if (tab === 'scoring') renderAdminScoringTab();
      else if (tab === 'roomsettings') renderAdminRoomSettingsTab(); // 已包括計分規則
      else if (tab === 'antiidle') renderAdminAntiIdleTab();
      else if (tab === 'announcement') renderAdminAnnouncementTab();
      else if (tab === 'support') renderAdminSupportTab();
      else if (tab === 'adminlist') renderAdminAdminListTab();
      else if (tab === 'auditlog') renderAdminAuditLogTab();
      else if (tab === 'subjects') renderAdminSubjectsTab();
      else if (tab === 'districts') renderAdminDistrictsTab();
      else if (tab === 'schools') renderAdminSchoolsTab();
      else if (tab === 'legal') renderAdminLegalTab();
      else if (tab === 'snapshotbg') renderAdminSnapshotBgTab();
      else if (tab === 'navmenu') renderAdminNavMenuTab();
      else if (tab === 'turn') renderAdminTurnTab();
      else if (tab === 'streaming') renderAdminStreamingTab();
      else if (tab === 'schooldomains') window.renderAdminSchoolDomainsTab();
    }

    // ---------- 扭蛋機貼紙管理 ----------
    // 扭蛋機貼紙／收費而家改為由 Firestore（admin_config/gacha 文件）讀取，
    // 管理員喺呢度改完撳「儲存」，全站用戶即時生效，唔使再改碼、推 GitHub。
    // 扭蛋獎品已由舊有嘅實物獎（普通/幸運兩個獎池）完全取代做單一嘅
    // Ottiee 貼紙收集池——每格代表一隻貼紙（id 由 1 開始編號，唔可以喺
    // 呢度改，靠佢嚟同用戶端嘅 ownedStickers 對應），可以自行新增／刪除
    // 貼紙格去增減收集圖鑑嘅總數。
    let adminGachaDraft = null;

    // Firestore 個 onSnapshot 監聽係非同步嘅，一入嚟 #admin 嗰刻（尤其係
    // 重新整理成頁之後）好可能仲未攞到最新資料返嚟。如果呢個時候就即刻用
    // 「當下嗰吓」嘅 GACHA_STICKERS/GACHA_COST 去起草稿，就會執到程式碼入面
    // 寫死嘅預設值，唔係你之前儲存低嗰份——睇落好似「撳完儲存但冇儲到」，
    // 其實係讀返嗰下捉錯咗時機。用呢個 flag 確保一定要等 Firestore 真係
    // 讀完一次先起草稿。
    let gachaConfigLoaded = false;

    function renderAdminGachaTab() {
      const container = document.getElementById('admin-tab-gacha');
      if (!container) return;

      if (!adminGachaDraft) {
        if (!gachaConfigLoaded) {
          container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">載入中扭蛋機設定...</p>';
          return; // Firestore 資料一到，loadGachaConfigFromFirestore() 會自動再 render 多次
        }
        adminGachaDraft = {
          stickers: JSON.parse(JSON.stringify(GACHA_STICKERS)),
          series: JSON.parse(JSON.stringify(window.GACHA_SERIES || [])),
          costNormal: GACHA_COST.normal,
          costLucky: GACHA_COST.lucky,
          machineImageUrl: window.GACHA_MACHINE_IMAGE_URL || null,
          fragmentGain: Object.assign({ common: 1, rare: 3, limited: 6 }, window.GACHA_FRAGMENT_GAIN || {}),
          fragmentCost: Object.assign({ common: 3, rare: 9, limited: 18 }, window.GACHA_FRAGMENT_COST || {})
        };
        adminGachaMigrateDraft(adminGachaDraft);
      }

      function renderMachineImageCard() {
        const url = adminGachaDraft.machineImageUrl;
        const previewInner = url
          ? `<img src="${url}" style="width:100%; height:100%; object-fit:contain;">`
          : `<img src="assets/images/gacha-machine.png" style="width:100%; height:100%; object-fit:contain;">`;
        return `
          <div class="admin-card">
            <h3 style="font-size:15px; font-weight:bold; color:var(--brand-800); margin-bottom:10px;">預設扭蛋機圖片</h3>
            <p style="font-size:13px; color:#888; margin-bottom:10px;">這張是預設的扭蛋機外觀圖（不是貼圖）。未在下方「扭蛋系列」表格設定專屬「扭蛋機圖」的系列，會使用這張圖；不上傳則使用網站內建的預設圖。</p>
            <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
              <div id="admin-gacha-machine-thumb" onclick="document.getElementById('admin-gacha-machine-input').click()" title="點擊這裡上傳圖片" style="width:80px; height:80px; border-radius:10px; background:#F6F7FB; border:1px dashed #D2D9E9; display:flex; align-items:center; justify-content:center; cursor:pointer; overflow:hidden;">${previewInner}</div>
              <input type="file" accept="image/*" id="admin-gacha-machine-input" style="display:none;" onchange="adminUploadGachaMachineImage(this)">
              <div style="display:flex; flex-direction:column; gap:6px;">
                <button type="button" class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="document.getElementById('admin-gacha-machine-input').click()">上傳新圖片</button>
                ${url ? `<button type="button" class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="adminRemoveGachaMachineImage()">還原做預設圖</button>` : ''}
              </div>
            </div>
          </div>
        `;
      }

      // 圖片規格說明（只供管理人員參考，唔影響任何設定）
      function renderGachaImageSpecCard() {
        const row = (k, v) => `<tr><td style="white-space:nowrap; font-weight:700; color:var(--brand-800); vertical-align:top; padding:6px 10px 6px 0;">${k}</td><td style="padding:6px 0; line-height:1.7;">${v}</td></tr>`;
        const sec = (title, rows) => `
          <div style="margin-top:12px;">
            <div style="font-size:14px; font-weight:800; color:var(--brand-800); border-left:4px solid var(--brand-500); padding-left:8px; margin-bottom:4px;">${title}</div>
            <table style="width:100%; font-size:13px; color:#475F92; border-collapse:collapse;">${rows}</table>
          </div>`;
        return `
          <div class="admin-card">
            <details>
              <summary style="cursor:pointer; font-size:15px; font-weight:bold; color:var(--brand-800);">圖片規格說明（製作或更換圖片前請先閱讀）</summary>
              <p style="font-size:13px; color:#888; margin:8px 0 0;">以下為扭蛋相關圖片的建議規格。所有圖片均使用 Ottie 的統一畫風：中灰藍色柔和描邊、平塗上色，不可含任何文字、字母或數字。</p>
              ${sec('一、貼圖圖（每件扭蛋貼圖）',
                row('尺寸', '正方形 1:1，建議 1024 × 1024 像素') +
                row('格式', 'PNG') +
                row('普通', '透明背景，只有 Ottie 及道具，四周留少量空位') +
                row('稀有', '簡單場景背景（牆壁、地面、一至兩件小物件，淡色），剪裁為圓角正方形，圓角以外為透明') +
                row('限定', '豐富完整的場景背景（多件道具、燈光效果、顏色較濃），剪裁為圓角正方形，圓角以外為透明') +
                row('上傳處理', '系統會自動壓縮至最闊 600 像素'))}
              ${sec('二、扭蛋機圖（每個系列可各自設定）',
                row('尺寸', '橫向長方形，闊高比 6:5，建議 960 × 800 像素') +
                row('格式', 'PNG，透明背景') +
                row('置中', '<b>扭蛋機機身的正中必須位於圖片的正中</b>。如旁邊有 Ottie 等角色，須在另一邊加上相同闊度的透明空位，令機身置中') +
                row('高度', '扭蛋機（連角色）高度約佔圖片高度 94%，底部貼近圖片下緣') +
                row('網站顯示', '闊 360 像素（手機畫面較窄時自動縮小）；系列選擇按鈕的縮圖亦會使用此圖') +
                row('上傳處理', '系統會自動壓縮至最闊 800 像素'))}
              ${sec('三、背景圖（每個系列可各自設定）',
                row('尺寸', '橫向 16:9，建議 1376 × 768 或 1920 × 1080 像素') +
                row('格式', 'JPG') +
                row('構圖', '畫面正中約 40% 闊度須<b>完全留空</b>（扭蛋機放在此處）；裝飾物件放在左右兩邊') +
                row('地平線', '地面與牆壁或天空的分界線約在圖片高度 65% 至 75% 的位置，令扭蛋機看起來站在地上') +
                row('底部', '圖片底部約 15% 保持淺色及簡單，以免遮擋「抽一次」「連續抽十次」按鈕') +
                row('網站顯示', '電腦版：填滿整個框並貼底顯示，頂部可能被裁走少許。手機版：放大至框高的 140% 並貼底顯示，左右兩邊會被裁走較多，重要物件須放近中間') +
                row('未上傳時', '使用網站內建的預設背景（assets/images/gacha-bg.jpg）') +
                row('上傳處理', '系統會自動壓縮至最闊 1600 像素'))}
              ${sec('四、原始檔存放位置',
                row('貼圖', 'Desktop/concenmate-app/Ottie Pic/（每個系列一個資料夾，例如「動物連身衣」「書伴日常」）') +
                row('扭蛋機及背景', 'Desktop/concenmate-app/Ottie Pic/扭蛋機/'))}
            </details>
          </div>`;
      }

      function renderSeriesCard() {
        const list = adminGachaDraft.series;
        const rows = list.map((se, idx) => {
          const n = adminGachaDraft.stickers.filter(st => String(st.seriesId) === String(se.id)).length;
          return `
          <tr>
            <td style="white-space:nowrap;">
              <button type="button" class="btn btn-outline" style="padding:1px 7px; font-size:13px;" onclick="adminMoveGachaSeries(${idx},-1)" ${idx === 0 ? 'disabled' : ''}>上移</button>
              <button type="button" class="btn btn-outline" style="padding:1px 7px; font-size:13px;" onclick="adminMoveGachaSeries(${idx},1)" ${idx === list.length - 1 ? 'disabled' : ''}>下移</button>
            </td>
            <td><input class="admin-input-sm" value="${escapeHtml(se.name || '')}" onchange="adminUpdateGachaSeries(${idx},'name',this.value)"></td>
            <td><input class="admin-input-sm" value="${escapeHtml(se.nameEn || '')}" placeholder="English name" onchange="adminUpdateGachaSeries(${idx},'nameEn',this.value)"></td>
            <td style="text-align:center;"><input type="checkbox" ${se.enabled !== false ? 'checked' : ''} onchange="adminUpdateGachaSeries(${idx},'enabled',this.checked)"></td>
            <td style="text-align:center; color:#555;">${n}</td>
            <td style="white-space:nowrap;">
              <div onclick="document.getElementById('admin-series-machine-input-${idx}').click()" title="點擊上傳此系列的扭蛋機圖" style="display:inline-flex; width:48px; height:48px; border-radius:8px; background:#F6F7FB; border:1px dashed #D2D9E9; align-items:center; justify-content:center; cursor:pointer; overflow:hidden; vertical-align:middle; font-size:11px; color:#999;">${se.machineImage ? `<img src="${se.machineImage}" style="width:100%; height:100%; object-fit:contain;">` : '上傳'}</div>
              <input type="file" accept="image/*" id="admin-series-machine-input-${idx}" style="display:none;" onchange="adminUploadSeriesMachineImage(${idx}, this)">
              ${se.machineImage ? `<button type="button" class="btn btn-outline" style="padding:1px 6px; font-size:12px; vertical-align:middle;" onclick="adminRemoveSeriesMachineImage(${idx})">移除</button>` : ''}
            </td>
            <td style="white-space:nowrap;">
              <div onclick="document.getElementById('admin-series-bg-input-${idx}').click()" title="點擊上傳此系列的背景圖" style="display:inline-flex; width:80px; height:45px; border-radius:8px; background:#F6F7FB; border:1px dashed #D2D9E9; align-items:center; justify-content:center; cursor:pointer; overflow:hidden; vertical-align:middle; font-size:11px; color:#999;">${se.bgImage ? `<img src="${se.bgImage}" style="width:100%; height:100%; object-fit:cover;">` : '上傳'}</div>
              <input type="file" accept="image/*" id="admin-series-bg-input-${idx}" style="display:none;" onchange="adminUploadSeriesBgImage(${idx}, this)">
              ${se.bgImage ? `<button type="button" class="btn btn-outline" style="padding:1px 6px; font-size:12px; vertical-align:middle;" onclick="adminRemoveSeriesBgImage(${idx})">移除</button>` : ''}
            </td>
            <td><button type="button" class="btn btn-red" style="padding:3px 8px; font-size:13px;" onclick="adminRemoveGachaSeries(${idx})">刪除</button></td>
          </tr>`;
        }).join('');
        return `
          <div class="admin-card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
              <h3 style="font-size:15px; font-weight:bold; color:var(--brand-800);">扭蛋系列（共 ${list.length} 個）</h3>
              <button class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="adminAddGachaSeries()">新增系列</button>
            </div>
            <p style="font-size:13px; color:#888; margin-bottom:8px;">學生在扭蛋頁面先選擇系列，再抽該系列的貼圖；每個系列有獨立的收集進度。取消「開放扭蛋」後，學生不能再抽該系列，但已收集的貼圖會保留，圖鑑顯示為「已停售」。系列的排列次序即扭蛋頁面的顯示次序。英文名稱留空時，英文介面會顯示中文名稱。「扭蛋機圖」可為每個系列設定專屬的扭蛋機外觀（建議使用透明背景 PNG）；未上傳時使用下方的預設扭蛋機圖。「背景圖」是扭蛋機後面的場景（建議 16:9 橫向圖，中間留空），未上傳時使用網站內建的預設背景。</p>
            <div style="overflow-x:auto;">
              <table class="admin-table">
                <thead><tr><th>次序</th><th>中文名稱</th><th>英文名稱</th><th>開放扭蛋</th><th>貼圖數量</th><th>扭蛋機圖</th><th>背景圖</th><th></th></tr></thead>
                <tbody>${rows || '<tr><td colspan="8" style="text-align:center; color:#999; padding:16px;">未有系列，請點擊「新增系列」</td></tr>'}</tbody>
              </table>
            </div>
          </div>`;
      }

      function renderStickerTable() {
        const allPool = adminGachaDraft.stickers;
        const filter = adminGachaSeriesFilter;
        const pool = allPool;
        const seriesTotals = {};
        allPool.forEach(p => { const k = String(p.seriesId || ''); seriesTotals[k] = (seriesTotals[k] || 0) + (parseFloat(p.weight) || 0); });
        const totalWeight = filter ? (seriesTotals[filter] || 0) : allPool.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0);
        const seriesOptions = (sel) => `<option value="" ${!sel ? 'selected' : ''}>（未分類）</option>` +
          adminGachaDraft.series.map(se => `<option value="${escapeHtml(String(se.id))}" ${String(sel) === String(se.id) ? 'selected' : ''}>${escapeHtml(se.name || se.id)}</option>`).join('');
        const rarityOptions = (sel) => [['common', '普通'], ['rare', '稀有'], ['limited', '限定']]
          .map(([v, l]) => `<option value="${v}" ${(sel || 'common') === v ? 'selected' : ''}>${l}</option>`).join('');

        const rows = pool.map((p, idx) => {
          if (filter && String(p.seriesId || '') !== filter) return '';
          const sTotal = seriesTotals[String(p.seriesId || '')] || 0;
          const pct = sTotal > 0 ? ((parseFloat(p.weight) || 0) / sTotal * 100).toFixed(1) : '0.0';
          const thumbId = `admin-gacha-thumb-${idx}`;
          const inputId = `admin-gacha-photo-input-${idx}`;
          const thumbInner = p.photo
            ? `<img src="${p.photo}" style="width:44px; height:44px; object-fit:cover; border-radius:8px;">`
            : `<span style="font-size:20px;">${escapeHtml(p.emoji || '🦦')}</span>`;
          return `
          <tr>
            <td style="text-align:center; color:#888; font-size:13px;">#${p.id}</td>
            <td>
              <div style="display:flex; flex-direction:column; align-items:center; gap:3px;">
                <div id="${thumbId}" onclick="document.getElementById('${inputId}').click()" title="點擊這裡上傳圖片" style="width:44px; height:44px; border-radius:8px; background:#F6F7FB; border:1px dashed #D2D9E9; display:flex; align-items:center; justify-content:center; cursor:pointer; overflow:hidden;">${thumbInner}</div>
                <input type="file" accept="image/*" id="${inputId}" style="display:none;" onchange="adminUploadGachaPhoto(${idx},this)">
                ${p.photo ? `<button type="button" class="btn btn-outline" style="font-size:13px; padding:1px 6px;" onclick="adminRemoveGachaPhoto(${idx})">移除圖片</button>` : ''}
              </div>
            </td>
            <td><input class="admin-input-sm" value="${escapeHtml(p.name || '')}" onchange="adminUpdateGachaField(${idx},'name',this.value)"></td>
            <td><input class="admin-input-sm" value="${escapeHtml(p.nameEn || '')}" placeholder="English name" onchange="adminUpdateGachaField(${idx},'nameEn',this.value)"></td>
            <td><select class="admin-input-sm" onchange="adminUpdateGachaField(${idx},'seriesId',this.value); renderAdminGachaTab();">${seriesOptions(p.seriesId)}</select></td>
            <td><select class="admin-input-sm" onchange="adminUpdateGachaField(${idx},'rarity',this.value)">${rarityOptions(p.rarity)}</select></td>
            <td>
              <input class="admin-input-sm" type="number" min="0" style="width:70px;" value="${p.weight || 0}" oninput="adminUpdateGachaWeightLive(${idx},this.value)">
              <div id="admin-gacha-pct-${idx}" style="font-size:13px; color:#888; margin-top:2px; white-space:nowrap;">≈ ${pct}%</div>
            </td>
            <td><button class="btn btn-red" style="padding:3px 8px; font-size:13px;" onclick="adminRemoveGachaPrize(${idx})">🗑️</button></td>
          </tr>
        `;
        }).join('');

        return `
          <div class="admin-card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
              <h3 style="font-size:15px; font-weight:bold; color:var(--brand-800);">貼圖（共 ${allPool.length} 件）</h3>
              <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
                <select class="admin-input-sm" onchange="adminSetGachaSeriesFilter(this.value)" title="只顯示某個系列">
                  <option value="" ${!filter ? 'selected' : ''}>顯示全部系列</option>
                  ${adminGachaDraft.series.map(se => `<option value="${escapeHtml(String(se.id))}" ${filter === String(se.id) ? 'selected' : ''}>${escapeHtml(se.name || se.id)}</option>`).join('')}
                </select>
                <button class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="adminNormalizeGachaWeights()">調整為剛好 100</button>
                <button class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="adminRenumberGachaStickers()">重新排序編號</button>
                <button class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="adminAddGachaPrize()">新增貼圖</button>
              </div>
            </div>
            <p style="font-size:13px; color:#888; margin-bottom:8px;">貼圖編號（#id）對應用戶收集圖鑑的位置，刪除貼圖之後編號會留下缺口（例如刪除 #13~#17 之後就由 #12 跳到 #18），這不影響扭蛋／收集功能，純粹是畫面上不美觀。如果想整理，點擊「重新排序編號」會將現存貼圖由上到下重新編為 1、2、3...連續號碼——但要留意：如果已經有真實學生扭過蛋、收藏了某幾張貼圖，重新編號會令他們原有的收藏對應不上新編號（貼圖會「變成另一件」），所以這個按鈕只適合在未有學生正式使用過、或者您願意接受重整所有人收藏記錄的情況下才點擊。</p>
            <div style="overflow-x:auto;">
              <table class="admin-table">
                <thead><tr><th>#</th><th>圖片</th><th>中文名稱</th><th>英文名稱</th><th>系列</th><th>稀有度</th><th>機率權重</th><th></th></tr></thead>
                <tbody>${rows || '<tr><td colspan="8" style="text-align:center; color:#999; padding:16px;">未有貼圖，請點擊「新增貼圖」開始</td></tr>'}</tbody>
              </table>
            </div>
            <p style="font-size:13px; color:#888; margin-top:8px;">${filter ? '此系列' : '全部'}總權重：<span id="admin-gacha-total">${totalWeight}</span>。學生每次只會在所選系列之內抽，所以「≈ %」是該張貼圖在<b>同一系列內</b>的機率。點擊「調整為剛好 100」會將每個系列各自的權重縮放到合計 100。稀有度只影響標籤及抽中時的提示，實際機率由權重決定。</p>
          </div>
        `;
      }

      container.innerHTML = `
        <div class="admin-card">
          <h3 style="font-size:15px; font-weight:bold; color:var(--brand-800); margin-bottom:10px;">扭蛋收費</h3>
          <div style="display:flex; gap:16px; flex-wrap:wrap; align-items:center;">
            <label style="font-size:13px; color:#555; display:flex; align-items:center; gap:6px;">抽一次 (PTS)：<input class="admin-input-sm" type="number" min="0" style="width:80px;" value="${adminGachaDraft.costNormal}" onchange="adminGachaDraft.costNormal = parseInt(this.value)||0"></label>
            <label style="font-size:13px; color:#555; display:flex; align-items:center; gap:6px;">連續抽十次 (PTS，一次過 10 抽的總費用)：<input class="admin-input-sm" type="number" min="0" style="width:80px;" value="${adminGachaDraft.costLucky}" onchange="adminGachaDraft.costLucky = parseInt(this.value)||0"></label>
          </div>
        </div>


        <div class="admin-card">
          <h3 style="font-size:15px; font-weight:bold; color:var(--brand-800); margin-bottom:6px;">貼圖碎片</h3>
          <p style="font-size:13px; color:#888; margin:0 0 10px;">學生扭到已擁有的貼圖會自動轉為碎片；碎片可兌換未擁有的貼圖（只限開放中的系列）。</p>
          <table class="admin-table" style="max-width:420px;">
            <thead><tr><th>稀有度</th><th>重複時得到碎片</th><th>兌換所需碎片</th></tr></thead>
            <tbody>
              ${[['common','普通'],['rare','稀有'],['limited','限定']].map(([k, label]) => `<tr>
                <td>${label}</td>
                <td><input class="admin-input-sm" type="number" min="0" max="1000" style="width:70px;" value="${adminGachaDraft.fragmentGain[k]}" onchange="adminGachaDraft.fragmentGain['${k}'] = Math.max(0, parseInt(this.value)||0)"></td>
                <td><input class="admin-input-sm" type="number" min="1" max="10000" style="width:70px;" value="${adminGachaDraft.fragmentCost[k]}" onchange="adminGachaDraft.fragmentCost['${k}'] = Math.max(1, parseInt(this.value)||1)"></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>

        ${renderGachaImageSpecCard()}

        ${renderMachineImageCard()}

        ${renderSeriesCard()}

        ${renderStickerTable()}

        <div style="display:flex; gap:8px; justify-content:flex-end;">
          <button class="btn btn-outline" type="button" onclick="adminResetGachaDraft()">還原未儲存的改動</button>
          <button class="btn btn-primary" type="button" id="btn-admin-save-gacha" onclick="adminSaveGachaConfig()">儲存全部改動</button>
        </div>
      `;
    }
    window.renderAdminGachaTab = renderAdminGachaTab;

    // ---------- v1.214.0：系列管理 ----------
    let adminGachaSeriesFilter = '';
    window.adminSetGachaSeriesFilter = function(v) { adminGachaSeriesFilter = v || ''; renderAdminGachaTab(); };

    // 第一次有系列功能時，自動將現有貼圖歸入「動物連身衣」，並按名稱
    // 預填英文名同稀有度（管理員仍然可以喺表格度改，撳儲存先生效）
    const ADMIN_GACHA_KNOWN = {
      '熊仔連身衣': ['Bear Onesie', 'common'], '黃貓連身衣': ['Tabby Cat Onesie', 'common'],
      '貓貓連身衣': ['Tabby Cat Onesie', 'common'], '青蛙連身衣': ['Frog Onesie', 'common'],
      '樹熊連身衣': ['Koala Onesie', 'common'], '柴犬連身衣': ['Shiba Inu Onesie', 'common'],
      '企鵝連身衣': ['Penguin Onesie', 'common'], '獅子連身衣': ['Lion Onesie', 'rare'],
      '中華白海豚連身衣': ['Chinese White Dolphin Onesie', 'rare'], '恐龍連身衣': ['Dinosaur Onesie', 'limited'],
      '獨角獸連身衣': ['Unicorn Onesie', 'limited']
    };
    function adminGachaMigrateDraft(d) {
      if (!Array.isArray(d.series)) d.series = [];
      if (!d.series.length) {
        d.series.push({ id: 'animal', name: '動物連身衣', nameEn: 'Animal Onesies', enabled: true, order: 1 });
        d.stickers.forEach(st => { if (!st.seriesId) st.seriesId = 'animal'; });
      }
      // 舊預設收費 30／270 → 新建議 60／540（溫習 1 小時＝扭 1 次）
      if (d.costNormal === 30 && d.costLucky === 270) { d.costNormal = 60; d.costLucky = 540; }
      d.stickers.forEach(st => {
        const k = ADMIN_GACHA_KNOWN[(st.name || '').trim()];
        if (k) {
          if (!st.nameEn) st.nameEn = k[0];
          if (!st.rarity) st.rarity = k[1];
        }
        if (!st.rarity) st.rarity = 'common';
      });
    }
    window.adminUpdateGachaSeries = function(idx, field, value) {
      if (!adminGachaDraft || !adminGachaDraft.series[idx]) return;
      adminGachaDraft.series[idx][field] = value;
    };
    window.adminAddGachaSeries = function() {
      if (!adminGachaDraft) return;
      const used = new Set(adminGachaDraft.series.map(se => String(se.id)));
      let n = adminGachaDraft.series.length + 1, id = 's' + n;
      while (used.has(id)) { n++; id = 's' + n; }
      adminGachaDraft.series.push({ id, name: '新系列', nameEn: '', enabled: false, order: adminGachaDraft.series.length + 1 });
      renderAdminGachaTab();
      window.showToast('已新增系列（預設未開放扭蛋），請點擊「儲存全部改動」', '📦');
    };
    window.adminRemoveGachaSeries = async function(idx) {
      if (!adminGachaDraft || !adminGachaDraft.series[idx]) return;
      const se = adminGachaDraft.series[idx];
      const n = adminGachaDraft.stickers.filter(st => String(st.seriesId) === String(se.id)).length;
      if (n > 0) { window.showToast(`此系列仍有 ${n} 張貼圖，請先將貼圖移到其他系列或刪除`, '⚠️'); return; }
      if (!(await window.appConfirm(`確定刪除系列「${se.name || se.id}」？`))) return;
      adminGachaDraft.series.splice(idx, 1);
      adminGachaDraft.series.forEach((x, i) => { x.order = i + 1; });
      if (adminGachaSeriesFilter === String(se.id)) adminGachaSeriesFilter = '';
      renderAdminGachaTab();
    };
    window.adminMoveGachaSeries = function(idx, dir) {
      if (!adminGachaDraft) return;
      const list = adminGachaDraft.series; const j = idx + dir;
      if (j < 0 || j >= list.length) return;
      [list[idx], list[j]] = [list[j], list[idx]];
      list.forEach((x, i) => { x.order = i + 1; });
      renderAdminGachaTab();
    };

    window.adminUpdateGachaField = function(idx, field, value) {
      if (!adminGachaDraft || !adminGachaDraft.stickers[idx]) return;
      adminGachaDraft.stickers[idx][field] = value;
    };

    // 權重輸入格用 oninput（打緊字每一下都觸發，唔使等 blur 先算），
    // 即時更新草稿數值，再直接用 DOM 改返每一行嘅「≈ %」同「總權重」
    // 文字——特登唔用重新 render 成個表格嘅方式，否則打緊字嗰陣個輸入格
    // 會因為 innerHTML 被重寫而失去焦點／游標位置。
    window.adminUpdateGachaWeightLive = function(idx, rawValue) {
      if (!adminGachaDraft || !adminGachaDraft.stickers[idx]) return;
      adminGachaDraft.stickers[idx].weight = parseFloat(rawValue) || 0;

      const pool = adminGachaDraft.stickers;
      const totals = {};
      pool.forEach(p => { const k = String(p.seriesId || ''); totals[k] = (totals[k] || 0) + (parseFloat(p.weight) || 0); });

      pool.forEach((p, i) => {
        const pctEl = document.getElementById(`admin-gacha-pct-${i}`);
        if (pctEl) {
          const t = totals[String(p.seriesId || '')] || 0;
          const pct = t > 0 ? ((parseFloat(p.weight) || 0) / t * 100).toFixed(1) : '0.0';
          pctEl.innerText = `≈ ${pct}%`;
        }
      });

      const totalEl = document.getElementById('admin-gacha-total');
      if (totalEl) totalEl.innerText = adminGachaSeriesFilter ? (totals[adminGachaSeriesFilter] || 0) : pool.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0);
    };

    // 讀取圖片檔案 → 縮圖 → 壓縮做一個 Blob（用嚟上傳去 Firebase Storage）。
    // PNG／GIF／WebP 呢啲支援透明背景嘅格式會保留做 PNG 輸出（保住透明），
    // 其他（例如相機影嘅 JPEG）先會壓縮做 JPEG 減檔案大小。
    // Phase 4：呢張圖而家上傳去 Storage（見 storage.rules 嘅 gacha_stickers/
    // 路徑），Firestore 度嘅 admin_config/gacha 文件淨係存返個下載連結
    // （字串），唔再直接塞成張圖嘅 base64 落 Firestore——一嚟避免撞 Firestore
    // 單一文件 1MiB 上限，二嚟每個用戶登入嗰陣經 onSnapshot 攞呢份設定時，
    // 唔使個個都下載晒全部貼紙嘅完整圖片資料，流量同讀取速度都會好啲。
    function compressImageFileToBlob(file, maxWidth, quality) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        const keepTransparency = /^image\/(png|gif|webp|svg\+xml)$/.test(file.type);
        img.onload = () => {
          const scale = Math.min(1, maxWidth / img.width);
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          const mimeType = keepTransparency ? 'image/png' : 'image/jpeg';
          canvas.toBlob((blob) => {
            if (blob) resolve({ blob, mimeType });
            else reject(new Error('圖片轉換失敗'));
          }, mimeType, quality);
        };
        img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
        img.src = url;
      });
    }

    // 如果舊相片係一個 Storage 下載連結（即係 Phase 4 之後上傳嘅新相），
    // 就順手刪走 Storage 度嘅舊檔案，避免留低用唔到嘅殘留檔案浪費空間。
    // 用 best-effort（失敗都唔阻住主流程）——舊資料如果仲係 base64 格式
    // （Phase 4 之前上傳嘅），呢度會自動跳過，唔會嘗試刪。
    async function tryDeleteOldGachaStoragePhoto(oldPhotoUrl) {
      if (!oldPhotoUrl || typeof oldPhotoUrl !== 'string') return;
      if (!oldPhotoUrl.includes('firebasestorage')) return; // 唔係 Storage 連結（例如舊 base64），跳過
      if (!window.storage || !window.storageApi) return;
      try {
        await window.storageApi.deleteObject(window.storageApi.ref(window.storage, oldPhotoUrl));
      } catch (e) {
        console.warn('刪除舊貼紙相片失敗（唔影響新相片上傳）:', e);
      }
    }

    window.adminUploadGachaPhoto = async function(idx, inputEl) {
      if (!adminGachaDraft || !adminGachaDraft.stickers[idx]) return;
      const file = inputEl.files && inputEl.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        window.showToast('請選擇圖片檔案', '⚠️');
        return;
      }
      if (!window.storage || !window.storageApi) {
        window.showToast('Storage 未初始化，請重新整理頁面再試', '⚠️');
        return;
      }
      const sticker = adminGachaDraft.stickers[idx];
      const oldPhoto = sticker.photo;
      window.showToast('上傳中相片…', '📤');
      try {
        const { blob, mimeType } = await compressImageFileToBlob(file, 600, 0.85);
        const ext = mimeType === 'image/png' ? 'png' : 'jpg';
        const path = `gacha_stickers/sticker_${sticker.id}_${Date.now()}.${ext}`;
        const fileRef = window.storageApi.ref(window.storage, path);
        await window.storageApi.uploadBytes(fileRef, blob, { contentType: mimeType });
        const downloadUrl = await window.storageApi.getDownloadURL(fileRef);
        adminGachaDraft.stickers[idx].photo = downloadUrl;
        renderAdminGachaTab();
        window.showToast('相片上傳成功，請點擊「儲存全部改動」才會正式生效', '🎉');
        tryDeleteOldGachaStoragePhoto(oldPhoto); // best-effort，唔使等佢完成
      } catch (err) {
        window.showToast('圖片上傳失敗：' + (err.message || err), '❌');
      }
    };

    window.adminRemoveGachaPhoto = function(idx) {
      if (!adminGachaDraft || !adminGachaDraft.stickers[idx]) return;
      const oldPhoto = adminGachaDraft.stickers[idx].photo;
      tryDeleteOldGachaStoragePhoto(oldPhoto); // best-effort
      delete adminGachaDraft.stickers[idx].photo;
      renderAdminGachaTab();
    };

    // 扭蛋機外殼圖片（唔係貼紙，係機身本身嗰張圖）——用返同貼紙相片
    // 一樣嘅 gacha_stickers/ Storage 路徑（storage.rules 已經俾呢個路徑
    // 底下任何檔名都通過，唔使再加多條規則），淨係換個檔名前綴分開嚟。
    window.adminUploadGachaMachineImage = async function(inputEl) {
      if (!adminGachaDraft) return;
      const file = inputEl.files && inputEl.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        window.showToast('請選擇圖片檔案', '⚠️');
        return;
      }
      if (!window.storage || !window.storageApi) {
        window.showToast('Storage 未初始化，請重新整理頁面再試', '⚠️');
        return;
      }
      const oldUrl = adminGachaDraft.machineImageUrl;
      window.showToast('上傳中圖片…', '📤');
      try {
        const { blob, mimeType } = await compressImageFileToBlob(file, 800, 0.85);
        const ext = mimeType === 'image/png' ? 'png' : 'jpg';
        const path = `gacha_stickers/machine_image_${Date.now()}.${ext}`;
        const fileRef = window.storageApi.ref(window.storage, path);
        await window.storageApi.uploadBytes(fileRef, blob, { contentType: mimeType });
        const downloadUrl = await window.storageApi.getDownloadURL(fileRef);
        adminGachaDraft.machineImageUrl = downloadUrl;
        renderAdminGachaTab();
        window.showToast('圖片上傳成功，請點擊「儲存全部改動」才會正式生效', '🎉');
        tryDeleteOldGachaStoragePhoto(oldUrl); // best-effort，唔使等佢完成
      } catch (err) {
        window.showToast('圖片上傳失敗：' + (err.message || err), '❌');
      }
    };

    // 個別系列專屬嘅扭蛋機圖，用同一個 Storage 路徑
    window.adminUploadSeriesMachineImage = async function(idx, inputEl) {
      if (!adminGachaDraft || !adminGachaDraft.series[idx]) return;
      const file = inputEl.files && inputEl.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) { window.showToast('請選擇圖片檔案', '⚠️'); return; }
      if (!window.storage || !window.storageApi) { window.showToast('Storage 未初始化，請重新整理頁面再試', '⚠️'); return; }
      const se = adminGachaDraft.series[idx];
      const oldUrl = se.machineImage;
      window.showToast('上傳中圖片…', '📤');
      try {
        const { blob, mimeType } = await compressImageFileToBlob(file, 800, 0.85);
        const ext = mimeType === 'image/png' ? 'png' : 'jpg';
        const path = `gacha_stickers/machine_series_${String(se.id).replace(/[^A-Za-z0-9_-]/g, '')}_${Date.now()}.${ext}`;
        const fileRef = window.storageApi.ref(window.storage, path);
        await window.storageApi.uploadBytes(fileRef, blob, { contentType: mimeType });
        se.machineImage = await window.storageApi.getDownloadURL(fileRef);
        renderAdminGachaTab();
        window.showToast('圖片上傳成功，請點擊「儲存全部改動」才會正式生效', '🎉');
        tryDeleteOldGachaStoragePhoto(oldUrl);
      } catch (err) {
        window.showToast('圖片上傳失敗：' + (err.message || err), '❌');
      }
    };
    // 個別系列專屬嘅扭蛋機背景場景圖
    window.adminUploadSeriesBgImage = async function(idx, inputEl) {
      if (!adminGachaDraft || !adminGachaDraft.series[idx]) return;
      const file = inputEl.files && inputEl.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) { window.showToast('請選擇圖片檔案', '⚠️'); return; }
      if (!window.storage || !window.storageApi) { window.showToast('Storage 未初始化，請重新整理頁面再試', '⚠️'); return; }
      const se = adminGachaDraft.series[idx];
      const oldUrl = se.bgImage;
      window.showToast('上傳中圖片…', '📤');
      try {
        const { blob, mimeType } = await compressImageFileToBlob(file, 1600, 0.85);
        const ext = mimeType === 'image/png' ? 'png' : 'jpg';
        const path = `gacha_stickers/bg_series_${String(se.id).replace(/[^A-Za-z0-9_-]/g, '')}_${Date.now()}.${ext}`;
        const fileRef = window.storageApi.ref(window.storage, path);
        await window.storageApi.uploadBytes(fileRef, blob, { contentType: mimeType });
        se.bgImage = await window.storageApi.getDownloadURL(fileRef);
        renderAdminGachaTab();
        window.showToast('圖片上傳成功，請點擊「儲存全部改動」才會正式生效', '🎉');
        tryDeleteOldGachaStoragePhoto(oldUrl);
      } catch (err) {
        window.showToast('圖片上傳失敗：' + (err.message || err), '❌');
      }
    };
    window.adminRemoveSeriesBgImage = function(idx) {
      if (!adminGachaDraft || !adminGachaDraft.series[idx]) return;
      tryDeleteOldGachaStoragePhoto(adminGachaDraft.series[idx].bgImage);
      adminGachaDraft.series[idx].bgImage = null;
      renderAdminGachaTab();
    };

    window.adminRemoveSeriesMachineImage = function(idx) {
      if (!adminGachaDraft || !adminGachaDraft.series[idx]) return;
      tryDeleteOldGachaStoragePhoto(adminGachaDraft.series[idx].machineImage);
      adminGachaDraft.series[idx].machineImage = null;
      renderAdminGachaTab();
    };

    window.adminRemoveGachaMachineImage = function() {
      if (!adminGachaDraft) return;
      const oldUrl = adminGachaDraft.machineImageUrl;
      tryDeleteOldGachaStoragePhoto(oldUrl); // best-effort
      adminGachaDraft.machineImageUrl = null;
      renderAdminGachaTab();
    };

    // 將所有貼紙嘅權重等比例縮放，令佢哋啱啱好加埋等於 100，
    // 令「權重」同「機率 %」睇落一致，滿足想用 percentage 睇嘅需要，
    // 同時內部繼續用返權重運算，加/減貼紙都唔使手動重新分配其他行。
    window.adminNormalizeGachaWeights = function() {
      if (!adminGachaDraft || !adminGachaDraft.stickers.length) return;
      const groups = {};
      adminGachaDraft.stickers.forEach(p => { const k = String(p.seriesId || ''); (groups[k] = groups[k] || []).push(p); });
      let skipped = 0;
      Object.values(groups).forEach(pool => {
        const total = pool.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0);
        if (total <= 0) { skipped++; return; }
        let runningTotal = 0;
        pool.forEach((p, i) => {
          if (i === pool.length - 1) {
            p.weight = Math.max(0, 100 - runningTotal);
          } else {
            const w = Math.round((parseFloat(p.weight) || 0) / total * 100);
            p.weight = w;
            runningTotal += w;
          }
        });
      });
      renderAdminGachaTab();
      window.showToast(skipped ? '已調整；部分系列權重全部是 0，未有調整' : '已將每個系列的權重調整為合計 100', '⚖️');
    };

    window.adminAddGachaPrize = function() {
      if (!adminGachaDraft) return;
      const pool = adminGachaDraft.stickers;
      const nextId = pool.length ? Math.max(...pool.map(p => p.id || 0)) + 1 : 1;
      const sid = adminGachaSeriesFilter || (adminGachaDraft.series[0] && adminGachaDraft.series[0].id) || '';
      pool.push({ id: nextId, emoji: '🦦', name: `新貼圖 #${String(nextId).padStart(2, '0')}`, nameEn: '', photo: null, weight: 1, seriesId: sid, rarity: 'common' });
      renderAdminGachaTab();
    };

    window.adminRemoveGachaPrize = async function(idx) {
      if (!adminGachaDraft) return;
      if (!(await window.appConfirm('確定刪除這張貼圖？若已經有用戶擁有，其收集紀錄會保留，但在圖鑑中將不再顯示。'))) return;
      adminGachaDraft.stickers.splice(idx, 1);
      renderAdminGachaTab();
    };

    // 將現存貼紙（跟返表格而家嘅先後次序）重新編做連續嘅 1、2、3...號碼，
    // 執返因為刪除而留低嘅缺口（例如 #12 跳去 #18）。⚠️ 呢個操作會令
    // 「舊編號」同「新編號」對唔返位——如果已經有真實用戶擁有緊某隻貼紙
    // （即係佢哋 users/{uid}.ownedStickers 入面有嗰個舊 id 嘅紀錄），重新
    // 編號之後嗰個 id 會變成對應緊另一隻貼紙，等於將佢哋原有嘅收藏「亂
    // 掉」，唔係刪走但會變樣。所以特登喺按鈕嗰段文字、同呢度嘅 confirm
    // 入面都講清楚呢個風險，等管理員自己衡量而家係咪安全時機（例如仲
    // 未有學生正式扭過蛋）先撳。
    window.adminRenumberGachaStickers = async function() {
      if (!adminGachaDraft || !adminGachaDraft.stickers.length) return;
      if (!(await window.appConfirm('重新排序編號會將貼紙 id 由 1 開始重新連續編號。\n\n如果已經有真實學生使用這個扭蛋機扭過蛋、收藏了某幾隻貼紙，他們原有的收藏會因為編號改變而對應不上（貼紙會「變成另一隻」）。如果尚未有學生正式使用過，或者你願意接受洗牌整批收藏記錄，才繼續。\n\n確定要重新編號？'))) return;
      adminGachaDraft.stickers.forEach((p, i) => { p.id = i + 1; });
      renderAdminGachaTab();
      window.showToast('已重新排序編號，請點擊「儲存全部改動」才會正式生效', '🔢');
    };

    window.adminResetGachaDraft = function() {
      adminGachaDraft = null;
      renderAdminGachaTab();
      window.showToast('已還原至上次儲存的版本', '↩️');
    };

    window.adminSaveGachaConfig = async function() {
      if (!adminGachaDraft || !window.db || !window.fs) return;
      if (adminGachaDraft.stickers.length === 0) {
        window.showToast('最少要有一張貼圖才可以儲存', '⚠️');
        return;
      }
      const openSeries = adminGachaDraft.series.filter(se => se.enabled !== false &&
        adminGachaDraft.stickers.some(st => String(st.seriesId) === String(se.id) && (parseFloat(st.weight) || 0) > 0));
      if (adminGachaDraft.series.length && !openSeries.length) {
        window.showToast('最少要有一個「開放扭蛋」並且有貼圖的系列', '⚠️');
        return;
      }
      const payload = {
        stickers: adminGachaDraft.stickers,
        series: adminGachaDraft.series.map((se, i) => ({ id: String(se.id), name: se.name || '', nameEn: se.nameEn || '', enabled: se.enabled !== false, order: i + 1, cover: se.cover || null, machineImage: se.machineImage || null, bgImage: se.bgImage || null })),
        costNormal: adminGachaDraft.costNormal,
        costLucky: adminGachaDraft.costLucky,
        machineImageUrl: adminGachaDraft.machineImageUrl || null,
        fragmentGain: adminGachaDraft.fragmentGain || { common: 1, rare: 3, limited: 6 },
        fragmentCost: adminGachaDraft.fragmentCost || { common: 3, rare: 9, limited: 18 },
        updatedAt: Date.now(),
        updatedBy: window.currentUser ? window.currentUser.email : null
      };

      // Firestore 單一文件上限係 1MiB（呢個係 Firestore 硬性規定，冇得經設定
      // 提高），而全部貼紙（連圖片）而家都儲存喺同一份文件度。上傳圖片嗰陣
      // 已經自動壓縮到好細，但 50 隻貼紙如果幫大部分都上傳晒相片，加埋都
      // 可能踩線，所以呢度先計一計成份文件大約幾大，太大就即刻話俾你知，
      // 好過真係俾 Firestore 拒絕先發現。如果之後貼紙數量／相片再增加令
      // 呢個文件經常踩線，建議改用「每隻貼紙一份 Firestore 文件」嘅設計
      // （例如 stickers/{id} collection）嚟徹底解決呢個大小上限問題。
      const approxBytes = new Blob([JSON.stringify(payload)]).size;
      if (approxBytes > 900000) {
        window.showToast(`資料太大（約 ${(approxBytes / 1024).toFixed(0)}KB，Firestore 單一文件上限是 1024KB），請為較少貼紙更換圖片，或選擇較小的圖片`, '⚠️');
        return;
      }

      const btn = document.getElementById('btn-admin-save-gacha');
      if (btn) { btn.disabled = true; btn.innerText = '儲存中…'; }
      try {
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'gacha'), payload);
        window.showToast('扭蛋機設定已儲存，即時對所有用戶生效！', '🎉');
      } catch (err) {
        window.showToast('儲存失敗：' + (err.message || err), '❌');
      } finally {
        if (btn) { btn.disabled = false; btn.innerText = '儲存全部改動'; }
      }
    };

    // 讀取 Firestore 度嘅扭蛋機設定，覆蓋返 GACHA_STICKERS／GACHA_COST（如果未曾
    // 由管理員儲存過任何設定，就繼續用返程式碼入面寫死嘅預設值）。呢個要喺
    // 登入之後（有 window.db／window.fs）先可以叫，一開始 Firebase 未初始化
    // 之前無得讀。
    let gachaConfigUnsubscribe = null;
    function loadGachaConfigFromFirestore() {
      if (!window.db || !window.fs) return;
      if (gachaConfigUnsubscribe) gachaConfigUnsubscribe();
      const ref = window.fs.doc(window.db, 'admin_config', 'gacha');
      gachaConfigUnsubscribe = window.fs.onSnapshot(ref, (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data.stickers) && data.stickers.length) {
            GACHA_STICKERS.length = 0;
            GACHA_STICKERS.push(...data.stickers);
          }
          if (window.GACHA_SERIES) {
            window.GACHA_SERIES.length = 0;
            if (Array.isArray(data.series)) window.GACHA_SERIES.push(...data.series);
          }
          if (typeof data.costNormal === 'number') GACHA_COST.normal = data.costNormal;
          if (typeof data.costLucky === 'number') GACHA_COST.lucky = data.costLucky;
          // v1.217.0：貼圖碎片數值
          if (data.fragmentGain && typeof data.fragmentGain === 'object') window.GACHA_FRAGMENT_GAIN = Object.assign({ common: 1, rare: 3, limited: 6 }, data.fragmentGain);
          if (data.fragmentCost && typeof data.fragmentCost === 'object') window.GACHA_FRAGMENT_COST = Object.assign({ common: 3, rare: 9, limited: 18 }, data.fragmentCost);
          if (typeof window.gachaRenderFragmentCount === 'function') window.gachaRenderFragmentCount();
          // 扭蛋機外殼圖片：如果管理員上傳咗自訂圖，用返嗰張；冇嘅話
          // window.GACHA_MACHINE_IMAGE_URL 保持 null，畫面繼續用返
          // <img> tag 原本寫死嘅 assets/images/gacha-machine.png 預設圖。
          window.GACHA_MACHINE_IMAGE_URL = (typeof data.machineImageUrl === 'string' && data.machineImageUrl) ? data.machineImageUrl : null;
          if (typeof window.gachaApplyMachineImage === 'function') window.gachaApplyMachineImage();
          else {
            const machineImgEl = document.getElementById('gacha-machine-img');
            if (machineImgEl) machineImgEl.src = window.GACHA_MACHINE_IMAGE_URL || 'assets/images/gacha-machine.png';
          }
        }
        gachaConfigLoaded = true;
        window.GACHA_CONFIG_LOADED = true;
        applyGachaCostToUI();
        if (typeof updateStickerProgressUI === 'function') updateStickerProgressUI();
        // 貼紙資料（相片）依家先攞齊，如果用家揀咗貼紙做水獺頭像，要
        // 喺呢度補叫多一次先會顯示到啱嘅相（登入嗰陣呢份資料仲未到）
        if (typeof updateOtterDisplay === 'function') updateOtterDisplay();
        // 如果管理員岩岩好打開緊「扭蛋機獎品」呢個分頁、又仲未開始編輯
        // （adminGachaDraft 仲係 null，即係岩岩好卡喺「載入中...」嗰個畫面），
        // 而家攞到資料喇，即刻幫佢用返最新（剛儲存低嗰份）資料重新 render 一次，
        // 唔使佢自己撳一撳個分頁先會刷新
        if (adminTabShowing('gacha') && !adminGachaDraft) {
          const adminPanelEl = document.getElementById('admin-panel-container');
          if (adminPanelEl && adminPanelEl.style.display !== 'none') {
            renderAdminGachaTab();
          }
        }
      }, (err) => {
        console.error('讀取扭蛋機設定失敗:', err);
        gachaConfigLoaded = true; // 唔好卡死喺「載入中...」畫面，起碼俾程式碼入面嘅預設值可以用
        window.GACHA_CONFIG_LOADED = true;
        if (typeof window.updateOtterDisplay === 'function') window.updateOtterDisplay();
        if (typeof window.isCurrentUserAdmin === 'function' && window.isCurrentUserAdmin()) {
          window.showToast('讀取扭蛋機設定失敗（可能是 Firestore 規則未生效）：' + (err.message || err), '⚠️');
        }
      });
    }
    window.loadGachaConfigFromFirestore = loadGachaConfigFromFirestore;

    // ---------- 等級系統設定 ----------
    // EXP 賺取速度／升級難度／段位稱號而家改為由 Firestore（admin_config/levelSystem 文件）讀取，
    // 管理員喺呢度改完撳「儲存」，全站用戶即時生效，唔使再改碼、推 GitHub。
    let adminLevelDraft = null;
    let levelConfigLoaded = false;
    let levelConfigUnsubscribe = null;

    function renderAdminLevelTab() {
      const container = document.getElementById('admin-tab-level');
      if (!container) return;
      if (!adminLevelDraft) {
        if (!levelConfigLoaded) {
          container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">載入中等級系統設定...</p>';
          return;
        }
        adminLevelDraft = JSON.parse(JSON.stringify(LEVEL_CONFIG));
      }

      // v1.220.2：段位改為一個表格，同「到達需時」放埋一齊睇；
      // 已移除段位相片（主頁 Ottie 而家跟用戶揀嘅貼圖，唔再跟段位轉）
      // v1.224.0 溫習黃金時段（舊設定冇呢個欄位就用預設值）
      adminLevelDraft.goldenHour = Object.assign({ enabled: false, title: '書伴自習時段', start: '19:00', end: '23:00', expMultiplier: 2, stoneMultiplier: 2 }, adminLevelDraft.goldenHour || {});
      const gh = adminLevelDraft.goldenHour;
      const th = 'padding:6px 8px; text-align:left; white-space:nowrap; color:#6B7894; font-weight:700;';
      const td = 'padding:6px 8px; vertical-align:middle;';
      const rankRows = adminLevelDraft.ranks.map((r, idx) => `
        <tr style="border-top:1px solid var(--brand-100);">
          <td style="${td}"><input class="admin-input-sm" type="number" min="1" style="width:60px;" value="${r.minLevel}" oninput="adminLevelDraft.ranks[${idx}].minLevel = parseInt(this.value)||1; adminRefreshLevelPreview();"></td>
          <td style="${td}"><input class="admin-input-sm" style="width:96px;" value="${escapeHtml(r.title || '')}" oninput="adminLevelDraft.ranks[${idx}].title = this.value; adminRefreshLevelPreview();"></td>
          <td style="${td}"><input class="admin-input-sm" style="width:100px;" value="${escapeHtml(r.titleEn || '')}" oninput="adminLevelDraft.ranks[${idx}].titleEn = this.value"></td>
          <td style="${td} white-space:nowrap;">
            <img src="${window.stoneSrcForRank ? window.stoneSrcForRank(r) : 'assets/images/stone-1.png'}" id="admin-rank-stone-img-${idx}" alt="" width="26" height="26" style="vertical-align:middle;">
            <select class="admin-input-sm" style="vertical-align:middle; width:auto; min-width:0; max-width:96px;" onchange="adminLevelDraft.ranks[${idx}].stone = parseInt(this.value)||undefined; document.getElementById('admin-rank-stone-img-${idx}').src = 'assets/images/stone-' + (parseInt(this.value) || ${idx + 1 > 5 ? 5 : idx + 1}) + '.png';">
              <option value="">自動</option>
              ${['灰石','鵝卵石','雲石','水晶','寶石'].map((nm, k) => `<option value="${k + 1}" ${parseInt(r.stone) === k + 1 ? 'selected' : ''}>${nm}</option>`).join('')}
            </select>
          </td>
          <td style="${td} font-weight:700; white-space:nowrap;" id="admin-rank-time-${idx}"></td>
          <td style="${td} white-space:nowrap;" id="admin-rank-d1-${idx}"></td>
          <td style="${td} white-space:nowrap;" id="admin-rank-d3-${idx}"></td>
          <td style="${td}"><button class="btn btn-red" style="font-size:13px; padding:3px 8px;" onclick="adminRemoveLevelRank(${idx})">刪除</button></td>
        </tr>
        <tr>
          <td colspan="8" style="padding:0 8px 10px;">
            <input class="admin-input-sm" style="width:100%; box-sizing:border-box;" placeholder="段位說明（用戶點擊等級時彈出視窗顯示）" value="${escapeHtml(r.desc || '')}" oninput="adminLevelDraft.ranks[${idx}].desc = this.value">
          </td>
        </tr>
      `).join('');

      container.innerHTML = `
        <div class="admin-card">
          <h3 style="font-size:14px; font-weight:bold; margin-bottom:8px;">升級速度</h3>
          <div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:6px;">
            <label style="font-size:13px; color:#555; display:flex; align-items:center; gap:6px;">
              每溫習 1 分鐘可得 EXP：
              <input class="admin-input-sm" type="number" min="0" step="0.1" style="width:70px;" value="${adminLevelDraft.expPerMinute}" oninput="adminLevelDraft.expPerMinute = parseFloat(this.value)||0; adminRefreshLevelPreview();">
            </label>
            <label style="font-size:13px; color:#555; display:flex; align-items:center; gap:6px;">
              升級難度係數：
              <input class="admin-input-sm" type="number" min="1" step="1" style="width:70px;" value="${adminLevelDraft.levelCurveFactor}" oninput="adminLevelDraft.levelCurveFactor = parseFloat(this.value)||10; adminRefreshLevelPreview();">
            </label>
          </div>
          <p style="font-size:13px; color:#888;">升到第 L 級總共需要的 EXP = 難度係數 × L × (L−1)。係數越大，升級越慢。改動後下面的時間會即時更新。</p>
        </div>

        <div class="admin-card" style="margin-top:12px;">
          <h3 style="font-size:14px; font-weight:bold; margin-bottom:4px;">段位（由低到高，第一個段位的等級門檻請設為 1）</h3>
          <p style="font-size:13px; color:#888; margin-bottom:8px;">稱號會顯示在視訊溫習室名牌、排行榜及個人資料。石頭是 Ottie 每 15 分鐘磨好的石頭款式，顯示在名牌、主頁及等級詳情（「自動」即按段位次序配）。「到達需時」按上面的升級速度計算。</p>
          <div style="overflow-x:auto;">
            <table style="border-collapse:collapse; font-size:13px; color:var(--brand-800); min-width:740px; width:100%;">
              <thead><tr>
                <th style="${th}">等級門檻</th><th style="${th}">稱號（中）</th><th style="${th}">稱號（英）</th><th style="${th}">石頭</th>
                <th style="${th}">到達需時</th><th style="${th}">每日溫 3 小時</th><th style="${th}">每日溫 5 小時</th><th style="${th}"></th>
              </tr></thead>
              <tbody>${rankRows}</tbody>
            </table>
          </div>
          <button class="btn btn-outline" style="margin-top:6px; font-size:13px;" onclick="adminAddLevelRank()">新增段位</button>
          <details style="margin-top:12px;">
            <summary style="font-size:13px; font-weight:700; color:var(--brand-600); cursor:pointer;">查看其他等級所需時間</summary>
            <div id="admin-level-preview" style="font-size:13px; margin-top:8px;"></div>
          </details>
        </div>

        <div class="admin-card" style="margin-top:12px;">
          <h3 style="font-size:14px; font-weight:bold; margin-bottom:8px;">升級獎勵</h3>
          <div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:10px;">
            <label style="font-size:13px; color:#555; display:flex; align-items:center; gap:6px;">
              每升一級送免費扭蛋券：
              <input class="admin-input-sm" type="number" min="0" max="10" step="1" style="width:60px;" value="${adminLevelDraft.levelUpTickets ?? 1}" oninput="adminLevelDraft.levelUpTickets = parseInt(this.value)||0"> 張
            </label>
            <label style="font-size:13px; color:#555; display:flex; align-items:center; gap:6px;">
              每
              <input class="admin-input-sm" type="number" min="1" max="100" step="1" style="width:60px;" value="${adminLevelDraft.milestoneEvery ?? 5}" oninput="adminLevelDraft.milestoneEvery = parseInt(this.value)||5">
              級額外送碎片：
              <input class="admin-input-sm" type="number" min="0" max="1000" step="1" style="width:60px;" value="${adminLevelDraft.milestoneFragments ?? 5}" oninput="adminLevelDraft.milestoneFragments = parseInt(this.value)||0"> 個
            </label>
          </div>
          <p style="font-size:13px; color:#888;">用戶溫習時一升級，伺服器就會自動派發。免費扭蛋券可在扭蛋頁單抽一次，不扣積分。每一級只派一次。</p>
        </div>

        <div class="admin-card" style="margin-top:12px;">
          <h3 style="font-size:14px; font-weight:bold; margin-bottom:8px;">溫習黃金時段</h3>
          <div style="display:flex; gap:16px; flex-wrap:wrap; align-items:center; margin-bottom:10px; font-size:13px; color:#555;">
            <label style="display:flex; align-items:center; gap:6px;">
              <input type="checkbox" ${gh.enabled ? 'checked' : ''} onchange="adminLevelDraft.goldenHour.enabled = this.checked"> 啟用
            </label>
            <label style="display:flex; align-items:center; gap:6px;">名稱：
              <input class="admin-input-sm" style="width:130px;" value="${escapeHtml(gh.title || '')}" oninput="adminLevelDraft.goldenHour.title = this.value">
            </label>
            <label style="display:flex; align-items:center; gap:6px;">每日
              <input class="admin-input-sm" type="time" style="width:auto;" value="${gh.start}" oninput="adminLevelDraft.goldenHour.start = this.value">
              至
              <input class="admin-input-sm" type="time" style="width:auto;" value="${gh.end}" oninput="adminLevelDraft.goldenHour.end = this.value">
            </label>
            <label style="display:flex; align-items:center; gap:6px;">EXP ×
              <input class="admin-input-sm" type="number" min="1" max="5" step="0.1" style="width:64px;" value="${gh.expMultiplier}" oninput="adminLevelDraft.goldenHour.expMultiplier = parseFloat(this.value)||1">
            </label>
            <label style="display:flex; align-items:center; gap:6px;">石頭 ×
              <input class="admin-input-sm" type="number" min="1" max="5" step="0.1" style="width:64px;" value="${gh.stoneMultiplier}" oninput="adminLevelDraft.goldenHour.stoneMultiplier = parseFloat(this.value)||1">
            </label>
          </div>
          <p style="font-size:13px; color:#888;">以香港時間計算；結束時間早於開始時間代表跨過午夜。時段內每分鐘溫習的 EXP 及石頭進度按倍數計算（倍數可設小數，最多一位，例如 1.5；石頭 ×2 即每 7.5 分鐘一粒），由伺服器計算，用戶改不到。時段內所有用戶頁頂會顯示提示。</p>
        </div>

        <div style="margin-top:14px; display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="adminSaveLevelConfig()">儲存全部改動</button>
          <button class="btn btn-outline" onclick="adminResetLevelDraft()">還原未儲存的改動</button>
        </div>
      `;
      adminRefreshLevelPreview();
    }
    window.renderAdminLevelTab = renderAdminLevelTab;

    window.adminRefreshLevelPreview = function() {
      const el = document.getElementById('admin-level-preview');
      if (!el || !adminLevelDraft) return;
      const f = adminLevelDraft.levelCurveFactor || 10;
      const perMin = adminLevelDraft.expPerMinute || 0;
      // 關鍵等級：每個段位門檻，加埋 2、5、10、15、20、30、40、50、60、80、100
      const rankLevels = (adminLevelDraft.ranks || []).map(r => parseInt(r.minLevel) || 1);
      const keyLevels = Array.from(new Set([2, 5, 10, 15, 20, 30, 40, 50, 60, 80, 100].concat(rankLevels)))
        .filter(L => L >= 2).sort((a, b) => a - b);
      const rankAt = (L) => {
        const r = (adminLevelDraft.ranks || []).find(x => (parseInt(x.minLevel) || 1) === L);
        return r ? (r.title || '') : '';
      };
      const hoursFor = (L) => perMin > 0 ? (f * L * (L - 1)) / perMin / 60 : Infinity;
      const fmtH = (h) => {
        if (!isFinite(h)) return '—';
        if (h < 1) return `${Math.round(h * 60)} 分鐘`;
        return `${h < 10 ? h.toFixed(1) : Math.round(h)} 小時`;
      };
      const fmtDays = (h, perDay) => isFinite(h) ? `約 ${Math.max(1, Math.ceil(h / perDay))} 日` : '—';
      (adminLevelDraft.ranks || []).forEach((r, idx) => {
        const L = parseInt(r.minLevel) || 1;
        const h = L <= 1 ? 0 : hoursFor(L);
        const set = (id, v) => { const c = document.getElementById(id); if (c) c.innerText = v; };
        set('admin-rank-time-' + idx, L <= 1 ? '起點' : fmtH(h));
        set('admin-rank-d1-' + idx, L <= 1 ? '—' : fmtDays(h, 3));
        set('admin-rank-d3-' + idx, L <= 1 ? '—' : fmtDays(h, 5));
      });
      let prevH = 0;
      const rows = keyLevels.map(L => {
        const h = hoursFor(L);
        const gap = isFinite(h) ? h - prevH : Infinity;
        prevH = isFinite(h) ? h : prevH;
        const nextLvH = isFinite(h) ? (f * 2 * L) / perMin / 60 : Infinity; // 由 L 升到 L+1 要幾耐
        const rk = rankAt(L);
        return `<tr${rk ? ' style="background:var(--brand-50);"' : ''}>
          <td style="padding:6px 8px; font-weight:700; white-space:nowrap;">Lv.${L}${rk ? ` <span style="font-size:12px; color:var(--brand-600);">${escapeHtml(rk)}</span>` : ''}</td>
          <td style="padding:6px 8px; text-align:right; white-space:nowrap;">${(f * L * (L - 1)).toLocaleString()}</td>
          <td style="padding:6px 8px; text-align:right; white-space:nowrap; font-weight:700;">${fmtH(h)}</td>
          <td style="padding:6px 8px; text-align:right; white-space:nowrap;">+${fmtH(gap)}</td>
          <td style="padding:6px 8px; text-align:right; white-space:nowrap;">${fmtH(nextLvH)}</td>
          <td style="padding:6px 8px; text-align:right; white-space:nowrap;">${fmtDays(h, 3)}</td>
          <td style="padding:6px 8px; text-align:right; white-space:nowrap;">${fmtDays(h, 5)}</td>
        </tr>`;
      }).join('');
      el.innerHTML = `

        <div style="overflow-x:auto;">
          <table style="border-collapse:collapse; font-size:13px; font-weight:normal; color:var(--brand-800); min-width:560px;">
            <thead><tr style="border-bottom:1px solid var(--brand-200); color:#6B7894;">
              <th style="padding:6px 8px; text-align:left;">等級</th>
              <th style="padding:6px 8px; text-align:right;">累積 EXP</th>
              <th style="padding:6px 8px; text-align:right;">累積溫習時間</th>
              <th style="padding:6px 8px; text-align:right;">比上一行多</th>
              <th style="padding:6px 8px; text-align:right;">再升一級要</th>
              <th style="padding:6px 8px; text-align:right;">每日溫 3 小時</th>
              <th style="padding:6px 8px; text-align:right;">每日溫 5 小時</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    };

    window.adminAddLevelRank = function() {
      if (!adminLevelDraft) return;
      const maxL = adminLevelDraft.ranks.reduce((m, r) => Math.max(m, parseInt(r.minLevel) || 1), 1);
      adminLevelDraft.ranks.push({ minLevel: maxL + 10, title: '新段位', titleEn: 'New Rank', desc: '' });
      renderAdminLevelTab();
    };

    window.adminRemoveLevelRank = function(idx) {
      if (!adminLevelDraft) return;
      if (adminLevelDraft.ranks.length <= 1) { window.showToast('最少需保留一個段位', '⚠️'); return; }
      adminLevelDraft.ranks.splice(idx, 1);
      renderAdminLevelTab();
    };

    window.adminResetLevelDraft = function() {
      adminLevelDraft = null;
      renderAdminLevelTab();
    };

    window.adminUploadRankPhoto = async function(idx, inputEl) {
      if (!adminLevelDraft || !adminLevelDraft.ranks[idx]) return;
      const file = inputEl.files && inputEl.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        window.showToast('請選擇圖片檔案', '⚠️');
        return;
      }
      try {
        const dataUrl = await compressImageFileToDataURL(file, 300, 0.8);
        adminLevelDraft.ranks[idx].photo = dataUrl;
        renderAdminLevelTab();
      } catch (err) {
        window.showToast('圖片讀取失敗，請再試一次', '❌');
      }
    };

    window.adminRemoveRankPhoto = function(idx) {
      if (!adminLevelDraft || !adminLevelDraft.ranks[idx]) return;
      delete adminLevelDraft.ranks[idx].photo;
      renderAdminLevelTab();
    };

    window.adminSaveLevelConfig = async function() {
      if (!adminLevelDraft || !window.db || !window.fs) return;
      if (!adminLevelDraft.ranks.length) { window.showToast('最少要有一個段位', '❌'); return; }
      const payload = {
        expPerMinute: adminLevelDraft.expPerMinute,
        levelCurveFactor: adminLevelDraft.levelCurveFactor,
        levelUpTickets: Math.max(0, Math.min(10, Math.floor(adminLevelDraft.levelUpTickets ?? 1))),
        milestoneEvery: Math.max(1, Math.min(100, Math.floor(adminLevelDraft.milestoneEvery ?? 5))),
        milestoneFragments: Math.max(0, Math.min(1000, Math.floor(adminLevelDraft.milestoneFragments ?? 5))),
        goldenHour: (() => {
          const g = adminLevelDraft.goldenHour || {};
          const okT = (t) => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
          const m = (v) => Math.max(1, Math.min(5, Math.round((v || 1) * 10) / 10));
          return { enabled: g.enabled === true, title: String(g.title || '').slice(0, 20), start: okT(g.start) ? g.start : '19:00', end: okT(g.end) ? g.end : '23:00', expMultiplier: m(g.expMultiplier), stoneMultiplier: m(g.stoneMultiplier) };
        })(),
        // 段位相片已停用：儲存時順手清走舊相片，減細設定文件
        ranks: adminLevelDraft.ranks.map(r => ({ minLevel: parseInt(r.minLevel) || 1, title: r.title || '', titleEn: r.titleEn || '', desc: r.desc || '', ...(parseInt(r.stone) >= 1 && parseInt(r.stone) <= 5 ? { stone: parseInt(r.stone) } : {}) }))
      };
      const approxBytes = new Blob([JSON.stringify(payload)]).size;
      if (approxBytes > 900000) {
        window.showToast(`資料太大（約 ${(approxBytes / 1024).toFixed(0)}KB，Firestore 單一文件上限是 1024KB），請為較少段位更換圖片，或選擇較小的圖片`, '⚠️');
        return;
      }
      try {
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'levelSystem'), payload);
        window.showToast('已儲存等級系統設定', '✅');
      } catch (err) {
        window.showToast('儲存失敗：' + (err.message || err), '❌');
      }
    };

    function loadLevelConfigFromFirestore() {
      if (!window.db || !window.fs) return;
      if (levelConfigUnsubscribe) levelConfigUnsubscribe();
      const ref = window.fs.doc(window.db, 'admin_config', 'levelSystem');
      levelConfigUnsubscribe = window.fs.onSnapshot(ref, (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (typeof data.expPerMinute === 'number') LEVEL_CONFIG.expPerMinute = data.expPerMinute;
          if (typeof data.levelCurveFactor === 'number') LEVEL_CONFIG.levelCurveFactor = data.levelCurveFactor;
          ['levelUpTickets', 'milestoneEvery', 'milestoneFragments'].forEach(k => { if (typeof data[k] === 'number') LEVEL_CONFIG[k] = data[k]; });
          if (Array.isArray(data.ranks) && data.ranks.length) LEVEL_CONFIG.ranks = data.ranks;
          if (data.goldenHour && typeof data.goldenHour === 'object') LEVEL_CONFIG.goldenHour = data.goldenHour;
        }
        levelConfigLoaded = true;
        if (typeof window.refreshGoldenHourBar === 'function') window.refreshGoldenHourBar();
        if (window.currentUser) {
          updateLevelDisplay();
          // 段位嘅水獺相片就係喺呢個設定入面，一齊刷新，唔使等5分鐘嗰個定時器先見到
          updateOtterDisplay();
        }
        if (adminTabShowing('level') && !adminLevelDraft) {
          const adminPanelEl = document.getElementById('admin-panel-container');
          if (adminPanelEl && adminPanelEl.style.display !== 'none') {
            renderAdminLevelTab();
          }
        }
      }, (err) => {
        console.error('讀取等級系統設定失敗:', err);
        levelConfigLoaded = true;
        if (typeof window.isCurrentUserAdmin === 'function' && window.isCurrentUserAdmin()) {
          window.showToast('讀取等級系統設定失敗（可能是 Firestore 規則未生效）：' + (err.message || err), '⚠️');
        }
      });
    }
    window.loadLevelConfigFromFirestore = loadLevelConfigFromFirestore;

    function applyGachaCostToUI() {
      const setText = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
      setText('gacha-cost-normal-btn', GACHA_COST.normal);
      setText('gacha-cost-lucky-btn', GACHA_COST.lucky);
    }
    window.applyGachaCostToUI = applyGachaCostToUI;

    // ---------- 房間管理 ----------
    function renderAdminRoomsTab() {
      const container = document.getElementById('admin-tab-rooms');
      if (!container || !window.db || !window.fs) return;
      container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">載入中房間資料...</p>';

      if (adminRoomsUnsubscribe) adminRoomsUnsubscribe();
      adminRoomsUnsubscribe = window.fs.onSnapshot(window.fs.collection(window.db, 'rooms'), (snapshot) => {
        if (snapshot.empty) {
          container.innerHTML = '<div class="admin-card" style="text-align:center; color:#999;">目前沒有任何溫習房</div>';
          return;
        }
        const rows = snapshot.docs.map(docSnap => {
          const r = docSnap.data();
          const createdMs = typeof r.createdAt === 'number' ? r.createdAt : (r.createdAt ? new Date(r.createdAt).getTime() : 0);
          const created = createdMs ? formatTime(createdMs) : '—';
          return `
            <tr>
              <td>${escapeHtml(r.name || '')}</td>
              <td>${escapeHtml(r.subject || '')}</td>
              <td>${escapeHtml(r.hostName || '匿名')}</td>
              <td>${r.participantCount || 0}/${(typeof window.resolveRoomCapacity === 'function') ? window.resolveRoomCapacity(r) : (window.ROOM_CAPACITY || 4)}</td>
              <td>${r.duration || 30} 分鐘</td>
              <td>${created}</td>
              <td><button class="btn btn-red" style="font-size:13px; padding:3px 8px;" onclick="adminDeleteRoom('${docSnap.id}', ${window.jsArg(r.name || '')})">強制關閉</button></td>
            </tr>
          `;
        }).join('');
        container.innerHTML = `
          <div class="admin-card">
            <div style="overflow-x:auto;">
              <table class="admin-table">
                <thead><tr><th>房間名稱</th><th>科目</th><th>房主</th><th>人數</th><th>目標時間</th><th>建立時間</th><th></th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>
        `;
      }, (err) => {
        container.innerHTML = `<div class="admin-card" style="color:#c0392b;">載入失敗：${err.message || err}</div>`;
      });
    }
    window.renderAdminRoomsTab = renderAdminRoomsTab;

    window.adminDeleteRoom = async function(roomId, roomName) {
      if (!(await window.appConfirm(`確定要強制關閉房間「${roomName}」？裡面的同學會即時被移至大廳。`))) return;
      try {
        await window.fs.deleteDoc(window.fs.doc(window.db, 'rooms', roomId));
        await logAdminAction('強制關閉房間', { roomId, roomName });
        window.showToast('已強制關閉該房間', '🗑️');
      } catch (err) {
        window.showToast('操作失敗：' + (err.message || err), '❌');
      }
    };

    // ---------- 疑難解答區管理 ----------
    function renderAdminQaTab() {
      const container = document.getElementById('admin-tab-qa');
      if (!container || !window.db || !window.fs) return;
      container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">載入中帖子資料...</p>';

      if (adminQaUnsubscribe) adminQaUnsubscribe();
      adminQaUnsubscribe = window.fs.onSnapshot(window.fs.collection(window.db, 'qa_posts'), (snapshot) => {
        if (snapshot.empty) {
          container.innerHTML = '<div class="admin-card" style="text-align:center; color:#999;">目前沒有任何提問</div>';
          return;
        }
        const docs = snapshot.docs.slice().sort((a, b) => (b.data().createdAt || 0) - (a.data().createdAt || 0));
        const rows = docs.map(docSnap => {
          const p = docSnap.data();
          return `
            <tr>
              <td>${escapeHtml(p.subject || '')}</td>
              <td style="max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(p.title || '')}</td>
              <td>${escapeHtml(p.authorName || '匿名')}</td>
              <td>${formatTime(p.createdAt)}</td>
              <td><button class="btn btn-red" style="font-size:13px; padding:3px 8px;" onclick="adminDeleteQaPost('${docSnap.id}')">刪除</button></td>
            </tr>
          `;
        }).join('');
        container.innerHTML = `
          <div class="admin-card">
            <div style="overflow-x:auto;">
              <table class="admin-table">
                <thead><tr><th>科目</th><th>標題</th><th>作者</th><th>發帖時間</th><th></th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>
        `;
      }, (err) => {
        container.innerHTML = `<div class="admin-card" style="color:#c0392b;">載入失敗：${err.message || err}</div>`;
      });
    }
    window.renderAdminQaTab = renderAdminQaTab;

    window.adminDeleteQaPost = async function(postId) {
      if (!(await window.appConfirm('確定刪除這個提問？裡面的留言都會一齊清埋。'))) return;
      try {
        // 先刪晒 comments 呢個 subcollection 入面嘅所有文件，先刪返個 post 本身
        // （Firestore 刪除文件唔會自動連 subcollection 一齊刪，要自己手動清）
        const commentsRef = window.fs.collection(window.db, 'qa_posts', postId, 'comments');
        const commentsSnap = await window.fs.getDocs(commentsRef);
        await Promise.all(commentsSnap.docs.map(c => window.fs.deleteDoc(c.ref)));
        await window.fs.deleteDoc(window.fs.doc(window.db, 'qa_posts', postId));
        window.showToast('提問已刪除', '🗑️');
      } catch (err) {
        window.showToast('刪除失敗：' + (err.message || err), '❌');
      }
    };

    // ---------- 用戶管理 ----------
    // 「最後上線時間」欄用嘅格式化函數：lastLoginAt 由 app-core.js 嘅
    // onAuthStateChanged() 每次登入成功就寫一次（Date.now() 嘅 epoch
    // ms，同呢個 app 其他 createdAt／updatedAt 欄位一致，冇用 Firestore
    // serverTimestamp）。呢個功能推出之前註冊嘅舊帳號，喺佢哋下次登入
    // 之前都會冇呢個欄位，顯示「從未登入」（實際意思係「呢個功能推出
    // 之後仲未登入過」，唔係真係話個帳戶未用過）。
    function formatLastLoginDisplay(ts) {
      if (!ts) return '<span style="color:#bbb; font-size:13px;">從未登入</span>';
      const d = new Date(ts);
      if (isNaN(d.getTime())) return '<span style="color:#bbb; font-size:13px;">從未登入</span>';
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    // 「用戶管理」分頁而家分兩個分頁列表：(1) 中學／大專／大學——即
    // grade 唔係「其他自修生」嘅帳戶（包括舊帳戶未設定 grade 嘅情況，
    // 一律歸呢一邊）；(2) 其他／自修生——grade 剛好等於「其他自修生」
    // 嘅帳戶。兩邊各自獨立一個表格，唔使成頁一齊顯示，方便管理員搵人。
    // 第三個分頁「管理員」：loginId 喺 window.ADMIN_LOGIN_IDS 入面嘅帳戶，
    // 唔論 grade 係乜都只會喺呢度出現，唔再混入學生嗰兩個分頁。
    let adminUsersGradeGroup = 'school'; // 'school' | 'other' | 'admin'
    // 最新一次 onSnapshot 返嚟嘅用戶清單，快取喺度，等切換分頁嗰陣可以
    // 即刻用返呢份資料重新畫table，唔使重新監聽一次 collection。
    let adminUsersLastSortedDocs = null;

    window.switchAdminUsersGradeGroup = function(group) {
      adminUsersGradeGroup = (group === 'other' || group === 'admin') ? group : 'school';
      renderAdminUsersTable();
    };

    function renderAdminUsersTable() {
      const container = document.getElementById('admin-tab-users');
      if (!container) return;
      if (!adminUsersLastSortedDocs) return;

      if (adminUsersLastSortedDocs.length === 0) {
        container.innerHTML = '<div class="admin-card" style="text-align:center; color:#999;">目前沒有任何用戶</div>';
        return;
      }

      const filteredDocs = adminUsersLastSortedDocs.filter((docSnap) => {
        const u = docSnap.data();
        const adminIds = Array.isArray(window.ADMIN_LOGIN_IDS) ? window.ADMIN_LOGIN_IDS : [];
        const isAdminAcc = !!u.loginId && adminIds.includes(u.loginId);
        if (adminUsersGradeGroup === 'admin') return isAdminAcc;
        if (isAdminAcc) return false;
        const isOther = (u.grade || '') === '其他自修生';
        return adminUsersGradeGroup === 'other' ? isOther : !isOther;
      });

      const rows = filteredDocs.map(docSnap => {
        const u = docSnap.data();
        const uid = docSnap.id;
        const suspended = window.isSuspendedNow ? window.isSuspendedNow(u) : !!u.suspended;
        // Email 欄顯示用戶註冊時真正填嘅聯絡電郵（contactEmail）；呢個先係
        // 佢哋自己打嗰個地址。u.email 其實係內部合成嘅登入用電郵
        // （{帳號ID}@concenmate.local，唔係真實可送達嘅地址），舊帳號冇
        // contactEmail 先 fallback 用返佢
        const displayEmail = u.contactEmail || u.email || '—';
        return `
          <tr style="${suspended ? 'opacity:.55;' : ''}">
            <td><a href="javascript:void(0)" style="color:var(--brand-700); font-weight:700;" onclick="adminSelectSupportUser('${uid}', true)">${escapeHtml(u.username || '—')}</a>${suspensionLabelHtml(u)}</td>
            <td>${u.loginId ? escapeHtml(u.loginId) : '<span style="color:#c99; font-size:13px;">未設定</span>'}</td>
            <td>${escapeHtml(displayEmail)}</td>
            <td>${escapeHtml(u.school || '—')}</td>
            <td>${escapeHtml(u.grade || '—')}</td>
            <td style="white-space:nowrap;">${formatLastLoginDisplay(u.lastLoginAt)}</td>
            <td><input class="admin-input-sm" type="number" style="width:70px;" value="${u.points || 0}" id="admin-user-points-${uid}"></td>
            <td><input class="admin-input-sm" style="width:60px;" value="${(parseFloat(u.hours) || 0).toFixed(1)}" id="admin-user-hours-${uid}"></td>
            <td><input class="admin-input-sm" type="number" style="width:70px;" value="${u.exp || 0}" id="admin-user-exp-${uid}"></td>
            <td style="display:flex; gap:4px; flex-wrap:wrap;">
              <button class="btn btn-outline" style="font-size:13px; padding:3px 8px;" onclick="adminSaveUserStats('${uid}')">儲存</button>
              <button class="btn ${suspended ? 'btn-primary' : 'btn-red'}" style="font-size:13px; padding:3px 8px;" onclick="adminToggleSuspendUser('${uid}', ${!suspended})">${suspended ? '解除停權' : '永久停權'}</button>
              ${u.strikeCount > 0 ? `<button class="btn btn-outline" style="font-size:13px; padding:3px 8px;" onclick="adminResetStrikes('${uid}')">重設違規次數</button>` : ''}
            </td>
          </tr>
        `;
      }).join('');

      const emptyGroupMsg = '<tr><td colspan="10" style="text-align:center; color:#999; padding:16px;">此分類目前沒有用戶</td></tr>';

      container.innerHTML = `
        <div class="admin-card">
          <h3 style="font-size:16px; font-weight:bold; color:var(--brand-800); margin-bottom:6px;">全部用戶</h3>
          <p style="font-size:13px; color:#888; margin-bottom:10px;">點擊用戶名可在上方查看詳情及處理（補發、驗證、更正出生年月等）。修改積分／時數／EXP 後，請記得逐行點擊「儲存」；EXP 決定用戶的溫習等級與段位，一般毋須人手修改，只有在特殊情況（例如補發）才使用。「停權」會令該用戶下次登入時被強制登出。</p>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
            <button type="button" class="btn ${adminUsersGradeGroup === 'school' ? 'btn-primary' : 'btn-outline'}" style="font-size:13px; padding:5px 12px;" onclick="switchAdminUsersGradeGroup('school')">中學／大專／大學</button>
            <button type="button" class="btn ${adminUsersGradeGroup === 'other' ? 'btn-primary' : 'btn-outline'}" style="font-size:13px; padding:5px 12px;" onclick="switchAdminUsersGradeGroup('other')">其他／自修生</button>
            <button type="button" class="btn ${adminUsersGradeGroup === 'admin' ? 'btn-primary' : 'btn-outline'}" style="font-size:13px; padding:5px 12px;" onclick="switchAdminUsersGradeGroup('admin')">管理員</button>
          </div>
          <div style="overflow-x:auto;">
            <table class="admin-table">
              <thead><tr><th>用戶名</th><th>帳號 ID</th><th>Email</th><th>學校</th><th>年級</th><th>最後上線</th><th>積分</th><th>時數</th><th>EXP</th><th></th></tr></thead>
              <tbody>${rows || emptyGroupMsg}</tbody>
            </table>
          </div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:12px; font-size:13px; color:#6B7894;">
            <span>已載入 ${adminUsersLastSortedDocs.length}${adminUsersTotal != null ? ' / 共 ' + adminUsersTotal : ''} 位用戶</span>
            ${adminUsersAllLoaded ? '' : '<button type="button" class="btn btn-outline" style="font-size:13px; padding:5px 12px;" onclick="window.adminLoadMoreUsers()">載入更多</button>'}
            <button type="button" class="btn btn-outline" style="font-size:13px; padding:5px 12px;" onclick="window.adminReloadUsers()">重新整理</button>
          </div>
        </div>
      `;
    }

    // v1.230.0：改為分頁載入（每次 50 位），唔再即時監聽全部用戶，用戶多都唔會大量讀取
    const ADMIN_USERS_PAGE = 50;
    let adminUsersCursor = null;
    let adminUsersAllLoaded = false;
    let adminUsersTotal = null;
    let adminUsersLoading = false;
    function sortAdminUsers(arr) {
      return arr.sort((a, b) => {
        const ta = new Date(a.data().createdAt || 0).getTime() || 0;
        const tb = new Date(b.data().createdAt || 0).getTime() || 0;
        return ta - tb;
      });
    }
    function mergeIntoSupportCache(docs) {
      if (!adminSupportUsersCache) adminSupportUsersCache = [];
      docs.forEach(d => {
        const i = adminSupportUsersCache.findIndex(u => u.uid === d.id);
        const item = { uid: d.id, data: d.data() };
        if (i >= 0) adminSupportUsersCache[i] = item; else adminSupportUsersCache.push(item);
      });
    }
    async function loadAdminUsersPage(reset) {
      if (adminUsersLoading) return;
      adminUsersLoading = true;
      try {
        if (reset) { adminUsersCursor = null; adminUsersAllLoaded = false; adminUsersLastSortedDocs = []; }
        const col = window.fs.collection(window.db, 'users');
        const parts = [col, window.fs.orderBy(window.fs.documentId()), window.fs.limit(ADMIN_USERS_PAGE)];
        if (adminUsersCursor) parts.splice(2, 0, window.fs.startAfter(adminUsersCursor));
        const [snap, countSnap] = await Promise.all([
          window.fs.getDocs(window.fs.query(...parts)),
          (reset || adminUsersTotal == null) ? window.fs.getCountFromServer(col).catch(() => null) : Promise.resolve(null),
        ]);
        if (countSnap) adminUsersTotal = countSnap.data().count;
        if (snap.docs.length) adminUsersCursor = snap.docs[snap.docs.length - 1];
        if (snap.docs.length < ADMIN_USERS_PAGE) adminUsersAllLoaded = true;
        adminUsersLastSortedDocs = sortAdminUsers((adminUsersLastSortedDocs || []).concat(snap.docs));
        mergeIntoSupportCache(snap.docs);
        adminSupportUsersCacheLoading = false;
      } catch (err) {
        const container = document.getElementById('admin-tab-users');
        if (container) container.innerHTML = `<div class="admin-card" style="color:#c0392b;">載入失敗：${escapeHtml(err.message || err)}</div>`;
        adminUsersLoading = false;
        return;
      }
      adminUsersLoading = false;
      renderAdminUsersTable();
      if (adminTabShowing('support')) renderAdminSupportTab();
    }
    window.adminLoadMoreUsers = function() { loadAdminUsersPage(false); };
    window.adminReloadUsers = function() { loadAdminUsersPage(true); };
    function renderAdminUsersTab() {
      const container = document.getElementById('admin-tab-users');
      if (!container || !window.db || !window.fs) return;
      if (adminUsersUnsubscribe) { adminUsersUnsubscribe(); adminUsersUnsubscribe = null; }
      container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">正在載入用戶資料…</p>';
      loadAdminUsersPage(true);
    }
    window.renderAdminUsersTab = renderAdminUsersTab;

    window.adminSaveUserStats = async function(uid) {
      const ptsEl = document.getElementById('admin-user-points-' + uid);
      const hoursEl = document.getElementById('admin-user-hours-' + uid);
      const expEl = document.getElementById('admin-user-exp-' + uid);
      const points = parseInt(ptsEl && ptsEl.value, 10) || 0;
      // ⚠️ 呢度一定要用 parseFloat 將輸入格嘅文字轉做數字先可以寫入 Firestore；
      // 之前直接攞 .value（永遠係文字）寫落去，會令 hours 呢個欄位由數字變咗
      // 文字，後續 Cloud Function 用 "+" 累加嗰陣就會變成文字併接（例如
      // "0.0" + 0.0166666 = "0.00.0166666..."），排行榜同時數就會永久錯亂。
      const hours = parseFloat(hoursEl && hoursEl.value) || 0;
      const exp = parseInt(expEl && expEl.value, 10) || 0;
      try {
        await window.fs.updateDoc(window.fs.doc(window.db, 'users', uid), { points, hours, exp });
        await logAdminAction('更新用戶資料', { uid, points, hours, exp });
        window.showToast('已更新用戶資料', '✅');
      } catch (err) {
        window.showToast('更新失敗：' + (err.message || err), '❌');
      }
    };

    // v1.225.0：停權改由伺服器（moderateUser）處理，永久停權會同時停用登入帳戶
    window.adminToggleSuspendUser = async function(uid, suspend) {
      if (!(await window.appConfirm(suspend ? '確定永久停用這個帳戶？用戶會即時被登出，並無法再登入。' : '確定解除這個帳戶的停權？'))) return;
      try {
        await window.callCloudFunction('moderateUser', { uid, action: suspend ? 'permanent' : 'lift', reason: suspend ? '管理員手動停權' : '' });
        window.showToast(suspend ? '已永久停用該帳戶' : '已解除停權', suspend ? '🚫' : '✅');
      } catch (err) {
        window.showToast('操作失敗：' + (window.friendlyErrorText ? window.friendlyErrorText(err) : (err.message || err)), '❌');
      }
    };
    // ===================== 直播設定（Study with me，v1.226.0） =====================
    // admin_config/streaming。第一階段只記錄開通資格；直播本身未上線，總開關預設關閉。
    const STREAMING_DEFAULTS = { enabled: false, requiredDays: 30, minMinutesPerDay: 15, minStreamAge: 16, maxDurationHours: 4, maxConcurrent: 20, monthlyBudgetHkd: 500, hotThreshold: 50, hotMinutes: 3, idleShutdownMinutes: 30, defaultQuality: '480p', hotQuality: '720p' };
    let adminStreamingDraft = null;
    async function renderAdminStreamingTab() {
      const container = document.getElementById('admin-tab-streaming');
      if (!container) return;
      if (!adminStreamingDraft) {
        container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">正在載入直播設定…</p>';
        adminStreamingDraft = Object.assign({}, STREAMING_DEFAULTS);
        try {
          const snap = await window.fs.getDoc(window.fs.doc(window.db, 'admin_config', 'streaming'));
          if (snap.exists()) Object.assign(adminStreamingDraft, snap.data());
        } catch (e) { console.warn('讀取直播設定失敗:', e); }
      }
      const d = adminStreamingDraft;
      const num = (key, label, unit, min, max) => `
        <label style="display:flex; align-items:center; gap:6px; font-size:13px; color:#555;">${label}
          <input class="admin-input-sm" type="number" min="${min}" max="${max}" step="1" style="width:72px;" value="${d[key]}" oninput="window.adminUpdateStreamingDraft('${key}', this.value)"> ${unit}
        </label>`;
      const quality = (key, label) => `
        <label style="display:flex; align-items:center; gap:6px; font-size:13px; color:#555;">${label}
          <select class="admin-input-sm" style="width:auto;" onchange="window.adminUpdateStreamingDraft('${key}', this.value)">
            ${['360p', '480p', '720p'].map(q => `<option value="${q}" ${d[key] === q ? 'selected' : ''}>${q}</option>`).join('')}
          </select>
        </label>`;
      container.innerHTML = `
        <div class="admin-card">
          <h3 style="font-size:16px; font-weight:bold; color:var(--brand-800); margin-bottom:10px;">Study with me 直播</h3>
          <label style="display:flex; align-items:center; gap:8px; font-size:14px; margin-bottom:6px; cursor:pointer;">
            <input type="checkbox" ${d.enabled ? 'checked' : ''} onchange="window.adminUpdateStreamingDraft('enabled', this.checked)"> 開放直播功能（總開關）
          </label>
          <p style="font-size:13px; color:#888; margin:0; line-height:1.7;">關閉時，功能表的「Study with me」會顯示為灰色，用戶不能點擊，只有管理員可以開播及觀看（供測試之用）；開啟後，所有登入用戶可以觀看，累積溫習日數達標的用戶可以開播。管理員不受開通日數限制。<br>功能表是否顯示「Study with me」，請到「網站內容」→「功能表及圖示」設定。</p>
        </div>
        <div class="admin-card" style="margin-top:12px;">
          <h3 style="font-size:14px; font-weight:bold; margin-bottom:10px;">開通資格</h3>
          <div style="display:flex; gap:16px; flex-wrap:wrap;">
            ${num('requiredDays', '需累積溫習', '日', 0, 365)}
            ${num('minMinutesPerDay', '每日最少溫習', '分鐘才計一日', 1, 600)}
            ${num('minStreamAge', '最低開播年齡', '歲', 0, 99)}
          </div>
          <p style="font-size:13px; color:#888; margin:8px 0 0;">由伺服器記錄，用戶無法自行修改。首次記錄時會按溫習日曆補回過往日數。<br>年齡按用戶註冊時填寫的出生年月計算（註冊後用戶不能自行修改）；沒有出生年月的帳戶當作未達年齡，可在「日常營運」→「用戶管理」搜尋該用戶代為補填。觀看直播不受年齡限制。設為 0 即不設年齡限制。</p>
        </div>
        <div class="admin-card" style="margin-top:12px;">
          <h3 style="font-size:14px; font-weight:bold; margin-bottom:10px;">直播限制及畫質</h3>
          <div style="display:flex; gap:16px; flex-wrap:wrap;">
            ${num('maxDurationHours', '每次直播最長', '小時', 1, 12)}
            ${num('maxConcurrent', '同一時間最多', '個直播', 1, 500)}
            ${quality('defaultQuality', '一般直播最高畫質')}
            ${quality('hotQuality', '熱門直播最高畫質')}
          </div>
        </div>
        <div class="admin-card" style="margin-top:12px;">
          <h3 style="font-size:14px; font-weight:bold; margin-bottom:10px;">熱門直播（轉經 R2）</h3>
          <div style="display:flex; gap:16px; flex-wrap:wrap;">
            ${num('hotThreshold', '觀眾超過', '人', 5, 10000)}
            ${num('hotMinutes', '並持續', '分鐘', 1, 60)}
            ${num('idleShutdownMinutes', '沒有熱門直播', '分鐘後關閉轉換主機', 5, 240)}
          </div>
          <p style="font-size:13px; color:#888; margin:8px 0 0;">直播一經轉經 R2，會維持至直播完結，避免人數在門檻附近上落時不斷切換。</p>
        </div>
        <div class="admin-card" style="margin-top:12px;">
          <h3 style="font-size:14px; font-weight:bold; margin-bottom:10px;">每月預算</h3>
          <div style="display:flex; gap:16px; flex-wrap:wrap;">
            ${num('monthlyBudgetHkd', '每月上限 HK$', '（包括主機月費）', 0, 1000000)}
          </div>
          <p style="font-size:13px; color:#888; margin:8px 0 0;">用到 80%：所有直播最高畫質降至 360p 並通知管理員；用到 100%：暫停開新直播，進行中的直播可繼續。（預算自動控制將於日後版本啟用）</p>
        </div>
        <div class="admin-card" style="margin-top:12px;">
          <h3 style="font-size:14px; font-weight:bold; margin-bottom:8px;">留言額外過濾字詞</h3>
          <textarea class="admin-input-sm" rows="4" style="width:100%; font-size:13px;" placeholder="每行一個字詞" oninput="window.adminUpdateStreamingDraft('bannedWordsText', this.value)">${escapeHtml((d.bannedWords || []).join('\n'))}</textarea>
          <p style="font-size:13px; color:#888; margin:8px 0 0;">系統已內置常見粗口（中文、粵語、英文）及聯絡資料（電話、網址、IG、WhatsApp 等）過濾；這裏可以額外加入字詞，留言中出現會被遮蓋。</p>
        </div>
        <div style="text-align:center; margin-top:16px;">
          <button type="button" class="btn btn-primary" style="padding:12px 32px; font-size:15px;" onclick="window.adminSaveStreamingSettings()">儲存直播設定</button>
        </div>`;
    }
    window.adminUpdateStreamingDraft = function(key, value) {
      if (!adminStreamingDraft) return;
      if (key === 'enabled') adminStreamingDraft.enabled = !!value;
      else if (key === 'defaultQuality' || key === 'hotQuality') adminStreamingDraft[key] = value;
      else if (key === 'bannedWordsText') adminStreamingDraft.bannedWords = String(value || '').split('\n').map(w => w.trim()).filter(Boolean).slice(0, 500);
      else { const n = parseInt(value, 10); if (Number.isFinite(n) && n >= 0) adminStreamingDraft[key] = n; }
    };
    window.adminSaveStreamingSettings = async function() {
      if (!adminStreamingDraft) return;
      const d = adminStreamingDraft;
      const clamp = (v, lo, hi, def) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
      const q = (v, def) => ['360p', '480p', '720p'].includes(v) ? v : def;
      const payload = {
        enabled: d.enabled === true,
        requiredDays: clamp(d.requiredDays, 0, 365, 30),
        minMinutesPerDay: clamp(d.minMinutesPerDay, 1, 600, 15),
        minStreamAge: clamp(d.minStreamAge, 0, 99, 16),
        maxDurationHours: clamp(d.maxDurationHours, 1, 12, 4),
        maxConcurrent: clamp(d.maxConcurrent, 1, 500, 20),
        monthlyBudgetHkd: clamp(d.monthlyBudgetHkd, 0, 1000000, 500),
        hotThreshold: clamp(d.hotThreshold, 5, 10000, 50),
        hotMinutes: clamp(d.hotMinutes, 1, 60, 3),
        idleShutdownMinutes: clamp(d.idleShutdownMinutes, 5, 240, 30),
        defaultQuality: q(d.defaultQuality, '480p'),
        hotQuality: q(d.hotQuality, '720p'),
        bannedWords: Array.isArray(d.bannedWords) ? d.bannedWords.map(w => String(w).trim().slice(0, 40)).filter(Boolean).slice(0, 500) : [],
        updatedAt: Date.now()
      };
      try {
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'streaming'), payload);
        Object.assign(adminStreamingDraft, payload);
        await logAdminAction('修改直播設定', payload);
        window.showToast('已儲存直播設定（伺服器最多需要 30 秒套用）', '✅');
      } catch (err) {
        window.showToast('儲存失敗：' + (err.message || err), '❌');
      }
    };

    window.adminResetStrikes = async function(uid) {
      if (!(await window.appConfirm('確定將這個帳戶的違規次數重設為 0？'))) return;
      try {
        await window.callCloudFunction('moderateUser', { uid, action: 'resetStrikes' });
        window.showToast('已重設違規次數', '✅');
      } catch (err) {
        window.showToast('操作失敗：' + (window.friendlyErrorText ? window.friendlyErrorText(err) : (err.message || err)), '❌');
      }
    };
    // 用戶列表顯示的停權標籤
    function suspensionLabelHtml(u) {
      const parts = [];
      if (u.suspended === true) parts.push('已永久停權');
      else if (typeof u.suspendedUntil === 'number' && u.suspendedUntil > Date.now()) parts.push('停權至 ' + new Date(u.suspendedUntil).toLocaleString('zh-HK', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }));
      if (typeof u.strikeCount === 'number' && u.strikeCount > 0) parts.push('違規 ' + u.strikeCount + ' 次');
      return parts.length ? ` <span style="color:#c0392b; font-size:13px;">（${parts.join('，')}）</span>` : '';
    }

    // ===================== 舉報處理（Admin） =====================
    // 呢個 badge listener 一入管理後台就開始聽（唔理而家揀緊邊個分頁），
    // 淨係計緊 pending 嘅舉報數量，用嚟喺分頁按鈕度提示有未處理嘅舉報。
    window.startAdminReportsBadgeListener = function() {
      if (!window.db || !window.fs) return;
      if (adminReportsBadgeUnsubscribe) return; // 已經聽緊，唔使再聽多次
      try {
        const q = window.fs.query(
          window.fs.collection(window.db, 'reports'),
          window.fs.where('status', '==', 'pending')
        );
        adminReportsBadgeUnsubscribe = window.fs.onSnapshot(q, (snapshot) => {
          const badge = document.getElementById('admin-reports-badge');
          if (!badge) return;
          const count = snapshot.size;
          badge.innerText = String(count);
          badge.style.display = count > 0 ? 'inline-block' : 'none';
        }, (err) => {
          console.error('監聽舉報數量失敗：', err);
        });
      } catch (e) {
        console.error('啟動舉報 badge listener 失敗：', e);
      }
    };

    // 效能優化：以前呢個 tab 係冇上限咁監聽成個 reports collection——舉報
    // 隨時間累積得越多（連埋每則入面嗰張截圖），管理員每次打開呢頁都要
    // 一次過下載晒由第一日到而家全部舉報，會越用越重。而家改成分頁：
    // 淨係即時監聽最新嗰 ADMIN_REPORTS_PAGE_SIZE 則（保持「有新舉報即刻
    // 見到」呢個實時性），舊嘅要撳「載入更多」先一次性攞（唔會再持續
    // 監聽,單純減少負擔)。因為排序用嘅 createdAt 一經寫入就唔會再變，
    // 新舉報插入唔會影響已經攞落嚟嗰批舊資料嘅分頁邊界，所以呢種「頭
    // 一頁即時、之後嘅頁靜態」嘅做法唔會有資料錯亂嘅問題。
    const ADMIN_REPORTS_PAGE_SIZE = 30;
    let adminReportsLoadedDocs = [];
    let adminReportsAllLoaded = false;

    function buildAdminReportCardHtml(docSnap) {
      const r = docSnap.data();
      const reportId = docSnap.id;
      const status = r.status || 'pending';
      const statusLabel = status === 'pending' ? '待處理' : (status === 'dismissed' ? '已駁回' : '已處理');
      const statusColor = status === 'pending' ? '#C0524A' : '#999';
      const when = r.createdAt ? new Date(r.createdAt).toLocaleString('zh-HK') : '—';
      const screenshotHtml = r.screenshot
        ? `<img src="${r.screenshot}" style="width:100%; max-width:280px; border-radius:8px; border:1px solid #ddd; margin-top:6px; display:block; cursor:pointer;" onclick="window.open(this.src, '_blank')">`
        : `<p style="font-size:13px; color:#c99; margin-top:6px;">當時無法取得截圖</p>`;
      return `
        <div class="admin-card" style="${status !== 'pending' ? 'opacity:.6;' : ''}">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
            <span style="font-weight:700; color:${statusColor}; font-size:13px;">${statusLabel}</span>
            <span style="font-size:13px; color:#999;">${escapeHtml(when)}</span>
          </div>
          <p style="font-size:13px; margin-bottom:3px;"><b>被舉報：</b>${escapeHtml(r.reportedName || '—')} ${r.reportedLoginId ? '（' + escapeHtml(r.reportedLoginId) + '）' : ''}</p>
          <p style="font-size:13px; color:#888; margin-bottom:3px;">${r.reportedEmail ? escapeHtml(r.reportedEmail) : ''}</p>
          <p style="font-size:13px; margin-bottom:3px;"><b>舉報人：</b>${escapeHtml(r.reporterName || '—')} ${r.reporterLoginId ? '（' + escapeHtml(r.reporterLoginId) + '）' : ''}</p>
          <p style="font-size:13px; margin-bottom:3px;"><b>房間：</b>${escapeHtml(r.roomName || r.roomId || '—')}</p>
          <p style="font-size:13px; margin-bottom:3px;"><b>原因：</b>${escapeHtml(r.reason || '—')}</p>
          ${r.notes ? `<p style="font-size:13px; color:#666; background:#F7F5F2; border-radius:6px; padding:6px 8px; margin-bottom:3px;">${escapeHtml(r.notes)}</p>` : ''}
          ${screenshotHtml}
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px;">
            ${status === 'pending' ? `<button class="btn btn-outline" style="font-size:13px; padding:4px 9px;" onclick="window.adminMarkReportStatus('${reportId}', 'dismissed')">駁回（沒問題）</button>` : ''}
            ${status === 'pending' ? `<button class="btn btn-outline" style="font-size:13px; padding:4px 9px;" onclick="window.adminMarkReportStatus('${reportId}', 'reviewed')">標記已處理</button>` : ''}
            ${r.reportedUid && status === 'pending' ? `<button class="btn btn-red" style="font-size:13px; padding:4px 9px;" onclick="window.adminStrikeFromReport('${reportId}', '${r.reportedUid}', false)">確認違規並停權</button>` : ''}
            ${r.reportedUid && status === 'pending' ? `<button class="btn btn-red" style="font-size:13px; padding:4px 9px;" onclick="window.adminStrikeFromReport('${reportId}', '${r.reportedUid}', true)">嚴重違規（永久封號）</button>` : ''}
            ${r.action ? `<span style="font-size:13px; color:#888; align-self:center;">處理：${r.action === 'permanent' ? '永久封號' : (r.action === 'strike' ? '已按次數停權' : escapeHtml(r.action))}${r.handledBy ? '（' + escapeHtml(r.handledBy) + '）' : ''}</span>` : ''}
            ${status !== 'pending' ? `<button class="btn btn-outline" style="font-size:13px; padding:4px 9px; color:#999; border-color:#ccc;" onclick="window.adminDeleteReport('${reportId}')">刪除紀錄</button>` : ''}
          </div>
        </div>
      `;
    }

    function renderAdminReportsListUI() {
      const container = document.getElementById('admin-tab-reports');
      if (!container) return;
      if (adminReportsLoadedDocs.length === 0) {
        container.innerHTML = moderationSettingsHtml() + '<div class="admin-card" style="text-align:center; color:#999;">目前沒有任何舉報記錄</div>';
        return;
      }
      const cards = adminReportsLoadedDocs.map(buildAdminReportCardHtml).join('');
      const loadMoreHtml = adminReportsAllLoaded
        ? ''
        : `<div style="text-align:center; margin-top:12px;">
             <button class="btn btn-outline" id="admin-reports-load-more-btn" type="button" onclick="window.adminLoadMoreReports()">載入更多（已顯示 ${adminReportsLoadedDocs.length} 則）</button>
           </div>`;
      container.innerHTML = `
        ${moderationSettingsHtml()}
        ${cards}
        ${loadMoreHtml}
      `;
    }

    function renderAdminReportsTab() {
      const container = document.getElementById('admin-tab-reports');
      if (!container || !window.db || !window.fs) return;
      container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">正在載入舉報記錄…</p>';
      loadModerationRules().then(() => { if (adminReportsLoadedDocs.length || adminReportsAllLoaded) renderAdminReportsListUI(); });

      adminReportsLoadedDocs = [];
      adminReportsAllLoaded = false;

      if (adminReportsUnsubscribe) adminReportsUnsubscribe();
      const q = window.fs.query(
        window.fs.collection(window.db, 'reports'),
        window.fs.orderBy('createdAt', 'desc'),
        window.fs.limit(ADMIN_REPORTS_PAGE_SIZE)
      );
      adminReportsUnsubscribe = window.fs.onSnapshot(q, (snapshot) => {
        adminReportsLoadedDocs = snapshot.docs;
        // 頭一頁攞返嘅數量少過成頁上限，即係話成個 collection 都已經
        // 攞晒，冇需要再顯示「載入更多」
        if (snapshot.docs.length < ADMIN_REPORTS_PAGE_SIZE) adminReportsAllLoaded = true;
        renderAdminReportsListUI();
      }, (err) => {
        container.innerHTML = `<div class="admin-card" style="color:#c0392b;">載入失敗：${err.message || err}</div>`;
      });
    }
    window.renderAdminReportsTab = renderAdminReportsTab;

    // 「載入更多」淨係一次性攞多一頁（唔會幫呢一頁另外加監聽），揭完之後
    // 就靜態咁擺喺度——舊舉報基本上唔會再變動，唔使成日即時監聽住佢哋
    window.adminLoadMoreReports = async function() {
      if (!window.db || !window.fs || adminReportsAllLoaded) return;
      const lastDoc = adminReportsLoadedDocs[adminReportsLoadedDocs.length - 1];
      if (!lastDoc) return;
      const btn = document.getElementById('admin-reports-load-more-btn');
      if (btn) { btn.disabled = true; btn.innerText = '載入中...'; }
      try {
        const q = window.fs.query(
          window.fs.collection(window.db, 'reports'),
          window.fs.orderBy('createdAt', 'desc'),
          window.fs.startAfter(lastDoc),
          window.fs.limit(ADMIN_REPORTS_PAGE_SIZE)
        );
        const snapshot = await window.fs.getDocs(q);
        if (snapshot.docs.length < ADMIN_REPORTS_PAGE_SIZE) adminReportsAllLoaded = true;
        adminReportsLoadedDocs = adminReportsLoadedDocs.concat(snapshot.docs);
        renderAdminReportsListUI();
      } catch (e) {
        window.showToast('載入更多舉報失敗：' + (e.message || e), '❌');
        if (btn) { btn.disabled = false; btn.innerText = '載入更多'; }
      }
    };

    window.adminMarkReportStatus = async function(reportId, status) {
      try {
        await window.fs.updateDoc(window.fs.doc(window.db, 'reports', reportId), { status });
        window.showToast(status === 'dismissed' ? '已駁回舉報' : '已標記為已處理', '✅');
      } catch (err) {
        window.showToast('更新失敗：' + (err.message || err), '❌');
      }
    };

    // v1.225.0：確認違規，由伺服器按違規次數停權（第 1 次、第 2 次按設定日數，第 3 次或嚴重違規永久封號）
    window.adminStrikeFromReport = async function(reportId, reportedUid, severe) {
      const m = window.MODERATION_RULES || { firstDays: 3, secondDays: 14 };
      const msg = severe
        ? '確定屬於嚴重違規？該帳戶會被永久封號，並無法再登入。'
        : `確定違規屬實？系統會按違規次數處理：第 1 次停權 ${m.firstDays} 日、第 2 次停權 ${m.secondDays} 日、第 3 次永久封號。`;
      if (!(await window.appConfirm(msg))) return;
      const doc = adminReportsLoadedDocs.find(x => x.id === reportId);
      const reason = doc && doc.data().reason ? doc.data().reason : '違反使用守則';
      try {
        const res = await window.callCloudFunction('moderateUser', { uid: reportedUid, action: severe ? 'permanent' : 'strike', reportId, reason });
        if (res && res.permanent) window.showToast(`已永久封號（累計違規 ${res.strikeCount} 次）`, '🚫');
        else window.showToast(`已停權 ${res.days} 日（第 ${res.strikeCount} 次違規）`, '🚫');
      } catch (err) {
        window.showToast('操作失敗：' + (window.friendlyErrorText ? window.friendlyErrorText(err) : (err.message || err)), '❌');
      }
    };

    // 停權規則設定（admin_config/moderation），只有超級管理員可修改
    window.MODERATION_RULES = { firstDays: 3, secondDays: 14 };
    async function loadModerationRules() {
      try {
        const snap = await window.fs.getDoc(window.fs.doc(window.db, 'admin_config', 'moderation'));
        if (snap.exists()) {
          const d = snap.data();
          if (typeof d.firstDays === 'number') window.MODERATION_RULES.firstDays = d.firstDays;
          if (typeof d.secondDays === 'number') window.MODERATION_RULES.secondDays = d.secondDays;
        }
      } catch (e) { console.warn('讀取停權設定失敗:', e); }
    }
    function moderationSettingsHtml() {
      const m = window.MODERATION_RULES;
      const canEdit = isCurrentUserSuperAdmin();
      return `
        <div class="admin-card" style="margin-bottom:12px;">
          <h3 style="font-size:14px; font-weight:bold; margin-bottom:8px;">停權規則</h3>
          <div style="display:flex; gap:16px; flex-wrap:wrap; align-items:center; font-size:13px; color:#555; margin-bottom:8px;">
            <label style="display:flex; align-items:center; gap:6px;">第 1 次違規停權
              <input class="admin-input-sm" type="number" min="1" max="365" step="1" style="width:64px;" id="admin-mod-first" value="${m.firstDays}" ${canEdit ? '' : 'disabled'}> 日
            </label>
            <label style="display:flex; align-items:center; gap:6px;">第 2 次違規停權
              <input class="admin-input-sm" type="number" min="1" max="365" step="1" style="width:64px;" id="admin-mod-second" value="${m.secondDays}" ${canEdit ? '' : 'disabled'}> 日
            </label>
            ${canEdit ? '<button class="btn btn-primary" style="font-size:13px; padding:4px 10px;" onclick="window.adminSaveModerationRules()">儲存</button>' : ''}
          </div>
          <p style="font-size:13px; color:#888; margin:0;">第 3 次違規或嚴重違規（例如性騷擾、向未成年人提出不當要求、威脅）會永久封號，並停用登入帳戶。只有經管理員確認的舉報才會計入違規次數；停權期間用戶無法登入，到期自動解除。</p>
        </div>`;
    }
    window.adminSaveModerationRules = async function() {
      const first = Math.max(1, Math.min(365, parseInt(document.getElementById('admin-mod-first').value, 10) || 3));
      const second = Math.max(1, Math.min(365, parseInt(document.getElementById('admin-mod-second').value, 10) || 14));
      try {
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'moderation'), { firstDays: first, secondDays: second, updatedAt: Date.now() });
        window.MODERATION_RULES = { firstDays: first, secondDays: second };
        await logAdminAction('修改停權規則', { firstDays: first, secondDays: second });
        window.showToast('已儲存停權規則', '✅');
      } catch (err) {
        window.showToast('儲存失敗：' + (err.message || err), '❌');
      }
    };

    // 淨係已經處理完（已駁回／已處理）嘅舉報先俾刪，pending 嘅唔會出呢粒掣，
    // 避免管理員手快手滑刪走仲未跟進嘅證據
    window.adminDeleteReport = async function(reportId) {
      if (!(await window.appConfirm('確定刪除這一則已處理的舉報紀錄？連同截圖一併刪除，刪除後將無法復原。'))) return;
      try {
        await window.fs.deleteDoc(window.fs.doc(window.db, 'reports', reportId));
        window.showToast('已刪除舉報紀錄', '🗑️');
      } catch (err) {
        window.showToast('刪除失敗：' + (err.message || err), '❌');
      }
    };

    // ---------- 側邊功能表圖示管理 ----------
    // 側邊欄「主頁／視訊溫習室／疑難解答區」等分頁掣，原本淨係
    // 寫死一個 emoji 做圖示。而家改為由 Firestore（admin_config/navIcons
    // 文件）讀取，管理員可以喺呢個分頁上傳自訂圖片取代個 emoji，冇上傳
    // 過（或者撳咗「還原做預設圖示」）嘅掣就繼續顯示返原本嘅 emoji。
    // 做法完全仿照上面「扭蛋機外觀圖片」嗰個 pattern：圖片本身上傳去
    // Firebase Storage（nav_icons/ 路徑），Firestore 淨係存返個下載連結。
    //
    // 呢個清單而家唔淨係側邊欄用：'roomLock' 呢個 key 對應嘅係視訊溫習室
    // 工具列入面嗰粒「🔒 查看房間密碼」掣（見 index.html 嘅
    // #nav-icon-roomLock），並唔喺側邊欄度。因為 applyNavIconsToSidebar()
    // 純粹用 `#nav-icon-{key}` 呢個 id pattern 去搵元素套用圖示／emoji，
    // 唔理個元素實際擺喺頁面邊度，所以直接加落嚟呢個清單就會自動生效，
    // 唔使額外寫套邏輯——文件名 admin_config/navIcons 因為歷史原因冇改
    // 名，但已經涵蓋所有「可自訂圖示」，唔止側邊欄。
    const NAV_ICON_ITEMS = [
      // v1.210.0：預設圖示改為線條 SVG（見 index.html 嘅 window.cmNavSvg），唔再用 emoji
      { key: 'home', label: '主頁' },
      { key: 'room', label: '視訊溫習室' },
      { key: 'qa', label: '疑難解答區' },
      { key: 'vip', label: '教材中心' },
      { key: 'store', label: '時數扭蛋機' },
      { key: 'leaderboard', label: '溫習排行榜' },
      { key: 'social', label: '書伴廣場' },
      { key: 'diary', label: '溫習日記' },
      { key: 'verification', label: '學生身份驗證' },
      { key: 'tutorMaterials', label: '管理教材（導師）' },
      { key: 'roomLock', label: '房間密碼鎖（房內查看密碼按鈕）' }
    ];

    // 全站共用嘅「目前生效緊嘅圖示連結」——冇自訂圖嘅 key 就唔會出現喺
    // 呢個物件入面，UI 判斷「有冇自訂圖」淨係睇呢度有冇嗰個 key。
    window.NAV_ICON_URLS = window.NAV_ICON_URLS || {};

    // 將 window.NAV_ICON_URLS 目前嘅內容，實際反映去側邊欄嘅 8 個
    // <span class="nav-icon" id="nav-icon-{key}"> 度——有自訂圖就換做
    // <img>，冇就還原返做原本嘅 emoji 文字。
    function applyNavIconsToSidebar() {
      NAV_ICON_ITEMS.forEach(item => {
        const el = document.getElementById('nav-icon-' + item.key);
        if (!el) return; // 未登入（側邊欄未 render）嗰陣搵唔到係正常
        const url = window.NAV_ICON_URLS[item.key];
        el.innerHTML = url
          ? `<img src="${url}" alt="${escapeHtml(item.label)}">`
          : (typeof window.cmNavSvg === 'function' ? window.cmNavSvg(item.key) : '');
      });
    }
    window.applyNavIconsToSidebar = applyNavIconsToSidebar;

    let adminNavIconsDraft = null;
    let navIconsConfigLoaded = false;

    function renderAdminNavIconsTab() {
      const container = document.getElementById('admin-tab-icons');
      if (!container) return;

      if (!adminNavIconsDraft) {
        if (!navIconsConfigLoaded) {
          container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">載入中圖示設定...</p>';
          return; // Firestore 資料一到，loadNavIconsFromFirestore() 會自動再 render 多次
        }
        adminNavIconsDraft = Object.assign({}, window.NAV_ICON_URLS);
      }

      const rows = NAV_ICON_ITEMS.map(item => {
        const url = adminNavIconsDraft[item.key];
        const thumbId = `admin-navicon-thumb-${item.key}`;
        const inputId = `admin-navicon-input-${item.key}`;
        const thumbInner = url
          ? `<img src="${url}" style="width:100%; height:100%; object-fit:contain;">`
          : `<span style="color:var(--brand-600); display:inline-flex;">${typeof window.cmNavSvg === 'function' ? window.cmNavSvg(item.key) : ''}</span>`;
        return `
          <div style="display:flex; align-items:center; gap:14px; padding:10px 0; border-bottom:1px solid #F0F0F0;">
            <div id="${thumbId}" onclick="document.getElementById('${inputId}').click()" title="點擊這裡上傳圖片" style="width:52px; height:52px; border-radius:10px; background:#F6F7FB; border:1px dashed #D2D9E9; display:flex; align-items:center; justify-content:center; cursor:pointer; overflow:hidden; flex-shrink:0;">${thumbInner}</div>
            <input type="file" accept="image/*" id="${inputId}" style="display:none;" onchange="adminUploadNavIcon('${item.key}',this)">
            <div style="flex:1; font-size:14px; font-weight:600; color:#333;">${escapeHtml(item.label)}</div>
            <div style="display:flex; gap:6px;">
              <button type="button" class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="document.getElementById('${inputId}').click()">上傳圖片</button>
              ${url ? `<button type="button" class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="adminRemoveNavIcon('${item.key}')">還原做預設圖示</button>` : ''}
            </div>
          </div>
        `;
      }).join('');

      container.innerHTML = `
        <div class="admin-card">
          <h3 style="font-size:15px; font-weight:bold; color:var(--brand-800); margin-bottom:6px;">側邊欄功能圖示</h3>
          <p style="font-size:13px; color:#888; margin-bottom:6px;">將側邊欄「主頁、視訊溫習室」等 8 個分頁按鈕原本的 emoji 圖示，換成自訂上傳的圖片。上傳新圖會即時取代畫面上顯示的圖示，未上傳過的項目則繼續使用預設 emoji。</p>
          ${rows}
          <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:14px;">
            <button class="btn btn-outline" type="button" onclick="adminResetNavIconsDraft()">還原未儲存的改動</button>
            <button class="btn btn-primary" type="button" onclick="adminSaveNavIconsConfig()">儲存全部改動</button>
          </div>
        </div>
      `;
    }
    window.renderAdminNavIconsTab = renderAdminNavIconsTab;

    window.adminUploadNavIcon = async function(key, inputEl) {
      if (!adminNavIconsDraft) return;
      const file = inputEl.files && inputEl.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        window.showToast('請選擇圖片檔案', '⚠️');
        return;
      }
      if (!window.storage || !window.storageApi) {
        window.showToast('Storage 未初始化，請重新整理頁面再試', '⚠️');
        return;
      }
      const oldUrl = adminNavIconsDraft[key];
      window.showToast('上傳中圖片…', '📤');
      try {
        const { blob, mimeType } = await compressImageFileToBlob(file, 128, 0.85);
        const ext = mimeType === 'image/png' ? 'png' : 'jpg';
        const path = `nav_icons/${key}_${Date.now()}.${ext}`;
        const fileRef = window.storageApi.ref(window.storage, path);
        await window.storageApi.uploadBytes(fileRef, blob, { contentType: mimeType });
        const downloadUrl = await window.storageApi.getDownloadURL(fileRef);
        adminNavIconsDraft[key] = downloadUrl;
        renderAdminNavIconsTab();
        window.showToast('圖片上傳成功，請點擊「儲存全部改動」才會正式生效', '🎉');
        tryDeleteOldGachaStoragePhoto(oldUrl); // best-effort，唔使等佢完成（呢個函式其實通用，唔止扭蛋貼紙先用得）
      } catch (err) {
        window.showToast('圖片上傳失敗：' + (err.message || err), '❌');
      }
    };

    window.adminRemoveNavIcon = function(key) {
      if (!adminNavIconsDraft) return;
      const oldUrl = adminNavIconsDraft[key];
      tryDeleteOldGachaStoragePhoto(oldUrl); // best-effort
      delete adminNavIconsDraft[key];
      renderAdminNavIconsTab();
    };

    window.adminResetNavIconsDraft = function() {
      adminNavIconsDraft = null;
      renderAdminNavIconsTab();
    };

    window.adminSaveNavIconsConfig = async function() {
      if (!adminNavIconsDraft) return;
      try {
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'navIcons'), adminNavIconsDraft);
        window.showToast('圖示設定已儲存，全站即時生效', '🎉');
      } catch (err) {
        window.showToast('儲存失敗：' + (err.message || err), '❌');
      }
    };

    let navIconsUnsubscribe = null;
    function loadNavIconsFromFirestore() {
      if (!window.db || !window.fs) return;
      if (navIconsUnsubscribe) navIconsUnsubscribe();
      const ref = window.fs.doc(window.db, 'admin_config', 'navIcons');
      navIconsUnsubscribe = window.fs.onSnapshot(ref, (snap) => {
        window.NAV_ICON_URLS = {};
        if (snap.exists()) {
          const data = snap.data();
          NAV_ICON_ITEMS.forEach(item => {
            if (typeof data[item.key] === 'string' && data[item.key]) {
              window.NAV_ICON_URLS[item.key] = data[item.key];
            }
          });
        }
        navIconsConfigLoaded = true;
        applyNavIconsToSidebar();
        // 如果管理員岩岩好打開緊「功能圖示」呢個分頁、又仲未開始編輯，
        // 而家攞到資料喇，即刻幫佢重新 render 一次，唔使自己撳一撳個分頁
        if (adminTabShowing('icons') && !adminNavIconsDraft) {
          const adminPanelEl = document.getElementById('admin-panel-container');
          if (adminPanelEl && adminPanelEl.style.display !== 'none') {
            renderAdminNavIconsTab();
          }
        }
      }, (err) => {
        console.error('讀取側邊欄圖示設定失敗:', err);
        navIconsConfigLoaded = true; // 唔好卡死喺「載入中...」畫面
      });
    }
    window.loadNavIconsFromFirestore = loadNavIconsFromFirestore;

    // ===================== 🎓 導師申請審批（Phase A：導師 PDF 筆記商店） =====================
    // 呢個分頁分兩部分：(1) 導師申請（含待審批／歷史記錄），(2) 已批准
    // 嘅導師名單（可以喺度停權／解除停權）。審批動作全部經 Cloud
    // Functions（見 functions/index.js 嘅 approveTutorApplication／
    // rejectTutorApplication／suspendTutor／reinstateTutor），呢度純粹
    // 負責顯示同觸發呼叫，唔會直接寫 Firestore（tutorApplications／
    // tutors 兩個 collection 嘅前端寫入權限喺 firestore.rules 已經鎖死）。
    let adminTutorsBadgeUnsubscribe = null;
    let adminTutorAppsUnsubscribe = null;
    let adminTutorsListUnsubscribe = null;
    let adminTutorApps = [];
    let adminTutorsList = [];

    // 「🎓 導師申請」個紅點徽章同「🚩 舉報處理」個做法一樣，唔理管理員
    // 而家揀緊邊個分頁都要見到，一入管理後台就開始聽
    window.startAdminTutorsBadgeListener = function() {
      if (!window.db || !window.fs) return;
      if (adminTutorsBadgeUnsubscribe) return;
      try {
        const q = window.fs.query(
          window.fs.collection(window.db, 'tutorApplications'),
          window.fs.where('status', '==', 'pending')
        );
        adminTutorsBadgeUnsubscribe = window.fs.onSnapshot(q, (snapshot) => {
          const badge = document.getElementById('admin-tutors-badge');
          if (!badge) return;
          const count = snapshot.size;
          badge.innerText = String(count);
          badge.style.display = count > 0 ? 'inline-block' : 'none';
        }, (err) => {
          console.error('監聽導師申請數量失敗：', err);
        });
      } catch (e) {
        console.error('啟動導師申請 badge listener 失敗：', e);
      }
    };

    function buildAdminTutorAppCardHtml(docSnap) {
      const a = docSnap.data();
      const uid = docSnap.id;
      const status = a.status || 'pending';
      const statusLabel = status === 'pending' ? '待審批' : (status === 'approved' ? '已批准' : '已駁回');
      const statusColor = status === 'pending' ? '#C0524A' : (status === 'approved' ? '#2F6B3A' : '#999');
      const when = a.submittedAt ? new Date(a.submittedAt).toLocaleString('zh-HK') : '—';
      const subjectsHtml = (a.subjectsIntended || [])
        .map(s => `<span class="tag" style="background:#F6F7FB; color:#29395C; margin-right:4px;">${escapeHtml(s)}</span>`)
        .join('');
      return `
        <div class="admin-card" style="${status !== 'pending' ? 'opacity:.65;' : ''}">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
            <span style="font-weight:700; color:${statusColor}; font-size:13px;">${statusLabel}</span>
            <span style="font-size:13px; color:#999;">${escapeHtml(when)}</span>
          </div>
          <p style="font-size:13px; margin-bottom:3px;"><b>顯示名稱：</b>${escapeHtml(a.displayName || '—')}</p>
          <p style="font-size:13px; color:#666; margin-bottom:3px;">${escapeHtml(a.bio || '（未填寫自我介紹）')}</p>
          <p style="font-size:13px; margin-bottom:3px;">${subjectsHtml || '（未填寫科目）'}</p>
          <p style="font-size:13px; color:#888; margin-bottom:3px;"><b>聯絡方式：</b>${escapeHtml(a.contactInfo || '—')}</p>
          <p style="font-size:12px; color:#aaa; margin-bottom:3px;">${escapeHtml(uid)}</p>
          ${status === 'rejected' && a.rejectionReason ? `<p style="font-size:13px; color:#8a2f2f; background:#FBEAEA; border-radius:6px; padding:6px 8px; margin-bottom:3px;">駁回原因：${escapeHtml(a.rejectionReason)}</p>` : ''}
          ${status === 'pending' ? `
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px;">
              <button class="btn btn-primary" style="font-size:13px; padding:4px 9px;" onclick="window.adminApproveTutorApp('${uid}')">批准</button>
              <button class="btn btn-outline" style="font-size:13px; padding:4px 9px;" onclick="window.adminRejectTutorApp('${uid}')">駁回</button>
            </div>
          ` : ''}
        </div>
      `;
    }

    function buildAdminTutorCardHtml(docSnap) {
      const t = docSnap.data();
      const uid = docSnap.id;
      const status = t.status || 'active';
      const statusLabel = status === 'active' ? '正常' : '已停權';
      const statusColor = status === 'active' ? '#2F6B3A' : '#C0524A';
      const subjectsHtml = (t.subjectsIntended || [])
        .map(s => `<span class="tag" style="background:#F6F7FB; color:#29395C; margin-right:4px;">${escapeHtml(s)}</span>`)
        .join('');
      return `
        <div class="admin-card">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
            <span style="font-weight:700; color:${statusColor}; font-size:13px;">${statusLabel}</span>
            <span style="font-size:12px; color:#aaa;">${escapeHtml(uid)}</span>
          </div>
          <p style="font-size:13px; margin-bottom:3px;"><b>${escapeHtml(t.displayName || '—')}</b></p>
          <p style="font-size:13px; color:#666; margin-bottom:3px;">${escapeHtml(t.bio || '')}</p>
          <p style="font-size:13px; margin-bottom:3px;">${subjectsHtml}</p>
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px;">
            ${status === 'active'
              ? `<button class="btn btn-red" style="font-size:13px; padding:4px 9px;" onclick="window.adminSuspendTutor('${uid}')">停權</button>`
              : `<button class="btn btn-outline" style="font-size:13px; padding:4px 9px;" onclick="window.adminReinstateTutor('${uid}')">解除停權</button>`}
          </div>
        </div>
      `;
    }

    function renderAdminTutorsListUI() {
      const container = document.getElementById('admin-tab-tutors');
      if (!container) return;

      const pendingApps = adminTutorApps.filter(d => (d.data().status || 'pending') === 'pending');
      const otherApps = adminTutorApps.filter(d => (d.data().status || 'pending') !== 'pending');

      const pendingHtml = pendingApps.length
        ? pendingApps.map(buildAdminTutorAppCardHtml).join('')
        : '<div class="admin-card" style="text-align:center; color:#999;">目前沒有待審批的導師申請</div>';

      const tutorsHtml = adminTutorsList.length
        ? adminTutorsList.map(buildAdminTutorCardHtml).join('')
        : '<div class="admin-card" style="text-align:center; color:#999;">目前還沒有任何已批准的導師</div>';

      const historyHtml = otherApps.length ? otherApps.map(buildAdminTutorAppCardHtml).join('') : '';

      container.innerHTML = `
        <h4 style="font-size:14px; font-weight:bold; color:var(--brand-800); margin:4px 0 8px;">待審批申請</h4>
        ${pendingHtml}
        <h4 style="font-size:14px; font-weight:bold; color:var(--brand-800); margin:18px 0 8px;">導師名單</h4>
        ${tutorsHtml}
        ${historyHtml ? `<h4 style="font-size:14px; font-weight:bold; color:var(--brand-800); margin:18px 0 8px;">申請歷史（已批准／已駁回）</h4>${historyHtml}` : ''}
      `;
    }

    function renderAdminTutorsTab() {
      const container = document.getElementById('admin-tab-tutors');
      if (!container || !window.db || !window.fs) return;
      container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">載入中導師申請...</p>';

      if (adminTutorAppsUnsubscribe) adminTutorAppsUnsubscribe();
      if (adminTutorsListUnsubscribe) adminTutorsListUnsubscribe();
      adminTutorApps = [];
      adminTutorsList = [];

      const appsQ = window.fs.query(
        window.fs.collection(window.db, 'tutorApplications'),
        window.fs.orderBy('submittedAt', 'desc'),
        window.fs.limit(100)
      );
      adminTutorAppsUnsubscribe = window.fs.onSnapshot(appsQ, (snapshot) => {
        adminTutorApps = snapshot.docs;
        renderAdminTutorsListUI();
      }, (err) => {
        container.innerHTML = `<div class="admin-card" style="color:#c0392b;">載入導師申請失敗：${err.message || err}</div>`;
      });

      const tutorsQ = window.fs.query(
        window.fs.collection(window.db, 'tutors'),
        window.fs.orderBy('createdAt', 'desc'),
        window.fs.limit(100)
      );
      adminTutorsListUnsubscribe = window.fs.onSnapshot(tutorsQ, (snapshot) => {
        adminTutorsList = snapshot.docs;
        renderAdminTutorsListUI();
      }, (err) => {
        console.error('載入導師名單失敗：', err);
      });
    }
    window.renderAdminTutorsTab = renderAdminTutorsTab;

    window.adminApproveTutorApp = async function(uid) {
      if (!(await window.appConfirm('確定批准這個導師申請？批准之後該用戶會立即獲得導師身份。'))) return;
      try {
        await window.callCloudFunction('approveTutorApplication', { targetUid: uid });
        await logAdminAction('批准導師申請', { uid });
        window.showToast('已批准導師申請', '✅');
      } catch (err) {
        window.showToast('批准失敗：' + (err.message || err), '❌');
      }
    };

    window.adminRejectTutorApp = async function(uid) {
      const reason = (await window.appPrompt('駁回原因（會顯示給申請人查看，可以留空）：', ''));
      if (reason === null) return; // 撳咗取消
      try {
        await window.callCloudFunction('rejectTutorApplication', { targetUid: uid, rejectionReason: reason });
        await logAdminAction('駁回導師申請', { uid, reason });
        window.showToast('已駁回導師申請', '🗂️');
      } catch (err) {
        window.showToast('駁回失敗：' + (err.message || err), '❌');
      }
    };

    window.adminSuspendTutor = async function(uid) {
      if (!(await window.appConfirm('確定停權這位導師？其已上架的筆記會自動下架，但已購買的學生保留下載權。'))) return;
      try {
        await window.callCloudFunction('suspendTutor', { targetUid: uid });
        await logAdminAction('停權導師', { uid });
        window.showToast('已停權該導師', '🚫');
      } catch (err) {
        window.showToast('停權失敗：' + (err.message || err), '❌');
      }
    };

    window.adminReinstateTutor = async function(uid) {
      try {
        await window.callCloudFunction('reinstateTutor', { targetUid: uid });
        await logAdminAction('解除導師停權', { uid });
        window.showToast('已解除停權', '✅');
      } catch (err) {
        window.showToast('解除停權失敗：' + (err.message || err), '❌');
      }
    };

    // ---------- Landing page（未登入主頁）文案／圖片管理 ----------
    // 做法同扭蛋機／等級系統／功能圖示嗰幾個分頁一致：資料存喺 Firestore
    // 嘅 admin_config/landingContent 文件，管理員喺呢度改完撳「儲存」，
    // 全站（包括未登入訪客）即時生效，唔使再改 code、推 GitHub。
    // 同其他幾個分頁唯一唔同嘅地方：呢份文件嘅讀取權限特登喺
    // firestore.rules 開放俾未登入用戶（見 admin_config/landingContent
    // 嗰條獨立規則），因為 Landing page 本身就係畀未登入嘅訪客睇。
    //
    // 文字部分直接存返 i18n.js 入面 'landing.*' 嗰 24 組 key 嘅三語
    // 內容（zh-Hant／en／yue），管理員改嘅其實就係 window.I18N_DICT
    // 入面呢幾組字嘅值；圖片部分（Nav Logo／主橫幅吉祥物圖）存返兩條
    // Firebase Storage 下載連結，冇自訂圖片嗰陣就維持用返 index.html
    // 寫死嘅預設檔案（assets/images/logo-hero.png／assets/images/ottie-wave.png）。

    // 分組顯示用：每個分組底下嘅 key 清單＋中文標籤，純粹為咗令管理員
    // 睇得明呢個欄位對應緊個網站邊一句字，唔影響實際儲存結構。
    const LANDING_FIELD_GROUPS = [
      {
        title: '導覽列',
        fields: [
          { key: 'landing.navLogin', label: '「登入」按鈕文字' },
          { key: 'landing.registerBtn', label: '「註冊帳號」按鈕文字（頂部導覽／主橫幅／底部行動呼籲共用同一句，改一次三處一齊變）' }
        ]
      },
      {
        title: '主橫幅',
        fields: [
          { key: 'landing.heroH1Line1', label: '主標題　第一行' },
          { key: 'landing.heroH1Line2', label: '主標題　第二行' },
          { key: 'landing.heroSub', label: '說明文字' },
          { key: 'landing.subjectChinese', label: '科目裝飾格：中文' },
          { key: 'landing.subjectEnglish', label: '科目裝飾格：英文' },
          { key: 'landing.subjectMath', label: '科目裝飾格：數學' }
        ]
      },
      {
        title: '「三個核心」介紹區',
        fields: [
          { key: 'landing.stepsEyebrow', label: '小標籤' },
          { key: 'landing.stepsH2', label: '大標題' },
          { key: 'landing.stepsSub', label: '說明文字' },
          { key: 'landing.step1Title', label: '第一步　標題' },
          { key: 'landing.step1Desc', label: '第一步　說明' },
          { key: 'landing.step2Title', label: '第二步　標題' },
          { key: 'landing.step2Desc', label: '第二步　說明' },
          { key: 'landing.step3Title', label: '第三步　標題' },
          { key: 'landing.step3Desc', label: '第三步　說明' }
        ]
      },
      {
        title: '行動呼籲區',
        fields: [
          { key: 'landing.ctaH2', label: '大標題' },
          { key: 'landing.ctaSub', label: '說明文字' }
        ]
      },
      {
        title: '頁尾',
        fields: [
          { key: 'landing.footerCopyright', label: '版權文字' },
          { key: 'landing.footerTerms', label: '「服務條款」連結文字' },
          { key: 'landing.footerPrivacy', label: '「私隱政策」連結文字' }
        ]
      }
    ];

    let adminLandingDraft = null;
    let landingConfigLoaded = false;

    function renderAdminLandingImageCard(imgKey, title, desc, defaultFile) {
      const url = adminLandingDraft.images[imgKey];
      const previewInner = url
        ? `<img src="${url}" style="width:100%; height:100%; object-fit:contain;">`
        : `<img src="${defaultFile}" style="width:100%; height:100%; object-fit:contain;">`;
      return `
        <div class="admin-card">
          <h3 style="font-size:15px; font-weight:bold; color:var(--brand-800); margin-bottom:10px;">${title}</h3>
          <p style="font-size:13px; color:#888; margin-bottom:10px;">${desc}</p>
          <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <div id="admin-landing-${imgKey}-thumb" onclick="document.getElementById('admin-landing-${imgKey}-input').click()" title="點擊這裡上傳圖片" style="width:80px; height:80px; border-radius:10px; background:#F6F7FB; border:1px dashed #D2D9E9; display:flex; align-items:center; justify-content:center; cursor:pointer; overflow:hidden;">${previewInner}</div>
            <input type="file" accept="image/*" id="admin-landing-${imgKey}-input" style="display:none;" onchange="adminUploadLandingImage('${imgKey}', this)">
            <div style="display:flex; flex-direction:column; gap:6px;">
              <button type="button" class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="document.getElementById('admin-landing-${imgKey}-input').click()">上傳新圖片</button>
              ${url ? `<button type="button" class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="adminRemoveLandingImage('${imgKey}')">還原做預設圖</button>` : ''}
            </div>
          </div>
        </div>
      `;
    }

    function renderAdminLandingTab() {
      const container = document.getElementById('admin-tab-landing');
      if (!container) return;

      if (!adminLandingDraft) {
        if (!landingConfigLoaded) {
          container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">載入中 Landing page 設定...</p>';
          return; // Firestore 資料一到，loadLandingContentFromFirestore() 會自動再 render 多次
        }
        const texts = {};
        LANDING_FIELD_GROUPS.forEach(group => {
          group.fields.forEach(f => {
            const entry = (window.I18N_DICT && window.I18N_DICT[f.key]) || {};
            texts[f.key] = {
              'zh-Hant': entry['zh-Hant'] || '',
              'en': entry['en'] || '',
              'yue': entry['yue'] || ''
            };
          });
        });
        adminLandingDraft = {
          texts,
          images: {
            navLogoUrl: window.LANDING_IMAGE_OVERRIDES ? (window.LANDING_IMAGE_OVERRIDES.navLogoUrl || null) : null,
            heroImageUrl: window.LANDING_IMAGE_OVERRIDES ? (window.LANDING_IMAGE_OVERRIDES.heroImageUrl || null) : null
          }
        };
      }

      const groupsHtml = LANDING_FIELD_GROUPS.map(group => {
        const fieldsHtml = group.fields.map(f => {
          const v = adminLandingDraft.texts[f.key];
          return `
            <div style="margin-bottom:16px; padding-bottom:14px; border-bottom:1px solid #EEF3FA;">
              <p style="font-size:13px; font-weight:bold; color:var(--brand-700); margin-bottom:6px;">${f.label}</p>
              <div style="display:grid; grid-template-columns:1fr; gap:6px;">
                <label style="font-size:12px; color:#999;">繁體中文
                  <textarea rows="1" style="width:100%; font-size:14px; padding:6px 8px; border:1px solid #DCE5F4; border-radius:6px; font-family:inherit; resize:vertical;" oninput="adminUpdateLandingText('${f.key}','zh-Hant',this.value)">${v['zh-Hant']}</textarea>
                </label>
                <label style="font-size:12px; color:#999;">English
                  <textarea rows="1" style="width:100%; font-size:14px; padding:6px 8px; border:1px solid #DCE5F4; border-radius:6px; font-family:inherit; resize:vertical;" oninput="adminUpdateLandingText('${f.key}','en',this.value)">${v['en']}</textarea>
                </label>
                <label style="font-size:12px; color:#999;">廣東話
                  <textarea rows="1" style="width:100%; font-size:14px; padding:6px 8px; border:1px solid #DCE5F4; border-radius:6px; font-family:inherit; resize:vertical;" oninput="adminUpdateLandingText('${f.key}','yue',this.value)">${v['yue']}</textarea>
                </label>
              </div>
            </div>
          `;
        }).join('');
        return `
          <div class="admin-card" style="margin-bottom:16px;">
            <h3 style="font-size:16px; font-weight:bold; color:var(--brand-800); margin-bottom:14px;">${group.title}</h3>
            ${fieldsHtml}
          </div>
        `;
      }).join('');

      container.innerHTML = `
        <p style="font-size:13px; color:#888; margin-bottom:14px;">這裏的文字是未登入訪客打開網站時首先看到的首頁內容，三種語言可以分開修改。修改後點擊最底的「儲存全部改動」，即時全站生效（包括未登入的訪客），毋須修改程式。</p>
        ${renderAdminLandingImageCard('navLogoUrl', '主橫幅 Logo', '顯示喺 Landing page 主橫幅左上方嘅大 Logo（建議用透明背景 PNG，闊度約 600px 以上）。', 'assets/images/logo-hero.png')}
        ${renderAdminLandingImageCard('heroImageUrl', '主橫幅吉祥物圖', '顯示在主橫幅中間的 Ottiee 吉祥物圖案。', 'assets/images/ottie-wave.png')}
        ${groupsHtml}
        <div style="text-align:center; margin-top:10px;">
          <button type="button" class="btn btn-primary" id="btn-admin-save-landing" style="padding:12px 32px; font-size:15px;" onclick="adminSaveLandingContent()">儲存全部改動</button>
        </div>
      `;
    }
    window.renderAdminLandingTab = renderAdminLandingTab;

    window.adminUpdateLandingText = function(key, lang, value) {
      if (!adminLandingDraft || !adminLandingDraft.texts[key]) return;
      adminLandingDraft.texts[key][lang] = value;
    };

    window.adminUploadLandingImage = async function(imgKey, inputEl) {
      if (!adminLandingDraft) return;
      const file = inputEl.files && inputEl.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        window.showToast('請選擇圖片檔案', '⚠️');
        return;
      }
      if (!window.storage || !window.storageApi) {
        window.showToast('Storage 未初始化，請重新整理頁面再試', '⚠️');
        return;
      }
      const oldUrl = adminLandingDraft.images[imgKey];
      window.showToast('上傳中圖片…', '📤');
      try {
        const { blob, mimeType } = await compressImageFileToBlob(file, 600, 0.9);
        const ext = mimeType === 'image/png' ? 'png' : 'jpg';
        const path = `landing_assets/${imgKey}_${Date.now()}.${ext}`;
        const fileRef = window.storageApi.ref(window.storage, path);
        await window.storageApi.uploadBytes(fileRef, blob, { contentType: mimeType });
        const downloadUrl = await window.storageApi.getDownloadURL(fileRef);
        adminLandingDraft.images[imgKey] = downloadUrl;
        renderAdminLandingTab();
        window.showToast('圖片上傳成功，請點擊「儲存全部改動」才會正式生效', '🎉');
        tryDeleteOldGachaStoragePhoto(oldUrl); // best-effort，呢個函式其實通用，唔止扭蛋貼紙先用得
      } catch (err) {
        window.showToast('圖片上傳失敗：' + (err.message || err), '❌');
      }
    };

    window.adminRemoveLandingImage = function(imgKey) {
      if (!adminLandingDraft) return;
      const oldUrl = adminLandingDraft.images[imgKey];
      tryDeleteOldGachaStoragePhoto(oldUrl); // best-effort
      adminLandingDraft.images[imgKey] = null;
      renderAdminLandingTab();
    };

    window.adminSaveLandingContent = async function() {
      if (!adminLandingDraft) return;
      const payload = {
        texts: adminLandingDraft.texts,
        images: adminLandingDraft.images,
        updatedAt: Date.now(),
        updatedBy: window.currentUser ? window.currentUser.email : null
      };
      const btn = document.getElementById('btn-admin-save-landing');
      if (btn) { btn.disabled = true; btn.innerText = '儲存中…'; }
      try {
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'landingContent'), payload);
        window.showToast('Landing page 設定已儲存，即時對所有訪客生效！', '🎉');
      } catch (err) {
        window.showToast('儲存失敗：' + (err.message || err), '❌');
      } finally {
        if (btn) { btn.disabled = false; btn.innerText = '儲存全部改動'; }
      }
    };

    // 讀取 Firestore 度嘅 Landing page 設定，覆蓋返 window.I18N_DICT 入面
    // 'landing.*' 嗰幾組字、同埋 Nav Logo／主橫幅吉祥物圖嘅顯示。呢個
    // 特登唔經 onAuthStateChanged 嗰邊叫（同 loadGachaConfigFromFirestore
    // 等幾個唔同），而係一有 window.db／window.fs 就即刻叫（見
    // app-core.js），因為 Landing page 係畀未登入嘅訪客睇，唔可以等
    // 用戶登入咗先至套用翻譯／圖片。
    //
    // 合併規則：管理員喺某個語言留空＝「冇改動」，唔會用空字串覆蓋走
    // 原本寫死喺 i18n.js 嘅預設翻譯（唔係咁嘅話，萬一得意管理員淨係
    // 填咗中文、冚晒英文／廣東話留空，English／廣東話版就會由「冇翻
    // 譯、自動退返用中文」變成「真係顯示緊一舊空白」，用戶體驗反而變差）。
    let landingConfigUnsubscribe = null;
    function loadLandingContentFromFirestore() {
      if (!window.db || !window.fs) return;
      if (landingConfigUnsubscribe) landingConfigUnsubscribe();
      const ref = window.fs.doc(window.db, 'admin_config', 'landingContent');
      landingConfigUnsubscribe = window.fs.onSnapshot(ref, (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.texts && typeof data.texts === 'object' && window.I18N_DICT) {
            Object.keys(data.texts).forEach((key) => {
              if (!window.I18N_DICT[key]) return;
              const override = data.texts[key];
              ['zh-Hant', 'en', 'yue'].forEach((lang) => {
                if (override && typeof override[lang] === 'string' && override[lang]) {
                  window.I18N_DICT[key][lang] = override[lang];
                }
              });
            });
          }
          window.LANDING_IMAGE_OVERRIDES = data.images || {};
          const navLogoEl = document.getElementById('landing-nav-logo-img');
          if (navLogoEl) navLogoEl.src = (data.images && data.images.navLogoUrl) ? data.images.navLogoUrl : 'assets/images/logo-hero.png';
          const heroImgEl = document.getElementById('landing-hero-mascot-img');
          if (heroImgEl) heroImgEl.src = (data.images && data.images.heroImageUrl) ? data.images.heroImageUrl : 'assets/images/ottie-wave.png';
        }
        landingConfigLoaded = true;
        if (typeof window.applyAppLanguage === 'function') window.applyAppLanguage();
        // 如果管理員岩岩好打開緊「Landing page文案」呢個分頁、又仲未開始
        // 編輯（adminLandingDraft 仲係 null，卡喺「載入中...」畫面），
        // 而家攞到資料喇，即刻幫佢重新 render 一次。
        if (adminTabShowing('landing') && !adminLandingDraft) {
          const adminPanelEl = document.getElementById('admin-panel-container');
          if (adminPanelEl && adminPanelEl.style.display !== 'none') {
            renderAdminLandingTab();
          }
        }
      }, (err) => {
        console.error('讀取 Landing page 設定失敗:', err);
        landingConfigLoaded = true; // 唔好卡死喺「載入中...」畫面，起碼俾程式碼入面寫死嘅預設值可以用
        if (typeof window.isCurrentUserAdmin === 'function' && window.isCurrentUserAdmin()) {
          window.showToast('讀取 Landing page 設定失敗（可能是 Firestore 規則未生效）：' + (err.message || err), '⚠️');
        }
      });
    }
    window.loadLandingContentFromFirestore = loadLandingContentFromFirestore;

    // ---------- 計分規則設定 ----------
    // 每分鐘PTS、確認仍在學習嘅獎勵PTS——做法同其他幾個分頁一致，存喺
    // Firestore（admin_config/scoringRules 文件），管理員喺呢度改完撳
    // 「儲存」，全站即時生效。
    //
    // ⚠️ 同扭蛋／等級系統/Landing page嗰幾個分頁唯一唔同嘅地方：呢組
    // 設定除咗前端讀（room-video.js 嘅 window.SCORING_RULES，用嚟顯示
    // 畫面同決定要畀幾多分），仲有伺服器端（functions/index.js 嘅
    // awardStudyPoints Cloud Function）會讀同一份文件做「呢個分數啱唔
    // 啱」嘅安全驗證——如果淨係改前端、伺服器嗰邊個白名單對唔上，
    // 寫入會被拒絕（學生會見到「無效的積分數量」錯誤）。前端呢度已經
    // 自動跟返Firestore入面嘅最新數值，唔使擔心手動同步問題。
    let adminScoringDraft = null;
    let scoringConfigLoaded = false;

    function renderAdminScoringTab() {
      // v1.224.0：計分規則併入「房間設定」分頁頂部
      const container = document.getElementById('admin-scoring-section') || document.getElementById('admin-tab-scoring');
      if (!container) return;

      if (!adminScoringDraft) {
        if (!scoringConfigLoaded) {
          container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">正在載入計分規則…</p>';
          return; // Firestore 資料一到，loadScoringRulesFromFirestore() 會自動再 render 多次
        }
        adminScoringDraft = {
          ptsPerMinute: window.SCORING_RULES ? window.SCORING_RULES.ptsPerMinute : 1,
          presenceCheckBonus: window.SCORING_RULES ? window.SCORING_RULES.presenceCheckBonus : 2
        };
      }

      container.innerHTML = `
        <div class="admin-card">
          <h3 style="font-size:16px; font-weight:bold; color:var(--brand-800); margin-bottom:14px;">計分規則</h3>
          <p style="font-size:13px; color:#888; margin-bottom:16px;">這裏的數值會即時影響全站學生在視訊溫習室可獲得的 PTS，修改後請先核對清楚再儲存。</p>
          <div style="margin-bottom:18px;">
            <label style="font-size:13px; font-weight:bold; color:var(--brand-700); display:block; margin-bottom:6px;">每專注溫習 1 分鐘可獲得的 PTS</label>
            <input type="number" min="1" step="1" value="${adminScoringDraft.ptsPerMinute}" style="width:120px; font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px;" oninput="adminUpdateScoringDraft('ptsPerMinute', this.value)">
          </div>
          <div style="margin-bottom:10px;">
            <label style="font-size:13px; font-weight:bold; color:var(--brand-700); display:block; margin-bottom:6px;">確認「仍在學習」彈窗後額外可獲得的 PTS</label>
            <input type="number" min="1" step="1" value="${adminScoringDraft.presenceCheckBonus}" style="width:120px; font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px;" oninput="adminUpdateScoringDraft('presenceCheckBonus', this.value)">
          </div>
        </div>
        <div style="text-align:center; margin-top:16px;">
          <button type="button" class="btn btn-primary" id="btn-admin-save-scoring" style="padding:12px 32px; font-size:15px;" onclick="adminSaveScoringRules()">儲存計分規則</button>
        </div>
      `;
    }
    window.renderAdminScoringTab = renderAdminScoringTab;

    window.adminUpdateScoringDraft = function(key, value) {
      if (!adminScoringDraft) return;
      const n = parseInt(value, 10);
      adminScoringDraft[key] = (Number.isFinite(n) && n > 0) ? n : adminScoringDraft[key];
    };

    window.adminSaveScoringRules = async function() {
      if (!adminScoringDraft) return;
      if (!(adminScoringDraft.ptsPerMinute > 0) || !(adminScoringDraft.presenceCheckBonus > 0)) {
        window.showToast('兩個數值都要大於 0', '⚠️');
        return;
      }
      const payload = {
        ptsPerMinute: adminScoringDraft.ptsPerMinute,
        presenceCheckBonus: adminScoringDraft.presenceCheckBonus,
        updatedAt: Date.now(),
        updatedBy: window.currentUser ? window.currentUser.email : null
      };
      const btn = document.getElementById('btn-admin-save-scoring');
      if (btn) { btn.disabled = true; btn.innerText = '儲存中…'; }
      try {
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'scoringRules'), payload);
        window.showToast('計分規則已儲存，即時對所有用戶生效！（伺服器端最多需要30秒追上最新設定）', '🎉');
      } catch (err) {
        window.showToast('儲存失敗：' + (err.message || err), '❌');
      } finally {
        if (btn) { btn.disabled = false; btn.innerText = '儲存計分規則'; }
      }
    };

    let scoringConfigUnsubscribe = null;
    function loadScoringRulesFromFirestore() {
      if (!window.db || !window.fs) return;
      if (scoringConfigUnsubscribe) scoringConfigUnsubscribe();
      const ref = window.fs.doc(window.db, 'admin_config', 'scoringRules');
      scoringConfigUnsubscribe = window.fs.onSnapshot(ref, (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (typeof data.ptsPerMinute === 'number' && data.ptsPerMinute > 0) window.SCORING_RULES.ptsPerMinute = data.ptsPerMinute;
          if (typeof data.presenceCheckBonus === 'number' && data.presenceCheckBonus > 0) window.SCORING_RULES.presenceCheckBonus = data.presenceCheckBonus;
        }
        scoringConfigLoaded = true;
        if ((adminTabShowing('scoring') || adminTabShowing('roomsettings')) && !adminScoringDraft) {
          const adminPanelEl = document.getElementById('admin-panel-container');
          if (adminPanelEl && adminPanelEl.style.display !== 'none') {
            renderAdminScoringTab();
          }
        }
      }, (err) => {
        console.error('讀取計分規則設定失敗:', err);
        scoringConfigLoaded = true;
        if (typeof window.isCurrentUserAdmin === 'function' && window.isCurrentUserAdmin()) {
          window.showToast('讀取計分規則設定失敗（可能是 Firestore 規則未生效）：' + (err.message || err), '⚠️');
        }
      });
    }
    window.loadScoringRulesFromFirestore = loadScoringRulesFromFirestore;

    // ---------- 房間設定（建立溫習房表格嘅人數上限／預計溫習時間選項）----------
    // 做法同「計分規則」分頁一致，存喺 Firestore（admin_config/roomSettings
    // 文件），管理員喺呢度改完撳「儲存」，全站「建立溫習房」表格即時跟
    // 住變（見 room-video.js 嘅 window.ROOM_SETTINGS／window.renderRoomCreateOptions）。
    //
    // ⚠️ 人數上限刻意淨係畀管理員喺「2 人房」「4 人房」呢兩個選項度開
    // 關同揀預設值，唔可以自訂其他數字——因為視訊格位版面寫死咗淨係
    // 支援呢兩種排法（2 格或 2x2 四格），加其他人數會整壞版面。預計
    // 溫習時間就純粹係畀學生參考嘅顯示文字，房間唔會因為時間到而自
    // 動結束，所以呢項可以自由加／減／改分鐘數選項。
    let adminRoomSettingsDraft = null;
    let roomSettingsConfigLoaded = false;

    function renderAdminRoomSettingsTab() {
      const container = document.getElementById('admin-tab-roomsettings');
      if (!container) return;

      if (!adminRoomSettingsDraft) {
        if (!roomSettingsConfigLoaded) {
          container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">載入中房間設定...</p>';
          return; // Firestore 資料一到，loadRoomSettingsFromFirestore() 會自動再 render 多次
        }
        const s = window.ROOM_SETTINGS || {};
        adminRoomSettingsDraft = {
          capacity2Enabled: s.capacity2Enabled !== false,
          capacity4Enabled: s.capacity4Enabled !== false,
          defaultCapacity: s.defaultCapacity === 2 ? 2 : 4,
          durationOptionsText: Array.isArray(s.durationOptions) ? s.durationOptions.join(', ') : '15, 30, 40, 45, 60',
          defaultDuration: s.defaultDuration || 30
        };
      }

      const d = adminRoomSettingsDraft;
      const capacityChoicesNow = [];
      if (d.capacity2Enabled) capacityChoicesNow.push(2);
      if (d.capacity4Enabled) capacityChoicesNow.push(4);

      container.innerHTML = `
        <div id="admin-scoring-section"></div>
        <div class="admin-card" style="margin-top:24px;">
          <h3 style="font-size:16px; font-weight:bold; color:var(--brand-800); margin-bottom:14px;">人數上限選項</h3>
          <p style="font-size:13px; color:#888; margin-bottom:16px;">學生建立溫習房時可選擇的人數上限（只有 2 人房及 4 人房兩種，因為視訊畫面只支援這兩種排列）。</p>
          <label style="display:flex; align-items:center; gap:8px; font-size:14px; margin-bottom:10px; cursor:pointer;">
            <input type="checkbox" ${d.capacity2Enabled ? 'checked' : ''} onchange="adminUpdateRoomSettingsDraft('capacity2Enabled', this.checked)"> 開放「2 人房」選項
          </label>
          <label style="display:flex; align-items:center; gap:8px; font-size:14px; margin-bottom:16px; cursor:pointer;">
            <input type="checkbox" ${d.capacity4Enabled ? 'checked' : ''} onchange="adminUpdateRoomSettingsDraft('capacity4Enabled', this.checked)"> 開放「4 人房」選項
          </label>
          <div>
            <label style="font-size:13px; font-weight:bold; color:var(--brand-700); display:block; margin-bottom:6px;">預設人數上限（開啟表格時預先選取）</label>
            <select style="width:160px; font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px;" onchange="adminUpdateRoomSettingsDraft('defaultCapacity', this.value)">
              ${capacityChoicesNow.map(n => `<option value="${n}" ${d.defaultCapacity === n ? 'selected' : ''}>${n} 人房</option>`).join('') || '<option value="">（請先開放最少一個選項）</option>'}
            </select>
          </div>
        </div>
        <div class="admin-card" style="margin-top:16px;">
          <h3 style="font-size:16px; font-weight:bold; color:var(--brand-800); margin-bottom:14px;">預計溫習時間選項</h3>
          <p style="font-size:13px; color:#888; margin-bottom:16px;">此時間只會顯示在公開大廳的房間列表，供其他同學參考，房間不會因時間到而自動結束。可自由增減分鐘選項。</p>
          <div style="margin-bottom:16px;">
            <label style="font-size:13px; font-weight:bold; color:var(--brand-700); display:block; margin-bottom:6px;">分鐘選項（以逗號分隔，例如：15, 30, 40, 45, 60）</label>
            <input type="text" value="${d.durationOptionsText}" style="width:100%; max-width:420px; font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px;" oninput="adminUpdateRoomSettingsDraft('durationOptionsText', this.value)">
          </div>
          <div>
            <label style="font-size:13px; font-weight:bold; color:var(--brand-700); display:block; margin-bottom:6px;">預設溫習時間（分鐘，開啟表格時預先選取）</label>
            <input type="number" min="1" step="1" value="${d.defaultDuration}" style="width:160px; font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px;" oninput="adminUpdateRoomSettingsDraft('defaultDuration', this.value)">
          </div>
        </div>
        <div style="text-align:center; margin-top:16px;">
          <button type="button" class="btn btn-primary" id="btn-admin-save-roomsettings" style="padding:12px 32px; font-size:15px;" onclick="adminSaveRoomSettings()">儲存房間設定</button>
        </div>
      `;
      renderAdminScoringTab();
    }
    window.renderAdminRoomSettingsTab = renderAdminRoomSettingsTab;

    window.adminUpdateRoomSettingsDraft = function(key, value) {
      if (!adminRoomSettingsDraft) return;
      if (key === 'capacity2Enabled' || key === 'capacity4Enabled') {
        adminRoomSettingsDraft[key] = !!value;
      } else if (key === 'defaultCapacity') {
        const n = parseInt(value, 10);
        adminRoomSettingsDraft.defaultCapacity = (n === 2 || n === 4) ? n : adminRoomSettingsDraft.defaultCapacity;
      } else if (key === 'defaultDuration') {
        const n = parseInt(value, 10);
        adminRoomSettingsDraft.defaultDuration = (Number.isFinite(n) && n > 0) ? n : adminRoomSettingsDraft.defaultDuration;
      } else if (key === 'durationOptionsText') {
        adminRoomSettingsDraft.durationOptionsText = value;
      }
      renderAdminRoomSettingsTab();
    };

    window.adminSaveRoomSettings = async function() {
      if (!adminRoomSettingsDraft) return;
      const d = adminRoomSettingsDraft;

      if (!d.capacity2Enabled && !d.capacity4Enabled) {
        window.showToast('「2 人房」和「4 人房」不可以同時關閉，最少要開放一個', '⚠️');
        return;
      }

      // 解析「分鐘數選項」文字輸入：逗號分隔、去重、過濾唔合法嘅值、
      // 由細到大排序，確保存落 Firestore 嘅係乾淨嘅正整數陣列。
      const durationOptions = Array.from(new Set(
        d.durationOptionsText.split(',')
          .map(s => parseInt(s.trim(), 10))
          .filter(n => Number.isFinite(n) && n > 0)
      )).sort((a, b) => a - b);

      if (durationOptions.length === 0) {
        window.showToast('最少要有一個有效的溫習時間選項（正整數分鐘數）', '⚠️');
        return;
      }

      const defaultCapacity = (d.defaultCapacity === 2 && d.capacity2Enabled) ? 2
        : (d.defaultCapacity === 4 && d.capacity4Enabled) ? 4
        : (d.capacity4Enabled ? 4 : 2);

      const defaultDuration = durationOptions.includes(d.defaultDuration) ? d.defaultDuration : durationOptions[0];

      const payload = {
        capacity2Enabled: d.capacity2Enabled,
        capacity4Enabled: d.capacity4Enabled,
        defaultCapacity: defaultCapacity,
        durationOptions: durationOptions,
        defaultDuration: defaultDuration,
        updatedAt: Date.now(),
        updatedBy: window.currentUser ? window.currentUser.email : null
      };
      const btn = document.getElementById('btn-admin-save-roomsettings');
      if (btn) { btn.disabled = true; btn.innerText = '儲存中…'; }
      try {
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'roomSettings'), payload);
        window.showToast('房間設定已儲存，即時對所有用戶生效！', '🎉');
      } catch (err) {
        window.showToast('儲存失敗：' + (err.message || err), '❌');
      } finally {
        if (btn) { btn.disabled = false; btn.innerText = '儲存全部改動'; }
      }
    };

    let roomSettingsConfigUnsubscribe = null;
    function loadRoomSettingsFromFirestore() {
      if (!window.db || !window.fs) return;
      if (roomSettingsConfigUnsubscribe) roomSettingsConfigUnsubscribe();
      const ref = window.fs.doc(window.db, 'admin_config', 'roomSettings');
      roomSettingsConfigUnsubscribe = window.fs.onSnapshot(ref, (snap) => {
        if (snap.exists() && window.ROOM_SETTINGS) {
          const data = snap.data();
          if (typeof data.capacity2Enabled === 'boolean') window.ROOM_SETTINGS.capacity2Enabled = data.capacity2Enabled;
          if (typeof data.capacity4Enabled === 'boolean') window.ROOM_SETTINGS.capacity4Enabled = data.capacity4Enabled;
          if (data.defaultCapacity === 2 || data.defaultCapacity === 4) window.ROOM_SETTINGS.defaultCapacity = data.defaultCapacity;
          if (Array.isArray(data.durationOptions) && data.durationOptions.length > 0) window.ROOM_SETTINGS.durationOptions = data.durationOptions;
          if (typeof data.defaultDuration === 'number' && data.defaultDuration > 0) window.ROOM_SETTINGS.defaultDuration = data.defaultDuration;
        }
        roomSettingsConfigLoaded = true;
        if (adminTabShowing('roomsettings') && !adminRoomSettingsDraft) {
          const adminPanelEl = document.getElementById('admin-panel-container');
          if (adminPanelEl && adminPanelEl.style.display !== 'none') {
            renderAdminRoomSettingsTab();
          }
        }
      }, (err) => {
        console.error('讀取房間設定失敗:', err);
        roomSettingsConfigLoaded = true;
        if (typeof window.isCurrentUserAdmin === 'function' && window.isCurrentUserAdmin()) {
          window.showToast('讀取房間設定失敗（可能是 Firestore 規則未生效）：' + (err.message || err), '⚠️');
        }
      });
    }
    window.loadRoomSettingsFromFirestore = loadRoomSettingsFromFirestore;

    // ---------- 防掛機參數（開咪時限、確認間隔等）----------
    // 做法同「計分規則」「房間設定」一致，存喺 Firestore
    // （admin_config/antiIdleRules 文件），管理員改完撳「儲存」，全站
    // 即時跟住變（見 room-video.js 嘅 window.applyAntiIdleRules）。
    //
    // ⚠️ 呢幾個參數純粹前端生效，冇牽涉 Cloud Function（同「房間設定」
    // 一樣），因為伺服器端淨係驗證每次送嚟嘅分數數值啱唔啱（見計分
    // 規則嗰項），唔理會送分頻密程度。但「已經開始緊嘅計時器」（例如
    // 學生已經喺房入面）唔會即時被打斷重設，新數值要等下一次相關計
    // 時器重新開始（下次入房、下次開咪）先生效。
    let adminAntiIdleDraft = null;
    let antiIdleConfigLoaded = false;

    const ANTI_IDLE_FIELDS = [
      { key: 'presenceCheckIntervalMin', label: '「仍在溫習緊？」確認彈窗，相隔幾多分鐘出現一次' },
      { key: 'presenceResponseMin', label: '彈窗出現之後，幾多分鐘內未確認就會暫停計分' },
      { key: 'micOpenLimitMin', label: '每次開咪，最多可以連續開幾多分鐘' },
      { key: 'micCooldownMin', label: '開咪撞到上限之後，要冷卻（鎖住咪掣）幾多分鐘先可以再開' },
      { key: 'micIdleResetMin', label: '主動關咪、未撞到上限嘅情況下，連續幾多分鐘冇再開咪就當完全休息返、重新計過開咪時限' }
    ];

    function renderAdminAntiIdleTab() {
      const container = document.getElementById('admin-tab-antiidle');
      if (!container) return;

      if (!adminAntiIdleDraft) {
        if (!antiIdleConfigLoaded) {
          container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">載入中防掛機參數設定...</p>';
          return; // Firestore 資料一到，loadAntiIdleRulesFromFirestore() 會自動再 render 多次
        }
        const r = window.ANTI_IDLE_RULES || {};
        adminAntiIdleDraft = {
          presenceCheckIntervalMin: r.presenceCheckIntervalMin || 30,
          presenceResponseMin: r.presenceResponseMin || 5,
          micOpenLimitMin: r.micOpenLimitMin || 3,
          micCooldownMin: r.micCooldownMin || 5,
          micIdleResetMin: r.micIdleResetMin || 5
        };
      }

      const d = adminAntiIdleDraft;
      container.innerHTML = `
        <div class="admin-card">
          <h3 style="font-size:16px; font-weight:bold; color:var(--brand-800); margin-bottom:14px;">視訊溫習室防掛機參數</h3>
          <p style="font-size:13px; color:#888; margin-bottom:16px;">這組數值用作防止學生掛機或開着鏡頭不理會而賺取積分，單位均為「分鐘」，請核實後才儲存。已在房內的學生不會即時生效，要待下次入房或開咪時才套用新數值。</p>
          ${ANTI_IDLE_FIELDS.map(f => `
            <div style="margin-bottom:16px;">
              <label style="font-size:13px; font-weight:bold; color:var(--brand-700); display:block; margin-bottom:6px;">${f.label}</label>
              <input type="number" min="1" step="1" value="${d[f.key]}" style="width:120px; font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px;" oninput="adminUpdateAntiIdleDraft('${f.key}', this.value)"> 分鐘
            </div>
          `).join('')}
        </div>
        <div style="text-align:center; margin-top:16px;">
          <button type="button" class="btn btn-primary" id="btn-admin-save-antiidle" style="padding:12px 32px; font-size:15px;" onclick="adminSaveAntiIdleRules()">儲存全部改動</button>
        </div>
      `;
    }
    window.renderAdminAntiIdleTab = renderAdminAntiIdleTab;

    window.adminUpdateAntiIdleDraft = function(key, value) {
      if (!adminAntiIdleDraft) return;
      const n = parseInt(value, 10);
      adminAntiIdleDraft[key] = (Number.isFinite(n) && n > 0) ? n : adminAntiIdleDraft[key];
    };

    window.adminSaveAntiIdleRules = async function() {
      if (!adminAntiIdleDraft) return;
      const d = adminAntiIdleDraft;
      const allValid = ANTI_IDLE_FIELDS.every(f => d[f.key] > 0);
      if (!allValid) {
        window.showToast('所有數值都要大於 0', '⚠️');
        return;
      }
      const payload = {
        presenceCheckIntervalMin: d.presenceCheckIntervalMin,
        presenceResponseMin: d.presenceResponseMin,
        micOpenLimitMin: d.micOpenLimitMin,
        micCooldownMin: d.micCooldownMin,
        micIdleResetMin: d.micIdleResetMin,
        updatedAt: Date.now(),
        updatedBy: window.currentUser ? window.currentUser.email : null
      };
      const btn = document.getElementById('btn-admin-save-antiidle');
      if (btn) { btn.disabled = true; btn.innerText = '儲存中…'; }
      try {
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'antiIdleRules'), payload);
        window.showToast('防掛機參數已儲存，即時對所有用戶生效（已在房內的學生要下次入房或開啟麥克風後才會套用新數值）！', '🎉');
      } catch (err) {
        window.showToast('儲存失敗：' + (err.message || err), '❌');
      } finally {
        if (btn) { btn.disabled = false; btn.innerText = '儲存全部改動'; }
      }
    };

    let antiIdleConfigUnsubscribe = null;
    function loadAntiIdleRulesFromFirestore() {
      if (!window.db || !window.fs) return;
      if (antiIdleConfigUnsubscribe) antiIdleConfigUnsubscribe();
      const ref = window.fs.doc(window.db, 'admin_config', 'antiIdleRules');
      antiIdleConfigUnsubscribe = window.fs.onSnapshot(ref, (snap) => {
        if (snap.exists() && typeof window.applyAntiIdleRules === 'function') {
          window.applyAntiIdleRules(snap.data());
        }
        antiIdleConfigLoaded = true;
        if (adminTabShowing('antiidle') && !adminAntiIdleDraft) {
          const adminPanelEl = document.getElementById('admin-panel-container');
          if (adminPanelEl && adminPanelEl.style.display !== 'none') {
            renderAdminAntiIdleTab();
          }
        }
      }, (err) => {
        console.error('讀取防掛機參數設定失敗:', err);
        antiIdleConfigLoaded = true;
        if (typeof window.isCurrentUserAdmin === 'function' && window.isCurrentUserAdmin()) {
          window.showToast('讀取防掛機參數設定失敗（可能是 Firestore 規則未生效）：' + (err.message || err), '⚠️');
        }
      });
    }
    window.loadAntiIdleRulesFromFirestore = loadAntiIdleRulesFromFirestore;

    // ---------- 數據總覽 Dashboard ----------
    // 第三階段（運營工具）第一項：畀Alvis一入Admin後台就即刻見到成個
    // 平台嘅關鍵數字，唔使逐個分頁揭嚟揭去自己數。
    //
    // 做法同其他分頁唔同：唔用 onSnapshot 持續監聽（用戶／房間呢兩個
    // collection 會隨平台成長越嚟越大，持續監聽成個dashboard會一直
    // 掛住唔少實時流量），而係用 getDocs／getCountFromServer 做「一次
    // 性讀取」，撳「重新整理」先再讀多次——對一個總覽畫面嚟講，數字
    // 唔使去到秒秒都即時更新，呢種做法對 Firestore 讀取量更溫和。
    // 「待處理舉報」「待審批導師申請」用 getCountFromServer 直接喺伺服
    // 器端計數，唔使下載晒成批文件，比較慳。
    // v1.200.0：為所有現有用戶補建 publicProfiles（其他用戶睇資料卡用）。
    window.adminBackfillPublicProfiles = async function(btn) {
      if (!(await window.appConfirm('確定要為所有用戶同步公開資料卡？用戶較多時可能需要一至兩分鐘。'))) return;
      const original = btn ? btn.innerText : '';
      if (btn) { btn.disabled = true; btn.innerText = '同步中…'; }
      try {
        const result = await window.callCloudFunction('backfillPublicProfiles', {});
        window.showToast(`已同步 ${result && result.count != null ? result.count : 0} 位用戶的公開資料`, '✅');
      } catch (e) {
        window.showToast('同步失敗：' + (e.message || e), '❌');
      } finally {
        if (btn) { btn.disabled = false; btn.innerText = original; }
      }
    };

    let adminDashboardStats = null;
    let adminDashboardLoading = false;
    let adminDashboardLoadedAt = null;

    async function loadAdminDashboardStats() {
      if (!window.db || !window.fs) return;
      adminDashboardLoading = true;
      renderAdminDashboardTab();
      try {
        const [usersSnap, roomsSnap, reportsCountSnap, tutorsCountSnap] = await Promise.all([
          window.fs.getDocs(window.fs.collection(window.db, 'users')),
          window.fs.getDocs(window.fs.collection(window.db, 'rooms')),
          window.fs.getCountFromServer(window.fs.query(window.fs.collection(window.db, 'reports'), window.fs.where('status', '==', 'pending'))),
          window.fs.getCountFromServer(window.fs.query(window.fs.collection(window.db, 'tutorApplications'), window.fs.where('status', '==', 'pending')))
        ]);

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayStartMs = todayStart.getTime();
        const weekAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;

        let totalUsers = 0, newToday = 0, newThisWeek = 0, activeToday = 0;
        let suspendedCount = 0, tutorCount = 0, totalPoints = 0, totalHours = 0;

        usersSnap.forEach(docSnap => {
          const u = docSnap.data();
          totalUsers++;
          // createdAt／lastLoginAt 喺唔同時期寫入嘅帳號可能係數字（ms
          // 時間戳）或者 ISO字串，new Date() 兩種都食得，跟返其他分頁
          // （例如「房間管理」）一致嘅寬容寫法
          const createdMs = typeof u.createdAt === 'number' ? u.createdAt : (u.createdAt ? new Date(u.createdAt).getTime() : 0);
          if (createdMs >= todayStartMs) newToday++;
          if (createdMs >= weekAgoMs) newThisWeek++;
          const lastLoginMs = typeof u.lastLoginAt === 'number' ? u.lastLoginAt : (u.lastLoginAt ? new Date(u.lastLoginAt).getTime() : 0);
          if (lastLoginMs >= todayStartMs) activeToday++;
          if (u.suspended) suspendedCount++;
          if (u.accountType === 'tutor') tutorCount++;
          totalPoints += parseFloat(u.points) || 0;
          totalHours += parseFloat(u.hours) || 0;
        });

        adminDashboardStats = {
          totalUsers, newToday, newThisWeek, activeToday, suspendedCount, tutorCount,
          totalPoints: Math.round(totalPoints),
          totalHours: Math.round(totalHours * 10) / 10,
          roomCount: roomsSnap.size,
          pendingReports: reportsCountSnap.data().count,
          pendingTutorApps: tutorsCountSnap.data().count
        };
      } catch (err) {
        console.error('載入數據總覽失敗:', err);
        adminDashboardStats = { error: err.message || String(err) };
      } finally {
        adminDashboardLoading = false;
        adminDashboardLoadedAt = Date.now();
        renderAdminDashboardTab();
      }
    }
    window.loadAdminDashboardStats = loadAdminDashboardStats;
    window.adminRefreshDashboard = function() { loadAdminDashboardStats(); };

    function renderAdminDashboardTab() {
      const container = document.getElementById('admin-tab-dashboard');
      if (!container) return;

      if (!adminDashboardStats && !adminDashboardLoading) {
        loadAdminDashboardStats();
        return;
      }
      if (adminDashboardLoading && !adminDashboardStats) {
        container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">載入中數據總覽...</p>';
        return;
      }
      if (adminDashboardStats && adminDashboardStats.error) {
        container.innerHTML = `<div class="admin-card" style="color:#c0392b;">載入失敗：${escapeHtml(adminDashboardStats.error)}</div>`;
        return;
      }

      const s = adminDashboardStats;
      const lastUpdateText = adminDashboardLoadedAt ? new Date(adminDashboardLoadedAt).toLocaleString('zh-HK') : '—';
      const refreshingNow = adminDashboardLoading;

      const cards = [
        { label: '總註冊用戶', value: s.totalUsers },
        { label: '今日新註冊', value: s.newToday },
        { label: '本週新註冊', value: s.newThisWeek },
        { label: '今日活躍用戶（有登入）', value: s.activeToday },
        { label: '目前溫習房間數', value: s.roomCount },
        { label: '現存總 PTS（已扣除兌換）', value: s.totalPoints.toLocaleString('zh-HK') },
        { label: '累積總溫習時數', value: s.totalHours.toLocaleString('zh-HK') + ' 小時' },
        { label: '導師帳戶數', value: s.tutorCount },
        { label: '停權帳戶數', value: s.suspendedCount },
        { label: '待處理舉報', value: s.pendingReports },
        { label: '待審批導師申請', value: s.pendingTutorApps }
      ];

      container.innerHTML = `
        <div class="admin-card" style="margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <p style="font-size:13px; color:#888; margin:0;">數據截至：${lastUpdateText}（讀取當刻的快照，不會自動更新；如需最新數字，請點擊右邊的按鈕）</p>
          <button type="button" class="btn btn-outline" style="font-size:13px; padding:6px 14px;" ${refreshingNow ? 'disabled' : ''} onclick="window.adminRefreshDashboard()">${refreshingNow ? '更新中…' : '重新整理'}</button>
          <button type="button" class="btn btn-outline" style="font-size:13px; padding:6px 14px;" onclick="window.adminBackfillPublicProfiles(this)" title="為所有用戶建立／更新公開資料卡（用戶名、頭像、學校等）。系統更新後執行一次即可，重複執行亦無影響。">同步公開資料</button>
        </div>
        <div class="admin-stat-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:14px;">
          ${cards.map(c => `
            <div class="admin-card admin-stat-tile">
              <div class="admin-stat-num">${c.value}</div>
              <div class="admin-stat-label">${c.label}</div>
            </div>
          `).join('')}
        </div>
      `;
    }
    window.renderAdminDashboardTab = renderAdminDashboardTab;

    // ---------- 全站公告橫幅 ----------
    // 第三階段（運營工具）第二項：Admin後台可以隨時開關／編輯一則顯示
    // 喺成個網站最頂嘅公告橫幅（例如「今晚12點系統維護」「XX活動開
    // 跑喇」），**登入前Landing page同登入後主應用都會見到**，同
    // 「Landing page文案」一樣，存喺Firestore（admin_config/announcement
    // 文件），要額外開放俾未登入用戶讀取（見firestore.rules）。
    //
    // 三種語言分開輸入（同Landing page文案呢度做法一致），顯示嗰陣跟
    // 訪客而家揀緊嗰種語言。訪客撳橫幅嗰粒 ✕ 可以收埋，記喺呢部裝置
    // 嘅localStorage——下次改咗公告內容（即係updatedAt變咗）先會再
    // 跳出嚟，改返同一個內容唔會死纏爛打逼訪客睇。
    let adminAnnouncementDraft = null;
    let announcementConfigLoaded = false;

    function renderAdminAnnouncementTab() {
      const container = document.getElementById('admin-tab-announcement');
      if (!container) return;

      if (!adminAnnouncementDraft) {
        if (!announcementConfigLoaded) {
          container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">載入中全站公告設定...</p>';
          return; // Firestore 資料一到，loadSiteAnnouncementFromFirestore() 會自動再 render 多次
        }
        const a = window.SITE_ANNOUNCEMENT_RAW || {};
        adminAnnouncementDraft = {
          enabled: !!a.enabled,
          type: ['info', 'warning', 'urgent'].includes(a.type) ? a.type : 'info',
          message: {
            'zh-Hant': (a.message && a.message['zh-Hant']) || '',
            'en': (a.message && a.message['en']) || '',
            'yue': (a.message && a.message['yue']) || ''
          }
        };
      }

      const d = adminAnnouncementDraft;
      const typeOptions = [
        { v: 'info', label: '📘 一般資訊（藍色）' },
        { v: 'warning', label: '📙 注意事項（橙黃色）' },
        { v: 'urgent', label: '📕 緊急／重要（紅色）' }
      ];

      container.innerHTML = `
        <div class="admin-card">
          <h3 style="font-size:16px; font-weight:bold; color:var(--brand-800); margin-bottom:14px;">全站公告橫幅</h3>
          <p style="font-size:13px; color:#888; margin-bottom:16px;">顯示於整個網站最頂部（登入前首頁及登入後主應用均會看到）。訪客可以點擊關閉，關閉後除非公告文字有所修改，否則不會再次顯示。</p>
          <label style="display:flex; align-items:center; gap:8px; font-size:14px; margin-bottom:18px; cursor:pointer;">
            <input type="checkbox" ${d.enabled ? 'checked' : ''} onchange="adminUpdateAnnouncementDraft('enabled', this.checked)"> 開啟公告橫幅
          </label>
          <div style="margin-bottom:18px;">
            <label style="font-size:13px; font-weight:bold; color:var(--brand-700); display:block; margin-bottom:6px;">顏色／緊急程度</label>
            <select style="width:220px; font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px;" onchange="adminUpdateAnnouncementDraft('type', this.value)">
              ${typeOptions.map(o => `<option value="${o.v}" ${d.type === o.v ? 'selected' : ''}>${o.label}</option>`).join('')}
            </select>
          </div>
          <div style="margin-bottom:14px;">
            <label style="font-size:13px; font-weight:bold; color:var(--brand-700); display:block; margin-bottom:6px;">公告內容（繁體中文）</label>
            <textarea rows="2" style="width:100%; max-width:560px; font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px; font-family:inherit;" oninput="adminUpdateAnnouncementMessage('zh-Hant', this.value)">${escapeHtml(d.message['zh-Hant'])}</textarea>
          </div>
          <div style="margin-bottom:14px;">
            <label style="font-size:13px; font-weight:bold; color:var(--brand-700); display:block; margin-bottom:6px;">公告內容（English）</label>
            <textarea rows="2" style="width:100%; max-width:560px; font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px; font-family:inherit;" oninput="adminUpdateAnnouncementMessage('en', this.value)">${escapeHtml(d.message['en'])}</textarea>
          </div>
          <div>
            <label style="font-size:13px; font-weight:bold; color:var(--brand-700); display:block; margin-bottom:6px;">公告內容（廣東話）</label>
            <textarea rows="2" style="width:100%; max-width:560px; font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px; font-family:inherit;" oninput="adminUpdateAnnouncementMessage('yue', this.value)">${escapeHtml(d.message['yue'])}</textarea>
          </div>
          <p style="font-size:13px; color:#999; margin-top:6px;">如某種語言留空，選擇該語言的訪客會自動顯示繁體中文版本。</p>
        </div>
        <div style="text-align:center; margin-top:16px;">
          <button type="button" class="btn btn-primary" id="btn-admin-save-announcement" style="padding:12px 32px; font-size:15px;" onclick="adminSaveAnnouncement()">儲存全部改動</button>
        </div>
      `;
    }
    window.renderAdminAnnouncementTab = renderAdminAnnouncementTab;

    window.adminUpdateAnnouncementDraft = function(key, value) {
      if (!adminAnnouncementDraft) return;
      adminAnnouncementDraft[key] = value;
    };

    window.adminUpdateAnnouncementMessage = function(lang, value) {
      if (!adminAnnouncementDraft) return;
      adminAnnouncementDraft.message[lang] = value;
    };

    window.adminSaveAnnouncement = async function() {
      if (!adminAnnouncementDraft) return;
      const d = adminAnnouncementDraft;
      if (d.enabled && !d.message['zh-Hant'].trim()) {
        window.showToast('開啟公告橫幅之前，最少要填寫繁體中文版本的內容', '⚠️');
        return;
      }
      const payload = {
        enabled: d.enabled,
        type: d.type,
        message: {
          'zh-Hant': d.message['zh-Hant'].trim(),
          'en': d.message['en'].trim(),
          'yue': d.message['yue'].trim()
        },
        updatedAt: Date.now(),
        updatedBy: window.currentUser ? window.currentUser.email : null
      };
      const btn = document.getElementById('btn-admin-save-announcement');
      if (btn) { btn.disabled = true; btn.innerText = '儲存中…'; }
      try {
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'announcement'), payload);
        window.showToast('全站公告已儲存，即時對所有訪客生效！', '🎉');
      } catch (err) {
        window.showToast('儲存失敗：' + (err.message || err), '❌');
      } finally {
        if (btn) { btn.disabled = false; btn.innerText = '儲存全部改動'; }
      }
    };

    let announcementConfigUnsubscribe = null;
    function loadSiteAnnouncementFromFirestore() {
      if (!window.db || !window.fs) return;
      if (announcementConfigUnsubscribe) announcementConfigUnsubscribe();
      const ref = window.fs.doc(window.db, 'admin_config', 'announcement');
      announcementConfigUnsubscribe = window.fs.onSnapshot(ref, (snap) => {
        const data = snap.exists() ? snap.data() : null;
        window.SITE_ANNOUNCEMENT_RAW = data;
        renderSiteAnnouncementBanner(data);
        announcementConfigLoaded = true;
        if (adminTabShowing('announcement') && !adminAnnouncementDraft) {
          const adminPanelEl = document.getElementById('admin-panel-container');
          if (adminPanelEl && adminPanelEl.style.display !== 'none') {
            renderAdminAnnouncementTab();
          }
        }
      }, (err) => {
        console.error('讀取全站公告設定失敗:', err);
        announcementConfigLoaded = true;
      });
    }
    window.loadSiteAnnouncementFromFirestore = loadSiteAnnouncementFromFirestore;

    const SITE_ANNOUNCEMENT_DISMISS_KEY = 'concenmate_announcement_dismissed_at';

    // 將Firestore讀到嘅公告設定，實際畫落頁面最頂嘅橫幅。冇開啟、或者
    // 訪客之前已經撳過 ✕ 收埋咗「同一個版本」（updatedAt冇變）嘅話就
    // 唔顯示。
    function renderSiteAnnouncementBanner(data) {
      const banner = document.getElementById('site-announcement-banner');
      const textEl = document.getElementById('site-announcement-text');
      if (!banner || !textEl) return;

      if (!data || !data.enabled) {
        banner.style.display = 'none';
        return;
      }

      let dismissedAt = null;
      try { dismissedAt = localStorage.getItem(SITE_ANNOUNCEMENT_DISMISS_KEY); } catch (e) { /* 私隱模式等場合讀唔到，忽略 */ }
      if (dismissedAt && String(data.updatedAt) === dismissedAt) {
        banner.style.display = 'none';
        return;
      }

      const lang = (typeof window.getAppLanguage === 'function') ? window.getAppLanguage() : 'zh-Hant';
      const msgObj = data.message || {};
      const text = (msgObj[lang] && msgObj[lang].trim()) || (msgObj['zh-Hant'] && msgObj['zh-Hant'].trim()) || '';
      if (!text) {
        banner.style.display = 'none';
        return;
      }

      textEl.innerText = text;
      banner.className = 'type-' + (['info', 'warning', 'urgent'].includes(data.type) ? data.type : 'info');
      banner.style.display = 'block';
    }
    window.renderSiteAnnouncementBanner = renderSiteAnnouncementBanner;

    window.dismissSiteAnnouncement = function() {
      const banner = document.getElementById('site-announcement-banner');
      if (banner) banner.style.display = 'none';
      try {
        const data = window.SITE_ANNOUNCEMENT_RAW;
        if (data && typeof data.updatedAt !== 'undefined') {
          localStorage.setItem(SITE_ANNOUNCEMENT_DISMISS_KEY, String(data.updatedAt));
        }
      } catch (e) { /* 私隱模式等場合寫唔到，忽略——今次單純收埋返，下次重新整理可能又會跳返出嚟 */ }
    };

    // 切換語言之後，公告橫幅嘅文字都要跟住切返（唔使等下次Firestore
    // 有更新先變語言）
    window.refreshSiteAnnouncementLanguage = function() {
      if (typeof window.SITE_ANNOUNCEMENT_RAW !== 'undefined') {
        renderSiteAnnouncementBanner(window.SITE_ANNOUNCEMENT_RAW);
      }
    };

    // ---------- 用戶支援工具 ----------
    // 第三階段（運營工具）最後一項：處理學生／家長support ticket嘅
    // 快捷工具——搜尋單一用戶、睇晒佢嘅關鍵資料，再直接喺呢度補發／
    // 扣減PTS、補發貼紙，唔使好似「用戶管理」分頁咁要喺一大張表格度
    // 揾（嗰頁仍然保留，做日常批量管理用；呢個分頁專門做「一個一個
    // 咁處理個別support個案」嘅場景）。
    //
    // 做法同「數據總覽」一樣：一次性讀取（唔持續監聽），撳「重新整理
    // 資料」先再讀多次；搜尋喺本機（瀏覽器）記憶體入面做，唔使每打
    // 一個字都問一次 Firestore。
    let adminSupportUsersCache = null;
    let adminSupportUsersCacheLoading = false;
    let adminSupportQuery = '';
    let adminSupportSelectedUid = null;
    let adminSupportPointsGrantAmount = 0;
    let adminSupportStickerGrantDraft = { stickerId: null, qty: 1 };

    async function loadAdminSupportUsersCache() {
      if (!window.db || !window.fs) return;
      // v1.229.3：「全部用戶」表格已在即時監聽 users，直接沿用，不重複讀取
      if (adminUsersLastSortedDocs) {
        mergeIntoSupportCache(adminUsersLastSortedDocs);
        renderAdminSupportTab();
        return;
      }
      if (adminTabShowing('users')) { adminSupportUsersCacheLoading = true; return; }
      adminSupportUsersCacheLoading = true;
      renderAdminSupportTab();
      try {
        const snap = await window.fs.getDocs(window.fs.collection(window.db, 'users'));
        adminSupportUsersCache = snap.docs.map(d => ({ uid: d.id, data: d.data() }));
      } catch (err) {
        console.error('載入用戶支援資料失敗:', err);
        adminSupportUsersCache = [];
      } finally {
        adminSupportUsersCacheLoading = false;
        renderAdminSupportTab();
      }
    }
    window.adminRefreshSupportUsers = function() { loadAdminSupportUsersCache(); };

    function renderSupportUserDetailCard(u) {
      const d = u.data;
      const uid = u.uid;
      const suspended = window.isSuspendedNow ? window.isSuspendedNow(d) : !!d.suspended;
      const displayEmail = d.contactEmail || d.email || '—';
      const createdMs = typeof d.createdAt === 'number' ? d.createdAt : (d.createdAt ? new Date(d.createdAt).getTime() : 0);
      const createdDisplay = createdMs ? new Date(createdMs).toLocaleString('zh-HK') : '—';
      const lastLoginDisplay = (typeof formatLastLoginDisplay === 'function') ? formatLastLoginDisplay(d.lastLoginAt) : '—';

      const stickerOptions = GACHA_STICKERS.map(s => `<option value="${s.id}" ${adminSupportStickerGrantDraft.stickerId === s.id ? 'selected' : ''}>${escapeHtml(s.name)}（#${s.id}）</option>`).join('');

      return `
        <div class="admin-card">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
            <h3 style="font-size:17px; font-weight:bold; color:var(--brand-800); margin:0;">${escapeHtml(d.username || '—')}${suspensionLabelHtml(d)}</h3>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              ${d.strikeCount > 0 ? `<button type="button" class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="adminResetStrikes('${uid}')">重設違規次數</button>` : ''}
              <button type="button" class="btn ${suspended ? 'btn-primary' : 'btn-red'}" style="font-size:13px; padding:4px 10px;" onclick="adminToggleSuspendUser('${uid}', ${!suspended})">${suspended ? '解除停權' : '永久停權'}</button>
            </div>
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:10px; font-size:13px; color:#555; margin-bottom:18px;">
            <div><b>帳號ID：</b>${escapeHtml(d.loginId || '未設定')}</div>
            <div><b>合資格溫習日數：</b>${typeof d.qualifiedDays === 'number' ? d.qualifiedDays + ' 日' : '未開始記錄'}</div>
            <div><b>Email：</b>${escapeHtml(displayEmail)}</div>
            <div><b>學校：</b>${escapeHtml(d.school || '—')}</div>
            <div><b>年級：</b>${escapeHtml(d.grade || '—')}</div>
            <div><b>身份：</b>${d.accountType === 'tutor' ? '導師' : '學生'}</div>
            <div><b>學校電郵：</b>${d.schoolEmailStatus === 'verified' && !d.schoolEmail ? '已驗證（管理員代設）' : d.schoolEmail ? escapeHtml(d.schoolEmail) + '（' + ({ verified: '已驗證', pendingDomain: '待審批學校', rejected: '已拒絕', revoked: '已取消' }[d.schoolEmailStatus] || '—') + '）' : '未驗證'}</div>
            <div><b>本學年已確認學歷：</b>${typeof d.educationConfirmedYear === 'number' ? d.educationConfirmedYear + '/' + String(d.educationConfirmedYear + 1).slice(-2) : '未確認'}</div>
            <div><b>出生年月：</b>${d.birthYear ? escapeHtml(String(d.birthYear)) + ' 年' + (d.birthMonth ? ' ' + escapeHtml(String(d.birthMonth)) + ' 月' : '') : '未填寫'}</div>
            <div><b>現存 PTS：</b>${d.points || 0}</div>
            <div><b>累積時數：</b>${(parseFloat(d.hours) || 0).toFixed(1)}</div>
            <div><b>EXP：</b>${d.exp || 0}</div>
            <div><b>註冊時間：</b>${createdDisplay}</div>
            <div><b>最後上線：</b>${lastLoginDisplay}</div>
          </div>

          <div style="border-top:1px solid #F0F0F0; padding-top:14px; margin-bottom:14px;">
            <h4 style="font-size:14px; font-weight:bold; color:var(--brand-700); margin-bottom:8px;">補發／扣減 PTS</h4>
            <p style="font-size:13px; color:#999; margin-bottom:8px;">正數為補發，負數為扣減（例如處理爭議或錯誤發放）。</p>
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
              <input type="number" step="1" value="${adminSupportPointsGrantAmount}" style="width:120px; font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px;" oninput="adminUpdateSupportPointsAmount(this.value)">
              <button type="button" class="btn btn-primary" style="font-size:13px; padding:6px 16px;" onclick="adminGrantSupportPoints('${uid}')">確認</button>
            </div>
          </div>

          <div style="border-top:1px solid #F0F0F0; padding-top:14px; margin-bottom:14px;">
            <h4 style="font-size:14px; font-weight:bold; color:var(--brand-700); margin-bottom:8px;">學校電郵驗證（管理員代為處理）</h4>
            <p style="font-size:13px; color:#999; margin-bottom:8px;">只用於測試，或已用其他方式核實學生身份的特殊個案。中學生帳戶仍須同時符合：學歷為中學生、未滿 20 歲、已確認本學年學歷。</p>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              ${d.schoolEmailStatus === 'verified'
                ? `<button type="button" class="btn btn-outline" style="font-size:13px; padding:6px 16px;" onclick="adminSetSchoolVerified('${uid}', false)">取消學校電郵驗證</button>`
                : `<button type="button" class="btn btn-primary" style="font-size:13px; padding:6px 16px;" onclick="adminSetSchoolVerified('${uid}', true)">設為已驗證</button>`}
            </div>
          </div>

          <div style="border-top:1px solid #F0F0F0; padding-top:14px; margin-bottom:14px;">
            <h4 style="font-size:14px; font-weight:bold; color:var(--brand-700); margin-bottom:8px;">更正出生年月</h4>
            <p style="font-size:13px; color:#999; margin-bottom:8px;">用戶不能自行修改出生年月；如用戶電郵要求補填或更正，請先核實後在此修改。直播的最低開播年齡以此計算。</p>
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
              <input id="admin-birth-year-${uid}" type="number" min="1930" max="${new Date().getFullYear()}" step="1" placeholder="年份" value="${d.birthYear || ''}" style="width:110px; font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px;"> 年
              <input id="admin-birth-month-${uid}" type="number" min="1" max="12" step="1" placeholder="月份" value="${d.birthMonth || ''}" style="width:80px; font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px;"> 月
              <button type="button" class="btn btn-primary" style="font-size:13px; padding:6px 16px;" onclick="adminSetBirthDate('${uid}')">儲存</button>
            </div>
          </div>

          <div style="border-top:1px solid #F0F0F0; padding-top:14px;">
            <h4 style="font-size:14px; font-weight:bold; color:var(--brand-700); margin-bottom:8px;">補發貼紙</h4>
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
              <select style="font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px; max-width:240px;" onchange="adminUpdateSupportStickerDraft('stickerId', this.value)">${stickerOptions}</select>
              <input type="number" min="1" step="1" value="${adminSupportStickerGrantDraft.qty}" style="width:90px; font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px;" oninput="adminUpdateSupportStickerDraft('qty', this.value)">
              <button type="button" class="btn btn-primary" style="font-size:13px; padding:6px 16px;" onclick="adminGrantSupportSticker('${uid}')">確認</button>
            </div>
          </div>
        </div>
      `;
    }

    function renderAdminSupportTab() {
      const container = document.getElementById('admin-tab-support');
      if (!container) return;

      if (!adminSupportUsersCache && !adminSupportUsersCacheLoading) {
        loadAdminSupportUsersCache();
        return;
      }
      if (adminSupportUsersCacheLoading && !adminSupportUsersCache) {
        container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">載入中用戶資料...</p>';
        return;
      }

      const q = adminSupportQuery.trim().toLowerCase();
      const matches = q ? (adminSupportSearchResults || []) : [];

      const selected = adminSupportSelectedUid ? adminSupportUsersCache.find(u => u.uid === adminSupportSelectedUid) : null;

      container.innerHTML = `
        <div class="admin-card" style="margin-bottom:16px;">
          <h3 style="font-size:16px; font-weight:bold; color:var(--brand-800); margin-bottom:10px;">搜尋用戶</h3>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <form style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;" onsubmit="event.preventDefault(); adminUpdateSupportQuery(document.getElementById('admin-support-q').value);">
            <input id="admin-support-q" type="search" enterkeyhint="search" placeholder="輸入帳號 ID／用戶名／電郵（開頭相符即可）" value="${escapeHtml(adminSupportQuery)}" style="flex:1; min-width:220px; font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px;">
            <button type="submit" class="btn btn-primary" style="font-size:14px; padding:7px 18px;">搜尋</button>
          </form>
          <p style="font-size:13px; color:#999; margin-top:8px;">輸入帳號 ID、用戶名或電郵的開頭（或完整 UID），然後按「搜尋」或 Enter。</p>
          ${q ? `
            <div style="margin-top:12px; max-height:260px; overflow-y:auto;">
              ${matches.length === 0 ? '<p style="color:#999; font-size:13px;">找不到相關用戶</p>' : matches.map(u => `
                <div style="padding:8px 10px; border-bottom:1px solid #F0F0F0; cursor:pointer; ${adminSupportSelectedUid === u.uid ? 'background:var(--brand-50);' : ''}" onclick="adminSelectSupportUser('${u.uid}')">
                  <b>${escapeHtml(u.data.username || '—')}</b>
                  <span style="color:#888; font-size:13px;"> ／ ${escapeHtml(u.data.loginId || '未設定')} ／ ${escapeHtml(u.data.contactEmail || u.data.email || '—')}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
        ${selected ? renderSupportUserDetailCard(selected) : ''}
      `;
    }
    window.renderAdminSupportTab = renderAdminSupportTab;

    // v1.230.0：搜尋改為向伺服器查詢（帳號 ID／用戶名／電郵開頭相符），唔使預先載入全部用戶
    let adminSupportSearchResults = [];
    window.adminUpdateSupportQuery = async function(value) {
      adminSupportQuery = value;
      const raw = String(value || '').trim();
      if (!raw) { adminSupportSearchResults = []; renderAdminSupportTab(); return; }
      const col = window.fs.collection(window.db, 'users');
      const variants = Array.from(new Set([raw, raw.toLowerCase()]));
      const fields = ['loginId', 'username', 'contactEmail'];
      const tasks = [];
      fields.forEach(f => variants.forEach(v => tasks.push(
        window.fs.getDocs(window.fs.query(col, window.fs.where(f, '>=', v), window.fs.where(f, '<=', v + '\uf8ff'), window.fs.limit(10))).catch(() => null)
      )));
      tasks.push(window.fs.getDoc(window.fs.doc(window.db, 'users', raw)).catch(() => null));
      const results = await Promise.all(tasks);
      const seen = new Map();
      results.forEach(r => {
        if (!r) return;
        const docs = r.docs ? r.docs : (r.exists && r.exists() ? [r] : []);
        docs.forEach(d => seen.set(d.id, d));
      });
      const docs = Array.from(seen.values());
      mergeIntoSupportCache(docs);
      adminSupportSearchResults = docs.map(d => ({ uid: d.id, data: d.data() })).slice(0, 20);
      renderAdminSupportTab();
    };

    window.adminSelectSupportUser = function(uid, scroll) {
      adminSupportSelectedUid = uid;
      adminSupportPointsGrantAmount = 0;
      adminSupportStickerGrantDraft = { stickerId: (GACHA_STICKERS[0] && GACHA_STICKERS[0].id) || null, qty: 1 };
      renderAdminSupportTab();
      if (scroll) { const p = document.getElementById('admin-tab-support'); if (p) p.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    };

    window.adminUpdateSupportPointsAmount = function(value) {
      const n = parseInt(value, 10);
      adminSupportPointsGrantAmount = Number.isFinite(n) ? n : 0;
    };

    // v1.228.4：管理員代用戶補填／更正出生年月（用戶自己改不到，見 firestore.rules selfUserUpdateOk）
    // v1.229.2：管理員代為設定學校電郵驗證（測試或特殊個案）
    window.adminSetSchoolVerified = async function(uid, on) {
      if (!(await window.appConfirm(on ? '確定將這位用戶的學校電郵設為已驗證？請確認已用其他方式核實其中學生身份。' : '確定取消這位用戶的學校電郵驗證？對方將不能再進入中學生溫習室。'))) return;
      try {
        const upd = on
          ? { schoolEmailStatus: 'verified', schoolEmailVerifiedAt: Date.now(), schoolEmailManualBy: (window.currentUser && window.currentUser.loginId) || null }
          : { schoolEmailStatus: 'revoked' };
        await window.fs.updateDoc(window.fs.doc(window.db, 'users', uid), upd);
        await logAdminAction(on ? '代設學校電郵已驗證' : '取消學校電郵驗證', { uid });
        const cached = adminSupportUsersCache && adminSupportUsersCache.find(u => u.uid === uid);
        if (cached) Object.assign(cached.data, upd);
        window.showToast('已更新', '✅');
        renderAdminSupportTab();
      } catch (err) {
        window.showToast('更新失敗：' + (err.message || err), '❌');
      }
    };

    window.adminSetBirthDate = async function(uid) {
      const y = parseInt((document.getElementById('admin-birth-year-' + uid) || {}).value, 10);
      const m = parseInt((document.getElementById('admin-birth-month-' + uid) || {}).value, 10);
      const thisYear = new Date().getFullYear();
      if (!(y >= 1930 && y <= thisYear) || !(m >= 1 && m <= 12)) { window.showToast('請輸入有效的年份及月份', '⚠️'); return; }
      if (!(await window.appConfirm(`確定將這位用戶的出生年月設為 ${y} 年 ${m} 月？`))) return;
      try {
        await window.fs.updateDoc(window.fs.doc(window.db, 'users', uid), { birthYear: y, birthMonth: m });
        await logAdminAction('更正出生年月', { uid, birthYear: y, birthMonth: m });
        const cached = adminSupportUsersCache && adminSupportUsersCache.find(u => u.uid === uid);
        if (cached) { cached.data.birthYear = y; cached.data.birthMonth = m; }
        window.showToast('已更新出生年月', '✅');
        renderAdminSupportTab();
      } catch (err) {
        window.showToast('更新失敗：' + (err.message || err), '❌');
      }
    };

    window.adminGrantSupportPoints = async function(uid) {
      const amount = adminSupportPointsGrantAmount;
      if (!amount) {
        window.showToast('請輸入不是 0 的數值', '⚠️');
        return;
      }
      if (!(await window.appConfirm(`確定為這位用戶${amount > 0 ? '補發' : '扣減'} ${Math.abs(amount)} PTS？`))) return;
      try {
        await window.fs.updateDoc(window.fs.doc(window.db, 'users', uid), { points: window.fs.increment(amount) });
        await logAdminAction('補發／扣減PTS', { uid, amount });
        window.showToast(`已${amount > 0 ? '補發' : '扣減'} ${Math.abs(amount)} PTS`, '✅');
        adminSupportPointsGrantAmount = 0;
        // 更新返cache入面嗰份本地資料，等卡片即刻反映新數值，唔使成頁
        // 重新載入先至見到最新數字
        const cached = adminSupportUsersCache.find(u => u.uid === uid);
        if (cached) cached.data.points = (cached.data.points || 0) + amount;
        renderAdminSupportTab();
      } catch (err) {
        window.showToast('操作失敗：' + (err.message || err), '❌');
      }
    };

    window.adminUpdateSupportStickerDraft = function(key, value) {
      if (key === 'stickerId') {
        const n = parseInt(value, 10);
        adminSupportStickerGrantDraft.stickerId = Number.isFinite(n) ? n : adminSupportStickerGrantDraft.stickerId;
      } else if (key === 'qty') {
        const n = parseInt(value, 10);
        adminSupportStickerGrantDraft.qty = (Number.isFinite(n) && n > 0) ? n : 1;
      }
    };

    window.adminGrantSupportSticker = async function(uid) {
      const { stickerId, qty } = adminSupportStickerGrantDraft;
      if (!stickerId || !(qty > 0)) {
        window.showToast('請揀返貼紙同數量', '⚠️');
        return;
      }
      const sticker = GACHA_STICKERS.find(s => s.id === stickerId);
      if (!(await window.appConfirm(`確定為這位用戶補發 ${qty} 張「${sticker ? sticker.name : '#' + stickerId}」？`))) return;
      try {
        const payload = {};
        payload['ownedStickers.' + stickerId] = window.fs.increment(qty);
        await window.fs.updateDoc(window.fs.doc(window.db, 'users', uid), payload);
        await logAdminAction('補發貼紙', { uid, stickerId, qty });
        window.showToast(`已補發 ${qty} 張貼紙`, '✅');
        adminSupportStickerGrantDraft.qty = 1;
        renderAdminSupportTab();
      } catch (err) {
        window.showToast('操作失敗：' + (err.message || err), '❌');
      }
    };

    // ---------- 管理員名單（第四階段第9項：管理員權限分級）----------
    // 之前要加／減管理員，一定要去 Firebase Console 手動改
    // admin_config/adminIds 文件（連欄位名都要打啱先得），而家喺Admin
    // 後台開返呢頁俾超級管理員自己管理，仲加埋「權限等級」呢個新概念
    // （見檔案頂部 window.ADMIN_ROLES 嗰段解釋）。
    let adminAdminListDraft = null;
    let adminListConfigLoaded = false;

    async function ensureAdminListLoaded() {
      if (adminListConfigLoaded) return;
      try {
        const snap = await window.fs.getDoc(window.fs.doc(window.db, 'admin_config', 'adminIds'));
        const data = snap.exists() ? snap.data() : {};
        const ids = Array.isArray(data.ids) ? data.ids : [];
        const roles = (data.roles && typeof data.roles === 'object') ? data.roles : {};
        adminAdminListDraft = {
          entries: ids.map(id => ({ loginId: id, role: roles[id] || 'super' })),
          newLoginId: '',
          newRole: 'support'
        };
      } catch (err) {
        console.error('載入管理員名單失敗:', err);
        adminAdminListDraft = { entries: [], newLoginId: '', newRole: 'support' };
      } finally {
        adminListConfigLoaded = true;
        renderAdminAdminListTab();
      }
    }

    function renderAdminAdminListTab() {
      const container = document.getElementById('admin-tab-adminlist');
      if (!container) return;
      if (!isCurrentUserSuperAdmin()) {
        container.innerHTML = '<div class="admin-card" style="color:#c0392b;">只有「超級管理員」可以查看此頁。</div>';
        return;
      }
      if (!adminAdminListDraft) {
        if (!adminListConfigLoaded) {
          container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">載入中管理員名單...</p>';
          ensureAdminListLoaded();
          return;
        }
      }
      const d = adminAdminListDraft;
      const myLoginId = window.currentUser && window.currentUser.loginId;

      const rows = d.entries.map((e, idx) => `
        <tr>
          <td>${escapeHtml(e.loginId)}${e.loginId === myLoginId ? ' <span style="color:#999; font-size:12px;">（你自己）</span>' : ''}</td>
          <td>
            <select style="font-size:14px; padding:5px 8px; border:1px solid #DCE5F4; border-radius:6px;" onchange="adminUpdateAdminListRole(${idx}, this.value)">
              <option value="super" ${e.role === 'super' ? 'selected' : ''}>超級管理員</option>
              <option value="support" ${e.role === 'support' ? 'selected' : ''}>客服／支援管理員</option>
            </select>
          </td>
          <td><button class="btn btn-red" style="font-size:13px; padding:3px 8px;" onclick="adminRemoveAdminListEntry(${idx})">移除</button></td>
        </tr>
      `).join('');

      container.innerHTML = `
        <div class="admin-card" style="margin-bottom:16px;">
          <h3 style="font-size:16px; font-weight:bold; color:var(--brand-800); margin-bottom:10px;">管理員名單</h3>
          <p style="font-size:13px; color:#888; margin-bottom:10px;"><b>超級管理員</b>可以使用全部分頁及設定；<b>客服／支援管理員</b>只會看到日常客服及巡查所需的分頁（數據總覽、用戶管理、舉報處理、導師申請、學校電郵審批、溫習室監察、疑難解答區管理），看不到網站設定（扭蛋機、計分規則等）及這兩個管治分頁。</p>
          <p style="font-size:13px; color:#c17a2e; margin-bottom:14px;">注意：此分級主要是後台介面層面的限制（控制可以看到及點擊哪些分頁），部分設定另有資料庫規則保護，但並非完整的防內部人員保安措施，適合互相信任的小團隊使用。</p>
          <div style="overflow-x:auto;">
            <table class="admin-table">
              <thead><tr><th>帳號ID</th><th>權限等級</th><th></th></tr></thead>
              <tbody>${rows || '<tr><td colspan="3" style="text-align:center; color:#999;">未有任何管理員</td></tr>'}</tbody>
            </table>
          </div>
        </div>
        <div class="admin-card" style="margin-bottom:16px;">
          <h3 style="font-size:15px; font-weight:bold; color:var(--brand-800); margin-bottom:10px;">新增管理員</h3>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            <input type="text" placeholder="帳號 ID（即用戶登入用的 ID，不是電郵）" value="${escapeHtml(d.newLoginId)}" style="flex:1; min-width:220px; font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px;" oninput="adminUpdateAdminListNewField('newLoginId', this.value)">
            <select style="font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px;" onchange="adminUpdateAdminListNewField('newRole', this.value)">
              <option value="super" ${d.newRole === 'super' ? 'selected' : ''}>超級管理員</option>
              <option value="support" ${d.newRole === 'support' ? 'selected' : ''}>客服／支援管理員</option>
            </select>
            <button type="button" class="btn btn-outline" style="font-size:13px; padding:6px 16px;" onclick="adminAddAdminListEntry()">加入</button>
          </div>
        </div>
        <div style="text-align:center;">
          <button type="button" class="btn btn-primary" id="btn-admin-save-adminlist" style="padding:12px 32px; font-size:15px;" onclick="adminSaveAdminList()">儲存全部改動</button>
        </div>
      `;
    }
    window.renderAdminAdminListTab = renderAdminAdminListTab;

    window.adminUpdateAdminListRole = function(idx, role) {
      if (!adminAdminListDraft || !adminAdminListDraft.entries[idx]) return;
      adminAdminListDraft.entries[idx].role = role;
    };

    window.adminRemoveAdminListEntry = async function(idx) {
      if (!adminAdminListDraft || !adminAdminListDraft.entries[idx]) return;
      if (!(await window.appConfirm(`確定要移除「${adminAdminListDraft.entries[idx].loginId}」的管理員身份？`))) return;
      adminAdminListDraft.entries.splice(idx, 1);
      renderAdminAdminListTab();
    };

    window.adminUpdateAdminListNewField = function(key, value) {
      if (!adminAdminListDraft) return;
      adminAdminListDraft[key] = value;
    };

    window.adminAddAdminListEntry = function() {
      if (!adminAdminListDraft) return;
      const loginId = (adminAdminListDraft.newLoginId || '').trim();
      if (!loginId) { window.showToast('請輸入帳號ID', '⚠️'); return; }
      if (adminAdminListDraft.entries.some(e => e.loginId === loginId)) {
        window.showToast('此帳號已在管理員名單內', '⚠️');
        return;
      }
      adminAdminListDraft.entries.push({ loginId, role: adminAdminListDraft.newRole || 'support' });
      adminAdminListDraft.newLoginId = '';
      renderAdminAdminListTab();
    };

    window.adminSaveAdminList = async function() {
      if (!adminAdminListDraft) return;
      const entries = adminAdminListDraft.entries;
      if (entries.length === 0) {
        window.showToast('管理員名單不可以清空，否則將無法再進入管理後台', '⚠️');
        return;
      }
      const superCount = entries.filter(e => e.role === 'super').length;
      if (superCount === 0) {
        window.showToast('最少要有一位「超級管理員」，否則沒有人可以再管理這份名單', '⚠️');
        return;
      }
      const myLoginId = window.currentUser && window.currentUser.loginId;
      const stillAdmin = entries.some(e => e.loginId === myLoginId);
      const stillSuper = entries.some(e => e.loginId === myLoginId && e.role === 'super');
      if (!stillAdmin) {
        if (!(await window.appConfirm('儲存後你將移除自己的管理員身份，並即時無法再進入管理後台。確定要這樣做嗎？'))) return;
      } else if (!stillSuper) {
        if (!(await window.appConfirm('儲存後你將會降為「客服／支援管理員」，並立即無法查看此頁及其他設定分頁。確定要這樣做嗎？'))) return;
      }

      const ids = entries.map(e => e.loginId);
      const roles = {};
      entries.forEach(e => { roles[e.loginId] = e.role; });
      const payload = { ids, roles, updatedAt: Date.now(), updatedBy: window.currentUser ? window.currentUser.email : null };

      const btn = document.getElementById('btn-admin-save-adminlist');
      if (btn) { btn.disabled = true; btn.innerText = '儲存中…'; }
      try {
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'adminIds'), payload);
        await logAdminAction('更新管理員名單', { ids, roles });
        window.showToast('管理員名單已儲存！', '🎉');
        if (typeof window.loadAdminIdsFromFirestore === 'function') window.loadAdminIdsFromFirestore();
      } catch (err) {
        window.showToast('儲存失敗：' + (err.message || err), '❌');
      } finally {
        if (btn) { btn.disabled = false; btn.innerText = '儲存全部改動'; }
      }
    };

    // ---------- 操作紀錄（第四階段第10項：Audit Log）----------
    let adminAuditLogEntries = null;
    let adminAuditLogLoading = false;

    async function loadAdminAuditLog() {
      if (!window.db || !window.fs) return;
      adminAuditLogLoading = true;
      renderAdminAuditLogTab();
      try {
        const q = window.fs.query(
          window.fs.collection(window.db, 'adminAuditLog'),
          window.fs.orderBy('createdAt', 'desc'),
          window.fs.limit(100)
        );
        const snap = await window.fs.getDocs(q);
        adminAuditLogEntries = snap.docs.map(d => d.data());
      } catch (err) {
        console.error('載入操作紀錄失敗:', err);
        adminAuditLogEntries = [];
      } finally {
        adminAuditLogLoading = false;
        renderAdminAuditLogTab();
      }
    }
    window.adminRefreshAuditLog = function() { loadAdminAuditLog(); };

    function renderAdminAuditLogTab() {
      const container = document.getElementById('admin-tab-auditlog');
      if (!container) return;
      if (!isCurrentUserSuperAdmin()) {
        container.innerHTML = '<div class="admin-card" style="color:#c0392b;">只有「超級管理員」可以查看此頁。</div>';
        return;
      }
      if (!adminAuditLogEntries && !adminAuditLogLoading) {
        loadAdminAuditLog();
        return;
      }
      if (adminAuditLogLoading && !adminAuditLogEntries) {
        container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">載入中操作紀錄...</p>';
        return;
      }
      const rows = adminAuditLogEntries.map(e => {
        const when = e.createdAt ? new Date(e.createdAt).toLocaleString('zh-HK') : '—';
        const who = e.adminLoginId || e.adminEmail || '—';
        const detailsText = e.details ? (typeof e.details === 'string' ? e.details : JSON.stringify(e.details)) : '';
        return `<tr><td style="white-space:nowrap;">${when}</td><td>${escapeHtml(who)}</td><td>${escapeHtml(e.action || '—')}</td><td style="font-size:12px; color:#888; max-width:320px; word-break:break-all;">${escapeHtml(detailsText)}</td></tr>`;
      }).join('');

      container.innerHTML = `
        <div class="admin-card" style="margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <p style="font-size:13px; color:#888; margin:0;">顯示最近 ${adminAuditLogEntries.length} 筆重要操作紀錄（停權、補發分數／貼紙、強制關房、導師審批、管理員名單異動等）。清單於打開或重新整理此頁時讀取，如需最新紀錄，請點擊右邊的按鈕。</p>
          <button type="button" class="btn btn-outline" style="font-size:13px; padding:6px 14px;" onclick="window.adminRefreshAuditLog()">重新整理</button>
        </div>
        <div class="admin-card">
          <div style="overflow-x:auto;">
            <table class="admin-table">
              <thead><tr><th>時間</th><th>管理員</th><th>操作</th><th>詳情</th></tr></thead>
              <tbody>${rows || '<tr><td colspan="4" style="text-align:center; color:#999;">暫時未有任何紀錄</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      `;
    }
    window.renderAdminAuditLogTab = renderAdminAuditLogTab;

    // ---------- 科目清單管理（低優先第11項，改用「淨係新增」模式）----------
    // 背景：HKDSE科目清單（window.TUTOR_DSE_SUBJECTS，tutor-panel.js
    // 定義）喺好多地方都用嚟做「篩選用嘅資料值」（qa_posts.subject、
    // buddyPosts.subjects、導師申請嘅subjectsIntended等），如果開放
    // 畀管理員自由改名／刪除，舊資料入面已經用緊舊名嘅紀錄就會即刻
    // 「對唔返」（搵唔到英文翻譯、分組篩選唔到）。所以呢頁淨係開放
    // 「新增」，新科目會追加喺內建清單之後（「其他（自行輸入）」
    // 之前），唔支援改名／刪除。新增嘅科目會即時喺導師「想教嘅科目」
    // 揀選器、教材管理「新增科目」下拉選單出現。
    let subjectListConfigLoaded = false;
    let subjectListConfigUnsubscribe = null;
    let adminNewSubjectName = '';
    let adminNewSubjectNameEn = '';

    function applySubjectListAdditions(data) {
      if (!data || !Array.isArray(data.subjects) || !window.TUTOR_DSE_SUBJECTS) return;
      data.subjects.forEach((s) => {
        if (!s || !s.name) return;
        if (!window.TUTOR_DSE_SUBJECTS.includes(s.name)) {
          const otherIdx = window.TUTOR_DSE_SUBJECTS.indexOf('其他（自行輸入）');
          if (otherIdx >= 0) window.TUTOR_DSE_SUBJECTS.splice(otherIdx, 0, s.name);
          else window.TUTOR_DSE_SUBJECTS.push(s.name);
        }
        if (s.nameEn && window.DSE_SUBJECT_EN_NAMES) window.DSE_SUBJECT_EN_NAMES[s.name] = s.nameEn;
      });
      // 同步加入「建立公開溫習房」彈窗嘅科目下拉選單（index.html嘅
      // #modal-room-subject），呢個select本身係寫死嘅HTML option清單，
      // 冇讀window.TUTOR_DSE_SUBJECTS，所以後台新增科目之前完全搵唔到。
      // 新option插入喺「其他」選項之前，data-subject屬性交畀i18n.js嘅
      // 共用科目翻譯系統處理（同其他內建option做法一致）。
      const roomSubjectSelect = document.getElementById('modal-room-subject');
      if (roomSubjectSelect) {
        data.subjects.forEach((s) => {
          if (!s || !s.name) return;
          const alreadyExists = Array.from(roomSubjectSelect.options).some((opt) => opt.value === s.name);
          if (alreadyExists) return;
          const opt = document.createElement('option');
          opt.value = s.name;
          opt.setAttribute('data-subject', s.name);
          opt.textContent = s.name;
          const otherOpt = Array.from(roomSubjectSelect.options).find((o) => o.getAttribute('data-i18n') === 'room.subjectOther');
          if (otherOpt) roomSubjectSelect.insertBefore(opt, otherOpt);
          else roomSubjectSelect.appendChild(opt);
        });
      }
    }

    function loadSubjectListFromFirestore() {
      if (!window.db || !window.fs) return;
      if (subjectListConfigUnsubscribe) subjectListConfigUnsubscribe();
      const ref = window.fs.doc(window.db, 'admin_config', 'subjectList');
      subjectListConfigUnsubscribe = window.fs.onSnapshot(ref, (snap) => {
        const data = snap.exists() ? snap.data() : null;
        window.ADMIN_SUBJECT_LIST_RAW = data;
        applySubjectListAdditions(data);
        subjectListConfigLoaded = true;
        if (adminTabShowing('subjects')) {
          const panelEl = document.getElementById('admin-panel-container');
          if (panelEl && panelEl.style.display !== 'none') renderAdminSubjectsTab();
        }
      }, (err) => {
        console.error('讀取科目清單失敗:', err);
        subjectListConfigLoaded = true;
      });
    }
    window.loadSubjectListFromFirestore = loadSubjectListFromFirestore;

    function renderAdminSubjectsTab() {
      const container = document.getElementById('admin-tab-subjects');
      if (!container) return;
      if (!isCurrentUserSuperAdmin()) {
        container.innerHTML = '<div class="admin-card" style="color:#c0392b;">只有「超級管理員」可以查看此頁。</div>';
        return;
      }
      if (!subjectListConfigLoaded) {
        container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">載入中科目清單...</p>';
        return;
      }
      const addedNames = new Set(((window.ADMIN_SUBJECT_LIST_RAW && window.ADMIN_SUBJECT_LIST_RAW.subjects) || []).map((s) => s.name));
      const rows = (window.TUTOR_DSE_SUBJECTS || []).filter((s) => s !== '其他（自行輸入）').map((s) => {
        const isAdded = addedNames.has(s);
        const enName = (window.DSE_SUBJECT_EN_NAMES && window.DSE_SUBJECT_EN_NAMES[s]) || '—';
        return `<tr><td>${escapeHtml(s)}</td><td style="color:#888;">${escapeHtml(enName)}</td><td>${isAdded ? '<span style="color:#3F588F;">後台新增</span>' : '<span style="color:#999;">內建</span>'}</td></tr>`;
      }).join('');

      container.innerHTML = `
        <div class="admin-card" style="margin-bottom:16px;">
          <p style="font-size:13px; color:#888; margin:0;">此處顯示全站使用的 HKDSE 科目清單（用於導師「想教的科目」及教材管理「新增科目」）。為免影響已使用這些科目名稱的帖子、房間及導師申請資料，此頁只可以<b>新增</b>科目，不支援改名或刪除；如新增錯誤，請聯絡開發者處理。</p>
        </div>
        <div class="admin-card" style="margin-bottom:16px;">
          <p style="font-size:13px; font-weight:bold; margin-bottom:8px;">➕ 新增科目</p>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end;">
            <div style="flex:1; min-width:160px;">
              <label style="font-size:12px; color:#888; display:block;">科目中文名稱 *</label>
              <input type="text" class="input-field" value="${escapeHtml(adminNewSubjectName)}" oninput="window.adminUpdateNewSubjectField('name', this.value)" placeholder="例如：資訊科技概論">
            </div>
            <div style="flex:1; min-width:160px;">
              <label style="font-size:12px; color:#888; display:block;">科目英文名稱（English顯示用，可留空）</label>
              <input type="text" class="input-field" value="${escapeHtml(adminNewSubjectNameEn)}" oninput="window.adminUpdateNewSubjectField('nameEn', this.value)" placeholder="e.g. Information Technology">
            </div>
            <button type="button" class="btn btn-primary" style="height:38px;" onclick="window.adminAddSubject()">新增</button>
          </div>
        </div>
        <div class="admin-card">
          <div style="overflow-x:auto;">
            <table class="admin-table">
              <thead><tr><th>科目（中文）</th><th>English</th><th>來源</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      `;
    }
    window.renderAdminSubjectsTab = renderAdminSubjectsTab;

    window.adminUpdateNewSubjectField = function(key, value) {
      if (key === 'name') adminNewSubjectName = value;
      else if (key === 'nameEn') adminNewSubjectNameEn = value;
    };

    window.adminAddSubject = async function() {
      const name = (adminNewSubjectName || '').trim();
      const nameEn = (adminNewSubjectNameEn || '').trim();
      if (!name) { window.showToast('請輸入科目中文名稱', '⚠️'); return; }
      if (window.TUTOR_DSE_SUBJECTS && window.TUTOR_DSE_SUBJECTS.includes(name)) {
        window.showToast('此科目已在清單內', '⚠️');
        return;
      }
      try {
        const ref = window.fs.doc(window.db, 'admin_config', 'subjectList');
        const existing = (window.ADMIN_SUBJECT_LIST_RAW && Array.isArray(window.ADMIN_SUBJECT_LIST_RAW.subjects)) ? window.ADMIN_SUBJECT_LIST_RAW.subjects.slice() : [];
        existing.push({ name, nameEn: nameEn || null });
        await window.fs.setDoc(ref, { subjects: existing, updatedAt: Date.now(), updatedBy: (window.currentUser && window.currentUser.loginId) || null });
        await logAdminAction('新增科目', { name, nameEn });
        adminNewSubjectName = '';
        adminNewSubjectNameEn = '';
        window.showToast('已新增科目', '✅');
      } catch (err) {
        window.showToast('新增失敗：' + (err.message || err), '❌');
      }
    };

    // ---------- 地區清單管理（低優先第12項，同科目清單一樣「淨係新增」）----------
    // 背景：香港十八區清單（window.HK_DISTRICT_REGION_GROUPS，app-core.js
    // 定義）用戶註冊表格揀學校地區、分區溫習排行榜都會用到，district
    // 一樣係存做「資料值」（users.district、leaderboardEntries.district），
    // 唔開放改名／刪除，淨係追加新地區落去指定分區（香港島／九龍／
    // 新界）之下。
    let districtListConfigLoaded = false;
    let districtListConfigUnsubscribe = null;
    let adminNewDistrictRegion = '';
    let adminNewDistrictName = '';
    let adminNewDistrictNameEn = '';

    function applyDistrictListAdditions(data) {
      if (!data || !Array.isArray(data.districts) || !window.HK_DISTRICT_REGION_GROUPS) return;
      data.districts.forEach((d) => {
        if (!d || !d.name || !d.region) return;
        let group = window.HK_DISTRICT_REGION_GROUPS.find((g) => g.region === d.region);
        if (!group) {
          group = { region: d.region, districts: [] };
          window.HK_DISTRICT_REGION_GROUPS.push(group);
        }
        if (!group.districts.includes(d.name)) group.districts.push(d.name);
        if (d.nameEn && window.HK_DISTRICT_EN_NAMES) window.HK_DISTRICT_EN_NAMES[d.name] = d.nameEn;
      });
    }

    function loadDistrictListFromFirestore() {
      if (!window.db || !window.fs) return;
      if (districtListConfigUnsubscribe) districtListConfigUnsubscribe();
      const ref = window.fs.doc(window.db, 'admin_config', 'districtList');
      districtListConfigUnsubscribe = window.fs.onSnapshot(ref, (snap) => {
        const data = snap.exists() ? snap.data() : null;
        window.ADMIN_DISTRICT_LIST_RAW = data;
        applyDistrictListAdditions(data);
        districtListConfigLoaded = true;
        if (adminTabShowing('districts')) {
          const panelEl = document.getElementById('admin-panel-container');
          if (panelEl && panelEl.style.display !== 'none') renderAdminDistrictsTab();
        }
      }, (err) => {
        console.error('讀取地區清單失敗:', err);
        districtListConfigLoaded = true;
      });
    }
    window.loadDistrictListFromFirestore = loadDistrictListFromFirestore;

    function renderAdminDistrictsTab() {
      const container = document.getElementById('admin-tab-districts');
      if (!container) return;
      if (!isCurrentUserSuperAdmin()) {
        container.innerHTML = '<div class="admin-card" style="color:#c0392b;">只有「超級管理員」可以查看此頁。</div>';
        return;
      }
      if (!districtListConfigLoaded) {
        container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">載入中地區清單...</p>';
        return;
      }
      const addedNames = new Set(((window.ADMIN_DISTRICT_LIST_RAW && window.ADMIN_DISTRICT_LIST_RAW.districts) || []).map((d) => d.name));
      const groupsHtml = (window.HK_DISTRICT_REGION_GROUPS || []).map((g) => {
        const rows = g.districts.map((d) => {
          const isAdded = addedNames.has(d);
          const enName = (window.HK_DISTRICT_EN_NAMES && window.HK_DISTRICT_EN_NAMES[d]) || '—';
          return `<tr><td>${escapeHtml(d)}</td><td style="color:#888;">${escapeHtml(enName)}</td><td>${isAdded ? '<span style="color:#3F588F;">後台新增</span>' : '<span style="color:#999;">內建</span>'}</td></tr>`;
        }).join('');
        return `<p style="font-size:13px; font-weight:bold; margin:12px 0 6px;">${escapeHtml(g.region)}</p><table class="admin-table"><thead><tr><th>地區</th><th>English</th><th>來源</th></tr></thead><tbody>${rows}</tbody></table>`;
      }).join('');
      const regionOptionsHtml = (window.HK_DISTRICT_REGION_GROUPS || []).map((g) => `<option value="${escapeHtml(g.region)}"></option>`).join('');

      container.innerHTML = `
        <div class="admin-card" style="margin-bottom:16px;">
          <p style="font-size:13px; color:#888; margin:0;">此處顯示全站使用的香港地區清單（用於註冊表格選擇學校地區及分區溫習排行榜）。與科目清單一樣，只可以<b>新增</b>，不支援改名或刪除。</p>
        </div>
        <div class="admin-card" style="margin-bottom:16px;">
          <p style="font-size:13px; font-weight:bold; margin-bottom:8px;">➕ 新增地區</p>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end;">
            <div style="flex:1; min-width:140px;">
              <label style="font-size:12px; color:#888; display:block;">所屬分區 *</label>
              <input type="text" class="input-field" list="admin-district-region-options" value="${escapeHtml(adminNewDistrictRegion)}" oninput="window.adminUpdateNewDistrictField('region', this.value)" placeholder="香港島／九龍／新界">
              <datalist id="admin-district-region-options">${regionOptionsHtml}</datalist>
            </div>
            <div style="flex:1; min-width:140px;">
              <label style="font-size:12px; color:#888; display:block;">地區名稱 *</label>
              <input type="text" class="input-field" value="${escapeHtml(adminNewDistrictName)}" oninput="window.adminUpdateNewDistrictField('name', this.value)" placeholder="例如：將軍澳區">
            </div>
            <div style="flex:1; min-width:140px;">
              <label style="font-size:12px; color:#888; display:block;">地區英文名稱（可留空）</label>
              <input type="text" class="input-field" value="${escapeHtml(adminNewDistrictNameEn)}" oninput="window.adminUpdateNewDistrictField('nameEn', this.value)" placeholder="e.g. Tseung Kwan O">
            </div>
            <button type="button" class="btn btn-primary" style="height:38px;" onclick="window.adminAddDistrict()">新增</button>
          </div>
        </div>
        <div class="admin-card">${groupsHtml}</div>
      `;
    }
    window.renderAdminDistrictsTab = renderAdminDistrictsTab;

    window.adminUpdateNewDistrictField = function(key, value) {
      if (key === 'region') adminNewDistrictRegion = value;
      else if (key === 'name') adminNewDistrictName = value;
      else if (key === 'nameEn') adminNewDistrictNameEn = value;
    };

    window.adminAddDistrict = async function() {
      const region = (adminNewDistrictRegion || '').trim();
      const name = (adminNewDistrictName || '').trim();
      const nameEn = (adminNewDistrictNameEn || '').trim();
      if (!region || !name) { window.showToast('請填寫所屬分區同地區名稱', '⚠️'); return; }
      const alreadyExists = (window.HK_DISTRICT_REGION_GROUPS || []).some((g) => g.districts.includes(name));
      if (alreadyExists) { window.showToast('此地區已在清單內', '⚠️'); return; }
      try {
        const ref = window.fs.doc(window.db, 'admin_config', 'districtList');
        const existing = (window.ADMIN_DISTRICT_LIST_RAW && Array.isArray(window.ADMIN_DISTRICT_LIST_RAW.districts)) ? window.ADMIN_DISTRICT_LIST_RAW.districts.slice() : [];
        existing.push({ region, name, nameEn: nameEn || null });
        await window.fs.setDoc(ref, { districts: existing, updatedAt: Date.now(), updatedBy: (window.currentUser && window.currentUser.loginId) || null });
        await logAdminAction('新增地區', { region, name, nameEn });
        adminNewDistrictRegion = '';
        adminNewDistrictName = '';
        adminNewDistrictNameEn = '';
        window.showToast('已新增地區', '✅');
      } catch (err) {
        window.showToast('新增失敗：' + (err.message || err), '❌');
      }
    };

    // ---------- 學校名單管理（Alvis主動要求，同科目／地區清單一樣
    // 「淨係新增」模式）----------
    // 背景：中學名單（window.HK_SECONDARY_SCHOOLS_BY_DISTRICT）、大專
    // ／大學名單（window.HK_TERTIARY_INSTITUTIONS_BY_DISTRICT／
    // window.HK_TERTIARY_INSTITUTIONS_COMMON，全部app-core.js定義）
    // 一樣會存落users.school、schoolLeaderboard等地方做資料值，唔開放
    // 改名／刪除。中學一定要揀返所屬地區（用返「地區清單」嗰份分區
    // 清單，等新增咗嘅地區都可以即刻揀），大專院校可以唔揀地區（跟
    // 現有做法，加入「常見院校」清單，唔分地區）。呢頁淨係顯示你後台
    // 新增嗰啲學校——內建嗰成千幾間學校唔會喺度逐間列出嚟，唔係漏咗，
    // 係特登咁做避免成頁好長，想睇內建完整清單可以直接去網站註冊表格
    // 揀地區睇。
    let schoolListConfigLoaded = false;
    let schoolListConfigUnsubscribe = null;
    let adminNewSecondarySchoolName = '';
    let adminNewSecondarySchoolDistrict = '';
    let adminNewTertiaryName = '';
    let adminNewTertiaryDistrict = '';

    function applySchoolListAdditions(data) {
      if (!data) return;
      if (Array.isArray(data.secondary) && window.HK_SECONDARY_SCHOOLS_BY_DISTRICT) {
        data.secondary.forEach((s) => {
          if (!s || !s.name || !s.district) return;
          if (!window.HK_SECONDARY_SCHOOLS_BY_DISTRICT[s.district]) window.HK_SECONDARY_SCHOOLS_BY_DISTRICT[s.district] = [];
          if (!window.HK_SECONDARY_SCHOOLS_BY_DISTRICT[s.district].includes(s.name)) {
            window.HK_SECONDARY_SCHOOLS_BY_DISTRICT[s.district].push(s.name);
          }
        });
      }
      if (Array.isArray(data.tertiary)) {
        data.tertiary.forEach((t) => {
          if (!t || !t.name) return;
          if (t.district && window.HK_TERTIARY_INSTITUTIONS_BY_DISTRICT) {
            if (!window.HK_TERTIARY_INSTITUTIONS_BY_DISTRICT[t.district]) window.HK_TERTIARY_INSTITUTIONS_BY_DISTRICT[t.district] = [];
            if (!window.HK_TERTIARY_INSTITUTIONS_BY_DISTRICT[t.district].includes(t.name)) {
              window.HK_TERTIARY_INSTITUTIONS_BY_DISTRICT[t.district].push(t.name);
            }
          } else if (window.HK_TERTIARY_INSTITUTIONS_COMMON && !window.HK_TERTIARY_INSTITUTIONS_COMMON.includes(t.name)) {
            window.HK_TERTIARY_INSTITUTIONS_COMMON.push(t.name);
          }
        });
      }
    }

    function loadSchoolListFromFirestore() {
      if (!window.db || !window.fs) return;
      if (schoolListConfigUnsubscribe) schoolListConfigUnsubscribe();
      const ref = window.fs.doc(window.db, 'admin_config', 'schoolList');
      schoolListConfigUnsubscribe = window.fs.onSnapshot(ref, (snap) => {
        const data = snap.exists() ? snap.data() : null;
        window.ADMIN_SCHOOL_LIST_RAW = data;
        applySchoolListAdditions(data);
        schoolListConfigLoaded = true;
        if (adminTabShowing('schools')) {
          const panelEl = document.getElementById('admin-panel-container');
          if (panelEl && panelEl.style.display !== 'none') renderAdminSchoolsTab();
        }
      }, (err) => {
        console.error('讀取學校名單失敗:', err);
        schoolListConfigLoaded = true;
      });
    }
    window.loadSchoolListFromFirestore = loadSchoolListFromFirestore;

    function renderAdminSchoolsTab() {
      const container = document.getElementById('admin-tab-schools');
      if (!container) return;
      if (!isCurrentUserSuperAdmin()) {
        container.innerHTML = '<div class="admin-card" style="color:#c0392b;">只有「超級管理員」可以查看此頁。</div>';
        return;
      }
      if (!schoolListConfigLoaded) {
        container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">載入中學校名單...</p>';
        return;
      }
      const districtOptionsHtml = (window.HK_DISTRICT_REGION_GROUPS || []).map((g) =>
        `<optgroup label="${escapeHtml(g.region)}">${g.districts.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('')}</optgroup>`
      ).join('');
      const secondaryAdded = (window.ADMIN_SCHOOL_LIST_RAW && Array.isArray(window.ADMIN_SCHOOL_LIST_RAW.secondary)) ? window.ADMIN_SCHOOL_LIST_RAW.secondary : [];
      const tertiaryAdded = (window.ADMIN_SCHOOL_LIST_RAW && Array.isArray(window.ADMIN_SCHOOL_LIST_RAW.tertiary)) ? window.ADMIN_SCHOOL_LIST_RAW.tertiary : [];
      const secondaryRows = secondaryAdded.map((s) => `<tr><td>${escapeHtml(s.name)}</td><td style="color:#888;">${escapeHtml(s.district)}</td></tr>`).join('');
      const tertiaryRows = tertiaryAdded.map((t) => `<tr><td>${escapeHtml(t.name)}</td><td style="color:#888;">${t.district ? escapeHtml(t.district) : '常見院校（不分地區）'}</td></tr>`).join('');

      container.innerHTML = `
        <div class="admin-card" style="margin-bottom:16px;">
          <p style="font-size:13px; color:#888; margin:0;">此處可以新增註冊表格可選的中學及大專院校。與科目及地區清單一樣，只可以<b>新增</b>，不支援改名或刪除。下表只顯示在此新增的學校，內建的一千多間中學及院校不會逐一列出（可在註冊表格選擇地區查看完整清單）。</p>
        </div>
        <div class="admin-card" style="margin-bottom:16px;">
          <p style="font-size:13px; font-weight:bold; margin-bottom:8px;">➕ 新增中學</p>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end;">
            <div style="flex:1; min-width:180px;">
              <label style="font-size:12px; color:#888; display:block;">中學名稱 *</label>
              <input type="text" class="input-field" value="${escapeHtml(adminNewSecondarySchoolName)}" oninput="window.adminUpdateNewSchoolField('secondaryName', this.value)" placeholder="例如：XX中學">
            </div>
            <div style="flex:1; min-width:160px;">
              <label style="font-size:12px; color:#888; display:block;">所屬地區 *</label>
              <select class="input-field" onchange="window.adminUpdateNewSchoolField('secondaryDistrict', this.value)">
                <option value="">請選擇地區</option>
                ${districtOptionsHtml}
              </select>
            </div>
            <button type="button" class="btn btn-primary" style="height:38px;" onclick="window.adminAddSecondarySchool()">新增</button>
          </div>
        </div>
        <div class="admin-card" style="margin-bottom:16px;">
          <div style="overflow-x:auto;">
            <table class="admin-table">
              <thead><tr><th>中學（後台新增）</th><th>地區</th></tr></thead>
              <tbody>${secondaryRows || '<tr><td colspan="2" style="text-align:center; color:#999;">暫時未有在後台新增的中學</td></tr>'}</tbody>
            </table>
          </div>
        </div>
        <div class="admin-card" style="margin-bottom:16px;">
          <p style="font-size:13px; font-weight:bold; margin-bottom:8px;">➕ 新增大專／大學</p>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end;">
            <div style="flex:1; min-width:180px;">
              <label style="font-size:12px; color:#888; display:block;">院校名稱 *</label>
              <input type="text" class="input-field" value="${escapeHtml(adminNewTertiaryName)}" oninput="window.adminUpdateNewSchoolField('tertiaryName', this.value)" placeholder="例如：XX學院">
            </div>
            <div style="flex:1; min-width:160px;">
              <label style="font-size:12px; color:#888; display:block;">所屬地區（可留空＝加入常見院校清單）</label>
              <select class="input-field" onchange="window.adminUpdateNewSchoolField('tertiaryDistrict', this.value)">
                <option value="">唔揀地區（常見院校）</option>
                ${districtOptionsHtml}
              </select>
            </div>
            <button type="button" class="btn btn-primary" style="height:38px;" onclick="window.adminAddTertiaryInstitution()">新增</button>
          </div>
        </div>
        <div class="admin-card">
          <div style="overflow-x:auto;">
            <table class="admin-table">
              <thead><tr><th>大專／大學（後台新增）</th><th>地區</th></tr></thead>
              <tbody>${tertiaryRows || '<tr><td colspan="2" style="text-align:center; color:#999;">暫時未有在後台新增的院校</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      `;
    }
    window.renderAdminSchoolsTab = renderAdminSchoolsTab;

    window.adminUpdateNewSchoolField = function(key, value) {
      if (key === 'secondaryName') adminNewSecondarySchoolName = value;
      else if (key === 'secondaryDistrict') adminNewSecondarySchoolDistrict = value;
      else if (key === 'tertiaryName') adminNewTertiaryName = value;
      else if (key === 'tertiaryDistrict') adminNewTertiaryDistrict = value;
    };

    window.adminAddSecondarySchool = async function() {
      const name = (adminNewSecondarySchoolName || '').trim();
      const district = (adminNewSecondarySchoolDistrict || '').trim();
      if (!name || !district) { window.showToast('請填寫中學名稱同所屬地區', '⚠️'); return; }
      const alreadyExists = window.HK_SECONDARY_SCHOOLS_BY_DISTRICT && Object.values(window.HK_SECONDARY_SCHOOLS_BY_DISTRICT).some((list) => list.includes(name));
      if (alreadyExists) { window.showToast('此中學已在清單內', '⚠️'); return; }
      try {
        const ref = window.fs.doc(window.db, 'admin_config', 'schoolList');
        const existingSecondary = (window.ADMIN_SCHOOL_LIST_RAW && Array.isArray(window.ADMIN_SCHOOL_LIST_RAW.secondary)) ? window.ADMIN_SCHOOL_LIST_RAW.secondary.slice() : [];
        const existingTertiary = (window.ADMIN_SCHOOL_LIST_RAW && Array.isArray(window.ADMIN_SCHOOL_LIST_RAW.tertiary)) ? window.ADMIN_SCHOOL_LIST_RAW.tertiary.slice() : [];
        existingSecondary.push({ name, district });
        await window.fs.setDoc(ref, { secondary: existingSecondary, tertiary: existingTertiary, updatedAt: Date.now(), updatedBy: (window.currentUser && window.currentUser.loginId) || null });
        await logAdminAction('新增中學', { name, district });
        adminNewSecondarySchoolName = '';
        adminNewSecondarySchoolDistrict = '';
        window.showToast('已新增中學', '✅');
      } catch (err) {
        window.showToast('新增失敗：' + (err.message || err), '❌');
      }
    };

    window.adminAddTertiaryInstitution = async function() {
      const name = (adminNewTertiaryName || '').trim();
      const district = (adminNewTertiaryDistrict || '').trim();
      if (!name) { window.showToast('請輸入院校名稱', '⚠️'); return; }
      const inByDistrict = window.HK_TERTIARY_INSTITUTIONS_BY_DISTRICT && Object.values(window.HK_TERTIARY_INSTITUTIONS_BY_DISTRICT).some((list) => list.includes(name));
      const inCommon = window.HK_TERTIARY_INSTITUTIONS_COMMON && window.HK_TERTIARY_INSTITUTIONS_COMMON.includes(name);
      if (inByDistrict || inCommon) { window.showToast('此院校已在清單內', '⚠️'); return; }
      try {
        const ref = window.fs.doc(window.db, 'admin_config', 'schoolList');
        const existingSecondary = (window.ADMIN_SCHOOL_LIST_RAW && Array.isArray(window.ADMIN_SCHOOL_LIST_RAW.secondary)) ? window.ADMIN_SCHOOL_LIST_RAW.secondary.slice() : [];
        const existingTertiary = (window.ADMIN_SCHOOL_LIST_RAW && Array.isArray(window.ADMIN_SCHOOL_LIST_RAW.tertiary)) ? window.ADMIN_SCHOOL_LIST_RAW.tertiary.slice() : [];
        existingTertiary.push({ name, district: district || null });
        await window.fs.setDoc(ref, { secondary: existingSecondary, tertiary: existingTertiary, updatedAt: Date.now(), updatedBy: (window.currentUser && window.currentUser.loginId) || null });
        await logAdminAction('新增大專院校', { name, district: district || '(常見院校)' });
        adminNewTertiaryName = '';
        adminNewTertiaryDistrict = '';
        window.showToast('已新增院校', '✅');
      } catch (err) {
        window.showToast('新增失敗：' + (err.message || err), '❌');
      }
    };

    // ---------- 服務條款／私隱政策內容管理（低優先第13項）----------
    // 內容存喺 admin_config/legalContent（{terms:{zh-Hant,en,yue},
    // privacy:{zh-Hant,en,yue}}），支援三語言分開編輯。未經Admin編輯
    // 之前（Firestore冇對應語言嘅內容），index.html嗰兩個modal保持
    // 顯示返寫死嗰份原本繁體中文內容，唔會開天窗。English／廣東話
    // 留空會自動退返繁體中文版本顯示。下面兩個DEFAULT_*_ZH常數係
    // 將index.html而家寫死嗰份內容轉做純文字格式，等管理員第一次打開
    // 「條款內容」分頁嗰陣，文字框已經有現成內容可以直接編輯，唔使由
    // 零開始打成千字嘅法律文字。
    const DEFAULT_TERMS_ZH = `歡迎使用 ConcenMate 書伴（下稱「本服務」）。本服務由 ConcenMate 書伴（下稱「本公司」或「我們」）營運。本服務條款（下稱「本條款」）構成閣下（下稱「使用者」或「閣下」）與本公司之間具法律約束力之協議。

閣下一經註冊帳戶，或以任何方式使用本服務之任何功能，即視為閣下已閱讀、理解並同意接受本條款所載之全部內容，並同意受其約束。倘若閣下未滿十八歲，閣下確認已取得閣下之家長或監護人就使用本服務一事之同意。倘若閣下不同意本條款之任何部分，請立即停止使用本服務。

# 第一條　服務內容
本服務提供線上溫習室（包括視訊及語音功能）、直播溫習功能（Study with me）、學習進度追蹤（等級、經驗值、貼紙收藏）、好友及即時通訊功能、疑難解答討論區等功能。本公司保留隨時新增、修改、暫停或終止本服務任何功能之權利，毋須事先通知使用者。

# 第二條　帳戶註冊及使用者責任
（一）使用者於註冊帳戶時所提供之資料（包括登入識別碼、電郵地址等），須真實、準確及完整；
（二）使用者有責任妥善保管其帳戶登入密碼，不得將帳戶資料轉讓、出借或以任何方式提供予他人；
（三）除有證據證明帳戶遭第三方未經授權存取外，使用者帳戶下所發生之一切活動，均視為由使用者本人所為，使用者須就此負全責；
（四）除本公司另行書面同意外，每名使用者僅可擁有一個帳戶。
（五）學歷為中學生、未滿二十歲，並已以學校派發之電郵完成驗證之使用者，方屬「中學生帳戶」，可使用本服務指定之中學生功能（包括中學生溫習室）；其他使用者屬「一般帳戶」。使用者須於每學年（每年九月一日起）確認最新學歷。虛報學歷或年齡、或使用他人學校電郵者，本公司有權撤銷其中學生帳戶資格，並按第七條處理。

# 第三條　使用守則
使用者於使用本服務時，須遵守下列守則，不得從事下列行為：

（一）上載、發佈或傳送任何違法、猥褻、暴力、具威嚇性、侵犯他人權利，或帶有歧視成分之內容（包括但不限於即時通訊訊息、頭像圖片、討論區發帖及留言）；
（二）冒充他人身份，或提供虛假不實之個人資料；
（三）以任何方式（包括但不限於利用瀏覽器開發者工具）試圖繞過、破壞或篡改本服務之計分及經驗值機制；
（四）干擾或破壞本服務之正常運作，包括但不限於發動阻斷服務（DDoS）攻擊、大量發送垃圾訊息、濫用系統資源（例如無故大量開設溫習室）；
（五）未經授權存取其他使用者之帳戶或個人資料；
（六）將本服務用於任何違反香港特別行政區現行法例之用途；
（七）未經其他使用者同意，以截圖、拍照、錄影、錄音或任何其他方式記錄其他使用者於視訊溫習室內之鏡頭畫面或聲音，或將該等內容發佈、轉載或分享至本服務以外之任何平台（包括但不限於社交媒體）。使用本服務之「合照」功能時，未有開啟「容許合照」之使用者畫面將自動以馬賽克遮蓋，使用者不得以任何方式移除或規避該遮蓋。

使用者如違反上述任何守則，本公司有權暫停或終止該使用者之帳戶，情節嚴重者，本公司保留追究相關法律責任之一切權利。本服務已設有舉報機制，供使用者就違規內容或行為作出舉報，由本公司管理團隊進行審查及處理。

# 第四條　使用者生成內容
使用者於本服務上所發佈之內容（包括但不限於即時通訊訊息、討論區發帖及留言，下稱「使用者生成內容」）之知識產權，仍歸屬於該使用者。惟使用者同意，就其發佈之使用者生成內容，授予本公司一項非獨家、免版稅、全球性之許可，容許本公司於營運及提供本服務所必需之範圍內（包括顯示、儲存、傳輸該等內容），使用該等使用者生成內容。

本公司保留移除任何違反本條款之使用者生成內容之權利，毋須事先通知該使用者。

# 第四條之一　直播功能（Study with me）
（一）使用者須年滿十六歲（以註冊時所填寫之出生年月計算），並於本服務累積之合資格溫習日數達本公司不時訂定之要求，方可使用直播功能（下稱「直播」），向其他使用者播放其本人之鏡頭畫面。觀看直播不設年齡限制。本公司有權隨時修改開通要求（包括最低年齡）、暫停或撤銷任何使用者之直播資格，或暫停或終止直播功能，毋須事先通知。使用者如虛報出生年月，本公司有權撤銷其直播資格。

（二）未滿十八歲之使用者（下稱「未成年使用者」）於首次開始直播前，須確認已取得其父母或監護人之同意。本公司有權要求使用者提供有關同意之證明，並於未能提供時暫停其直播資格。

（三）進行直播之使用者（下稱「直播主」）須確保直播內容只限於溫習或學習活動，並不得於直播中：
1. 展示或透露任何可識別其本人或他人身份或所在位置之個人資料，包括但不限於住址、電話號碼、學校名稱、校服或校徽；
2. 展示他人之影像或聲音，惟已取得該人同意者除外；
3. 展示任何色情、暴力、仇恨、危險或違法之內容；
4. 進行任何商業推銷或宣傳。

（四）觀看直播之使用者（下稱「觀眾」）須為已登入本服務之使用者。觀眾只可以文字發表留言，並不得於留言中：
1. 發佈任何聯絡資料，包括但不限於社交媒體帳戶、電話號碼、即時通訊軟件帳戶或網址，或要求直播主提供聯絡資料；
2. 作出任何騷擾、恐嚇、歧視、具性暗示或不雅之言論；
3. 要求直播主作出任何與溫習或學習無關之行為。
本服務會自動過濾部分不當字詞及聯絡資料，惟此不構成本公司對任何留言內容之保證。

（五）本服務不設直播主與觀眾之間之私人訊息或打賞功能。

（六）直播主可刪除其直播內之留言，及封鎖個別觀眾。本公司有權隨時中止任何直播或刪除任何留言，毋須事先通知。

（七）為處理舉報及保障使用者安全，本公司會保存直播紀錄及留言，保存期限載於私隱政策。本公司不會錄製或保存直播影像。使用者不得錄製、截取或轉發其他使用者之直播畫面，有關規定參照第三條第（七）項。

（八）直播之畫質、播放延遲及可同時觀看之人數，視乎網絡狀況及本公司之系統安排而定，本公司對此不作任何保證。

# 第五條　收費及訂閱
本服務於本條款生效之時，並不涉及任何收費功能，現有一切功能均以免費方式提供予使用者。倘若本公司日後推出收費或訂閱服務，本公司將另行公佈詳細之收費條款（包括但不限於收費方式、退款政策），並於使用者使用該等收費功能前，徵得使用者之明確同意。

# 第六條　服務可用性及免責聲明
（一）本服務按「現況」（as is）及「現有」（as available）之基礎提供，本公司不對本服務之不間斷運作、無錯誤或絕對安全作出任何保證；
（二）本服務之運作依賴第三方基礎設施（包括但不限於 Google Firebase、GitHub Pages、Cloudflare、Vultr、EmailJS），倘若因該等第三方服務之故障或中斷而導致本服務無法正常運作，本公司對此不負直接責任；
（三）本服務之視訊溫習室功能依賴點對點即時通訊技術（WebRTC），於使用者之間直接建立連線，連線之品質可能受使用者之網絡環境及裝置性能所影響，本公司不對連線品質作出保證；
（四）本服務之直播功能經本公司租用之伺服器（由 Vultr 提供）傳送影像，播放可能出現延遲、畫質下降或中斷；
（五）於香港現行法例容許之最大範圍內，本公司對因使用或無法使用本服務而引致之任何直接、間接、附帶、特殊或衍生性損失或損害，概不負責。

# 第七條　帳戶暫停及終止
（一）使用者可隨時自行停止使用本服務，或依本公司之私隱政策申請刪除帳戶。

（二）任何使用者均可就違反本條款之內容或行為作出舉報。舉報須經本公司管理團隊審查並確認屬實，方會計入被舉報使用者之違規紀錄。

（三）經確認之違規，按以下方式處理：
1. 第一次違規：暫停帳戶三日；
2. 第二次違規：暫停帳戶十四日；
3. 第三次違規：永久終止帳戶。
上述暫停日數可由本公司不時調整，並於本服務內公佈。

（四）如違規屬嚴重性質，包括但不限於性騷擾、向未成年使用者作出不當要求或接觸、恐嚇或威脅他人人身安全、發佈涉及兒童之不當內容，或任何涉嫌刑事罪行之行為，本公司有權不經本條第（三）項之程序，即時永久終止該使用者之帳戶，並保留將有關資料轉交執法機關之權利。

（五）帳戶暫停期間，使用者將無法登入或使用本服務之任何功能；暫停期屆滿後，帳戶將自動恢復。

（六）帳戶被永久終止之使用者，不得以任何方式重新註冊，或以其他帳戶繼續使用本服務。

（七）使用者如對處理結果有異議，可於帳戶被暫停或終止後十四日內，透過第十條所載之聯絡方式提出覆核申請。本公司將於合理時間內作出覆核決定，該決定為最終決定。

（八）除上述情況外，倘若本公司合理懷疑使用者涉嫌濫用本服務，或基於其他合理理由，本公司保留暫停或終止該使用者帳戶之權利，並將於可行範圍內事先通知使用者，惟涉及惡意行為之情況則不在此限。

# 第八條　本條款之修訂
本公司保留隨時修訂本條款之權利。任何重大修訂將於本服務網站上公佈，並同時更新本文件頂部所載之「最後更新日期」。使用者於修訂公佈後繼續使用本服務，即視為使用者已接受該等經修訂之條款。

# 第九條　準據法及司法管轄
本條款受香港特別行政區法例管轄，並依照香港特別行政區法例解釋。因本條款所引起或與本條款有關之任何爭議，雙方同意接受香港特別行政區法院之非專屬司法管轄權。

# 第十條　聯絡方式
閣下如對本條款有任何疑問，請透過下列方式與本公司聯絡：電郵 support@concenmate.com`;

    const DEFAULT_PRIVACY_ZH = `ConcenMate 書伴（下稱「本服務」）由 ConcenMate 書伴（下稱「本公司」或「我們」）營運及管理。本公司高度重視使用者（下稱「閣下」或「使用者」）之個人資料私隱，並致力遵守香港特別行政區《個人資料（私隱）條例》（香港法例第486章，下稱「該條例」）之相關規定。

閣下透過瀏覽器登入、使用或以任何方式存取本服務，即表示閣下已閱讀、理解並同意接受本私隱政策（下稱「本政策」）所載之全部條款。倘若閣下不同意本政策之任何部分，請立即停止使用本服務。

# 第一條　本政策之適用範圍
本政策適用於閣下透過 concenmate.com 及其任何相關子網域使用本服務之情況。倘若閣下未滿十八歲，本公司建議由閣下之家長或監護人陪同閱讀本政策，並就使用本服務一事給予同意。

# 第二條　本公司所收集之資料類別
本公司因提供本服務之需要，可能收集以下類別之資料：帳戶資料（登入識別碼、電郵地址、顯示暱稱、頭像選項，於帳戶註冊時收集）；學歷及學校電郵（學歷聲明、每學年確認紀錄，以及中學生用作核實身份之學校電郵地址；學校電郵只用作核實身份，不會公開）；學習記錄（累積溫習時數、經驗值、等級、貼紙收藏紀錄，於使用服務過程中自動記錄）；社交互動資料（好友名單、即時通訊內容、討論區發帖及留言，於使用者主動使用相關功能時收集）；溫習室及視訊相關資料（房間設定、加入及離開時間、建立視像連線所需之協調訊息，於使用視訊溫習室功能時收集）；直播相關資料（直播標題、科目、開始及結束時間、觀看人數、直播留言、封鎖紀錄，以及未成年使用者就直播取得父母或監護人同意之確認紀錄，於使用者使用直播功能時收集）；舉報資料（舉報內容及相關佐證，於使用者提交舉報時收集）；違規及停權紀錄（於本公司處理舉報時記錄）；技術資料（瀏覽器類型、裝置資訊、網際網路協定（IP）位址，於連接本服務時由基礎設施自動記錄）。

關於視訊及語音資料之特別聲明：本服務之視訊溫習室功能採用點對點即時通訊技術（WebRTC），使用者之鏡頭及咪高峰畫面一般於瀏覽器之間直接傳輸；如雙方無法直接連線，則會經 Cloudflare 之中轉伺服器以加密方式轉送。本服務之直播功能則經本公司租用之直播伺服器（由 Vultr 提供，位於日本）即時轉送直播主之鏡頭畫面予觀眾。上述影像及聲音均只作即時傳送，本公司不會錄製或儲存。本公司之資料庫僅用作交換建立連線所需之協調（signaling）訊息。

關於直播之公開資料：直播期間，直播主之顯示名稱、直播標題、科目及鏡頭畫面，會向所有已登入本服務之使用者公開；觀眾於直播發表之留言及其顯示名稱，會向該直播之所有觀眾公開。

本公司不會收集閣下之身份證明文件號碼、住址、電話號碼，或信用卡及其他付款工具資料；本服務於現階段並不涉及任何收費功能。

# 第三條　收集資料之目的
本公司收集及處理閣下之個人資料，僅限於下列目的：（一）提供及維持本服務之核心功能，包括帳戶登入、溫習室運作、學習進度追蹤及社交互動功能；（二）維護帳戶安全及防止濫用行為，包括偵測異常操作、處理舉報事宜、執行本公司服務條款所載之違規處理，以及保障使用者（特別是未成年使用者）之安全；（三）透過第三方服務提供者發送電郵驗證訊息（詳見第五條）；（四）分析及改善本服務之功能與使用體驗。本公司承諾不會將閣下之個人資料用於向第三方廣告商進行行銷推廣之目的。

# 第四條　資料儲存地點及保安措施
閣下之個人資料儲存於 Google Firebase（包括 Firestore 資料庫及 Cloud Storage 儲存空間），該等服務由 Google Cloud Platform 提供。資料於傳輸過程中，均以超文本傳輸安全協定（HTTPS/TLS）加密。本公司並已採取下列保安措施：（一）Firebase App Check（結合 reCAPTCHA Enterprise），用以識別及阻截非經正常途徑發出之存取請求；（二）資料庫及儲存空間存取規則，訂明使用者僅可存取屬於自己之資料，唯獲授權之管理員方可存取管理功能；（三）單次資料變更幅度限制，就學習進度等敏感數值之單次變更設有上限，以防止篡改。

# 第五條　資料之披露及第三方服務提供者
本公司不會出售或出租閣下之個人資料予任何第三方。惟為提供本服務所需之技術支援，本公司會將有限度之資料傳送予下列第三方服務提供者：（一）Google Firebase——提供資料庫、身份驗證、檔案儲存及防濫用機制等服務；（二）EmailJS——用於發送電郵驗證、學校電郵驗證及重設密碼訊息，僅會接觸相關電郵地址；（三）Cloudflare——提供視訊溫習室之中轉伺服器，只作即時轉送加密影像及聲音；（四）Vultr——提供直播伺服器，只作即時轉送直播影像。倘若本公司因法律程序而有責任披露閣下之個人資料，本公司將依法配合，並於法律容許之範圍內事先通知閣下；如涉及懷疑刑事罪行或兒童安全，本公司可依法向執法機關披露相關資料。

# 第六條　Cookie 及本地儲存技術
本服務會利用瀏覽器之本地儲存功能（localStorage）記錄閣下之登入狀態，以省卻閣下每次重新登入之需要。該等資料儲存於閣下自身之裝置內，本公司並不藉此透過第三方追蹤 Cookie 監察閣下於其他網站之瀏覽活動。

# 第七條　未成年使用者
本公司理解本服務之使用者當中，不乏未滿十八歲之學生。倘若閣下為家長或監護人，並發現閣下之子女未經閣下同意而建立帳戶，或閣下希望查閱、更正或刪除該等未成年人士之個人資料，歡迎透過第十條所載之聯絡方式與本公司聯絡，本公司將優先處理該等請求。

# 第八條　使用者之權利
根據該條例，閣下就本公司所持有關於閣下之個人資料，享有下列權利：（一）查閱權；（二）更正權；（三）刪除權（惟因安全審查需要而須保留之資料，或經匿名化處理而無法識別個人身份之統計數據，則不在此限）；（四）停止使用權。閣下如欲行使上述任何權利，請透過第十條所載之聯絡方式提出申請，本公司將於合理時間內作出回覆及處理。

# 第九條　資料保留期限
本公司將於閣下之帳戶維持活躍狀態期間，保留閣下之個人資料。直播紀錄及直播留言於直播結束後保存九十日，其後自動刪除；違規及停權紀錄於帳戶存續期間保存，帳戶被永久終止後，本公司會繼續保留有關紀錄，以處理覆核申請及防止重新註冊。倘若閣下申請刪除帳戶，本公司將於合理時間內刪除或將閣下之個人可識別資料進行匿名化處理，惟因安全審查或法律責任而須予保留之資料，則不受此限。

# 第十條　聯絡方式
閣下如對本政策有任何疑問，或欲行使第八條所載之任何權利，請透過下列方式與本公司聯絡：電郵 support@concenmate.com

# 第十一條　政策之修訂
本公司保留隨時修訂本政策之權利。任何重大修訂將於本服務網站上公佈，並同時更新本文件頂部所載之「最後更新日期」。本公司建議閣下定期查閱本政策，以知悉最新內容。閣下於修訂公佈後繼續使用本服務，即視為閣下已接受該等修訂。`;

    let legalContentConfigLoaded = false;
    let legalContentConfigUnsubscribe = null;
    let adminLegalDraft = null;
    let adminLegalActiveDoc = 'terms';
    let adminLegalActiveLang = 'zh-Hant';

    function renderLegalContentParagraphs(text) {
      return text.split(/\n\s*\n/).map((para) => {
        const trimmed = para.trim();
        if (!trimmed) return '';
        if (trimmed.startsWith('#')) {
          const heading = trimmed.replace(/^#+\s*/, '');
          return `<p style="font-weight:bold; margin-top:14px;">${escapeHtml(heading)}</p>`;
        }
        return `<p>${escapeHtml(trimmed).replace(/\n/g, '<br>')}</p>`;
      }).join('');
    }

    function renderLegalContentBody() {
      const data = window.LEGAL_CONTENT_RAW;
      const lang = (typeof window.getAppLanguage === 'function') ? window.getAppLanguage() : 'zh-Hant';
      [['terms', 'terms-content-body'], ['privacy', 'privacy-content-body']].forEach(([docKey, elId]) => {
        const el = document.getElementById(elId);
        if (!el) return;
        const docData = data && data[docKey];
        if (!docData) return; // 未有Firestore內容，保持顯示番index.html原本寫死嗰份
        let text = docData[lang];
        if (!text && lang !== 'zh-Hant') text = docData['zh-Hant']; // 冇對應語言就退返繁體中文
        if (!text) return; // 連繁體中文都未填，保持顯示番原本寫死嗰份
        el.innerHTML = renderLegalContentParagraphs(text);
      });
    }
    window.refreshLegalContentLanguage = renderLegalContentBody;

    function loadLegalContentFromFirestore() {
      if (!window.db || !window.fs) return;
      if (legalContentConfigUnsubscribe) legalContentConfigUnsubscribe();
      const ref = window.fs.doc(window.db, 'admin_config', 'legalContent');
      legalContentConfigUnsubscribe = window.fs.onSnapshot(ref, (snap) => {
        window.LEGAL_CONTENT_RAW = snap.exists() ? snap.data() : null;
        renderLegalContentBody();
        legalContentConfigLoaded = true;
        if (adminTabShowing('legal') && !adminLegalDraft) {
          const panelEl = document.getElementById('admin-panel-container');
          if (panelEl && panelEl.style.display !== 'none') renderAdminLegalTab();
        }
      }, (err) => {
        console.error('讀取服務條款／私隱政策內容失敗:', err);
        legalContentConfigLoaded = true;
      });
    }
    window.loadLegalContentFromFirestore = loadLegalContentFromFirestore;

    function ensureLegalDraftLoaded() {
      if (adminLegalDraft) return;
      const raw = window.LEGAL_CONTENT_RAW || {};
      adminLegalDraft = {
        terms: {
          'zh-Hant': (raw.terms && raw.terms['zh-Hant']) || DEFAULT_TERMS_ZH,
          'en': (raw.terms && raw.terms['en']) || '',
          'yue': (raw.terms && raw.terms['yue']) || '',
        },
        privacy: {
          'zh-Hant': (raw.privacy && raw.privacy['zh-Hant']) || DEFAULT_PRIVACY_ZH,
          'en': (raw.privacy && raw.privacy['en']) || '',
          'yue': (raw.privacy && raw.privacy['yue']) || '',
        },
      };
    }

    function renderAdminLegalTab() {
      const container = document.getElementById('admin-tab-legal');
      if (!container) return;
      if (!isCurrentUserSuperAdmin()) {
        container.innerHTML = '<div class="admin-card" style="color:#c0392b;">只有「超級管理員」可以查看此頁。</div>';
        return;
      }
      if (!legalContentConfigLoaded) {
        container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">載入中條款內容設定...</p>';
        return;
      }
      ensureLegalDraftLoaded();
      const docTabs = [['terms', '服務條款'], ['privacy', '私隱政策']];
      const langTabs = [['zh-Hant', '繁體中文'], ['en', 'English'], ['yue', '廣東話']];
      const docBtns = docTabs.map(([k, label]) => `<button type="button" class="btn ${adminLegalActiveDoc === k ? 'btn-primary' : 'btn-outline'}" style="font-size:13px; padding:6px 14px;" onclick="window.adminSwitchLegalDoc('${k}')">${label}</button>`).join('');
      const langBtns = langTabs.map(([k, label]) => `<button type="button" class="btn ${adminLegalActiveLang === k ? 'btn-primary' : 'btn-outline'}" style="font-size:12px; padding:5px 12px;" onclick="window.adminSwitchLegalLang('${k}')">${label}</button>`).join('');
      const currentText = adminLegalDraft[adminLegalActiveDoc][adminLegalActiveLang] || '';
      const hint = adminLegalActiveLang === 'zh-Hant'
        ? '這是網站目前顯示的版本，可以直接修改。'
        : `如留空，此語言會自動顯示繁體中文版本（${adminLegalActiveLang === 'en' ? 'English' : '廣東話'}未填寫亦不會出現空白）。`;

      container.innerHTML = `
        <div class="admin-card" style="margin-bottom:16px;">
          <p style="font-size:13px; color:#888; margin:0;">此處編輯「服務條款」及「私隱政策」的內容，三種語言可以分開編輯。段落之間留一行空白；如需粗體小標題（例如「第一條　服務內容」），請在該行開頭輸入「#」。注意：English 及廣東話版本的翻譯準確性及法律效力，請自行核實或諮詢專業人士。</p>
        </div>
        <div class="admin-card" style="margin-bottom:16px;">
          <div style="display:flex; gap:8px; margin-bottom:10px;">${docBtns}</div>
          <div style="display:flex; gap:6px; margin-bottom:10px;">${langBtns}</div>
          <p style="font-size:12px; color:#999; margin-bottom:6px;">${hint}</p>
          <textarea class="input-field" style="width:100%; min-height:360px; font-family:inherit; font-size:13px; line-height:1.6;" oninput="window.adminUpdateLegalDraft(this.value)">${escapeHtml(currentText)}</textarea>
          <button type="button" class="btn btn-primary" style="margin-top:10px;" onclick="window.adminSaveLegalContent()">儲存全部語言</button>
        </div>
      `;
    }
    window.renderAdminLegalTab = renderAdminLegalTab;

    window.adminSwitchLegalDoc = function(docKey) {
      ensureLegalDraftLoaded();
      adminLegalActiveDoc = docKey;
      renderAdminLegalTab();
    };
    window.adminSwitchLegalLang = function(lang) {
      ensureLegalDraftLoaded();
      adminLegalActiveLang = lang;
      renderAdminLegalTab();
    };
    window.adminUpdateLegalDraft = function(value) {
      ensureLegalDraftLoaded();
      adminLegalDraft[adminLegalActiveDoc][adminLegalActiveLang] = value;
    };

    window.adminSaveLegalContent = async function() {
      ensureLegalDraftLoaded();
      if (!(await window.appConfirm('確定要儲存嗎？此改動會即時影響全站顯示的服務條款／私隱政策內容。'))) return;
      try {
        const ref = window.fs.doc(window.db, 'admin_config', 'legalContent');
        await window.fs.setDoc(ref, {
          terms: adminLegalDraft.terms,
          privacy: adminLegalDraft.privacy,
          updatedAt: Date.now(),
          updatedBy: (window.currentUser && window.currentUser.loginId) || null,
        });
        await logAdminAction('更新服務條款／私隱政策內容', { doc: adminLegalActiveDoc, lang: adminLegalActiveLang });
        window.showToast('已儲存', '✅');
      } catch (err) {
        window.showToast('儲存失敗：' + (err.message || err), '❌');
      }
    };

    // 頁面一載入就檢查一次（處理直接開 #admin 網址嘅情況）
    checkAdminHashRoute();


    // ===================== 中轉伺服器（TURN，v1.209.0） =====================
    // 顯示每月連線方式統計（直接連線／經中轉／失敗）同估算中轉用量，
    // 並可以即時關閉中轉、調整每月上限。設定存 admin_config/turnSettings；
    // 統計由 Cloud Function reportRtcResult 寫入 admin_config/rtcStats_YYYYMM。
    const TURN_GB_PER_RELAY_MINUTE = 0.0075; // 要同 functions/index.js 一致
    function rtcMonthKeyLocal(offset) {
      const hk = new Date(Date.now() + 8 * 3600 * 1000);
      const d = new Date(Date.UTC(hk.getUTCFullYear(), hk.getUTCMonth() - (offset || 0), 1));
      return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    }
    async function renderAdminTurnTab() {
      const panel = document.getElementById('admin-tab-turn');
      if (!panel) return;
      panel.innerHTML = '<div class="card" style="padding:16px;">載入中…</div>';
      let settings = { enabled: true, monthlyCapGB: 900 };
      try {
        const s = await window.fs.getDoc(window.fs.doc(window.db, 'admin_config', 'turnSettings'));
        if (s.exists()) settings = Object.assign(settings, s.data());
      } catch (e) {}
      const months = [];
      for (let i = 0; i < 3; i++) {
        const key = rtcMonthKeyLocal(i);
        let d = {};
        try { const s = await window.fs.getDoc(window.fs.doc(window.db, 'admin_config', 'rtcStats_' + key)); if (s.exists()) d = s.data(); } catch (e) {}
        months.push({ key, d });
      }
      const row = (m) => {
        const direct = m.d.direct || 0, relay = m.d.relay || 0, failed = m.d.failed || 0, total = direct + relay + failed;
        const pct = (n) => total ? Math.round(n / total * 100) + '%' : '—';
        const gb = (m.d.relayMinutes || 0) * TURN_GB_PER_RELAY_MINUTE;
        const cost = Math.max(0, gb - 1000) * 0.05;
        return `<tr><td>${m.key.slice(0, 4)} 年 ${Number(m.key.slice(4))} 月</td><td>${total}</td><td>${direct}（${pct(direct)}）</td><td>${relay}（${pct(relay)}）</td><td>${failed}（${pct(failed)}）</td><td>${gb.toFixed(1)} GB</td><td>US$${cost.toFixed(2)}</td></tr>`;
      };
      const cur = months[0];
      const curGB = (cur.d.relayMinutes || 0) * TURN_GB_PER_RELAY_MINUTE;
      const capReached = curGB >= settings.monthlyCapGB;
      panel.innerHTML = `
        <div class="card" style="padding:16px;">
          <h3 style="margin:0 0 6px;">中轉伺服器（TURN）</h3>
          <p style="font-size:13px; color:#666; line-height:1.7; margin:0 0 14px;">
            學生在學校 Wi-Fi 或部分流動網絡下，未必能夠直接連線，需要經 Cloudflare 中轉伺服器轉送畫面。<br>
            Cloudflare 每月首 1,000 GB 免費，其後每 GB 收費 US$0.05。以下用量為系統估算，實際以 Cloudflare 帳單為準。<br>
            本月估算用量達到上限時，系統會自動暫停中轉，直至下個月；暫停期間大部分同學仍可直接連線，只有需要中轉的同學會連線失敗。
          </p>
          <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center; margin-bottom:16px;">
            <label style="display:flex; align-items:center; gap:8px; font-weight:bold; color:var(--brand-800); cursor:pointer;">
              <input type="checkbox" id="turn-enabled" ${settings.enabled !== false ? 'checked' : ''} style="width:18px; height:18px;"> 啟用中轉伺服器
            </label>
            <label style="display:flex; align-items:center; gap:8px; font-size:14px;">每月上限
              <input type="number" id="turn-cap" min="1" step="50" value="${settings.monthlyCapGB}" style="width:90px; padding:6px 8px; border:1px solid var(--brand-200); border-radius:8px;"> GB
            </label>
            <button type="button" class="btn btn-primary" onclick="window.adminSaveTurnSettings()">儲存設定</button>
          </div>
          <div style="padding:12px 14px; border-radius:10px; background:${capReached ? '#FDECEA' : 'var(--brand-50)'}; color:${capReached ? '#8A2F2F' : 'var(--brand-800)'}; font-size:14px; margin-bottom:14px;">
            本月估算中轉用量：<b>${curGB.toFixed(1)} GB</b>／上限 ${settings.monthlyCapGB} GB${capReached ? '（已達上限，中轉已自動暫停）' : ''}
          </div>
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:13px;" class="admin-simple-table">
              <thead><tr style="text-align:left; color:#666;"><th>月份</th><th>連線總數</th><th>直接連線</th><th>經中轉</th><th>連線失敗</th><th>估算中轉用量</th><th>估算費用</th></tr></thead>
              <tbody>${months.map(row).join('')}</tbody>
            </table>
          </div>
        </div>`;
      panel.querySelectorAll('td,th').forEach((c) => { c.style.padding = '8px 6px'; c.style.borderBottom = '1px solid var(--brand-100)'; });
    }
    window.adminSaveTurnSettings = async function() {
      if (!(window.isCurrentUserSuperAdmin && window.isCurrentUserSuperAdmin())) { window.showToast('只有超級管理員可以修改此設定', ''); return; }
      const enabled = !!(document.getElementById('turn-enabled') || {}).checked;
      const cap = Number((document.getElementById('turn-cap') || {}).value);
      if (!(cap > 0)) { window.showToast('請輸入有效的每月上限', ''); return; }
      try {
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'turnSettings'), {
          enabled, monthlyCapGB: cap, updatedAt: Date.now(), updatedBy: window.currentUser ? window.currentUser.email : null
        }, { merge: true });
        if (typeof window.logAdminAction === 'function') window.logAdminAction('更新中轉伺服器設定', { enabled, monthlyCapGB: cap });
        window.showToast('已儲存中轉伺服器設定', '');
        renderAdminTurnTab();
      } catch (e) {
        window.showToast('儲存失敗：' + window.friendlyErrorText(e), '');
      }
    };

    // ===================== 功能表顯示（v1.207.0） =====================
    // 逐個功能開／關，寫入 admin_config/navVisibility（hidden map）。
    // 前端監聽同套用喺 app-features.js（startNavVisibilityListener）。
    function renderAdminNavMenuTab() {
      const panel = document.getElementById('admin-tab-navmenu');
      if (!panel) return;
      const list = window.NAV_FEATURE_LIST || [];
      panel.innerHTML = `
        <div class="card" style="padding:16px;">
          <h3 style="margin:0 0 6px;">功能表顯示</h3>
          <p style="font-size:13px; color:#666; line-height:1.7; margin:0 0 14px;">
            取消勾選即可暫時關閉該功能：一般用戶的功能表會即時隱藏該項目，亦無法從其他入口（例如主頁卡片、通知）進入。<br>
            管理員仍可看到已關閉的項目（半透明並顯示「已關閉」），方便測試。「主頁」固定顯示，不可關閉。<br>
            正在使用該功能的用戶不會被強制退出，例如正在溫習室溫習的同學可以繼續，離開後才無法再進入。
          </p>
          <div id="admin-navmenu-list" style="display:flex; flex-direction:column; gap:8px; max-width:520px;"></div>
        </div>`;
      const box = document.getElementById('admin-navmenu-list');
      const rowHome = document.createElement('div');
      rowHome.style.cssText = 'display:flex; align-items:center; gap:12px; padding:10px 14px; border:1px solid #E9EDF5; border-radius:10px; background:#F7FAFD;';
      rowHome.innerHTML = '<input type="checkbox" checked disabled style="width:18px; height:18px;"><span style="font-weight:bold; color:#29395C; flex:1;">主頁</span><span style="font-size:12px; color:#999;">固定顯示</span>';
      box.appendChild(rowHome);
      list.forEach((f) => {
        const hidden = !!(window.navHiddenFeatures && window.navHiddenFeatures[f.id]);
        const row = document.createElement('label');
        row.style.cssText = 'display:flex; align-items:center; gap:12px; padding:10px 14px; border:1px solid #E9EDF5; border-radius:10px; background:#fff; cursor:pointer;';
        row.innerHTML = `
          <input type="checkbox" ${hidden ? '' : 'checked'} style="width:18px; height:18px; cursor:pointer;" onchange="window.adminSetNavFeature('${f.id}', this.checked, this)">
          <span style="font-weight:bold; color:#29395C; flex:1;">${f.label}</span>
          <span id="admin-navmenu-status-${f.id}" style="font-size:12px; font-weight:bold; padding:2px 8px; border-radius:6px; ${hidden ? 'background:#F3F4F6; color:#6B7280;' : 'background:#E6F4EA; color:#1E7B3A;'}">${hidden ? '已關閉' : '顯示中'}</span>`;
        box.appendChild(row);
      });
    }

    window.adminSetNavFeature = async function(id, show, input) {
      if (!(window.isCurrentUserSuperAdmin && window.isCurrentUserSuperAdmin())) { window.showToast('只有超級管理員可以修改此設定', ''); if (input) input.checked = !show; return; }
      const f = (window.NAV_FEATURE_LIST || []).find((x) => x.id === id);
      const label = f ? f.label : id;
      if (input) input.disabled = true;
      try {
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'navVisibility'), {
          hidden: { [id]: !show },
          updatedAt: Date.now(),
          updatedBy: window.currentUser ? window.currentUser.email : null
        }, { merge: true });
        if (!window.navHiddenFeatures) window.navHiddenFeatures = {};
        window.navHiddenFeatures[id] = !show;
        if (typeof window.applyNavVisibility === 'function') window.applyNavVisibility();
        const st = document.getElementById('admin-navmenu-status-' + id);
        if (st) {
          st.textContent = show ? '顯示中' : '已關閉';
          st.style.background = show ? '#E6F4EA' : '#F3F4F6';
          st.style.color = show ? '#1E7B3A' : '#6B7280';
        }
        window.showToast(show ? `已開啟「${label}」` : `已關閉「${label}」`, '');
        if (typeof window.logAdminAction === 'function') window.logAdminAction(show ? '開啟功能' : '關閉功能', { feature: id, label });
      } catch (e) {
        if (input) input.checked = !show;
        window.showToast('儲存失敗：' + (e.message || e), '');
      } finally {
        if (input) input.disabled = false;
      }
    };

    // ===================== 合照背景（v1.205.0） =====================
    // 溫習室「合照」可以按人數（1／2／3／4 人）各自設定一張背景圖。
    // 圖片會壓縮成 1080×1350 JPEG，存喺 admin_config/snapshotBg1～4
    // （data URL，唔經 Firebase Storage，避免跨域讀取限制令合照畫唔到）。
    // 冇上載嘅人數就用預設米白相紙底。
    const SNAPSHOT_BG_W = 1080, SNAPSHOT_BG_H = 1350;

    async function renderAdminSnapshotBgTab() {
      const panel = document.getElementById('admin-tab-snapshotbg');
      if (!panel) return;
      panel.innerHTML = `
        <div class="card" style="padding:16px;">
          <h3 style="margin:0 0 6px;">合照背景</h3>
          <p style="font-size:13px; color:#666; line-height:1.7; margin:0 0 14px;">
            溫習室「合照」可按人數使用不同背景。冇上載的人數會使用預設米白相紙背景。<br>
            給設計師的規格：尺寸 <b>1080 × 1350 像素</b>（直身 4:5）；底部 120 像素會顯示「今日溫習時數」及 ConcenMate 標誌，請保留空位；
            每個人數的相片位置是固定的，請先下載對應的「設計範本」：灰色方框是相片位置（會被遮蓋），斜線範圍是文字及標誌位置，其餘地方可以自由設計。上載後會自動裁切及壓縮。
          </p>
          <div id="admin-snapshotbg-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:14px;"></div>
        </div>`;
      const grid = document.getElementById('admin-snapshotbg-grid');
      for (let n = 1; n <= 4; n++) {
        const card = document.createElement('div');
        card.style.cssText = 'border:1px solid #E9EDF5; border-radius:12px; padding:10px; text-align:center; background:#fff;';
        card.innerHTML = `
          <div style="font-weight:bold; color:#29395C; margin-bottom:8px;">${n} 人合照背景</div>
          <div id="admin-snapshotbg-preview-${n}" style="aspect-ratio:4/5; border-radius:8px; background:#F7F4EE; display:flex; align-items:center; justify-content:center; color:#999; font-size:13px; overflow:hidden;">載入中…</div>
          <div style="display:flex; gap:6px; justify-content:center; margin-top:8px; flex-wrap:wrap;">
            <label class="btn btn-primary" style="font-size:13px; padding:5px 10px; cursor:pointer;">上載圖片
              <input type="file" accept="image/png,image/jpeg,image/webp" style="display:none;" onchange="window.adminUploadSnapshotBg(${n}, this)">
            </label>
            <button type="button" class="btn btn-outline" style="font-size:13px; padding:5px 10px;" onclick="window.adminDownloadSnapshotTemplate(${n})">下載設計範本</button>
            <button type="button" class="btn btn-outline" style="font-size:13px; padding:5px 10px;" onclick="window.adminDeleteSnapshotBg(${n})">移除</button>
          </div>`;
        grid.appendChild(card);
        loadAdminSnapshotBgPreview(n);
      }
    }

    async function loadAdminSnapshotBgPreview(n) {
      const el = document.getElementById('admin-snapshotbg-preview-' + n);
      if (!el) return;
      try {
        const snap = await window.fs.getDoc(window.fs.doc(window.db, 'admin_config', 'snapshotBg' + n));
        const img = snap.exists() ? snap.data().image : null;
        el.innerHTML = img ? `<img src="${img}" alt="" style="width:100%; height:100%; object-fit:cover;">` : '使用預設背景';
      } catch (e) {
        el.innerText = '讀取失敗';
      }
    }

    function fileToSnapshotBgDataUrl(file) {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = SNAPSHOT_BG_W; canvas.height = SNAPSHOT_BG_H;
          const ctx = canvas.getContext('2d');
          const scale = Math.max(SNAPSHOT_BG_W / img.width, SNAPSHOT_BG_H / img.height);
          const dw = img.width * scale, dh = img.height * scale;
          ctx.drawImage(img, (SNAPSHOT_BG_W - dw) / 2, (SNAPSHOT_BG_H - dh) / 2, dw, dh);
          URL.revokeObjectURL(url);
          // Firestore 單一文件上限 1MB，壓到大約 850KB 以下
          let q = 0.88, data = canvas.toDataURL('image/jpeg', q);
          while (data.length > 850000 && q > 0.4) { q -= 0.08; data = canvas.toDataURL('image/jpeg', q); }
          if (data.length > 850000) reject(new Error('圖片太複雜，壓縮後仍然太大，請提供較簡單的設計'));
          else resolve(data);
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('無法讀取此圖片檔案')); };
        img.src = url;
      });
    }

    window.adminUploadSnapshotBg = async function(n, input) {
      const file = input && input.files && input.files[0];
      if (input) input.value = '';
      if (!file) return;
      if (file.size > 15 * 1024 * 1024) { window.showToast('圖片不可以超過 15MB', ''); return; }
      try {
        if (window.showLoading) window.showLoading('正在上載背景…');
        const data = await fileToSnapshotBgDataUrl(file);
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'snapshotBg' + n), {
          image: data, updatedAt: Date.now(), updatedBy: window.currentUser ? window.currentUser.email : null
        });
        window.showToast(`已更新 ${n} 人合照背景`, '');
        loadAdminSnapshotBgPreview(n);
      } catch (e) {
        window.showToast('上載失敗：' + (e.message || e), '');
      } finally {
        if (window.hideLoading) window.hideLoading();
      }
    };

    window.adminDeleteSnapshotBg = async function(n) {
      if (!(await window.appConfirm(`確定移除 ${n} 人合照背景？移除後會使用預設背景。`))) return;
      try {
        await window.fs.deleteDoc(window.fs.doc(window.db, 'admin_config', 'snapshotBg' + n));
        window.showToast(`已移除 ${n} 人合照背景`, '');
        loadAdminSnapshotBgPreview(n);
      } catch (e) {
        window.showToast('移除失敗：' + (e.message || e), '');
      }
    };


    // v1.205.1：設計範本——按實際合照排版畫出相片位置同文字位置，俾設計師
    // 直接喺上面設計（PNG，1080×1350）。
    window.adminDownloadSnapshotTemplate = function(n) {
      if (typeof window.getSnapshotLayout !== 'function') { window.showToast('範本未能產生，請重新整理頁面再試', ''); return; }
      const L = window.getSnapshotLayout(n);
      const c = document.createElement('canvas');
      c.width = L.width; c.height = L.height;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, c.width, c.height);
      // 底部文字範圍（斜線）
      const fy = c.height - L.footerHeight;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, fy, c.width, L.footerHeight); ctx.clip();
      ctx.fillStyle = '#FFF4E5'; ctx.fillRect(0, fy, c.width, L.footerHeight);
      ctx.strokeStyle = '#F0B27A'; ctx.lineWidth = 2;
      for (let x = -L.footerHeight; x < c.width; x += 18) { ctx.beginPath(); ctx.moveTo(x, c.height); ctx.lineTo(x + L.footerHeight, fy); ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = '#B9682B'; ctx.font = 'bold 26px sans-serif'; ctx.textBaseline = 'middle';
      ctx.textAlign = 'left'; ctx.fillText('今日溫習時數（文字）', 52, fy + L.footerHeight / 2);
      ctx.textAlign = 'right'; ctx.fillText('ConcenMate 標誌＋網址', c.width - 52, fy + L.footerHeight / 2);
      // 相片位置
      L.slots.forEach((r, i) => {
        ctx.fillStyle = '#C9CED3'; ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = '#7A848C'; ctx.lineWidth = 3; ctx.strokeRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3);
        ctx.fillStyle = '#4F5961'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.round(Math.min(48, r.h / 6))}px sans-serif`;
        ctx.fillText(`相片 ${i + 1}`, r.x + r.w / 2, r.y + r.h / 2 - 18);
        ctx.font = `${Math.round(Math.min(26, r.h / 10))}px sans-serif`;
        ctx.fillText(`${r.w} × ${r.h} px（左上角 ${r.x}, ${r.y}）`, r.x + r.w / 2, r.y + r.h / 2 + 26);
      });
      ctx.fillStyle = '#9AA3AA'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = '22px sans-serif';
      ctx.fillText(`ConcenMate ${n} 人合照背景範本　1080 × 1350 px`, c.width / 2, 12);
      c.toBlob((b) => {
        if (!b) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = `ConcenMate-合照背景範本-${n}人.png`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }, 'image/png');
    };

// ===================== 營運開支儀表板（v1.228.0） =====================
// 資料由 Cloud Function getCostDashboard 提供（只限超級管理員，結果快取 30 分鐘）。
// 每個收費項目以圓形圖顯示「已用／免費額度或月費包含的用量」：
// 未到 70% 為正常（藍色），70%–89% 需留意（黃色），90% 或以上需立即處理（紅色）。
(function () {
  const HKD = 7.8;
  const LEVEL = {
    ok: { color: '#4A68A8', label: '正常' },
    watch: { color: '#E8B321', label: '需要留意' },
    urgent: { color: '#C0392B', label: '立即處理' },
    unknown: { color: '#A4B4D4', label: '未有數據' }
  };
  const SOURCE = { official: '官方數據', count: '系統點數', estimate: '系統估算', unavailable: '未能取得' };
  const PIE_COLORS = ['#29395C', '#4A68A8', '#7F96C6', '#FFD84D', '#E8A33C', '#A4B4D4', '#C0392B', '#6B7894', '#344976'];
  const esc = (s) => (window.escapeHtml ? window.escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s));
  const fmt = (n, d) => (n == null ? '—' : Number(n).toLocaleString('zh-HK', { maximumFractionDigits: d == null ? 1 : d }));
  const usd = (n) => 'US$' + Number(n || 0).toFixed(2);
  const hkd = (n) => '約 HK$' + Math.round(Number(n || 0) * HKD).toLocaleString('zh-HK');

  // 圓環圖（百分比）
  function gauge(pct, color) {
    const r = 42, c = 2 * Math.PI * r;
    const p = pct == null ? 0 : Math.min(100, pct);
    return `<svg viewBox="0 0 100 100" width="110" height="110" aria-hidden="true">
      <circle cx="50" cy="50" r="${r}" fill="none" stroke="#E9EDF5" stroke-width="12"/>
      ${p > 0 ? `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round"
        stroke-dasharray="${(p / 100 * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 50 50)"/>` : ''}
      <text x="50" y="55" text-anchor="middle" font-size="18" font-weight="700" fill="#29395C">${pct == null ? '—' : pct + '%'}</text>
    </svg>`;
  }
  // 圓形圖（開支分佈）
  function pie(parts) {
    const total = parts.reduce((a, b) => a + b.value, 0);
    if (!total) return '<p style="font-size:13px; color:#6B7894; margin:0;">本月暫時沒有收費項目。</p>';
    let acc = 0;
    const r = 40, cx = 50, cy = 50;
    const slices = parts.map((pt, i) => {
      const frac = pt.value / total;
      const color = PIE_COLORS[i % PIE_COLORS.length];
      if (frac >= 0.999) return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`;
      const a0 = acc * 2 * Math.PI - Math.PI / 2; acc += frac;
      const a1 = acc * 2 * Math.PI - Math.PI / 2;
      const large = frac > 0.5 ? 1 : 0;
      return `<path d="M${cx},${cy} L${(cx + r * Math.cos(a0)).toFixed(2)},${(cy + r * Math.sin(a0)).toFixed(2)} A${r},${r} 0 ${large} 1 ${(cx + r * Math.cos(a1)).toFixed(2)},${(cy + r * Math.sin(a1)).toFixed(2)} Z" fill="${color}"/>`;
    }).join('');
    const legend = parts.map((pt, i) => `<div style="display:flex; align-items:center; gap:8px; font-size:13px; color:var(--brand-800);">
        <span style="width:12px; height:12px; border-radius:3px; background:${PIE_COLORS[i % PIE_COLORS.length]}; flex:none;"></span>
        <span style="flex:1;">${esc(pt.name)}</span><b>${usd(pt.value)}</b><span style="color:#6B7894; width:42px; text-align:right;">${Math.round(pt.value / total * 100)}%</span></div>`).join('');
    return `<div style="display:flex; gap:18px; align-items:center; flex-wrap:wrap;">
      <svg viewBox="0 0 100 100" width="150" height="150" aria-hidden="true">${slices}<circle cx="50" cy="50" r="20" fill="#fff"/></svg>
      <div style="flex:1; min-width:220px; display:flex; flex-direction:column; gap:6px;">${legend}</div></div>`;
  }
  // 過去 6 個月棒形圖
  function bars(history) {
    const max = Math.max(1, ...history.map(h => h.totalUSD || 0));
    return `<div style="display:flex; gap:10px; align-items:flex-end; height:150px; padding-top:10px;">${history.map(h => {
      const v = h.totalUSD;
      const ht = v == null ? 4 : Math.max(4, Math.round(v / max * 110));
      return `<div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; min-width:0;">
        <span style="font-size:11px; color:var(--brand-800); white-space:nowrap;">${v == null ? '—' : usd(v)}</span>
        <div style="width:100%; max-width:46px; height:${ht}px; border-radius:6px 6px 0 0; background:${v == null ? '#E9EDF5' : '#4A68A8'};"></div>
        <span style="font-size:11px; color:#6B7894;">${Number(h.month.slice(4))} 月</span></div>`;
    }).join('')}</div>`;
  }

  async function load(refresh) {
    const panel = document.getElementById('admin-tab-costs');
    if (!panel) return;
    if (!panel.dataset.loaded || refresh) panel.innerHTML = '<div class="card" style="padding:16px;">正在讀取用量數據…（首次約需 5 至 10 秒）</div>';
    let d;
    try {
      d = await window.callCloudFunction('getCostDashboard', { refresh: !!refresh });
    } catch (e) {
      panel.innerHTML = `<div class="card" style="padding:16px; color:#8A2F2F;">未能讀取營運開支數據：${esc((e && e.message) || e)}</div>`;
      return;
    }
    panel.dataset.loaded = '1';
    const items = d.items || [];
    const alerts = items.filter(it => it.level === 'urgent' || it.level === 'watch')
      .sort((a, b) => (a.level === 'urgent' ? 0 : 1) - (b.level === 'urgent' ? 0 : 1));
    const alertHtml = alerts.length
      ? alerts.map(it => `<div style="display:flex; gap:10px; padding:10px 12px; border-radius:10px; margin-bottom:8px; background:${it.level === 'urgent' ? '#FDECEA' : '#FFF7DA'}; border:1px solid ${it.level === 'urgent' ? '#F1B8B1' : '#F0D98A'};">
          <b style="color:${LEVEL[it.level].color}; white-space:nowrap;">${LEVEL[it.level].label}</b>
          <div style="font-size:13px; color:var(--brand-800); line-height:1.6;"><b>${esc(it.name)}</b>：已用 ${it.pct}%。${esc(it.advice)}</div></div>`).join('')
      : '<div style="padding:10px 12px; border-radius:10px; background:var(--brand-100); font-size:14px; color:var(--brand-800);">所有項目均在安全水平，暫時毋須升級。</div>';

    const pieParts = items.filter(it => it.costUSD > 0).map(it => ({ name: it.name.replace(/（.*?）/g, ''), value: it.costUSD }));
    if (d.domainUSD) pieParts.push({ name: '域名', value: d.domainUSD });

    const cards = items.map(it => {
      const lv = LEVEL[it.level] || LEVEL.unknown;
      return `<div class="card" style="padding:14px; margin:0; display:flex; flex-direction:column; gap:8px; border-top:4px solid ${lv.color};">
        <div style="display:flex; justify-content:space-between; gap:6px; align-items:flex-start;">
          <b style="font-size:14px; color:var(--brand-800); line-height:1.4;">${esc(it.name)}</b>
          <span style="font-size:11px; color:#6B7894; background:var(--brand-100); border-radius:6px; padding:2px 6px; white-space:nowrap;">${esc(SOURCE[it.source] || '')}</span>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          ${gauge(it.pct, lv.color)}
          <div style="font-size:13px; color:var(--brand-800); line-height:1.7;">
            <div>${esc(it.period)}：<b>${fmt(it.used, it.unit === 'GB' ? 1 : 0)}</b> ${esc(it.unit)}</div>
            <div style="color:#6B7894;">上限：${fmt(it.limit, 0)} ${esc(it.unit)}</div>
            ${it.extra ? `<div style="color:#6B7894;">${esc(it.extra)}</div>` : ''}
            <div>本月估算：<b>${usd(it.costUSD)}</b></div>
            <div style="color:${lv.color}; font-weight:700;">${lv.label}</div>
          </div>
        </div>
        <details style="font-size:12px; color:#6B7894;"><summary style="cursor:pointer;">幾時要升級？</summary><p style="margin:6px 0 0; line-height:1.6;">${esc(it.advice)}</p></details>
      </div>`;
    }).join('');

    const errs = d.errors || {};
    const errNotes = [];
    if (errs.google) errNotes.push('Google 用量數據（資料庫、伺服器程式、相片儲存）未能取得：' + errs.google);
    if (errs.vultr) errNotes.push('Vultr 數據未能取得，直播流量改用系統估算：' + errs.vultr);
    const s = d.settings || {};
    const updated = new Date(d.at).toLocaleString('zh-HK', { hour12: false });
    // v1.230.1：每月預算自動控制狀態
    const g = d.budgetGuard || {};
    const budget = Number(s.monthlyBudgetUSD) || 0;
    const fmtTime = (ms) => ms ? new Date(ms).toLocaleString('zh-HK', { hour12: false }) : '';
    let budgetHtml;
    if (g.paused) {
      budgetHtml = `<div class="card" style="padding:16px; border:2px solid #C0392B; background:#FDF1EF;">
        <h3 style="margin:0 0 6px; font-size:16px; color:#A33A2F;">直播已自動暫停（本月開支已達預算上限）</h3>
        <p style="margin:0; font-size:14px; line-height:1.7; color:#5A2A24;">暫停時間：${esc(fmtTime(g.pausedAt))}<br>本月估算 ${usd(d.totalUSD)}，預算上限 ${usd(budget || g.budgetUSD)}。<br>暫停期間一般用戶不能開始或觀看直播（管理員除外）。提高預算上限或關閉「自動暫停」後儲存，直播會即時恢復；下月估算回落至預算以下亦會自動恢復。</p>
      </div>`;
    } else if (budget > 0) {
      const pct = Math.round(d.totalUSD / budget * 100);
      const barColor = pct >= 90 ? '#C0392B' : pct >= 70 ? '#E0A800' : '#4A68A8';
      budgetHtml = `<div class="card" style="padding:16px;">
        <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; align-items:baseline;">
          <h3 style="margin:0; font-size:16px;">每月預算控制</h3>
          <span style="font-size:13px; color:#6B7894;">自動暫停直播：<b>${s.budgetAutoStop ? '已開啟' : '未開啟'}</b></span>
        </div>
        <p style="margin:6px 0 8px; font-size:14px;">本月估算 ${usd(d.totalUSD)} ／ 預算上限 ${usd(budget)}（${pct}%）</p>
        <div style="height:10px; background:var(--brand-100); border-radius:6px; overflow:hidden;"><div style="height:100%; width:${Math.min(100, pct)}%; background:${barColor};"></div></div>
        ${g.resumedAt ? `<p style="margin:8px 0 0; font-size:12px; color:#8A94A8;">上次自動恢復直播：${esc(fmtTime(g.resumedAt))}</p>` : ''}
      </div>`;
    } else {
      budgetHtml = `<div class="card" style="padding:16px;"><h3 style="margin:0 0 4px; font-size:16px;">每月預算控制</h3><p style="margin:0; font-size:13px; color:#6B7894;">尚未設定預算上限。可在下方「方案設定」填寫每月預算上限，並開啟「超出預算時自動暫停直播」。</p></div>`;
    }

    panel.innerHTML = `
      <div class="card" style="padding:16px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
          <div>
            <h3 style="margin:0 0 4px;">營運開支</h3>
            <p style="margin:0; font-size:13px; color:#6B7894;">本月（${Number(d.monthKey.slice(4))} 月，已過 ${d.dayOfMonth}／${d.daysInMonth} 日）全月估算開支</p>
            <div style="font-size:28px; font-weight:800; color:var(--brand-800); margin-top:6px;">${usd(d.totalUSD)} <span style="font-size:15px; font-weight:600; color:#6B7894;">${hkd(d.totalUSD)}</span></div>
            ${d.vultrPendingUSD != null ? `<p style="margin:4px 0 0; font-size:13px; color:#6B7894;">Vultr 本月實際累計帳單：${usd(d.vultrPendingUSD)}</p>` : ''}
          </div>
          <div style="text-align:right;">
            <button type="button" class="btn btn-outline" onclick="window.renderAdminCostsTab(true)">重新整理</button>
            <p style="margin:6px 0 0; font-size:12px; color:#8A94A8;">更新時間：${esc(updated)}<br>數據每 30 分鐘更新一次</p>
          </div>
        </div>
        <div style="display:flex; gap:14px; flex-wrap:wrap; margin-top:12px; font-size:12px; color:#6B7894;">
          ${['ok', 'watch', 'urgent'].map(k => `<span style="display:flex; align-items:center; gap:5px;"><span style="width:10px; height:10px; border-radius:50%; background:${LEVEL[k].color};"></span>${LEVEL[k].label}${k === 'ok' ? '（70% 以下）' : k === 'watch' ? '（70%–89%）' : '（90% 或以上）'}</span>`).join('')}
        </div>
      </div>

      ${budgetHtml}

      <div class="card" style="padding:16px;">
        <h3 style="margin:0 0 10px; font-size:16px;">需要處理的項目</h3>
        ${alertHtml}
        ${errNotes.length ? `<div style="font-size:12px; color:#8A6D1F; background:#FFF7E6; border:1px solid #F0D9A0; border-radius:8px; padding:8px 10px; margin-top:6px; line-height:1.6;">${errNotes.map(esc).join('<br>')}</div>` : ''}
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:12px; margin-bottom:12px;">${cards}</div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:12px;">
        <div class="card" style="padding:16px; margin:0;">
          <h3 style="margin:0 0 10px; font-size:16px;">本月開支分佈</h3>
          ${pie(pieParts)}
        </div>
        <div class="card" style="padding:16px; margin:0;">
          <h3 style="margin:0 0 4px; font-size:16px;">過去 6 個月估算開支</h3>
          <p style="margin:0; font-size:12px; color:#8A94A8;">每 3 小時自動記錄一次當月估算</p>
          ${bars(d.history || [])}
        </div>
      </div>

      <div class="card" style="padding:16px; margin-top:12px;">
        <h3 style="margin:0 0 6px; font-size:16px;">方案設定</h3>
        <p style="margin:0 0 12px; font-size:13px; color:#6B7894;">升級或更改方案後，請在此更新，圓形圖的上限及估算開支會隨之調整。</p>
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:10px; font-size:14px;">
          <label>Vultr 月費（US$）<input id="cost-vultr-fee" type="number" min="0" step="1" value="${esc(s.vultrMonthlyUSD)}" class="input-field" style="width:100%; box-sizing:border-box; margin-top:4px; padding:8px; border:1px solid var(--brand-200); border-radius:8px;"></label>
          <label>Vultr 每月包含流量（GB）<input id="cost-vultr-gb" type="number" min="1" step="100" value="${esc(s.vultrIncludedGB)}" style="width:100%; box-sizing:border-box; margin-top:4px; padding:8px; border:1px solid var(--brand-200); border-radius:8px;"></label>
          <label>直播同時觀看上限（人）<input id="cost-live-cap" type="number" min="1" step="10" value="${esc(s.liveViewerCapacity)}" style="width:100%; box-sizing:border-box; margin-top:4px; padding:8px; border:1px solid var(--brand-200); border-radius:8px;"></label>
          <label>EmailJS 方案<select id="cost-emailjs" style="width:100%; box-sizing:border-box; margin-top:4px; padding:8px; border:1px solid var(--brand-200); border-radius:8px;">
            ${[[200, '免費（每月 200 封）'], [2000, 'Personal（2,000 封，US$9）'], [5000, 'Professional（5,000 封，US$15）'], [25000, 'Business（25,000 封，US$40）']].map(([v, l]) => `<option value="${v}" ${Number(s.emailjsQuota) === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select></label>
          <label>每月預算上限（US$，0 為不設）<input id="cost-budget" type="number" min="0" step="1" value="${esc(s.monthlyBudgetUSD || 0)}" style="width:100%; box-sizing:border-box; margin-top:4px; padding:8px; border:1px solid var(--brand-200); border-radius:8px;"></label>
          <label style="display:flex; align-items:center; gap:8px; margin-top:22px;"><input id="cost-budget-autostop" type="checkbox" ${s.budgetAutoStop ? 'checked' : ''}>超出預算時自動暫停直播</label>
        </div>
        <p style="margin:10px 0 0; font-size:12px; color:#8A94A8;">系統每 3 小時檢查一次本月估算開支；達到預算上限時會結束所有進行中的直播，並暫停開播及觀看，直至估算回落至預算以下。中轉伺服器的上限請在「中轉伺服器」分頁設定。</p>
        <button type="button" class="btn btn-primary" style="margin-top:12px;" onclick="window.adminSaveCostSettings()">儲存方案設定</button>
      </div>`;
  }

  window.renderAdminCostsTab = function (refresh) { load(refresh === true); };
  window.adminSaveCostSettings = async function () {
    const v = (id) => (document.getElementById(id) || {}).value;
    try {
      await window.callCloudFunction('saveCostSettings', {
        vultrMonthlyUSD: v('cost-vultr-fee'), vultrIncludedGB: v('cost-vultr-gb'),
        liveViewerCapacity: v('cost-live-cap'), emailjsQuota: v('cost-emailjs'),
        monthlyBudgetUSD: v('cost-budget'),
        budgetAutoStop: !!(document.getElementById('cost-budget-autostop') || {}).checked
      });
      window.showToast('已儲存方案設定', '✅');
      load(true);
    } catch (e) {
      window.showToast('儲存失敗：' + ((e && e.message) || e), '❌');
    }
  };
})();


// ===================== 學校電郵審批（v1.229.0） =====================
// 學生以 .edu.hk 電郵驗證時，如該域名第一次出現，會列在這裏等候管理員確認一次屬哪間中學；
// 批准後同一域名的學生即時成為中學生帳戶（已驗證），之後同校學生驗證即時通過。
(function () {
  const esc = (v) => (window.escapeHtml ? window.escapeHtml(String(v == null ? '' : v)) : String(v == null ? '' : v));
  let unsub = null;
  window.startAdminSchoolDomainsBadge = function () {
    if (unsub || !window.db || !window.fs) return;
    try {
      const q = window.fs.query(window.fs.collection(window.db, 'schoolEmailDomains'), window.fs.where('status', '==', 'pending'));
      unsub = window.fs.onSnapshot(q, (snap) => {
        const b = document.getElementById('admin-schooldomains-badge');
        if (b) { b.textContent = String(snap.size); b.style.display = snap.size ? '' : 'none'; }
        const panel = document.getElementById('admin-tab-schooldomains');
        if (panel && panel.style.display === 'block') window.renderAdminSchoolDomainsTab();
      }, () => { unsub = null; });
    } catch (_) {}
  };
  window.renderAdminSchoolDomainsTab = async function () {
    const panel = document.getElementById('admin-tab-schooldomains');
    if (!panel) return;
    let docs = [];
    try {
      const snap = await window.fs.getDocs(window.fs.collection(window.db, 'schoolEmailDomains'));
      docs = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
    } catch (e) {
      panel.innerHTML = `<div class="card" style="padding:16px; color:#8A2F2F;">未能讀取：${esc(e.message || e)}</div>`;
      return;
    }
    const pending = docs.filter(d => d.status === 'pending').sort((a, b) => (a.firstSeenAt || 0) - (b.firstSeenAt || 0));
    const done = docs.filter(d => d.status !== 'pending').sort((a, b) => (b.reviewedAt || 0) - (a.reviewedAt || 0));
    const pendHtml = pending.length ? pending.map(d => `
      <div style="border:1px solid var(--brand-200); border-radius:10px; padding:12px; margin-bottom:10px;">
        <div style="font-size:15px; font-weight:800; color:var(--brand-800); word-break:break-all;">@${esc(d.domain)}</div>
        <div style="font-size:13px; color:#6B7894; margin:4px 0 8px;">學生填寫的學校：${esc((d.sampleSchools || []).join('、') || '—')}　｜　等候人數：${esc(d.pendingCount || 0)}</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <input id="sd-school-${esc(d.id)}" value="${esc((d.sampleSchools || [])[0] || '')}" placeholder="這個域名屬於哪間中學" style="flex:1; min-width:180px; padding:8px 10px; border:1px solid var(--brand-300); border-radius:8px; font-size:14px;">
          <button type="button" class="btn btn-primary" onclick="window.adminReviewSchoolDomain('${esc(d.id)}', true)">確認為中學</button>
          <button type="button" class="btn btn-outline" onclick="window.adminReviewSchoolDomain('${esc(d.id)}', false)">不是中學</button>
        </div>
      </div>`).join('') : '<p style="font-size:14px; color:#6B7894; margin:0;">暫時沒有待審批的域名。</p>';
    const doneHtml = done.length ? `<table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead><tr style="text-align:left; color:#6B7894;"><th style="padding:6px;">域名</th><th style="padding:6px;">結果</th><th style="padding:6px;">學校</th><th style="padding:6px;"></th></tr></thead>
        <tbody>${done.map(d => `<tr style="border-top:1px solid var(--brand-100);">
          <td style="padding:6px; word-break:break-all;">@${esc(d.domain)}</td>
          <td style="padding:6px;">${d.status === 'approved' ? '已確認為中學' : '不是中學'}</td>
          <td style="padding:6px;">${esc(d.school || '—')}</td>
          <td style="padding:6px; text-align:right;">${d.status === 'approved'
            ? `<button type="button" class="btn btn-outline" style="font-size:12px; padding:3px 8px;" onclick="window.adminReviewSchoolDomain('${esc(d.id)}', false)">撤銷</button>`
            : `<button type="button" class="btn btn-outline" style="font-size:12px; padding:3px 8px;" onclick="window.adminReopenSchoolDomain('${esc(d.id)}', '${esc(d.domain)}')">改為中學</button>`}</td></tr>`).join('')}</tbody></table>`
      : '<p style="font-size:14px; color:#6B7894; margin:0;">未有紀錄。</p>';
    panel.innerHTML = `
      <div class="card" style="padding:16px;">
        <h3 style="margin:0 0 6px;">學校電郵審批</h3>
        <p style="font-size:13px; color:#6B7894; line-height:1.7; margin:0;">學生用 .edu.hk 學校電郵驗證時，如果該學校的電郵域名是第一次出現，會列在這裏。請確認它屬於一間中學（例如在學校網站核對），確認後同一域名的學生會即時成為中學生帳戶，之後同校學生驗證時會即時通過。大專院校的域名系統已自動拒絕。</p>
      </div>
      <div class="card" style="padding:16px;"><h4 style="margin:0 0 10px;">待審批</h4>${pendHtml}</div>
      <div class="card" style="padding:16px;"><h4 style="margin:0 0 10px;">已處理</h4>${doneHtml}</div>`;
  };
  window.adminReviewSchoolDomain = async function (id, approve) {
    const input = document.getElementById('sd-school-' + id);
    const school = input ? input.value.trim() : '';
    const domain = id;
    if (approve && !school) { window.showToast('請填寫學校名稱', '⚠️'); return; }
    const msg = approve ? `確認 @${domain} 屬於「${school}」？同一域名等候中的學生會即時成為中學生帳戶。` : `確定 @${domain} 不是中學電郵？使用此域名的學生會失去中學生帳戶資格。`;
    if (!(await window.appConfirm(msg))) return;
    try {
      const res = await window.callCloudFunction('reviewSchoolEmailDomain', { domain, approve, school });
      window.showToast(`已處理，更新了 ${res && res.updated || 0} 位學生`, '✅');
      window.renderAdminSchoolDomainsTab();
    } catch (e) {
      window.showToast('處理失敗：' + (window.friendlyErrorText ? window.friendlyErrorText(e) : (e.message || e)), '❌');
    }
  };
  window.adminReopenSchoolDomain = async function (id, domain) {
    const school = await window.appPrompt(`@${domain} 屬於哪間中學？`, '');
    if (!school) return;
    try {
      const res = await window.callCloudFunction('reviewSchoolEmailDomain', { domain, approve: true, school: school.trim() });
      window.showToast(`已改為中學，更新了 ${res && res.updated || 0} 位學生`, '✅');
      window.renderAdminSchoolDomainsTab();
    } catch (e) {
      window.showToast('處理失敗：' + (window.friendlyErrorText ? window.friendlyErrorText(e) : (e.message || e)), '❌');
    }
  };
})();
