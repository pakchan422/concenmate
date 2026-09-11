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
// 品／扭蛋機外觀圖片設定、等級／經驗值設定、詞卡管理、QA 管理、問
// 題回報處理、房間管理、用戶管理（停權／改分）等所有後台分頁邏輯。
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

    async function loadAdminIdsFromFirestore() {
      try {
        const snap = await window.fs.getDoc(window.fs.doc(window.db, 'admin_config', 'adminIds'));
        if (snap.exists() && Array.isArray(snap.data().ids) && snap.data().ids.length > 0) {
          window.ADMIN_LOGIN_IDS = snap.data().ids;
        }
      } catch (e) {
        console.warn('讀取管理員名單（admin_config/adminIds）失敗，暫時使用內建預設名單:', e);
      }
      // 名單啱啱先攞到／有更新，要重新評估一次而家個用戶算唔算管理員
      // （例如岩岩登入嗰陣名單仲未攞到，管理後台入口掣冇顯示，攞到之後
      // 要補顯示返）。
      if (typeof window.updateAdminEntryButton === 'function') window.updateAdminEntryButton();
      if (typeof window.checkAdminHashRoute === 'function') window.checkAdminHashRoute();
    }
    window.loadAdminIdsFromFirestore = loadAdminIdsFromFirestore;

    function isCurrentUserAdmin() {
      return !!(window.currentUser && window.currentUser.loginId && window.ADMIN_LOGIN_IDS.includes(window.currentUser.loginId));
    }
    window.isCurrentUserAdmin = isCurrentUserAdmin;

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
    let adminFlashcardsUnsubscribe = null;
    let adminReportsUnsubscribe = null;
    let adminReportsBadgeUnsubscribe = null;
    let currentAdminTab = 'gacha';

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
        btn.innerHTML = `🏠 <span class="header-admin-text">返回主頁</span>`;
      } else {
        btn.setAttribute('onclick', "window.location.hash='admin'");
        btn.innerHTML = `⚙️ <span class="header-admin-text">管理後台</span>`;
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
        if (adminFlashcardsUnsubscribe) { adminFlashcardsUnsubscribe(); adminFlashcardsUnsubscribe = null; }
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

      switchAdminTab(currentAdminTab || 'gacha');
    }
    window.checkAdminHashRoute = checkAdminHashRoute;
    window.addEventListener('hashchange', checkAdminHashRoute);

    window.switchAdminTab = function(tab) {
      currentAdminTab = tab;
      document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        const active = btn.getAttribute('data-tab') === tab;
        btn.className = 'btn admin-tab-btn ' + (active ? 'btn-primary active' : 'btn-outline');
      });
      document.querySelectorAll('.admin-tab-panel').forEach(panel => {
        panel.style.display = (panel.id === 'admin-tab-' + tab) ? 'block' : 'none';
      });

      if (tab === 'gacha') renderAdminGachaTab();
      else if (tab === 'rooms') renderAdminRoomsTab();
      else if (tab === 'qa') renderAdminQaTab();
      else if (tab === 'users') renderAdminUsersTab();
      else if (tab === 'level') renderAdminLevelTab();
      else if (tab === 'flashcards') renderAdminFlashcardsTab();
      else if (tab === 'reports') renderAdminReportsTab();
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
          container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">載入緊扭蛋機設定...</p>';
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
            <h3 style="font-size:15px; font-weight:bold; color:var(--brand-800); margin-bottom:10px;">🎰 扭蛋機外觀圖片</h3>
            <p style="font-size:13px; color:#888; margin-bottom:10px;">呢張係扭蛋機本身嘅外殼圖（唔係貼紙），顯示喺學生撳扭蛋果版度。上傳新圖會即時取代埋畫面上見到嘅圖案，唔上傳就繼續用返程式碼入面嘅預設圖。</p>
            <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
              <div id="admin-gacha-machine-thumb" onclick="document.getElementById('admin-gacha-machine-input').click()" title="撳這裡上傳圖片" style="width:80px; height:80px; border-radius:10px; background:#F0F6F8; border:1px dashed #B3D6DE; display:flex; align-items:center; justify-content:center; cursor:pointer; overflow:hidden;">${previewInner}</div>
              <input type="file" accept="image/*" id="admin-gacha-machine-input" style="display:none;" onchange="adminUploadGachaMachineImage(this)">
              <div style="display:flex; flex-direction:column; gap:6px;">
                <button type="button" class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="document.getElementById('admin-gacha-machine-input').click()">📤 上傳新圖片</button>
                ${url ? `<button type="button" class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="adminRemoveGachaMachineImage()">↩️ 還原做預設圖</button>` : ''}
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
                <div id="${thumbId}" onclick="document.getElementById('${inputId}').click()" title="撳這裡上傳圖片" style="width:44px; height:44px; border-radius:8px; background:#F0F6F8; border:1px dashed #B3D6DE; display:flex; align-items:center; justify-content:center; cursor:pointer; overflow:hidden;">${thumbInner}</div>
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
              <h3 style="font-size:15px; font-weight:bold; color:var(--brand-800);">🦦 Ottiee 貼紙圖鑑（共 ${pool.length} 隻）</h3>
              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                <button class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="adminNormalizeGachaWeights()">⚖️ 調整做啱好 100</button>
                <button class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="adminRenumberGachaStickers()">🔢 重新排序編號</button>
                <button class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="adminAddGachaPrize()">➕ 新增貼紙</button>
              </div>
            </div>
            <p style="font-size:13px; color:#888; margin-bottom:8px;">貼紙編號（#id）對應用戶收集圖鑑嘅位置，刪除貼紙之後編號會留返個缺口（例如刪走 #13~#17 之後就由 #12 跳去 #18），呢個唔影響扭蛋／收集功能，純粹畫面上唔靚。如果想執返靚佢，撳「🔢 重新排序編號」會將現存貼紙由上到下重新編做 1、2、3...連續號碼——但要留意：如果已經有真實學生扭過蛋、收藏緊某幾隻貼紙，重新編號會令佢哋原有嘅收藏對唔返新編號（貼紙會「變咗做另一隻」），所以呢個掣淨係啱喺未有學生正式用過、或者你肯接受洗牌返晒佢哋收藏記錄嗰陣先撳。</p>
            <div style="overflow-x:auto;">
              <table class="admin-table">
                <thead><tr><th>#</th><th>圖片</th><th>貼紙名稱</th><th>機率權重</th><th></th></tr></thead>
                <tbody>${rows || '<tr><td colspan="5" style="text-align:center; color:#999; padding:16px;">未有貼紙，撳「新增貼紙」開始</td></tr>'}</tbody>
              </table>
            </div>
            <p style="font-size:13px; color:#888; margin-top:8px;">總權重：<span id="admin-gacha-total">${totalWeight}</span>（右邊「≈ %」欄會在你打緊數字嗰陣即時更新，撳「調整做啱好 100」會將所有權重等比例縮放到啱啱好加埋等於 100，之後那個 % 就會同權重數字一致）</p>
          </div>
        `;
      }

      container.innerHTML = `
        <div class="admin-card">
          <h3 style="font-size:15px; font-weight:bold; color:var(--brand-800); margin-bottom:10px;">💰 扭蛋收費</h3>
          <div style="display:flex; gap:16px; flex-wrap:wrap; align-items:center;">
            <label style="font-size:13px; color:#555; display:flex; align-items:center; gap:6px;">抽一次 (PTS)：<input class="admin-input-sm" type="number" min="0" style="width:80px;" value="${adminGachaDraft.costNormal}" onchange="adminGachaDraft.costNormal = parseInt(this.value)||0"></label>
            <label style="font-size:13px; color:#555; display:flex; align-items:center; gap:6px;">連續抽十次 (PTS，一次過 10 抽嘅總費用)：<input class="admin-input-sm" type="number" min="0" style="width:80px;" value="${adminGachaDraft.costLucky}" onchange="adminGachaDraft.costLucky = parseInt(this.value)||0"></label>
          </div>
        </div>

        ${renderMachineImageCard()}

        ${renderStickerTable()}

        <div style="display:flex; gap:8px; justify-content:flex-end;">
          <button class="btn btn-outline" type="button" onclick="adminResetGachaDraft()">↩️ 還原未儲存的改動</button>
          <button class="btn btn-primary" type="button" id="btn-admin-save-gacha" onclick="adminSaveGachaConfig()">💾 儲存全部改動</button>
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
      window.showToast('⏳ 上傳緊相片…', '📤');
      try {
        const { blob, mimeType } = await compressImageFileToBlob(file, 300, 0.75);
        const ext = mimeType === 'image/png' ? 'png' : 'jpg';
        const path = `gacha_stickers/sticker_${sticker.id}_${Date.now()}.${ext}`;
        const fileRef = window.storageApi.ref(window.storage, path);
        await window.storageApi.uploadBytes(fileRef, blob, { contentType: mimeType });
        const downloadUrl = await window.storageApi.getDownloadURL(fileRef);
        adminGachaDraft.stickers[idx].photo = downloadUrl;
        renderAdminGachaTab();
        window.showToast('✅ 相片上傳成功，記得撳「儲存全部改動」先會正式生效', '🎉');
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
      window.showToast('⏳ 上傳緊圖片…', '📤');
      try {
        const { blob, mimeType } = await compressImageFileToBlob(file, 400, 0.85);
        const ext = mimeType === 'image/png' ? 'png' : 'jpg';
        const path = `gacha_stickers/machine_image_${Date.now()}.${ext}`;
        const fileRef = window.storageApi.ref(window.storage, path);
        await window.storageApi.uploadBytes(fileRef, blob, { contentType: mimeType });
        const downloadUrl = await window.storageApi.getDownloadURL(fileRef);
        adminGachaDraft.machineImageUrl = downloadUrl;
        renderAdminGachaTab();
        window.showToast('✅ 圖片上傳成功，記得撳「儲存全部改動」先會正式生效', '🎉');
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
      window.showToast('已將權重調整做啱好加埋等於 100', '⚖️');
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
      if (!confirm('確定刪除這隻貼紙？已經有用戶擁有嘅話，佢哋收集紀錄入面呢隻貼紙會留返底但喺圖鑑度唔會再顯示。')) return;
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
      if (!confirm('重新排序編號會將貼紙 id 由 1 開始重新連續編號。\n\n⚠️ 如果已經有真實學生用呢個扭蛋機扭過蛋、收藏緊某幾隻貼紙，佢哋原有嘅收藏會因為編號變咗而對唔返位（貼紙會「變咗做另一隻」）。如果仲未有學生正式用過，或者你肯接受洗牌返晒收藏記錄，先繼續。\n\n確定要重新編號？')) return;
      adminGachaDraft.stickers.forEach((p, i) => { p.id = i + 1; });
      renderAdminGachaTab();
      window.showToast('已重新排序編號，記得撳「儲存全部改動」先會正式生效', '🔢');
    };

    window.adminResetGachaDraft = function() {
      adminGachaDraft = null;
      renderAdminGachaTab();
      window.showToast('已還原返上次儲存的版本', '↩️');
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
        window.showToast(`資料太大（約 ${(approxBytes / 1024).toFixed(0)}KB，Firestore 單一文件上限是 1024KB），請幫少幾隻貼紙換相或者揀細些的相`, '⚠️');
        return;
      }

      const btn = document.getElementById('btn-admin-save-gacha');
      if (btn) { btn.disabled = true; btn.innerText = '⏳ 儲存緊…'; }
      try {
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'gacha'), payload);
        window.showToast('✅ 扭蛋機設定已儲存，即時對所有用戶生效！', '🎉');
      } catch (err) {
        window.showToast('儲存失敗：' + (err.message || err), '❌');
      } finally {
        if (btn) { btn.disabled = false; btn.innerText = '💾 儲存全部改動'; }
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
        // （adminGachaDraft 仲係 null，即係岩岩好卡喺「載入緊...」嗰個畫面），
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
        gachaConfigLoaded = true; // 唔好卡死喺「載入緊...」畫面，起碼俾程式碼入面嘅預設值可以用
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
          container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">載入緊等級系統設定...</p>';
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
            ${r.photo ? `<button class="btn btn-outline" style="font-size:13px; padding:2px 6px; margin-top:2px;" onclick="adminRemoveRankPhoto(${idx})">🗑移除</button>` : ''}
          </div>
          <div style="flex:1; min-width:240px; display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
            <label style="font-size:13px; color:#555; display:flex; align-items:center; gap:4px;">等級門檻
              <input class="admin-input-sm" type="number" min="1" style="width:55px;" value="${r.minLevel}" onchange="adminLevelDraft.ranks[${idx}].minLevel = parseInt(this.value)||1">
            </label>
            <label style="font-size:13px; color:#555; display:flex; align-items:center; gap:4px;">Emoji
              <input class="admin-input-sm" style="width:44px; text-align:center;" value="${escapeHtml(r.emoji || '')}" onchange="adminLevelDraft.ranks[${idx}].emoji = this.value">
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
            <label style="font-size:13px; color:#555; display:flex; align-items:flex-start; gap:4px; width:100%;">升級詳情文字（用家撳「Lv.」列會彈出視窗顯示）
              <textarea class="admin-input-sm" rows="2" style="flex:1; min-width:200px; resize:vertical;" oninput="adminLevelDraft.ranks[${idx}].desc = this.value">${escapeHtml(r.desc || '')}</textarea>
            </label>
          </div>
          <button class="btn btn-red" style="font-size:13px; padding:3px 8px; flex-shrink:0;" onclick="adminRemoveLevelRank(${idx})">🗑 刪除段位</button>
        </div>
      `).join('');

      container.innerHTML = `
        <div class="admin-card">
          <h3 style="font-size:14px; font-weight:bold; margin-bottom:8px;">⚙️ 基本設定</h3>
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
          <h3 style="font-size:14px; font-weight:bold; margin-bottom:4px;">🏅 段位稱號 + 水獺造型（由低到高，建議第一行等級門檻＝1）</h3>
          <p style="font-size:13px; color:#888; margin-bottom:10px;">每個段位可以上傳專屬水獺相片，用家升到那個等級，主頁「我的水獺」就會自動換成嗰張相；唔上傳就用返共用的預設插畫（有心情表情變化）。</p>
          <div>${ranksCards}</div>
          <button class="btn btn-outline" style="margin-top:4px; font-size:13px;" onclick="adminAddLevelRank()">➕ 新增段位</button>
        </div>

        <div style="margin-top:14px; display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="adminSaveLevelConfig()">💾 儲存全部改動</button>
          <button class="btn btn-outline" onclick="adminResetLevelDraft()">↩️ 還原未儲存的改動</button>
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
      if (adminLevelDraft.ranks.length <= 1) { window.showToast('最少要留返一個段位', '⚠️'); return; }
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
        window.showToast(`資料太大（約 ${(approxBytes / 1024).toFixed(0)}KB，Firestore 單一文件上限是 1024KB），請幫少幾個段位換相或者揀細些的相`, '⚠️');
        return;
      }
      try {
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'levelSystem'), payload);
        window.showToast('✅ 已儲存等級系統設定', '✅');
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
      container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">載入緊房間資料...</p>';

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
              <td>${r.participantCount || 0}/${window.ROOM_CAPACITY || 4}</td>
              <td>${r.duration || 30} 分鐘</td>
              <td>${created}</td>
              <td><button class="btn btn-red" style="font-size:13px; padding:3px 8px;" onclick="adminDeleteRoom('${docSnap.id}', '${(r.name || '').replace(/'/g, "\\'")}')">🗑️ 強制關閉</button></td>
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
      if (!confirm(`確定要強制關閉房間「${roomName}」？裡面的同學會即時被移返大廳。`)) return;
      try {
        await window.fs.deleteDoc(window.fs.doc(window.db, 'rooms', roomId));
        window.showToast('已強制關閉該房間', '🗑️');
      } catch (err) {
        window.showToast('操作失敗：' + (err.message || err), '❌');
      }
    };

    // ---------- 疑難解答區管理 ----------
    function renderAdminQaTab() {
      const container = document.getElementById('admin-tab-qa');
      if (!container || !window.db || !window.fs) return;
      container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">載入緊帖子資料...</p>';

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
              <td><button class="btn btn-red" style="font-size:13px; padding:3px 8px;" onclick="adminDeleteQaPost('${docSnap.id}')">🗑️ 刪除</button></td>
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

    // ---------- 溫習卡管理 ----------
    // 溫習卡內容統一由管理員喺呢度新增/編輯/刪除，存喺 Firestore 頂層
    // 「flashcards」集合，所有已登入用戶得（read-only）睇到內容，但淨係
    // 管理員先可以寫入（要記得喺 Firestore 安全規則加返對應嘅權限）。
    let adminFlashcardsAllDocs = []; // 快取最新一次 onSnapshot 嘅全部溫習卡，畀篩選下拉選單即時重新渲染用，唔使再拉一次 Firestore

    function renderAdminFlashcardsTab() {
      const container = document.getElementById('admin-tab-flashcards');
      if (!container || !window.db || !window.fs) return;

      const categoryOptions = window.ENGLISH_VOCAB_CATEGORIES.map(cat => `<option value="${escapeHtml(cat.label)}">${escapeHtml(cat.label)}</option>`).join('');

      container.innerHTML = `
        <div class="admin-card">
          <h3 style="font-size:15px; font-weight:bold; margin-bottom:8px; color:var(--brand-800);">➕ 新增溫習卡</h3>

          <label style="font-size:13px; font-weight:600; color:#555;">科目</label>
          <select id="admin-flashcard-subject-select" class="input-field" onchange="toggleFlashcardSubjectMode()">
            <option value="english">🔤 英文（DSE 議題詞彙）</option>
            <option value="other">📚 其他科目（自訂問答）</option>
          </select>

          <div id="admin-flashcard-english-fields" style="margin-top:8px;">
            <label style="font-size:13px; font-weight:600; color:#555;">範疇</label>
            <select id="admin-flashcard-category-select" class="input-field">${categoryOptions}</select>
            <label style="font-size:13px; font-weight:600; color:#555; margin-top:8px; display:block;">英文詞語</label>
            <input type="text" id="admin-flashcard-word-input" class="input-field" placeholder="例如：Introduce">
            <label style="font-size:13px; font-weight:600; color:#555; margin-top:8px; display:block;">詞性</label>
            <select id="admin-flashcard-pos-select" class="input-field">
              <option>Verb</option><option>Noun</option><option>Adjective</option><option>Adverb</option><option>Noun Phrase</option><option>Phrase</option>
            </select>
            <label style="font-size:13px; font-weight:600; color:#555; margin-top:8px; display:block;">中文意思</label>
            <input type="text" id="admin-flashcard-meaning-input" class="input-field" placeholder="例如：介紹">
            <label style="font-size:13px; font-weight:600; color:#555; margin-top:8px; display:block;">例句</label>
            <textarea id="admin-flashcard-example-input" class="input-field" rows="2" placeholder="例如：Let me introduce myself to the team."></textarea>
            <label style="font-size:13px; font-weight:600; color:#555; margin-top:8px; display:block;">例句中文翻譯</label>
            <textarea id="admin-flashcard-exampletranslation-input" class="input-field" rows="2" placeholder="例如：讓我向團隊自我介紹。"></textarea>
          </div>

          <div id="admin-flashcard-generic-fields" style="display:none; margin-top:8px;">
            <label style="font-size:13px; font-weight:600; color:#555;">問題（正面）</label>
            <textarea id="admin-flashcard-front-input" class="input-field" rows="2" placeholder="例如：牛頓第二定律是咩？"></textarea>
            <label style="font-size:13px; font-weight:600; color:#555; margin-top:8px; display:block;">答案（背面）</label>
            <textarea id="admin-flashcard-back-input" class="input-field" rows="2" placeholder="例如：F = ma"></textarea>
            <label style="font-size:13px; font-weight:600; color:#555; margin-top:8px; display:block;">科目（可選）</label>
            <input type="text" id="admin-flashcard-generic-subject-input" class="input-field" placeholder="例如：物理">
          </div>

          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
            <button class="btn btn-primary" type="button" onclick="adminAddFlashcard()">💾 新增溫習卡</button>
          </div>
        </div>

        <div class="admin-card" style="margin-top:12px;">
          <h3 style="font-size:15px; font-weight:bold; margin-bottom:6px; color:var(--brand-800);">📋 批量貼上匯入（英文詞彙）</h3>
          <p style="font-size:13px; color:#888; margin-bottom:8px;">日後有大量新詞語想加，不用一個個手動填：每行一張卡，格式是「<code>英文詞語 | 詞性 | 中文意思 | 例句 | 例句中文翻譯</code>」（例句／翻譯可以留空），成段貼低就得。想要現成內容的話，可以叫 Claude 幫手按這個格式準備一批新詞彙，複製貼落來就即刻匯入，不用再改程式碼或者重新部署。</p>
          <label style="font-size:13px; font-weight:600; color:#555;">範疇</label>
          <select id="admin-flashcard-bulk-category-select" class="input-field">${categoryOptions}</select>
          <label style="font-size:13px; font-weight:600; color:#555; margin-top:8px; display:block;">貼上內容（每行一張卡）</label>
          <textarea id="admin-flashcard-bulk-input" class="input-field" rows="8" placeholder="Negotiate | Verb | 談判 | Employees should learn how to negotiate for a fair salary. | 僱員應該學習如何為合理的薪金進行談判。
Compromise | Verb | 妥協 | Both sides need to compromise in order to resolve the dispute. | 雙方需要作出妥協，才能解決爭議。"></textarea>
          <button class="btn btn-primary" type="button" id="btn-bulk-import-flashcards" style="margin-top:10px;" onclick="adminBulkImportFlashcards()">📥 解析並匯入</button>
        </div>

        <div class="admin-card" style="margin-top:12px;">
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
            <select id="admin-flashcard-filter-subject" class="input-field" style="flex:1; min-width:120px;" onchange="renderAdminFlashcardsTable()">
              <option value="all">📚 全部科目</option>
            </select>
            <select id="admin-flashcard-filter-category" class="input-field" style="flex:1; min-width:160px; display:none;" onchange="renderAdminFlashcardsTable()">
              <option value="all">🗂 全部範疇</option>
            </select>
          </div>
          <div id="admin-flashcards-list-container"><p style="text-align:center; color:#999; padding:20px;">載入緊溫習卡...</p></div>
        </div>
      `;
      toggleFlashcardSubjectMode();

      if (adminFlashcardsUnsubscribe) adminFlashcardsUnsubscribe();
      adminFlashcardsUnsubscribe = window.fs.onSnapshot(window.fs.collection(window.db, 'flashcards'), (snapshot) => {
        adminFlashcardsAllDocs = snapshot.docs.slice();
        renderAdminFlashcardsTable();
      }, (err) => {
        const listContainer = document.getElementById('admin-flashcards-list-container');
        if (listContainer) listContainer.innerHTML = `<div class="admin-card" style="color:#c0392b;">載入失敗：${err.message || err}</div>`;
      });
    }
    window.renderAdminFlashcardsTab = renderAdminFlashcardsTab;

    // 英文詞彙需要「範疇」呢一層額外分類，其他科目就用返原本自由填寫嘅問答格式，
    // 呢個掣負責喺兩種輸入模式之間切換
    window.toggleFlashcardSubjectMode = function() {
      const modeEl = document.getElementById('admin-flashcard-subject-select');
      const mode = modeEl ? modeEl.value : 'english';
      const engFields = document.getElementById('admin-flashcard-english-fields');
      const genFields = document.getElementById('admin-flashcard-generic-fields');
      if (engFields) engFields.style.display = mode === 'english' ? '' : 'none';
      if (genFields) genFields.style.display = mode === 'english' ? 'none' : '';
    };

    // 根據目前快取嘅 adminFlashcardsAllDocs + 篩選下拉選單，重新渲染管理員嘅溫習卡列表
    // （純本地重新渲染，唔使再打 Firestore，切換篩選即時反應）
    function renderAdminFlashcardsTable() {
      const listContainer = document.getElementById('admin-flashcards-list-container');
      if (!listContainer) return;

      const subjectFilterEl = document.getElementById('admin-flashcard-filter-subject');
      const categoryFilterEl = document.getElementById('admin-flashcard-filter-category');
      if (subjectFilterEl) {
        const allData = adminFlashcardsAllDocs.map(d => d.data());
        const subjects = Array.from(new Set(allData.map(c => c.subject).filter(Boolean))).sort();
        const prevSubject = subjectFilterEl.value || 'all';
        subjectFilterEl.innerHTML = '<option value="all">📚 全部科目</option>' +
          subjects.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
        subjectFilterEl.value = subjects.includes(prevSubject) ? prevSubject : 'all';

        if (categoryFilterEl) {
          categoryFilterEl.style.display = subjectFilterEl.value === '英文' ? '' : 'none';
          const categories = Array.from(new Set(allData.filter(c => c.subject === '英文').map(c => c.category).filter(Boolean))).sort();
          const prevCategory = categoryFilterEl.value || 'all';
          categoryFilterEl.innerHTML = '<option value="all">🗂 全部範疇</option>' +
            categories.map(cat => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join('');
          categoryFilterEl.value = categories.includes(prevCategory) ? prevCategory : 'all';
        }
      }

      if (adminFlashcardsAllDocs.length === 0) {
        listContainer.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">目前沒有任何溫習卡，在上面新增第一張啦！</div>';
        return;
      }

      const subjectFilter = subjectFilterEl ? subjectFilterEl.value : 'all';
      const categoryFilter = categoryFilterEl ? categoryFilterEl.value : 'all';
      let docs = adminFlashcardsAllDocs.filter(docSnap => {
        const c = docSnap.data();
        if (subjectFilter !== 'all' && (c.subject || '') !== subjectFilter) return false;
        if (subjectFilter === '英文' && categoryFilter !== 'all' && (c.category || '') !== categoryFilter) return false;
        return true;
      });

      if (docs.length === 0) {
        listContainer.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">這個篩選範圍暫時未有溫習卡</div>';
        return;
      }

      // 按「科目 → 範疇」分組顯示（唔再淨係一條長 list），方便一眼睇晒每個範疇
      // 有咩詞語。英文嘅 8 大範疇跟返原本嘅次序排；其他科目／未分類嘅就排喺後面。
      const groups = new Map(); // key: "科目__範疇" → { subject, category, docs: [] }
      docs.forEach(docSnap => {
        const c = docSnap.data();
        const subject = c.subject || '（未設科目）';
        const category = c.category || '';
        const key = subject + '__' + category;
        if (!groups.has(key)) groups.set(key, { subject, category, docs: [] });
        groups.get(key).docs.push(docSnap);
      });
      groups.forEach(g => g.docs.sort((a, b) => (a.data().word || a.data().front || '').localeCompare(b.data().word || b.data().front || '')));

      const englishCategoryOrder = window.ENGLISH_VOCAB_CATEGORIES.map(cat => cat.label);
      const groupKeys = Array.from(groups.keys()).sort((keyA, keyB) => {
        const a = groups.get(keyA), b = groups.get(keyB);
        if (a.subject !== b.subject) return a.subject.localeCompare(b.subject);
        const idxA = englishCategoryOrder.indexOf(a.category);
        const idxB = englishCategoryOrder.indexOf(b.category);
        if (idxA !== -1 || idxB !== -1) return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
        return a.category.localeCompare(b.category);
      });

      const sections = groupKeys.map(key => {
        const g = groups.get(key);
        const headerLabel = g.category ? `${g.subject} · ${g.category}` : g.subject;
        const rows = g.docs.map(docSnap => {
          const c = docSnap.data();
          return `
            <tr>
              <td><input class="admin-input-sm" value="${escapeHtml(c.front || '')}" onchange="adminUpdateFlashcardField('${docSnap.id}','front',this.value)"></td>
              <td><input class="admin-input-sm" value="${escapeHtml(c.back || '')}" onchange="adminUpdateFlashcardField('${docSnap.id}','back',this.value)"></td>
              <td><input class="admin-input-sm" style="width:90px;" value="${escapeHtml(c.subject || '')}" onchange="adminUpdateFlashcardField('${docSnap.id}','subject',this.value)"></td>
              <td><input class="admin-input-sm" style="width:140px;" value="${escapeHtml(c.category || '')}" onchange="adminUpdateFlashcardField('${docSnap.id}','category',this.value)"></td>
              <td><button class="btn btn-red" style="font-size:13px; padding:3px 8px;" onclick="adminDeleteFlashcard('${docSnap.id}')">🗑️ 刪除</button></td>
            </tr>
          `;
        }).join('');
        return `
          <tr style="background:#F0E9DF;"><td colspan="5" style="font-weight:bold; padding:8px 10px; color:var(--brand-800);">🗂 ${escapeHtml(headerLabel)}（${g.docs.length} 張）</td></tr>
          ${rows}
        `;
      }).join('');

      listContainer.innerHTML = `
        <p style="font-size:13px; color:#888; margin-bottom:10px;">共 ${adminFlashcardsAllDocs.length} 張溫習卡（篩選後顯示 ${docs.length} 張），全部學生都會看到（下面直接改欄位會即時儲存）</p>
        <div style="overflow-x:auto;">
          <table class="admin-table">
            <thead><tr><th>問題（正面）</th><th>答案（背面）</th><th>科目</th><th>範疇</th><th></th></tr></thead>
            <tbody>${sections}</tbody>
          </table>
        </div>
      `;
    }
    window.renderAdminFlashcardsTable = renderAdminFlashcardsTable;

    window.adminAddFlashcard = async function() {
      const modeEl = document.getElementById('admin-flashcard-subject-select');
      const mode = modeEl ? modeEl.value : 'english';

      if (mode === 'english') {
        const categoryEl = document.getElementById('admin-flashcard-category-select');
        const wordEl = document.getElementById('admin-flashcard-word-input');
        const posEl = document.getElementById('admin-flashcard-pos-select');
        const meaningEl = document.getElementById('admin-flashcard-meaning-input');
        const exampleEl = document.getElementById('admin-flashcard-example-input');
        const exampleTrEl = document.getElementById('admin-flashcard-exampletranslation-input');
        const category = categoryEl ? categoryEl.value : '';
        const word = wordEl ? wordEl.value.trim() : '';
        const pos = posEl ? posEl.value : '';
        const meaning = meaningEl ? meaningEl.value.trim() : '';
        const example = exampleEl ? exampleEl.value.trim() : '';
        const exampleTranslation = exampleTrEl ? exampleTrEl.value.trim() : '';
        if (!word || !meaning) { window.showToast('英文詞語同中文意思都要填㗎', '⚠️'); return; }

        const front = pos ? `${word} (${pos})` : word;
        let back = meaning;
        if (example) back += `\n\n例句：${example}`;
        if (exampleTranslation) back += `\n中文翻譯：${exampleTranslation}`;

        try {
          await window.fs.addDoc(window.fs.collection(window.db, 'flashcards'), {
            subject: '英文', category, word, partOfSpeech: pos, meaning, example, exampleTranslation,
            front, back, createdAt: Date.now()
          });
          [wordEl, meaningEl, exampleEl, exampleTrEl].forEach(el => { if (el) el.value = ''; });
          window.showToast('✅ 已新增英文詞彙卡，所有學生即時見到', '🗂');
        } catch (err) {
          window.showToast('新增失敗：' + (err.message || err), '❌');
        }
        return;
      }

      const frontEl = document.getElementById('admin-flashcard-front-input');
      const backEl = document.getElementById('admin-flashcard-back-input');
      const subjectEl = document.getElementById('admin-flashcard-generic-subject-input');
      const front = frontEl ? frontEl.value.trim() : '';
      const back = backEl ? backEl.value.trim() : '';
      const subject = subjectEl ? subjectEl.value.trim() : '';
      if (!front || !back) { window.showToast('問題同答案都要填㗎', '⚠️'); return; }
      try {
        await window.fs.addDoc(window.fs.collection(window.db, 'flashcards'), {
          front, back, subject, createdAt: Date.now()
        });
        if (frontEl) frontEl.value = '';
        if (backEl) backEl.value = '';
        if (subjectEl) subjectEl.value = '';
        window.showToast('✅ 已新增溫習卡，所有學生即時見到', '🗂');
      } catch (err) {
        window.showToast('新增失敗：' + (err.message || err), '❌');
      }
    };

    // 共用嘅匯入邏輯：畀定一個範疇同一批詞彙項目，跳過已經存在嘅（用「科目＋範疇＋
    // 英文詞語」做 key 比對），將淨低嘅寫入 Firestore。existingKeys 會直接喺呢度
    // 更新（mutate），等同一次操作入面匯入多個範疇都唔會撞埋/ 漏檢查。
    async function importEnglishVocabItems(existingKeys, categoryLabel, items) {
      const toAdd = items.filter(item => item.word && !existingKeys.has(`英文__${categoryLabel}__${item.word.toLowerCase()}`));
      await Promise.all(toAdd.map(item => {
        const front = item.pos ? `${item.word} (${item.pos})` : item.word;
        let back = item.meaning || '';
        if (item.example) back += `\n\n例句：${item.example}`;
        if (item.exampleTranslation) back += `\n中文翻譯：${item.exampleTranslation}`;
        existingKeys.add(`英文__${categoryLabel}__${item.word.toLowerCase()}`);
        return window.fs.addDoc(window.fs.collection(window.db, 'flashcards'), {
          subject: '英文', category: categoryLabel, word: item.word, partOfSpeech: item.pos || '',
          meaning: item.meaning || '', example: item.example || '', exampleTranslation: item.exampleTranslation || '',
          front, back, createdAt: Date.now()
        });
      }));
      return { added: toAdd.length, skipped: items.length - toAdd.length };
    }

    // 批量貼上匯入：admin 日後有大量新詞彙，唔使逐個手動填表，亦唔使叫我再改
    // index.html 重新部署——直接喺呢度貼上「英文詞語 | 詞性 | 中文意思 | 例句 |
    // 例句中文翻譯」格式嘅文字（每行一張卡），揀返範疇就可以一次過匯入。
    window.adminBulkImportFlashcards = async function() {
      const categoryEl = document.getElementById('admin-flashcard-bulk-category-select');
      const textEl = document.getElementById('admin-flashcard-bulk-input');
      const category = categoryEl ? categoryEl.value : '';
      const raw = textEl ? textEl.value : '';
      const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) { window.showToast('未貼了任何內容，先貼低些詞卡先啦', '⚠️'); return; }

      const items = [];
      let badLineCount = 0;
      lines.forEach(line => {
        const parts = line.split('|').map(p => p.trim());
        const word = parts[0] || '';
        const pos = parts[1] || '';
        const meaning = parts[2] || '';
        const example = parts[3] || '';
        const exampleTranslation = parts[4] || '';
        if (!word || !meaning) { badLineCount++; return; }
        items.push({ word, pos, meaning, example, exampleTranslation });
      });

      if (items.length === 0) { window.showToast('沒有解析到任何有效的詞卡，檢查吓每行是否用「 | 」分隔㗎', '⚠️'); return; }
      if (!confirm(`將會匯入 ${items.length} 張詞卡（範疇：${category}）${badLineCount ? '，另外有 ' + badLineCount + ' 行格式唔啱會跳過' : ''}，確定嗎？`)) return;

      const btn = document.getElementById('btn-bulk-import-flashcards');
      const originalText = btn ? btn.innerText : '';
      if (btn) { btn.disabled = true; btn.innerText = '⏳ 匯入緊…'; }
      try {
        const existingSnap = await window.fs.getDocs(window.fs.collection(window.db, 'flashcards'));
        const existingKeys = new Set(existingSnap.docs.map(d => {
          const c = d.data();
          return `${c.subject || ''}__${c.category || ''}__${(c.word || c.front || '').toLowerCase()}`;
        }));
        const result = await importEnglishVocabItems(existingKeys, category, items);
        window.showToast(`✅ 匯入完成！新增 ${result.added} 張，跳過 ${result.skipped} 張已存在${badLineCount ? `，${badLineCount} 行格式錯誤已跳過` : ''}`, '📥');
        if (textEl) textEl.value = '';
      } catch (err) {
        window.showToast('匯入失敗：' + (err.message || err), '❌');
      } finally {
        if (btn) { btn.disabled = false; btn.innerText = originalText || '📥 解析並匯入'; }
      }
    };

    window.adminUpdateFlashcardField = async function(cardId, field, value) {
      try {
        await window.fs.updateDoc(window.fs.doc(window.db, 'flashcards', cardId), { [field]: value });
      } catch (err) {
        window.showToast('更新失敗：' + (err.message || err), '❌');
      }
    };

    window.adminDeleteFlashcard = async function(cardId) {
      if (!confirm('確定要刪除呢張溫習卡？刪除之後所有學生都唔會再見到呢張卡。')) return;
      try {
        await window.fs.deleteDoc(window.fs.doc(window.db, 'flashcards', cardId));
        window.showToast('🗑️ 已刪除溫習卡', '🗑️');
      } catch (err) {
        window.showToast('刪除失敗：' + (err.message || err), '❌');
      }
    };

    // ---------- 用戶管理 ----------
    function renderAdminUsersTab() {
      const container = document.getElementById('admin-tab-users');
      if (!container || !window.db || !window.fs) return;
      container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">載入緊用戶資料...</p>';

      if (adminUsersUnsubscribe) adminUsersUnsubscribe();
      adminUsersUnsubscribe = window.fs.onSnapshot(window.fs.collection(window.db, 'users'), (snapshot) => {
        if (snapshot.empty) {
          container.innerHTML = '<div class="admin-card" style="text-align:center; color:#999;">目前沒有任何用戶</div>';
          return;
        }
        // 按建立時間由舊到新排（唔靠 Firestore 讀出嚟嗰個順序，實測唔一定係
        // 建立順序）；createdAt 舊帳號可能冇呢個欄位，冇嘅當做「最舊」排最前，
        // 唔會搞亂晒個排序
        const sortedDocs = [...snapshot.docs].sort((a, b) => {
          const ta = new Date(a.data().createdAt || 0).getTime() || 0;
          const tb = new Date(b.data().createdAt || 0).getTime() || 0;
          return ta - tb;
        });
        const rows = sortedDocs.map(docSnap => {
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
              <td>${u.loginId ? '🆔 ' + escapeHtml(u.loginId) : '<span style="color:#c99; font-size:13px;">未設定</span>'}</td>
              <td>${escapeHtml(displayEmail)}</td>
              <td>${escapeHtml(u.school || '—')}</td>
              <td><input class="admin-input-sm" type="number" style="width:70px;" value="${u.points || 0}" id="admin-user-points-${uid}"></td>
              <td><input class="admin-input-sm" style="width:60px;" value="${(parseFloat(u.hours) || 0).toFixed(1)}" id="admin-user-hours-${uid}"></td>
              <td><input class="admin-input-sm" type="number" style="width:70px;" value="${u.exp || 0}" id="admin-user-exp-${uid}"></td>
              <td style="display:flex; gap:4px; flex-wrap:wrap;">
                <button class="btn btn-outline" style="font-size:13px; padding:3px 8px;" onclick="adminSaveUserStats('${uid}')">💾 儲存</button>
                <button class="btn ${suspended ? 'btn-primary' : 'btn-red'}" style="font-size:13px; padding:3px 8px;" onclick="adminToggleSuspendUser('${uid}', ${!suspended})">${suspended ? '✅ 解除停權' : '🚫 停權'}</button>
              </td>
            </tr>
          `;
        }).join('');
        container.innerHTML = `
          <div class="admin-card">
            <p style="font-size:13px; color:#888; margin-bottom:10px;">改完積分／時數／EXP 之後記得逐行撳「💾 儲存」；EXP 決定用戶的溫習等級同段位，一般不用人手改，特殊情況（例如補發）先用。「停權」會令該用戶下次登入時被強制登出。</p>
            <div style="overflow-x:auto;">
              <table class="admin-table">
                <thead><tr><th>用戶名</th><th>帳號 ID</th><th>Email</th><th>學校</th><th>積分</th><th>時數</th><th>EXP</th><th></th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>
        `;
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
      const hours = (hoursEl && hoursEl.value) || '0.0';
      const exp = parseInt(expEl && expEl.value, 10) || 0;
      try {
        await window.fs.updateDoc(window.fs.doc(window.db, 'users', uid), { points, hours, exp });
        window.showToast('已更新用戶資料', '✅');
      } catch (err) {
        window.showToast('更新失敗：' + (err.message || err), '❌');
      }
    };

    window.adminToggleSuspendUser = async function(uid, suspend) {
      if (!confirm(suspend ? '確定停權這個帳戶？他下次登入會被強制登出。' : '確定解除這個帳戶的停權？')) return;
      try {
        await window.fs.updateDoc(window.fs.doc(window.db, 'users', uid), { suspended: suspend });
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
      const statusLabel = status === 'pending' ? '⏳ 待處理' : (status === 'dismissed' ? '已駁回' : '已處理');
      const statusColor = status === 'pending' ? '#C0524A' : '#999';
      const when = r.createdAt ? new Date(r.createdAt).toLocaleString('zh-HK') : '—';
      const screenshotHtml = r.screenshot
        ? `<img src="${r.screenshot}" style="width:100%; max-width:280px; border-radius:8px; border:1px solid #ddd; margin-top:6px; display:block; cursor:pointer;" onclick="window.open(this.src, '_blank')">`
        : `<p style="font-size:13px; color:#c99; margin-top:6px;">⚠️ 當時攞唔到截圖</p>`;
      return `
        <div class="admin-card" style="${status !== 'pending' ? 'opacity:.6;' : ''}">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
            <span style="font-weight:700; color:${statusColor}; font-size:13px;">${statusLabel}</span>
            <span style="font-size:13px; color:#999;">${escapeHtml(when)}</span>
          </div>
          <p style="font-size:13px; margin-bottom:3px;"><b>被舉報：</b>${escapeHtml(r.reportedName || '—')} ${r.reportedLoginId ? '（🆔 ' + escapeHtml(r.reportedLoginId) + '）' : ''}</p>
          <p style="font-size:13px; color:#888; margin-bottom:3px;">${r.reportedEmail ? escapeHtml(r.reportedEmail) : ''}</p>
          <p style="font-size:13px; margin-bottom:3px;"><b>舉報人：</b>${escapeHtml(r.reporterName || '—')} ${r.reporterLoginId ? '（🆔 ' + escapeHtml(r.reporterLoginId) + '）' : ''}</p>
          <p style="font-size:13px; margin-bottom:3px;"><b>房間：</b>${escapeHtml(r.roomName || r.roomId || '—')}</p>
          <p style="font-size:13px; margin-bottom:3px;"><b>原因：</b>${escapeHtml(r.reason || '—')}</p>
          ${r.notes ? `<p style="font-size:13px; color:#666; background:#F7F5F2; border-radius:6px; padding:6px 8px; margin-bottom:3px;">${escapeHtml(r.notes)}</p>` : ''}
          ${screenshotHtml}
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px;">
            ${status === 'pending' ? `<button class="btn btn-outline" style="font-size:13px; padding:4px 9px;" onclick="window.adminMarkReportStatus('${reportId}', 'dismissed')">🗂️ 駁回（沒問題）</button>` : ''}
            ${status === 'pending' ? `<button class="btn btn-outline" style="font-size:13px; padding:4px 9px;" onclick="window.adminMarkReportStatus('${reportId}', 'reviewed')">✅ 標記已處理</button>` : ''}
            ${r.reportedUid ? `<button class="btn btn-red" style="font-size:13px; padding:4px 9px;" onclick="window.adminSuspendFromReport('${reportId}', '${r.reportedUid}')">🚫 停權此帳戶</button>` : ''}
            ${status !== 'pending' ? `<button class="btn btn-outline" style="font-size:13px; padding:4px 9px; color:#999; border-color:#ccc;" onclick="window.adminDeleteReport('${reportId}')">🗑️ 刪除紀錄</button>` : ''}
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
             <button class="btn btn-outline" id="admin-reports-load-more-btn" type="button" onclick="window.adminLoadMoreReports()">📜 載入更多（已顯示 ${adminReportsLoadedDocs.length} 則）</button>
           </div>`;
      container.innerHTML = `
        <div style="margin-bottom:10px; background:#FFF7E6; border:1px solid #F0D9A0; border-radius:8px; padding:8px 10px; font-size:13px; color:#8a6d1f;">
          ⚠️ 技術上的重要提醒：這個網站沒有獨立伺服器，只是用緊 Firebase，所以這裡看唔到、亦都做唔到真正的「IP 封鎖」（因為 Firestore 規則見唔到用戶的真實 IP）。「停權」這個功能就實實在在有效——會即刻令該帳戶下次登入被強制登出，亦令他完全用唔到這個平台。
        </div>
        ${cards}
        ${loadMoreHtml}
      `;
    }

    function renderAdminReportsTab() {
      const container = document.getElementById('admin-tab-reports');
      if (!container || !window.db || !window.fs) return;
      container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">載入緊舉報記錄...</p>';

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
      if (btn) { btn.disabled = true; btn.innerText = '載入緊...'; }
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
        if (btn) { btn.disabled = false; btn.innerText = '📜 載入更多'; }
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
        window.showToast('已停權該帳戶', '🚫');
      } catch (err) {
        window.showToast('操作失敗：' + (err.message || err), '❌');
      }
    };

    // 淨係已經處理完（已駁回／已處理）嘅舉報先俾刪，pending 嘅唔會出呢粒掣，
    // 避免管理員手快手滑刪走仲未跟進嘅證據
    window.adminDeleteReport = async function(reportId) {
      if (!confirm('確定刪除呢一則已處理的舉報紀錄？連同截圖一齊刪走，刪了就沒辦法復原。')) return;
      try {
        await window.fs.deleteDoc(window.fs.doc(window.db, 'reports', reportId));
        window.showToast('已刪除舉報紀錄', '🗑️');
      } catch (err) {
        window.showToast('刪除失敗：' + (err.message || err), '❌');
      }
    };

    // 頁面一載入就檢查一次（處理直接開 #admin 網址嘅情況）
    checkAdminHashRoute();
