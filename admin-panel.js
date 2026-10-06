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
      'subjects', 'districts', 'schools', 'legal'
    ];

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
    let currentAdminTab = 'dashboard';

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
        btn.innerHTML = `<span class="header-admin-text">返回主頁</span>`;
      } else {
        btn.setAttribute('onclick', "window.location.hash='admin'");
        btn.innerHTML = `<span class="header-admin-text">管理後台</span>`;
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

      // 「🚩 舉報處理」個紅點徽章唔理管理員而家揀緊邊個分頁都要見到，
      // 所以一入管理後台就開始聽，唔使等真係撳入嗰個分頁先識更新
      if (typeof window.startAdminReportsBadgeListener === 'function') window.startAdminReportsBadgeListener();
      // 「🎓 導師申請」個紅點徽章同上，唔理揀緊邊個分頁都要見到
      if (typeof window.startAdminTutorsBadgeListener === 'function') window.startAdminTutorsBadgeListener();

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
      ['admin-tab-group-settings', 'admin-tab-group-governance'].forEach((groupId) => {
        const groupEl = document.getElementById(groupId);
        if (groupEl) groupEl.style.display = isSuper ? '' : 'none';
      });
      // 如果而家記住嘅分頁係『support』見唔到嗰啲，就退返去「數據總覽」，
      // 避免見到一個冇按鈕對應、又撳唔返嘅空白分頁。
      let startTab = currentAdminTab || 'dashboard';
      if (!isSuper && SUPER_ADMIN_ONLY_TABS.includes(startTab)) startTab = 'dashboard';

      switchAdminTab(startTab);
    }
    window.checkAdminHashRoute = checkAdminHashRoute;
    window.addEventListener('hashchange', checkAdminHashRoute);

    window.switchAdminTab = function(tab) {
      // 防止『support』帳戶用網址hash或者其他方式直接跳去冇按鈕對應
      // 嘅super限定分頁——退返去「數據總覽」並提示一下。
      if (SUPER_ADMIN_ONLY_TABS.includes(tab) && !isCurrentUserSuperAdmin()) {
        window.showToast('呢個分頁淨係「超級管理員」先用得到', '🔒');
        tab = 'dashboard';
      }
      currentAdminTab = tab;
      document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        const active = btn.getAttribute('data-tab') === tab;
        btn.className = 'btn admin-tab-btn ' + (active ? 'btn-primary active' : 'btn-outline');
      });
      document.querySelectorAll('.admin-tab-panel').forEach(panel => {
        panel.style.display = (panel.id === 'admin-tab-' + tab) ? 'block' : 'none';
      });

      if (tab === 'dashboard') renderAdminDashboardTab();
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
      else if (tab === 'roomsettings') renderAdminRoomSettingsTab();
      else if (tab === 'antiidle') renderAdminAntiIdleTab();
      else if (tab === 'announcement') renderAdminAnnouncementTab();
      else if (tab === 'support') renderAdminSupportTab();
      else if (tab === 'adminlist') renderAdminAdminListTab();
      else if (tab === 'auditlog') renderAdminAuditLogTab();
      else if (tab === 'subjects') renderAdminSubjectsTab();
      else if (tab === 'districts') renderAdminDistrictsTab();
      else if (tab === 'schools') renderAdminSchoolsTab();
      else if (tab === 'legal') renderAdminLegalTab();
    };

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
          costNormal: GACHA_COST.normal,
          costLucky: GACHA_COST.lucky,
          machineImageUrl: window.GACHA_MACHINE_IMAGE_URL || null
        };
      }

      function renderMachineImageCard() {
        const url = adminGachaDraft.machineImageUrl;
        const previewInner = url
          ? `<img src="${url}" style="width:100%; height:100%; object-fit:contain;">`
          : `<img src="gacha-machine.png" style="width:100%; height:100%; object-fit:contain;">`;
        return `
          <div class="admin-card">
            <h3 style="font-size:15px; font-weight:bold; color:var(--brand-800); margin-bottom:10px;">扭蛋機外觀圖片</h3>
            <p style="font-size:13px; color:#888; margin-bottom:10px;">這張是扭蛋機本身的外殼圖（不是貼紙），顯示在學生點擊扭蛋的頁面。上傳新圖會即時取代畫面上顯示的圖案，不上傳則繼續使用程式碼內建的預設圖。</p>
            <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
              <div id="admin-gacha-machine-thumb" onclick="document.getElementById('admin-gacha-machine-input').click()" title="點擊這裡上傳圖片" style="width:80px; height:80px; border-radius:10px; background:#F0F6F8; border:1px dashed #B3D6DE; display:flex; align-items:center; justify-content:center; cursor:pointer; overflow:hidden;">${previewInner}</div>
              <input type="file" accept="image/*" id="admin-gacha-machine-input" style="display:none;" onchange="adminUploadGachaMachineImage(this)">
              <div style="display:flex; flex-direction:column; gap:6px;">
                <button type="button" class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="document.getElementById('admin-gacha-machine-input').click()">上傳新圖片</button>
                ${url ? `<button type="button" class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="adminRemoveGachaMachineImage()">還原做預設圖</button>` : ''}
              </div>
            </div>
          </div>
        `;
      }

      function renderStickerTable() {
        const pool = adminGachaDraft.stickers;
        const totalWeight = pool.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0);

        const rows = pool.map((p, idx) => {
          const pct = totalWeight > 0 ? ((parseFloat(p.weight) || 0) / totalWeight * 100).toFixed(1) : '0.0';
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
                <div id="${thumbId}" onclick="document.getElementById('${inputId}').click()" title="點擊這裡上傳圖片" style="width:44px; height:44px; border-radius:8px; background:#F0F6F8; border:1px dashed #B3D6DE; display:flex; align-items:center; justify-content:center; cursor:pointer; overflow:hidden;">${thumbInner}</div>
                <input type="file" accept="image/*" id="${inputId}" style="display:none;" onchange="adminUploadGachaPhoto(${idx},this)">
                ${p.photo ? `<button type="button" class="btn btn-outline" style="font-size:13px; padding:1px 6px;" onclick="adminRemoveGachaPhoto(${idx})">移除圖片</button>` : ''}
              </div>
            </td>
            <td><input class="admin-input-sm" value="${escapeHtml(p.name || '')}" onchange="adminUpdateGachaField(${idx},'name',this.value)"></td>
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
              <h3 style="font-size:15px; font-weight:bold; color:var(--brand-800);">Ottiee 貼紙圖鑑（共 ${pool.length} 隻）</h3>
              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                <button class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="adminNormalizeGachaWeights()">調整為剛好 100</button>
                <button class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="adminRenumberGachaStickers()">重新排序編號</button>
                <button class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="adminAddGachaPrize()">新增貼紙</button>
              </div>
            </div>
            <p style="font-size:13px; color:#888; margin-bottom:8px;">貼紙編號（#id）對應用戶收集圖鑑的位置，刪除貼紙之後編號會留下缺口（例如刪除 #13~#17 之後就由 #12 跳到 #18），這不影響扭蛋／收集功能，純粹是畫面上不美觀。如果想整理，點擊「重新排序編號」會將現存貼紙由上到下重新編為 1、2、3...連續號碼——但要留意：如果已經有真實學生扭過蛋、收藏了某幾張貼紙，重新編號會令他們原有的收藏對應不上新編號（貼紙會「變成另一張」），所以這個按鈕只適合在未有學生正式使用過、或者您願意接受重整所有人收藏記錄的情況下才點擊。</p>
            <div style="overflow-x:auto;">
              <table class="admin-table">
                <thead><tr><th>#</th><th>圖片</th><th>貼紙名稱</th><th>機率權重</th><th></th></tr></thead>
                <tbody>${rows || '<tr><td colspan="5" style="text-align:center; color:#999; padding:16px;">未有貼紙，請點擊「新增貼紙」開始</td></tr>'}</tbody>
              </table>
            </div>
            <p style="font-size:13px; color:#888; margin-top:8px;">總權重：<span id="admin-gacha-total">${totalWeight}</span>（右邊「≈ %」欄會在你輸入數字時即時更新，點擊「調整為剛好 100」會將所有權重等比例縮放到剛好合計等於 100，之後那個 % 就會與權重數字一致）</p>
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

        ${renderMachineImageCard()}

        ${renderStickerTable()}

        <div style="display:flex; gap:8px; justify-content:flex-end;">
          <button class="btn btn-outline" type="button" onclick="adminResetGachaDraft()">還原未儲存的改動</button>
          <button class="btn btn-primary" type="button" id="btn-admin-save-gacha" onclick="adminSaveGachaConfig()">儲存全部改動</button>
        </div>
      `;
    }
    window.renderAdminGachaTab = renderAdminGachaTab;

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
      const total = pool.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0);

      pool.forEach((p, i) => {
        const pctEl = document.getElementById(`admin-gacha-pct-${i}`);
        if (pctEl) {
          const pct = total > 0 ? ((parseFloat(p.weight) || 0) / total * 100).toFixed(1) : '0.0';
          pctEl.innerText = `≈ ${pct}%`;
        }
      });

      const totalEl = document.getElementById('admin-gacha-total');
      if (totalEl) totalEl.innerText = total;
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
        const { blob, mimeType } = await compressImageFileToBlob(file, 300, 0.75);
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
        const { blob, mimeType } = await compressImageFileToBlob(file, 400, 0.85);
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
      const pool = adminGachaDraft.stickers;
      const total = pool.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0);
      if (total <= 0) {
        window.showToast('所有權重都是 0，沒辦法調整', '⚠️');
        return;
      }
      let runningTotal = 0;
      pool.forEach((p, i) => {
        if (i === pool.length - 1) {
          // 最後一項用「100 減去其他項總和」嚟湊夠 100，避免四捨五入之後
          // 加埋唔啱好係 100（例如 33.3+33.3+33.3=99.9 呢種情況）
          p.weight = Math.max(0, 100 - runningTotal);
        } else {
          const w = Math.round((parseFloat(p.weight) || 0) / total * 100);
          p.weight = w;
          runningTotal += w;
        }
      });
      renderAdminGachaTab();
      window.showToast('已將權重調整為合計等於 100', '⚖️');
    };

    window.adminAddGachaPrize = function() {
      if (!adminGachaDraft) return;
      const pool = adminGachaDraft.stickers;
      const nextId = pool.length ? Math.max(...pool.map(p => p.id || 0)) + 1 : 1;
      pool.push({ id: nextId, emoji: '🦦', name: `Ottiee 貼紙 #${String(nextId).padStart(2, '0')}`, photo: null, weight: 1 });
      renderAdminGachaTab();
    };

    window.adminRemoveGachaPrize = function(idx) {
      if (!adminGachaDraft) return;
      if (!confirm('確定刪除這隻貼紙？若已經有用戶擁有，其收集紀錄中這隻貼紙會保留，但在圖鑑中將不再顯示。')) return;
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
    window.adminRenumberGachaStickers = function() {
      if (!adminGachaDraft || !adminGachaDraft.stickers.length) return;
      if (!confirm('重新排序編號會將貼紙 id 由 1 開始重新連續編號。\n\n如果已經有真實學生使用這個扭蛋機扭過蛋、收藏了某幾隻貼紙，他們原有的收藏會因為編號改變而對應不上（貼紙會「變成另一隻」）。如果尚未有學生正式使用過，或者你願意接受洗牌整批收藏記錄，才繼續。\n\n確定要重新編號？')) return;
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
        window.showToast('最少要有一隻貼紙先可以儲存', '⚠️');
        return;
      }
      const payload = {
        stickers: adminGachaDraft.stickers,
        costNormal: adminGachaDraft.costNormal,
        costLucky: adminGachaDraft.costLucky,
        machineImageUrl: adminGachaDraft.machineImageUrl || null,
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
          if (typeof data.costNormal === 'number') GACHA_COST.normal = data.costNormal;
          if (typeof data.costLucky === 'number') GACHA_COST.lucky = data.costLucky;
          // 扭蛋機外殼圖片：如果管理員上傳咗自訂圖，用返嗰張；冇嘅話
          // window.GACHA_MACHINE_IMAGE_URL 保持 null，畫面繼續用返
          // <img> tag 原本寫死嘅 gacha-machine.png 預設圖。
          window.GACHA_MACHINE_IMAGE_URL = (typeof data.machineImageUrl === 'string' && data.machineImageUrl) ? data.machineImageUrl : null;
          const machineImgEl = document.getElementById('gacha-machine-img');
          if (machineImgEl) machineImgEl.src = window.GACHA_MACHINE_IMAGE_URL || 'gacha-machine.png';
        }
        gachaConfigLoaded = true;
        applyGachaCostToUI();
        if (typeof updateStickerProgressUI === 'function') updateStickerProgressUI();
        // 貼紙資料（相片）依家先攞齊，如果用家揀咗貼紙做水獺頭像，要
        // 喺呢度補叫多一次先會顯示到啱嘅相（登入嗰陣呢份資料仲未到）
        if (typeof updateOtterDisplay === 'function') updateOtterDisplay();
        // 如果管理員岩岩好打開緊「扭蛋機獎品」呢個分頁、又仲未開始編輯
        // （adminGachaDraft 仲係 null，即係岩岩好卡喺「載入中...」嗰個畫面），
        // 而家攞到資料喇，即刻幫佢用返最新（剛儲存低嗰份）資料重新 render 一次，
        // 唔使佢自己撳一撳個分頁先會刷新
        if (currentAdminTab === 'gacha' && !adminGachaDraft) {
          const adminPanelEl = document.getElementById('admin-panel-container');
          if (adminPanelEl && adminPanelEl.style.display !== 'none') {
            renderAdminGachaTab();
          }
        }
      }, (err) => {
        console.error('讀取扭蛋機設定失敗:', err);
        gachaConfigLoaded = true; // 唔好卡死喺「載入中...」畫面，起碼俾程式碼入面嘅預設值可以用
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

      const ranksCards = adminLevelDraft.ranks.map((r, idx) => `
        <div style="display:flex; gap:12px; align-items:flex-start; flex-wrap:wrap; padding:12px; border:1px solid var(--brand-200); border-radius:10px; margin-bottom:10px; background:#fff;">
          <div style="text-align:center; flex-shrink:0;">
            ${r.photo
              ? `<img src="${r.photo}" style="width:64px; height:64px; object-fit:cover; border-radius:50%; border:2px solid #C08B57;">`
              : `<div style="width:64px; height:64px; border-radius:50%; background:#eee; display:flex; align-items:center; justify-content:center; font-size:13px; color:#999; text-align:center;">預設插畫</div>`}
            <input type="file" accept="image/*" style="font-size:13px; margin-top:4px; max-width:100px;" onchange="adminUploadRankPhoto(${idx}, this)">
            ${r.photo ? `<button class="btn btn-outline" style="font-size:13px; padding:2px 6px; margin-top:2px;" onclick="adminRemoveRankPhoto(${idx})">移除</button>` : ''}
          </div>
          <div style="flex:1; min-width:240px; display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
            <label style="font-size:13px; color:#555; display:flex; align-items:center; gap:4px;">等級門檻
              <input class="admin-input-sm" type="number" min="1" style="width:55px;" value="${r.minLevel}" onchange="adminLevelDraft.ranks[${idx}].minLevel = parseInt(this.value)||1">
            </label>
            <label style="font-size:13px; color:#555; display:flex; align-items:center; gap:4px;">稱號(中)
              <input class="admin-input-sm" style="width:90px;" value="${escapeHtml(r.title || '')}" onchange="adminLevelDraft.ranks[${idx}].title = this.value">
            </label>
            <label style="font-size:13px; color:#555; display:flex; align-items:center; gap:4px;">稱號(英)
              <input class="admin-input-sm" style="width:100px;" value="${escapeHtml(r.titleEn || '')}" onchange="adminLevelDraft.ranks[${idx}].titleEn = this.value">
            </label>
            <label style="font-size:13px; color:#555; display:flex; align-items:center; gap:4px;">顏色
              <input type="color" style="width:36px; height:26px; padding:1px; border:1px solid #ccc; border-radius:4px;" value="${r.color || '#4A8FA0'}" onchange="adminLevelDraft.ranks[${idx}].color = this.value">
            </label>
            <label style="font-size:13px; color:#555; display:flex; align-items:flex-start; gap:4px; width:100%;">升級詳情文字（用戶點擊「Lv.」列會彈出視窗顯示）
              <textarea class="admin-input-sm" rows="2" style="flex:1; min-width:200px; resize:vertical;" oninput="adminLevelDraft.ranks[${idx}].desc = this.value">${escapeHtml(r.desc || '')}</textarea>
            </label>
          </div>
          <button class="btn btn-red" style="font-size:13px; padding:3px 8px; flex-shrink:0;" onclick="adminRemoveLevelRank(${idx})">刪除段位</button>
        </div>
      `).join('');

      container.innerHTML = `
        <div class="admin-card">
          <h3 style="font-size:14px; font-weight:bold; margin-bottom:8px;">基本設定</h3>
          <div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:10px;">
            <label style="font-size:13px; color:#555; display:flex; align-items:center; gap:6px;">
              每溫習 1 分鐘可得 EXP：
              <input class="admin-input-sm" type="number" min="0" step="0.1" style="width:70px;" value="${adminLevelDraft.expPerMinute}" oninput="adminLevelDraft.expPerMinute = parseFloat(this.value)||0; adminRefreshLevelPreview();">
            </label>
            <label style="font-size:13px; color:#555; display:flex; align-items:center; gap:6px;">
              升級難度係數：
              <input class="admin-input-sm" type="number" min="1" step="1" style="width:70px;" value="${adminLevelDraft.levelCurveFactor}" oninput="adminLevelDraft.levelCurveFactor = parseFloat(this.value)||10; adminRefreshLevelPreview();">
            </label>
          </div>
          <p style="font-size:13px; color:#888;">公式：升到第 L 級總共需要的 EXP = 難度係數 × L × (L−1)。難度係數越大，升級越慢。</p>
          <p id="admin-level-preview" style="font-size:13px; color:#4A8FA0; font-weight:bold; margin-top:6px;"></p>
        </div>

        <div class="admin-card" style="margin-top:12px;">
          <h3 style="font-size:14px; font-weight:bold; margin-bottom:4px;">段位稱號 + 水獺造型（由低到高，建議第一行等級門檻＝1）</h3>
          <p style="font-size:13px; color:#888; margin-bottom:10px;">每個段位可以上傳專屬水獺相片，用家升到那個等級，主頁「我的水獺」就會自動換成那張相；不上傳則使用共用的預設插畫（有心情表情變化）。</p>
          <div>${ranksCards}</div>
          <button class="btn btn-outline" style="margin-top:4px; font-size:13px;" onclick="adminAddLevelRank()">新增段位</button>
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
      const sample = [10, 20, 40, 60].map(L => {
        const needExp = f * L * (L - 1);
        const mins = perMin > 0 ? needExp / perMin : Infinity;
        const hrs = isFinite(mins) ? (mins / 60).toFixed(0) : '∞';
        return `Lv.${L}≈${hrs}h`;
      }).join('　');
      el.innerText = `預覽：溫習到 ${sample}`;
    };

    window.adminAddLevelRank = function() {
      if (!adminLevelDraft) return;
      adminLevelDraft.ranks.push({ minLevel: 1, emoji: '🌟', title: '新段位', titleEn: 'NewRank', color: '#4A8FA0', desc: '' });
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
        ranks: adminLevelDraft.ranks
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
          if (Array.isArray(data.ranks) && data.ranks.length) LEVEL_CONFIG.ranks = data.ranks;
        }
        levelConfigLoaded = true;
        if (window.currentUser) {
          updateLevelDisplay();
          // 段位嘅水獺相片就係喺呢個設定入面，一齊刷新，唔使等5分鐘嗰個定時器先見到
          updateOtterDisplay();
        }
        if (currentAdminTab === 'level' && !adminLevelDraft) {
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
      if (!confirm(`確定要強制關閉房間「${roomName}」？裡面的同學會即時被移至大廳。`)) return;
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
      if (!confirm('確定刪除這個提問？裡面的留言都會一齊清埋。')) return;
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
    let adminUsersGradeGroup = 'school'; // 'school' | 'other'
    // 最新一次 onSnapshot 返嚟嘅用戶清單，快取喺度，等切換分頁嗰陣可以
    // 即刻用返呢份資料重新畫table，唔使重新監聽一次 collection。
    let adminUsersLastSortedDocs = null;

    window.switchAdminUsersGradeGroup = function(group) {
      adminUsersGradeGroup = (group === 'other') ? 'other' : 'school';
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
        const grade = docSnap.data().grade || '';
        const isOther = grade === '其他自修生';
        return adminUsersGradeGroup === 'other' ? isOther : !isOther;
      });

      const rows = filteredDocs.map(docSnap => {
        const u = docSnap.data();
        const uid = docSnap.id;
        const suspended = !!u.suspended;
        // Email 欄顯示用戶註冊時真正填嘅聯絡電郵（contactEmail）；呢個先係
        // 佢哋自己打嗰個地址。u.email 其實係內部合成嘅登入用電郵
        // （{帳號ID}@concenmate.local，唔係真實可送達嘅地址），舊帳號冇
        // contactEmail 先 fallback 用返佢
        const displayEmail = u.contactEmail || u.email || '—';
        return `
          <tr style="${suspended ? 'opacity:.55;' : ''}">
            <td>${escapeHtml(u.username || '—')}${suspended ? ' <span style="color:#c0392b; font-size:13px;">(已停權)</span>' : ''}</td>
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
              <button class="btn ${suspended ? 'btn-primary' : 'btn-red'}" style="font-size:13px; padding:3px 8px;" onclick="adminToggleSuspendUser('${uid}', ${!suspended})">${suspended ? '解除停權' : '停權'}</button>
            </td>
          </tr>
        `;
      }).join('');

      const emptyGroupMsg = '<tr><td colspan="9" style="text-align:center; color:#999; padding:16px;">此分類目前沒有用戶</td></tr>';

      container.innerHTML = `
        <div class="admin-card">
          <p style="font-size:13px; color:#888; margin-bottom:10px;">修改積分／時數／EXP 後，請記得逐行點擊「儲存」；EXP 決定用戶的溫習等級與段位，一般毋須人手修改，只有在特殊情況（例如補發）才使用。「停權」會令該用戶下次登入時被強制登出。</p>
          <div style="display:flex; gap:8px; margin-bottom:12px;">
            <button type="button" class="btn ${adminUsersGradeGroup === 'school' ? 'btn-primary' : 'btn-outline'}" style="font-size:13px; padding:5px 12px;" onclick="switchAdminUsersGradeGroup('school')">中學／大專／大學</button>
            <button type="button" class="btn ${adminUsersGradeGroup === 'other' ? 'btn-primary' : 'btn-outline'}" style="font-size:13px; padding:5px 12px;" onclick="switchAdminUsersGradeGroup('other')">其他／自修生</button>
          </div>
          <div style="overflow-x:auto;">
            <table class="admin-table">
              <thead><tr><th>用戶名</th><th>帳號 ID</th><th>Email</th><th>學校</th><th>年級</th><th>最後上線</th><th>積分</th><th>時數</th><th>EXP</th><th></th></tr></thead>
              <tbody>${rows || emptyGroupMsg}</tbody>
            </table>
          </div>
        </div>
      `;
    }

    function renderAdminUsersTab() {
      const container = document.getElementById('admin-tab-users');
      if (!container || !window.db || !window.fs) return;
      container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">載入中用戶資料...</p>';

      if (adminUsersUnsubscribe) adminUsersUnsubscribe();
      adminUsersUnsubscribe = window.fs.onSnapshot(window.fs.collection(window.db, 'users'), (snapshot) => {
        // 按建立時間由舊到新排（唔靠 Firestore 讀出嚟嗰個順序，實測唔一定係
        // 建立順序）；createdAt 舊帳號可能冇呢個欄位，冇嘅當做「最舊」排最前，
        // 唔會搞亂晒個排序
        adminUsersLastSortedDocs = [...snapshot.docs].sort((a, b) => {
          const ta = new Date(a.data().createdAt || 0).getTime() || 0;
          const tb = new Date(b.data().createdAt || 0).getTime() || 0;
          return ta - tb;
        });
        renderAdminUsersTable();
      }, (err) => {
        container.innerHTML = `<div class="admin-card" style="color:#c0392b;">載入失敗：${err.message || err}</div>`;
      });
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

    window.adminToggleSuspendUser = async function(uid, suspend) {
      if (!confirm(suspend ? '確定停權這個帳戶？他下次登入會被強制登出。' : '確定解除這個帳戶的停權？')) return;
      try {
        await window.fs.updateDoc(window.fs.doc(window.db, 'users', uid), { suspended: suspend });
        await logAdminAction(suspend ? '停權用戶' : '解除停權', { uid });
        window.showToast(suspend ? '已停權該帳戶' : '已解除停權', suspend ? '🚫' : '✅');
      } catch (err) {
        window.showToast('操作失敗：' + (err.message || err), '❌');
      }
    };

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
            ${r.reportedUid ? `<button class="btn btn-red" style="font-size:13px; padding:4px 9px;" onclick="window.adminSuspendFromReport('${reportId}', '${r.reportedUid}')">停權此帳戶</button>` : ''}
            ${status !== 'pending' ? `<button class="btn btn-outline" style="font-size:13px; padding:4px 9px; color:#999; border-color:#ccc;" onclick="window.adminDeleteReport('${reportId}')">刪除紀錄</button>` : ''}
          </div>
        </div>
      `;
    }

    function renderAdminReportsListUI() {
      const container = document.getElementById('admin-tab-reports');
      if (!container) return;
      if (adminReportsLoadedDocs.length === 0) {
        container.innerHTML = '<div class="admin-card" style="text-align:center; color:#999;">目前沒有任何舉報記錄</div>';
        return;
      }
      const cards = adminReportsLoadedDocs.map(buildAdminReportCardHtml).join('');
      const loadMoreHtml = adminReportsAllLoaded
        ? ''
        : `<div style="text-align:center; margin-top:12px;">
             <button class="btn btn-outline" id="admin-reports-load-more-btn" type="button" onclick="window.adminLoadMoreReports()">載入更多（已顯示 ${adminReportsLoadedDocs.length} 則）</button>
           </div>`;
      container.innerHTML = `
        <div style="margin-bottom:10px; background:#FFF7E6; border:1px solid #F0D9A0; border-radius:8px; padding:8px 10px; font-size:13px; color:#8a6d1f;">
          技術上的重要提醒：這個網站沒有獨立伺服器，只是使用 Firebase，所以這裡看不到、也無法做到真正的「IP 封鎖」（因為 Firestore 規則看不到用戶的真實 IP）。「停權」這個功能就確實有效——會即刻令該帳戶下次登入被強制登出，亦令他完全無法使用這個平台。
        </div>
        ${cards}
        ${loadMoreHtml}
      `;
    }

    function renderAdminReportsTab() {
      const container = document.getElementById('admin-tab-reports');
      if (!container || !window.db || !window.fs) return;
      container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">載入中舉報記錄...</p>';

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

    window.adminSuspendFromReport = async function(reportId, reportedUid) {
      if (!confirm('確定停權這個被舉報的帳戶？他下次登入會被強制登出。')) return;
      try {
        await window.fs.updateDoc(window.fs.doc(window.db, 'users', reportedUid), { suspended: true });
        await window.fs.updateDoc(window.fs.doc(window.db, 'reports', reportId), { status: 'reviewed' });
        await logAdminAction('因舉報停權用戶', { reportId, reportedUid });
        window.showToast('已停權該帳戶', '🚫');
      } catch (err) {
        window.showToast('操作失敗：' + (err.message || err), '❌');
      }
    };

    // 淨係已經處理完（已駁回／已處理）嘅舉報先俾刪，pending 嘅唔會出呢粒掣，
    // 避免管理員手快手滑刪走仲未跟進嘅證據
    window.adminDeleteReport = async function(reportId) {
      if (!confirm('確定刪除這一則已處理的舉報紀錄？連同截圖一併刪除，刪除後將無法復原。')) return;
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
      { key: 'home', label: '主頁', emoji: '🏠' },
      { key: 'room', label: '視訊溫習室', emoji: '📹' },
      { key: 'qa', label: '疑難解答區', emoji: '❓' },
      { key: 'vip', label: '教材中心', emoji: '👑' },
      { key: 'store', label: '時數扭蛋機', emoji: '🎁' },
      { key: 'social', label: '夥伴與讀書會', emoji: '👥' },
      { key: 'verification', label: '學生身份驗證', emoji: '🎓' },
      { key: 'roomLock', label: '房間密碼鎖（房內查看密碼按鈕）', emoji: '🔒' }
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
          : escapeHtml(item.emoji);
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
          : `<span style="font-size:22px;">${escapeHtml(item.emoji)}</span>`;
        return `
          <div style="display:flex; align-items:center; gap:14px; padding:10px 0; border-bottom:1px solid #F0F0F0;">
            <div id="${thumbId}" onclick="document.getElementById('${inputId}').click()" title="點擊這裡上傳圖片" style="width:52px; height:52px; border-radius:10px; background:#F0F6F8; border:1px dashed #B3D6DE; display:flex; align-items:center; justify-content:center; cursor:pointer; overflow:hidden; flex-shrink:0;">${thumbInner}</div>
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
        if (currentAdminTab === 'icons' && !adminNavIconsDraft) {
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
        .map(s => `<span class="tag" style="background:#F0F6F8; color:#1E4550; margin-right:4px;">${escapeHtml(s)}</span>`)
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
        .map(s => `<span class="tag" style="background:#F0F6F8; color:#1E4550; margin-right:4px;">${escapeHtml(s)}</span>`)
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
      if (!confirm('確定批准這個導師申請？批准之後該用戶會立即獲得導師身份。')) return;
      try {
        await window.callCloudFunction('approveTutorApplication', { targetUid: uid });
        await logAdminAction('批准導師申請', { uid });
        window.showToast('已批准導師申請', '✅');
      } catch (err) {
        window.showToast('批准失敗：' + (err.message || err), '❌');
      }
    };

    window.adminRejectTutorApp = async function(uid) {
      const reason = prompt('駁回原因（會顯示給申請人查看，可以留空）：', '');
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
      if (!confirm('確定停權這位導師？其已上架的筆記會自動下架，但已購買的學生保留下載權。')) return;
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
    // 寫死嘅預設檔案（logo-hero.png／ottie-wave.png）。

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
          { key: 'landing.eyebrow', label: '小標籤' },
          { key: 'landing.heroH1Line1', label: '主標題　第一行' },
          { key: 'landing.heroH1Line2', label: '主標題　第二行' },
          { key: 'landing.slogan', label: '品牌標語（主標題下面嗰句）' },
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
            <div id="admin-landing-${imgKey}-thumb" onclick="document.getElementById('admin-landing-${imgKey}-input').click()" title="點擊這裡上傳圖片" style="width:80px; height:80px; border-radius:10px; background:#F0F6F8; border:1px dashed #B3D6DE; display:flex; align-items:center; justify-content:center; cursor:pointer; overflow:hidden;">${previewInner}</div>
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
            <div style="margin-bottom:16px; padding-bottom:14px; border-bottom:1px solid #EEF3F4;">
              <p style="font-size:13px; font-weight:bold; color:var(--brand-700); margin-bottom:6px;">${f.label}</p>
              <div style="display:grid; grid-template-columns:1fr; gap:6px;">
                <label style="font-size:12px; color:#999;">繁體中文
                  <textarea rows="1" style="width:100%; font-size:14px; padding:6px 8px; border:1px solid #DDE7E9; border-radius:6px; font-family:inherit; resize:vertical;" oninput="adminUpdateLandingText('${f.key}','zh-Hant',this.value)">${v['zh-Hant']}</textarea>
                </label>
                <label style="font-size:12px; color:#999;">English
                  <textarea rows="1" style="width:100%; font-size:14px; padding:6px 8px; border:1px solid #DDE7E9; border-radius:6px; font-family:inherit; resize:vertical;" oninput="adminUpdateLandingText('${f.key}','en',this.value)">${v['en']}</textarea>
                </label>
                <label style="font-size:12px; color:#999;">廣東話
                  <textarea rows="1" style="width:100%; font-size:14px; padding:6px 8px; border:1px solid #DDE7E9; border-radius:6px; font-family:inherit; resize:vertical;" oninput="adminUpdateLandingText('${f.key}','yue',this.value)">${v['yue']}</textarea>
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
        <p style="font-size:13px; color:#888; margin-bottom:14px;">呢度改嘅文字就係未登入訪客打開網站第一眼見到嘅 Landing page 內容，三種語言可以分開改，改完撳最底「儲存全部改動」就會即時全站生效（包括未登入嘅訪客），唔使搵開發者改 code。</p>
        ${renderAdminLandingImageCard('navLogoUrl', '導覽列 Logo', '顯示喺 Landing page 頂部導覽列嘅 Logo 圖案。', 'logo-hero.png')}
        ${renderAdminLandingImageCard('heroImageUrl', '主橫幅吉祥物圖', '顯示喺主橫幅中間嘅 Ottiee 吉祥物圖案。', 'ottie-wave.png')}
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
          if (navLogoEl) navLogoEl.src = (data.images && data.images.navLogoUrl) ? data.images.navLogoUrl : 'logo-hero.png';
          const heroImgEl = document.getElementById('landing-hero-mascot-img');
          if (heroImgEl) heroImgEl.src = (data.images && data.images.heroImageUrl) ? data.images.heroImageUrl : 'ottie-wave.png';
        }
        landingConfigLoaded = true;
        if (typeof window.applyAppLanguage === 'function') window.applyAppLanguage();
        // 如果管理員岩岩好打開緊「Landing page文案」呢個分頁、又仲未開始
        // 編輯（adminLandingDraft 仲係 null，卡喺「載入中...」畫面），
        // 而家攞到資料喇，即刻幫佢重新 render 一次。
        if (currentAdminTab === 'landing' && !adminLandingDraft) {
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
      const container = document.getElementById('admin-tab-scoring');
      if (!container) return;

      if (!adminScoringDraft) {
        if (!scoringConfigLoaded) {
          container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">載入中計分規則設定...</p>';
          return; // Firestore 資料一到，loadScoringRulesFromFirestore() 會自動再 render 多次
        }
        adminScoringDraft = {
          ptsPerMinute: window.SCORING_RULES ? window.SCORING_RULES.ptsPerMinute : 1,
          presenceCheckBonus: window.SCORING_RULES ? window.SCORING_RULES.presenceCheckBonus : 2
        };
      }

      container.innerHTML = `
        <div class="admin-card">
          <h3 style="font-size:16px; font-weight:bold; color:var(--brand-800); margin-bottom:14px;">視訊溫習室計分規則</h3>
          <p style="font-size:13px; color:#888; margin-bottom:16px;">呢度嘅數值會即時影響全站學生喺視訊溫習室可以賺到幾多PTS，改完記得核實清楚先撳儲存。</p>
          <div style="margin-bottom:18px;">
            <label style="font-size:13px; font-weight:bold; color:var(--brand-700); display:block; margin-bottom:6px;">每專注溫習 1 分鐘，可獲得幾多 PTS</label>
            <input type="number" min="1" step="1" value="${adminScoringDraft.ptsPerMinute}" style="width:120px; font-size:15px; padding:8px 10px; border:1px solid #DDE7E9; border-radius:6px;" oninput="adminUpdateScoringDraft('ptsPerMinute', this.value)">
          </div>
          <div style="margin-bottom:10px;">
            <label style="font-size:13px; font-weight:bold; color:var(--brand-700); display:block; margin-bottom:6px;">確認「仍在學習」彈窗，額外可獲得幾多 PTS</label>
            <input type="number" min="1" step="1" value="${adminScoringDraft.presenceCheckBonus}" style="width:120px; font-size:15px; padding:8px 10px; border:1px solid #DDE7E9; border-radius:6px;" oninput="adminUpdateScoringDraft('presenceCheckBonus', this.value)">
          </div>
        </div>
        <div style="text-align:center; margin-top:16px;">
          <button type="button" class="btn btn-primary" id="btn-admin-save-scoring" style="padding:12px 32px; font-size:15px;" onclick="adminSaveScoringRules()">儲存全部改動</button>
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
        if (btn) { btn.disabled = false; btn.innerText = '儲存全部改動'; }
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
        if (currentAdminTab === 'scoring' && !adminScoringDraft) {
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
        <div class="admin-card">
          <h3 style="font-size:16px; font-weight:bold; color:var(--brand-800); margin-bottom:14px;">人數上限選項</h3>
          <p style="font-size:13px; color:#888; margin-bottom:16px;">揀選學生建立溫習房嗰陣可以選擇嘅人數上限（固定只有 2 人房／4 人房兩種，因為視訊畫面格位設計只支援呢兩種排法）。</p>
          <label style="display:flex; align-items:center; gap:8px; font-size:14px; margin-bottom:10px; cursor:pointer;">
            <input type="checkbox" ${d.capacity2Enabled ? 'checked' : ''} onchange="adminUpdateRoomSettingsDraft('capacity2Enabled', this.checked)"> 開放「2 人房」選項
          </label>
          <label style="display:flex; align-items:center; gap:8px; font-size:14px; margin-bottom:16px; cursor:pointer;">
            <input type="checkbox" ${d.capacity4Enabled ? 'checked' : ''} onchange="adminUpdateRoomSettingsDraft('capacity4Enabled', this.checked)"> 開放「4 人房」選項
          </label>
          <div>
            <label style="font-size:13px; font-weight:bold; color:var(--brand-700); display:block; margin-bottom:6px;">預設人數上限（表格一開啟時預先揀好嗰個）</label>
            <select style="width:160px; font-size:15px; padding:8px 10px; border:1px solid #DDE7E9; border-radius:6px;" onchange="adminUpdateRoomSettingsDraft('defaultCapacity', this.value)">
              ${capacityChoicesNow.map(n => `<option value="${n}" ${d.defaultCapacity === n ? 'selected' : ''}>${n} 人房</option>`).join('') || '<option value="">（請先開放最少一個選項）</option>'}
            </select>
          </div>
        </div>
        <div class="admin-card" style="margin-top:16px;">
          <h3 style="font-size:16px; font-weight:bold; color:var(--brand-800); margin-bottom:14px;">預計溫習時間選項</h3>
          <p style="font-size:13px; color:#888; margin-bottom:16px;">呢個時間純粹顯示喺公開大廳嘅房間列表，畀其他同學參考，房間唔會因為時間到而自動結束。可以自由加減分鐘數選項。</p>
          <div style="margin-bottom:16px;">
            <label style="font-size:13px; font-weight:bold; color:var(--brand-700); display:block; margin-bottom:6px;">分鐘數選項（用逗號分隔，例如：15, 30, 40, 45, 60）</label>
            <input type="text" value="${d.durationOptionsText}" style="width:100%; max-width:420px; font-size:15px; padding:8px 10px; border:1px solid #DDE7E9; border-radius:6px;" oninput="adminUpdateRoomSettingsDraft('durationOptionsText', this.value)">
          </div>
          <div>
            <label style="font-size:13px; font-weight:bold; color:var(--brand-700); display:block; margin-bottom:6px;">預設溫習時間（分鐘，表格一開啟時預先揀好嗰個）</label>
            <input type="number" min="1" step="1" value="${d.defaultDuration}" style="width:160px; font-size:15px; padding:8px 10px; border:1px solid #DDE7E9; border-radius:6px;" oninput="adminUpdateRoomSettingsDraft('defaultDuration', this.value)">
          </div>
        </div>
        <div style="text-align:center; margin-top:16px;">
          <button type="button" class="btn btn-primary" id="btn-admin-save-roomsettings" style="padding:12px 32px; font-size:15px;" onclick="adminSaveRoomSettings()">儲存全部改動</button>
        </div>
      `;
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
        window.showToast('「2 人房」同「4 人房」唔可以兩個都關埋，最少要開放一個', '⚠️');
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
        window.showToast('最少要有一個有效嘅溫習時間選項（正整數分鐘數）', '⚠️');
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
        if (currentAdminTab === 'roomsettings' && !adminRoomSettingsDraft) {
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
          <p style="font-size:13px; color:#888; margin-bottom:16px;">呢組數值用嚟防止學生掛機／開住鏡頭唔理攞盡計分。單位全部係「分鐘」，改完記得核實清楚先撳儲存；已經喺房入面嘅學生唔會即時生效，要等佢哋下次入房／下次開咪先跟新數值。</p>
          ${ANTI_IDLE_FIELDS.map(f => `
            <div style="margin-bottom:16px;">
              <label style="font-size:13px; font-weight:bold; color:var(--brand-700); display:block; margin-bottom:6px;">${f.label}</label>
              <input type="number" min="1" step="1" value="${d[f.key]}" style="width:120px; font-size:15px; padding:8px 10px; border:1px solid #DDE7E9; border-radius:6px;" oninput="adminUpdateAntiIdleDraft('${f.key}', this.value)"> 分鐘
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
        window.showToast('防掛機參數已儲存，即時對所有用戶生效（已喺房入面嘅學生要下次入房／開咪先會跟新數值）！', '🎉');
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
        if (currentAdminTab === 'antiidle' && !adminAntiIdleDraft) {
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
          <p style="font-size:13px; color:#888; margin:0;">數據截至：${lastUpdateText}（讀取當刻嘅快照，唔會自動即時更新，想攞最新數字就撳右邊個掣）</p>
          <button type="button" class="btn btn-outline" style="font-size:13px; padding:6px 14px;" ${refreshingNow ? 'disabled' : ''} onclick="window.adminRefreshDashboard()">${refreshingNow ? '更新中…' : '🔄 重新整理'}</button>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:14px;">
          ${cards.map(c => `
            <div class="admin-card" style="text-align:center;">
              <div style="font-size:28px; font-weight:800; color:var(--brand-800);">${c.value}</div>
              <div style="font-size:13px; color:#888; margin-top:6px;">${c.label}</div>
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
          <p style="font-size:13px; color:#888; margin-bottom:16px;">顯示喺成個網站最頂（登入前Landing page同登入後主應用都會見到）。訪客可以撳 ✕ 自行收埋，收埋之後除非你改咗底下嘅文字，否則唔會再跳出嚟煩佢。</p>
          <label style="display:flex; align-items:center; gap:8px; font-size:14px; margin-bottom:18px; cursor:pointer;">
            <input type="checkbox" ${d.enabled ? 'checked' : ''} onchange="adminUpdateAnnouncementDraft('enabled', this.checked)"> 開啟公告橫幅
          </label>
          <div style="margin-bottom:18px;">
            <label style="font-size:13px; font-weight:bold; color:var(--brand-700); display:block; margin-bottom:6px;">顏色／緊急程度</label>
            <select style="width:220px; font-size:15px; padding:8px 10px; border:1px solid #DDE7E9; border-radius:6px;" onchange="adminUpdateAnnouncementDraft('type', this.value)">
              ${typeOptions.map(o => `<option value="${o.v}" ${d.type === o.v ? 'selected' : ''}>${o.label}</option>`).join('')}
            </select>
          </div>
          <div style="margin-bottom:14px;">
            <label style="font-size:13px; font-weight:bold; color:var(--brand-700); display:block; margin-bottom:6px;">公告內容（繁體中文）</label>
            <textarea rows="2" style="width:100%; max-width:560px; font-size:15px; padding:8px 10px; border:1px solid #DDE7E9; border-radius:6px; font-family:inherit;" oninput="adminUpdateAnnouncementMessage('zh-Hant', this.value)">${escapeHtml(d.message['zh-Hant'])}</textarea>
          </div>
          <div style="margin-bottom:14px;">
            <label style="font-size:13px; font-weight:bold; color:var(--brand-700); display:block; margin-bottom:6px;">公告內容（English）</label>
            <textarea rows="2" style="width:100%; max-width:560px; font-size:15px; padding:8px 10px; border:1px solid #DDE7E9; border-radius:6px; font-family:inherit;" oninput="adminUpdateAnnouncementMessage('en', this.value)">${escapeHtml(d.message['en'])}</textarea>
          </div>
          <div>
            <label style="font-size:13px; font-weight:bold; color:var(--brand-700); display:block; margin-bottom:6px;">公告內容（廣東話）</label>
            <textarea rows="2" style="width:100%; max-width:560px; font-size:15px; padding:8px 10px; border:1px solid #DDE7E9; border-radius:6px; font-family:inherit;" oninput="adminUpdateAnnouncementMessage('yue', this.value)">${escapeHtml(d.message['yue'])}</textarea>
          </div>
          <p style="font-size:13px; color:#999; margin-top:6px;">某種語言留空嘅話，揀咗嗰種語言嘅訪客會自動退返顯示繁體中文版本。</p>
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
        window.showToast('開啟公告橫幅之前，最少要填返繁體中文版本嘅內容', '⚠️');
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
        if (currentAdminTab === 'announcement' && !adminAnnouncementDraft) {
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
      const suspended = !!d.suspended;
      const displayEmail = d.contactEmail || d.email || '—';
      const createdMs = typeof d.createdAt === 'number' ? d.createdAt : (d.createdAt ? new Date(d.createdAt).getTime() : 0);
      const createdDisplay = createdMs ? new Date(createdMs).toLocaleString('zh-HK') : '—';
      const lastLoginDisplay = (typeof formatLastLoginDisplay === 'function') ? formatLastLoginDisplay(d.lastLoginAt) : '—';

      const stickerOptions = GACHA_STICKERS.map(s => `<option value="${s.id}" ${adminSupportStickerGrantDraft.stickerId === s.id ? 'selected' : ''}>${escapeHtml(s.name)}（#${s.id}）</option>`).join('');

      return `
        <div class="admin-card">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
            <h3 style="font-size:17px; font-weight:bold; color:var(--brand-800); margin:0;">${escapeHtml(d.username || '—')} ${suspended ? '<span style="color:#c0392b; font-size:13px;">（已停權）</span>' : ''}</h3>
            <button type="button" class="btn ${suspended ? 'btn-primary' : 'btn-red'}" style="font-size:13px; padding:4px 10px;" onclick="adminToggleSuspendUser('${uid}', ${!suspended})">${suspended ? '解除停權' : '停權'}</button>
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:10px; font-size:13px; color:#555; margin-bottom:18px;">
            <div><b>帳號ID：</b>${escapeHtml(d.loginId || '未設定')}</div>
            <div><b>Email：</b>${escapeHtml(displayEmail)}</div>
            <div><b>學校：</b>${escapeHtml(d.school || '—')}</div>
            <div><b>年級：</b>${escapeHtml(d.grade || '—')}</div>
            <div><b>身份：</b>${d.accountType === 'tutor' ? '導師' : '學生'}</div>
            <div><b>現存 PTS：</b>${d.points || 0}</div>
            <div><b>累積時數：</b>${(parseFloat(d.hours) || 0).toFixed(1)}</div>
            <div><b>EXP：</b>${d.exp || 0}</div>
            <div><b>註冊時間：</b>${createdDisplay}</div>
            <div><b>最後上線：</b>${lastLoginDisplay}</div>
          </div>

          <div style="border-top:1px solid #F0F0F0; padding-top:14px; margin-bottom:14px;">
            <h4 style="font-size:14px; font-weight:bold; color:var(--brand-700); margin-bottom:8px;">補發／扣減 PTS</h4>
            <p style="font-size:13px; color:#999; margin-bottom:8px;">正數係補發，負數係扣減（例如處理爭議或者錯誤發放）。</p>
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
              <input type="number" step="1" value="${adminSupportPointsGrantAmount}" style="width:120px; font-size:15px; padding:8px 10px; border:1px solid #DDE7E9; border-radius:6px;" oninput="adminUpdateSupportPointsAmount(this.value)">
              <button type="button" class="btn btn-primary" style="font-size:13px; padding:6px 16px;" onclick="adminGrantSupportPoints('${uid}')">確認</button>
            </div>
          </div>

          <div style="border-top:1px solid #F0F0F0; padding-top:14px;">
            <h4 style="font-size:14px; font-weight:bold; color:var(--brand-700); margin-bottom:8px;">補發貼紙</h4>
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
              <select style="font-size:15px; padding:8px 10px; border:1px solid #DDE7E9; border-radius:6px; max-width:240px;" onchange="adminUpdateSupportStickerDraft('stickerId', this.value)">${stickerOptions}</select>
              <input type="number" min="1" step="1" value="${adminSupportStickerGrantDraft.qty}" style="width:90px; font-size:15px; padding:8px 10px; border:1px solid #DDE7E9; border-radius:6px;" oninput="adminUpdateSupportStickerDraft('qty', this.value)">
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
      const matches = q ? adminSupportUsersCache.filter(u => {
        const d = u.data;
        const hay = [d.username, d.loginId, d.contactEmail, d.email].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      }).slice(0, 20) : [];

      const selected = adminSupportSelectedUid ? adminSupportUsersCache.find(u => u.uid === adminSupportSelectedUid) : null;

      container.innerHTML = `
        <div class="admin-card" style="margin-bottom:16px;">
          <h3 style="font-size:16px; font-weight:bold; color:var(--brand-800); margin-bottom:10px;">搜尋用戶</h3>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            <input type="text" placeholder="輸入帳號ID／用戶名／Email（部分符合都得）" value="${escapeHtml(adminSupportQuery)}" style="flex:1; min-width:220px; font-size:15px; padding:8px 10px; border:1px solid #DDE7E9; border-radius:6px;" oninput="adminUpdateSupportQuery(this.value)">
            <button type="button" class="btn btn-outline" style="font-size:13px; padding:6px 14px;" onclick="window.adminRefreshSupportUsers()">🔄 重新整理資料</button>
          </div>
          <p style="font-size:13px; color:#999; margin-top:8px;">資料讀取於你打開／重新整理呢頁嗰一刻，現共 ${adminSupportUsersCache.length} 位用戶。</p>
          ${q ? `
            <div style="margin-top:12px; max-height:260px; overflow-y:auto;">
              ${matches.length === 0 ? '<p style="color:#999; font-size:13px;">搵唔到相關用戶</p>' : matches.map(u => `
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

    window.adminUpdateSupportQuery = function(value) {
      adminSupportQuery = value;
      renderAdminSupportTab();
    };

    window.adminSelectSupportUser = function(uid) {
      adminSupportSelectedUid = uid;
      adminSupportPointsGrantAmount = 0;
      adminSupportStickerGrantDraft = { stickerId: (GACHA_STICKERS[0] && GACHA_STICKERS[0].id) || null, qty: 1 };
      renderAdminSupportTab();
    };

    window.adminUpdateSupportPointsAmount = function(value) {
      const n = parseInt(value, 10);
      adminSupportPointsGrantAmount = Number.isFinite(n) ? n : 0;
    };

    window.adminGrantSupportPoints = async function(uid) {
      const amount = adminSupportPointsGrantAmount;
      if (!amount) {
        window.showToast('請輸入唔係 0 嘅數值', '⚠️');
        return;
      }
      if (!confirm(`確定要幫呢位用戶${amount > 0 ? '補發' : '扣減'} ${Math.abs(amount)} PTS？`)) return;
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
      if (!confirm(`確定要幫呢位用戶補發 ${qty} 張「${sticker ? sticker.name : '#' + stickerId}」？`)) return;
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
        container.innerHTML = '<div class="admin-card" style="color:#c0392b;">淨係「超級管理員」先睇得到呢頁。</div>';
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
            <select style="font-size:14px; padding:5px 8px; border:1px solid #DDE7E9; border-radius:6px;" onchange="adminUpdateAdminListRole(${idx}, this.value)">
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
          <p style="font-size:13px; color:#888; margin-bottom:10px;"><b>超級管理員</b>見到並用得到全部分頁同設定；<b>客服／支援管理員</b>淨係見到日常客服／巡查用得著嗰幾頁（數據總覽、房間管理、疑難解答區、用戶管理、舉報處理、導師申請、用戶支援），見唔到網站設定（扭蛋機、計分規則等）同呢兩頁管治分頁。</p>
          <p style="font-size:13px; color:#c17a2e; margin-bottom:14px;">⚠️ 呢個分級目前係Admin後台「入口介面」層面嘅限制（控制畫面見唔見到、撳唔撳到嗰啲分頁），唔係Firestore資料庫層面嘅硬性保障——適合互相信任嘅細團隊減少誤觸同簡化介面，唔係防惡意內部人員嘅保安牆。</p>
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
            <input type="text" placeholder="帳號ID（即係用戶登入用嗰個ID，唔係Email）" value="${escapeHtml(d.newLoginId)}" style="flex:1; min-width:220px; font-size:15px; padding:8px 10px; border:1px solid #DDE7E9; border-radius:6px;" oninput="adminUpdateAdminListNewField('newLoginId', this.value)">
            <select style="font-size:15px; padding:8px 10px; border:1px solid #DDE7E9; border-radius:6px;" onchange="adminUpdateAdminListNewField('newRole', this.value)">
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

    window.adminRemoveAdminListEntry = function(idx) {
      if (!adminAdminListDraft || !adminAdminListDraft.entries[idx]) return;
      if (!confirm(`確定要移除「${adminAdminListDraft.entries[idx].loginId}」嘅管理員身份？`)) return;
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
        window.showToast('呢個帳號已經喺管理員名單入面', '⚠️');
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
        window.showToast('管理員名單唔可以清空——你會即刻撳唔返入嚟Admin後台', '⚠️');
        return;
      }
      const superCount = entries.filter(e => e.role === 'super').length;
      if (superCount === 0) {
        window.showToast('最少要有一位「超級管理員」，否則冇人可以再管理呢份名單', '⚠️');
        return;
      }
      const myLoginId = window.currentUser && window.currentUser.loginId;
      const stillAdmin = entries.some(e => e.loginId === myLoginId);
      const stillSuper = entries.some(e => e.loginId === myLoginId && e.role === 'super');
      if (!stillAdmin) {
        if (!confirm('你將會喺呢次儲存之後移除咗自己嘅管理員身份，即刻會撳唔返入嚟Admin後台。確定要咁做？')) return;
      } else if (!stillSuper) {
        if (!confirm('你將會喺呢次儲存之後將自己降做「客服／支援管理員」，即刻會見唔返呢頁同其他設定分頁。確定要咁做？')) return;
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
        container.innerHTML = '<div class="admin-card" style="color:#c0392b;">淨係「超級管理員」先睇得到呢頁。</div>';
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
          <p style="font-size:13px; color:#888; margin:0;">顯示最近 ${adminAuditLogEntries.length} 筆重要操作紀錄（停權、補發分數／貼紙、強制關房、導師審批、管理員名單異動等）。呢個清單讀取於你打開／重新整理呢頁嗰一刻，撳右邊個掣攞最新。</p>
          <button type="button" class="btn btn-outline" style="font-size:13px; padding:6px 14px;" onclick="window.adminRefreshAuditLog()">🔄 重新整理</button>
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
        if (currentAdminTab === 'subjects') {
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
        container.innerHTML = '<div class="admin-card" style="color:#c0392b;">淨係「超級管理員」先睇得到呢頁。</div>';
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
        return `<tr><td>${escapeHtml(s)}</td><td style="color:#888;">${escapeHtml(enName)}</td><td>${isAdded ? '<span style="color:#3E7A8A;">後台新增</span>' : '<span style="color:#999;">內建</span>'}</td></tr>`;
      }).join('');

      container.innerHTML = `
        <div class="admin-card" style="margin-bottom:16px;">
          <p style="font-size:13px; color:#888; margin:0;">呢度顯示全站用緊嘅HKDSE科目清單（導師「想教嘅科目」、教材管理「新增科目」用）。為咗唔累壞舊有已經用緊呢啲科目名嘅帖子／房間／導師申請資料，呢頁淨係可以<b>新增</b>科目，唔支援改名或者刪除——如果新增錯咗，可以搵我手動處理。</p>
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
        window.showToast('呢個科目已經存在喺清單度喇', '⚠️');
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
        if (currentAdminTab === 'districts') {
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
        container.innerHTML = '<div class="admin-card" style="color:#c0392b;">淨係「超級管理員」先睇得到呢頁。</div>';
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
          return `<tr><td>${escapeHtml(d)}</td><td style="color:#888;">${escapeHtml(enName)}</td><td>${isAdded ? '<span style="color:#3E7A8A;">後台新增</span>' : '<span style="color:#999;">內建</span>'}</td></tr>`;
        }).join('');
        return `<p style="font-size:13px; font-weight:bold; margin:12px 0 6px;">${escapeHtml(g.region)}</p><table class="admin-table"><thead><tr><th>地區</th><th>English</th><th>來源</th></tr></thead><tbody>${rows}</tbody></table>`;
      }).join('');
      const regionOptionsHtml = (window.HK_DISTRICT_REGION_GROUPS || []).map((g) => `<option value="${escapeHtml(g.region)}"></option>`).join('');

      container.innerHTML = `
        <div class="admin-card" style="margin-bottom:16px;">
          <p style="font-size:13px; color:#888; margin:0;">呢度顯示全站用緊嘅香港地區清單（註冊表格揀學校地區、分區溫習排行榜用）。同科目清單一樣，淨係可以<b>新增</b>，唔支援改名或者刪除。</p>
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
      if (alreadyExists) { window.showToast('呢個地區已經存在喺清單度喇', '⚠️'); return; }
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
        if (currentAdminTab === 'schools') {
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
        container.innerHTML = '<div class="admin-card" style="color:#c0392b;">淨係「超級管理員」先睇得到呢頁。</div>';
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
      const tertiaryRows = tertiaryAdded.map((t) => `<tr><td>${escapeHtml(t.name)}</td><td style="color:#888;">${t.district ? escapeHtml(t.district) : '常見院校（唔分地區）'}</td></tr>`).join('');

      container.innerHTML = `
        <div class="admin-card" style="margin-bottom:16px;">
          <p style="font-size:13px; color:#888; margin:0;">呢度可以新增註冊表格揀學校用嘅中學／大專院校。同科目清單／地區清單一樣，淨係可以<b>新增</b>，唔支援改名或者刪除。下面表格淨係顯示你喺呢度新增嘅學校，內建嗰成千幾間中學／院校唔會逐間列出嚟（可以去網站註冊表格揀地區睇齊內建清單）。</p>
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
              <tbody>${secondaryRows || '<tr><td colspan="2" style="text-align:center; color:#999;">暫時未有後台新增嘅中學</td></tr>'}</tbody>
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
              <tbody>${tertiaryRows || '<tr><td colspan="2" style="text-align:center; color:#999;">暫時未有後台新增嘅院校</td></tr>'}</tbody>
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
      if (alreadyExists) { window.showToast('呢間中學已經存在喺清單度喇', '⚠️'); return; }
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
      if (inByDistrict || inCommon) { window.showToast('呢間院校已經存在喺清單度喇', '⚠️'); return; }
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
本服務提供線上溫習室（包括視訊及語音功能）、學習進度追蹤（等級、經驗值、貼紙收藏）、好友及即時通訊功能、疑難解答討論區等功能。本公司保留隨時新增、修改、暫停或終止本服務任何功能之權利，毋須事先通知使用者。

# 第二條　帳戶註冊及使用者責任
（一）使用者於註冊帳戶時所提供之資料（包括登入識別碼、電郵地址等），須真實、準確及完整；
（二）使用者有責任妥善保管其帳戶登入密碼，不得將帳戶資料轉讓、出借或以任何方式提供予他人；
（三）除有證據證明帳戶遭第三方未經授權存取外，使用者帳戶下所發生之一切活動，均視為由使用者本人所為，使用者須就此負全責；
（四）除本公司另行書面同意外，每名使用者僅可擁有一個帳戶。

# 第三條　使用守則
使用者於使用本服務時，須遵守下列守則，不得從事下列行為：

（一）上載、發佈或傳送任何違法、猥褻、暴力、具威嚇性、侵犯他人權利，或帶有歧視成分之內容（包括但不限於即時通訊訊息、頭像圖片、討論區發帖及留言）；
（二）冒充他人身份，或提供虛假不實之個人資料；
（三）以任何方式（包括但不限於利用瀏覽器開發者工具）試圖繞過、破壞或篡改本服務之計分及經驗值機制；
（四）干擾或破壞本服務之正常運作，包括但不限於發動阻斷服務（DDoS）攻擊、大量發送垃圾訊息、濫用系統資源（例如無故大量開設溫習室）；
（五）未經授權存取其他使用者之帳戶或個人資料；
（六）將本服務用於任何違反香港特別行政區現行法例之用途。

使用者如違反上述任何守則，本公司有權暫停或終止該使用者之帳戶，情節嚴重者，本公司保留追究相關法律責任之一切權利。本服務已設有舉報機制，供使用者就違規內容或行為作出舉報，由本公司管理團隊進行審查及處理。

# 第四條　使用者生成內容
使用者於本服務上所發佈之內容（包括但不限於即時通訊訊息、討論區發帖及留言，下稱「使用者生成內容」）之知識產權，仍歸屬於該使用者。惟使用者同意，就其發佈之使用者生成內容，授予本公司一項非獨家、免版稅、全球性之許可，容許本公司於營運及提供本服務所必需之範圍內（包括顯示、儲存、傳輸該等內容），使用該等使用者生成內容。

本公司保留移除任何違反本條款之使用者生成內容之權利，毋須事先通知該使用者。

# 第五條　收費及訂閱
本服務於本條款生效之時，並不涉及任何收費功能，現有一切功能均以免費方式提供予使用者。倘若本公司日後推出收費或訂閱服務，本公司將另行公佈詳細之收費條款（包括但不限於收費方式、退款政策），並於使用者使用該等收費功能前，徵得使用者之明確同意。

# 第六條　服務可用性及免責聲明
（一）本服務按「現況」（as is）及「現有」（as available）之基礎提供，本公司不對本服務之不間斷運作、無錯誤或絕對安全作出任何保證；
（二）本服務之運作依賴第三方基礎設施（包括但不限於 Google Firebase、GitHub Pages、Cloudflare、EmailJS），倘若因該等第三方服務之故障或中斷而導致本服務無法正常運作，本公司對此不負直接責任；
（三）本服務之視訊溫習室功能依賴點對點即時通訊技術（WebRTC），於使用者之間直接建立連線，連線之品質可能受使用者之網絡環境及裝置性能所影響，本公司不對連線品質作出保證；
（四）於香港現行法例容許之最大範圍內，本公司對因使用或無法使用本服務而引致之任何直接、間接、附帶、特殊或衍生性損失或損害，概不負責。

# 第七條　帳戶暫停及終止
（一）使用者可隨時自行停止使用本服務，或依本公司之私隱政策申請刪除帳戶；
（二）倘若使用者違反本條款，或本公司合理懷疑使用者涉嫌濫用本服務，或基於其他合理理由，本公司保留暫停或終止該使用者帳戶之權利，並將於可行範圍內事先通知使用者，惟涉及惡意行為之情況則不在此限。

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
本公司因提供本服務之需要，可能收集以下類別之資料：帳戶資料（登入識別碼、電郵地址、顯示暱稱、頭像選項，於帳戶註冊時收集）；學習記錄（累積溫習時數、經驗值、等級、貼紙收藏紀錄，於使用服務過程中自動記錄）；社交互動資料（好友名單、即時通訊內容、討論區發帖及留言，於使用者主動使用相關功能時收集）；溫習室及視訊相關資料（房間設定、加入及離開時間、建立視像連線所需之協調訊息，於使用視訊溫習室功能時收集）；舉報資料（舉報內容及相關佐證，於使用者提交舉報時收集）；技術資料（瀏覽器類型、裝置資訊、網際網路協定（IP）位址，於連接本服務時由基礎設施自動記錄）。

關於視訊及語音資料之特別聲明：本服務之視訊溫習室功能採用點對點即時通訊技術（WebRTC），使用者之鏡頭及咪高風畫面乃於瀏覽器之間直接傳輸，並不經由本公司之伺服器儲存或錄製。本公司之資料庫僅用作交換建立該連線所需之協調（signaling）訊息，並不接觸實際之影像或聲音內容。

本公司不會收集閣下之身份證明文件號碼、住址、電話號碼，或信用卡及其他付款工具資料；本服務於現階段並不涉及任何收費功能。

# 第三條　收集資料之目的
本公司收集及處理閣下之個人資料，僅限於下列目的：（一）提供及維持本服務之核心功能，包括帳戶登入、溫習室運作、學習進度追蹤及社交互動功能；（二）維護帳戶安全及防止濫用行為，包括偵測異常操作及處理舉報事宜；（三）透過第三方服務提供者發送電郵驗證訊息（詳見第五條）；（四）分析及改善本服務之功能與使用體驗。本公司承諾不會將閣下之個人資料用於向第三方廣告商進行行銷推廣之目的。

# 第四條　資料儲存地點及保安措施
閣下之個人資料儲存於 Google Firebase（包括 Firestore 資料庫及 Cloud Storage 儲存空間），該等服務由 Google Cloud Platform 提供。資料於傳輸過程中，均以超文本傳輸安全協定（HTTPS/TLS）加密。本公司並已採取下列保安措施：（一）Firebase App Check（結合 reCAPTCHA Enterprise），用以識別及阻截非經正常途徑發出之存取請求；（二）資料庫及儲存空間存取規則，訂明使用者僅可存取屬於自己之資料，唯獲授權之管理員方可存取管理功能；（三）單次資料變更幅度限制，就學習進度等敏感數值之單次變更設有上限，以防止篡改。

# 第五條　資料之披露及第三方服務提供者
本公司不會出售或出租閣下之個人資料予任何第三方。惟為提供本服務所需之技術支援，本公司會將有限度之資料傳送予下列第三方服務提供者：（一）Google Firebase——提供資料庫、身份驗證、檔案儲存及防濫用機制等服務；（二）EmailJS——用於發送電郵驗證訊息，僅會接觸閣下之電郵地址。倘若本公司因法律程序而有責任披露閣下之個人資料，本公司將依法配合，並於法律容許之範圍內事先通知閣下。

# 第六條　Cookie 及本地儲存技術
本服務會利用瀏覽器之本地儲存功能（localStorage）記錄閣下之登入狀態，以省卻閣下每次重新登入之需要。該等資料儲存於閣下自身之裝置內，本公司並不藉此透過第三方追蹤 Cookie 監察閣下於其他網站之瀏覽活動。

# 第七條　未成年使用者
本公司理解本服務之使用者當中，不乏未滿十八歲之學生。倘若閣下為家長或監護人，並發現閣下之子女未經閣下同意而建立帳戶，或閣下希望查閱、更正或刪除該等未成年人士之個人資料，歡迎透過第十條所載之聯絡方式與本公司聯絡，本公司將優先處理該等請求。

# 第八條　使用者之權利
根據該條例，閣下就本公司所持有關於閣下之個人資料，享有下列權利：（一）查閱權；（二）更正權；（三）刪除權（惟因安全審查需要而須保留之資料，或經匿名化處理而無法識別個人身份之統計數據，則不在此限）；（四）停止使用權。閣下如欲行使上述任何權利，請透過第十條所載之聯絡方式提出申請，本公司將於合理時間內作出回覆及處理。

# 第九條　資料保留期限
本公司將於閣下之帳戶維持活躍狀態期間，保留閣下之個人資料。倘若閣下申請刪除帳戶，本公司將於合理時間內刪除或將閣下之個人可識別資料進行匿名化處理，惟因安全審查或法律責任而須予保留之資料，則不受此限。

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
        if (currentAdminTab === 'legal' && !adminLegalDraft) {
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
        container.innerHTML = '<div class="admin-card" style="color:#c0392b;">淨係「超級管理員」先睇得到呢頁。</div>';
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
        ? '呢個係而家網站顯示緊嘅版本，可以直接修改。'
        : `留空嘅話，呢個語言會自動顯示返繁體中文版本（${adminLegalActiveLang === 'en' ? 'English' : '廣東話'}未填唔會開天窗）。`;

      container.innerHTML = `
        <div class="admin-card" style="margin-bottom:16px;">
          <p style="font-size:13px; color:#888; margin:0;">呢度編輯「服務條款」同「私隱政策」嘅內容，支援三語言分開編輯。段落之間留一行空白分段；想要粗體小標題（例如「第一條　服務內容」），喺嗰行開頭打「#」。⚠️ 法律文字嘅English／廣東話版本（翻譯是否準確、是否符合法律要求）請你自己把關或者搵專業人士核實，我哋淨係提供編輯工具，唔負責法律文字本身嘅準確性。</p>
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
      if (!confirm('確定要儲存？呢個改動會即時影響全站顯示緊嘅服務條款／私隱政策內容。')) return;
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
