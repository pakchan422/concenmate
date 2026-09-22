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
      else if (tab === 'reports') renderAdminReportsTab();
      else if (tab === 'icons') renderAdminNavIconsTab();
      else if (tab === 'tutors') renderAdminTutorsTab();
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
            <h3 style="font-size:15px; font-weight:bold; color:var(--brand-800); margin-bottom:10px;">🎰 扭蛋機外觀圖片</h3>
            <p style="font-size:13px; color:#888; margin-bottom:10px;">這張是扭蛋機本身的外殼圖（不是貼紙），顯示在學生點擊扭蛋的頁面。上傳新圖會即時取代畫面上顯示的圖案，不上傳則繼續使用程式碼內建的預設圖。</p>
            <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
              <div id="admin-gacha-machine-thumb" onclick="document.getElementById('admin-gacha-machine-input').click()" title="點擊這裡上傳圖片" style="width:80px; height:80px; border-radius:10px; background:#F0F6F8; border:1px dashed #B3D6DE; display:flex; align-items:center; justify-content:center; cursor:pointer; overflow:hidden;">${previewInner}</div>
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
              <h3 style="font-size:15px; font-weight:bold; color:var(--brand-800);">🦦 Ottiee 貼紙圖鑑（共 ${pool.length} 隻）</h3>
              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                <button class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="adminNormalizeGachaWeights()">⚖️ 調整為剛好 100</button>
                <button class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="adminRenumberGachaStickers()">🔢 重新排序編號</button>
                <button class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="adminAddGachaPrize()">➕ 新增貼紙</button>
              </div>
            </div>
            <p style="font-size:13px; color:#888; margin-bottom:8px;">貼紙編號（#id）對應用戶收集圖鑑的位置，刪除貼紙之後編號會留下缺口（例如刪除 #13~#17 之後就由 #12 跳到 #18），這不影響扭蛋／收集功能，純粹是畫面上不美觀。如果想整理，點擊「🔢 重新排序編號」會將現存貼紙由上到下重新編為 1、2、3...連續號碼——但要留意：如果已經有真實學生扭過蛋、收藏了某幾張貼紙，重新編號會令他們原有的收藏對應不上新編號（貼紙會「變成另一張」），所以這個按鈕只適合在未有學生正式使用過、或者您願意接受重整所有人收藏記錄的情況下才點擊。</p>
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
          <h3 style="font-size:15px; font-weight:bold; color:var(--brand-800); margin-bottom:10px;">💰 扭蛋收費</h3>
          <div style="display:flex; gap:16px; flex-wrap:wrap; align-items:center;">
            <label style="font-size:13px; color:#555; display:flex; align-items:center; gap:6px;">抽一次 (PTS)：<input class="admin-input-sm" type="number" min="0" style="width:80px;" value="${adminGachaDraft.costNormal}" onchange="adminGachaDraft.costNormal = parseInt(this.value)||0"></label>
            <label style="font-size:13px; color:#555; display:flex; align-items:center; gap:6px;">連續抽十次 (PTS，一次過 10 抽的總費用)：<input class="admin-input-sm" type="number" min="0" style="width:80px;" value="${adminGachaDraft.costLucky}" onchange="adminGachaDraft.costLucky = parseInt(this.value)||0"></label>
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
      window.showToast('⏳ 上傳中相片…', '📤');
      try {
        const { blob, mimeType } = await compressImageFileToBlob(file, 300, 0.75);
        const ext = mimeType === 'image/png' ? 'png' : 'jpg';
        const path = `gacha_stickers/sticker_${sticker.id}_${Date.now()}.${ext}`;
        const fileRef = window.storageApi.ref(window.storage, path);
        await window.storageApi.uploadBytes(fileRef, blob, { contentType: mimeType });
        const downloadUrl = await window.storageApi.getDownloadURL(fileRef);
        adminGachaDraft.stickers[idx].photo = downloadUrl;
        renderAdminGachaTab();
        window.showToast('✅ 相片上傳成功，請點擊「儲存全部改動」才會正式生效', '🎉');
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
      window.showToast('⏳ 上傳中圖片…', '📤');
      try {
        const { blob, mimeType } = await compressImageFileToBlob(file, 400, 0.85);
        const ext = mimeType === 'image/png' ? 'png' : 'jpg';
        const path = `gacha_stickers/machine_image_${Date.now()}.${ext}`;
        const fileRef = window.storageApi.ref(window.storage, path);
        await window.storageApi.uploadBytes(fileRef, blob, { contentType: mimeType });
        const downloadUrl = await window.storageApi.getDownloadURL(fileRef);
        adminGachaDraft.machineImageUrl = downloadUrl;
        renderAdminGachaTab();
        window.showToast('✅ 圖片上傳成功，請點擊「儲存全部改動」才會正式生效', '🎉');
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
      if (!confirm('重新排序編號會將貼紙 id 由 1 開始重新連續編號。\n\n⚠️ 如果已經有真實學生使用這個扭蛋機扭過蛋、收藏了某幾隻貼紙，他們原有的收藏會因為編號改變而對應不上（貼紙會「變成另一隻」）。如果尚未有學生正式使用過，或者你願意接受洗牌整批收藏記錄，才繼續。\n\n確定要重新編號？')) return;
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
      if (btn) { btn.disabled = true; btn.innerText = '⏳ 儲存中…'; }
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
            <label style="font-size:13px; color:#555; display:flex; align-items:flex-start; gap:4px; width:100%;">升級詳情文字（用戶點擊「Lv.」列會彈出視窗顯示）
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
          <p style="font-size:13px; color:#888; margin-bottom:10px;">每個段位可以上傳專屬水獺相片，用家升到那個等級，主頁「我的水獺」就會自動換成那張相；不上傳則使用共用的預設插畫（有心情表情變化）。</p>
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
      if (!confirm(`確定要強制關閉房間「${roomName}」？裡面的同學會即時被移至大廳。`)) return;
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

    function renderAdminUsersTab() {
      const container = document.getElementById('admin-tab-users');
      if (!container || !window.db || !window.fs) return;
      container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">載入中用戶資料...</p>';

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
              <td style="white-space:nowrap;">${formatLastLoginDisplay(u.lastLoginAt)}</td>
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
            <p style="font-size:13px; color:#888; margin-bottom:10px;">修改積分／時數／EXP 後，請記得逐行點擊「💾 儲存」；EXP 決定用戶的溫習等級與段位，一般毋須人手修改，只有在特殊情況（例如補發）才使用。「停權」會令該用戶下次登入時被強制登出。</p>
            <div style="overflow-x:auto;">
              <table class="admin-table">
                <thead><tr><th>用戶名</th><th>帳號 ID</th><th>Email</th><th>學校</th><th>最後上線</th><th>積分</th><th>時數</th><th>EXP</th><th></th></tr></thead>
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
      // ⚠️ 呢度一定要用 parseFloat 將輸入格嘅文字轉做數字先可以寫入 Firestore；
      // 之前直接攞 .value（永遠係文字）寫落去，會令 hours 呢個欄位由數字變咗
      // 文字，後續 Cloud Function 用 "+" 累加嗰陣就會變成文字併接（例如
      // "0.0" + 0.0166666 = "0.00.0166666..."），排行榜同時數就會永久錯亂。
      const hours = parseFloat(hoursEl && hoursEl.value) || 0;
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
        : `<p style="font-size:13px; color:#c99; margin-top:6px;">⚠️ 當時無法取得截圖</p>`;
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
          ⚠️ 技術上的重要提醒：這個網站沒有獨立伺服器，只是使用 Firebase，所以這裡看不到、也無法做到真正的「IP 封鎖」（因為 Firestore 規則看不到用戶的真實 IP）。「停權」這個功能就確實有效——會即刻令該帳戶下次登入被強制登出，亦令他完全無法使用這個平台。
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
      { key: 'vip', label: '溫習資源', emoji: '👑' },
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
              <button type="button" class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="document.getElementById('${inputId}').click()">📤 上傳圖片</button>
              ${url ? `<button type="button" class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="adminRemoveNavIcon('${item.key}')">↩️ 還原做預設圖示</button>` : ''}
            </div>
          </div>
        `;
      }).join('');

      container.innerHTML = `
        <div class="admin-card">
          <h3 style="font-size:15px; font-weight:bold; color:var(--brand-800); margin-bottom:6px;">🖼 側邊欄功能圖示</h3>
          <p style="font-size:13px; color:#888; margin-bottom:6px;">將側邊欄「主頁、視訊溫習室」等 8 個分頁按鈕原本的 emoji 圖示，換成自訂上傳的圖片。上傳新圖會即時取代畫面上顯示的圖示，未上傳過的項目則繼續使用預設 emoji。</p>
          ${rows}
          <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:14px;">
            <button class="btn btn-outline" type="button" onclick="adminResetNavIconsDraft()">↩️ 還原未儲存的改動</button>
            <button class="btn btn-primary" type="button" onclick="adminSaveNavIconsConfig()">💾 儲存全部改動</button>
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
      window.showToast('⏳ 上傳中圖片…', '📤');
      try {
        const { blob, mimeType } = await compressImageFileToBlob(file, 128, 0.85);
        const ext = mimeType === 'image/png' ? 'png' : 'jpg';
        const path = `nav_icons/${key}_${Date.now()}.${ext}`;
        const fileRef = window.storageApi.ref(window.storage, path);
        await window.storageApi.uploadBytes(fileRef, blob, { contentType: mimeType });
        const downloadUrl = await window.storageApi.getDownloadURL(fileRef);
        adminNavIconsDraft[key] = downloadUrl;
        renderAdminNavIconsTab();
        window.showToast('✅ 圖片上傳成功，請點擊「儲存全部改動」才會正式生效', '🎉');
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
        window.showToast('✅ 圖示設定已儲存，全站即時生效', '🎉');
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
      const statusLabel = status === 'pending' ? '⏳ 待審批' : (status === 'approved' ? '✅ 已批准' : '❌ 已駁回');
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
          <p style="font-size:12px; color:#aaa; margin-bottom:3px;">🆔 ${escapeHtml(uid)}</p>
          ${status === 'rejected' && a.rejectionReason ? `<p style="font-size:13px; color:#8a2f2f; background:#FBEAEA; border-radius:6px; padding:6px 8px; margin-bottom:3px;">駁回原因：${escapeHtml(a.rejectionReason)}</p>` : ''}
          ${status === 'pending' ? `
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px;">
              <button class="btn btn-primary" style="font-size:13px; padding:4px 9px;" onclick="window.adminApproveTutorApp('${uid}')">✅ 批准</button>
              <button class="btn btn-outline" style="font-size:13px; padding:4px 9px;" onclick="window.adminRejectTutorApp('${uid}')">❌ 駁回</button>
            </div>
          ` : ''}
        </div>
      `;
    }

    function buildAdminTutorCardHtml(docSnap) {
      const t = docSnap.data();
      const uid = docSnap.id;
      const status = t.status || 'active';
      const statusLabel = status === 'active' ? '🟢 正常' : '🚫 已停權';
      const statusColor = status === 'active' ? '#2F6B3A' : '#C0524A';
      const subjectsHtml = (t.subjectsIntended || [])
        .map(s => `<span class="tag" style="background:#F0F6F8; color:#1E4550; margin-right:4px;">${escapeHtml(s)}</span>`)
        .join('');
      return `
        <div class="admin-card">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
            <span style="font-weight:700; color:${statusColor}; font-size:13px;">${statusLabel}</span>
            <span style="font-size:12px; color:#aaa;">🆔 ${escapeHtml(uid)}</span>
          </div>
          <p style="font-size:13px; margin-bottom:3px;"><b>${escapeHtml(t.displayName || '—')}</b></p>
          <p style="font-size:13px; color:#666; margin-bottom:3px;">${escapeHtml(t.bio || '')}</p>
          <p style="font-size:13px; margin-bottom:3px;">${subjectsHtml}</p>
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px;">
            ${status === 'active'
              ? `<button class="btn btn-red" style="font-size:13px; padding:4px 9px;" onclick="window.adminSuspendTutor('${uid}')">🚫 停權</button>`
              : `<button class="btn btn-outline" style="font-size:13px; padding:4px 9px;" onclick="window.adminReinstateTutor('${uid}')">♻️ 解除停權</button>`}
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
        <h4 style="font-size:14px; font-weight:bold; color:var(--brand-800); margin:4px 0 8px;">⏳ 待審批申請</h4>
        ${pendingHtml}
        <h4 style="font-size:14px; font-weight:bold; color:var(--brand-800); margin:18px 0 8px;">🎓 導師名單</h4>
        ${tutorsHtml}
        ${historyHtml ? `<h4 style="font-size:14px; font-weight:bold; color:var(--brand-800); margin:18px 0 8px;">📜 申請歷史（已批准／已駁回）</h4>${historyHtml}` : ''}
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
        window.showToast('已駁回導師申請', '🗂️');
      } catch (err) {
        window.showToast('駁回失敗：' + (err.message || err), '❌');
      }
    };

    window.adminSuspendTutor = async function(uid) {
      if (!confirm('確定停權這位導師？其已上架的筆記會自動下架，但已購買的學生保留下載權。')) return;
      try {
        await window.callCloudFunction('suspendTutor', { targetUid: uid });
        window.showToast('已停權該導師', '🚫');
      } catch (err) {
        window.showToast('停權失敗：' + (err.message || err), '❌');
      }
    };

    window.adminReinstateTutor = async function(uid) {
      try {
        await window.callCloudFunction('reinstateTutor', { targetUid: uid });
        window.showToast('已解除停權', '✅');
      } catch (err) {
        window.showToast('解除停權失敗：' + (err.message || err), '❌');
      }
    };

    // 頁面一載入就檢查一次（處理直接開 #admin 網址嘅情況）
    checkAdminHashRoute();
