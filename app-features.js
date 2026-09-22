// ConcenMate · app-features.js
// ------------------------------------------------------------
// Phase 5（程式碼結構化）第二步：呢個檔案原本係 index.html 入面一個
// 普通（非 module）嘅 <script>…</script> 區塊，而家搬咗出嚟做獨立檔
// 案，用 <script src="app-features.js"> 載入。
//
// ⚠️ 呢個檔案唔係 ES module，同 app-core.js 唔一樣：佢入面嘅
// function／變數同其他普通 <script> 區塊（包括 index.html 主檔入面
// 未搬走嘅部分）共用同一個全域 scope——即係話呢個檔案定義嘅函式
// （例如 showToast、openModal……）其他分頁／檔案照樣可以直接嗌得
// 到，行為同搬之前一模一樣。搬檔案純粹係執行時機同全域可見度冇變
// 之下，將內容物理上放去獨立檔案，方便日後搵嘢同減少單一檔案體積。
//
// 內容包括：除錯面板、Toast／Modal 工具函式、聊天視窗、時數扭蛋機
// （Gacha）、等級／經驗值計算、貼紙圖鑑、疑難解答區（QA）、好友、
// Ottie 頭像、溫習日曆等一大批前端 UI 邏輯。
//
// 載入次序好緊要：呢個檔案要喺 index.html 入面原本嗰個位置（即係
// app-core.js 之前）繼續保持喺度，唔可以搬去第二個位置，因為後面
// 仲有其他 <script> 區塊會直接用到呢度定義嘅函式／變數。

    // 開發測試用：除錯面板預設收埋，撳嗰粒細圓掣先展開／收返埋
    window.toggleDevBuildBadge = function() {
      const content = document.getElementById('dev-build-badge-content');
      if (content) content.classList.toggle('hidden');
    };

    // 開發測試用：自動更新載入時間戳記
    document.addEventListener("DOMContentLoaded", () => {
      const timeBadge = document.getElementById('load-timestamp');
      if (timeBadge) {
        const now = new Date();
        const dateStr = now.getFullYear() + '/' + 
                        (now.getMonth()+1).toString().padStart(2, '0') + '/' + 
                        now.getDate().toString().padStart(2, '0');
        const timeStr = now.getHours().toString().padStart(2, '0') + ':' + 
                        now.getMinutes().toString().padStart(2, '0') + ':' + 
                        now.getSeconds().toString().padStart(2, '0');
        timeBadge.innerText = `${dateStr} ${timeStr}`;
      }

      // 將頂部設定的版號注入到除錯面板中
      const versionBadge = document.getElementById('version-display');
      if (versionBadge && window.APP_VERSION) {
        versionBadge.innerText = window.APP_VERSION;
      }
    });

    window.currentUser = null;

    function showToast(msg, icon = 'ℹ️') {
      const toast = document.getElementById('toast-box');
      document.getElementById('toast-msg').innerText = msg;
      document.getElementById('toast-icon').innerText = icon;
      toast.classList.add('show');
      setTimeout(() => { toast.classList.remove('show'); }, 3200);
    }
    window.showToast = showToast;

    function openModal(id) {
      document.getElementById(id).style.display = 'flex';
      // 打開「註冊」視窗嗰陣，順便初始化學生嗰邊嘅「地區／學校」
      // 選單同「喜愛學科」剔選器——呢兩樣嘢淨係喺 setRegisterAccountType()
      // 入面先會畫，而個註冊視窗一開波個帳號類型預設係「學生」，但
      // 冇撳過切換按鈕就唔會執行過 setRegisterAccountType('student')，
      // 所以呢度要主動叫一次，等個表格一打開就已經填好晒。
      if (id === 'modal-register' && typeof window.setRegisterAccountType === 'function') {
        window.setRegisterAccountType('student');
      }
    }
    function closeModal(id) { document.getElementById(id).style.display = 'none'; }

    // 撳視窗外面（背景黑色半透明部分）就關閉彈出視窗
    document.addEventListener('click', function(e) {
      if (!e.target.classList.contains('modal-backdrop')) return;
      // 得返直接撳到 backdrop 本身（唔係裡面嘅 modal-box）先關閉
      e.target.style.display = 'none';
      // 如果關閉嘅係 QA 詳情視窗，同時停止留言監聽器
      if (e.target.id === 'modal-qa-detail' && typeof qaCommentUnsubscribe === 'function') {
        qaCommentUnsubscribe();
        qaCommentUnsubscribe = null;
      }
    });
    window.openModal = openModal;
    window.closeModal = closeModal;

    // ⚠️ 呢個函數之前試過俾人用 window.switchTab = function(...) { 舊嘅(...);
    // ...新嘅嘢... } 咁樣「加外皮」加多兩次，變咗三層 wrapper 疊埋一齊行，
    // 好難追蹤邊個分頁實際會觸發乜嘢。而家已經全部整合返喺呢一個函數
    // 度，日後想加/減邊個分頁一開會做啲乜，直接嚟呢度改，唔好再加新
    // 一層 wrapper。
    function switchTab(tabId, btn, diaryUid) {
      if (!window.currentUser) {
        openModal('modal-login');
        return;
      }

      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

      const targetTab = document.getElementById('tab-' + tabId);
      if (targetTab) targetTab.classList.add('active');

      if (btn) {
        btn.classList.add('active');
      } else {
        const targetBtn = document.getElementById('nav-btn-' + tabId);
        if (targetBtn) targetBtn.classList.add('active');
      }

      // 「夥伴與讀書會」分頁一開就即刻載入好友名單同收到嘅好友邀請
      if (tabId === 'social') {
        if (typeof window.loadFriendsList === 'function') window.loadFriendsList();
        if (typeof window.loadFriendRequests === 'function') window.loadFriendRequests();
      }

      // 「疑難解答區」分頁一開就即刻載入提問（已有監聽器嘅話只會重畫，唔會再問 Firestore）
      if (tabId === 'qa' && window.db && window.fs && typeof loadQAPosts === 'function') loadQAPosts();

      // 「時數扭蛋機」分頁一開就更新返積分顯示同貼紙圖鑑收集進度
      if (tabId === 'store' && typeof syncGachaPtsDisplay === 'function') syncGachaPtsDisplay();
      if (tabId === 'store' && typeof updateStickerProgressUI === 'function') updateStickerProgressUI();

      // 「個人資料」分頁一開就載入中獎記錄
      if (tabId === 'profile' && typeof window.loadMyGachaHistory === 'function') window.loadMyGachaHistory();

      // 「溫習日記」分頁一開：冇傳 diaryUid（或傳咗自己個 uid）就顯示自己
      // 嘅溫習日記，傳咗第二人個 uid（由朋友資料卡度撳「查看溫習日記」
      // 入嚟）就顯示緊嗰位朋友嘅溫習日記（見 openDiaryView()）
      if (tabId === 'diary' && typeof window.openDiaryView === 'function') {
        window.openDiaryView(diaryUid || null);
      }

      // 「管理教材」分頁（導師專用）一開就即刻載入呢位導師自己嘅科目
      // ／課題／教材清單，函式定義喺 tutor-panel.js
      if (tabId === 'tutor-materials' && typeof window.renderTutorMaterialsTab === 'function') {
        window.renderTutorMaterialsTab();
      }

      // 「溫習資源」分頁（學生專用）一開就即刻載入導師名錄，函式定義喺
      // tutor-panel.js
      if (tabId === 'vip' && typeof window.renderTutorDirectoryTab === 'function') {
        window.renderTutorDirectoryTab();
      }

      // 「溫習排行榜」分頁一開就即刻載入（預設：自己所屬地區嘅個人榜）
      if (tabId === 'leaderboard' && typeof window.loadLeaderboardTab === 'function') {
        window.loadLeaderboardTab();
      }

      // 導師專頁：由「溫習資源」入面撳導師卡片入嚟（見 tutor-panel.js
      // 嘅 window.openTutorProfileView()），呢度借用返 diaryUid 呢個參數
      // 位傳導師 uid，唔使另外加多個參數
      if (tabId === 'tutor-view' && typeof window.openTutorProfileView === 'function') {
        window.openTutorProfileView(diaryUid || null);
      }
    }
    window.switchTab = switchTab;

    // ===================== EXP / Level / 段位系統 =====================
    // EXP 只升不跌，代表用家「總溫習成就」；PTS 會升會跌，用嚟扭蛋消費。
    // 呢度嘅 EXP 賺取速度、升級難度、段位稱號全部由 LEVEL_CONFIG 控制，
    // 管理員可以喺「管理後台 → 🎮 等級系統」隨時調整，唔使再改程式碼、推 GitHub。
    // 呢度啲數值只係喺 Firestore 未載入完之前用嘅預設值。
    const DEFAULT_LEVEL_CONFIG = {
      expPerMinute: 1,
      levelCurveFactor: 10, // 公式：升到 Level L 總共需要嘅 EXP = 難度係數 × L × (L−1)
      ranks: [
        { minLevel: 1,  emoji: '🌱', title: '溫習新手', titleEn: 'Novice',     color: '#6FA96F', desc: '剛剛起步，每一分鐘的溫習都算數，慢慢累積 EXP！' },
        { minLevel: 10, emoji: '📚', title: '專注學徒', titleEn: 'Apprentice', color: '#4A8FA0', desc: '已經養成溫習習慣，繼續保持專注，向下一個段位進發。' },
        { minLevel: 20, emoji: '🔥', title: '自律達人', titleEn: 'Expert',     color: '#D9764A', desc: '自律力爆錶，是身邊同學的榜樣！' },
        { minLevel: 40, emoji: '👑', title: '專注大師', titleEn: 'Master',     color: '#D9A441', desc: '長期堅持先可以去到這個段位，值得驕傲！' },
        { minLevel: 60, emoji: '🌌', title: '傳說學霸', titleEn: 'Legend',     color: '#8B5FBF', desc: '傳說級別的溫習量，少數人先去到的頂尖段位。' }
      ]
    };
    let LEVEL_CONFIG = JSON.parse(JSON.stringify(DEFAULT_LEVEL_CONFIG));
    window.LEVEL_CONFIG = LEVEL_CONFIG;

    function calcLevelInfo(exp) {
      exp = Math.max(0, parseInt(exp) || 0);
      const f = (LEVEL_CONFIG && LEVEL_CONFIG.levelCurveFactor) || 10;
      const cumForLevel = (L) => f * L * (L - 1);
      let level = Math.max(1, Math.floor((f + Math.sqrt(f * f + 4 * f * exp)) / (2 * f)));
      while (cumForLevel(level + 1) <= exp) level++;
      while (level > 1 && cumForLevel(level) > exp) level--;
      const curFloor = cumForLevel(level);
      const nextFloor = cumForLevel(level + 1);
      return {
        level,
        exp,
        expIntoLevel: exp - curFloor,
        expNeededForNext: nextFloor - curFloor,
        expRemaining: Math.max(0, nextFloor - exp),
        pctToNext: nextFloor > curFloor ? Math.min(100, ((exp - curFloor) / (nextFloor - curFloor)) * 100) : 100
      };
    }
    window.calcLevelInfo = calcLevelInfo;

    // 將小數形式嘅時數（例如 5.3）轉做「X小時Y分鐘」文字形式顯示
    function formatHoursMinutes(hours) {
      const totalMin = Math.max(0, Math.round((parseFloat(hours) || 0) * 60));
      const hh = Math.floor(totalMin / 60);
      const mm = totalMin % 60;
      if (hh <= 0) return `${mm}分鐘`;
      return `${hh}小時${mm}分鐘`;
    }
    window.formatHoursMinutes = formatHoursMinutes;

    // ===================== 🏆 溫習排行榜 =====================
    // 分區個人排行榜／學校排行榜，都係查 leaderboardEntries／
    // schoolLeaderboard（累積）或 schoolLeaderboardMonthly（本月）呢幾個
    // 「公開精簡版」collection（唔係直接查 users——users 唔開放 list，
    // 見 firestore.rules 同 functions/index.js 嘅
    // syncLeaderboardOnUserWrite），呢啲 collection 由 Cloud Function
    // 自動同步，前端淨係讀，唔使亦唔可以自己寫。
    let leaderboardMode = 'district'; // 'district' | 'schoolInternal' | 'school'
    // 「本月」／「累積」呢個切換獨立於上面嗰個 mode，兩者可以自由組合
    // （例如「本月＋分區個人」、「累積＋學校總排行」）。本月榜用
    // monthlyHours／monthlyPeriod 呢兩個由 Cloud Function 同步過嚟嘅欄
    // 位，一到新一個月，用戶帳戶嘅 monthlyPeriod 就會自動轉做新月份，
    // 舊月份嘅紀錄唔會再喺「本月」呢個查詢入面出現，等於自動歸零重新
    // 競賽，唔使另外寫重設工作。
    let leaderboardPeriod = 'month'; // 'month' | 'alltime'

    // 學校名做 schoolLeaderboard／schoolLeaderboardMonthly 文件 ID 嗰套
    // 消毒邏輯，一定要同 functions/index.js 嘅 sanitizeSchoolIdForDoc
    // 完全一致，先至查得返自己間學校對應嗰份文件。
    function sanitizeSchoolIdForDoc(schoolName) {
      const trimmed = (schoolName || '').trim();
      if (!trimmed) return null;
      const safe = trimmed.replace(/\//g, '_').slice(0, 300);
      return (safe === '.' || safe === '..') ? null : safe;
    }

    // 分區揀選單：預設帶埋自己個地區（有嘅話）排最前面方便揀，跟住
    // 用返註冊表格嗰個 HK_DISTRICT_REGION_GROUPS 分組顯示晒十八區。
    function populateLeaderboardDistrictSelect() {
      const sel = document.getElementById('lb-district-select');
      if (!sel || !window.HK_DISTRICT_REGION_GROUPS) return;
      if (sel.dataset.populated === '1') return;
      const groupsHtml = window.HK_DISTRICT_REGION_GROUPS.map((g) => {
        const optionsHtml = g.districts.map((d) => `<option value="${d}">${d}</option>`).join('');
        return `<optgroup label="${g.region}">${optionsHtml}</optgroup>`;
      }).join('');
      sel.innerHTML = groupsHtml;
      const myDistrict = window.currentUser && window.currentUser.district;
      if (myDistrict) sel.value = myDistrict;
      sel.dataset.populated = '1';
    }

    window.switchLeaderboardMode = function(mode) {
      leaderboardMode = (mode === 'school' || mode === 'schoolInternal') ? mode : 'district';
      const districtBtn = document.getElementById('lb-mode-district-btn');
      const schoolInternalBtn = document.getElementById('lb-mode-schoolInternal-btn');
      const schoolBtn = document.getElementById('lb-mode-school-btn');
      const districtPickerWrap = document.getElementById('lb-district-picker-wrap');
      const schoolInternalLabelWrap = document.getElementById('lb-school-internal-label-wrap');
      if (districtBtn) districtBtn.classList.toggle('active', leaderboardMode === 'district');
      if (schoolInternalBtn) schoolInternalBtn.classList.toggle('active', leaderboardMode === 'schoolInternal');
      if (schoolBtn) schoolBtn.classList.toggle('active', leaderboardMode === 'school');
      if (districtPickerWrap) districtPickerWrap.style.display = (leaderboardMode === 'district') ? 'flex' : 'none';
      if (schoolInternalLabelWrap) schoolInternalLabelWrap.style.display = (leaderboardMode === 'schoolInternal') ? 'block' : 'none';
      window.loadLeaderboardTab();
    };

    window.switchLeaderboardPeriod = function(period) {
      leaderboardPeriod = (period === 'alltime') ? 'alltime' : 'month';
      const monthBtn = document.getElementById('lb-period-month-btn');
      const alltimeBtn = document.getElementById('lb-period-alltime-btn');
      if (monthBtn) monthBtn.classList.toggle('active', leaderboardPeriod === 'month');
      if (alltimeBtn) alltimeBtn.classList.toggle('active', leaderboardPeriod === 'alltime');
      window.loadLeaderboardTab();
    };

    window.loadLeaderboardTab = async function() {
      if (!window.currentUser || !window.db || !window.fs) return;
      populateLeaderboardDistrictSelect();
      if (leaderboardMode === 'school') {
        await renderSchoolLeaderboard();
      } else if (leaderboardMode === 'schoolInternal') {
        await renderSchoolInternalLeaderboard();
      } else {
        await renderDistrictLeaderboard();
      }
    };

    // uid 有值先會顯示頭像同令個名可以撳（撳落去開 viewUserProfile() 嗰個
    // 資料卡）——學校總排行榜嗰行係「一間學校」唔係「一個人」，冇 uid
    // 可以傳，就會維持返舊有冇頭像／唔可以撳嘅顯示方式。
    function renderLeaderboardRow(rank, primaryText, secondaryText, isMe, avatarBase64, uid) {
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
      const clickable = !!uid;
      const clickAttr = clickable ? ` onclick="viewUserProfile('${uid}')" style="cursor:pointer;"` : '';
      const avatarHtml = clickable ? `
            <div style="width:32px; height:32px; border-radius:50%; background:var(--brand-100); color:var(--brand-800); display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:bold; flex-shrink:0; overflow:hidden;">
              ${avatarBase64 ? `<img src="${avatarBase64}" style="width:100%; height:100%; object-fit:cover;" alt="頭像">` : escapeHtml((primaryText || '同').charAt(0).toUpperCase())}
            </div>
      ` : '';
      return `
        <div class="card" style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; ${isMe ? 'border:2px solid var(--brand-500); background:var(--brand-50);' : ''}">
          <div style="display:flex; align-items:center; gap:10px; min-width:0;">
            <div style="font-size:15px; font-weight:bold; color:var(--brand-800); width:34px; flex-shrink:0; text-align:center;">${medal}</div>
            ${avatarHtml}
            <div${clickAttr} style="font-size:14px; font-weight:bold; color:var(--brand-800); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(primaryText)}${isMe ? ' <span style="font-size:12px; color:var(--brand-600); font-weight:normal;">（你）</span>' : ''}</div>
          </div>
          <div style="font-size:13px; color:#3E7A8A; font-weight:700; white-space:nowrap; flex-shrink:0;">${escapeHtml(secondaryText)}</div>
        </div>
      `;
    }

    async function renderDistrictLeaderboard() {
      const listEl = document.getElementById('lb-list-container');
      const ownRankWrap = document.getElementById('lb-own-rank-wrap');
      const districtSel = document.getElementById('lb-district-select');
      if (!listEl || !districtSel) return;
      const district = districtSel.value;
      if (!district) return;
      listEl.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">載入排行榜中…</p>';
      if (ownRankWrap) ownRankWrap.style.display = 'none';

      // 本月榜：query 多加一個 monthlyPeriod == 今個月 嘅條件，並且改用
      // monthlyHours 呢個欄位排序。因為 Cloud Function 淨係喺用戶「有動
      // 靜」（溫習、改資料等）先會寫入 leaderboardEntries，如果上個月一
      // 直冇再溫習，佢個 monthlyPeriod 就會停留喺上個月，match 唔到今個
      // 月嘅條件，自動唔會出現喺「本月」榜度——等於自動歸零重新競賽，
      // 唔使另外寫重設工作／排程。
      const isMonth = leaderboardPeriod === 'month';
      const hoursField = isMonth ? 'monthlyHours' : 'hours';
      const curMonthStr = getCurrentMonthStr();

      try {
        const constraints = [
          window.fs.where('district', '==', district),
        ];
        if (isMonth) constraints.push(window.fs.where('monthlyPeriod', '==', curMonthStr));
        constraints.push(window.fs.orderBy(hoursField, 'desc'));
        constraints.push(window.fs.limit(50));

        const q = window.fs.query(window.fs.collection(window.db, 'leaderboardEntries'), ...constraints);
        const snap = await window.fs.getDocs(q);
        const entries = snap.docs.map((d) => d.data());

        if (entries.length === 0) {
          listEl.innerHTML = `<p style="text-align:center; color:#999; padding:20px;">這個地區暫時未有同學上榜，開始溫習就可以成為第一位！</p>`;
        } else {
          listEl.innerHTML = entries.map((e, i) =>
            renderLeaderboardRow(i + 1, e.username || '同學', formatHoursMinutes(e[hoursField]), e.uid === window.currentUser.uid, e.avatarBase64, e.uid)
          ).join('');
        }

        // 如果自己已經喺榜上（頭 50 名），唔使再問多次伺服器攞名次；
        // 唔喺榜上（可能未上榜，或者排第 51 名之後）先計算真正名次。呢度
        // 判斷「自己本月有冇上榜」時要留意：如果自己帳戶今個月一直未溫
        // 習過，window.currentUser.monthlyPeriod 都會係上個月，代表本月
        // 時數應該當 0，唔可以攞返上個月嘅舊數字嚟顯示，會誤導用戶。
        const meInList = entries.some((e) => e.uid === window.currentUser.uid);
        if (!meInList && window.currentUser.district === district) {
          const myHours = isMonth
            ? ((window.currentUser.monthlyPeriod === curMonthStr) ? (parseFloat(window.currentUser.monthlyHours) || 0) : 0)
            : (parseFloat(window.currentUser.hours) || 0);
          const countConstraints = [
            window.fs.where('district', '==', district),
          ];
          if (isMonth) countConstraints.push(window.fs.where('monthlyPeriod', '==', curMonthStr));
          countConstraints.push(window.fs.where(hoursField, '>', myHours));
          const countQ = window.fs.query(window.fs.collection(window.db, 'leaderboardEntries'), ...countConstraints);
          const countSnap = await window.fs.getCountFromServer(countQ);
          const myRank = countSnap.data().count + 1;
          if (ownRankWrap) {
            ownRankWrap.style.display = 'block';
            ownRankWrap.innerHTML = renderLeaderboardRow(myRank, window.currentUser.username || '你', formatHoursMinutes(myHours), true, window.currentUser.avatarBase64, window.currentUser.uid);
          }
        } else if (!meInList && ownRankWrap) {
          // 自己個帳戶就讀地區同揀緊嘅地區唔同（睇緊第二區嘅榜），冇
          // 「自己名次」呢個概念可以顯示，唔使畫個footer
          ownRankWrap.style.display = 'none';
        }
      } catch (err) {
        console.error('載入分區排行榜失敗:', err);
        listEl.innerHTML = `<p style="text-align:center; color:#c0392b; padding:20px;">載入排行榜失敗：${escapeHtml(err.message || err)}</p>`;
      }
    }

    // 「校內排行榜」：將同一間學校（school 欄位完全脗合）嘅所有學生
    // 個人時數逐個排名，同「分區個人排行榜」查詢邏輯一樣，淨係將
    // district 換成 school，冚唪唥都係淨係睇自己間學校，冇地區選單，
    // 唔使揀。
    async function renderSchoolInternalLeaderboard() {
      const listEl = document.getElementById('lb-list-container');
      const ownRankWrap = document.getElementById('lb-own-rank-wrap');
      const nameEl = document.getElementById('lb-school-internal-name');
      if (!listEl) return;

      const mySchool = (window.currentUser.school || '').trim();
      if (nameEl) nameEl.innerText = mySchool || '未設定';
      if (ownRankWrap) ownRankWrap.style.display = 'none';

      if (!mySchool) {
        listEl.innerHTML = `<p style="text-align:center; color:#999; padding:20px;">你的帳戶未設定學校名稱，請先到「我的帳戶」填寫學校，先可以睇到校內排行榜</p>`;
        return;
      }

      listEl.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">載入排行榜中…</p>';

      const isMonth = leaderboardPeriod === 'month';
      const hoursField = isMonth ? 'monthlyHours' : 'hours';
      const curMonthStr = getCurrentMonthStr();

      try {
        const constraints = [window.fs.where('school', '==', mySchool)];
        if (isMonth) constraints.push(window.fs.where('monthlyPeriod', '==', curMonthStr));
        constraints.push(window.fs.orderBy(hoursField, 'desc'));
        constraints.push(window.fs.limit(50));

        const q = window.fs.query(window.fs.collection(window.db, 'leaderboardEntries'), ...constraints);
        const snap = await window.fs.getDocs(q);
        const entries = snap.docs.map((d) => d.data());

        if (entries.length === 0) {
          listEl.innerHTML = `<p style="text-align:center; color:#999; padding:20px;">你的學校暫時未有同學上榜，開始溫習就可以成為第一位！</p>`;
        } else {
          listEl.innerHTML = entries.map((e, i) =>
            renderLeaderboardRow(i + 1, e.username || '同學', formatHoursMinutes(e[hoursField]), e.uid === window.currentUser.uid, e.avatarBase64, e.uid)
          ).join('');
        }

        const meInList = entries.some((e) => e.uid === window.currentUser.uid);
        if (!meInList) {
          const myHours = isMonth
            ? ((window.currentUser.monthlyPeriod === curMonthStr) ? (parseFloat(window.currentUser.monthlyHours) || 0) : 0)
            : (parseFloat(window.currentUser.hours) || 0);
          const countConstraints = [window.fs.where('school', '==', mySchool)];
          if (isMonth) countConstraints.push(window.fs.where('monthlyPeriod', '==', curMonthStr));
          countConstraints.push(window.fs.where(hoursField, '>', myHours));
          const countQ = window.fs.query(window.fs.collection(window.db, 'leaderboardEntries'), ...countConstraints);
          const countSnap = await window.fs.getCountFromServer(countQ);
          const myRank = countSnap.data().count + 1;
          if (ownRankWrap) {
            ownRankWrap.style.display = 'block';
            ownRankWrap.innerHTML = renderLeaderboardRow(myRank, window.currentUser.username || '你', formatHoursMinutes(myHours), true, window.currentUser.avatarBase64, window.currentUser.uid);
          }
        }
      } catch (err) {
        console.error('載入校內排行榜失敗:', err);
        listEl.innerHTML = `<p style="text-align:center; color:#c0392b; padding:20px;">載入排行榜失敗：${escapeHtml(err.message || err)}</p>`;
      }
    }

    async function renderSchoolLeaderboard() {
      const listEl = document.getElementById('lb-list-container');
      const ownRankWrap = document.getElementById('lb-own-rank-wrap');
      if (!listEl) return;
      listEl.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">載入排行榜中…</p>';
      if (ownRankWrap) ownRankWrap.style.display = 'none';

      const mySchoolId = sanitizeSchoolIdForDoc(window.currentUser.school);

      // 本月榜：學校總時數用另一個獨立 collection（schoolLeaderboardMonthly），
      // 文件 ID 係「學校ID_年-月」，一到新一個月，Cloud Function 就會開始
      // 寫入一份全新嘅文件（舊月份嗰份唔會被清走，但「本月」呢個查詢淨
      // 係揀返今個月嘅文件 ID，自動變相歸零重新競賽），唔使另外寫重設
      // 工作／排程，亦唔使擔心上個月數字滲埋入嚟。
      const isMonth = leaderboardPeriod === 'month';
      const curMonthStr = getCurrentMonthStr();
      const collectionName = isMonth ? 'schoolLeaderboardMonthly' : 'schoolLeaderboard';
      const totalField = isMonth ? 'totalHours' : 'totalHours'; // 兩邊 collection 都叫 totalHours，保留呢個變數方便日後改名
      const myDocId = isMonth ? (mySchoolId ? `${mySchoolId}_${curMonthStr}` : null) : mySchoolId;

      try {
        const constraints = [];
        if (isMonth) constraints.push(window.fs.where('period', '==', curMonthStr));
        constraints.push(window.fs.orderBy(totalField, 'desc'));
        constraints.push(window.fs.limit(50));

        const q = window.fs.query(window.fs.collection(window.db, collectionName), ...constraints);
        const snap = await window.fs.getDocs(q);
        const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        if (entries.length === 0) {
          listEl.innerHTML = `<p style="text-align:center; color:#999; padding:20px;">暫時未有學校上榜，開始溫習就可以幫你的學校爭取第一！</p>`;
        } else {
          listEl.innerHTML = entries.map((e, i) =>
            renderLeaderboardRow(i + 1, e.schoolName || '未命名學校', formatHoursMinutes(e[totalField]), e.id === myDocId)
          ).join('');
        }

        const meInList = myDocId && entries.some((e) => e.id === myDocId);
        if (!meInList && myDocId) {
          const mySchoolSnap = await window.fs.getDoc(window.fs.doc(window.db, collectionName, myDocId));
          const myTotalHours = mySchoolSnap.exists() ? (mySchoolSnap.data()[totalField] || 0) : 0;
          const mySchoolName = mySchoolSnap.exists() ? mySchoolSnap.data().schoolName : window.currentUser.school;
          const countConstraints = [];
          if (isMonth) countConstraints.push(window.fs.where('period', '==', curMonthStr));
          countConstraints.push(window.fs.where(totalField, '>', myTotalHours));
          const countQ = window.fs.query(window.fs.collection(window.db, collectionName), ...countConstraints);
          const countSnap = await window.fs.getCountFromServer(countQ);
          const myRank = countSnap.data().count + 1;
          if (ownRankWrap) {
            ownRankWrap.style.display = 'block';
            ownRankWrap.innerHTML = renderLeaderboardRow(myRank, mySchoolName || window.currentUser.school, formatHoursMinutes(myTotalHours), true);
          }
        }
      } catch (err) {
        console.error('載入學校排行榜失敗:', err);
        listEl.innerHTML = `<p style="text-align:center; color:#c0392b; padding:20px;">載入排行榜失敗：${escapeHtml(err.message || err)}</p>`;
      }
    }

    function getRankTitle(level) {
      const ranks = (LEVEL_CONFIG && Array.isArray(LEVEL_CONFIG.ranks) && LEVEL_CONFIG.ranks.length)
        ? LEVEL_CONFIG.ranks : DEFAULT_LEVEL_CONFIG.ranks;
      const sorted = ranks.slice().sort((a, b) => (b.minLevel || 0) - (a.minLevel || 0));
      for (const r of sorted) {
        if (level >= (r.minLevel || 0)) return r;
      }
      return sorted[sorted.length - 1] || DEFAULT_LEVEL_CONFIG.ranks[0];
    }
    window.getRankTitle = getRankTitle;

    // 更新頭部徽章 / 主頁 Hero / 個人資料頁嘅 Level 顯示（全部都會顯示仍欠幾多 EXP 先可以升級）
    function updateLevelDisplay() {
      if (!window.currentUser) return;
      const info = calcLevelInfo(window.currentUser.exp || 0);
      const rank = getRankTitle(info.level);

      const headerBadge = document.getElementById('header-level-badge');
      if (headerBadge) {
        headerBadge.innerText = `${rank.emoji} Lv.${info.level}`;
        headerBadge.title = `${rank.title}（${rank.titleEn}）｜仍欠 ${info.expRemaining} EXP 就升到 Lv.${info.level + 1}`;
      }

      const globalLevelBadge = document.getElementById('global-level-badge');
      if (globalLevelBadge) globalLevelBadge.innerText = `${rank.emoji} Lv.${info.level} ${rank.title} · ${info.expIntoLevel}/${info.expNeededForNext} EXP`;
      const globalExpBar = document.getElementById('global-exp-bar');
      if (globalExpBar) globalExpBar.style.width = info.pctToNext + '%';

      const profLevelNum = document.getElementById('profile-level-num');
      const profRankTitle = document.getElementById('profile-rank-title');
      const profExpText = document.getElementById('profile-exp-text');
      const profExpBar = document.getElementById('profile-exp-bar');
      if (profLevelNum) profLevelNum.innerText = `Lv.${info.level}`;
      if (profRankTitle) {
        profRankTitle.innerText = `${rank.emoji} ${rank.title} (${rank.titleEn})`;
        profRankTitle.style.color = rank.color;
      }
      if (profExpText) profExpText.innerText = `${info.expIntoLevel} / ${info.expNeededForNext} EXP · 仍欠 ${info.expRemaining} EXP 就升到 Lv.${info.level + 1}（總計 ${info.exp} EXP）`;
      if (profExpBar) profExpBar.style.width = info.pctToNext + '%';

      // 主頁「我的水獺」卡嘅等級／升級所需 EXP 都係跟呢份 info 嚟，
      // updateLevelDisplay() 呼叫嘅地方（登入、溫習畀分等）一併刷新埋佢，
      // 唔使逐個 call site 加多一句。
      if (typeof updateOtterStatsCard === 'function') updateOtterStatsCard();
    }
    window.updateLevelDisplay = updateLevelDisplay;

    // 置頂狀態列撳「Lv.」嗰邊會彈出呢個視窗：列晒全部段位、每個段位嘅升級詳情
    // 文字（由 Admin後台「🎮 等級系統」控制），並標明用家自己而家去到邊個段位。
    function openLevelInfoModal() {
      if (!window.currentUser) return;
      const info = calcLevelInfo(window.currentUser.exp || 0);
      const rank = getRankTitle(info.level);

      const currentEl = document.getElementById('level-info-current');
      if (currentEl) {
        currentEl.innerHTML = `
          <div style="font-size:15px; font-weight:bold; color:${rank.color || 'var(--brand-800)'};">${rank.emoji} Lv.${info.level} ${escapeHtml(rank.title || '')}（${escapeHtml(rank.titleEn || '')}）</div>
          <div style="font-size:13px; color:#888; margin-top:4px;">${info.expIntoLevel} / ${info.expNeededForNext} EXP · 仍欠 ${info.expRemaining} EXP 就升到 Lv.${info.level + 1}</div>
          ${rank.desc ? `<div style="font-size:13px; color:#555; margin-top:6px; line-height:1.5;">${escapeHtml(rank.desc)}</div>` : ''}
        `;
      }

      const tiersEl = document.getElementById('level-info-tiers');
      if (tiersEl) {
        const ranks = (LEVEL_CONFIG && Array.isArray(LEVEL_CONFIG.ranks) && LEVEL_CONFIG.ranks.length)
          ? LEVEL_CONFIG.ranks : DEFAULT_LEVEL_CONFIG.ranks;
        const sorted = ranks.slice().sort((a, b) => (a.minLevel || 0) - (b.minLevel || 0));
        tiersEl.innerHTML = sorted.map(r => {
          const reached = info.level >= (r.minLevel || 0);
          const isCurrent = r === rank || (r.minLevel === rank.minLevel && r.title === rank.title);
          return `
            <div style="display:flex; gap:10px; align-items:flex-start; padding:8px 10px; border-radius:10px; border:1px solid ${isCurrent ? 'var(--brand-500)' : '#eee'}; background:${isCurrent ? 'var(--brand-50)' : (reached ? '#fff' : '#fafafa')}; opacity:${reached ? '1' : '.6'};">
              <div style="font-size:20px; flex-shrink:0;">${r.emoji || '🌟'}</div>
              <div style="flex:1; min-width:0;">
                <div style="font-size:13px; font-weight:bold; color:${reached ? (r.color || 'var(--brand-800)') : '#999'};">
                  Lv.${r.minLevel || 1}+ ${escapeHtml(r.title || '')}${isCurrent ? ' <span style="font-size:13px; color:var(--brand-500);">（目前）</span>' : ''}
                </div>
                ${r.desc ? `<div style="font-size:13px; color:#888; margin-top:2px; line-height:1.4;">${escapeHtml(r.desc)}</div>` : ''}
              </div>
            </div>
          `;
        }).join('');
      }

      openModal('modal-level-info');
    }
    window.openLevelInfoModal = openLevelInfoModal;

    // PTS／EXP 獲得方式說明視窗：內容係固定文字，唔需要跟使用者數據
    // 動態計算，撳落「今日目標」旁邊嘅「!」圖示就會顯示。
    function openPtsExpInfoModal() {
      openModal('modal-pts-exp-info');
    }
    window.openPtsExpInfoModal = openPtsExpInfoModal;

    // ===================== 會員頭像 =====================
    // 統一畫返頭像嘅共用函數：有上傳過相片（currentUser.avatarBase64）
    // 就顯示相片，冇就沿用返舊有「用戶名首字母」嘅預設顯示。「編輯個人
    // 資料」頁面嘅預覽圈、同「我的帳號」資料卡嘅頭像圈，兩邊共用呢個
    // 函數，確保畫面一致，唔使分開兩份邏輯。
    function renderUserAvatar() {
      if (!window.currentUser) return;
      const initial = (window.currentUser.username || 'U').charAt(0).toUpperCase();
      const avatarSrc = window.currentUser.avatarBase64;
      ['prof-avatar-preview', 'myacc-avatar', 'diary-avatar'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (avatarSrc) {
          // 「我的帳號」資料卡同「溫習日記」分頁嗰兩個頭像圈可以撳大睇
          // （複用返 QA 相片嗰個 lightbox，並以圓形顯示），編輯頁面嗰個
          // 細預覽圈就唔使畀人撳（揀相／換相已經有專用嘅「更換頭像」
          // 掣，撳個預覽圈冇意義）。
          const clickable = id === 'myacc-avatar' || id === 'diary-avatar';
          el.innerHTML = `<img src="${avatarSrc}" style="width:100%; height:100%; object-fit:cover; border-radius:50%; ${clickable ? 'cursor:zoom-in;' : ''}" alt="會員頭像"${clickable ? ` onclick="openLightbox('${avatarSrc}', true)"` : ''}>`;
        } else {
          el.innerText = initial;
        }
      });
      // 注意：頁首最左上角嗰個圓形 Logo（#header-logo-img）一定要維持顯示
      // ConcenMate 品牌 Logo，唔可以換做頭像——嗰個位置係網站身份標誌，
      // 唔係用戶個人資料嘅顯示位。真正應該顯示用戶頭像嘅係主頁 Hero
      // 歡迎列「你好，OOO👋」旁邊嗰個圓形圖示（#home-hero-avatar）：
      // 上傳過頭像就顯示返自己個頭像，冇上傳就維持顯示品牌 Logo。
      const homeHeroAvatar = document.getElementById('home-hero-avatar');
      if (homeHeroAvatar) {
        homeHeroAvatar.src = avatarSrc || 'logo.png';
        if (avatarSrc) {
          homeHeroAvatar.style.cursor = 'zoom-in';
          homeHeroAvatar.onclick = () => openLightbox(avatarSrc, true);
        } else {
          homeHeroAvatar.style.cursor = 'default';
          homeHeroAvatar.onclick = null;
        }
      }
    }
    window.renderUserAvatar = renderUserAvatar;

    // ===================== 頭像調整（拖曳定位 + 縮放）=====================
    // 揀完相片之後，唔再自動置中裁切，而係彈出一個調整視窗俾用戶自己拖
    // 曳相片位置、用滑桿縮放，自己揀邊部分擺入個圓形頭像入面，先至輸出
    // 240x240 嘅正方形 JPEG，傳去 uploadAvatar 呢個 Cloud Function（入面
    // 會用 Google Cloud Vision 嘅 SafeSearch 檢測相片內容，通過先會真正
    // 寫入 Firestore）。
    let _avatarCropState = null;

    window.handleAvatarFileSelected = function(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      if (!window.currentUser) { window.showToast('請先登入會員', '⚠️'); return; }
      openAvatarCropModal(URL.createObjectURL(file));
    };

    function openAvatarCropModal(objectUrl) {
      const img = new Image();
      img.onload = () => {
        const VP = 260; // 同 index.html 入面 #avatar-crop-viewport 嘅寬／高一致
        const naturalW = img.naturalWidth;
        const naturalH = img.naturalHeight;
        const baseScale = Math.max(VP / naturalW, VP / naturalH); // 令相片喺 zoom=1 嗰陣就啱啱好蓋滿個圓形，冇留白
        _avatarCropState = {
          img, objectUrl, naturalW, naturalH, VP, baseScale,
          zoom: 1, offsetX: 0, offsetY: 0,
          dragging: false, dragStartX: 0, dragStartY: 0, startOffsetX: 0, startOffsetY: 0,
          _cx: 0, _cy: 0, _displayScale: baseScale
        };
        const imgEl = document.getElementById('avatar-crop-img');
        imgEl.src = objectUrl;
        imgEl.style.width = naturalW + 'px';
        imgEl.style.height = naturalH + 'px';
        const zoomSlider = document.getElementById('avatar-crop-zoom');
        if (zoomSlider) zoomSlider.value = 100;
        initAvatarCropDragHandlers();
        renderAvatarCropTransform();
        openModal('modal-avatar-crop');
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        window.showToast('圖片載入失敗，請更換其他相片', '🚫');
      };
      img.src = objectUrl;
    }

    // 根據目前嘅縮放／拖曳位移，計算相片應該點樣顯示（CSS transform），
    // 並且將「相片一定要蓋滿個圓形視窗、唔可以露出空白」呢個限制夾實
    // 落去（clamp cx／cy）。_cx／_cy／_displayScale 會暫存低嚟，等
    // confirmAvatarCrop() 用嚟計返實際裁切範圍。
    function renderAvatarCropTransform() {
      const s = _avatarCropState;
      if (!s) return;
      const displayScale = s.baseScale * s.zoom;
      const dispW = s.naturalW * displayScale;
      const dispH = s.naturalH * displayScale;
      const minX = s.VP - dispW; // <= 0
      const minY = s.VP - dispH;
      const cx0 = (s.VP - dispW) / 2;
      const cy0 = (s.VP - dispH) / 2;
      let cx = Math.min(0, Math.max(minX, cx0 + s.offsetX));
      let cy = Math.min(0, Math.max(minY, cy0 + s.offsetY));
      s._cx = cx;
      s._cy = cy;
      s._displayScale = displayScale;
      const imgEl = document.getElementById('avatar-crop-img');
      if (imgEl) imgEl.style.transform = `translate(${cx}px, ${cy}px) scale(${displayScale})`;
    }

    function initAvatarCropDragHandlers() {
      const vp = document.getElementById('avatar-crop-viewport');
      if (!vp || vp._dragHandlersBound) return;
      vp._dragHandlersBound = true;

      // 用 Map 追蹤所有現正按住嘅手指（pointerId -> {x,y}），咁先可以分辨單指拖拉同雙指縮放
      const activePointers = new Map();
      let pinchStartDist = 0;
      let pinchStartZoom = 1;

      const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

      vp.addEventListener('pointerdown', (e) => {
        if (!_avatarCropState) return;
        vp.setPointerCapture(e.pointerId);
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (activePointers.size === 2) {
          // 由單指拖拉切換去雙指縮放：記低開始時嘅兩指距離同當時嘅 zoom
          _avatarCropState.dragging = false;
          const pts = Array.from(activePointers.values());
          pinchStartDist = dist(pts[0], pts[1]);
          pinchStartZoom = _avatarCropState.zoom;
        } else if (activePointers.size === 1) {
          _avatarCropState.dragging = true;
          _avatarCropState.dragStartX = e.clientX;
          _avatarCropState.dragStartY = e.clientY;
          _avatarCropState.startOffsetX = _avatarCropState.offsetX;
          _avatarCropState.startOffsetY = _avatarCropState.offsetY;
          vp.style.cursor = 'grabbing';
        }
      });

      vp.addEventListener('pointermove', (e) => {
        if (!_avatarCropState || !activePointers.has(e.pointerId)) return;
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (activePointers.size >= 2) {
          // 雙指縮放
          const pts = Array.from(activePointers.values());
          const curDist = dist(pts[0], pts[1]);
          if (pinchStartDist > 0) {
            let newZoom = pinchStartZoom * (curDist / pinchStartDist);
            newZoom = Math.min(3, Math.max(1, newZoom));
            _avatarCropState.zoom = newZoom;
            const zoomSlider = document.getElementById('avatar-crop-zoom');
            if (zoomSlider) zoomSlider.value = Math.round(newZoom * 100);
            renderAvatarCropTransform();
          }
        } else if (_avatarCropState.dragging) {
          // 單指拖拉
          _avatarCropState.offsetX = _avatarCropState.startOffsetX + (e.clientX - _avatarCropState.dragStartX);
          _avatarCropState.offsetY = _avatarCropState.startOffsetY + (e.clientY - _avatarCropState.dragStartY);
          renderAvatarCropTransform();
        }
      });

      const endPointer = (e) => {
        if (!_avatarCropState) return;
        activePointers.delete(e.pointerId);

        if (activePointers.size === 1) {
          // 由雙指縮放返去剩返單指：重設拖拉起始點，避免影像跳位
          const remaining = Array.from(activePointers.entries())[0];
          const pid = remaining[0], pt = remaining[1];
          _avatarCropState.dragging = true;
          _avatarCropState.dragStartX = pt.x;
          _avatarCropState.dragStartY = pt.y;
          _avatarCropState.startOffsetX = _avatarCropState.offsetX;
          _avatarCropState.startOffsetY = _avatarCropState.offsetY;
          pinchStartDist = 0;
        } else if (activePointers.size === 0) {
          _avatarCropState.dragging = false;
          vp.style.cursor = 'grab';
          pinchStartDist = 0;
        }
      };
      vp.addEventListener('pointerup', endPointer);
      vp.addEventListener('pointercancel', endPointer);
      vp.addEventListener('pointerleave', endPointer);
    }

    window.onAvatarCropZoomChange = function(val) {
      if (!_avatarCropState) return;
      _avatarCropState.zoom = (parseInt(val, 10) || 100) / 100;
      renderAvatarCropTransform();
    };

    window.cancelAvatarCrop = function() {
      closeModal('modal-avatar-crop');
      if (_avatarCropState && _avatarCropState.objectUrl) URL.revokeObjectURL(_avatarCropState.objectUrl);
      _avatarCropState = null;
      const input = document.getElementById('prof-avatar-input');
      if (input) input.value = '';
    };

    window.confirmAvatarCrop = async function() {
      const s = _avatarCropState;
      if (!s) return;

      const outputSize = 240; // 統一輸出正方形頭像
      const canvas = document.createElement('canvas');
      canvas.width = outputSize;
      canvas.height = outputSize;
      const sx = -s._cx / s._displayScale;
      const sy = -s._cy / s._displayScale;
      const sSize = s.VP / s._displayScale;
      canvas.getContext('2d').drawImage(s.img, sx, sy, sSize, sSize, 0, 0, outputSize, outputSize);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

      closeModal('modal-avatar-crop');
      URL.revokeObjectURL(s.objectUrl);
      _avatarCropState = null;

      const preview = document.getElementById('prof-avatar-preview');
      if (preview) preview.innerText = '⏳';

      try {
        await window.callCloudFunction('uploadAvatar', { image: dataUrl });
        window.currentUser.avatarBase64 = dataUrl;
        renderUserAvatar();
        window.showToast('頭像已成功更新！', '🎉');
      } catch (err) {
        const code = err && (err.code || '');
        if (typeof code === 'string' && code.indexOf('resource-exhausted') !== -1) {
          window.showToast(err.message || '上傳次數過多，請稍後再試', '⏳');
        } else if (typeof code === 'string' && code.indexOf('invalid-argument') !== -1) {
          window.showToast(err.message || '相片不符合要求，請更換其他相片', '🚫');
        } else {
          window.showToast('上傳頭像失敗：' + (err.message || err), '❌');
        }
        renderUserAvatar();
      } finally {
        const input = document.getElementById('prof-avatar-input');
        if (input) input.value = '';
      }
    };

    // ===================== Instagram 式溫習相片 =====================
    // 每日限發佈一張溫習相片，一定要在視訊溫習室累積溫習滿 15 分鐘先解鎖
    // （見 room-video.js 嘅 awardStudyPoint 點樣更新 todayMinutes／todayDate）。
    // 「我的帳號」資料卡入面嘅發佈掣同相片牆、以及查看其他同學資料卡入面
    // 嘅相片牆同追蹤掣，共用返呢一組函數。

    // Firestore 儲存嘅 dateStr 係 YYYY-MM-DD，畫面顯示要求 DD/MM/YYYY
    // （例如 18/09/2026），呢個函數負責轉換。
    function formatPhotoDateLabel(dateStr) {
      const parts = String(dateStr || '').split('-');
      if (parts.length !== 3) return '';
      const [yyyy, mm, dd] = parts;
      return `${dd}/${mm}/${yyyy}`;
    }

    function photoTileHtml(photoUrl, dateStr) {
      const dateLabel = formatPhotoDateLabel(dateStr);
      const safeUrl = String(photoUrl || '').replace(/'/g, "%27");
      return `
        <div style="position:relative; aspect-ratio:1; border-radius:8px; overflow:hidden; background:#eee; cursor:zoom-in;" onclick="openLightbox('${safeUrl}')">
          <img src="${photoUrl}" loading="lazy" style="width:100%; height:100%; object-fit:cover;" alt="溫習相片">
          <span style="position:absolute; right:4px; bottom:4px; background:rgba(0,0,0,.55); color:#fff; font-size:10px; padding:1px 5px; border-radius:4px;">${dateLabel}</span>
        </div>`;
    }

    // 每個相片牆（自己／查看其他人）各自獨立記住分頁狀態：睇緊邊個
    // uid、揭到邊一份文件（cursorDoc，Firestore startAfter 用）、係咪
    // 已經去到最後一頁。
    const _photoPaging = {
      diary: { uid: null, cursorDoc: null, done: false, loading: false },
      pop: { uid: null, cursorDoc: null, done: false, loading: false }
    };

    // 讀取指定用戶嘅溫習相片，每頁 9 張（Firestore query：uid == 指定用戶
    // AND 按 createdAt 由新到舊），reset=true 即係重新由第一頁開始（撳開
    // 資料卡嗰陣），reset=false 即係撳「更多」揭下一頁。
    async function loadUserPhotos(context, uid, reset) {
      if (!window.db || !window.fs || !uid) return;
      const state = _photoPaging[context];
      if (!state) return;
      if (reset || state.uid !== uid) {
        state.uid = uid;
        state.cursorDoc = null;
        state.done = false;
      }
      if (state.done || state.loading) return;
      state.loading = true;

      const gridId = context === 'diary' ? 'diary-photo-grid' : 'pop-photo-grid';
      const moreBtnId = context === 'diary' ? 'diary-photo-more-btn' : 'pop-photo-more-btn';
      const emptyId = context === 'diary' ? 'diary-photo-empty' : 'pop-photo-empty';
      const grid = document.getElementById(gridId);
      const moreBtn = document.getElementById(moreBtnId);
      const emptyEl = document.getElementById(emptyId);

      if (reset && grid) grid.innerHTML = '';
      if (reset && emptyEl) emptyEl.style.display = 'none';
      if (moreBtn) moreBtn.style.display = 'none';

      try {
        const { collection, query, where, orderBy, limit, startAfter, getDocs } = window.fs;
        const clauses = [collection(window.db, 'studyPhotos'), where('uid', '==', uid), orderBy('createdAt', 'desc')];
        if (state.cursorDoc) clauses.push(startAfter(state.cursorDoc));
        clauses.push(limit(9));
        const snap = await getDocs(query(...clauses));

        if (reset && snap.empty && emptyEl) emptyEl.style.display = 'block';

        let html = '';
        snap.forEach(docSnap => {
          const p = docSnap.data();
          html += photoTileHtml(p.photoUrl, p.dateStr);
        });
        if (grid) grid.insertAdjacentHTML('beforeend', html);

        if (!snap.empty) state.cursorDoc = snap.docs[snap.docs.length - 1];
        state.done = snap.size < 9;
        if (moreBtn) moreBtn.style.display = state.done ? 'none' : 'block';
      } catch (e) {
        console.error('讀取溫習相片失敗:', e);
      } finally {
        state.loading = false;
      }
    }
    window.loadUserPhotos = loadUserPhotos;

    window.loadMorePhotos = function(context) {
      const state = _photoPaging[context];
      if (!state || !state.uid) return;
      loadUserPhotos(context, state.uid, false);
    };

    // 判斷自己而家可唔可以發佈今日溫習相片：要今日未發佈過，並且視訊
    // 溫習室今日累積溫習分鐘數（todayMinutes，配合 todayDate 判斷係咪
    // 真係「今日」）要滿 15 分鐘。呢個係前端提示用，真正嘅把關喺
    // postStudyPhoto 呢個 Cloud Function 度（伺服器用香港時區重新驗證）。
    const STUDY_PHOTO_MIN_MINUTES = 15;
    function getStudyPhotoGateState() {
      if (!window.currentUser) return { ok: false, reason: '請先登入會員' };
      const today = getTodayDateStr();
      if (window.currentUser.lastPhotoPostDate === today) {
        return { ok: false, reason: '今日已經發佈過一張溫習相片，請明天再發佈' };
      }
      const todayMinutes = (window.currentUser.todayDate === today) ? (window.currentUser.todayMinutes || 0) : 0;
      if (todayMinutes < STUDY_PHOTO_MIN_MINUTES) {
        return { ok: false, reason: `需要在視訊溫習室累積溫習滿 ${STUDY_PHOTO_MIN_MINUTES} 分鐘，先可以發佈當日溫習相片（現時：${todayMinutes} 分鐘）` };
      }
      return { ok: true };
    }
    window.getStudyPhotoGateState = getStudyPhotoGateState;

    // 更新發佈掣嘅視覺狀態（「我的帳號」資料卡同「溫習日記」分頁各自有
    // 一粒，兩粒都要同步更新）：未符合條件就顯示為灰咗（disable 嘅視覺
    // 效果），但依然可以撳——撳落去會彈出提示，解釋仲欠幾多分鐘先可以
    // 上傳（跟使用者嘅要求：「撳落去會顯示需要溫夠15分鐘先可以上傳當
    // 日溫習相片」）。
    function updatePhotoUploadButtonState() {
      const state = getStudyPhotoGateState();
      ['diary-photo-upload-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (!btn) return;
        if (state.ok) {
          btn.style.opacity = '1';
          btn.style.cursor = 'pointer';
          btn.innerText = '➕ 發佈今日溫習相片';
        } else {
          btn.style.opacity = '0.5';
          btn.style.cursor = 'not-allowed';
          btn.innerText = '🔒 發佈今日溫習相片';
        }
      });
    }
    window.updatePhotoUploadButtonState = updatePhotoUploadButtonState;

    window.handlePostPhotoButtonClick = function() {
      const state = getStudyPhotoGateState();
      if (!state.ok) {
        window.showToast(state.reason, '🔒');
        return;
      }
      const input = document.getElementById('diary-photo-input');
      if (input) input.click();
    };

    // 更新「我的帳號」資料卡（簡要數字）同「溫習日記」分頁（完整標頭）
    // 入面嘅相片數／粉絲數／追蹤中人數，並且順便靜靜地去 Firestore 攞返
    // 最新數字（呢幾個計數欄位淨係由 Cloud Function 更新，本機快取有機
    // 會落後於實際情況，例如喺另一部裝置有人啱啱追蹤咗自己）。
    async function updateMyAccountPhotoStats() {
      if (!window.currentUser) return;
      const setText = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
      const applyStats = () => {
        setText('myacc-photo-count', window.currentUser.photoCount || 0);
        setText('myacc-follower-count', window.currentUser.followerCount || 0);
        setText('myacc-following-count', window.currentUser.followingCount || 0);
        setText('diary-photo-count', window.currentUser.photoCount || 0);
        setText('diary-follower-count', window.currentUser.followerCount || 0);
        setText('diary-following-count', window.currentUser.followingCount || 0);
        setText('diary-username', window.currentUser.username || '同學');
        setText('home-stat-followers', window.currentUser.followerCount || 0);
        setText('home-stat-following', window.currentUser.followingCount || 0);
        updatePhotoUploadButtonState();
      };
      applyStats();

      if (!window.db || !window.fs || !window.currentUser.uid) return;
      try {
        const snap = await window.fs.getDoc(window.fs.doc(window.db, 'users', window.currentUser.uid));
        if (!snap.exists()) return;
        const u = snap.data();
        window.currentUser.photoCount = u.photoCount || 0;
        window.currentUser.followerCount = u.followerCount || 0;
        window.currentUser.followingCount = u.followingCount || 0;
        window.currentUser.todayMinutes = u.todayMinutes || 0;
        window.currentUser.todayDate = u.todayDate || '';
        window.currentUser.lastPhotoPostDate = u.lastPhotoPostDate || '';
        applyStats();
      } catch (e) {
        console.warn('刷新溫習相片統計失敗:', e);
      }
    }
    window.updateMyAccountPhotoStats = updateMyAccountPhotoStats;

    // 揀完相片之後：先喺瀏覽器度用 canvas 縮圖（最長邊唔超過 1024px）、
    // 壓縮做 JPEG，先傳個 base64 去 postStudyPhoto 呢個 Cloud Function——
    // 函數入面會重新驗證今日發佈次數／15 分鐘門檻，再用 Google Cloud
    // Vision 嘅 SafeSearch 檢測相片內容，通過先會真正寫入 Storage／
    // Firestore，所以呢度一定要等 callCloudFunction 嘅 Promise
    // resolve／reject 先知道結果。
    window.handleStudyPhotoFileSelected = async function(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      if (!window.currentUser) { window.showToast('請先登入會員', '⚠️'); return; }

      const btn = document.getElementById('diary-photo-upload-btn');
      if (btn) { btn.style.opacity = '0.6'; btn.style.cursor = 'wait'; btn.innerText = '⏳ 上傳中…'; }

      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const img = new Image();
          const objectUrl = URL.createObjectURL(file);
          img.onload = () => {
            const maxSide = 1024;
            let width = img.width;
            let height = img.height;
            if (width > maxSide || height > maxSide) {
              const scale = maxSide / Math.max(width, height);
              width = Math.round(width * scale);
              height = Math.round(height * scale);
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            URL.revokeObjectURL(objectUrl);
            resolve(canvas.toDataURL('image/jpeg', 0.82));
          };
          img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('圖片載入失敗，請更換其他相片')); };
          img.src = objectUrl;
        });

        const result = await window.callCloudFunction('postStudyPhoto', { image: dataUrl });
        const today = getTodayDateStr();
        window.currentUser.photoCount = (window.currentUser.photoCount || 0) + 1;
        window.currentUser.lastPhotoPostDate = today;

        const setText = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
        setText('myacc-photo-count', window.currentUser.photoCount);
        setText('diary-photo-count', window.currentUser.photoCount);

        const grid = document.getElementById('diary-photo-grid');
        if (grid) grid.insertAdjacentHTML('afterbegin', photoTileHtml(result.photoUrl, today));
        const emptyEl = document.getElementById('diary-photo-empty');
        if (emptyEl) emptyEl.style.display = 'none';

        window.showToast('溫習相片已成功發佈！', '📸');
      } catch (err) {
        const code = err && (err.code || '');
        if (typeof code === 'string' && code.indexOf('failed-precondition') !== -1) {
          window.showToast(err.message || '尚未符合發佈條件', '🔒');
        } else if (typeof code === 'string' && code.indexOf('resource-exhausted') !== -1) {
          window.showToast(err.message || '操作次數過多，請稍後再試', '⏳');
        } else if (typeof code === 'string' && code.indexOf('invalid-argument') !== -1) {
          window.showToast(err.message || '相片不符合要求，請更換其他相片', '🚫');
        } else {
          window.showToast('發佈失敗：' + (err.message || err), '❌');
        }
      } finally {
        event.target.value = '';
        if (btn) { btn.style.cursor = 'pointer'; }
        updatePhotoUploadButtonState();
      }
    };

    // ===================== Follow（追蹤書伴） =====================
    // 單向追蹤，同現有「夥伴與讀書會」嗰個雙向好友系統完全獨立。呢組
    // 函數兩個地方共用：查看朋友資料卡（wrapId='pop-follow-btn-wrap'）
    // 同「溫習日記」分頁顯示緊朋友嘅日記（wrapId='diary-follow-btn-wrap'），
    // 所以每個掣嘅 onclick 都要記住自己所屬嗰個 wrapId，等按完之後識得
    // 更新返啱嘅按鈕同啱嘅粉絲數字。
    function _followCountIdFor(wrapId) {
      return wrapId === 'diary-follow-btn-wrap' ? 'diary-follower-count' : 'pop-follower-count';
    }

    // 「追蹤書伴」呢個掣文字喺導師專頁（wrapId==='tutorview-follow-wrap'，
    // 見 tutor-panel.js openTutorProfileView() 嗰邊）要改做「追蹤導師」，
    // 學生同學生之間互相追蹤（日記／朋友資料卡）就維持返「追蹤書伴」呢
    // 個原本嘅講法——淨係靠 wrapId 分辨場景，唔使改呢組函數嘅簽名。
    function _followVerbFor(wrapId) {
      return wrapId === 'tutorview-follow-wrap' ? '導師' : '書伴';
    }

    async function renderFollowButton(targetUid, targetUserData, wrapId) {
      wrapId = wrapId || 'pop-follow-btn-wrap';
      const wrap = document.getElementById(wrapId);
      if (!wrap || !window.currentUser || !window.db || !window.fs) return;
      wrap.innerHTML = '';
      const verb = _followVerbFor(wrapId);
      try {
        const followId = `${window.currentUser.uid}_${targetUid}`;
        const snap = await window.fs.getDoc(window.fs.doc(window.db, 'follows', followId));
        if (snap.exists()) {
          wrap.innerHTML = `<button class="btn btn-outline" type="button" style="width:100%; justify-content:center; font-size:13px;" onclick="unfollowUserAction('${targetUid}', '${wrapId}')">✅ 已追蹤（點擊取消）</button>`;
        } else {
          wrap.innerHTML = `<button class="btn btn-primary" type="button" style="width:100%; justify-content:center; font-size:13px;" onclick="followUserAction('${targetUid}', '${wrapId}')">➕ 追蹤${verb}</button>`;
        }
      } catch (e) {
        console.error('讀取追蹤狀態失敗:', e);
      }
    }
    window.renderFollowButton = renderFollowButton;

    window.followUserAction = async function(targetUid, wrapId) {
      wrapId = wrapId || 'pop-follow-btn-wrap';
      if (!window.currentUser) { window.showToast('請先登入', '🔒'); return; }
      try {
        await window.callCloudFunction('followUser', { targetUid });
        const wrap = document.getElementById(wrapId);
        if (wrap) wrap.innerHTML = `<button class="btn btn-outline" type="button" style="width:100%; justify-content:center; font-size:13px;" onclick="unfollowUserAction('${targetUid}', '${wrapId}')">✅ 已追蹤（點擊取消）</button>`;
        const countEl = document.getElementById(_followCountIdFor(wrapId));
        if (countEl) countEl.innerText = (parseInt(countEl.innerText, 10) || 0) + 1;
        // 追蹤緊嘅係自己嘅「追蹤中」數，唔係對方嘅「粉絲」數——呢兩個
        // 欄位要分開處理，所以呢度額外更新返自己個「追蹤中」顯示
        window.currentUser.followingCount = (window.currentUser.followingCount || 0) + 1;
        ['home-stat-following', 'myacc-following-count', 'diary-following-count'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.innerText = window.currentUser.followingCount;
        });
        window.showToast('已追蹤這位書伴！', '🤝');
      } catch (e) {
        window.showToast('追蹤失敗：' + (e.message || e), '❌');
      }
    };

    window.unfollowUserAction = async function(targetUid, wrapId) {
      wrapId = wrapId || 'pop-follow-btn-wrap';
      if (!window.currentUser) return;
      try {
        await window.callCloudFunction('unfollowUser', { targetUid });
        const wrap = document.getElementById(wrapId);
        if (wrap) wrap.innerHTML = `<button class="btn btn-primary" type="button" style="width:100%; justify-content:center; font-size:13px;" onclick="followUserAction('${targetUid}', '${wrapId}')">➕ 追蹤${_followVerbFor(wrapId)}</button>`;
        const countEl = document.getElementById(_followCountIdFor(wrapId));
        if (countEl) countEl.innerText = Math.max(0, (parseInt(countEl.innerText, 10) || 0) - 1);
        window.currentUser.followingCount = Math.max(0, (window.currentUser.followingCount || 0) - 1);
        ['home-stat-following', 'myacc-following-count', 'diary-following-count'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.innerText = window.currentUser.followingCount;
        });
        window.showToast('已取消追蹤', 'ℹ️');
      } catch (e) {
        window.showToast('取消追蹤失敗：' + (e.message || e), '❌');
      }
    };

    // ===================== 「溫習日記」分頁：自己 vs 睇朋友 =====================
    // 由側邊欄「📔 溫習日記」入嚟就係睇自己（uid 唔傳／等於自己），由朋友
    // 資料卡度嗰粒「📔 查看溫習日記」入嚟就係睇緊嗰位朋友（傳咗佢個
    // uid）。兩種情況共用返呢個分頁嘅 HTML，淨係內容同顯示邊幾個區塊
    // 唔同（例如朋友嗰邊冇「發佈相片」掣，多咗「追蹤」掣同「返回我的
    // 溫習日記」連結）。
    let _diaryViewUid = null;
    // 而家「溫習日記」分頁顯示緊邊個嘅 uid：睇緊自己就傳返自己個 uid，
    // 睇緊朋友就傳返嗰位朋友嘅 uid。畀 diary-follower-count／
    // diary-following-count 嗰兩粒可撳嘅數字用（見 openFollowListModal()）。
    window.getCurrentDiaryUid = function() {
      return _diaryViewUid || (window.currentUser && window.currentUser.uid) || null;
    };

    async function openDiaryView(uid) {
      _diaryViewUid = (uid && window.currentUser && uid !== window.currentUser.uid) ? uid : null;

      const backWrap = document.getElementById('diary-back-to-self');
      const uploadSection = document.getElementById('diary-upload-section');
      const followWrap = document.getElementById('diary-follow-btn-wrap');
      const headingEl = document.getElementById('diary-photos-heading');

      if (!_diaryViewUid) {
        // 睇自己
        if (backWrap) backWrap.style.display = 'none';
        if (uploadSection) uploadSection.style.display = 'block';
        if (followWrap) { followWrap.style.display = 'none'; followWrap.innerHTML = ''; }
        if (headingEl) headingEl.innerText = '📔 我的溫習相片';
        if (!window.currentUser) return;
        if (typeof window.renderUserAvatar === 'function') window.renderUserAvatar();
        if (typeof window.updateMyAccountPhotoStats === 'function') window.updateMyAccountPhotoStats();
        if (typeof window.loadUserPhotos === 'function') window.loadUserPhotos('diary', window.currentUser.uid, true);
        return;
      }

      // 睇緊朋友嘅溫習日記
      if (backWrap) backWrap.style.display = 'block';
      if (uploadSection) uploadSection.style.display = 'none';
      if (followWrap) followWrap.style.display = 'block';
      if (headingEl) headingEl.innerText = '📔 溫習相片';

      const avatarEl = document.getElementById('diary-avatar');
      const usernameEl = document.getElementById('diary-username');
      if (avatarEl) avatarEl.innerText = '…';
      if (usernameEl) usernameEl.innerText = '載入中…';
      const gridEl = document.getElementById('diary-photo-grid');
      if (gridEl) gridEl.innerHTML = '';
      const emptyEl = document.getElementById('diary-photo-empty');
      if (emptyEl) emptyEl.style.display = 'none';
      const moreBtnEl = document.getElementById('diary-photo-more-btn');
      if (moreBtnEl) moreBtnEl.style.display = 'none';
      const setText = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
      setText('diary-photo-count', 0);
      setText('diary-follower-count', 0);
      setText('diary-following-count', 0);

      if (!window.db || !window.fs) return;
      try {
        const snap = await window.fs.getDoc(window.fs.doc(window.db, 'users', _diaryViewUid));
        if (!snap.exists()) {
          if (usernameEl) usernameEl.innerText = '找不到這位使用者';
          return;
        }
        const u = snap.data();
        if (usernameEl) usernameEl.innerText = u.username || '同學';
        if (avatarEl) {
          if (u.avatarBase64) {
            avatarEl.innerHTML = `<img src="${u.avatarBase64}" style="width:100%; height:100%; object-fit:cover; border-radius:50%; cursor:zoom-in;" alt="會員頭像" onclick="openLightbox('${u.avatarBase64}', true)">`;
          } else {
            avatarEl.innerText = (u.username || '同').charAt(0).toUpperCase();
          }
        }
        setText('diary-photo-count', u.photoCount || 0);
        setText('diary-follower-count', u.followerCount || 0);
        setText('diary-following-count', u.followingCount || 0);
        if (typeof window.renderFollowButton === 'function') await renderFollowButton(_diaryViewUid, u, 'diary-follow-btn-wrap');
        if (typeof window.loadUserPhotos === 'function') window.loadUserPhotos('diary', _diaryViewUid, true);
      } catch (e) {
        console.error('讀取溫習日記失敗:', e);
        if (usernameEl) usernameEl.innerText = '載入失敗';
      }
    }
    window.openDiaryView = openDiaryView;

    // ===================== 粉絲／追蹤中名單 =====================
    // 撳「溫習日記」（或「我的帳號」／朋友資料卡）入面嘅粉絲／追蹤中數字，
    // 彈出一個名單：每行顯示對方頭像（撳到放大）同用戶名（撳到彈出佢個
    // 人資料卡）。type 係 'followers'（邊個追蹤緊呢位用戶）或者
    // 'following'（呢位用戶追蹤緊邊個）。
    window.openFollowListModal = async function(uid, type) {
      if (!uid || !window.db || !window.fs) return;
      const titleEl = document.getElementById('follow-list-title');
      const listEl = document.getElementById('follow-list-container');
      if (titleEl) titleEl.innerText = type === 'following' ? '追蹤中名單' : '粉絲名單';
      if (listEl) listEl.innerHTML = '<p style="text-align:center; color:#999; font-size:13px; padding:20px;">🔄 載入中...</p>';
      openModal('modal-follow-list');

      try {
        const { collection, query, where, getDocs } = window.fs;
        const field = type === 'following' ? 'followerUid' : 'followedUid';
        const snap = await getDocs(query(collection(window.db, 'follows'), where(field, '==', uid)));

        if (snap.empty) {
          if (listEl) listEl.innerHTML = `<p style="text-align:center; color:#999; font-size:13px; padding:20px;">${type === 'following' ? '未有追蹤緊任何書伴' : '仲未有粉絲'}</p>`;
          return;
        }

        const counterpartField = type === 'following' ? 'followedUid' : 'followerUid';
        const counterpartUids = snap.docs.map(d => d.data()[counterpartField]).filter(Boolean);

        const userSnaps = await Promise.all(
          counterpartUids.map(cuid => window.fs.getDoc(window.fs.doc(window.db, 'users', cuid)))
        );

        let html = '';
        userSnaps.forEach((uSnap, i) => {
          if (!uSnap.exists()) return;
          const u = uSnap.data();
          const cuid = counterpartUids[i];
          const name = u.username || '同學';
          const avatarInner = u.avatarBase64
            ? `<img src="${u.avatarBase64}" style="width:100%; height:100%; object-fit:cover; border-radius:50%; cursor:zoom-in;" alt="會員頭像" onclick="event.stopPropagation(); openLightbox('${u.avatarBase64}', true)">`
            : `${(name || '同').charAt(0).toUpperCase()}`;
          html += `
            <div style="display:flex; align-items:center; gap:10px; padding:6px 4px;">
              <div class="avatar-circle" style="width:40px; height:40px; font-size:16px; background:var(--brand-500); border-color:var(--brand-200); flex-shrink:0;">${avatarInner}</div>
              <span style="font-size:14px; font-weight:bold; color:var(--brand-800); cursor:pointer;" onclick="closeModal('modal-follow-list'); viewUserProfile('${cuid}');">${escapeHtml(name)}</span>
            </div>`;
        });
        if (listEl) listEl.innerHTML = html || `<p style="text-align:center; color:#999; font-size:13px; padding:20px;">找不到相關用戶資料</p>`;
      } catch (e) {
        console.error('讀取名單失敗:', e);
        if (listEl) listEl.innerHTML = '<p style="text-align:center; color:#D9764A; font-size:13px; padding:20px;">讀取名單失敗，請稍後再試</p>';
      }
    };

    // ===================== 水獺寵物系統 =====================
    // 「肚餓／餵食」個 Tamagotchi 機制已經應用戶要求整個移除（唔再有
    // 飽足度、唔再有餵食按鈕），主頁「我的水獺」呢張卡而家淨係顯示靜態
    // 造型 + 一組同「溫習成就」有關嘅實用數據（等級／升級所需 EXP／
    // 累積時數／連續溫習天數／貼紙圖鑑完成度），由 updateOtterStatsCard()
    // 統一更新。

    // 水獺造型（進化）：跟返「等級系統」嗰邊嘅段位設定，每個段位可以喺
    // Admin後台「🎮 等級系統」分頁上傳專屬相片，用家等級去到邊個段位就
    // 顯示邊張相；冇上傳就顯示簡單嘅 🦦 佔位圖示。
    function updateOtterDisplay() {
      if (!window.currentUser) return;
      const levelInfo = calcLevelInfo(window.currentUser.exp || 0);
      const rankTier = getRankTitle(levelInfo.level);

      const photoImg = document.getElementById('otter-photo-img');
      const svgEl = document.getElementById('otter-pet-svg');
      const blankEl = document.getElementById('otter-blank-placeholder');

      // 用家如果由已收集嘅貼紙揀咗一隻做頭像，優先顯示嗰隻貼紙（要
      // 揀嗰隻依然喺收藏入面先算數，避免管理員刪走某隻貼紙之後仲顯
      // 示緊已經唔存在嘅嘢）；冇揀就跟返原本「段位自訂相／預設插畫」
      // 嘅邏輯。
      const avatarId = window.currentUser.otterAvatarStickerId;
      let avatarSticker = null;
      if (avatarId && typeof GACHA_STICKERS !== 'undefined') {
        const owned = window.currentUser.ownedStickers || {};
        if ((owned[avatarId] || 0) > 0) {
          avatarSticker = GACHA_STICKERS.find(s => s.id === avatarId) || null;
        }
      }

      if (avatarSticker) {
        if (avatarSticker.photo) {
          if (photoImg) { photoImg.src = avatarSticker.photo; photoImg.style.display = 'block'; }
          if (blankEl) blankEl.style.display = 'none';
        } else {
          if (photoImg) photoImg.style.display = 'none';
          if (blankEl) { blankEl.innerText = avatarSticker.emoji || '🦦'; blankEl.style.display = 'flex'; }
        }
        if (svgEl) svgEl.style.display = 'none';
        return;
      }

      const customPhoto = rankTier && rankTier.photo;
      if (customPhoto) {
        if (photoImg) { photoImg.src = customPhoto; photoImg.style.display = 'block'; }
        if (svgEl) svgEl.style.display = 'none';
        if (blankEl) blankEl.style.display = 'none';
      } else {
        if (photoImg) photoImg.style.display = 'none';
        if (svgEl) svgEl.style.display = 'none';
        if (blankEl) { blankEl.innerText = '🦦'; blankEl.style.display = 'flex'; }
      }
    }
    window.updateOtterDisplay = updateOtterDisplay;

    // 主頁「我的水獺」卡下面嗰組數據：等級／升級所需 EXP／累積溫習時數／
    // 連續溫習天數／貼紙圖鑑完成度。溫習連續天數直接讀返 Hero 列已經計
    // 好嘅 #home-stat-streak（同一個數字，唔使計多次）；貼紙圖鑑完成度
    // 讀返扭蛋機嗰邊嘅 GACHA_STICKERS／getOwnedStickerTypeCount()。
    function updateOtterStatsCard() {
      if (!window.currentUser) return;
      const info = calcLevelInfo(window.currentUser.exp || 0);
      const rank = getRankTitle(info.level);
      const setText = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

      setText('otter-stat-level', `${rank.emoji || '🌱'} Lv.${info.level}`);
      setText('otter-stat-exp-remaining', `${info.expIntoLevel}/${info.expNeededForNext}`);
      setText('otter-stat-hours', `${(parseFloat(window.currentUser.hours) || 0).toFixed(1)}h`);

      const streakEl = document.getElementById('home-stat-streak');
      setText('otter-stat-streak', streakEl ? streakEl.innerText : '0');

      if (typeof GACHA_STICKERS !== 'undefined' && typeof getOwnedStickerTypeCount === 'function') {
        setText('otter-stat-stickers', `${getOwnedStickerTypeCount()}/${GACHA_STICKERS.length}`);
      }
    }
    window.updateOtterStatsCard = updateOtterStatsCard;

    // ===================== 改名粗口過濾（廣東話／繁體／簡體中文／英文）=====================
    // ⚠️ 呢個名單淨係做「盡力以赴」嘅基本把關，唔係、亦都做唔到 100%
    // 完美嘅粗口過濾——中文粗口有好多同音字／諧音／拆字寫法（例如用
    // 「9」代「柒」、加空格拆開兩個字），英文亦都有大把 leetspeak
    // 變體，單靠前端一個關鍵字名單天生就攔唔晒。想加強嘅話：(1) 呢度
    // 加多啲關鍵字；(2) 長遠可以將改名都改成經 Cloud Function 先落庫，
    // 用返伺服器端更完整嘅過濾服務／API 把關（同之前傾過嘅「畀分要用
    // Cloud Function 驗證」係同一個方向）。而家呢個做法對一般學生用戶
    // 已經夠用——擋到最常見、隨手打嘅粗口，唔係要防範蓄意繞過嘅人。
    const OTTER_NAME_BLOCKLIST = [
      // 廣東話粗口／侮辱字眼
      '屌你', '屌您', '你老母', '你老味', '戇鳩', '戇居', '柒頭', '柒皇', '死柒', 'on9', 'on 9',
      '冚家鏟', '冚家剷', '冚家富貴', '死全家', '賤人', '婊子', '仆街', '扑街', '契弟', '咸濕', '鹹濕',
      '死人妖', '弱智', '智障', '低能', '雜種', '死開', '仆你個街',
      // 繁體中文（同廣東話部分重疊）
      '幹你娘', '幹您娘', '靠北', '靠杯', '三小', '白癡', '廢物', '去死',
      // 簡體中文
      '操你妈', '草泥马', '傻逼', '煞笔', '傻屄', '你妈的', '妈的', '尼玛', '滚蛋', '混蛋',
      '王八蛋', '婊子', '贱人', '死妈', '脑残', '你妹',
      // 英文（同常見 leetspeak 變體，見下面 normalizeForBadWordCheck 會先做字元代換）
      'fuck', 'fuk', 'fck', 'shit', 'bitch', 'asshole', 'dick', 'cock', 'pussy', 'cunt',
      'whore', 'slut', 'bastard', 'nigger', 'nigga', 'retard', 'faggot', 'motherfucker'
    ];

    // 將字串標準化，等關鍵字比對可以捉到常見嘅「加空格/符號拆字」同
    // 英文 leetspeak（用數字扮字母）呢兩種最常見嘅簡單繞過手法。
    function normalizeForBadWordCheck(str) {
      return String(str || '')
        .toLowerCase()
        .replace(/[\s.\-_*!@#$%^&()+=~`'"，。！？、\[\]{}|\\/<>～]/g, '')
        .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e')
        .replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't');
    }

    function containsBadWord(name) {
      const normalized = normalizeForBadWordCheck(name);
      if (!normalized) return false;
      return OTTER_NAME_BLOCKLIST.some(w => normalized.includes(normalizeForBadWordCheck(w)));
    }
    window.containsBadWord = containsBadWord;

    // 幫水獺改名：長度上限 + 基本粗口關鍵字名單雙重把關（廣東話／繁體／
    // 簡體中文／英文），唔通過就唔會寫落 Firestore。
    const OTTER_NAME_MAX_LEN = 12;

    window.openOtterRenameModal = function() {
      if (!window.currentUser) { window.showToast('請先登入', '🔒'); return; }
      const input = document.getElementById('otter-rename-input');
      if (input) input.value = window.currentUser.otterName || 'Ottiee';
      const err = document.getElementById('otter-rename-error');
      if (err) err.style.display = 'none';
      _otterAvatarPick = window.currentUser.otterAvatarStickerId || 0;
      renderOtterAvatarPicker();
      openModal('modal-otter-rename');
    };

    // 「自訂我的水獺」視窗入面嘅頭像揀選格：得已經收集咗（擁有數量 >0）
    // 嘅貼紙先會出現，加多一格「🦦 預設水獺」可以揀返原本嘅插畫／段位
    // 自訂相。淨係喺呢個視窗入面暫存揀咗邊隻（window._otterAvatarPick），
    // 撳「儲存」先會連同改名一齊寫落 Firestore，撳「取消」就唔會生效。
    let _otterAvatarPick = 0;

    function renderOtterAvatarPicker() {
      const grid = document.getElementById('otter-avatar-picker-grid');
      if (!grid || !window.currentUser) return;

      const owned = window.currentUser.ownedStickers || {};
      const ownedIds = Object.keys(owned)
        .map(k => parseInt(k))
        .filter(id => (owned[id] || 0) > 0)
        .sort((a, b) => a - b);

      const tileHtml = (id, thumb, label, selected) => `
        <div onclick="selectOtterAvatar(${id})" title="${escapeHtml(label)}" style="cursor:pointer; text-align:center; border-radius:8px; padding:4px; border:2px solid ${selected ? 'var(--brand-500)' : 'transparent'}; background:${selected ? 'var(--brand-50)' : '#F5F5F5'};">
          ${thumb}
        </div>`;

      let html = tileHtml(0, `<div style="font-size:22px;">🦦</div>`, '預設水獺', _otterAvatarPick === 0);

      if (typeof GACHA_STICKERS !== 'undefined') {
        ownedIds.forEach(id => {
          const st = GACHA_STICKERS.find(s => s.id === id);
          if (!st) return;
          const thumb = st.photo
            ? `<img src="${st.photo}" style="width:100%; aspect-ratio:1; object-fit:cover; border-radius:6px;">`
            : `<div style="font-size:22px;">${escapeHtml(st.emoji || '🦦')}</div>`;
          html += tileHtml(id, thumb, st.name || '', _otterAvatarPick === id);
        });
      }

      grid.innerHTML = html;
    }
    window.renderOtterAvatarPicker = renderOtterAvatarPicker;

    window.selectOtterAvatar = function(id) {
      _otterAvatarPick = id;
      renderOtterAvatarPicker();
    };

    window.saveOtterRename = async function() {
      const input = document.getElementById('otter-rename-input');
      const errEl = document.getElementById('otter-rename-error');
      if (!input) return;
      const raw = input.value.trim();
      if (errEl) errEl.style.display = 'none';

      if (!raw) {
        if (errEl) { errEl.innerText = '名稱不可以是空白'; errEl.style.display = 'block'; }
        return;
      }
      if (raw.length > OTTER_NAME_MAX_LEN) {
        if (errEl) { errEl.innerText = `名稱最多 ${OTTER_NAME_MAX_LEN} 個字`; errEl.style.display = 'block'; }
        return;
      }
      if (containsBadWord(raw)) {
        if (errEl) { errEl.innerText = '這個名稱可能包含不當字眼，請換一個名稱再試～'; errEl.style.display = 'block'; }
        return;
      }
      if (!window.currentUser || !window.db || !window.fs) return;
      try {
        await window.fs.updateDoc(window.fs.doc(window.db, 'users', window.currentUser.uid), {
          otterName: raw,
          otterAvatarStickerId: _otterAvatarPick || 0
        });
        window.currentUser.otterName = raw;
        window.currentUser.otterAvatarStickerId = _otterAvatarPick || 0;
        updateOtterNameDisplay();
        updateOtterDisplay();
        closeModal('modal-otter-rename');
        window.showToast('儲存成功！', '🦦');
      } catch (e) {
        if (errEl) { errEl.innerText = '儲存失敗，請再試：' + (e.message || e); errEl.style.display = 'block'; }
      }
    };

    function updateOtterNameDisplay() {
      const el = document.getElementById('otter-name-display');
      if (el) el.innerText = (window.currentUser && window.currentUser.otterName) || 'Ottiee';
    }
    window.updateOtterNameDisplay = updateOtterNameDisplay;

    // 同一個節奏順便檢查「今日目標」跨咗午夜冇：就算個分頁開住成晚冇賺任何
    // 分（例如冇入房），一到第二日都會自動歸零，唔使等用家做嘢先觸發
    setInterval(() => { if (window.currentUser) ensureTodayMinutes().then(updateGoalBarDisplay); }, 5 * 60 * 1000);

    // ===================== 「今日目標」每日歸零計時 =====================
    // 用返使用者本機時區判斷「今日」係邊一日（唔用 UTC，避免香港用戶凌晨用
    // 嗰陣因為 UTC 日期未轉而錯誤歸零／唔歸零）。todayMinutes／todayDate 呢
    // 兩個 Firestore 欄位獨立於「終身累積」嘅 hours，專門用嚟畀主頁「今日目標」
    // 進度條計算，日期一改就自動歸零。
    function getTodayDateStr() {
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }

    // 「本月排行榜」用嘅月份字串（例如 "2026-09"），用返使用者本機時區
    // 判斷「而家係邊個月」，同 getTodayDateStr() 嗰個「今日」歸零邏輯做
    // 法一致。呢個字串會傳去 awardStudyPoint()，等 Cloud Function 記低
    // monthlyHours／monthlyPeriod，一到新一個月就自動歸零重新競賽。
    function getCurrentMonthStr() {
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return `${yyyy}-${mm}`;
    }

    // 如果 Firestore 度記錄嘅 todayDate 唔係今日，代表隔咗一日（或者用戶第一次
    // 用），將 todayMinutes 歸零並更新 todayDate。淨係喺日期真係唔同先寫入
    // Firestore，避免每次都多一次寫入。
    async function ensureTodayMinutes() {
      if (!window.currentUser) return;
      const today = getTodayDateStr();
      if (window.currentUser.todayDate === today) return;
      window.currentUser.todayMinutes = 0;
      window.currentUser.todayDate = today;
      if (!window.db || !window.fs || !window.currentUser.uid) return;
      try {
        await window.fs.updateDoc(window.fs.doc(window.db, 'users', window.currentUser.uid), {
          todayMinutes: 0,
          todayDate: today
        });
      } catch (e) {
        console.warn('重置「今日目標」失敗（唔影響使用）:', e);
      }
    }

    // ===================== 溫習日曆／連續溫習日數 =====================
    // 記錄邏輯好簡單：淨係「有冇入過視訊溫習室」，唔理入咗幾多分鐘，
    // 一日入一次都算嗰日有溫習，同「今日目標」（要計滿 60 分鐘先叫完成）
    // 完全獨立、互不影響。資料存喺 users/{uid}.studyDays，係一個
    // { "2026-08-20": true, ... } 咁嘅 map，用日期字串做 key，方便
    // updateDoc 用 dot-path 寫入單一日期，唔使成份文件重寫。

    // 呢個 uid_年-月 前綴，等 window.currentUser.studyDays 冇資料嗰陣（例如
    // 舊帳號未有呢個欄位）都唔會拋錯，統一 fallback 做空物件
    function getStudyDaysMap() {
      return (window.currentUser && window.currentUser.studyDays) || {};
    }

    // 由今日開始向前數連續有溫習嘅日子。如果今日仲未溫習過，就由「琴日」
    // 開始數（今日仲未過完，唔應該一開波就見自己個連續天歸零，捱到夜晚
    // 先溫都仲計）；如果連琴日都冇，先至真係斷咗，顯示 0。
    function computeStudyStreak(studyDays) {
      studyDays = studyDays || getStudyDaysMap();
      let streak = 0;
      let cursor = new Date();
      if (!studyDays[getTodayDateStr()]) {
        cursor.setDate(cursor.getDate() - 1);
      }
      while (true) {
        const key = cursor.getFullYear() + '-' + String(cursor.getMonth() + 1).padStart(2, '0') + '-' + String(cursor.getDate()).padStart(2, '0');
        if (!studyDays[key]) break;
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      }
      return streak;
    }
    window.computeStudyStreak = computeStudyStreak;

    window.updateStreakBadge = function() {
      const el = document.getElementById('home-stat-streak');
      if (!el || !window.currentUser) return;
      el.innerText = computeStudyStreak();
    };

    // 用家一成功入到視訊溫習室（唔理房主定參加者、唔理留幾耐）就算今日
    // 有溫習，喺 enterRoomSetup() 入面 call。今日已經記錄過就乜都唔做，
    // 唔會重複寫 Firestore。
    window.recordStudyDayIfNeeded = async function() {
      if (!window.currentUser || !window.db || !window.fs) return;
      const todayKey = getTodayDateStr();
      if (getStudyDaysMap()[todayKey]) return;
      try {
        await window.fs.updateDoc(window.fs.doc(window.db, 'users', window.currentUser.uid), {
          ['studyDays.' + todayKey]: true
        });
        if (!window.currentUser.studyDays) window.currentUser.studyDays = {};
        window.currentUser.studyDays[todayKey] = true;
        if (typeof window.renderStudyCalendar === 'function') window.renderStudyCalendar();
        window.updateStreakBadge();
      } catch (e) {
        console.error('記錄溫習日曆失敗:', e);
      }
    };

    // 月曆目前顯示緊邊一個月：一開始未設定（null）就代表用返「今個月」，
    // 撳「‹」「›」切月先會偏離返
    let studyCalendarViewYear = null;
    let studyCalendarViewMonth = null;

    window.shiftStudyCalendarMonth = function(delta) {
      const now = new Date();
      if (studyCalendarViewYear == null) { studyCalendarViewYear = now.getFullYear(); studyCalendarViewMonth = now.getMonth(); }
      studyCalendarViewMonth += delta;
      if (studyCalendarViewMonth < 0) { studyCalendarViewMonth = 11; studyCalendarViewYear--; }
      else if (studyCalendarViewMonth > 11) { studyCalendarViewMonth = 0; studyCalendarViewYear++; }
      renderStudyCalendar();
    };

    function renderStudyCalendar() {
      const grid = document.getElementById('study-calendar-grid');
      const monthLabel = document.getElementById('study-calendar-month-label');
      const streakEl = document.getElementById('study-calendar-streak');
      const totalEl = document.getElementById('study-calendar-total');
      if (!grid || !window.currentUser) return;
      const studyDays = getStudyDaysMap();

      const now = new Date();
      if (studyCalendarViewYear == null) { studyCalendarViewYear = now.getFullYear(); studyCalendarViewMonth = now.getMonth(); }
      const year = studyCalendarViewYear, month = studyCalendarViewMonth;
      // widget 好窄，用返精簡格式（例如 "26/8"）就夠，唔使成串「2026 年 8 月」
      if (monthLabel) monthLabel.innerText = `${String(year).slice(2)}/${month + 1}`;

      const firstDay = new Date(year, month, 1);
      const startWeekday = firstDay.getDay(); // 0=星期日
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const todayKey = getTodayDateStr();

      let html = ['日', '一', '二', '三', '四', '五', '六'].map(d => `<div class="study-calendar-dow">${d}</div>`).join('');
      for (let i = 0; i < startWeekday; i++) html += `<div class="study-calendar-day empty"></div>`;
      for (let day = 1; day <= daysInMonth; day++) {
        const key = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
        const studied = !!studyDays[key];
        const isToday = key === todayKey;
        const isFuture = key > todayKey;
        let cls = 'study-calendar-day';
        if (studied) cls += ' studied';
        if (isToday) cls += ' today';
        if (isFuture) cls += ' future';
        html += `<div class="${cls}" title="${key}${studied ? '（有溫習）' : ''}">${day}</div>`;
      }
      grid.innerHTML = html;

      if (streakEl) streakEl.innerText = computeStudyStreak(studyDays);
      if (totalEl) totalEl.innerText = Object.keys(studyDays).length;
    }
    window.renderStudyCalendar = renderStudyCalendar;

    // 根據目前 window.currentUser 嘅 todayMinutes／todayDate 重新畫「今日目標」
    // 進度條。如果 todayDate 唔係今日（例如個分頁開咗過夜冇重新整理），顯示
    // 上就當 0 分鐘，實際 Firestore 歸零就交返 ensureTodayMinutes() 喺背景處理。
    function updateGoalBarDisplay() {
      if (!window.currentUser) return;
      const today = getTodayDateStr();
      const minsToday = (window.currentUser.todayDate === today) ? (window.currentUser.todayMinutes || 0) : 0;
      const pct = Math.min(100, (minsToday / 60) * 100).toFixed(1);
      const doneSuffix = minsToday >= 60 ? '（已完成）' : '';
      const goalBar = document.getElementById('home-goal-bar');
      const goalLabel = document.getElementById('home-goal-label');
      if (goalBar) goalBar.style.width = pct + '%';
      if (goalLabel) goalLabel.innerText = `${Math.round(minsToday)} / 60 分鐘${doneSuffix}`;

      // 全站置頂嗰條「今日目標」進度列（同主頁嗰條數值一樣，淨係擺位唔同）
      const globalGoalBar = document.getElementById('global-goal-bar');
      const globalGoalLabel = document.getElementById('global-goal-label');
      if (globalGoalBar) globalGoalBar.style.width = pct + '%';
      if (globalGoalLabel) globalGoalLabel.innerText = `${Math.round(minsToday)} / 60 分鐘${doneSuffix}`;
    }

    function updateUserAuthUI() {
      // 一判斷完登入狀態，即刻收埋初始載入畫面，換做啱嘅版面（landing
      // page／app-shell）顯示出嚟——唔理落邊個分支都要收，所以擺喺
      // 呢個function最開頭，一 call 到就即刻做
      const initialLoadingScreen = document.getElementById('initial-loading-screen');
      if (initialLoadingScreen) initialLoadingScreen.style.display = 'none';

      const unauthScreen = document.getElementById('unauth-screen');
      const authContent = document.getElementById('authenticated-app-content');
      const verifyScreen = document.getElementById('verify-email-screen');
      const headerAuthBtn = document.getElementById('header-auth-btn');
      const headerStats = document.getElementById('header-user-stats');
      const landingPage = document.getElementById('landing-page');
      const appShell = document.getElementById('app-shell');
      if (verifyScreen) verifyScreen.style.display = 'none';

      // 電郵驗證未完成，就完全鎖死，除咗「重新發送」「重新整理」「登出」
      // 之外咩都用唔到——一定要撳咗驗證連結先算數，唔係嘅話個驗證形同虛設。
      // 淨係限制「有填咗聯絡電郵、但未撳連結」嗰批帳號：
      //   1. 冇填過聯絡電郵嘅舊帳號（呢個功能推出之前註冊嗰批）唔受影響，
      //      唔係嘅話會即刻鎖死晒所有現有帳號
      //   2. 管理員帳號（ADMIN_LOGIN_IDS）豁免，唔係嘅話萬一 admin 自己個
      //      聯絡電郵一時三刻未驗證到，會鎖到自己都入唔到管理後台
      const needsEmailVerification = !!(
        window.currentUser &&
        window.currentUser.contactEmail &&
        !window.currentUser.emailVerified &&
        !(typeof window.isCurrentUserAdmin === 'function' && window.isCurrentUserAdmin())
      );

      if (window.currentUser && needsEmailVerification) {
        closeModal('modal-login');
        closeModal('modal-register');

        if (landingPage) landingPage.style.display = 'none';
        if (appShell) appShell.style.display = '';

        unauthScreen.style.display = 'none';
        authContent.style.display = 'none';
        if (verifyScreen) {
          verifyScreen.style.display = 'block';
          const emailSpan = document.getElementById('verify-gate-email');
          if (emailSpan) emailSpan.innerText = window.currentUser.contactEmail || '';
        }
        headerStats.style.display = 'none';
        const globalStatusBarGated = document.getElementById('global-status-bar');
        if (globalStatusBarGated) globalStatusBarGated.style.display = 'none';
        const chatDockToggleGated = document.getElementById('chat-dock-toggle');
        if (chatDockToggleGated) chatDockToggleGated.style.display = 'none';

        headerAuthBtn.className = "btn btn-outline";
        headerAuthBtn.style.borderRadius = "20px";
        headerAuthBtn.style.padding = "4px 10px";
        headerAuthBtn.style.fontSize = "11px";
        headerAuthBtn.innerHTML = `⏳ 待驗證電郵`;

        // 導師帳戶就算仲未驗證電郵，左邊側邊欄都要即刻顯示返導師專用
        // 版本（唔係學生版），唔可以淨係喺下面「已驗證」嗰個分支先
        // call，唔係嘅話會喺呢個等待畫面見到學生專用嘅選單。
        if (typeof window.applyRoleBasedSidebar === 'function') window.applyRoleBasedSidebar();
        return;
      }

      if (window.currentUser) {
        closeModal('modal-login');
        closeModal('modal-register');

        if (landingPage) landingPage.style.display = 'none';
        if (appShell) appShell.style.display = '';

        unauthScreen.style.display = 'none';
        authContent.style.display = 'block';
        headerStats.style.display = 'flex';
        const globalStatusBar = document.getElementById('global-status-bar');
        if (globalStatusBar) globalStatusBar.style.display = 'block';
        const chatDockToggle = document.getElementById('chat-dock-toggle');
        if (chatDockToggle) {
          chatDockToggle.style.display = 'flex';
          // 掣啱啱先由 display:none 變返可見，之前（登入之前）攞唔到佢
          // 真實嘅闊高，所以呢度要重新套用一次拖過／記低咗嘅位置
          if (typeof applyChatDockTogglePos === 'function') applyChatDockTogglePos(chatDockToggle);
        }
        if (typeof window.startPresenceHeartbeat === 'function') window.startPresenceHeartbeat();
        if (typeof window.startChatDockListener === 'function') window.startChatDockListener();
        // 一登入／refresh 完成，額外主動去伺服器攞多一次最新對話清單（唔淨係
        // 靠上面嗰個 onSnapshot listener），保證未讀紅點同 dock panel 一開始
        // 就係啱嘅，唔使等用家自己撳開個掣先識更新
        if (typeof window.forceRefreshChatDock === 'function') window.forceRefreshChatDock();

        headerAuthBtn.className = "btn btn-outline";
        headerAuthBtn.style.borderRadius = "20px";
        headerAuthBtn.style.padding = "4px 10px";
        headerAuthBtn.style.fontSize = "11px";
        headerAuthBtn.innerHTML = `<span>${window.currentUser.username || window.currentUser.email}</span> <span style="color:#4A8FA0; font-weight:bold;">✓</span>`;

        document.getElementById('room-user-name-tag').innerText = (window.currentUser.username || '使用者') + " (你)";
        document.getElementById('room-self-avatar').innerText = (window.currentUser.username || 'U').charAt(0).toUpperCase();
        document.getElementById('stat-hours').innerText = (parseFloat(window.currentUser.hours) || 0).toFixed(1);
        document.getElementById('stat-points').innerText = window.currentUser.points ?? 0;
        syncGachaPtsDisplay();
        updateLevelDisplay();
        updateOtterDisplay();
        updateOtterNameDisplay();

        // 主頁歡迎卡片
        const displayName = window.currentUser.username || window.currentUser.email?.split('@')[0] || '同學';
        const homeUser = document.getElementById('home-username');
        const homeHours = document.getElementById('home-stat-hours');
        const homePts = document.getElementById('home-stat-pts');
        const homeFollowers = document.getElementById('home-stat-followers');
        const homeFollowing = document.getElementById('home-stat-following');
        if (homeUser) homeUser.innerText = displayName;
        if (homeHours) homeHours.innerText = formatHoursMinutes(window.currentUser.hours);
        if (homePts) homePts.innerText = window.currentUser.points ?? 0;
        if (homeFollowers) homeFollowers.innerText = window.currentUser.followerCount || 0;
        if (homeFollowing) homeFollowing.innerText = window.currentUser.followingCount || 0;
        if (typeof window.renderUserAvatar === 'function') window.renderUserAvatar();

        // 溫習日曆／連續溫習日數：淨係靠「有冇入過視訊溫習室」呢個記錄
        // 計，同「本日時數」（分鐘數）完全獨立
        if (typeof window.renderStudyCalendar === 'function') window.renderStudyCalendar();
        if (typeof window.updateStreakBadge === 'function') window.updateStreakBadge();
        // updateOtterStatsCard() 之前跟住 updateLevelDisplay() 已經 call 過一次，
        // 但嗰陣「連續天數」仲未計好（下面呢句 updateStreakBadge() 先計），
        // 所以呢度要再刷新多一次，等「我的水獺」卡嗰個連續天數啱返
        if (typeof updateOtterStatsCard === 'function') updateOtterStatsCard();

        // 動態徽章：積分夠扭蛋就提示
        const pts = window.currentUser.points ?? 0;
        const gachaBadge = document.getElementById('home-gacha-badge');
        if (gachaBadge) gachaBadge.style.display = pts >= 30 ? 'inline-block' : 'none';

        // 今日目標進度條：獨立於「終身累積」嘅 hours，用 todayMinutes／todayDate
        // 計算，日期一改就自動歸零（見 ensureTodayMinutes / updateGoalBarDisplay）
        ensureTodayMinutes().then(updateGoalBarDisplay);
        updateGoalBarDisplay();

        document.getElementById('prof-username').value = window.currentUser.username || '';
        document.getElementById('prof-email').value = window.currentUser.email || '';
        document.getElementById('prof-school').value = window.currentUser.school || '';
        document.getElementById('prof-grade').value = window.currentUser.grade || '中六 (S6 DSE)';
        document.getElementById('prof-fav').value = window.currentUser.favSubjects || '';
        document.getElementById('prof-dislike').value = window.currentUser.dislikeSubjects || '';
        if (typeof window.updateProfileEmailVerifyUI === 'function') window.updateProfileEmailVerifyUI();
        if (typeof window.renderUserAvatar === 'function') window.renderUserAvatar();

        // 導師帳戶（role==='tutor'）嘅側邊欄同學生／Admin 完全唔同，淨係
        // 得返「主頁」＋「管理教材」——呢個 function 定義喺
        // tutor-panel.js，負責隱藏晒其他學生專屬分頁、顯示返「管理教材」。
        if (typeof window.applyRoleBasedSidebar === 'function') window.applyRoleBasedSidebar();

        switchTab('home');
      } else {
        if (appShell) appShell.style.display = 'none';
        if (landingPage) landingPage.style.display = 'block';

        unauthScreen.style.display = 'block';
        authContent.style.display = 'none';
        headerStats.style.display = 'none';
        const globalStatusBarHidden = document.getElementById('global-status-bar');
        if (globalStatusBarHidden) globalStatusBarHidden.style.display = 'none';
        const chatDockToggleHidden = document.getElementById('chat-dock-toggle');
        if (chatDockToggleHidden) chatDockToggleHidden.style.display = 'none';
        if (typeof window.stopPresenceHeartbeat === 'function') window.stopPresenceHeartbeat();
        if (typeof window.stopChatDockListener === 'function') window.stopChatDockListener();
        if (typeof window.closeAllChatWindows === 'function') window.closeAllChatWindows();

        headerAuthBtn.className = "btn btn-primary";
        headerAuthBtn.innerHTML = `🔑 登入 / 註冊`;
      }
    }
    window.updateUserAuthUI = updateUserAuthUI;

    function handleHeaderUserClick() {
      if (window.currentUser) {
        openMyAccountModal();
      } else {
        openModal('modal-login');
      }
    }
    window.handleHeaderUserClick = handleHeaderUserClick;

    // 撳自己個名彈出「我的帳號」資料卡：睇返自己嘅等級/積分/資料，
    // 想真正修改資料就要撳入面嗰粒「✏️ 編輯個人資料」先會去返編輯頁面。
    function openMyAccountModal() {
      if (!window.currentUser) { openModal('modal-login'); return; }
      const u = window.currentUser;
      const setText = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

      if (typeof window.renderUserAvatar === 'function') window.renderUserAvatar();
      setText('myacc-username', u.username || '同學');
      setText('myacc-loginid', u.loginId ? ('🆔 ' + u.loginId) : '🆔 未設定');
      setText('myacc-school', u.school || '未填寫');
      setText('myacc-grade', u.grade || '未填寫');
      setText('myacc-fav', u.favSubjects || '未填寫');
      setText('myacc-dislike', u.dislikeSubjects || '未填寫');
      setText('myacc-hours', (parseFloat(u.hours) || 0).toFixed(1) + ' 小時');
      setText('myacc-points', (u.points ?? 0) + ' PTS');

      const info = calcLevelInfo(u.exp || 0);
      const rank = getRankTitle(info.level);
      const levelBadge = document.getElementById('myacc-level-badge');
      if (levelBadge) {
        levelBadge.innerText = `${rank.emoji} Lv.${info.level} ${rank.title}`;
        levelBadge.style.color = rank.color;
      }
      const expBar = document.getElementById('myacc-exp-bar');
      if (expBar) expBar.style.width = info.pctToNext + '%';
      setText('myacc-exp-text', `${info.expIntoLevel} / ${info.expNeededForNext} EXP · 仍欠 ${info.expRemaining} EXP 升級`);

      // 「溫習日記」獨立做咗一個分頁（tab-diary），呢度資料卡淨係顯示
      // 簡要數字（相片／粉絲／追蹤中），撳「查看溫習日記」先真正載入
      // 相片牆——所以呢度唔使再喺開資料卡嗰陣就攞相片。
      if (typeof window.updateMyAccountPhotoStats === 'function') window.updateMyAccountPhotoStats();
      if (typeof window.updateMyAccountTutorStatus === 'function') window.updateMyAccountTutorStatus();

      openModal('modal-my-account');
    }
    window.openMyAccountModal = openMyAccountModal;

    function goEditProfileFromAccountModal() {
      closeModal('modal-my-account');
      switchTab('profile');
    }
    window.goEditProfileFromAccountModal = goEditProfileFromAccountModal;

    // ===================== 🎓 導師身份申請（Phase A：導師 PDF 筆記商店） =====================
    // 呢一段純粹負責「資料卡入面嘅導師身份狀態顯示」＋「申請表格提交」，
    // 審批（approveTutorApplication／rejectTutorApplication）由管理後台
    // 嘅 admin-panel.js 負責。四種狀態：(1) 未申請過——顯示申請掣；
    // (2) 已交低、審批中——顯示提示文字；(3) 之前被拒——顯示拒絕原因＋
    // 重新申請掣；(4) 已經係導師——顯示已批核文字（Phase B 先會加返
    // 「前往導師後台」嘅入口，而家仲未有導師後台）。
    async function updateMyAccountTutorStatus() {
      const area = document.getElementById('myacc-tutor-area');
      if (!area || !window.currentUser || !window.db || !window.fs) return;

      if (window.currentUser.role === 'tutor') {
        area.innerHTML = `
          <div style="background:#EAF6EC; border:1px solid #B7E0BE; border-radius:10px; padding:10px 12px; font-size:13px; color:#2F6B3A; text-align:left;">
            🎓 您已經是 ConcenMate 認證導師。請在左側選單點選「管理教材」，即可上傳與管理您的科目、課題及教材。
          </div>
        `;
        return;
      }

      area.innerHTML = '<p style="font-size:13px; color:#999; text-align:center;">正在查詢導師身份狀態…</p>';
      try {
        const snap = await window.fs.getDoc(window.fs.doc(window.db, 'tutorApplications', window.currentUser.uid));
        if (!snap.exists()) {
          // 學生帳戶不再提供事後「申請成為導師」的入口——是否成為導師
          // 現在已經在註冊時（揀選帳戶類型）決定，避免同一個身份有兩條
          // 並存的申請路徑。從未申請過的帳戶，這裡就不顯示任何內容。
          area.innerHTML = '';
          return;
        }
        const app = snap.data();
        if (app.status === 'pending') {
          area.innerHTML = `
            <div style="background:#FFF7E6; border:1px solid #F0D9A0; border-radius:10px; padding:10px 12px; font-size:13px; color:#8a6d1f; text-align:left;">
              ⏳ 您的導師申請正在審批中，請耐心等候管理員處理。
            </div>
          `;
        } else if (app.status === 'rejected') {
          area.innerHTML = `
            <div style="background:#FBEAEA; border:1px solid #E3B4B4; border-radius:10px; padding:10px 12px; font-size:13px; color:#8a2f2f; text-align:left; margin-bottom:8px;">
              ❌ 上一次的導師申請未獲批准。${app.rejectionReason ? ('原因：' + escapeHtml(app.rejectionReason)) : ''}
            </div>
            <button class="btn btn-outline" type="button" style="width:100%; justify-content:center;" onclick="openTutorApplyModal()">🔁 重新申請</button>
          `;
        } else {
          // status === 'approved'，但 users/{uid}.role 未及時同步（理論上
          // approveTutorApplication 一定會兩者一齊改，出現呢個狀態機會
          // 極微，保留呢個分支純粹係防禦性顯示）
          area.innerHTML = `
            <div style="background:#EAF6EC; border:1px solid #B7E0BE; border-radius:10px; padding:10px 12px; font-size:13px; color:#2F6B3A; text-align:left;">
              🎓 您的導師申請已經批核，重新登入後即可生效。
            </div>
          `;
        }
      } catch (err) {
        area.innerHTML = `<p style="font-size:13px; color:#c0392b; text-align:center;">查詢導師身份狀態失敗：${escapeHtml(err.message || String(err))}</p>`;
      }
    }
    window.updateMyAccountTutorStatus = updateMyAccountTutorStatus;

    window.openTutorApplyModal = function() {
      if (!window.currentUser) { openModal('modal-login'); return; }
      const nameInput = document.getElementById('tutor-apply-name');
      if (nameInput && !nameInput.value) nameInput.value = window.currentUser.username || '';
      closeModal('modal-my-account');
      openModal('modal-tutor-apply');
      // 「想教的科目」改用剔選式選擇器（見 app-core.js 嘅
      // renderTutorSubjectChipPicker()），同註冊表格導師欄位共用同一份
      // HKDSE 科目清單，唔使用戶自己打逗號分隔嘅文字。
      if (typeof window.renderTutorSubjectChipPicker === 'function') {
        window.renderTutorSubjectChipPicker('tutor-apply-subjects-picker', 'tutor-apply-subjects');
      }
    };

    window.submitTutorApplication = async function() {
      const btn = document.getElementById('tutor-apply-submit-btn');
      const displayName = (document.getElementById('tutor-apply-name').value || '').trim();
      const bio = (document.getElementById('tutor-apply-bio').value || '').trim();
      const subjectsRaw = (document.getElementById('tutor-apply-subjects').value || '').trim();
      const contactInfo = (document.getElementById('tutor-apply-contact').value || '').trim();
      const subjectsIntended = subjectsRaw.split(/[,，、]/).map(s => s.trim()).filter(Boolean);

      if (!displayName) { window.showToast('請填寫顯示名稱', '⚠️'); return; }
      if (subjectsIntended.length === 0) { window.showToast('請至少填寫一個想教的科目', '⚠️'); return; }

      if (btn) { btn.disabled = true; btn.innerText = '送出中…'; }
      try {
        await window.callCloudFunction('applyTutorRole', { displayName, bio, subjectsIntended, contactInfo });
        closeModal('modal-tutor-apply');
        window.showToast('已送出導師申請，請等候管理員審批', '✅');
      } catch (err) {
        window.showToast('送出申請失敗：' + (err.message || err), '❌');
      } finally {
        if (btn) { btn.disabled = false; btn.innerText = '送出申請'; }
      }
    };

    // 產生一個飄浮嘅表情動畫，放入指定嘅容器（自己或其他人嘅視訊卡片皆可用）
    function spawnSticker(container, emoji) {
      if (!container) return;

      const sticker = document.createElement('div');
      sticker.className = 'danmaku-sticker';
      sticker.innerText = emoji;

      const randomLeft = Math.floor(Math.random() * 75) + 10;
      const randomRotate = Math.floor(Math.random() * 40) - 20;
      const randomSize = Math.floor(Math.random() * 22) + 36;

      sticker.style.left = randomLeft + '%';
      sticker.style.fontSize = randomSize + 'px';
      sticker.style.setProperty('--rot', randomRotate + 'deg');

      container.appendChild(sticker);
      setTimeout(() => { sticker.remove(); }, 2200);
    }

    // 按鈕點擊時呼叫：只負責廣播去 Firestore，實際畫面動畫由 listenToReactions 統一播放
    // （自己一樣係監聽器嘅其中一位聽眾，所以自己撳低都會經返個監聽器播返出嚟，行為同其他人一致）
    function sendDanmakuSticker(emoji) {
      broadcastReaction(emoji);
    }
    window.sendDanmakuSticker = sendDanmakuSticker;

    // ===================== 疑難解答區 =====================

    // 舊制提問（math/chi/eng/sci/econ/other）留低嘅顯示標籤——依家
    // 「發起提問」已經改用返 window.TUTOR_DSE_SUBJECTS 嗰份完整科目
    // 清單（見 window.renderSingleSubjectChipPicker()），p.subject 會
    // 係實際科目全名（例如「數學（必修部分）」），QA_SUBJECTS 淨係
    // 用嚟兼容返舊制提問嘅標籤，新制科目直接顯示返個名就得。
    const QA_SUBJECTS = {
      all: '📚 全部', math: '➕ 數學', chi: '📝 中文',
      eng: '🔤 英文', sci: '🔬 科學', econ: '💹 經濟', other: '💬 其他'
    };

    // HKDSE 必修科（中國語文／英國語文／數學（必修部分）／公民與
    // 社會發展），用嚟將「發起提問」揀嘅實際科目歸類做「必修科目」
    // Tab；冇喺呢個清單、但又喺 window.TUTOR_DSE_SUBJECTS 固定清單
    // 入面嘅，就歸做「選修科目」；兩個清單都搵唔到（即係自行輸入嘅
    // 科目，或者舊制嘅 'other'）就歸做「其他」。
    const QA_CORE_SUBJECTS = ['中國語文', '英國語文', '數學（必修部分）', '公民與社會發展'];

    // 舊制提問（math/chi/eng/sci/econ/other）嘅分類兼容表：中英數
    // 歸做「必修」，科學／經濟歸做「選修」，其他歸做「其他」。
    const QA_LEGACY_CATEGORY_MAP = {
      math: 'core', chi: 'core', eng: 'core',
      sci: 'elective', econ: 'elective',
      other: 'other',
    };

    function getQAElectiveSubjects() {
      return (window.TUTOR_DSE_SUBJECTS || [])
        .filter((s) => s !== '其他（自行輸入）' && !QA_CORE_SUBJECTS.includes(s));
    }

    function getQACategory(subject) {
      if (Object.prototype.hasOwnProperty.call(QA_LEGACY_CATEGORY_MAP, subject)) {
        return QA_LEGACY_CATEGORY_MAP[subject];
      }
      if (QA_CORE_SUBJECTS.includes(subject)) return 'core';
      if (getQAElectiveSubjects().includes(subject)) return 'elective';
      return 'other';
    }
    window.getQACategory = getQACategory;

    let qaCurrentSubject = 'all'; // 'all' | 'core' | 'elective' | 'other'——即係而家揀緊邊個分類 Tab
    let qaCurrentSubjectDetail = ''; // 喺某個分類入面再篩多一層嘅實際科目名；空白就係睇成個分類
    let qaUnsubscribe = null;
    let qaPostsCache = [];
    let qaCurrentPostId = null;
    let qaCommentUnsubscribe = null;

    // 切換科目篩選：qa_posts 個 Firestore 監聽器（見 loadQAPosts）一開咗
    // 就會維持住成個 session，呢度淨係換緊「而家想睇邊科」呢個本機篩選
    // 條件，喺已經有齊嘅 qaPostsCache 度 filter 再重新畫一次就得，完全
    // 唔使再問 Firestore。之前嘅寫法係每撳一次科目掣，就將全部提問嘅
    // 監聽器拆咗再重裝一次、畫面清空變返「載入中」，撳幾多下科目掣就
    // 閃幾多下 loading，用戶體驗好差，而且完全冇必要。
    function switchQASubject(subject, btn) {
      qaCurrentSubject = subject;
      qaCurrentSubjectDetail = ''; // 換咗分類就重置返「揀邊一科」嘅細篩選
      document.querySelectorAll('.qa-subject-btn').forEach(b => b.classList.remove('active'));
      if (btn) btn.classList.add('active');
      renderQASubjectDetailSelect();
      renderQAPostsList();
    }
    window.switchQASubject = switchQASubject;

    // 揀咗「必修科目」或「選修科目」呢兩個分類之後，畫多一個下拉
    // 選單畀學生可以再篩多一層去某一科實際科目（例如喺「必修科目」
    // 入面淨係揀「英國語文」）。「其他」分類科目冇固定清單（學生
    // 自行輸入），所以冇呢個下拉選單；「全部」都唔使。
    function renderQASubjectDetailSelect() {
      const wrap = document.getElementById('qa-subject-detail-wrap');
      const select = document.getElementById('qa-subject-detail-select');
      if (!wrap || !select) return;
      if (qaCurrentSubject !== 'core' && qaCurrentSubject !== 'elective') {
        wrap.style.display = 'none';
        select.innerHTML = '';
        return;
      }
      const subjects = qaCurrentSubject === 'core' ? QA_CORE_SUBJECTS : getQAElectiveSubjects();
      const categoryLabel = qaCurrentSubject === 'core' ? '必修科目' : '選修科目';
      const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      const optionsHtml = subjects.map((s) => `<option value="${escAttr(s)}">${s}</option>`).join('');
      select.innerHTML = `<option value="">全部${categoryLabel}</option>${optionsHtml}`;
      select.value = qaCurrentSubjectDetail || '';
      wrap.style.display = 'block';
    }

    // 揀咗下拉選單入面某一科（或者揀返「全部＊＊科目」）之後，再篩
    // 多一次提問列表。
    window.handleQASubjectDetailChange = function() {
      const select = document.getElementById('qa-subject-detail-select');
      qaCurrentSubjectDetail = select ? select.value : '';
      renderQAPostsList();
    };

    function renderQAPostsList() {
      const list = document.getElementById('qa-post-list');
      if (!list) return;
      let posts = qaPostsCache.filter((p) => {
        if (qaCurrentSubject === 'all') return true;
        if (qaCurrentSubjectDetail) return p.subject === qaCurrentSubjectDetail;
        return getQACategory(p.subject) === qaCurrentSubject;
      });
      posts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      if (posts.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding:40px; color:#aaa; font-size:13px;">這個學科暫時未有提問，你先來發起第一題！</div>';
        return;
      }

      list.innerHTML = posts.map(p => {
        const isOwn = window.currentUser && p.uid === window.currentUser.uid;
        const photos = (p.photos || []).map(src =>
          `<img src="${src}" class="qa-photo-thumb" onclick="event.stopPropagation(); openLightbox('${src}')">`
        ).join('');
        return `
          <div class="qa-post-card" onclick="openQADetail('${p.id}')">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
              <span class="qa-subject-label">${QA_SUBJECTS[p.subject] || p.subject}</span>
              ${isOwn ? `<button class="btn btn-red" style="font-size:13px; padding:3px 8px;" onclick="deleteQAPost(event,'${p.id}')">🗑️ 刪除</button>` : ''}
            </div>
            <h4 style="font-size:13px; font-weight:700; margin:4px 0; color:var(--brand-800);">${escapeHtml(p.title)}</h4>
            <p style="font-size:13px; color:#666; line-height:1.5; margin-bottom:6px;">${escapeHtml(p.body || '').substring(0,100)}${(p.body||'').length > 100 ? '…' : ''}</p>
            ${photos ? `<div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:6px;">${photos}</div>` : ''}
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px; color:#aaa;">
              <span>👤 ${escapeHtml(p.authorName || '匿名')} · ${formatTime(p.createdAt)}</span>
              <span>💬 ${p.commentCount || 0} 個回答</span>
            </div>
          </div>
        `;
      }).join('');
    }

    // 呢個監聽器一開咗就會維持住成個 session（唔會因為切換科目篩選、或者
    // 反覆入返「疑難解答區」分頁而拆咗再重裝）——Firestore 有更新會自動
    // 經 onSnapshot 落嚟、實時更新埋 qaPostsCache 再重畫，唔使自己手動
    // 重新 fetch。已經訂閱緊嘅話，呢度淨係即刻用返 cache 重畫一次
    // （冇網絡來回、唔會再閃「載入中」）。
    function loadQAPosts() {
      if (!window.db || !window.fs) return;
      if (qaUnsubscribe) { renderQAPostsList(); return; }

      const list = document.getElementById('qa-post-list');
      if (list) list.innerHTML = '<div style="text-align:center; padding:30px; color:#7DB8C5; font-size:13px;">載入中…</div>';

      let ref = window.fs.collection(window.db, 'qa_posts');
      qaUnsubscribe = window.fs.onSnapshot(ref, (snapshot) => {
        qaPostsCache = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderQAPostsList();
      });
    }

    window.openQAModal = function() {
      if (!window.currentUser) { window.showToast('請先登入', '⚠️'); return; }
      document.getElementById('qa-title').value = '';
      document.getElementById('qa-body').value = '';
      document.getElementById('qa-photos').value = '';
      document.getElementById('qa-photo-preview').innerHTML = '';
      // 「學科」欄位改用返同「喜愛學科」一樣嘅剔選 chip 選擇器（單選
      // 版本，見 app-core.js 嘅 window.renderSingleSubjectChipPicker()），
      // 每次打開視窗都清空返，等學生每次發起提問都要重新揀一次學科，
      // 唔會誤用返上一條問題揀開嘅科目。
      const subjectHiddenInput = document.getElementById('qa-subject-select');
      if (subjectHiddenInput) subjectHiddenInput.value = '';
      if (typeof window.renderSingleSubjectChipPicker === 'function') {
        window.renderSingleSubjectChipPicker('qa-subject-picker', 'qa-subject-select');
      }
      openModal('modal-qa-post');
    };

    // Photo preview for both post and comment
    document.addEventListener('change', function(e) {
      const isPost = e.target.id === 'qa-photos';
      const isComment = e.target.id === 'qa-comment-photos';
      if (!isPost && !isComment) return;

      const files = Array.from(e.target.files).slice(0, 3);
      const previewId = isPost ? 'qa-photo-preview' : 'qa-comment-photo-preview';
      const preview = document.getElementById(previewId);
      if (!preview) return;
      preview.innerHTML = '';
      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = ev => {
          const img = document.createElement('img');
          img.src = ev.target.result;
          img.className = 'qa-photo-thumb';
          img.style.cursor = 'zoom-in';
          img.onclick = () => openLightbox(img.src);
          preview.appendChild(img);
        };
        reader.readAsDataURL(file);
      });
    });

    window.submitQAPost = async function() {
      if (!window.currentUser || !window.db || !window.fs) return;
      const title = document.getElementById('qa-title').value.trim();
      const body = document.getElementById('qa-body').value.trim();
      const subject = document.getElementById('qa-subject-select').value.trim();
      if (!subject) { window.showToast('請選擇學科', '⚠️'); return; }
      if (!title) { window.showToast('請填寫問題標題', '⚠️'); return; }

      const submitBtn = document.querySelector('#modal-qa-post .btn-primary');
      const origText = submitBtn.innerText;
      submitBtn.innerText = '⏳ 發布中…';
      submitBtn.disabled = true;

      try {
        const files = Array.from(document.getElementById('qa-photos').files).slice(0, 3);

        // 壓縮圖片至 600px 闊，確保每張唔超過 Firestore 文件限制
        const photos = await Promise.all(files.map(file => new Promise(res => {
          const img = new Image();
          const url = URL.createObjectURL(file);
          img.onload = () => {
            const maxW = 600;
            const scale = Math.min(1, maxW / img.width);
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            res(canvas.toDataURL('image/jpeg', 0.7));
          };
          img.src = url;
        })));

        const newPostData = {
          uid: window.currentUser.uid,
          authorName: window.currentUser.username || '匿名同學',
          subject, title, body, photos,
          commentCount: 0,
          createdAt: Date.now()
        };
        const newPostRef = await window.fs.addDoc(window.fs.collection(window.db, 'qa_posts'), newPostData);

        // ⚠️ 剛才 await 完 addDoc() 之後即刻讀 qaPostsCache 嚟畫面，呢個
        // cache 係由下面嗰個持續運行嘅 onSnapshot 監聽器更新——監聽器
        // 收到呢次寫入嘅本機回聲（local echo）通常會遲過呢一行執行，
        // 所以之前呢度會有一刻畫面睇落去「呢科暫時未有提問」，要用戶
        // 手動重新整頁先見到自己啱啱發佈嗰條（其實遞晒一兩拍已經有，
        // 但畫面冇再重畫過）。而家改為主動將呢條啱啱建立嘅提問塞入
        // qaPostsCache 最前面，令畫面即刻見到；之後 onSnapshot 嘅正式
        // 回應一到，會用返伺服器嘅完整資料整個 cache 重新覆蓋一次
        // （唔會因為呢度提早塞咗一份而出現重複）。
        qaPostsCache = [{ id: newPostRef.id, ...newPostData }, ...qaPostsCache];

        closeModal('modal-qa-post');
        window.showToast('提問已發布！', '✅');
        // Tab 列而家係跟「必修／選修／其他」分類嚟揀，唔再係跟實際
        // 學科（subject）本身，所以要用 getQACategory() 轉一轉，先至
        // 揾到啱嘅分類 Tab 撳落去、跳去顯示啱嘅分類；跟住再揀埋個
        // 細分類下拉選單去返啱嗰一科，等啱啱發布嗰條問題即刻見到。
        const category = getQACategory(subject);
        const btn = document.querySelector(`.qa-subject-btn[onclick*="'${category}'"]`);
        switchQASubject(category, btn);
        qaCurrentSubjectDetail = subject;
        renderQASubjectDetailSelect();
        renderQAPostsList();
      } catch(e) {
        console.error('發布提問失敗:', e);
        window.showToast('發布失敗：' + (e.message || '請稍後再試'), '❌');
      } finally {
        submitBtn.innerText = origText;
        submitBtn.disabled = false;
      }
    };

    window.deleteQAPost = async function(event, postId) {
      event.stopPropagation();
      if (!confirm('確定刪除這個提問嗎？')) return;
      try {
        await window.fs.deleteDoc(window.fs.doc(window.db, 'qa_posts', postId));
        window.showToast('提問已刪除', '🗑️');
      } catch(e) { window.showToast('刪除失敗', '❌'); }
    };

    window.openQADetail = async function(postId) {
      qaCurrentPostId = postId;
      document.getElementById('qa-comment-input').value = '';
      const cp = document.getElementById('qa-comment-photos');
      if (cp) cp.value = '';
      const cpp = document.getElementById('qa-comment-photo-preview');
      if (cpp) cpp.innerHTML = '';
      openModal('modal-qa-detail');

      const docSnap = await window.fs.getDoc(window.fs.doc(window.db, 'qa_posts', postId));
      if (!docSnap.exists()) return;
      const p = { id: docSnap.id, ...docSnap.data() };
      const isOwn = window.currentUser && p.uid === window.currentUser.uid;

      const photos = (p.photos || []).map(src =>
        `<img src="${src}" class="qa-photo-thumb" style="width:90px;height:90px;" onclick="openLightbox('${src}')">`
      ).join('');

      document.getElementById('qa-detail-content').innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
          <span class="qa-subject-label">${QA_SUBJECTS[p.subject] || p.subject}</span>
          ${isOwn ? `<button class="btn btn-red" style="font-size:13px; padding:3px 8px;" onclick="deleteQAPost(event,'${p.id}'); closeModal('modal-qa-detail');">🗑️ 刪除</button>` : ''}
        </div>
        <h3 style="font-size:15px; font-weight:700; color:var(--brand-800); margin-bottom:8px;">${escapeHtml(p.title)}</h3>
        ${p.body ? `<p style="font-size:13px; color:#555; line-height:1.6; margin-bottom:10px;">${escapeHtml(p.body)}</p>` : ''}
        ${photos ? `<div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;">${photos}</div>` : ''}
        <div style="font-size:13px; color:#aaa; margin-bottom:14px;">👤 ${escapeHtml(p.authorName || '匿名')} · ${formatTime(p.createdAt)}</div>
        <div id="qa-comment-list" style="display:flex; flex-direction:column; gap:8px;">
          <div style="font-size:13px; color:#aaa; text-align:center;">載入留言中…</div>
        </div>
      `;

      if (qaCommentUnsubscribe) qaCommentUnsubscribe();
      const commentsRef = window.fs.collection(window.db, 'qa_posts', postId, 'comments');
      qaCommentUnsubscribe = window.fs.onSnapshot(commentsRef, (snap) => {
        const comments = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        const commentList = document.getElementById('qa-comment-list');
        if (!commentList) return;
        if (comments.length === 0) {
          commentList.innerHTML = '<div style="font-size:13px; color:#aaa; text-align:center; padding:10px;">未有回答，你是第一個！</div>';
          return;
        }
        const myUid = window.currentUser ? window.currentUser.uid : null;
        commentList.innerHTML = comments.map(c => {
          const cPhotos = (c.photos || []).map(src =>
            `<img src="${src}" class="qa-photo-thumb" style="width:70px;height:70px;" onclick="openLightbox('${src}')">`
          ).join('');
          const isOwn = myUid && c.uid === myUid;
          const editedNote = c.editedAt
            ? `<span style="font-size:13px; color:#7DB8C5; margin-left:6px;">✏️ 已編輯 ${formatTime(c.editedAt)}</span>`
            : '';
          const actions = isOwn ? `
            <div style="display:flex; gap:6px; margin-top:8px;">
              <button class="btn btn-outline" style="font-size:13px; padding:4px 10px;"
                onclick="startEditComment('${c.id}', \`${escapeHtml(c.body).replace(/`/g,'\\`')}\`)">✏️ 編輯</button>
              <button class="btn btn-red" style="font-size:13px; padding:4px 10px;"
                onclick="deleteComment('${c.id}')">🗑️ 刪除</button>
            </div>` : '';
          return `
          <div id="comment-${c.id}" style="background:var(--brand-50); border-radius:12px; padding:12px; border:1px solid var(--brand-200);">
            <div style="font-size:13px; font-weight:bold; color:var(--brand-700);">👤 ${escapeHtml(c.authorName || '匿名')}</div>
            <p id="comment-body-${c.id}" style="font-size:13px; color:#333; margin-top:5px; line-height:1.6;">${escapeHtml(c.body)}</p>
            ${cPhotos ? `<div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">${cPhotos}</div>` : ''}
            <div style="font-size:13px; color:#aaa; margin-top:5px;">
              ${formatTime(c.createdAt)}${editedNote}
            </div>
            ${actions}
          </div>
        `}).join('');
      });
    };

    window.submitQAComment = async function() {
      if (!window.currentUser) { window.showToast('請先登入', '⚠️'); return; }
      const body = document.getElementById('qa-comment-input').value.trim();
      if (!body) { window.showToast('請填寫回答內容', '⚠️'); return; }
      if (!qaCurrentPostId) return;

      const submitBtn = document.getElementById('qa-comment-submit-btn');
      const origText = submitBtn ? submitBtn.innerText : '';
      if (submitBtn) { submitBtn.innerText = '⏳ 送出中…'; submitBtn.disabled = true; }

      try {
        const files = Array.from((document.getElementById('qa-comment-photos') || {}).files || []).slice(0, 3);
        const photos = await Promise.all(files.map(file => new Promise(res => {
          const img = new Image();
          const url = URL.createObjectURL(file);
          img.onload = () => {
            const maxW = 600;
            const scale = Math.min(1, maxW / img.width);
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            res(canvas.toDataURL('image/jpeg', 0.7));
          };
          img.src = url;
        })));

        await window.fs.addDoc(window.fs.collection(window.db, 'qa_posts', qaCurrentPostId, 'comments'), {
          uid: window.currentUser.uid,
          authorName: window.currentUser.username || '匿名同學',
          body, photos, createdAt: Date.now()
        });
        await window.fs.updateDoc(window.fs.doc(window.db, 'qa_posts', qaCurrentPostId), {
          commentCount: window.fs.increment(1)
        });
        document.getElementById('qa-comment-input').value = '';
        const commentPhotos = document.getElementById('qa-comment-photos');
        if (commentPhotos) commentPhotos.value = '';
        const commentPreview = document.getElementById('qa-comment-photo-preview');
        if (commentPreview) commentPreview.innerHTML = '';
        window.showToast('回答已送出！', '💬');
      } catch(e) {
        console.error(e);
        window.showToast('送出失敗，請稍後再試', '❌');
      } finally {
        if (submitBtn) { submitBtn.innerText = origText; submitBtn.disabled = false; }
      }
    };

    window.deleteComment = async function(commentId) {
      if (!confirm('確定刪除這個留言？')) return;
      try {
        await window.fs.deleteDoc(
          window.fs.doc(window.db, 'qa_posts', qaCurrentPostId, 'comments', commentId)
        );
        await window.fs.updateDoc(window.fs.doc(window.db, 'qa_posts', qaCurrentPostId), {
          commentCount: window.fs.increment(-1)
        });
        window.showToast('留言已刪除', '🗑️');
      } catch(e) { window.showToast('刪除失敗', '❌'); }
    };

    window.startEditComment = function(commentId, currentBody) {
      const bodyEl = document.getElementById('comment-body-' + commentId);
      if (!bodyEl) return;

      // 替換段落為可編輯的 textarea + 確認/取消按鈕
      const parent = bodyEl.parentElement;
      bodyEl.style.display = 'none';

      // 避免重複建立編輯框
      if (document.getElementById('edit-area-' + commentId)) return;

      const editArea = document.createElement('div');
      editArea.id = 'edit-area-' + commentId;
      editArea.innerHTML = `
        <textarea id="edit-input-${commentId}" class="input-field" rows="3"
          style="margin-top:6px; resize:vertical; font-size:13px;">${currentBody.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"')}</textarea>
        <div style="display:flex; gap:6px; margin-top:6px;">
          <button class="btn btn-outline" style="font-size:13px; padding:4px 10px;"
            onclick="cancelEditComment('${commentId}')">取消</button>
          <button class="btn btn-primary" style="font-size:13px; padding:4px 10px;"
            onclick="saveEditComment('${commentId}')">✅ 儲存</button>
        </div>
      `;
      parent.insertBefore(editArea, bodyEl.nextSibling);
      document.getElementById('edit-input-' + commentId)?.focus();
    };

    window.cancelEditComment = function(commentId) {
      const editArea = document.getElementById('edit-area-' + commentId);
      if (editArea) editArea.remove();
      const bodyEl = document.getElementById('comment-body-' + commentId);
      if (bodyEl) bodyEl.style.display = '';
    };

    window.saveEditComment = async function(commentId) {
      const newBody = document.getElementById('edit-input-' + commentId)?.value.trim();
      if (!newBody) { window.showToast('內容不可以是空白', '⚠️'); return; }
      try {
        await window.fs.updateDoc(
          window.fs.doc(window.db, 'qa_posts', qaCurrentPostId, 'comments', commentId),
          { body: newBody, editedAt: Date.now() }
        );
        window.showToast('留言已更新', '✅');
      } catch(e) { window.showToast('儲存失敗', '❌'); }
    };

    // circular=true 專門畀頭像用：燈箱入面個相片會用圓形裁切顯示，配合
    // 頭像本身係圓形嘅設計；一般相片（QA 相片、溫習相片）唔傳呢個參數，
    // 維持返原本矩形顯示。
    window.openLightbox = function(src, circular) {
      const lb = document.getElementById('qa-lightbox');
      const img = document.getElementById('qa-lightbox-img');
      img.src = src;
      img.classList.toggle('lightbox-img-circle', !!circular);
      lb.style.display = 'flex';
    };

    function escapeHtml(str) {
      return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function formatTime(ts) {
      if (!ts) return '';
      const d = new Date(ts);
      return d.toLocaleDateString('zh-HK', { month:'short', day:'numeric' }) + ' ' +
             d.toLocaleTimeString('zh-HK', { hour:'2-digit', minute:'2-digit', hour12:false });
    }

    // ===================== 扭蛋機系統 =====================


    // 扭蛋獎品而家全部改成 Ottiee 收集貼紙（完全取代舊有嘅溫習貼士卡／
    // 文具禮券／DSE 參考書等實物獎），目標係儲齊一套做圖鑑。預設 50 隻
    // 貼紙全部用 🦦 emoji 做 placeholder（管理員未上傳真圖之前），管理員
    // 可以喺後台「扭蛋機貼紙管理」逐隻改名／換 emoji／上傳圖片，亦都可以
    // 自行新增／刪除貼紙格——收集圖鑑嘅「X/50」會自動跟返實際貼紙數量，
    // 唔係寫死 50。
    const GACHA_STICKERS = Array.from({ length: 50 }, (_, i) => {
      const id = i + 1;
      return {
        id,
        name: `Ottiee 貼紙 #${String(id).padStart(2, '0')}`,
        emoji: '🦦',
        photo: null,
        weight: 1
      };
    });

    const GACHA_COST = { normal: 30, lucky: 270 }; // lucky 而家係「連續抽十次」嘅一次過總收費

    function stickerRoll() {
      const pool = GACHA_STICKERS;
      const total = pool.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0);
      let rand = Math.random() * total;
      for (const st of pool) {
        rand -= (parseFloat(st.weight) || 0);
        if (rand <= 0) return st;
      }
      return pool[pool.length - 1];
    }

    // ---------- 貼紙擁有狀態（儲喺 users/{uid} 文件嘅 ownedStickers 呢個
    // map 度，key 係貼紙 id，value 係擁有數量）----------
    function getOwnedStickerCount(id) {
      const owned = (window.currentUser && window.currentUser.ownedStickers) || {};
      return owned[id] || 0;
    }

    function getOwnedStickerTypeCount() {
      const owned = (window.currentUser && window.currentUser.ownedStickers) || {};
      return Object.keys(owned).filter(k => (owned[k] || 0) > 0).length;
    }

    // 一次過將幾隻貼紙（可以係同一隻抽中好多次，會 aggregate 埋一齊）
    // 寫返落 window.currentUser（畫面即刻反映）同 Firestore（背景同步，
    // 用 dotted-path + increment，唔存在嘅話會自動由 0 開始計）。
    function awardStickers(list) {
      if (!window.currentUser) window.currentUser = {};
      if (!window.currentUser.ownedStickers) window.currentUser.ownedStickers = {};
      const payload = {};
      list.forEach(({ id, count }) => {
        window.currentUser.ownedStickers[id] = (window.currentUser.ownedStickers[id] || 0) + count;
        if (window.fs) payload['ownedStickers.' + id] = window.fs.increment(count);
      });
      if (window.currentUser.uid && window.db && window.fs && Object.keys(payload).length) {
        window.fs.updateDoc(window.fs.doc(window.db, 'users', window.currentUser.uid), payload)
          .catch((e) => console.warn('貼紙收藏未能同步去 Firestore：', e));
      }
    }

    function updateStickerProgressUI() {
      const total = GACHA_STICKERS.length;
      const owned = getOwnedStickerTypeCount();
      const pct = total > 0 ? Math.round(owned / total * 100) : 0;
      const bar = document.getElementById('sticker-progress-bar');
      if (bar) bar.style.width = pct + '%';
      const txt = document.getElementById('sticker-progress-text');
      if (txt) txt.innerText = `${owned}/${total}`;
      const modalTxt = document.getElementById('sticker-modal-progress-text');
      if (modalTxt) modalTxt.innerText = `${owned}/${total}`;
    }
    window.updateStickerProgressUI = updateStickerProgressUI;

    function renderStickerCollectionGrid() {
      const grid = document.getElementById('sticker-collection-grid');
      if (!grid) return;
      const owned = (window.currentUser && window.currentUser.ownedStickers) || {};
      grid.innerHTML = GACHA_STICKERS.map(st => {
        const count = owned[st.id] || 0;
        if (count > 0) {
          const thumb = st.photo
            ? `<img src="${st.photo}" style="width:100%; aspect-ratio:1; object-fit:cover; border-radius:8px;">`
            : `<div style="font-size:28px;">${escapeHtml(st.emoji || '🦦')}</div>`;
          return `
            <div onclick="showStickerCollectionDetail(${st.id})" title="點擊放大查看：${escapeHtml(st.name || '')}" style="cursor:pointer; text-align:center; background:#F0F6F8; border:2px solid #7DB8C5; border-radius:10px; padding:6px 4px;">
              ${thumb}
              <div style="font-size:12px; font-weight:bold; color:#2F6070; margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(st.name || '')}</div>
              <div style="font-size:11px; color:#7DB8C5;">×${count}</div>
            </div>`;
        }
        return `
          <div style="text-align:center; background:#EEE; border:2px dashed #CCC; border-radius:10px; padding:6px 4px;">
            <div style="font-size:28px; color:#BBB;">❔</div>
            <div style="font-size:12px; color:#AAA; margin-top:4px;">未收集</div>
          </div>`;
      }).join('');
    }

    function refreshCollectionBookIfOpen() {
      updateStickerProgressUI();
      const modal = document.getElementById('sticker-collection-modal');
      if (modal && modal.style.display !== 'none') renderStickerCollectionGrid();
      // 主頁「我的水獺」卡嘅「圖鑑完成度」都係讀返呢份資料，扭蛋完一齊刷新
      if (typeof updateOtterStatsCard === 'function') updateOtterStatsCard();
    }

    window.openStickerCollection = function() {
      renderStickerCollectionGrid();
      updateStickerProgressUI();
      const modal = document.getElementById('sticker-collection-modal');
      if (modal) modal.style.display = 'flex';
    };
    window.closeStickerCollection = function() {
      const modal = document.getElementById('sticker-collection-modal');
      if (modal) modal.style.display = 'none';
    };

    // 撳圖鑑入面任何一格「已收集」嘅貼紙，放大顯示嗰隻貼紙嘅圖片／emoji、
    // 名稱、擁有數量——同十連抽結果嗰個放大燈箱（#gacha-prize-lightbox）
    // 共用返同一套元素，行為一致，唔使再起多一個彈窗。未收集嗰格（灰色
    // 剪影）冇綁呢個 onclick，撳落去冇反應。
    window.showStickerCollectionDetail = function(id) {
      const st = GACHA_STICKERS.find(s => s.id === id);
      if (!st) return;
      const owned = (window.currentUser && window.currentUser.ownedStickers) || {};
      const count = owned[id] || 0;
      if (count <= 0) return;
      clearTimeout(window._gachaResultAutoCloseTimer);

      const emojiEl = document.getElementById('gacha-lightbox-emoji');
      if (st.photo) {
        emojiEl.innerHTML = `<img src="${st.photo}" alt="${escapeHtml(st.name || '')}" style="width:100%; max-width:340px; aspect-ratio:1/1; object-fit:contain; background:#F0F6F8; border-radius:16px; border:2px solid #7DB8C5;">`;
      } else {
        emojiEl.innerHTML = '';
        emojiEl.innerText = st.emoji || '🦦';
      }
      const tierEl = document.getElementById('gacha-lightbox-tier');
      tierEl.innerText = `已收集 ×${count}`;
      tierEl.style.color = '#2F6070';
      document.getElementById('gacha-lightbox-name').innerText = st.name || '';
      document.getElementById('gacha-lightbox-desc').innerText = `貼紙圖鑑收集進度：${getOwnedStickerTypeCount()}/${GACHA_STICKERS.length}`;
      document.getElementById('gacha-prize-lightbox').style.display = 'flex';
    };

    function syncGachaPtsDisplay() {
      const pts = parseInt(document.getElementById('stat-points')?.innerText || '0');
      const el = document.getElementById('gacha-pts-display');
      if (el) el.innerText = pts;
    }

    // 扭蛋掣防連撳：撳落去到伺服器回應（spendGachaPoints）之間有網絡
    // 來回時間，手機網絡唔穩（學校 WiFi 常見）嗰陣，用戶好容易手快連
    // 撳兩下，結果觸發兩次扣分——變成「畀咗兩次分先扭到一次」。呢個
    // flag 加埋兩粒掣（單抽／十連抽）一齊鎖住，確保同一時間淨係得一
    // 次扭蛋請求喺處理緊。
    let gachaDrawInProgress = false;
    function setGachaButtonsDisabled(disabled) {
      const normalBtn = document.getElementById('gacha-draw-normal-btn');
      const luckyBtn = document.getElementById('gacha-draw-lucky-btn');
      [normalBtn, luckyBtn].forEach(btn => { if (btn) btn.disabled = disabled; });
    }

    window.doGacha = async function(type) {
      if (gachaDrawInProgress) return; // 上一次請求仲未回應，忽略呢次連撳
      gachaDrawInProgress = true;
      setGachaButtonsDisabled(true);
      try {
        await doGachaInner(type);
      } finally {
        gachaDrawInProgress = false;
        setGachaButtonsDisabled(false);
      }
    };

    async function doGachaInner(type) {
      // 「幸運扭蛋」掣而家改咗做「連續抽十次」——一次過用同一個獎池
      // （lucky 池）抽 10 次、一次過扣總費用，結果分兩行顯示，唔再係
      // 單抽嗰一套流程，所以獨立分支去 doGachaBatch()。
      if (type === 'lucky') { await doGachaBatch(); return; }

      const cost = GACHA_COST[type];

      // 扣分：而家改用 Cloud Function（spendGachaPoints）做，喺伺服器端
      // 用 Firestore transaction 原子咁「確認夠分先扣」，唔再淨係信任前端
      // 畫面顯示緊嘅數字。之前嗰種做法（前端自己讀畫面數字判斷夠唔夠分、
      // 再直接 increment(-cost)）喺多分頁／手快連撳兩下掣嘅情況下，「檢查」
      // 同「扣分」之間唔夠原子性，會導致分數扣到負數（見用家報告）。
      let newPoints;
      try {
        const result = await window.callCloudFunction('spendGachaPoints', { type });
        newPoints = result.points;
      } catch (error) {
        if (error.code === 'functions/failed-precondition' || error.code === 'failed-precondition') {
          window.showToast(error.message, '❌');
        } else {
          window.showToast('扣分失敗：' + (error.message || error), '❌');
        }
        return;
      }

      const ptsEl = document.getElementById('stat-points');
      if (ptsEl) ptsEl.innerText = newPoints;
      syncGachaPtsDisplay();
      const gachaHomePtsEl = document.getElementById('home-stat-pts');
      if (gachaHomePtsEl) gachaHomePtsEl.innerText = newPoints;
      if (window.currentUser) window.currentUser.points = newPoints;

      // 隱藏上次結果
      const resultBox = document.getElementById('gacha-result-box');
      closeGachaSingleResult();
      closeGachaBatchResult();

      // 扭蛋機震動動畫
      const machine = document.getElementById('gacha-machine');
      machine.classList.remove('gacha-shaking');
      void machine.offsetWidth; // reflow to restart animation
      machine.classList.add('gacha-shaking');

      // 等震動動畫完成
      await new Promise(r => setTimeout(r, 500));

      // 抽獎：而家全部改成 Ottiee 貼紙，抽之前先記低呢隻之前擁有幾多張
      // （0 即係「新貼紙」），抽完即刻寫返擁有狀態（畫面 + Firestore）。
      const sticker = stickerRoll();
      const wasOwnedCount = getOwnedStickerCount(sticker.id);
      const isNew = wasOwnedCount === 0;
      awardStickers([{ id: sticker.id, count: 1 }]);

      // 顯示結果（唔再有膠囊彈出/旋轉動畫，震動完即刻顯示結果）
      resultBox.style.background = isNew ? '#FBEAE8' : '#F0F6F8';
      resultBox.style.borderColor = isNew ? '#C0524A' : '#B3D6DE';
      // 如果管理員有幫呢隻貼紙上傳圖片，優先展示相片；沒有的話就繼續用返 emoji
      const resultEmojiEl = document.getElementById('gacha-result-emoji');
      if (sticker.photo) {
        resultEmojiEl.innerHTML = `<img src="${sticker.photo}" alt="${escapeHtml(sticker.name || '')}" style="width:88px; height:88px; object-fit:contain; background:#F0F6F8; border-radius:12px; border:2px solid #7DB8C5; box-shadow:0 2px 8px rgba(0,0,0,.15);">`;
      } else {
        resultEmojiEl.innerHTML = '';
        resultEmojiEl.innerText = sticker.emoji || '🦦';
      }
      const tierEl = document.getElementById('gacha-result-tier');
      tierEl.innerText = isNew ? '🆕 新貼紙！' : `已擁有 ×${wasOwnedCount + 1}`;
      tierEl.style.color = isNew ? '#C0524A' : '#2F6070';
      document.getElementById('gacha-result-name').innerText = sticker.name;
      document.getElementById('gacha-result-desc').innerText = `貼紙圖鑑收集進度：${getOwnedStickerTypeCount()}/${GACHA_STICKERS.length}`;

      // 顯示彈出視窗：置中／背景遮罩／5 秒後自動關閉都喺 showGachaSingleResult
      // 呢個共用 helper 入面處理（同「連續抽十次」嗰個彈窗行為完全一致）
      showGachaSingleResult();

      if (isNew) {
        window.showToast(`🎉 恭喜！抽到新貼紙「${sticker.name}」！`, '🆕');
      }

      // 加入歷史記錄（本頁顯示 + 儲存去 Firestore 給個人資料頁查閱）
      addGachaHistory(sticker, type, undefined, isNew);
      saveGachaHistoryToFirestore(sticker, type, undefined, isNew);
      refreshCollectionBookIfOpen();
    }

    // 扭蛋結果彈出視窗（單抽同「連續抽十次」兩個都用返呢一套）：置中／
    // 背景遮罩／自動關閉呢幾個共用邏輯抽做一個通用 helper，兩個彈窗行為
    // 保持一致，改一個位兩邊都會跟到（見用家反映「兩個彈窗方法應該一
    // 樣」）。
    //
    // 置中計算特登唔淨係靠 CSS 嘅 left:50%——嗰個 50% 係相對成個瀏覽器
    // 視窗（連埋左邊側邊欄 <aside> 都計埋），會令個彈窗睇落偏咗去側邊欄
    // 嗰邊，同「扭蛋機」呢版內容（<main>，唔連側邊欄）嘅視覺中心對唔返
    // 位（見用家反映）。改用 JS 按 <main> 嘅實際位置同闊度計返真正置中
    // 座標，側邊欄闊度點變（例如窄螢幕摺埋）都會自動跟得啱。
    function makeGachaResultPopup(boxId, backdropId, autoCloseMs) {
      const box = () => document.getElementById(boxId);
      const backdrop = () => document.getElementById(backdropId);

      function center() {
        const boxEl = box();
        const mainEl = document.querySelector('main');
        if (!boxEl || !mainEl) return;
        const mainRect = mainEl.getBoundingClientRect();
        const centerX = mainRect.left + mainRect.width / 2;
        boxEl.style.left = centerX + 'px';
        boxEl.style.top = '50%';
        boxEl.style.transform = 'translate(-50%, -50%)';
      }
      function onResize() { center(); }

      function show() {
        const boxEl = box();
        const backdropEl = backdrop();
        if (backdropEl) backdropEl.style.display = 'block';
        if (boxEl) boxEl.style.display = 'block';
        center();
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);
        if (autoCloseMs) {
          window._gachaResultAutoCloseTimer = setTimeout(close, autoCloseMs);
        }
      }
      function close() {
        const boxEl = box();
        const backdropEl = backdrop();
        if (boxEl) boxEl.style.display = 'none';
        if (backdropEl) backdropEl.style.display = 'none';
        clearTimeout(window._gachaResultAutoCloseTimer);
        window.removeEventListener('resize', onResize);
        window.removeEventListener('orientationchange', onResize);
      }
      return { show, close };
    }

    // 單抽（gacha-result-box）：5 秒後自動關閉
    const gachaSingleResultPopup = makeGachaResultPopup('gacha-result-box', 'gacha-result-backdrop', 5000);
    // 連續抽十次（gacha-result-box-batch）：結果比較多，8 秒後先自動關閉
    const gachaBatchResultPopup = makeGachaResultPopup('gacha-result-box-batch', 'gacha-result-backdrop-batch', 8000);

    function showGachaSingleResult() { gachaSingleResultPopup.show(); }
    window.closeGachaSingleResult = function() { gachaSingleResultPopup.close(); };
    function closeGachaSingleResult() { gachaSingleResultPopup.close(); }

    function showGachaBatchResult() { gachaBatchResultPopup.show(); }
    window.closeGachaBatchResult = function() { gachaBatchResultPopup.close(); };
    function closeGachaBatchResult() { gachaBatchResultPopup.close(); }

    // 「連續抽十次」：一次過用 lucky 獎池抽 10 次，扣一次總費用
    // （GACHA_COST.lucky，現在係 270 PTS），結果喺 #gacha-result-box-batch
    // 個 grid 度分兩行（每行 5 個）顯示，唔再用返單抽嗰個細細個結果框。
    async function doGachaBatch() {
      const cost = GACHA_COST.lucky;

      // 扣分邏輯同 doGacha 一樣，改用 Cloud Function 做原子性驗證，
      // 詳細原因見 doGacha 入面嘅註解。
      let newPoints;
      try {
        const result = await window.callCloudFunction('spendGachaPoints', { type: 'lucky' });
        newPoints = result.points;
      } catch (error) {
        if (error.code === 'functions/failed-precondition' || error.code === 'failed-precondition') {
          window.showToast(error.message, '❌');
        } else {
          window.showToast('扣分失敗：' + (error.message || error), '❌');
        }
        return;
      }

      const ptsEl = document.getElementById('stat-points');
      if (ptsEl) ptsEl.innerText = newPoints;
      syncGachaPtsDisplay();
      const gachaHomePtsEl = document.getElementById('home-stat-pts');
      if (gachaHomePtsEl) gachaHomePtsEl.innerText = newPoints;
      if (window.currentUser) window.currentUser.points = newPoints;

      closeGachaSingleResult();
      closeGachaBatchResult();

      const machine = document.getElementById('gacha-machine');
      machine.classList.remove('gacha-shaking');
      void machine.offsetWidth;
      machine.classList.add('gacha-shaking');

      await new Promise(r => setTimeout(r, 500));

      // 連續抽 10 次貼紙，每次獨立 roll。先喺本機複製一份目前擁有狀態
      // （localOwned）嚟逐次模擬，先至知呢 10 抽入面邊幾張係「新貼紙」
      // （例如同一隻連中兩次，第一次係新、第二次唔係），最後先將 10 抽
      // 嘅結果 aggregate（同一隻貼紙攞幾多次加埋）做一次過嘅 Firestore
      // 寫入，唔使開 10 次連線。
      const localOwned = Object.assign({}, (window.currentUser && window.currentUser.ownedStickers) || {});
      const rolls = [];
      for (let i = 0; i < 10; i++) {
        const sticker = stickerRoll();
        const wasOwnedCount = localOwned[sticker.id] || 0;
        const isNew = wasOwnedCount === 0;
        localOwned[sticker.id] = wasOwnedCount + 1;
        rolls.push({ sticker, isNew, ownedCountAfter: localOwned[sticker.id] });
      }
      // 存低成組結果，等用戶撳任何一格圖片放大睇嗰陣（見
      // window.showGachaPrizeDetail）攞得返完整資料
      window._lastGachaBatchPrizes = rolls;

      const counts = {};
      rolls.forEach(({ sticker }) => { counts[sticker.id] = (counts[sticker.id] || 0) + 1; });
      awardStickers(Object.keys(counts).map(id => ({ id, count: counts[id] })));

      const gridEl = document.getElementById('gacha-result-batch-grid');
      gridEl.innerHTML = rolls.map(({ sticker, isNew, ownedCountAfter }, idx) => {
        const thumb = sticker.photo
          ? `<img src="${sticker.photo}" alt="${escapeHtml(sticker.name || '')}" style="width:38px; height:38px; object-fit:cover; border-radius:8px;">`
          : `<span style="font-size:30px;">${escapeHtml(sticker.emoji || '🦦')}</span>`;
        const badgeColor = isNew ? '#C0524A' : '#2F6070';
        const badgeText = isNew ? '🆕 新貼紙' : `×${ownedCountAfter}`;
        return `
          <div onclick="showGachaPrizeDetail(${idx})" style="cursor:pointer; background:${isNew ? '#FBEAE8' : '#F0F6F8'}; border:2px solid ${badgeColor}; border-radius:12px; padding:8px 4px; text-align:center;" title="點擊放大查看：${escapeHtml(sticker.name || '')}">
            <div>${thumb}</div>
            <div style="font-size:13px; font-weight:bold; color:${badgeColor}; margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${badgeText}</div>
          </div>`;
      }).join('');
      // 顯示彈出視窗：置中／背景遮罩／8 秒後自動關閉都喺 showGachaBatchResult
      // 呢個共用 helper 入面處理（同單抽嗰個彈窗行為完全一致）
      showGachaBatchResult();

      const newCount = rolls.filter(r => r.isNew).length;
      if (newCount > 0) {
        window.showToast(`🎉 十連抽入面攞到 ${newCount} 張新貼紙！`, '🆕');
      } else {
        window.showToast('十連抽完成，這次全部都是已擁有的貼紙～', '🔁');
      }

      // 10 條歷史記錄一齊寫入；總費用只記喺第一條（避免個人資料頁「總支出」
      // 睇落好似扣咗 10 次 270 咁多），其餘 9 條 cost 記做 0
      rolls.forEach(({ sticker, isNew }, i) => {
        addGachaHistory(sticker, 'lucky', i === 0 ? cost : 0, isNew);
        saveGachaHistoryToFirestore(sticker, 'lucky', i === 0 ? cost : 0, isNew);
      });
      refreshCollectionBookIfOpen();
    }

    // 撳十連抽 grid 入面任何一格貼紙，放大顯示嗰隻貼紙嘅圖片／emoji、
    // 新/舊狀態、名稱、收集進度。撳背景或者「關閉」掣先返返去。
    window.showGachaPrizeDetail = function(idx) {
      const entry = (window._lastGachaBatchPrizes || [])[idx];
      if (!entry) return;
      const { sticker, isNew, ownedCountAfter } = entry;
      // 打開放大燈箱之後就取消個「8 秒自動關閉」計時器，等使用者慢慢睇，
      // 唔會睇到一半十連抽結果視窗自己收埋咗
      clearTimeout(window._gachaResultAutoCloseTimer);

      const emojiEl = document.getElementById('gacha-lightbox-emoji');
      if (sticker.photo) {
        emojiEl.innerHTML = `<img src="${sticker.photo}" alt="${escapeHtml(sticker.name || '')}" style="width:100%; max-width:340px; aspect-ratio:1/1; object-fit:contain; background:#F0F6F8; border-radius:16px; border:2px solid #7DB8C5;">`;
      } else {
        emojiEl.innerHTML = '';
        emojiEl.innerText = sticker.emoji || '🦦';
      }
      const tierEl = document.getElementById('gacha-lightbox-tier');
      tierEl.innerText = isNew ? '🆕 新貼紙！' : `已擁有 ×${ownedCountAfter}`;
      tierEl.style.color = isNew ? '#C0524A' : '#2F6070';
      document.getElementById('gacha-lightbox-name').innerText = sticker.name || '';
      document.getElementById('gacha-lightbox-desc').innerText = `貼紙圖鑑收集進度：${getOwnedStickerTypeCount()}/${GACHA_STICKERS.length}`;
      document.getElementById('gacha-prize-lightbox').style.display = 'flex';
    };

    window.closeGachaPrizeLightbox = function() {
      const el = document.getElementById('gacha-prize-lightbox');
      if (el) el.style.display = 'none';
    };

    // 將中獎記錄寫入 Firestore，給用家可以在「個人資料」頁隨時查返自己的中獎記錄。
    // costOverride：得「連續抽十次」會傳呢個參數（見 doGachaBatch），
    // 唔傳嘅話就沿用返 GACHA_COST[type] 嘅單抽費用。isNew：呢次抽中嗰陣
    // 係咪呢隻貼紙第一次擁有（用嚟喺個人資料頁分辨「新貼紙」定「重複」）。
    async function saveGachaHistoryToFirestore(sticker, type, costOverride, isNew) {
      try {
        if (!window.currentUser || !window.currentUser.uid || !window.fs || !window.db) return;
        await window.fs.addDoc(
          window.fs.collection(window.db, 'users', window.currentUser.uid, 'gachaHistory'),
          {
            stickerId: sticker.id,
            name: sticker.name || '',
            emoji: sticker.emoji || '🦦',
            photo: sticker.photo || null,
            isNew: !!isNew,
            type: type,
            cost: typeof costOverride === 'number' ? costOverride : (GACHA_COST[type] || 0),
            ts: Date.now()
          }
        );
      } catch (e) {
        console.error('儲存中獎記錄失敗', e);
      }
    }

    // 載入並顯示目前用家自己的中獎記錄（在「個人資料」分頁使用）。每次
    // 撳返「個人資料」分頁都會 call 一次嚟同步新戰績，但如果今次 session
    // 之前已經成功載入過一次，就唔好將個列表清空變返「載入緊...」——
    // 舊內容留喺畫面度，喺背景靜靜雞攞新資料，攞到先換新，唔會每次撳
    // 返呢個分頁都閃一次 loading。
    let gachaHistoryHasLoadedOnce = false;
    window.loadMyGachaHistory = async function() {
      const listEl = document.getElementById('profile-gacha-history-list');
      const emptyEl = document.getElementById('profile-gacha-history-empty');
      if (!listEl) return;
      if (!window.currentUser || !window.currentUser.uid || !window.fs || !window.db) {
        listEl.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'block';
        return;
      }
      if (!gachaHistoryHasLoadedOnce) {
        listEl.innerHTML = '<p style="text-align:center; color:#999; font-size:13px; padding:10px;">載入中獎記錄...</p>';
        if (emptyEl) emptyEl.style.display = 'none';
      }
      try {
        const snap = await window.fs.getDocs(window.fs.collection(window.db, 'users', window.currentUser.uid, 'gachaHistory'));
        let entries = snap.docs.map(d => d.data());
        entries.sort((a, b) => (b.ts || 0) - (a.ts || 0));
        entries = entries.slice(0, 30);
        gachaHistoryHasLoadedOnce = true;
        if (entries.length === 0) {
          listEl.innerHTML = '';
          if (emptyEl) emptyEl.style.display = 'block';
          return;
        }
        listEl.innerHTML = entries.map(e => {
          const time = e.ts ? new Date(e.ts).toLocaleString('zh-HK', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
          const thumb = e.photo
            ? `<img src="${e.photo}" style="width:20px; height:20px; object-fit:cover; border-radius:6px;">`
            : `<span style="font-size:20px;">${escapeHtml(e.emoji || '🦦')}</span>`;
          return `
            <div style="display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:8px; background:#F0F6F8; border:1px solid #B3D6DE55;">
              ${thumb}
              <div style="flex:1;">
                <strong style="color:${e.isNew ? '#C0524A' : '#2F6070'};">${e.isNew ? '🆕 新貼紙' : '重複'}</strong> · ${escapeHtml(e.name || '')}
                <div style="color:#7DB8C5; font-size:13px;">${e.type === 'lucky' ? '🎉 十連抽' : '🎯 抽一次'} · ${time} · -${e.cost || 0} PTS</div>
              </div>
            </div>`;
        }).join('');
      } catch (e) {
        console.error('載入中獎記錄失敗', e);
        // 淨係第一次載入就失敗先顯示錯誤訊息；如果背景靜靜雞 refresh 嗰次
        // 先失敗，舊資料已經喺畫面度，唔好用錯誤訊息蓋走佢
        if (!gachaHistoryHasLoadedOnce) {
          listEl.innerHTML = '<p style="text-align:center; color:#e55; font-size:13px; padding:10px;">載入中獎記錄失敗，請稍後再試</p>';
        }
      }
    };

    // 「最近抽獎記錄」卡（時數扭蛋機分頁本身，唔係個人資料頁嗰個）：
    // 以前呢個 list 淨係喺 DOM 度保留最新 10 筆，舊嗰啲一過 10 筆就即刻
    // 刪走，見都見唔返。而家改成成個 session 嘅記錄都留喺呢個陣列度，
    // 一開始淨係顯示頭 10 筆，撳「顯示更多」先再攞多 10 筆出嚟顯示，
    // 冇更多先隱藏返個掣。
    let gachaHistoryEntries = [];
    let gachaHistoryVisibleCount = 10;
    const GACHA_HISTORY_PAGE_SIZE = 10;

    function addGachaHistory(sticker, type, costOverride, isNew) {
      const card = document.getElementById('gacha-history-card');
      if (!card) return;

      const cost = typeof costOverride === 'number' ? costOverride : GACHA_COST[type];
      const time = new Date().toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' });
      gachaHistoryEntries.unshift({ sticker, type, cost, time, isNew: !!isNew });
      renderGachaHistoryList();
    }

    function renderGachaHistoryList() {
      const card = document.getElementById('gacha-history-card');
      const list = document.getElementById('gacha-history-list');
      const moreBtn = document.getElementById('gacha-history-more-btn');
      if (!card || !list) return;

      if (gachaHistoryEntries.length === 0) {
        card.style.display = 'none';
        return;
      }
      card.style.display = 'block';

      const visible = gachaHistoryEntries.slice(0, gachaHistoryVisibleCount);
      list.innerHTML = visible.map(({ sticker, type, cost, time, isNew }) => {
        const thumb = sticker.photo
          ? `<img src="${sticker.photo}" style="width:20px; height:20px; object-fit:cover; border-radius:6px;">`
          : `<span style="font-size:20px;">${escapeHtml(sticker.emoji || '🦦')}</span>`;
        const color = isNew ? '#C0524A' : '#2F6070';
        return `
        <div style="display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:8px; background:${isNew ? '#FBEAE8' : '#F0F6F8'}; border:1px solid ${color}33;">
          ${thumb}
          <div style="flex:1;">
            <strong style="color:${color};">${isNew ? '🆕 新貼紙' : '重複'}</strong> · ${escapeHtml(sticker.name || '')}
            <div style="color:#7DB8C5; font-size:13px;">${type === 'lucky' ? '🎉 十連抽' : '🎯 抽一次'} · ${time} · -${cost} PTS</div>
          </div>
        </div>`;
      }).join('');

      if (moreBtn) {
        moreBtn.style.display = gachaHistoryEntries.length > gachaHistoryVisibleCount ? 'block' : 'none';
      }
    }

    window.showMoreGachaHistory = function() {
      gachaHistoryVisibleCount += GACHA_HISTORY_PAGE_SIZE;
      renderGachaHistoryList();
    };


    async function broadcastReaction(emoji) {
      if (!window.currentUser || !state.currentRoomId || !window.db) return;
      try {
        const docRef = await window.fs.addDoc(window.fs.collection(window.db, "rooms", state.currentRoomId, "reactions"), {
          uid: window.currentUser.uid,
          emoji,
          timestamp: Date.now()
        });
        // 表情用完即棄，發送後過幾秒自動刪除，避免 Firestore 累積一堆用不到的舊紀錄
        setTimeout(() => {
          window.fs.deleteDoc(docRef).catch(() => {});
        }, 3000);
      } catch (e) {
        console.error("發送表情失敗:", e);
      }
    }

    // 找出某位用家對應的視訊卡片，並在上面播放表情動畫（自己或其他人皆適用）
    function playReactionForUid(uid, emoji) {
      const myUid = window.currentUser ? window.currentUser.uid : null;
      let container;

      if (uid === myUid) {
        container = document.getElementById('sticker-container-box');
      } else {
        const slotNum = state.slotAssignments[uid];
        if (!slotNum) return;
        const el = getSlotElement(slotNum);
        container = el ? el.querySelector('.sticker-container-box') : null;
      }

      spawnSticker(container, emoji);
    }

    // 監聽房間內其他人（包括自己）發送的表情廣播
    function listenToReactions(roomId) {
      if (state.reactionsUnsubscribe) state.reactionsUnsubscribe();

      let isFirstSnapshot = true;
      const reactionsRef = window.fs.collection(window.db, "rooms", roomId, "reactions");
      state.reactionsUnsubscribe = window.fs.onSnapshot(reactionsRef, (snapshot) => {
        if (isFirstSnapshot) {
          isFirstSnapshot = false;
          return; // 唔重播加入房間前已經存在的舊表情紀錄
        }
        snapshot.docChanges().forEach((change) => {
          if (change.type !== 'added') return;
          const data = change.doc.data();
          if (!data.uid || !data.emoji) return;
          playReactionForUid(data.uid, data.emoji);
        });
      });
    }

    // ===================== 好友系統 =====================
    // Firestore 結構：
    //   usernames/{idLower}                → { uid, authEmail, createdAt }（帳號 ID 對應表，兼做登入查詢）
    //   friendRequests/{uidA_uidB}（排序後） → { fromUid, toUid, ...status: pending/accepted/declined }
    //   users/{uid}/friends/{friendUid}     → { uid, loginId, username, addedAt }（雙方各存一份）

    // 兩個 uid 排了序合埋做一個固定的 doc id，等同一對用家之間永遠得返一份
    // 邀請記錄，唔會因為誰先發起而各自開多一份。
    function friendRequestDocId(uidA, uidB) {
      return [uidA, uidB].sort().join('_');
    }
    window.friendRequestDocId = friendRequestDocId;

    // 撳個名／頭像開返呢位用家的資料卡；如果撳的是自己就直接開「我的帳號」，
    // 不用再顯示多一次自己的資料。
    // 記住而家「查看朋友資料卡」個視窗顯示緊邊個 uid，畀 pop-follower-count
    // 嗰粒可撳嘅粉絲數字用（見 getCurrentPopUid() / openFollowListModal()）
    let _popViewUid = null;
    window.getCurrentPopUid = function() { return _popViewUid; };

    async function viewUserProfile(uid) {
      if (!uid) return;
      if (window.currentUser && uid === window.currentUser.uid) {
        if (typeof window.openMyAccountModal === 'function') window.openMyAccountModal();
        return;
      }
      _popViewUid = uid;

      const nameEl = document.getElementById('pop-user-name');
      const actionsEl = document.getElementById('pop-user-friend-actions');
      ['pop-user-avatar','pop-user-school','pop-user-grade','pop-user-fav','pop-user-dislike','pop-user-hours','pop-user-verified'].forEach(id => {
        const el = document.getElementById(id); if (el) el.innerText = '';
      });
      if (nameEl) nameEl.innerText = '載入中…';
      if (actionsEl) actionsEl.innerHTML = '';
      const popFollowWrap = document.getElementById('pop-follow-btn-wrap');
      if (popFollowWrap) popFollowWrap.innerHTML = '';
      const popDiaryWrap = document.getElementById('pop-diary-btn-wrap');
      if (popDiaryWrap) popDiaryWrap.innerHTML = '';
      openModal('modal-view-profile');

      if (!window.db || !window.fs) return;
      try {
        const snap = await window.fs.getDoc(window.fs.doc(window.db, 'users', uid));
        if (!snap.exists()) {
          if (nameEl) nameEl.innerText = '找不到這位使用者';
          return;
        }
        const u = snap.data();
        const avatarEl = document.getElementById('pop-user-avatar');
        if (avatarEl) {
          if (u.avatarBase64) {
            avatarEl.innerHTML = `<img src="${u.avatarBase64}" style="width:100%; height:100%; object-fit:cover; border-radius:50%; cursor:zoom-in;" alt="會員頭像" onclick="openLightbox('${u.avatarBase64}', true)">`;
          } else {
            avatarEl.innerText = (u.username || '同').charAt(0).toUpperCase();
          }
        }
        if (nameEl) nameEl.innerText = u.username || '同學';
        document.getElementById('pop-user-verified').innerText = u.loginId ? ('🆔 ' + u.loginId) : '';
        document.getElementById('pop-user-school').innerText = u.school || '未填寫';
        document.getElementById('pop-user-grade').innerText = u.grade || '未填寫';
        document.getElementById('pop-user-fav').innerText = u.favSubjects || '未填寫';
        document.getElementById('pop-user-dislike').innerText = u.dislikeSubjects || '未填寫';
        document.getElementById('pop-user-hours').innerText = (parseFloat(u.hours) || 0).toFixed(1) + " 小時";
        const popPhotoCountEl = document.getElementById('pop-photo-count');
        if (popPhotoCountEl) popPhotoCountEl.innerText = u.photoCount || 0;
        const popFollowerCountEl = document.getElementById('pop-follower-count');
        if (popFollowerCountEl) popFollowerCountEl.innerText = u.followerCount || 0;
        if (typeof window.renderFollowButton === 'function') await renderFollowButton(uid, u);
        // 完整嘅相片牆搬咗去獨立嘅「溫習日記」分頁顯示，呢度淨係擺一粒
        // 掣，撳落去就去嗰個分頁睇呢位同學嘅溫習日記（見 openDiaryView()）
        if (popDiaryWrap) popDiaryWrap.innerHTML = `<button class="btn btn-outline" type="button" style="width:100%; justify-content:center;" onclick="closeModal('modal-view-profile'); switchTab('diary', null, '${uid}');">📔 查看溫習日記</button>`;
        await renderFriendActionButtons(uid, u);
      } catch (e) {
        console.error('讀取用戶資料失敗:', e);
        if (nameEl) nameEl.innerText = '載入失敗';
      }
    }
    window.viewUserProfile = viewUserProfile;

    // 根據我同呢位用家之間的關係（陌生／已送邀請／等緊我回覆／已經是好友），
    // 在資料卡下面畫返啱的按鈕
    async function renderFriendActionButtons(targetUid, targetUserData) {
      const container = document.getElementById('pop-user-friend-actions');
      if (!container || !window.currentUser || !window.db || !window.fs) return;
      container.innerHTML = '<p style="font-size:13px; color:#999;">載入中好友狀態...</p>';
      try {
        const reqId = friendRequestDocId(window.currentUser.uid, targetUid);
        const [friendSnap, reqSnap] = await Promise.all([
          window.fs.getDoc(window.fs.doc(window.db, 'users', window.currentUser.uid, 'friends', targetUid)),
          window.fs.getDoc(window.fs.doc(window.db, 'friendRequests', reqId))
        ]);

        if (friendSnap.exists()) {
          const safeChatName = (targetUserData.username || '同學').replace(/'/g, "\\'");
          container.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:center; gap:8px; flex-wrap:wrap;">
              <span class="tag" style="background:var(--brand-100); color:var(--brand-700);">👥 已經是好友</span>
              <button class="btn btn-primary" type="button" style="font-size:13px; padding:5px 10px;" onclick="closeModal('modal-view-profile'); window.openChatWindow('${targetUid}', '${safeChatName}')">💬 傳送訊息</button>
              <button class="btn btn-outline" type="button" style="font-size:13px; padding:5px 10px;" onclick="removeFriendAction('${targetUid}')">🗑️ 移除好友</button>
            </div>
          `;
          return;
        }

        const req = reqSnap.exists() ? reqSnap.data() : null;
        if (req && req.status === 'pending') {
          if (req.toUid === window.currentUser.uid) {
            container.innerHTML = `
              <p style="font-size:13px; color:#888; margin-bottom:6px;">對方想加你做好友</p>
              <div style="display:flex; gap:8px; justify-content:center;">
                <button class="btn btn-primary" type="button" onclick="respondFriendRequest('${reqId}', true)">✅ 接受</button>
                <button class="btn btn-outline" type="button" onclick="respondFriendRequest('${reqId}', false)">❌ 拒絕</button>
              </div>
            `;
          } else {
            container.innerHTML = `<span class="tag">⏳ 邀請已送出，等待回覆</span>`;
          }
          return;
        }

        const safeLoginId = (targetUserData.loginId || '').replace(/'/g, "\\'");
        const safeUsername = (targetUserData.username || '').replace(/'/g, "\\'");
        container.innerHTML = `<button class="btn btn-primary" type="button" onclick="sendFriendRequest('${targetUid}', '${safeLoginId}', '${safeUsername}')">🤝 加好友</button>`;
      } catch (e) {
        console.error('讀取好友狀態失敗:', e);
        container.innerHTML = '<p style="font-size:13px; color:#D9764A;">讀取好友狀態失敗</p>';
      }
    }

    window.sendFriendRequest = async function(targetUid, targetLoginId, targetUsername) {
      if (!window.currentUser || !window.db || !window.fs) return;
      if (targetUid === window.currentUser.uid) { window.showToast('不可以將自己加為好友', '😅'); return; }
      const reqId = friendRequestDocId(window.currentUser.uid, targetUid);
      const reqRef = window.fs.doc(window.db, 'friendRequests', reqId);
      try {
        const existing = await window.fs.getDoc(reqRef);
        if (existing.exists() && existing.data().status === 'pending') {
          window.showToast('已經送了邀請，等待對方回覆', 'ℹ️');
          return;
        }
        if (existing.exists() && existing.data().status === 'accepted') {
          window.showToast('你們已經是好友', 'ℹ️');
          return;
        }
        await window.fs.setDoc(reqRef, {
          fromUid: window.currentUser.uid,
          toUid: targetUid,
          fromLoginId: window.currentUser.loginId || '',
          fromUsername: window.currentUser.username || '',
          toLoginId: targetLoginId || '',
          toUsername: targetUsername || '',
          status: 'pending',
          createdAt: Date.now(),
          respondedAt: null
        });
        window.showToast('✅ 好友邀請已送出，等對方接受', '🤝');
        renderFriendActionButtons(targetUid, { loginId: targetLoginId, username: targetUsername });
      } catch (e) {
        window.showToast('送出邀請失敗：' + (e.message || e), '❌');
      }
    };

    window.respondFriendRequest = async function(reqId, accept) {
      if (!window.currentUser || !window.db || !window.fs) return;
      try {
        const reqRef = window.fs.doc(window.db, 'friendRequests', reqId);
        const snap = await window.fs.getDoc(reqRef);
        if (!snap.exists()) return;
        const data = snap.data();
        if (data.toUid !== window.currentUser.uid) return;
        if (accept) {
          const now = Date.now();
          await window.fs.updateDoc(reqRef, { status: 'accepted', respondedAt: now });
          await window.fs.setDoc(window.fs.doc(window.db, 'users', data.toUid, 'friends', data.fromUid), {
            uid: data.fromUid, loginId: data.fromLoginId, username: data.fromUsername, addedAt: now
          });
          await window.fs.setDoc(window.fs.doc(window.db, 'users', data.fromUid, 'friends', data.toUid), {
            uid: data.toUid, loginId: data.toLoginId, username: data.toUsername, addedAt: now
          });
          window.showToast('🎉 已成為好友！', '🤝');
        } else {
          await window.fs.updateDoc(reqRef, { status: 'declined', respondedAt: Date.now() });
          window.showToast('已拒絕邀請', 'ℹ️');
        }
        closeModal('modal-view-profile');
        if (typeof window.loadFriendRequests === 'function') window.loadFriendRequests();
        if (typeof window.loadFriendsList === 'function') window.loadFriendsList();
      } catch (e) {
        window.showToast('操作失敗：' + (e.message || e), '❌');
      }
    };

    window.removeFriendAction = async function(friendUid) {
      if (!window.currentUser || !window.db || !window.fs) return;
      if (!confirm('確定要移除這位好友嗎？')) return;
      try {
        await window.fs.deleteDoc(window.fs.doc(window.db, 'users', window.currentUser.uid, 'friends', friendUid));
        await window.fs.deleteDoc(window.fs.doc(window.db, 'users', friendUid, 'friends', window.currentUser.uid));
        window.showToast('已移除好友', '🗑️');
        closeModal('modal-view-profile');
        if (typeof window.loadFriendsList === 'function') window.loadFriendsList();
      } catch (e) {
        window.showToast('移除失敗：' + (e.message || e), '❌');
      }
    };

    // 「夥伴與讀書會」分頁：用帳號 ID 搜尋朋友
    window.searchAccountById = async function() {
      const input = document.getElementById('friend-search-input');
      const resultEl = document.getElementById('friend-search-result');
      if (!input || !resultEl) return;
      const raw = input.value.trim().replace(/^@/, '');
      if (!raw) return;
      if (!window.currentUser) { openModal('modal-login'); return; }
      if (!window.db || !window.fs) return;
      resultEl.innerHTML = '<p style="font-size:13px; color:#999;">搜尋中...</p>';
      const idLower = raw.toLowerCase();
      try {
        const mapSnap = await window.fs.getDoc(window.fs.doc(window.db, 'usernames', idLower));
        if (!mapSnap.exists()) {
          resultEl.innerHTML = '<p style="font-size:13px; color:#D9764A;">找不到這個帳號 ID，請檢查有沒有打錯</p>';
          return;
        }
        const targetUid = mapSnap.data().uid;
        if (targetUid === window.currentUser.uid) {
          resultEl.innerHTML = '<p style="font-size:13px; color:#999;">這個是你自己的帳號 ID 😄</p>';
          return;
        }
        const userSnap = await window.fs.getDoc(window.fs.doc(window.db, 'users', targetUid));
        if (!userSnap.exists()) {
          resultEl.innerHTML = '<p style="font-size:13px; color:#D9764A;">找不到這位使用者的資料</p>';
          return;
        }
        const u = userSnap.data();
        // 導師帳號唔應該可以透過「用帳號 ID 搜尋朋友」呢個功能搵到——
        // 呢度只係俾學生同學生互加做讀書夥伴用，導師帳號請學生去
        // 「溫習資源」分頁嘅導師名錄度搵。
        if (u.role === 'tutor') {
          resultEl.innerHTML = '<p style="font-size:13px; color:#D9764A;">找不到這個帳號 ID，請檢查有沒有打錯</p>';
          return;
        }
        const levelInfo = calcLevelInfo(u.exp || 0);
        const rank = getRankTitle(levelInfo.level);
        resultEl.innerHTML = `
          <div class="card" style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
            <div style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="viewUserProfile('${targetUid}')">
              <div class="avatar-circle" style="width:40px; height:40px; font-size:16px;">${(u.username||'U').charAt(0).toUpperCase()}</div>
              <div>
                <div style="font-weight:bold; color:var(--brand-800); font-size:14px;">${escapeHtml(u.username||'同學')}</div>
                <div style="font-size:13px; color:#888;">🆔 ${escapeHtml(u.loginId || idLower)}</div>
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
              <div style="text-align:right; font-size:13px; color:#888; line-height:1.5;">
                <div>🎓 ${escapeHtml(u.grade || '未填寫')}</div>
                <div style="color:${rank.color};">${rank.emoji} Lv.${levelInfo.level} ${escapeHtml(rank.title)}</div>
                <div>⏱️ 累積溫習 ${(parseFloat(u.hours) || 0).toFixed(1)} 小時</div>
              </div>
              <button class="btn btn-outline" type="button" style="font-size:13px; padding:5px 10px;" onclick="viewUserProfile('${targetUid}')">看資料 / 加好友</button>
            </div>
          </div>
        `;
      } catch (e) {
        console.error(e);
        resultEl.innerHTML = '<p style="font-size:13px; color:#D9764A;">搜尋失敗，請再試一次</p>';
      }
    };

    window.stopFriendListeners = function() {
      if (typeof friendsListUnsubscribe === 'function') { friendsListUnsubscribe(); friendsListUnsubscribe = null; }
      if (typeof friendRequestsUnsubscribe === 'function') { friendRequestsUnsubscribe(); friendRequestsUnsubscribe = null; }
      [document.getElementById('nav-social-badge'), document.getElementById('home-social-badge')].forEach(badge => {
        if (badge) { badge.style.display = 'none'; badge.innerText = ''; }
      });
      if (typeof window.stopFriendPresenceListeners === 'function') window.stopFriendPresenceListeners();
    };

    // 「夥伴與讀書會」分頁：即時載入我的好友名單
    let friendsListUnsubscribe = null;
    window.friendsListDataCache = [];
    // 呢個監聽器一登入就已經開始咗（見 onAuthStateChanged），成個 session
    // 都會自動同步好友名單，唔理你而家係咪真係企喺「夥伴與讀書會」呢個
    // 分頁度。所以每次撳返呢個分頁再 call 一次呢個函數，其實唔使再拆
    // 咗個監聽器重新裝一次（嗰次多餘嘅網絡來回都幫唔到手，仲會累人多
    // 等一下）——已經訂閱緊嘅話，即刻用返 cache 重畫一次就夠。登出時
    // stopFriendListeners() 會清返 friendsListUnsubscribe，下次登入
    // 先會重新訂閱。
    window.loadFriendsList = function() {
      const container = document.getElementById('friends-list-container');
      const countEl = document.getElementById('friends-count');
      if (!container || !window.currentUser || !window.db || !window.fs) return;
      if (friendsListUnsubscribe) { renderFriendsListRows(); return; }
      friendsListUnsubscribe = window.fs.onSnapshot(
        window.fs.collection(window.db, 'users', window.currentUser.uid, 'friends'),
        (snapshot) => {
          const friends = snapshot.docs.map(d => d.data()).sort((a, b) => (a.username || '').localeCompare(b.username || ''));
          window.friendsListDataCache = friends;
          if (countEl) countEl.innerText = friends.length;
          renderFriendsListRows();
          if (typeof window.startFriendPresenceListeners === 'function') window.startFriendPresenceListeners(friends.map(f => f.uid));
          if (typeof window.renderChatDockPanel === 'function') window.renderChatDockPanel();
        },
        (error) => { console.error('載入好友名單失敗:', error); }
      );
    };

    // 好友名單實際畫出來嗰段，獨立成一個函數：每次好友名單有更新，或者
    // 誰好友的上線狀態有更新，都會 call 這個函數重新畫返成個列表
    function renderFriendsListRows() {
      const container = document.getElementById('friends-list-container');
      if (!container) return;
      const friends = window.friendsListDataCache || [];
      if (friends.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#999; font-size:13px; padding:20px;">尚未有好友，請使用上方的帳號 ID 搜尋並新增幾位！</p>';
        return;
      }
      const presenceMap = window.friendPresenceMap || {};
      container.innerHTML = friends.map(f => {
        const online = typeof window.isUidOnline === 'function' && window.isUidOnline(presenceMap[f.uid]);
        const safeChatName = (f.username || '同學').replace(/'/g, "\\'");
        return `
          <div class="card" style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px;">
            <div style="display:flex; align-items:center; gap:10px; cursor:pointer; min-width:0;" onclick="viewUserProfile('${f.uid}')">
              <div class="avatar-with-dot">
                <div class="avatar-circle" style="width:40px; height:40px; font-size:16px;">${(f.username||'U').charAt(0).toUpperCase()}</div>
                <span class="presence-dot ${online ? 'online' : ''}"></span>
              </div>
              <div style="min-width:0;">
                <div style="font-weight:bold; color:var(--brand-800); font-size:14px;">${escapeHtml(f.username||'同學')} <span style="font-weight:normal; font-size:13px; color:${online ? '#4CAF50' : '#999'};">${online ? '● 在線' : ''}</span></div>
                <div style="font-size:13px; color:#888;">🆔 ${escapeHtml(f.loginId||'')}</div>
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
              <button class="btn btn-outline" type="button" style="font-size:13px; padding:5px 8px;" onclick="window.openChatWindow('${f.uid}', '${safeChatName}')" title="傳送訊息">💬</button>
              <span style="font-size:13px; color:#3E7A8A; cursor:pointer;" onclick="viewUserProfile('${f.uid}')">看資料 ›</span>
            </div>
          </div>
        `;
      }).join('');
    }
    window.renderFriendsListRows = renderFriendsListRows;

    // 「夥伴與讀書會」分頁：即時載入收到的好友邀請。這個 listener 一登入就會
    // 開始監聽（不用等用家真是撳入分頁），等側欄／主頁個「未讀邀請」小紅點
    // 都可以即時反映到，等用家一眼就知道有人加緊自己做好友。
    let friendRequestsUnsubscribe = null;
    // 同 loadFriendsList 一樣：呢個監聽器一登入就已經喺度持續運作緊、
    // 不斷更新緊個紅點同邀請列表（唔理你而家喺唔喺「夥伴與讀書會」呢個
    // 分頁），所以已經訂閱緊嘅話唔使再拆咗重裝一次。
    window.loadFriendRequests = function() {
      if (!window.currentUser || !window.db || !window.fs) return;
      if (friendRequestsUnsubscribe) return;
      const q = window.fs.query(
        window.fs.collection(window.db, 'friendRequests'),
        window.fs.where('toUid', '==', window.currentUser.uid),
        window.fs.where('status', '==', 'pending')
      );
      friendRequestsUnsubscribe = window.fs.onSnapshot(q, (snapshot) => {
        const count = snapshot.size;
        [document.getElementById('nav-social-badge'), document.getElementById('home-social-badge')].forEach(badge => {
          if (!badge) return;
          if (count > 0) { badge.style.display = ''; badge.innerText = count; }
          else { badge.style.display = 'none'; badge.innerText = ''; }
        });

        const card = document.getElementById('friend-requests-card');
        const listEl = document.getElementById('friend-requests-list');
        if (!card || !listEl) return; // 分頁未渲染出來（唔在「夥伴與讀書會」分頁）都唔緊要，個紅點已經更新了
        if (snapshot.empty) {
          card.style.display = 'none';
          listEl.innerHTML = '';
          return;
        }
        card.style.display = '';
        listEl.innerHTML = snapshot.docs.map(d => {
          const r = d.data();
          return `
            <div class="card" style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px; flex-wrap:wrap;">
              <div style="cursor:pointer;" onclick="viewUserProfile('${r.fromUid}')">
                <div style="font-weight:bold; color:var(--brand-800); font-size:14px;">${escapeHtml(r.fromUsername||'同學')}</div>
                <div style="font-size:13px; color:#888;">🆔 ${escapeHtml(r.fromLoginId||'')}</div>
              </div>
              <div style="display:flex; gap:6px;">
                <button class="btn btn-primary" type="button" style="font-size:13px; padding:5px 10px;" onclick="respondFriendRequest('${d.id}', true)">✅ 接受</button>
                <button class="btn btn-outline" type="button" style="font-size:13px; padding:5px 10px;" onclick="respondFriendRequest('${d.id}', false)">❌ 拒絕</button>
              </div>
            </div>
          `;
        }).join('');
      }, (error) => { console.error('載入好友邀請失敗:', error); });
    };

    // ===================== 上線狀態（Presence） =====================
    // Firestore 沒有好似 Realtime Database 那樣有 onDisconnect，所以用「心跳」噉做：
    // 登入之後每 45 秒 update 一次 users/{uid}.lastSeenAt，第二方看你個
    // lastSeenAt 在唔在 2 分鐘之內，就當你「在線」。這個做法不用加多個
    // Firebase 產品，用返現在已經有的 Firestore 就得，代價是「落線」沒有即時
    // 反應（要等心跳過期），對這個 app 的規模來講已經夠用。
    const PRESENCE_HEARTBEAT_MS = 45 * 1000;
    const PRESENCE_ONLINE_THRESHOLD_MS = 2 * 60 * 1000;
    let presenceHeartbeatTimer = null;

    window.isUidOnline = function(lastSeenAt) {
      return !!lastSeenAt && (Date.now() - lastSeenAt) < PRESENCE_ONLINE_THRESHOLD_MS;
    };

    function sendPresenceHeartbeat() {
      if (!window.currentUser || !window.db || !window.fs) return;
      window.fs.updateDoc(window.fs.doc(window.db, 'users', window.currentUser.uid), { lastSeenAt: Date.now() }).catch(() => {});
    }

    function handlePresenceVisibilityChange() {
      if (document.visibilityState !== 'visible') return;
      sendPresenceHeartbeat();
      // 手機瀏覽器（尤其是 iOS Safari）將個分頁擺去背景一輪之後，Firestore
      // 個即時監聽有時會靜靜雞斷了、沒有再收新資料，但又唔會報錯，搞到訊息
      // 話明明送了但對話面板／未讀紅點沒有反應，要用家自己撳一次先「醒返」。
      // 所以每次個分頁翻返做前景，即時對話相關的監聽全部重新訂閱一次，
      // 確保即刻攞到最新資料，不用乾等一個可能已經死了的 listener。
      if (window.currentUser) {
        if (typeof window.startChatDockListener === 'function') window.startChatDockListener();
        if (typeof window.refreshOpenChatWindows === 'function') window.refreshOpenChatWindows();
      }
    }

    window.startPresenceHeartbeat = function() {
      sendPresenceHeartbeat();
      if (presenceHeartbeatTimer) clearInterval(presenceHeartbeatTimer);
      presenceHeartbeatTimer = setInterval(sendPresenceHeartbeat, PRESENCE_HEARTBEAT_MS);
      document.addEventListener('visibilitychange', handlePresenceVisibilityChange);
    };

    window.stopPresenceHeartbeat = function() {
      if (presenceHeartbeatTimer) { clearInterval(presenceHeartbeatTimer); presenceHeartbeatTimer = null; }
      document.removeEventListener('visibilitychange', handlePresenceVisibilityChange);
    };

    // 監聽緊誰好友的上線狀態（逐個 uid 開一個 onSnapshot）。
    //
    // 這裡之前試過改成用 documentId() + 'in' 一次過批量監聽（減少監聽
    // 數量、提升效能），但要令呢種批量查詢在 Firestore 度得到放行，
    // `users` collection 個 `list`（查詢）規則就要對所有已登入用戶開放
    // ——但一旦 `list` 開放，任何人都可以用同一個查詢方式，改用一份
    // 沒有任何篩選的查詢，一次過將全部用戶（email、就讀學校、年級等）
    // 掃出來，形同任由人下載成個用戶資料庫。因為這個 app 的對象是
    // 中學生，考慮到私隱／未成年人資料保護，寧願犧牲少少效能，都要
    // 將 `users` 的 `list` 鎖返給管理員專用，一般用戶只是給他們逐個
    // 已知 uid 那樣讀（`get`），所以這裡改返用逐個好友獨立監聽的做法。
    window.friendPresenceMap = {};
    let friendPresenceUnsubs = {};
    window.startFriendPresenceListeners = function(uids) {
      window.stopFriendPresenceListeners();
      if (!window.db || !window.fs) return;
      (uids || []).forEach(uid => {
        if (!uid || friendPresenceUnsubs[uid]) return;
        friendPresenceUnsubs[uid] = window.fs.onSnapshot(window.fs.doc(window.db, 'users', uid), (snap) => {
          window.friendPresenceMap[uid] = snap.exists() ? (snap.data().lastSeenAt || null) : null;
          if (document.getElementById('friends-list-container')) renderFriendsListRows();
          if (typeof window.renderChatDockPanel === 'function') window.renderChatDockPanel();
          if (typeof window.updateChatWindowPresence === 'function') window.updateChatWindowPresence(uid);
          // 「邀請朋友入房」個彈出視窗如果啱啱開住，都要一齊即時更新返
          // 誰上線／落線，不用閂了再開返先見到最新狀態
          const inviteModalEl = document.getElementById('modal-invite-friend');
          if (inviteModalEl && inviteModalEl.style.display !== 'none' && typeof window.renderInviteFriendListUI === 'function') {
            window.renderInviteFriendListUI();
          }
        }, () => {});
      });
    };
    window.stopFriendPresenceListeners = function() {
      Object.values(friendPresenceUnsubs).forEach(unsub => { if (typeof unsub === 'function') unsub(); });
      friendPresenceUnsubs = {};
      window.friendPresenceMap = {};
    };

    // ===================== 即時對話（好友之間一對一私訊，FB 式浮動視窗） =====================
    // 兩個人的對話用 chatId 識別：將兩個 uid 由細到大排序、用 "_" 連埋一齊
    // （例如 "abc_xyz"）。因為 chatId 本身就包含晒兩個 uid，Firestore 規則
    // 只是憑 documentId 就知道邊兩個人有權限，寫法簡單好多。
    function directChatId(uidA, uidB) {
      return [uidA, uidB].sort().join('_');
    }
    window.directChatId = directChatId;

    let chatOpenWindows = []; // [{ chatId, friendUid, friendUsername, minimized }]
    let chatMessagesUnsubs = {}; // chatId -> unsub
    let chatMessagesCache = {}; // chatId -> 訊息陣列（畫面用）
    let chatDockUnsub = null;
    window.chatDockData = []; // 我每個好友最近一次對話（含未讀數），給 dock panel 用

    const CHAT_MAX_OPEN_WINDOWS_DESKTOP = 3;
    const CHAT_MAX_OPEN_WINDOWS_MOBILE = 1;

    // ===================== 浮動元件可以隨意拖曳（撳掣、對話視窗都得）=====================
    // 用 Pointer Events（滑鼠、觸控都通用）寫一個好簡單、通用的拖曳工具：
    // 拖住誰掣（handleEl）就搬動誰元素（targetEl，一定要是 position:fixed）。
    // 特登分得到「真是拖緊」同「純粹撳一下」——郁得少過 6px 就當是普通
    // click，唔會打斷本身的 onclick（例如撳掣開/閂對話清單、撳 header
    // 縮埋視窗）；郁得多就當真是拖緊，拖完之後會吞了嗰下 click，唔會
    // 又觸發返個掣本身的動作（不是那樣一拖完就即刻彈開/縮埋，好core）。
    function makeDraggable(handleEl, targetEl, opts) {
      opts = opts || {};
      let dragging = false, moved = false, pointerId = null;
      let startX = 0, startY = 0, startLeft = 0, startTop = 0;

      function onPointerDown(e) {
        if (e.button !== undefined && e.button !== 0) return; // 只是應滑鼠左掣/單指拖
        if (opts.shouldIgnore && opts.shouldIgnore(e)) return;
        const rect = targetEl.getBoundingClientRect();
        dragging = true; moved = false; pointerId = e.pointerId;
        startX = e.clientX; startY = e.clientY;
        startLeft = rect.left; startTop = rect.top;
        try { handleEl.setPointerCapture(e.pointerId); } catch (err) {}
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerUp);
      }
      function onPointerMove(e) {
        if (!dragging || e.pointerId !== pointerId) return;
        const dx = e.clientX - startX, dy = e.clientY - startY;
        if (!moved && Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        moved = true;
        const rect = targetEl.getBoundingClientRect();
        const maxLeft = Math.max(4, window.innerWidth - rect.width - 4);
        const maxTop = Math.max(4, window.innerHeight - rect.height - 4);
        const newLeft = Math.min(Math.max(4, startLeft + dx), maxLeft);
        const newTop = Math.min(Math.max(4, startTop + dy), maxTop);
        targetEl.style.left = newLeft + 'px';
        targetEl.style.top = newTop + 'px';
        targetEl.style.right = 'auto';
        targetEl.style.bottom = 'auto';
      }
      function onPointerUp(e) {
        if (!dragging || e.pointerId !== pointerId) return;
        dragging = false;
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('pointercancel', onPointerUp);
        if (moved) {
          if (opts.onDragEnd) opts.onDragEnd(targetEl);
          // 要吞的是「拖完之後、觸發返個 handle 本身動作」嗰下 click（例如
          // 撳掣開/閂對話清單、撳 header 縮埋視窗），唔可以連埋 header
          // 入面的子元素（🗑️／✕這些有自己 onclick 的掣）都一齊吞埋——
          // 這個 listener 用 capture:true 掛在 handle 度，捕捉階段會在
          // 個 click 去到子元素之前就先過一次這裡，如果唔特登過濾走，
          // 拖完隨便撳邊粒子掣都會給這個「食」了，沒有反應。
          const swallow = (ce) => {
            if (opts.shouldIgnore && opts.shouldIgnore(ce)) return;
            ce.stopPropagation(); ce.preventDefault();
          };
          handleEl.addEventListener('click', swallow, { capture: true, once: true });
        }
      }
      handleEl.addEventListener('pointerdown', onPointerDown);
    }
    window.makeDraggable = makeDraggable;

    // 畫面大細一變（例如手機轉橫直），拖到出了界的浮動元件就拉返入來，
    // 唔會給人找唔返或者卡在看唔到的位
    function clampFixedElementToViewport(el) {
      if (!el || !el.style || el.style.left === '' || el.style.left === 'auto') return;
      const rect = el.getBoundingClientRect();
      const maxLeft = Math.max(4, window.innerWidth - rect.width - 4);
      const maxTop = Math.max(4, window.innerHeight - rect.height - 4);
      if (rect.left > maxLeft) el.style.left = maxLeft + 'px';
      if (rect.top > maxTop) el.style.top = maxTop + 'px';
    }
    window.addEventListener('resize', () => {
      const btn = document.getElementById('chat-dock-toggle');
      if (btn) clampFixedElementToViewport(btn);
      document.querySelectorAll('.chat-window').forEach(clampFixedElementToViewport);
    });

    // 💬 掣本身可以拖去螢幕任何位置，放手嗰陣會自動貼返去畫面左邊或右邊
    // （看邊邊近），上下位置就跟返你放低那個位，仲會記落 localStorage，
    // 下次入返來／refresh 都保持在你拖過的位置
    const CHAT_DOCK_POS_KEY = 'concenmate_chatDockTogglePos_v1';
    function saveChatDockTogglePos(side, top) {
      try { localStorage.setItem(CHAT_DOCK_POS_KEY, JSON.stringify({ side, top })); } catch (e) {}
    }
    function loadChatDockTogglePos() {
      try {
        const raw = localStorage.getItem(CHAT_DOCK_POS_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    }
    function applyChatDockTogglePos(btn) {
      const saved = loadChatDockTogglePos();
      if (!saved) return;
      const rect = btn.getBoundingClientRect();
      const top = Math.min(Math.max(4, saved.top), window.innerHeight - rect.height - 4);
      btn.style.top = top + 'px';
      btn.style.bottom = 'auto';
      if (saved.side === 'left') { btn.style.left = '12px'; btn.style.right = 'auto'; }
      else { btn.style.right = '20px'; btn.style.left = 'auto'; }
    }
    function snapChatDockToggleToEdge(btn) {
      const rect = btn.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const side = centerX < window.innerWidth / 2 ? 'left' : 'right';
      const margin = 12;
      if (side === 'left') { btn.style.left = margin + 'px'; btn.style.right = 'auto'; }
      else { btn.style.right = margin + 'px'; btn.style.left = 'auto'; }
      const top = Math.min(Math.max(4, rect.top), window.innerHeight - rect.height - 4);
      btn.style.top = top + 'px';
      btn.style.bottom = 'auto';
      saveChatDockTogglePos(side, top);
    }
    (function initChatDockToggleDrag() {
      const btn = document.getElementById('chat-dock-toggle');
      if (!btn) return;
      applyChatDockTogglePos(btn);
      makeDraggable(btn, btn, {
        onDragEnd: (el) => {
          snapChatDockToggleToEdge(el);
          if (typeof window.positionChatDockPanel === 'function') window.positionChatDockPanel();
        }
      });
    })();

    // 對話清單面板要開在撳掣附近（掣自己都拖得走，面板當然要跟埋去），
    // 唔可以再只是靠寫死的 CSS 位置——每次撳開之前，即時計返個掣現在在
    // 邊，面板就開在他上面（或者下面，如果掣已經好近螢幕頂）、同一邊
    window.positionChatDockPanel = function() {
      const btn = document.getElementById('chat-dock-toggle');
      const panel = document.getElementById('chat-dock-panel');
      if (!btn || !panel) return;
      const btnRect = btn.getBoundingClientRect();
      const panelWidth = Math.min(280, window.innerWidth - 40);
      const panelMaxHeight = 380;
      panel.style.width = panelWidth + 'px';
      const spaceAbove = btnRect.top;
      if (spaceAbove > panelMaxHeight + 20) {
        panel.style.bottom = (window.innerHeight - btnRect.top + 10) + 'px';
        panel.style.top = 'auto';
      } else {
        panel.style.top = (btnRect.bottom + 10) + 'px';
        panel.style.bottom = 'auto';
      }
      const btnCenterX = btnRect.left + btnRect.width / 2;
      if (btnCenterX > window.innerWidth / 2) {
        panel.style.right = Math.max(8, window.innerWidth - btnRect.right) + 'px';
        panel.style.left = 'auto';
      } else {
        panel.style.left = Math.max(8, btnRect.left) + 'px';
        panel.style.right = 'auto';
      }
    };

    window.toggleChatDockPanel = function() {
      const panel = document.getElementById('chat-dock-panel');
      if (!panel) return;
      const showing = panel.style.display === 'flex';
      if (!showing && typeof window.positionChatDockPanel === 'function') window.positionChatDockPanel();
      panel.style.display = showing ? 'none' : 'flex';
      if (!showing) {
        window.renderChatDockPanel();
        // 每次撳開個 dock panel，都額外主動查一次伺服器最新資料（唔只是靠
        // onSnapshot 個 listener）——如果個 realtime listener 因為任何原因
        // （網絡環境、瀏覽器背景分頁等）沒有更新到，這個是多一重保險，等
        // 用家撳開個掣嗰刻起碼一定攞到最新的對話清單
        if (typeof window.forceRefreshChatDock === 'function') window.forceRefreshChatDock();
      }
    };

    // 畫返個「撳掣彈出來」的好友清單：有誰上線行先、最近同誰傾緊偈、
    // 未讀幾多，全部一眼看晒
    window.renderChatDockPanel = function() {
      const listEl = document.getElementById('chat-dock-panel-list');
      if (!listEl || !window.currentUser) return;
      const friends = window.friendsListDataCache || [];
      const friendByUid = {};
      friends.forEach(f => { friendByUid[f.uid] = f; });
      const presenceMap = window.friendPresenceMap || {};

      // 面板只是顯示「真是有對話紀錄」的好友（似 Messenger 的「最近對話」清單），
      // 不是全部好友都會在出現——刪除了的對話（見 clearChatHistory 會將
      // directChats 文件成份刪走）就會自然在這個清單消失。想同未傾過偈的
      // 好友開始新對話，去「夥伴與讀書會」個好友卡撳「💬」就得。
      // 注意：這裡只是要求 chatId/friendUid 存在，唔再要求這個 uid 一定要
      // 在 friendsListDataCache（好友名單）度找到先顯示——因為好友名單同
      // 對話清單是兩條獨立的 Firestore listener，載入快慢唔一定同步，
      // 之前那個做法試過令收到訊息嗰一方（未載入完好友名單）看唔到啱啱
      // 先收到的對話。顯示名／頭像優先用返 c.friendName（傳送訊息嗰陣已經
      // 存埋落 directChats 文件），friendsListDataCache 只是做 fallback。
      const conversations = (window.chatDockData || [])
        .filter(c => !!c.friendUid)
        .slice()
        .sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));

      if (conversations.length === 0) {
        listEl.innerHTML = '<p style="text-align:center; color:#999; font-size:13px; padding:16px;">尚未有任何對話紀錄，請到「夥伴與讀書會」找一位好友按「💬」開始聊天！</p>';
        return;
      }

      // 成個畫面板的過程包多層 try/catch：以前試過如果入面隨便一個步驟
      // 拋錯（例如某個好友資料格式怪怪地），成個 .map() 就會中途中斷，
      // 但因為沒有 catch，個錯誤會靜靜雞消失在 console，listEl.innerHTML
      // 完全沒有更新過，畫面就會一直卡住舊有的（甚至是初始「仲未有對話」）
      // 內容，看落好似「明明有資料但是唔顯示」。現在改成每一行都獨立
      // try/catch，一行有事都唔會拖冧成個清單，仲會在 console 留返線索。
      try {
        listEl.innerHTML = conversations.map(c => {
          try {
            const f = friendByUid[c.friendUid];
            const displayName = c.friendName || (f && f.username) || '同學';
            const online = typeof window.isUidOnline === 'function' && window.isUidOnline(presenceMap[c.friendUid]);
            const unread = c.unread || 0;
            const safeChatName = displayName.replace(/'/g, "\\'");
            return `
              <div class="chat-dock-friend-row" onclick="window.openChatWindow('${c.friendUid}', '${safeChatName}'); window.toggleChatDockPanel();">
                <div class="avatar-with-dot">
                  <div class="avatar-circle" style="width:34px; height:34px; font-size:14px;">${displayName.charAt(0).toUpperCase()}</div>
                  <span class="presence-dot ${online ? 'online' : ''}"></span>
                </div>
                <div style="flex:1; min-width:0;">
                  <div class="chat-dock-friend-name">${escapeHtml(displayName)}</div>
                  <div class="chat-dock-friend-preview">${c.lastMessage ? escapeHtml(c.lastMessage) : '未有對話紀錄'}</div>
                </div>
                ${unread > 0 ? `<span class="chat-dock-friend-unread">${unread > 99 ? '99+' : unread}</span>` : ''}
              </div>
            `;
          } catch (rowErr) {
            console.error('畫單一對話列失敗:', rowErr, c);
            return '';
          }
        }).join('');
      } catch (renderErr) {
        console.error('畫「即時對話」清單失敗:', renderErr);
        listEl.innerHTML = '<p style="text-align:center; color:#e74c3c; font-size:13px; padding:16px;">⚠️ 對話清單畫面出錯，請截圖 console 錯誤訊息給開發者</p>';
      }
    };

    // 監聽晒我所有嘅對話（用嚟計總未讀數畫落個圓形掣嘅紅點，同埋畀 dock
    // panel 顯示最近對話），一登入就開始聽
    // 記住每個對話上一次見到嘅 lastMessageAt，等下面判斷「呢個係咪一個
    // 全新未見過嘅訊息」，先啱彈 toast——唔係就會每次個 listener 一觸發
    // （例如自己標記已讀）都重複彈返同一個通知
    let chatDockKnownLastMessageAt = {};
    // 呢一登入／重新載入之後，第一次攞返對話清單（唔理係 onSnapshot 嘅
    // 第一個 snapshot，定係 forceRefreshChatDock 嗰個一次性 getDocs——
    // 兩者邊個先跑到都得，總之最先嗰次）淨係用嚟起底 baseline，唔應該
    // 彈 toast：如果冇呢個判斷，每次登入都會將全部本身已經睇過嘅舊訊息
    // 當做「啱啱先收到」，彈返晒出嚟。之後（真係即時收到新訊息）先要彈。
    let chatDockBaselineEstablished = false;

    // 將一份 directChats 嘅 query snapshot（唔理係 onSnapshot 定係 getDocs
    // 攞返嚟嘅）轉做 window.chatDockData 呢種畫面用嘅格式，仲會順便處理
    // 「有新訊息就彈 toast」同「更新未讀紅點數字」——抽出嚟做獨立函數，等
    // 即時 listener（startChatDockListener）同手動強制重新整理
    // （forceRefreshChatDock）都用同一套邏輯，唔使兩處各寫一份會走樣。
    function applyChatDockSnapshot(snapshot, myUid) {
      const isBaselineSnapshot = !chatDockBaselineEstablished;
      chatDockBaselineEstablished = true;
      window.chatDockData = snapshot.docs.map(d => {
        const data = d.data();
        const friendUid = (data.participants || []).find(u => u !== myUid);
        // 顯示名優先用返呢份文件本身存埋嘅 participantNames（傳送訊息嗰陣
        // 已經連自己個名同對方個名一齊寫落去），淨係喺舊訊息（呢個機制
        // 加之前留低嘅）冇呢個欄位嗰陣，先 fallback 去好友名單查
        const friendNameFromDoc = data.participantNames && friendUid ? data.participantNames[friendUid] : null;
        return {
          chatId: d.id,
          friendUid,
          friendName: friendNameFromDoc || null,
          lastMessage: data.lastMessage || '',
          lastMessageAt: data.lastMessageAt || 0,
          lastSenderUid: data.lastSenderUid || '',
          unread: (data.unread && data.unread[myUid]) || 0
        };
      });

      // 對方傳咗一則新訊息過嚟（唔係自己送出、亦都未見過）就主動彈個 toast
      // 通知，等用家唔使自己撳返個「💬」先知道有人搵佢；如果對應嘅對話
      // 視窗本身已經開住兼冇縮埋（用家已經睇緊），就唔使再多此一舉彈
      window.chatDockData.forEach(c => {
        const seenAt = chatDockKnownLastMessageAt[c.chatId] || 0;
        if (c.lastMessageAt > seenAt) {
          chatDockKnownLastMessageAt[c.chatId] = c.lastMessageAt;
          // 呢次係登入／重新載入之後嘅第一個 snapshot：淨係記低邊個對話
          // 讀到邊句就算，唔彈 toast（唔係啱啱先收到，係本身就有嘅舊訊息）
          if (isBaselineSnapshot) return;
          if (c.lastSenderUid && c.lastSenderUid !== myUid) {
            const win = chatOpenWindows.find(w => w.chatId === c.chatId);
            if (!win || win.minimized) {
              const friend = (window.friendsListDataCache || []).find(f => f.uid === c.friendUid);
              const friendName = c.friendName || (friend ? friend.username : null) || '朋友';
              window.showToast(`💬 ${friendName}：${c.lastMessage}`, '💬');
            }
          }
        }
      });

      const totalUnread = window.chatDockData.reduce((sum, c) => sum + (c.unread || 0), 0);
      const badge = document.getElementById('chat-dock-badge');
      if (badge) {
        if (totalUnread > 0) { badge.style.display = 'flex'; badge.innerText = totalUnread > 99 ? '99+' : totalUnread; }
        else { badge.style.display = 'none'; }
      }
      // 除錯面板顯示返呢一刻由伺服器實際查到幾多個對話，同埋自己個 uid
      // 前 8 位——如果懷疑對方部機睇唔到訊息，截呢一行畀我睇，就可以知道
      // 究竟係伺服器根本冇呢份文件（0 個對話），定係得返顯示邏輯有問題
      // （明明有幾個對話但畫唔出嚟）
      const dockDebugEl = document.getElementById('chat-dock-debug');
      if (dockDebugEl) {
        dockDebugEl.style.color = '#7DB8C5';
        dockDebugEl.innerText = `${window.chatDockData.length} 個（我 uid: ${myUid.slice(0, 8)}…，${new Date().toLocaleTimeString('zh-HK')}）`;
      }
      window.renderChatDockPanel();
    }

    window.startChatDockListener = function() {
      if (!window.currentUser || !window.db || !window.fs) return;
      if (chatDockUnsub) chatDockUnsub();
      const myUid = window.currentUser.uid;
      const q = window.fs.query(window.fs.collection(window.db, 'directChats'), window.fs.where('participants', 'array-contains', myUid));
      chatDockUnsub = window.fs.onSnapshot(q, (snapshot) => {
        applyChatDockSnapshot(snapshot, myUid);
      }, (err) => {
        console.error('載入對話清單失敗:', err);
        const dockDebugEl = document.getElementById('chat-dock-debug');
        if (dockDebugEl) { dockDebugEl.style.color = '#ff8080'; dockDebugEl.innerText = '❌ 監聽失敗：' + (err.message || err); }
        window.showToast('⚠️ 對話清單監聽失敗：' + (err.message || err), '❌');
      });
    };

    // 手動強行去伺服器攞一次最新嘅對話清單，唔靠個 realtime listener
    // （撳開 dock panel 嗰陣都會自動叫一次）。如果 onSnapshot 因為任何原因
    // 冇更新到（例如背景分頁、網絡狀態切換等），呢個係額外一重保險，
    // 保證用家至少喺撳開個掣嗰刻會攞到伺服器最新資料。
    window.forceRefreshChatDock = async function() {
      if (!window.currentUser || !window.db || !window.fs || typeof window.fs.getDocs !== 'function') return;
      try {
        const myUid = window.currentUser.uid;
        const q = window.fs.query(window.fs.collection(window.db, 'directChats'), window.fs.where('participants', 'array-contains', myUid));
        const snapshot = await window.fs.getDocs(q);
        applyChatDockSnapshot(snapshot, myUid);
      } catch (e) {
        console.error('強制重新整理對話清單失敗:', e);
        const dockDebugEl = document.getElementById('chat-dock-debug');
        if (dockDebugEl) { dockDebugEl.style.color = '#ff8080'; dockDebugEl.innerText = '❌ 強制重整失敗：' + (e.message || e); }
        window.showToast('⚠️ 對話清單強制重整失敗：' + (e.message || e), '❌');
      }
    };

    window.stopChatDockListener = function() {
      if (chatDockUnsub) { chatDockUnsub(); chatDockUnsub = null; }
      window.chatDockData = [];
      chatDockKnownLastMessageAt = {};
      chatDockBaselineEstablished = false;
      const badge = document.getElementById('chat-dock-badge');
      if (badge) badge.style.display = 'none';
    };

    // 開一個對話視窗（右下角）；如果已經開緊就淨係翻返出嚟／取消縮小，
    // 唔會開多個重複視窗。桌面版最多同時開 3 個，手機因為螢幕細，一次淨係
    // 開到 1 個（開新嗰個會自動收埋最舊嗰個）
    window.openChatWindow = function(friendUid, friendUsername) {
      if (!window.currentUser) { openModal('modal-login'); return; }
      if (friendUid === window.currentUser.uid) return;
      const chatId = directChatId(window.currentUser.uid, friendUid);
      let win = chatOpenWindows.find(w => w.chatId === chatId);
      if (win) {
        win.minimized = false;
        renderChatWindowsBar();
        subscribeChatWindowMessages(chatId);
        markChatRead(chatId);
        return;
      }

      const isMobile = window.innerWidth < 640;
      const maxOpen = isMobile ? CHAT_MAX_OPEN_WINDOWS_MOBILE : CHAT_MAX_OPEN_WINDOWS_DESKTOP;
      while (chatOpenWindows.length >= maxOpen) {
        closeChatWindowInternal(chatOpenWindows[0].chatId);
      }

      // posLeft/posTop 一開始係 null，代表仲未計過／未拖過位置，交畀
      // renderChatWindowsBar() 第一次畫呢個視窗嗰陣自動計一個唔會疊晒
      // 一齊嘅預設位（cascade），拖完之後呢兩個欄位就會記低你拖到嗰個位，
      // 之後點樣重畫都唔會彈返去原本位置
      win = { chatId, friendUid, friendUsername: friendUsername || '同學', minimized: false, posLeft: null, posTop: null };
      chatOpenWindows.push(win);
      renderChatWindowsBar();
      subscribeChatWindowMessages(chatId);
      markChatRead(chatId);
    };

    window.closeChatWindow = function(chatId) {
      closeChatWindowInternal(chatId);
    };

    function closeChatWindowInternal(chatId) {
      chatOpenWindows = chatOpenWindows.filter(w => w.chatId !== chatId);
      if (chatMessagesUnsubs[chatId]) { chatMessagesUnsubs[chatId](); delete chatMessagesUnsubs[chatId]; }
      delete chatMessagesCache[chatId];
      renderChatWindowsBar();
    }

    window.toggleMinimizeChatWindow = function(chatId) {
      const win = chatOpenWindows.find(w => w.chatId === chatId);
      if (!win) return;
      win.minimized = !win.minimized;
      renderChatWindowsBar();
      if (!win.minimized) markChatRead(chatId);
    };

    // 對話視窗仲未拖過之前嘅預設位置：由撳掣個位開始，一個一個新視窗
    // 向左疊埋去（好似疊卡片咁），確保唔會成疊晒喺同一個位，亦唔會
    // 超出螢幕範圍
    function computeDefaultChatWindowPos(idx, el) {
      const rect = el.getBoundingClientRect();
      const width = rect.width || 260;
      const height = rect.height || 360;
      const btn = document.getElementById('chat-dock-toggle');
      const btnRect = btn ? btn.getBoundingClientRect() : { left: window.innerWidth - 72, top: window.innerHeight - 152, width: 52 };
      const gap = 10;
      const cascade = idx * 20;
      let left = btnRect.left - width - gap - cascade;
      let top = window.innerHeight - height - 100 - cascade;
      left = Math.min(Math.max(8, left), Math.max(8, window.innerWidth - width - 8));
      top = Math.min(Math.max(8, top), Math.max(8, window.innerHeight - height - 8));
      return { left, top };
    }

    function renderChatWindowsBar() {
      const bar = document.getElementById('chat-windows-bar');
      if (!bar) return;
      const presenceMap = window.friendPresenceMap || {};
      bar.innerHTML = chatOpenWindows.map(w => {
        const online = window.isUidOnline(presenceMap[w.friendUid]);
        return `
          <div class="chat-window ${w.minimized ? 'minimized' : ''}" data-chat-id="${w.chatId}">
            <div class="chat-window-header" onclick="window.toggleMinimizeChatWindow('${w.chatId}')">
              <span class="presence-dot ${online ? 'online' : ''}" style="position:static;"></span>
              <span class="chat-window-title">${escapeHtml(w.friendUsername)}</span>
              <button type="button" class="chat-window-close-btn" title="刪除對話記錄" onclick="event.stopPropagation(); window.clearChatHistory('${w.chatId}')">🗑️</button>
              <button type="button" class="chat-window-close-btn" title="閂視窗" onclick="event.stopPropagation(); window.closeChatWindow('${w.chatId}')">✕</button>
            </div>
            <div class="chat-window-body" id="chat-body-${w.chatId}"></div>
            <div class="chat-window-input-row">
              <input type="text" id="chat-input-${w.chatId}" placeholder="打字傳送訊息..." onkeydown="if(event.key==='Enter'){window.sendChatMessage('${w.chatId}');}">
              <button type="button" onclick="window.sendChatMessage('${w.chatId}')">➤</button>
            </div>
          </div>
        `;
      }).join('');
      // 每個對話視窗自己記住個位置（w.posLeft / w.posTop），畫返出嚟嗰陣
      // 一定要照返個位擺——唔係就會因為（例如）第二個好友上線咁樣觸發
      // 重畫，就將你拖過嘅視窗打返去原本個預設位，好核突。第一次開先會
      // 冇記錄，就用 computeDefaultChatWindowPos() 計一個唔會疊晒一齊嘅
      // 預設位，計完之後即刻記落 w.posLeft/posTop，之後每次重畫都跟返
      // 呢個（除非用家再拖過）。仲會喺個 header 度裝返拖曳功能，撳「🗑️」
      // 「✕」呢兩粒掣就照舊唔郁（shouldIgnore 擋咗），唔會誤觸拖曳。
      chatOpenWindows.forEach((w, idx) => {
        let el = null;
        try { el = bar.querySelector(`.chat-window[data-chat-id="${CSS.escape(w.chatId)}"]`); } catch (e) {}
        if (!el) return;
        if (w.posLeft == null || w.posTop == null) {
          const pos = computeDefaultChatWindowPos(idx, el);
          w.posLeft = pos.left;
          w.posTop = pos.top;
        }
        el.style.left = w.posLeft + 'px';
        el.style.top = w.posTop + 'px';
        const headerEl = el.querySelector('.chat-window-header');
        if (headerEl && typeof window.makeDraggable === 'function') {
          window.makeDraggable(headerEl, el, {
            shouldIgnore: (e) => !!(e.target && e.target.closest && e.target.closest('.chat-window-close-btn')),
            onDragEnd: (targetEl) => {
              const rect = targetEl.getBoundingClientRect();
              w.posLeft = rect.left;
              w.posTop = rect.top;
            }
          });
        }
      });
      // 重畫完個殼之後，即刻用返已有嘅訊息 cache 填返每個視窗嘅內容
      // （唔使重新問 Firestore 攞，減少讀取次數）
      chatOpenWindows.forEach(w => renderChatWindowMessages(w.chatId));
    }

    window.updateChatWindowPresence = function(uid) {
      // 邊個好友嘅上線狀態一變，同佢開緊嘅對話視窗個燈就要跟住變
      const affected = chatOpenWindows.some(w => w.friendUid === uid);
      if (affected) renderChatWindowsBar();
    };

    function subscribeChatWindowMessages(chatId) {
      if (chatMessagesUnsubs[chatId]) return;
      if (!window.db || !window.fs) return;
      const q = window.fs.query(
        window.fs.collection(window.db, 'directChats', chatId, 'messages'),
        window.fs.orderBy('createdAt', 'desc'),
        window.fs.limit(50)
      );
      chatMessagesUnsubs[chatId] = window.fs.onSnapshot(q, (snapshot) => {
        chatMessagesCache[chatId] = snapshot.docs.map(d => d.data()).reverse();
        renderChatWindowMessages(chatId);
        const win = chatOpenWindows.find(w => w.chatId === chatId);
        if (win && !win.minimized) markChatRead(chatId);
      }, (err) => { console.error('載入對話訊息失敗:', err); });
    }

    // 分頁翻返做前景嗰陣，將現正開住嘅每個對話視窗嘅訊息監聽全部強制
    // 重新訂閱一次（先取消再訂閱），確保攞返最新訊息，唔使乾等一個
    // 可能已經喺背景斷咗嘅舊 listener
    window.refreshOpenChatWindows = function() {
      chatOpenWindows.forEach(w => {
        if (chatMessagesUnsubs[w.chatId]) { chatMessagesUnsubs[w.chatId](); delete chatMessagesUnsubs[w.chatId]; }
        subscribeChatWindowMessages(w.chatId);
      });
    };

    function renderChatWindowMessages(chatId) {
      const bodyEl = document.getElementById('chat-body-' + chatId);
      if (!bodyEl || !window.currentUser) return;
      const messages = chatMessagesCache[chatId] || [];
      if (messages.length === 0) {
        bodyEl.innerHTML = '<p style="text-align:center; color:#999; font-size:13px; padding:16px;">開始與這位朋友聊天，打個招呼吧！</p>';
        return;
      }
      const myUid = window.currentUser.uid;
      bodyEl.innerHTML = messages.map(m => `
        <div class="chat-bubble ${m.fromUid === myUid ? 'mine' : 'theirs'}">${escapeHtml(m.text || '')}</div>
      `).join('');
      bodyEl.scrollTop = bodyEl.scrollHeight;
    }

    window.sendChatMessage = async function(chatId) {
      const input = document.getElementById('chat-input-' + chatId);
      if (!input || !window.currentUser || !window.db || !window.fs) return;
      const text = input.value.trim();
      if (!text) return;
      const win = chatOpenWindows.find(w => w.chatId === chatId);
      if (!win) return;
      input.value = '';
      const now = Date.now();
      const myUid = window.currentUser.uid;
      const friendUid = win.friendUid;

      try {
        await window.fs.addDoc(window.fs.collection(window.db, 'directChats', chatId, 'messages'), {
          fromUid: myUid, toUid: friendUid, text, createdAt: now
        });
      } catch (e) {
        window.showToast('訊息傳送失敗：' + (e.message || e), '❌');
        input.value = text; // 送失敗就將打好嘅字放返入輸入框，唔使使用者重打
        return;
      }

      // 訊息本身已經送出成功，下面呢個「對話摘要」（畀 dock panel 顯示最後
      // 一句、未讀數用）就算意外失敗都唔應該話畀用家知「傳送失敗」（訊息
      // 本身冚唔返），所以獨立用多一個 try/catch。但呢份摘要文件正正就係
      // 對方部機用嚟搵返呢個對話（array-contains participants 查詢）嘅
      // 唯一途徑，如果呢步靜靜雞失敗，對方會完全睇唔到呢個對話、連
      // refresh 都冇用（之前試過發生但一直搵唔到證據，因為錯誤淨係印咗
      // 喺 console，用家見唔到）。而家：(1) 失敗會 retry 多一次應付短暫
      // 網絡問題，(2) 兩次都失敗會用 toast 話畀送訊息嗰位知，等下次可以
      // 截圖俾我睇實際錯誤內容嚟斷症。
      const chatSummaryPayload = {
        participants: [myUid, friendUid],
        participantNames: {
          [myUid]: window.currentUser.username || '同學',
          [friendUid]: win.friendUsername || '同學'
        },
        lastMessage: text,
        lastMessageAt: now,
        lastSenderUid: myUid,
        unread: { [friendUid]: window.fs.increment(1), [myUid]: 0 }
      };
      const chatRef = window.fs.doc(window.db, 'directChats', chatId);
      try {
        await window.fs.setDoc(chatRef, chatSummaryPayload, { merge: true });
      } catch (e1) {
        console.error('更新對話摘要失敗（第一次）:', e1);
        try {
          await new Promise(r => setTimeout(r, 800));
          await window.fs.setDoc(chatRef, chatSummaryPayload, { merge: true });
        } catch (e2) {
          console.error('更新對話摘要失敗（重試都失敗）:', e2);
          window.showToast('⚠️ 對話摘要未同步給對方（' + (e2.message || e2) + '），訊息本身已送出', '⚠️');
        }
      }

      // 樂觀更新本機嘅「最近對話」清單，即刻喺 dock panel 見到呢個對話，
      // 唔使淨係靠 Firestore 個 onSnapshot listener 慢慢傳返嚟先識更新
      if (!window.chatDockData) window.chatDockData = [];
      const idx = window.chatDockData.findIndex(c => c.chatId === chatId);
      const patch = { chatId, friendUid, lastMessage: text, lastMessageAt: now, unread: 0 };
      if (idx >= 0) window.chatDockData[idx] = Object.assign({}, window.chatDockData[idx], patch);
      else window.chatDockData.push(patch);
      if (typeof window.renderChatDockPanel === 'function') window.renderChatDockPanel();
    };

    function markChatRead(chatId) {
      if (!window.currentUser || !window.db || !window.fs) return;
      const chatRef = window.fs.doc(window.db, 'directChats', chatId);
      window.fs.updateDoc(chatRef, { ['unread.' + window.currentUser.uid]: 0 }).catch(() => {});
    }

    // 刪除成個對話記錄：兩個人共用同一個對話，撳「🗑️」會即刻刪晒兩個人
    // 嘅所有訊息（唔係淨係自己隱藏），撳之前會 confirm 一次先，避免手震撳錯
    window.clearChatHistory = async function(chatId) {
      if (!window.currentUser || !window.db || !window.fs) return;
      if (!confirm('確定要刪除這個對話的全部訊息記錄？這個動作會影響雙方，刪除後將無法復原。')) return;
      try {
        const msgsSnap = await window.fs.getDocs(window.fs.collection(window.db, 'directChats', chatId, 'messages'));
        await Promise.all(msgsSnap.docs.map(d => window.fs.deleteDoc(d.ref)));
        // 連 directChats 呢份文件本身都一齊刪走（唔係淨係清空欄位），噉樣
        // 個「即時對話」浮動面板嘅「最近對話」清單先會即刻冇咗呢個對話
        // （個清單淨係顯示仲有 directChats 文件嘅好友，見 renderChatDockPanel）
        await window.fs.deleteDoc(window.fs.doc(window.db, 'directChats', chatId));
        chatMessagesCache[chatId] = [];
        renderChatWindowMessages(chatId);
        // 樂觀更新本機嘅「最近對話」清單，即刻喺 dock panel 消失，唔使
        // 淨係靠 Firestore 個 onSnapshot listener 慢慢彈返嚟先識更新
        // （同 sendChatMessage 嗰種樂觀更新做法一致）
        window.chatDockData = (window.chatDockData || []).filter(c => c.chatId !== chatId);
        delete chatDockKnownLastMessageAt[chatId];
        if (typeof window.renderChatDockPanel === 'function') window.renderChatDockPanel();
        const totalUnreadAfterDelete = window.chatDockData.reduce((sum, c) => sum + (c.unread || 0), 0);
        const badgeAfterDelete = document.getElementById('chat-dock-badge');
        if (badgeAfterDelete) {
          if (totalUnreadAfterDelete > 0) { badgeAfterDelete.style.display = 'flex'; badgeAfterDelete.innerText = totalUnreadAfterDelete > 99 ? '99+' : totalUnreadAfterDelete; }
          else { badgeAfterDelete.style.display = 'none'; }
        }
        window.showToast('已刪除對話記錄', '🗑️');
      } catch (e) {
        window.showToast('刪除失敗：' + (e.message || e), '❌');
      }
    };

    // 登出之後要即刻閂晒所有對話視窗（唔應該仲見到啱啱嗰位用家嘅私訊）
    window.closeAllChatWindows = function() {
      chatOpenWindows.forEach(w => { if (chatMessagesUnsubs[w.chatId]) chatMessagesUnsubs[w.chatId](); });
      chatOpenWindows = [];
      chatMessagesUnsubs = {};
      chatMessagesCache = {};
      renderChatWindowsBar();
      const panel = document.getElementById('chat-dock-panel');
      if (panel) panel.style.display = 'none';
    };

    // ===================== 🔗 分享連結邀請（WhatsApp／Instagram 等） =====================
    // 同下面「邀請朋友入房」唔同：呢個唔限於已經加咗做 ConcenMate 好友嘅
    // 人，隨時可以將連結貼去任何社交媒體傳畀任何人，對方撳一下連結、
    // 登入（或註冊）之後就會自動加入返呢間房——見 window.checkJoinRoomHashRoute
    // （app-core.js），呢度淨係負責「整條連結出嚟、分享／複製」呢部分。
    // 兩個掣（分享／複製）共用嘅底層資料：房間連結、連同連結一齊送出嘅文案
    function buildRoomInviteShareData() {
      const roomTitleEl = document.getElementById('active-room-title');
      const roomName = (roomTitleEl && roomTitleEl.innerText) || '溫習室';
      const link = `${window.location.origin}${window.location.pathname}#join-room=${state.currentRoomId}`;
      const text = `誠邀閣下加入 ConcenMate 一同溫習，請按以下連結加入溫習室「${roomName}」：`;
      return { link, text };
    }

    // 「📤 分享連結」：優先叫出裝置本身嘅分享選單（手機上會見到 WhatsApp、
    // Instagram 等已安裝嘅社交 App），冇支援先跌落去自動複製。
    window.shareRoomInviteLink = async function() {
      if (!state.currentRoomId) { window.showToast('請先進入溫習室，方可分享連結', '⚠️'); return; }
      const { link, text } = buildRoomInviteShareData();

      // 手機瀏覽器（同部分電腦瀏覽器）支援 navigator.share，會彈出裝置本身
      // 嘅分享選單，入面就會有 WhatsApp、Instagram 等已安裝嘅社交 App 可以揀。
      if (navigator.share) {
        try {
          await navigator.share({ title: 'ConcenMate 書伴 · 溫習室邀請', text, url: link });
          return; // 用家喺分享選單度揀咗（或者取消咗）都算完成，唔使再做複製那一步
        } catch (e) {
          // 用家自己撳「取消」都會拋呢個 error，唔算真正失敗，跌落去用複製方式頂住
        }
      }
      await copyLinkToClipboard(link, text);
    };

    // 「📋 複製連結」：唔理裝置支唔支援分享選單，一律直接複製到剪貼簿，
    // 保證撳一下就實實在在複製咗，畀用家自己貼去邊個 App 都得。
    window.copyRoomInviteLink = async function() {
      if (!state.currentRoomId) { window.showToast('請先進入溫習室，方可複製連結', '⚠️'); return; }
      const { link, text } = buildRoomInviteShareData();
      await copyLinkToClipboard(link, text);
    };

    async function copyLinkToClipboard(link, text) {
      try {
        await navigator.clipboard.writeText(`${text}\n${link}`);
        window.showToast('連結已複製，請貼上 WhatsApp、Instagram 等傳送予朋友', '📋');
      } catch (e) {
        window.showToast('複製失敗，連結：' + link, '⚠️');
      }
    }

    // ===================== 邀請朋友入房 =====================
    // 邀請有效期：5 分鐘，過咗期就算撳「加入」都會提示過期，唔會直接放行
    const ROOM_INVITE_VALID_MS = 5 * 60 * 1000;

    // 房入面空位卡片撳「邀請朋友」：列出我嘅好友，揀邊個就送個邀請畀佢。
    // 用返「夥伴與讀書會」個好友名單同一套上線狀態顯示（綠點 + 「● 在線」
    // 字樣），等用家一眼就知道邀請緊嘅人係咪真係喺線，唔使估。
    let inviteFriendListCache = [];
    function renderInviteFriendListUI() {
      const listEl = document.getElementById('invite-friend-list');
      if (!listEl) return;
      if (inviteFriendListCache.length === 0) {
        listEl.innerHTML = '<p style="font-size:13px; color:#999; text-align:center; padding:10px 0;">目前並無可邀請之朋友（可能對方已在房內，或閣下尚未加入任何朋友）</p>';
        return;
      }
      const presenceMap = window.friendPresenceMap || {};
      listEl.innerHTML = inviteFriendListCache.map(f => {
        const online = typeof window.isUidOnline === 'function' && window.isUidOnline(presenceMap[f.uid]);
        return `
        <div class="card" style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div class="avatar-with-dot">
              <div class="avatar-circle" style="width:36px; height:36px; font-size:14px;">${(f.username||'U').charAt(0).toUpperCase()}</div>
              <span class="presence-dot ${online ? 'online' : ''}"></span>
            </div>
            <div>
              <div style="font-weight:bold; color:var(--brand-800); font-size:13px;">${escapeHtml(f.username||'同學')} <span style="font-weight:normal; font-size:13px; color:${online ? '#4CAF50' : '#999'};">${online ? '● 在線' : ''}</span></div>
              <div style="font-size:13px; color:#888;">🆔 ${escapeHtml(f.loginId||'')}</div>
            </div>
          </div>
          <button class="btn btn-primary" type="button" style="font-size:13px; padding:5px 10px;" onclick="inviteFriendToRoom('${f.uid}', '${escapeHtml((f.username||'同學')).replace(/'/g, "\\'")}')">📨 邀請</button>
        </div>
      `;
      }).join('');
    }
    window.renderInviteFriendListUI = renderInviteFriendListUI;

    window.openInviteFriendModal = async function() {
      if (!window.currentUser || !window.db || !window.fs) { window.showToast('請先登入', '⚠️'); return; }
      if (!state.currentRoomId) { window.showToast('要在房間入面先可以邀請朋友', '⚠️'); return; }
      const listEl = document.getElementById('invite-friend-list');
      if (!listEl) return;
      listEl.innerHTML = '<p style="font-size:13px; color:#999; text-align:center;">載入中好友名單...</p>';
      openModal('modal-invite-friend');
      try {
        const snap = await window.fs.getDocs(window.fs.collection(window.db, 'users', window.currentUser.uid, 'friends'));
        const alreadyInRoom = new Set(Object.keys(state.slotAssignments));
        alreadyInRoom.add(window.currentUser.uid);
        inviteFriendListCache = snap.docs.map(d => d.data()).filter(f => !alreadyInRoom.has(f.uid));
        renderInviteFriendListUI();
      } catch (e) {
        console.error('載入好友名單失敗:', e);
        listEl.innerHTML = '<p style="font-size:13px; color:#D9764A; text-align:center;">載入失敗，請再試一次</p>';
      }
    };

    // 真正送出邀請：連同而家間房嘅最新資料（房名/科目/時長/房主）一齊寫落 roomInvites，
    // 等對方撳「加入」嗰陣可以直接用呢份資料入返嚟，唔使自己揀返個房間
    window.inviteFriendToRoom = async function(friendUid, friendUsername) {
      if (!window.currentUser || !window.db || !window.fs || !state.currentRoomId) return;
      try {
        const roomSnap = await window.fs.getDoc(window.fs.doc(window.db, 'rooms', state.currentRoomId));
        if (!roomSnap.exists()) { window.showToast('房間已經不存在了', '🚫'); return; }
        const room = roomSnap.data();

        const participantsSnap = await window.fs.getDocs(window.fs.collection(window.db, 'rooms', state.currentRoomId, 'participants'));
        if (participantsSnap.size >= window.ROOM_CAPACITY) {
          window.showToast(`房間已滿（${window.ROOM_CAPACITY}/${window.ROOM_CAPACITY}），暫時無法邀請`, '🚫');
          return;
        }

        const now = Date.now();
        await window.fs.addDoc(window.fs.collection(window.db, 'roomInvites'), {
          roomId: state.currentRoomId,
          roomName: room.name || '溫習房',
          subject: room.subject || '',
          duration: room.duration || 30,
          hostUid: room.hostUid || null,
          hostName: room.hostName || '',
          roomCreatedAt: room.createdAt || now,
          fromUid: window.currentUser.uid,
          fromUsername: window.currentUser.username || '同學',
          toUid: friendUid,
          toUsername: friendUsername || '',
          status: 'pending',
          createdAt: now,
          expiresAt: now + ROOM_INVITE_VALID_MS
        });
        window.showToast(`✅ 已經邀請 ${friendUsername} 入房，等待他回應`, '📨');
        window.closeModal('modal-invite-friend');
      } catch (e) {
        window.showToast('邀請失敗：' + (e.message || e), '❌');
      }
    };

    // 收到邀請嗰陣嘅彈窗提示：一次淨係彈一張卡，如果同時有多過一張邀請就排隊逐張彈
    let pendingInviteQueue = [];
    let inviteModalShowing = false;

    function showNextRoomInvitePopup() {
      if (inviteModalShowing || pendingInviteQueue.length === 0) return;
      const invite = pendingInviteQueue.shift();
      inviteModalShowing = true;
      window._activeRoomInvite = invite;
      const textEl = document.getElementById('invite-popup-text');
      if (textEl) {
        textEl.innerText = `${invite.fromUsername || '朋友'} 邀請你加入「${invite.roomName || '溫習房'}」`;
      }
      openModal('modal-room-invite-popup');
    }

    // 撳「遲啲先諗」：淨係收埋張彈窗，唔會標記接受／拒絕，邀請本身喺 Firestore
    // 度仲係 pending，之後想加入嘅話要叫朋友再邀請一次（因為呢個 listener
    // 淨係喺「新收到」嗰一刻先會再彈一次）
    window.dismissRoomInvitePopup = function() {
      closeModal('modal-room-invite-popup');
      inviteModalShowing = false;
      window._activeRoomInvite = null;
      showNextRoomInvitePopup();
    };

    window.respondRoomInvite = async function(accept) {
      const invite = window._activeRoomInvite;
      closeModal('modal-room-invite-popup');
      inviteModalShowing = false;
      window._activeRoomInvite = null;
      if (!invite || !window.db || !window.fs) { showNextRoomInvitePopup(); return; }

      if (!accept) {
        try {
          await window.fs.updateDoc(window.fs.doc(window.db, 'roomInvites', invite.id), { status: 'declined', respondedAt: Date.now() });
        } catch (e) { /* 拒絕失敗都唔緊要，唔阻住用家 */ }
        window.showToast('已拒絕邀請', 'ℹ️');
        showNextRoomInvitePopup();
        return;
      }

      // 就算已經彈咗出嚟，都要重新核對一次有冇過期先真正放行入房
      if (invite.expiresAt && Date.now() > invite.expiresAt) {
        window.showToast('⌛ 這個邀請已經過期，請朋友重新發送邀請', '⌛');
        try { await window.fs.updateDoc(window.fs.doc(window.db, 'roomInvites', invite.id), { status: 'expired' }); } catch (e) {}
        showNextRoomInvitePopup();
        return;
      }

      try {
        const roomSnap = await window.fs.getDoc(window.fs.doc(window.db, 'rooms', invite.roomId));
        if (!roomSnap.exists()) {
          window.showToast('這個房間已經不存在了', '🚫');
          try { await window.fs.updateDoc(window.fs.doc(window.db, 'roomInvites', invite.id), { status: 'expired' }); } catch (e) {}
          showNextRoomInvitePopup();
          return;
        }
        const room = roomSnap.data();
        await window.fs.updateDoc(window.fs.doc(window.db, 'roomInvites', invite.id), { status: 'accepted', respondedAt: Date.now() });
        const isMyRoom = !!(window.currentUser && room.hostUid === window.currentUser.uid);
        await window.joinPublicRoom(invite.roomId, room.name, room.subject, room.duration, room.hostName, isMyRoom, room.createdAt, room.hostUid);
      } catch (e) {
        window.showToast('加入房間失敗：' + (e.message || e), '❌');
      }
      showNextRoomInvitePopup();
    };

    // 一登入就開始監聽有冇人邀請自己入房（唔使等用家撳入邊個分頁），
    // 逾期先到嘅邀請（例如岩岩上線先收到一個放咗好耐嘅邀請）就靜靜雞標記做
    // expired，唔會再彈出嚟煩住個用家
    let roomInvitesUnsubscribe = null;
    window.loadRoomInvites = function() {
      if (!window.currentUser || !window.db || !window.fs) return;
      if (roomInvitesUnsubscribe) roomInvitesUnsubscribe();
      const q = window.fs.query(
        window.fs.collection(window.db, 'roomInvites'),
        window.fs.where('toUid', '==', window.currentUser.uid),
        window.fs.where('status', '==', 'pending')
      );
      roomInvitesUnsubscribe = window.fs.onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type !== 'added') return;
          const data = change.doc.data();
          const invite = { id: change.doc.id, ...data };
          if (invite.expiresAt && Date.now() > invite.expiresAt) {
            window.fs.updateDoc(window.fs.doc(window.db, 'roomInvites', invite.id), { status: 'expired' }).catch(() => {});
            return;
          }
          pendingInviteQueue.push(invite);
          showNextRoomInvitePopup();
        });
      }, (error) => { console.error('載入房間邀請失敗:', error); });
    };

    window.stopRoomInvitesListener = function() {
      if (typeof roomInvitesUnsubscribe === 'function') { roomInvitesUnsubscribe(); roomInvitesUnsubscribe = null; }
      pendingInviteQueue = [];
      inviteModalShowing = false;
    };

