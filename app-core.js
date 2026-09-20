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
    import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, deleteUser, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
    import { getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc, collection, onSnapshot, addDoc, getDocs, increment, query, where, orderBy, limit, arrayUnion, arrayRemove, documentId, startAfter, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
    import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
    import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";

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
    // ⚠️ region 一定要同 functions/index.js 嘅 setGlobalOptions({ region })
    // 一致（而家係 asia-east1），唔係嘅話前端會揾唔到個 function（404）。
    const cloudFunctions = getFunctions(app, "asia-east1");

    window.db = db;
    window.fs = { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, onSnapshot, addDoc, getDocs, increment, query, where, orderBy, limit, arrayUnion, arrayRemove, documentId, startAfter, runTransaction };
    window.storage = storage;
    window.storageApi = { ref: storageRef, uploadBytes, getDownloadURL, deleteObject };

    // 呼叫 Cloud Functions 嘅共用 helper：window.callCloudFunction('functionName', {...data})
    // 回傳 Promise，resolve 做嗰個 function return 咗嘅 data；function 嗰邊用
    // HttpsError 拋出嘅錯誤，呢度會變成一個帶住 .code／.message 嘅 Error。
    window.callCloudFunction = async function(name, data) {
      const fn = httpsCallable(cloudFunctions, name);
      const result = await fn(data || {});
      return result.data;
    };

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
            <h4 style="font-size:14px; font-weight:bold; color:var(--brand-800); margin-bottom:4px;">${room.hasPassword ? '🔒 ' : ''}${window.escapeHtml(room.name)}</h4>
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

        // 記低「最後上線時間」，俾管理後台「用戶管理」分頁顯示（見
        // admin-panel.js 嘅 formatLastLoginDisplay()）。用 Date.now()
        // 呢個前端時間戳，同呢個 app 其他 createdAt／updatedAt 欄位一致
        // 嘅做法，冇特登用 Firestore serverTimestamp。故意唔 await——
        // 呢個純粹背景記錄用，唔應該累到登入流程等埋佢寫完先繼續；
        // 寫失敗都唔緊要（例如離線），淨係 console 記低，唔會嚇親用戶。
        updateDoc(userDocRef, { lastLoginAt: Date.now() }).catch((e) => {
          console.warn('記錄最後上線時間失敗（唔影響使用）:', e);
        });

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
        if (typeof window.loadNavIconsFromFirestore === 'function') {
          window.loadNavIconsFromFirestore();
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
      // 忘記密碼嗰個 reset-password hash route 特登唔理登入定登出都要行——
      // 用戶就係因為唔記得密碼、登入唔到先撳連結入嚟，唔可以好似其他
      // hash route 咁要求「先登入先處理」
      if (typeof window.checkPasswordResetHashRoute === 'function') {
        window.checkPasswordResetHashRoute();
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

    // 如果喺 index.html 頭段填咗 EMAILJS_PASSWORD_RESET_TEMPLATE_ID（忘記
    // 密碼專用範本），就用嗰個；未填（留空）就 fallback 沿用返電郵驗證
    // 嗰個共用範本，確保冇填新範本之前呢個功能都繼續正常運作。
    window.sendPasswordResetEmail = async function(toEmail, username, token) {
      if (!toEmail) return;
      if (!window.EMAILJS_CONFIGURED || typeof emailjs === 'undefined') {
        console.warn('EmailJS 未設定，沒有寄到重設密碼電郵給', toEmail, '（見 index.html 頭段「電郵驗證設定」）');
        return;
      }
      const resetLink = `${window.location.origin}${window.location.pathname}#reset-password=${token}`;
      const templateId = window.EMAILJS_PASSWORD_RESET_TEMPLATE_ID || window.EMAILJS_TEMPLATE_ID;
      try {
        await emailjs.send(window.EMAILJS_SERVICE_ID, templateId, {
          to_email: toEmail,
          to_name: username || '同學',
          verify_link: resetLink
        });
      } catch (e) {
        console.error('寄重設密碼電郵失敗:', e);
      }
    };

    // 撳完驗證連結、開返網站之後嘅處理——特登唔要求撳連結嗰部裝置一定要
    // 登入緊嗰個帳戶先做得到（以前嘅做法係前端直接 updateDoc 自己個
    // users/{uid} 文件，Firestore 規則淨係俾用戶自己改自己，所以一定要
    // 喺嗰部裝置登入緊先掂得到；而家改用 verifyEmailToken 呢個 Cloud
    // Function，用 Admin SDK 核對 uid+token 岩唔岩、寫 emailVerified，
    // 完全唔理呢部裝置有冇登入、登入緊邊個帳戶——喺手機開封信、喺電腦
    // 撳連結，或者根本未登入過都做得到，先真正解決咗「電郵驗證一定要
    // 撳連結嗰部裝置登入返嗰個帳戶」嘅限制）。
    window.checkEmailVerifyHashRoute = async function() {
      const match = (window.location.hash || '').match(/^#verify-email=([^:]+):([0-9a-f]+)$/);
      if (!match) return;
      const [, linkUid, token] = match;
      window.location.hash = '';
      try {
        const result = await window.callCloudFunction('verifyEmailToken', { uid: linkUid, token });
        if (result && result.alreadyVerified) {
          window.showToast('這個電郵地址已經驗證過了', 'ℹ️');
        } else {
          window.showToast('🎉 電郵驗證成功！', '✅');
        }
        // 如果撳連結嗰部裝置岩岩好登入緊就係嗰個帳戶本人，即刻更新返
        // 本機狀態，唔使用戶自己再撳多次「重新整理」先解鎖到個 app
        if (window.currentUser && window.currentUser.uid === linkUid) {
          window.currentUser.emailVerified = true;
          window.currentUser.emailVerifyToken = null;
          if (typeof window.updateProfileEmailVerifyUI === 'function') window.updateProfileEmailVerifyUI();
          if (typeof window.updateUserAuthUI === 'function') window.updateUserAuthUI();
        }
      } catch (e) {
        if (e.code === 'functions/failed-precondition' || e.code === 'failed-precondition') {
          window.showToast('這個驗證連結已經失效，可以在「編輯個人資料」中重新發送', '⚠️');
        } else if (e.code === 'functions/not-found' || e.code === 'not-found') {
          window.showToast('找不到這個帳戶，可能已經被刪除', '❌');
        } else {
          window.showToast('驗證失敗：' + (e.message || e), '❌');
        }
      }
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
          window.showToast('這個溫習室已經不存在（可能已經解散或連結已經失效）', '🚫');
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

    // ===================== 🔑 忘記密碼（電郵重設） =====================
    // 帳號 ID 登入制度入面，Firebase Auth 真正嘅 email 係合成嘅
    // `{id}@concenmate.local`（唔係用戶會睇到嘅嘢），所以完全冇辦法用
    // Firebase 內建嘅 sendPasswordResetEmail()——嗰個一定會寄去嗰個合成、
    // 唔存在嘅地址。要做到「用戶忘記密碼、自己憑登記電郵重設」，一定要
    // 自己砌一套：
    //   1) requestPasswordReset（Cloud Function）：畀個帳號 ID，用 Admin
    //      SDK 查返 uid、登記電郵，生成一個一次性 token，存落
    //      passwordResets/{token}（Firestore 規則寫死前端完全讀寫唔到，
    //      淨係 Cloud Functions 嘅 Admin SDK 先掂得到）。因為呢一步用戶
    //      仲未登入（冇 auth.uid），Firestore 規則做唔到「淨係自己改自己
    //      個人資料」嗰種限制，一定要搬去 Cloud Function 用 Admin SDK 做。
    //   2) 前端攞返 Cloud Function 傳返嚟嘅 token + 登記電郵，沿用返
    //      window.sendVerificationEmail() 嗰個 EmailJS 樣式寄一封帶住
    //      「#reset-password=token」連結嘅電郵（呢個樣式原本文字係講緊
    //      「驗證電郵」，唔係度身訂造嘅「重設密碼」措辭，但暫時沿用一樣
    //      嘅寄信方式，日後想要更貼切嘅文字可以喺 EmailJS 開多一個新樣式）。
    //   3) 用戶撳個連結開返網站，唔使登入（都登入唔到，佢就係唔記得咗
    //      密碼）就見到「設定新密碼」嘅彈窗，輸入新密碼提交後 call
    //      confirmPasswordReset（Cloud Function），用 Admin SDK 嘅
    //      admin.auth().updateUser() 強制幫佢個帳戶設定新密碼（呢一步都
    //      一定要 Admin SDK，因為前端 SDK 淨係可以幫「而家已經登入緊」
    //      嘅用戶改自己密碼，改唔到第二個未登入用戶嘅密碼）。
    //   token 30 分鐘後失效、用完即棄，防止連結流出去俾第二個人執到都
    //   仲用得。
    // ✅ 已加返速率限制：同一個帳號 ID，1 小時內最多申請 5 次（見
    // functions/index.js 嘅 checkRateLimit），防止俾人連環噉打
    // requestPasswordReset 濫發電郵。超咗限制會拋 resource-exhausted，
    // 落便個 catch 會將伺服器嘅提示訊息直接顯示畀用戶睇。
    window.handleForgotPasswordSubmit = async function(e) {
      e.preventDefault();
      const loginId = (document.getElementById('forgot-account-id').value || '').trim();
      if (!loginId) return;

      const btn = document.getElementById('forgot-password-submit-btn');
      if (btn) { btn.disabled = true; btn.innerText = '⏳ 處理中...'; }

      try {
        const result = await window.callCloudFunction('requestPasswordReset', { loginId });
        if (result && result.contactEmail && result.token) {
          await window.sendPasswordResetEmail(result.contactEmail, result.username, result.token);
        }
        // 唔理呢個帳號 ID 實際存唔存在、有冇登記電郵，都顯示返一樣嘅
        // 提示——避免俾人攞嚟逐個帳號 ID 咁試，反過嚟推斷邊個 ID 已經
        // 有人用咗（呢個 app 嘅 usernames collection 本身雖然已經可以
        // get 得到，但都冇必要喺呢度畀多一重確認）。
        window.showToast('如果此帳號 ID 存在並已登記電郵，重設密碼連結已經寄至該電郵信箱，請查看垃圾郵件夾', '📧');
        window.closeModal('modal-forgot-password');
      } catch (error) {
        window.showToast('處理失敗：' + (error.message || error), '❌');
      } finally {
        if (btn) { btn.disabled = false; btn.innerText = '📧 寄出重設密碼連結'; }
      }
    };

    // 撳完重設密碼連結、開返網站之後嘅處理——特登唔理會使用者而家有冇
    // 登入（都好可能未登入，佢就係唔記得密碼先入嚟呢度），直接彈個
    // 「設定新密碼」嘅視窗畀佢輸入
    window.checkPasswordResetHashRoute = function() {
      const match = (window.location.hash || '').match(/^#reset-password=([0-9a-f]+)$/);
      if (!match) return;
      window.pendingPasswordResetToken = match[1];
      window.location.hash = '';
      window.openModal('modal-reset-password');
    };
    window.addEventListener('hashchange', () => { window.checkPasswordResetHashRoute(); });

    window.handleResetPasswordSubmit = async function(e) {
      e.preventDefault();
      const token = window.pendingPasswordResetToken;
      if (!token) {
        window.showToast('重設密碼連結已經失效，請重新申請', '⚠️');
        return;
      }
      const newPwd = document.getElementById('reset-new-password').value;
      const confirmPwd = document.getElementById('reset-confirm-password').value;
      if (!newPwd || newPwd.length < 6) {
        window.showToast('新密碼最少需要 6 位', '⚠️');
        return;
      }
      if (newPwd !== confirmPwd) {
        window.showToast('兩次輸入的新密碼不一致', '⚠️');
        return;
      }

      const btn = document.getElementById('reset-password-submit-btn');
      if (btn) { btn.disabled = true; btn.innerText = '⏳ 更改中...'; }

      try {
        await window.callCloudFunction('confirmPasswordReset', { token, newPassword: newPwd });
        window.pendingPasswordResetToken = null;
        const form = document.getElementById('reset-password-form');
        if (form) form.reset();
        window.closeModal('modal-reset-password');
        window.showToast('🎉 密碼已成功重設！現在可以使用新密碼登入', '✅');
        window.openModal('modal-login');
      } catch (error) {
        if (error.code === 'functions/not-found' || error.code === 'not-found') {
          window.showToast('連結已經失效或者已經用過，請重新申請一次', '⚠️');
        } else if (error.code === 'functions/deadline-exceeded' || error.message === '連結已過期') {
          window.showToast('連結已經過期（30 分鐘內有效），請重新申請一次', '⚠️');
        } else {
          window.showToast('重設密碼失敗：' + (error.message || error), '❌');
        }
      } finally {
        if (btn) { btn.disabled = false; btn.innerText = '🔑 確認重設密碼'; }
      }
    };

    // 「編輯個人資料」度嘅「重新發送驗證電郵」掣：改咗電郵、或者第一封
    // 冇收到，都可以隨時重新整多個新 token 再寄一次
    window.resendVerificationEmail = async function() {
      if (!window.currentUser || !auth.currentUser) return;
      const toEmail = window.currentUser.contactEmail;
      if (!toEmail) { window.showToast('請先在上面填寫電郵地址，再按「儲存修改資料」', '⚠️'); return; }
      const btn = document.getElementById('resend-verify-email-btn');
      if (btn) { btn.disabled = true; btn.innerText = '⏳ 發送中...'; }
      try {
        const token = generateVerifyToken();
        await updateDoc(doc(db, 'users', auth.currentUser.uid), { emailVerifyToken: token, emailVerified: false });
        window.currentUser.emailVerifyToken = token;
        window.currentUser.emailVerified = false;
        await window.sendVerificationEmail(toEmail, window.currentUser.username, auth.currentUser.uid, token);
        window.showToast('已重新發送驗證電郵，請查看你的信箱（包括垃圾郵件夾）', '📧');
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
          window.showToast('尚未完成驗證，請檢查郵件並點擊當中的連結', '📧');
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

    // ===================== 👤 個人資料頁 Tab 切換 =====================
    // 「編輯個人資料」入面分咗「個人資料」同「更改登入密碼」兩個 Tab，
    // 純粹前端切換顯示／隱藏，唔涉及任何資料存取。
    window.switchProfileSubtab = function(tab) {
      const infoPanel = document.getElementById('profile-subtab-info');
      const pwdPanel = document.getElementById('profile-subtab-password');
      const infoBtn = document.getElementById('profile-subtab-btn-info');
      const pwdBtn = document.getElementById('profile-subtab-btn-password');
      if (!infoPanel || !pwdPanel || !infoBtn || !pwdBtn) return;

      const isInfo = tab === 'info';
      infoPanel.style.display = isInfo ? '' : 'none';
      pwdPanel.style.display = isInfo ? 'none' : '';
      infoBtn.style.background = isInfo ? 'var(--brand-100)' : 'transparent';
      infoBtn.style.color = isInfo ? 'var(--brand-800)' : '#999';
      pwdBtn.style.background = isInfo ? 'transparent' : 'var(--brand-100)';
      pwdBtn.style.color = isInfo ? '#999' : 'var(--brand-800)';
    };

    // ===================== 🔑 更改登入密碼 =====================
    // 「編輯個人資料」度嘅「更改密碼」表格：用戶要先打啱「目前密碼」
    // （reauthenticateWithCredential 重新驗證一次身份，Firebase Auth 對
    // 呢類敏感操作嘅安全要求），先至可以用 updatePassword 改做新密碼。
    // 呢個純粹係前端 Firebase Auth SDK 就做得到，唔使 Cloud Functions
    // （因為用戶本身就係登入緊嘅帳戶自己改自己嘅密碼）。
    // ⚠️ 帳號登入用嘅係合成 email（`{id}@concenmate.local`，見上面
    // registerWithFirebase 嘅註解），唔係用戶個「聯絡電郵」，reauthenticate
    // 要用返 window.currentUser.email（即係嗰個合成 authEmail）先啱。
    window.changeUserPassword = async function(e) {
      e.preventDefault();
      if (!window.currentUser || !auth.currentUser) {
        window.showToast('請先登入', '⚠️');
        return;
      }

      const currentPwd = document.getElementById('chpwd-current').value;
      const newPwd = document.getElementById('chpwd-new').value;
      const confirmPwd = document.getElementById('chpwd-confirm').value;

      if (!currentPwd || !newPwd || !confirmPwd) {
        window.showToast('請填妥所有欄位', '⚠️');
        return;
      }
      if (newPwd.length < 6) {
        window.showToast('新密碼最少要 6 個字元', '⚠️');
        return;
      }
      if (newPwd !== confirmPwd) {
        window.showToast('兩次輸入的新密碼不一致，請重新檢查', '⚠️');
        return;
      }
      if (newPwd === currentPwd) {
        window.showToast('新密碼不可以與目前密碼相同', '⚠️');
        return;
      }

      const btn = document.getElementById('change-password-submit-btn');
      if (btn) { btn.disabled = true; btn.innerText = '⏳ 更改中...'; }

      try {
        const credential = EmailAuthProvider.credential(window.currentUser.email, currentPwd);
        await reauthenticateWithCredential(auth.currentUser, credential);
        await updatePassword(auth.currentUser, newPwd);
        const form = document.getElementById('change-password-form');
        if (form) form.reset();
        window.showToast('🎉 密碼已成功更改！下次登入請使用新密碼', '✅');
      } catch (error) {
        if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
          window.showToast('目前密碼輸入錯誤，請再試一次', '❌');
        } else if (error.code === 'auth/weak-password') {
          window.showToast('新密碼強度不足，請試下混合英文字母同數字', '❌');
        } else if (error.code === 'auth/too-many-requests') {
          window.showToast('嘗試次數太多，請稍後再試', '⚠️');
        } else {
          window.showToast('更改密碼失敗：' + (error.message || error), '❌');
        }
      } finally {
        if (btn) { btn.disabled = false; btn.innerText = '🔑 更改密碼'; }
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
        // ⚠️ 導師帳號（accountType === 'tutor'）喺呢一步都係先建立一個
        // 同學生帳號結構完全一樣嘅 users/{uid} 文件（school／grade 呢類
        // 學生專屬欄位留空就得，唔係硬性需要）——「導師」呢個身份本身
        // 唔係喺呢度賦予嘅，而係下面另外呼叫 applyTutorRole 建立一份
        // 待審批嘅 tutorApplications 文件，一定要管理員批准後
        // approveTutorApplication 先會將 role 改做 'tutor'（見
        // firestore.rules 同 functions/index.js）。呢個帳戶喺批核之前
        // 同一般學生帳戶冇分別，可以正常使用平台其他功能。
        const newProfile = {
          uid: uid,
          email: authEmail,
          loginId: loginId,
          contactEmail: profileData.contactEmail || '',
          emailVerified: false,
          emailVerifyToken: verifyToken,
          username: profileData.username,
          school: profileData.school || '',
          grade: profileData.grade || '',
          favSubjects: profileData.favSubjects || '無',
          dislikeSubjects: profileData.dislikeSubjects || '無',
          // accountType 喺呢度就已經寫死（唔使等下面嗰個 applyTutorRole
          // 呼叫完成先有），等揀咗「🎓 我是導師」嗰邊嘅用戶一註冊完成，
          // 側邊欄即刻就顯示導師殼＋審批中提示，唔使畀佢哋先見到一
          // 閃即逝嘅學生介面先至轉做導師介面。
          accountType: profileData.accountType === 'tutor' ? 'tutor' : 'student',
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

        // 揀咗「🎓 我是導師」嗰邊嘅話，帳戶一建立好就即刻連同表格填低
        // 嘅資料一併送出導師申請（呼叫返同「我的帳戶」入面嗰個申請掣
        // 完全一樣嘅 applyTutorRole），唔使佢哋註冊完再走多一步。呢一步
        // 就算失敗（例如網絡問題）都唔應該累事個帳戶註冊唔到，所以
        // 用 try/catch 包住，失敗嘅話事後仲可以喺「我的帳戶」補交。
        let tutorApplySucceeded = null;
        if (profileData.accountType === 'tutor') {
          try {
            await window.callCloudFunction('applyTutorRole', {
              displayName: profileData.username,
              bio: profileData.tutorBio || '',
              subjectsIntended: profileData.tutorSubjects || [],
              contactInfo: profileData.contactEmail || '',
            });
            tutorApplySucceeded = true;
          } catch (applyErr) {
            console.error('註冊時自動送出導師申請失敗：', applyErr);
            tutorApplySucceeded = false;
          }
        }

        window.closeModal('modal-register');
        window.updateUserAuthUI();
        if (profileData.accountType === 'tutor') {
          if (tutorApplySucceeded) {
            window.showToast(`🎉 註冊成功！您的帳號 ID 是「${loginId}」。導師身份申請已經一併送出，請等候管理員審批，審批結果會在「我的帳戶」顯示`, "🎓");
          } else {
            window.showToast(`🎉 註冊成功！您的帳號 ID 是「${loginId}」。不過導師申請未能送出，請登入後在「我的帳戶」重新申請`, "⚠️");
          }
        } else if (newProfile.contactEmail) {
          window.showToast(`🎉 註冊成功！你的帳號 ID 是「${loginId}」，請記住以用作登入。另外請點擊已寄至你電郵的驗證連結，才能正式開始使用`, "✨");
        } else {
          window.showToast(`🎉 註冊成功！你的帳號 ID 是「${loginId}」，記住他來登入`, "✨");
        }
        window.switchTab('home');
      } catch (error) {
        // Firestore 寫入失敗（多數係撞正個 ID 岩岩俾人搶咗）：要清理返啱啱建立
        // 嗰個 Auth 帳號，否則會留低一個冇對應 Firestore 資料嘅「孤兒」帳號
        console.error('註冊寫入 Firestore 失敗，清理返啱啱建立的 Auth 帳號:', error);
        try { await deleteUser(userCredential.user); } catch (e2) { /* 清理失敗都唔緊要，唔好擋住原本嘅錯誤訊息 */ }
        window.showToast("註冊失敗，帳號 ID 可能剛被使用，請換一個再試：" + error.message, "❌");
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

    // ===================== 導師「想教的科目」勾選式選擇器 =====================
    // 原本呢個位係一個「用逗號分隔」嘅純文字輸入格，容易打錯字或者格式
    // 唔一致（例如有人打「數學」有人打「Math」），同「管理教材」分頁
    // 新增科目嗰陣用嘅固定 HKDSE 科目清單唔統一。而家改用同一份清單
    // （window.TUTOR_DSE_SUBJECTS，由 tutor-panel.js 定義並掛喺 window
    // 度，注意呢個檔案本身喺 tutor-panel.js 之前載入，但呢個函數要用戶
    // 撳咗「我是導師」或者開咗「申請成為導師」視窗先會被叫，到嗰時全部
    // <script> 都已經載入完，唔會撞到 TUTOR_DSE_SUBJECTS 未定義嘅問題）
    // 畫成可以剔選多科嘅 chip，同埋保留一個文字輸入畀清單以外嘅科目。
    // 用返個原本嘅 hidden input 做「真正嘅欄位」，將剔選結果用頓號合埋
    // 一齊寫入去，咁樣 handleRegisterSubmit()／submitTutorApplication()
    // 嗰套「讀 .value 再用逗號分割」嘅邏輯完全唔使改。
    window.renderTutorSubjectChipPicker = function(pickerId, hiddenInputId) {
      const picker = document.getElementById(pickerId);
      const hiddenInput = document.getElementById(hiddenInputId);
      if (!picker || !hiddenInput || !window.TUTOR_DSE_SUBJECTS) return;

      const selected = new Set((hiddenInput.value || '').split(/[,，、]/).map((s) => s.trim()).filter(Boolean));
      const fixedSubjects = window.TUTOR_DSE_SUBJECTS.filter((s) => s !== '其他（自行輸入）');
      const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

      function sync() {
        hiddenInput.value = Array.from(selected).join('、');
      }

      function render() {
        const chipsHtml = fixedSubjects.map((s) => {
          const active = selected.has(s);
          return `<button type="button" class="tag" data-subject="${escAttr(s)}"
            style="cursor:pointer; border:1px solid ${active ? 'var(--brand-500)' : '#ddd'};
            background:${active ? 'var(--brand-500)' : '#F5F7F8'}; color:${active ? '#fff' : '#555'};
            border-radius:99px; padding:4px 10px; font-size:13px; margin:0 6px 6px 0;">${active ? '✓ ' : ''}${s}</button>`;
        }).join('');
        const customSelected = Array.from(selected).filter((s) => !fixedSubjects.includes(s));
        const customChipsHtml = customSelected.map((s) => `
          <button type="button" class="tag" data-custom-subject="${escAttr(s)}"
            style="cursor:pointer; border:1px solid var(--brand-500); background:var(--brand-500);
            color:#fff; border-radius:99px; padding:4px 10px; font-size:13px; margin:0 6px 6px 0;">✓ ${s} ✕</button>
        `).join('');
        picker.innerHTML = `
          <div style="display:flex; flex-wrap:wrap;">${chipsHtml}${customChipsHtml}</div>
          <input type="text" id="${pickerId}-custom" class="input-field" placeholder="其他科目（自行輸入，按 Enter 新增）" style="width:100%; margin-top:4px;">
        `;
        picker.querySelectorAll('button[data-subject]').forEach((btn) => {
          btn.onclick = () => {
            const subj = btn.getAttribute('data-subject');
            if (selected.has(subj)) selected.delete(subj); else selected.add(subj);
            sync();
            render();
          };
        });
        picker.querySelectorAll('button[data-custom-subject]').forEach((btn) => {
          btn.onclick = () => {
            selected.delete(btn.getAttribute('data-custom-subject'));
            sync();
            render();
          };
        });
        const customInput = document.getElementById(`${pickerId}-custom`);
        if (customInput) {
          customInput.onkeydown = (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const v = customInput.value.trim();
            if (v) { selected.add(v); sync(); render(); }
          };
        }
      }

      render();
      sync();
    };

    // 註冊表格嘅「🎒 我是學生」／「🎓 我是導師」切換：揀導師嗰邊會顯示
    // 導師申請專用欄位（自我介紹、想教嘅科目），同時隱藏埋學生專用嘅
    // 學校／年級／喜愛學科／討厭學科——並且將呢兩組欄位嘅 required
    // 屬性同步切換，否則揀咗導師之後，瀏覽器仍然會因為個隱藏咗嘅
    // 「學校名稱」欄位冇填而唔畀交表。
    window.setRegisterAccountType = function(type) {
      const typeInput = document.getElementById('reg-account-type');
      if (typeInput) typeInput.value = type;

      const studentBtn = document.getElementById('reg-type-student-btn');
      const tutorBtn = document.getElementById('reg-type-tutor-btn');
      const studentFields = document.getElementById('register-student-fields');
      const tutorFields = document.getElementById('register-tutor-fields');
      const tutorHint = document.getElementById('reg-type-tutor-hint');
      const isTutor = type === 'tutor';

      if (studentBtn) studentBtn.className = 'btn ' + (isTutor ? 'btn-outline' : 'btn-primary');
      if (tutorBtn) tutorBtn.className = 'btn ' + (isTutor ? 'btn-primary' : 'btn-outline');
      if (studentFields) studentFields.style.display = isTutor ? 'none' : 'block';
      if (tutorFields) tutorFields.style.display = isTutor ? 'block' : 'none';
      if (tutorHint) tutorHint.style.display = isTutor ? 'block' : 'none';

      const schoolInput = document.getElementById('reg-school');
      const subjectsInput = document.getElementById('reg-tutor-subjects');
      if (schoolInput) schoolInput.required = !isTutor;
      if (subjectsInput) subjectsInput.required = isTutor;

      // 揀「我是導師」先畫個科目剔選器（唔喺頁面一載入就畫，慳返啲
      // 唔使嘅工夫；每次切返導師嗰邊都重畫一次，會保留返之前剔選開嘅
      // 內容，因為 renderTutorSubjectChipPicker() 係由 hidden input 而家
      // 嘅 value 讀返選咗乜嘢）
      if (isTutor && typeof window.renderTutorSubjectChipPicker === 'function') {
        window.renderTutorSubjectChipPicker('reg-tutor-subjects-picker', 'reg-tutor-subjects');
      }
    };

    window.handleRegisterSubmit = function(e) {
      e.preventDefault();
      const accountType = (document.getElementById('reg-account-type').value === 'tutor') ? 'tutor' : 'student';
      const loginId = document.getElementById('reg-account-id').value.trim();
      const password = document.getElementById('reg-password').value;
      const passwordConfirm = document.getElementById('reg-password-confirm').value;
      const username = document.getElementById('reg-username').value.trim();
      const contactEmail = document.getElementById('reg-contact-email').value.trim();

      // 兩次密碼輸入要完全一致先俾提交，避免同學打錯字自己都唔知，
      // 之後登入嗰陣先發現「個密碼點打都錯」（其實係註冊嗰陣打錯咗）。
      const mismatchHint = document.getElementById('reg-password-mismatch-hint');
      if (password !== passwordConfirm) {
        if (mismatchHint) mismatchHint.style.display = 'block';
        window.showToast('兩次輸入的密碼不一致，請重新確認', '⚠️');
        return;
      }
      if (mismatchHint) mismatchHint.style.display = 'none';

      if (!/^[A-Za-z0-9_]{3,20}$/.test(loginId)) {
        window.showToast('帳號 ID 格式要是 3-20 個英文字母／數字／底線', '⚠️');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
        window.showToast('請輸入一個有效的電郵地址，用來做電郵驗證', '⚠️');
        return;
      }

      if (accountType === 'student') {
        const school = document.getElementById('reg-school').value.trim();
        const grade = document.getElementById('reg-grade').value;
        const favSubjects = document.getElementById('reg-fav').value.trim();
        const dislikeSubjects = document.getElementById('reg-dislike').value.trim();
        window.registerWithFirebase(loginId, password, {
          accountType, username, school, grade, favSubjects, dislikeSubjects, contactEmail
        });
      } else {
        const tutorBio = document.getElementById('reg-tutor-bio').value.trim();
        const tutorSubjectsRaw = document.getElementById('reg-tutor-subjects').value.trim();
        const tutorSubjects = tutorSubjectsRaw.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
        if (tutorSubjects.length === 0) {
          window.showToast('請至少填寫一個想教的科目', '⚠️');
          return;
        }
        window.registerWithFirebase(loginId, password, {
          accountType, username, contactEmail, tutorBio, tutorSubjects
        });
      }
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
      if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = '⏳ 登入中...'; }
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
        window.showToast('聯絡電郵格式不正確，請檢查後再試', '⚠️');
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
