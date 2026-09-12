// ConcenMate · app-core.js
// ------------------------------------------------------------
// Phase 5（程式碼結構化）第一步：呢個檔案原本係 index.html 入面一個
// <script type="module">…</script> 區塊，而家搬咗出嚟做獨立檔案，用
// <script type="module" src="app-core.js"> 載入，行為完全一樣（module
// script 本身已經係 deferred + 自己一個獨立 scope，搬出嚟唔會影響執行
// 次序或者變數可見範圍）。
//
// 內容包括：Firebase 初始化（Auth／Firestore／Storage）、App Check、
// 大廳房間列表監聽同幽靈房自動清理、登入狀態監聽、電郵驗證流程、個人
// 檔案更新。呢個檔案入面唔係 window.xxx 嘅變數（例如 db、auth、
// firebaseConfig）淨係喺呢個檔案內部用得到——其他分頁用 window.db／
// window.fs／window.storage／window.storageApi 嚟攞返呢度初始化好嘅
// 物件（見底下 window.db = db 等幾句）。
//
// 日後想再抽多啲功能出獨立檔案（例如 room.js、admin.js），可以參考
// 呢個做法：搵一段已經用緊 <script type="module"> 嘅區塊，或者由未來
// 逐步將 index.html 主檔嘅函式改用 import/export 接駁。

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
    import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-check.js";
    import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, deleteUser } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
    import { getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc, collection, onSnapshot, addDoc, getDocs, increment, query, where, orderBy, limit, arrayUnion, arrayRemove, documentId, startAfter } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
    import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

    // 正式站（concenmate.com）用嘅真正 Firebase 專案 —— 有真實學生資料。
    const firebaseConfigProd = {
      apiKey: "AIzaSyDcxw01cH4Xdsp8xK4Xq69lnt3kCsEZTkQ",
      authDomain: "concenmate-app.firebaseapp.com",
      projectId: "concenmate-app",
      storageBucket: "concenmate-app.firebasestorage.app",
      messagingSenderId: "215862346156",
      appId: "1:215862346156:web:1cc2037abde0e5a24cba09",
      measurementId: "G-MJSTJ0KRN6"
    };

    // 開發／測試站用嘅獨立 Firebase 專案（concenmate-dev）—— 完全獨立
    // 嘅資料庫，任何測試都唔會掂到真實學生資料。
    const firebaseConfigDev = {
      apiKey: "AIzaSyCFHVPX_vbOM2sIKstPC-9r9B7wMyuzsFY",
      authDomain: "concenmate-dev.firebaseapp.com",
      projectId: "concenmate-dev",
      storageBucket: "concenmate-dev.firebasestorage.app",
      messagingSenderId: "85883990627",
      appId: "1:85883990627:web:eb9194378888c3f3dfbe56"
    };

    // window.IS_PROD_SITE 喺檔案最頭已經根據網址判斷咗（見 <head> 入面
    // 「環境判斷」嗰段），呢度淨係揀返啱嘅設定用。
    const firebaseConfig = window.IS_PROD_SITE ? firebaseConfigProd : firebaseConfigDev;

    const app = initializeApp(firebaseConfig);

    // ── App Check（Phase 4 安全硬化）──────────────────────────
    // 兩個環境分別用返自己獨立嘅 reCAPTCHA Enterprise 金鑰（喺
    // Google Cloud Console → Fraud Defense 度建立），令 Storage／
    // Firestore 淨係接受「真係嚟自呢個 app」嘅請求，擋走人哋直接
    // 打 API 嘅嘗試。呢個過程對用戶完全透明，唔會見到任何驗證方塊。
    const APP_CHECK_SITE_KEY_PROD = "6Lcv77QtAAAAAJZug6sVl1c9kGfo5WysiYdj8XL0"; // concenmate-app-web
    const APP_CHECK_SITE_KEY_DEV  = "6LdvC7UtAAAAALix2ouHlGXFLZ17zQpsqQX7kNXc"; // concenmate-dev-web
    const appCheckSiteKey = window.IS_PROD_SITE ? APP_CHECK_SITE_KEY_PROD : APP_CHECK_SITE_KEY_DEV;
    try {
      initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: true
      });
    } catch (e) {
      console.warn('App Check 初始化失敗（唔會影響其他功能，但保護力會減弱）:', e);
    }

    const auth = getAuth(app);
    const db = getFirestore(app);
    const storage = getStorage(app);

    window.db = db;
    window.fs = { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, onSnapshot, addDoc, getDocs, increment, query, where, orderBy, limit, arrayUnion, arrayRemove, documentId, startAfter };
    window.storage = storage;
    window.storageApi = { ref: storageRef, uploadBytes, getDownloadURL, deleteObject };

    // 幽靈房自動清理：房間冇人心跳（見 updateRoomHeartbeat）超過呢個時間，
    // 就當佢係冇人打理嘅幽靈房（例如房主手機突然關機、瀏覽器崩潰，嚟唔切
    // 觸發正常嘅退房流程），下次有人打開大廳就會順手刪走，唔使等房主親自嚟關。
    const ROOM_STALE_MS = 5 * 60 * 1000; // 5 分鐘

    // 幽靈房快速清理：如果房間人數已經跌返 0/4（例如最後一個人直接關咗
    // 瀏覽器，冇正式觸發退房流程），唔使等到成 5 分鐘冇心跳先清走，只要
    // 過咗一個短緩衝期（避開啱啱建立房間、host 仲未真正加入嗰陣一閃即
    // 逝嘅 0 人狀態，見 handleCreateRoomSubmit／joinRoomParticipants）就
    // 即刻清，唔留低「🟢 直播中」但其實已經冇人嘅幽靈房卡喺大廳。
    // ⚠️ 呢個快速清理需要 Firestore 安全規則配合先真正得——目前
    // rooms/{roomId} 嘅 delete 規則淨係容許房主本人即時刪，或者任何人喺
    // 房間已經 5 分鐘冇心跳之後先可以刪。要令非房主用家都可以「即刻」刪走
    // 一間 0 人嘅房，需要手動喺 Firebase Console 幫個 delete 規則加多一個
    // 條件（記得連同你其他 collection 嘅規則一齊保留，唔好覆蓋走）：
    //   resource.data.participantCount is number && resource.data.participantCount <= 0
    // 冇加呢條規則之前，呢個快速清理喺「執行緊清理嗰個人啱啱好就係房主」
    // 先會成功；如果唔係房主，Firestore 會拒絕呢次刪除，而個房照舊會喺
    // 現有嘅 5 分鐘冇心跳機制之下自動清走（唔會即刻，但仍然會自動清）。
    const EMPTY_ROOM_GRACE_MS = 20 * 1000; // 20 秒緩衝期
    let lastGcAttempt = 0;
    async function gcStaleRooms(roomEntries) {
      const now = Date.now();
      if (now - lastGcAttempt < 60 * 1000) return; // 至多每分鐘掃一次，避免頻繁寫入
      lastGcAttempt = now;
      for (const { id, data } of roomEntries) {
        const lastActive = typeof data.lastActiveAt === 'number'
          ? data.lastActiveAt
          : (typeof data.createdAt === 'number' ? data.createdAt : 0);
        const createdAt = typeof data.createdAt === 'number' ? data.createdAt : lastActive;
        const isStale = !!(lastActive && (now - lastActive > ROOM_STALE_MS));
        const isEmptyPastGrace = typeof data.participantCount === 'number' && data.participantCount <= 0
          && !!createdAt && (now - createdAt > EMPTY_ROOM_GRACE_MS);
        if (isStale || isEmptyPastGrace) {
          try { await deleteDoc(doc(db, "rooms", id)); } catch (e) { /* 可能已經被其他人清走，或者權限未足夠，忽略 */ }
        }
      }
    }

    // 大廳嘅學科分類 Tab：淨係揀「全部」或者其中一個學科（中文/英文/數學/公民/選修）。
    // 房間資料本身淨係靠 Firestore 一條 listener 攞（見 listenToPublicRooms），
    // 撳唔同 Tab 淨係喺已經攞落嚟嘅資料度做本機篩選，唔使開多條連線。
    let latestRoomsData = [];
    let roomSubjectFilter = '全部';

    window.setRoomSubjectFilter = function(subject) {
      roomSubjectFilter = subject;
      document.querySelectorAll('.room-subject-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.subject === subject);
      });
      renderPublicRoomsList();
    };

    function renderPublicRoomsList() {
      const roomsListEl = document.getElementById('public-rooms-container');
      if (!roomsListEl) return;

      const filtered = roomSubjectFilter === '全部'
        ? latestRoomsData
        : latestRoomsData.filter(r => r.room.subject === roomSubjectFilter);

      if (filtered.length === 0) {
        roomsListEl.innerHTML = `
          <div style="grid-column: 1 / -1; text-align:center; padding: 40px; background: white; border-radius: 16px; border: 1px solid var(--brand-200);">
            <div style="font-size:36px; margin-bottom:8px;">🦦📭</div>
            <p style="font-size:13px; font-weight:bold; color:var(--brand-800);">${roomSubjectFilter === '全部' ? '目前大廳沒有公開的溫習房' : `目前「${window.escapeHtml(roomSubjectFilter)}」分類沒有公開的溫習房`}</p>
            <p style="font-size:13px; color:#666; margin-top:4px;">點擊上方「+ 建立新溫習房」來開立第一個房間吧！</p>
          </div>
        `;
        return;
      }

      roomsListEl.innerHTML = filtered.map(({ id: roomId, room, createdAtMs, isMyRoom }) => `
        <div class="room-item-card">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
              <span class="tag" style="background:#F0F6F8; color:#1E4550;">${window.escapeHtml(room.subject || '數學')}</span>
              <span style="font-size:13px; color:#3E7A8A; font-weight:bold;">🟢 直播中</span>
            </div>
            <h4 style="font-size:14px; font-weight:bold; color:var(--brand-800); margin-bottom:4px;">${window.escapeHtml(room.name)}</h4>
            <p style="font-size:13px; color:#666;">房主：<strong>${window.escapeHtml(room.hostName || '匿名同學')}</strong></p>
            <p style="font-size:13px; color:#888; margin-top:2px;">👥 ${room.participantCount || 0}/${window.ROOM_CAPACITY || 4} 人 · 🍅 每輪專注：${room.duration || 30} 分鐘</p>
          </div>

          <div style="display:flex; gap:6px; margin-top:12px;">
            <button class="btn btn-primary" style="flex:1; justify-content:center; font-size:13px; padding:6px;" onclick="joinPublicRoom('${roomId}', '${room.name.replace(/'/g, "\\'")}', '${room.subject}', ${room.duration}, '${room.hostName}', ${isMyRoom}, ${createdAtMs}, '${room.hostUid || ''}')">
              🚪 加入房間
            </button>
            ${isMyRoom ? `<button class="btn btn-red" style="font-size:13px; padding:6px;" onclick="deleteRoomQuick('${roomId}')">刪除</button>` : ''}
          </div>
        </div>
      `).join('');
    }

    let unsubscribeRooms = null;
    let suspensionListenerUnsubscribe = null;

    // 效能優化：以前呢個 listener 冇上限咁監聽成個 rooms collection，
    // 用得越耐、（未清走嘅幽靈）房越多，每次房間心跳更新（每 45 秒一次）
    // 都要重新處理成個 collection 兼重畫成個大廳清單，會越用越慢。而家
    // 改成淨係揀最近有活動嘅頭 ROOMS_LISTEN_LIMIT 間房（用 lastActiveAt
    // 排序），大廳一定睇到最新嘅房，同埋唔理房間數量點樣增長，監聽同
    // 渲染嘅負擔都封頂喺呢個數目。
    const ROOMS_LISTEN_LIMIT = 40;

    // 效能優化：房間心跳更新頻密（每 45 秒一房），如果好多間房幾乎同
    // 一時間更新，以前會觸發同樣多次嘅成個大廳重畫。而家用一個好短嘅
    // debounce（收到之後等一陣，期間嘅重複觸發都合埋一齊），確保短時間
    // 內嚟幾多次更新，都淨係實際重畫一次。
    let renderPublicRoomsListTimer = null;
    function scheduleRenderPublicRoomsList() {
      if (renderPublicRoomsListTimer) return;
      renderPublicRoomsListTimer = setTimeout(() => {
        renderPublicRoomsListTimer = null;
        renderPublicRoomsList();
      }, 400);
    }

    function listenToPublicRooms() {
      if (unsubscribeRooms) unsubscribeRooms();

      const roomsRef = query(collection(db, "rooms"), orderBy("lastActiveAt", "desc"), limit(ROOMS_LISTEN_LIMIT));
      unsubscribeRooms = onSnapshot(roomsRef, (snapshot) => {
        // 順手掃一次有冇幽靈房（心跳過期），唔使阻住畫面渲染
        gcStaleRooms(snapshot.docs.map(d => ({ id: d.id, data: d.data() })));

        latestRoomsData = snapshot.docs.map((roomDoc) => {
          const room = roomDoc.data();
          const roomId = roomDoc.id;
          const isMyRoom = window.currentUser && room.hostUid === window.currentUser.uid;
          // 兼容修復前用 ISO 字串儲存嘅 createdAt（舊房間），統一轉做數字 timestamp
          let createdAtMs = 0;
          if (typeof room.createdAt === 'number') {
            createdAtMs = room.createdAt;
          } else if (room.createdAt) {
            const parsed = new Date(room.createdAt).getTime();
            createdAtMs = isNaN(parsed) ? 0 : parsed;
          }
          return { id: roomId, room, createdAtMs, isMyRoom };
        });

        scheduleRenderPublicRoomsList();
      }, (error) => {
        console.error("監聽公開房間失敗:", error);
      });
    }

    onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        try {
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            window.currentUser = userDoc.data();
          } else {
            window.currentUser = {
              uid: user.uid,
              email: user.email,
              username: user.email.split('@')[0],
              school: '未設定',
              grade: '中六 (S6 DSE)',
              hours: '0.0',
              points: 0,
              exp: 0
            };
          }
        } catch (e) {
          console.error("讀取用戶 Firebase 資料失敗:", e);
        }

        // 停權檢查：管理員可以喺「管理後台 → 用戶管理」停權濫用嘅帳戶，
        // 一旦帳戶被停權，登入嗰刻即刻強制登出，唔可以再用。signOut() 會
        // 觸發多一次 onAuthStateChanged（user=null），到時先處理登出後
        // 嘅畫面更新，所以呢度可以直接 return。
        if (window.currentUser && window.currentUser.suspended) {
          window.showToast('你的帳戶已被管理員停權，如有疑問請聯絡管理員', '🚫');
          await signOut(auth);
          return;
        }

        // 即時停權監聽：管理員喺後台撳「停權」嗰刻，唔使等呢個用戶下次
        // 登入先生效——直接監聽緊自己嗰份 users/{uid} 文件，一見到
        // suspended 變咗 true 就即刻強制登出，唔理佢而家仲喺唔喺線
        // （例如仲留喺視訊溫習室入面）都會即時被踢出登入狀態。
        if (suspensionListenerUnsubscribe) { suspensionListenerUnsubscribe(); suspensionListenerUnsubscribe = null; }
        suspensionListenerUnsubscribe = onSnapshot(userDocRef, async (snap) => {
          if (snap.exists() && snap.data().suspended && window.currentUser) {
            window.showToast('你的帳戶已被管理員停權，即將登出', '🚫');
            if (suspensionListenerUnsubscribe) { suspensionListenerUnsubscribe(); suspensionListenerUnsubscribe = null; }
            // 如果仲留喺視訊溫習室入面（例如房主俾人喺後台停權嗰刻仲喺度
            // 直播緊），一定要喺 signOut() 之前（趁認證仲有效）行齊「離開
            // 房間」嗰套清理流程，唔係個 participants 紀錄會冇人清走，
            // 個位會一直留喺房度、其他人望落去仲以為佢喺度（見返呢個
            // bug 之前嘅截圖：Test1 俾停權登出咗，個視訊格仍然留低）
            if (typeof state !== 'undefined' && state.currentRoomId && typeof doLeaveRoom === 'function') {
              try { await doLeaveRoom(false); } catch (e) { console.error('停權時自動退出房間失敗:', e); }
            }
            signOut(auth);
          }
        }, (err) => {
          console.error('監聽帳戶停權狀態失敗:', err);
        });

        listenToPublicRooms();
        if (typeof window.loadFriendRequests === 'function') {
          window.loadFriendRequests();
        }
        // 好友名單一登入就要即刻載入（唔使等用家真係撳入「夥伴與讀書會」
        // 分頁），因為即時對話個「💬」浮動掣同上線狀態全站都要用到呢份資料
        if (typeof window.loadFriendsList === 'function') {
          window.loadFriendsList();
        }
        if (typeof window.loadRoomInvites === 'function') {
          window.loadRoomInvites();
        }
        if (typeof window.loadGachaConfigFromFirestore === 'function') {
          window.loadGachaConfigFromFirestore();
        }
        if (typeof window.loadLevelConfigFromFirestore === 'function') {
          window.loadLevelConfigFromFirestore();
        }
        if (typeof window.loadAdminIdsFromFirestore === 'function') {
          window.loadAdminIdsFromFirestore();
        }
      } else {
        window.currentUser = null;
        if (suspensionListenerUnsubscribe) { suspensionListenerUnsubscribe(); suspensionListenerUnsubscribe = null; }
      }
      if (typeof window.updateUserAuthUI === 'function') {
        window.updateUserAuthUI();
      }
      if (typeof window.updateAdminEntryButton === 'function') {
        window.updateAdminEntryButton();
      }
      if (typeof window.checkAdminHashRoute === 'function') {
        window.checkAdminHashRoute();
      }
      if (typeof window.checkEmailVerifyHashRoute === 'function') {
        window.checkEmailVerifyHashRoute();
      }
      if (typeof window.checkJoinRoomHashRoute === 'function') {
        window.checkJoinRoomHashRoute();
      }
    });

    // ===================== 📧 電郵驗證 =====================
    // 帳號 ID 登入本身完全唔變——用戶始終係用帳號 ID + 密碼登入，呢個
    // 「電郵驗證」淨係額外驗證緊 profileData.contactEmail（用戶自己填嘅
    // 聯絡電郵）係咪佢哋真係擁有嘅電郵，同 Firebase Auth 內部用嗰個合成
    // email 完全冇關係、唔會影響返登入方式。
    //
    // 做法：註冊（或者之後改電郵）嗰陣產生一個隨機 token，存落
    // users/{uid}.emailVerifyToken，經 EmailJS 寄一個帶住呢個 token 嘅
    // 連結（#verify-email=uid:token）去用戶個電郵信箱。用戶撳個連結
    // 開返個網站，程式會檢查而家登入緊嗰個帳戶係咪岩岩好個 uid、token
    // 啱唔啱，啱先寫 emailVerified: true。因為冇後端，寫入呢步一定要
    // 用戶本人登入緊先做得到（Firestore 規則淨係俾用戶自己改自己嘅
    // users/{uid} 文件）。
    function generateVerifyToken() {
      const bytes = new Uint8Array(24);
      (window.crypto || window.msCrypto).getRandomValues(bytes);
      return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    }

    window.sendVerificationEmail = async function(toEmail, username, uid, token) {
      if (!toEmail) return;
      if (!window.EMAILJS_CONFIGURED || typeof emailjs === 'undefined') {
        console.warn('EmailJS 未設定，沒有寄到驗證電郵給', toEmail, '（見 index.html 頭段「電郵驗證設定」）');
        return;
      }
      const verifyLink = `${window.location.origin}${window.location.pathname}#verify-email=${uid}:${token}`;
      try {
        await emailjs.send(window.EMAILJS_SERVICE_ID, window.EMAILJS_TEMPLATE_ID, {
          to_email: toEmail,
          to_name: username || '同學',
          verify_link: verifyLink
        });
      } catch (e) {
        console.error('寄驗證電郵失敗:', e);
      }
    };

    // 撳完驗證連結、開返網站之後嘅處理：一登入（或者本身已經登入緊）
    // 就會 call 一次，睇下網址個 hash 有冇帶住驗證資訊
    window.checkEmailVerifyHashRoute = async function() {
      const match = (window.location.hash || '').match(/^#verify-email=([^:]+):([0-9a-f]+)$/);
      if (!match) return;
      const [, linkUid, token] = match;
      if (!window.currentUser) {
        window.showToast('請先用返那個帳戶登入，先可以完成電郵驗證', '⚠️');
        return;
      }
      if (window.currentUser.uid !== linkUid) {
        window.showToast('這個驗證連結屬於另一個帳戶，請登出並改用那個帳戶登入', '⚠️');
        return;
      }
      if (window.currentUser.emailVerified) {
        window.location.hash = '';
        return;
      }
      if (window.currentUser.emailVerifyToken !== token) {
        window.showToast('這個驗證連結已經失效，可以在「編輯個人資料」度重新發送', '⚠️');
        window.location.hash = '';
        return;
      }
      try {
        await updateDoc(doc(db, 'users', linkUid), { emailVerified: true, emailVerifyToken: null });
        window.currentUser.emailVerified = true;
        window.currentUser.emailVerifyToken = null;
        window.showToast('🎉 電郵驗證成功！', '✅');
        if (typeof window.updateProfileEmailVerifyUI === 'function') window.updateProfileEmailVerifyUI();
        // 驗證完成即刻解鎖返個 app，唔使用戶自己再撳多次「重新整理」
        if (typeof window.updateUserAuthUI === 'function') window.updateUserAuthUI();
      } catch (e) {
        window.showToast('驗證失敗：' + (e.message || e), '❌');
      }
      window.location.hash = '';
    };
    window.addEventListener('hashchange', () => { window.checkEmailVerifyHashRoute(); });

    // ===================== 🔗 分享連結邀請入房 =====================
    // 撳完（WhatsApp／Instagram 等社交媒體傳過嚟嘅）連結 #join-room=<roomId>
    // 開返網站之後嘅處理——同電郵驗證嗰個 #verify-email= 用返一樣嘅「hash
    // route」做法：登入狀態一有變、或者 hash 一改變都check 一次，未登入
    // 就叫佢先登入（hash 冇被清走，登入完成之後 onAuthStateChanged 會自動
    // 再 check 多一次，唔使朋友自己記得再撳多次連結）。
    window.checkJoinRoomHashRoute = async function() {
      const match = (window.location.hash || '').match(/^#join-room=([A-Za-z0-9_-]+)$/);
      if (!match) return;
      const roomId = match[1];
      if (!window.currentUser) {
        window.showToast('請先登入或註冊帳戶，先可以加入呢間溫習室', '⚠️');
        return; // 特登唔清走個 hash，等登入完成之後可以自動重試
      }
      try {
        const roomSnap = await getDoc(doc(db, 'rooms', roomId));
        if (!roomSnap.exists()) {
          window.showToast('呢個溫習室已經唔存在（可能已經解散或者連結已經失效）', '🚫');
          window.location.hash = '';
          return;
        }
        const room = roomSnap.data();
        let createdAtMs = 0;
        if (typeof room.createdAt === 'number') {
          createdAtMs = room.createdAt;
        } else if (room.createdAt) {
          const parsed = new Date(room.createdAt).getTime();
          createdAtMs = isNaN(parsed) ? 0 : parsed;
        }
        const isMyRoom = !!(window.currentUser && room.hostUid === window.currentUser.uid);
        window.location.hash = ''; // 先清走 hash，避免加入失敗／人數已滿之後撳其他連結又再彈返一次
        if (typeof window.joinPublicRoom === 'function') {
          await window.joinPublicRoom(roomId, room.name, room.subject, room.duration, room.hostName, isMyRoom, createdAtMs, room.hostUid || '');
        }
      } catch (e) {
        console.error('經分享連結加入房間失敗:', e);
        window.showToast('加入房間失敗，請再試一次', '❌');
        window.location.hash = '';
      }
    };
    window.addEventListener('hashchange', () => { window.checkJoinRoomHashRoute(); });

    // 「編輯個人資料」度嘅「重新發送驗證電郵」掣：改咗電郵、或者第一封
    // 冇收到，都可以隨時重新整多個新 token 再寄一次
    window.resendVerificationEmail = async function() {
      if (!window.currentUser || !auth.currentUser) return;
      const toEmail = window.currentUser.contactEmail;
      if (!toEmail) { window.showToast('請先在上面填返個電郵地址，再撳「儲存修改資料」', '⚠️'); return; }
      const btn = document.getElementById('resend-verify-email-btn');
      if (btn) { btn.disabled = true; btn.innerText = '⏳ 發送緊...'; }
      try {
        const token = generateVerifyToken();
        await updateDoc(doc(db, 'users', auth.currentUser.uid), { emailVerifyToken: token, emailVerified: false });
        window.currentUser.emailVerifyToken = token;
        window.currentUser.emailVerified = false;
        await window.sendVerificationEmail(toEmail, window.currentUser.username, auth.currentUser.uid, token);
        window.showToast('已重新發送驗證電郵，記得check下你個信箱（連埋垃圾郵件夾）', '📧');
        if (typeof window.updateProfileEmailVerifyUI === 'function') window.updateProfileEmailVerifyUI();
      } catch (e) {
        window.showToast('發送失敗：' + (e.message || e), '❌');
      } finally {
        if (btn) { btn.disabled = false; btn.innerText = '📧 重新發送驗證電郵'; }
      }
    };

    // 「請先驗證電郵」鎖畫面度嘅「已經驗證咗，重新整理」掣：因為驗證
    // 連結可能喺第二個分頁／裝置撳嘅，呢邊個 window.currentUser 未必
    // 即時知道，所以要重新去 Firestore 攞返最新狀態先可以判斷解唔解鎖
    window.recheckEmailVerification = async function() {
      if (!window.currentUser || !auth.currentUser) return;
      try {
        const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (snap.exists()) {
          window.currentUser = snap.data();
        }
        if (window.currentUser.emailVerified) {
          window.showToast('🎉 電郵已驗證，歡迎使用 ConcenMate！', '✅');
        } else {
          window.showToast('都仲未驗證到喎，記得check清楚封信、撳埋入面個連結', '📧');
        }
        window.updateUserAuthUI();
      } catch (e) {
        window.showToast('檢查失敗：' + (e.message || e), '❌');
      }
    };

    // 「編輯個人資料」表格入面，聯絡電郵嗰行嘅「已驗證／未驗證」徽章、
    // 同「重新發送驗證電郵」掣，跟返 window.currentUser 現時嘅狀態嚟畫
    window.updateProfileEmailVerifyUI = function() {
      const emailInput = document.getElementById('prof-contact-email');
      const badge = document.getElementById('prof-email-verify-badge');
      const resendBtn = document.getElementById('resend-verify-email-btn');
      if (!emailInput || !badge || !resendBtn || !window.currentUser) return;

      emailInput.value = window.currentUser.contactEmail || '';

      if (!window.currentUser.contactEmail) {
        badge.innerText = '';
        badge.style.background = 'transparent';
        resendBtn.style.display = 'none';
      } else if (window.currentUser.emailVerified) {
        badge.innerText = '✅ 已驗證';
        badge.style.background = '#DFF3E3';
        badge.style.color = '#2A7A46';
        resendBtn.style.display = 'none';
      } else {
        badge.innerText = '⚠️ 未驗證';
        badge.style.background = '#FDECEA';
        badge.style.color = '#C0392B';
        resendBtn.style.display = 'inline-block';
      }
    };

    // 帳號 ID 登入制度：Firebase Auth 本身淨係支援電郵/密碼，冇「用戶名登入」
    // 呢種 provider，所以做法係：每個帳號 ID 背後仍然對應一個真正嘅 Firebase
    // Auth email——新帳號用合成嘅 `{id}@concenmate.local`（唔係真實可送達
    // 嘅電郵，純粹畀 Firebase Auth 內部識別用）；`usernames/{idLower}` 呢個
    // 頂層 collection 就做「ID → { uid, authEmail }」嘅對應表，登入嗰陣先
    // 查呢個表攞返 authEmail，先至真正用嚟 signInWithEmailAndPassword。
    window.registerWithFirebase = async function(loginId, password, profileData) {
      const idLower = loginId.toLowerCase();

      let existing;
      try {
        existing = await getDoc(doc(db, 'usernames', idLower));
      } catch (e) {
        window.showToast('檢查帳號 ID 失敗，請檢查網絡連線後再試', '❌');
        return;
      }
      if (existing.exists()) {
        window.showToast('這個帳號 ID 已經有人用了，換一個啦', '⚠️');
        return;
      }

      const authEmail = `${idLower}@concenmate.local`;
      let userCredential;
      try {
        userCredential = await createUserWithEmailAndPassword(auth, authEmail, password);
      } catch (error) {
        window.showToast("註冊失敗: " + error.message, "❌");
        return;
      }
      const uid = userCredential.user.uid;

      try {
        await setDoc(doc(db, 'usernames', idLower), { uid, authEmail, createdAt: Date.now() });

        const verifyToken = generateVerifyToken();
        const newProfile = {
          uid: uid,
          email: authEmail,
          loginId: loginId,
          contactEmail: profileData.contactEmail || '',
          emailVerified: false,
          emailVerifyToken: verifyToken,
          username: profileData.username,
          school: profileData.school,
          grade: profileData.grade,
          favSubjects: profileData.favSubjects || '無',
          dislikeSubjects: profileData.dislikeSubjects || '無',
          hours: "0.0",
          points: 0,
          exp: 0,
          createdAt: new Date().toISOString()
        };

        await setDoc(doc(db, "users", uid), newProfile);
        window.currentUser = newProfile;

        // 寄驗證電郵係「錦上添花」，就算寄唔到（例如 EmailJS 未設定、
        // 用戶網絡有問題）都唔應該擋住成個註冊流程，所以特登唔用
        // await、亦都唔理佢嘅失敗
        if (newProfile.contactEmail) {
          window.sendVerificationEmail(newProfile.contactEmail, newProfile.username, uid, verifyToken);
        }

        window.closeModal('modal-register');
        window.updateUserAuthUI();
        if (newProfile.contactEmail) {
          window.showToast(`🎉 註冊成功！你的帳號 ID 是「${loginId}」，記住他來登入。仲要撳埋寄了去你電郵的驗證連結，先可以正式開始用`, "✨");
        } else {
          window.showToast(`🎉 註冊成功！你的帳號 ID 是「${loginId}」，記住他來登入`, "✨");
        }
        window.switchTab('home');
      } catch (error) {
        // Firestore 寫入失敗（多數係撞正個 ID 岩岩俾人搶咗）：要清理返啱啱建立
        // 嗰個 Auth 帳號，否則會留低一個冇對應 Firestore 資料嘅「孤兒」帳號
        console.error('註冊寫入 Firestore 失敗，清理返啱啱建立的 Auth 帳號:', error);
        try { await deleteUser(userCredential.user); } catch (e2) { /* 清理失敗都唔緊要，唔好擋住原本嘅錯誤訊息 */ }
        window.showToast("註冊失敗，可能個帳號 ID 啱啱給人用了，換一個再試：" + error.message, "❌");
      }
    };

    window.loginWithFirebase = async function(idOrEmail, password) {
      try {
        // 登入一律用帳號 ID，唔再支援直接打電郵登入
        if (idOrEmail.includes('@')) {
          window.showToast('請用「帳號 ID」登入，不要打電郵喇', '⚠️');
          return;
        }
        const idLower = idOrEmail.toLowerCase();
        const mapSnap = await getDoc(doc(db, 'usernames', idLower));
        if (!mapSnap.exists()) {
          window.showToast('找不到這個帳號 ID，請檢查有沒有打錯', '❌');
          return;
        }
        const authEmail = mapSnap.data().authEmail;

        const userCredential = await signInWithEmailAndPassword(auth, authEmail, password);
        const user = userCredential.user;

        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          window.currentUser = userDoc.data();
        } else {
          window.currentUser = {
            uid: user.uid,
            email: user.email,
            username: user.email.split('@')[0],
            school: '未設定',
            grade: '中六 (S6 DSE)',
            hours: '0.0'
          };
        }

        // 停權檢查：一定要喺呢度（撳「登入」嗰一刻）就即刻擋，唔可以淨係
        // 靠 onAuthStateChanged 嗰個監聽器事後先發現——如果淨係靠嗰邊，
        // 呢度會照樣即刻顯示咗登入成功嘅畫面同埋觸發埋 forceRefreshChatDock
        // 等操作，兩者夾埋一齊跑，好大機會撞到 onAuthStateChanged 嗰邊
        // 先一步 signOut() 咗，於是啲請求會因為認證突然被清走而報
        // 「Missing or insufficient permissions」，而唔係清清楚楚話畀
        // 用戶知「你已被停權」。
        if (window.currentUser && window.currentUser.suspended) {
          window.currentUser = null;
          await signOut(auth);
          window.showToast('你的帳戶已被管理員停權，無法登入，如有疑問請聯絡管理員', '🚫');
          return;
        }

        window.closeModal('modal-login');
        window.updateUserAuthUI();
        window.showToast("歡迎回來 ConcenMate！", "👋");
        window.switchTab('home');
      } catch (error) {
        window.showToast("登入失敗: " + error.message, "❌");
      }
    };

    window.logoutWithFirebase = async function() {
      await signOut(auth);
      window.currentUser = null;
      window.updateUserAuthUI();
      window.showToast("已成功登出。", "🚪");
      // 登出之後要停止好友相關嘅即時監聽，唔係已經冇權限讀但仍然掛住個 listener
      if (typeof window.stopFriendListeners === 'function') window.stopFriendListeners();
      if (typeof window.stopRoomInvitesListener === 'function') window.stopRoomInvitesListener();
    };

    window.handleRegisterSubmit = function(e) {
      e.preventDefault();
      const loginId = document.getElementById('reg-account-id').value.trim();
      const password = document.getElementById('reg-password').value;
      const username = document.getElementById('reg-username').value.trim();
      const school = document.getElementById('reg-school').value.trim();
      const grade = document.getElementById('reg-grade').value;
      const favSubjects = document.getElementById('reg-fav').value.trim();
      const dislikeSubjects = document.getElementById('reg-dislike').value.trim();
      const contactEmail = document.getElementById('reg-contact-email').value.trim();

      if (!/^[A-Za-z0-9_]{3,20}$/.test(loginId)) {
        window.showToast('帳號 ID 格式要是 3-20 個英文字母／數字／底線', '⚠️');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
        window.showToast('請輸入一個有效的電郵地址，用來做電郵驗證', '⚠️');
        return;
      }

      window.registerWithFirebase(loginId, password, {
        username, school, grade, favSubjects, dislikeSubjects, contactEmail
      });
    };

    window.handleLoginSubmit = async function(e) {
      e.preventDefault();
      const email = document.getElementById('login-account-id').value.trim();
      const password = document.getElementById('login-password').value;

      // 登入要行幾個必要嘅網絡步驟先得（查帳號 ID 對應嘅登入電郵 → 用
      // Firebase Auth 驗證密碼 → 攞返用戶資料兼檢查有冇被停權），呢幾步
      // 一環扣一環，每一步都要等上一步嘅結果先知道下一步查邊份文件，
      // 冇辦法夾埋一齊做，所以網絡差嗰陣始終要等一等——但唔應該畀人
      // 覺得個網站「死咗機」，所以撳落「登入」之後即刻將粒掣變成
      // loading 狀態，等用戶清楚知道緊「已經撳中,程式正在處理」，
      // 唔係凍結咗。
      const submitBtn = document.getElementById('login-submit-btn');
      const cancelBtn = document.getElementById('login-cancel-btn');
      const originalText = submitBtn ? submitBtn.innerText : '登入';
      if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = '⏳ 登入緊...'; }
      if (cancelBtn) cancelBtn.disabled = true;
      try {
        await window.loginWithFirebase(email, password);
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = originalText; }
        if (cancelBtn) cancelBtn.disabled = false;
      }
    };

    window.saveUserProfile = async function(e) {
      e.preventDefault();
      if (!window.currentUser || !auth.currentUser) return;

      const school = document.getElementById('prof-school').value.trim();
      const grade = document.getElementById('prof-grade').value;
      const favSubjects = document.getElementById('prof-fav').value.trim();
      const dislikeSubjects = document.getElementById('prof-dislike').value.trim();
      const username = document.getElementById('prof-username').value.trim();
      const contactEmailInput = document.getElementById('prof-contact-email');
      const contactEmail = contactEmailInput ? contactEmailInput.value.trim() : (window.currentUser.contactEmail || '');

      if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
        window.showToast('聯絡電郵格式唔啱，請檢查後再試', '⚠️');
        return;
      }

      // 電郵改咗（同之前存落 Firestore 嗰個唔一樣），就當作未驗證過，要
      // 重新整過 token 兼寄多次驗證電郵；淨係打多打少個空格唔算改咗
      const emailChanged = contactEmail !== (window.currentUser.contactEmail || '');

      try {
        const userDocRef = doc(db, "users", auth.currentUser.uid);
        const updates = { username, school, grade, favSubjects, dislikeSubjects, contactEmail };
        let newToken = null;
        if (emailChanged) {
          newToken = contactEmail ? generateVerifyToken() : null;
          updates.emailVerified = false;
          updates.emailVerifyToken = newToken;
        }
        await updateDoc(userDocRef, updates);
        window.currentUser.username = username;
        window.currentUser.school = school;
        window.currentUser.grade = grade;
        window.currentUser.favSubjects = favSubjects;
        window.currentUser.dislikeSubjects = dislikeSubjects;
        window.currentUser.contactEmail = contactEmail;
        if (emailChanged) {
          window.currentUser.emailVerified = false;
          window.currentUser.emailVerifyToken = newToken;
          if (contactEmail) {
            window.sendVerificationEmail(contactEmail, username, auth.currentUser.uid, newToken);
          }
        }

        window.updateUserAuthUI();
        window.showToast(emailChanged && contactEmail ? "💾 已更新資料，並寄出新的驗證電郵" : "💾 個人檔案已同步更新至 Firebase！", "✅");
      } catch (err) {
        window.showToast("更新失敗: " + err.message, "❌");
      }
    };
