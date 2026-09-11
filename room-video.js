// ConcenMate · room-video.js
// ------------------------------------------------------------
// Phase 5（程式碼結構化）第三步：呢個檔案原本係 index.html 入面一個
// 普通（非 module）嘅 <script>…</script> 區塊，而家搬咗出嚟做獨立檔
// 案，用 <script src="room-video.js"> 載入。同 app-features.js 一
// 樣，呢個唔係 ES module，同其他普通 <script> 區塊共用全域 scope，
// 搬檔案純粹係物理位置搬走，執行時機同全域可見度完全冇變。
//
// 內容包括：視訊溫習室核心——WebRTC 視像／鏡頭／咪高風控制、房間心
// 跳／在線狀態偵測、背景白噪音、全螢幕視像格局、舉報功能、房主轉
// 移／踢人，以及溫習室入面嘅英文詞卡（Flashcard）溫習功能。
//
// 載入次序好緊要：呢個檔案要留喺 index.html 原本嘅位置（app-core.js
// 之後、下一個 <script> 區塊之前），因為前後都有其他區塊會直接用到
// 呢度定義嘅函式／變數（例如 ROOM_CAPACITY）。

    let state = {
      isCameraOn: false,
      mediaStream: null,
      countdownTimer: null,
      remainingSeconds: 1800,
      roomTotalSeconds: 0, // 呢次入房到而家嘅「總溫習時間」（順時計），閒置暫停計分期間唔會累積
      renderFrameId: null,
      currentRoomId: null,
      isHost: false,
      isMicOn: false,
      cameraToggleInProgress: false,
      connectingTo: new Set(), // 正在進行緊 offer 流程嘅 peer UIDs，防止同時發多條 offer
      lastProcessedOfferTs: {},
      lastProcessedAnswerTs: {},
      peerConnections: {},
      peerNames: {}, // { uid: name } 記住每位遠端用家個名，畀連線斷咗要自動重連嗰陣用（createOfferTo 要有個名先叫得到用戶）
      peerReconnectTimers: {}, // { uid: timeoutId } 連線變 disconnected 之後嘅寬限計時器，睇下會唔會自己好返
      signalingUnsubscribe: null,
      candidatesUnsubscribe: null,
      pendingCandidates: {}, // { uid: [candidateInit, ...] } 尚未能加入的 ICE candidate 佇列
      participantsUnsubscribe: null,
      roomDocUnsubscribe: null,
      reactionsUnsubscribe: null,
      slotAssignments: {}, // { uid: 2|3|4 } 遠端用家目前佔用的視窗格 (格1固定留給自己)
      creatingRoom: false, // 防止「立即建立並廣播」撳得太快／撳多次，開出多過一間房間
      currentRoomHostUid: null, // 現時房間嘅房主 uid，方便隨時知道要喺邊一格顯示「👑 房主」牌
      pomodoroPhase: 'focus', // 'focus' | 'break'：房入面嘅計時器而家跑緊邊個階段
      focusDurationSeconds: 1800, // 呢間房嘅「專注時段」長度（跟房主揀嘅目標時間），小休完之後會用返呢個數重新開始新一輪專注
      pomodoroCyclesCompleted: 0, // 呢次入房到而家已經完成咗幾多個完整嘅「專注」循環，用嚟畀學生睇到自己嘅進度／成就感
      heartbeatTimer: null, // 房間心跳計時器（見 startRoomHeartbeat），畀大廳嘅幽靈房自動清理機制用
      presenceCheckTimer: null, // 定時彈窗確認「仲喺度嗎？」嘅計時器
      presenceTimeoutTimer: null, // 彈窗後 2 分鐘未確認就暫停計分嘅計時器
      presenceConfirmed: true, // 呢一輪確認彈窗，用家係咪已經撳咗確認
      awardingPaused: false, // 被判定為閒置期間，暫停 PTS/EXP 獎勵（防止掛機刷分）
      micOpenTimer: null, // 開咪 3 分鐘上限嘅計時器，時間一到自動關咪 + 進入冷卻
      micOpenUiTimer: null, // 開咪期間每秒刷新按鈕文字（顯示仲剩幾耐先到 3 分鐘上限）用嘅 interval
      micOpenUntil: null, // 呢次開咪會喺幾時（ms 時間戳）撞到 3 分鐘上限，畀 UI 計倒數用
      micUsedSeconds: 0, // 由上一次冷卻完結到而家，已經累積開咗幾多秒咪——手動關咪／再開咪唔會令佢歸零，先真正做到「連續 3 分鐘上限」
      micSegmentStart: null, // 而家呢一段「開緊咪」係幾時開始嘅時間戳，用嚟喺手動關咪嗰刻計返呢段用咗幾多秒加落 micUsedSeconds
      micCooldownTimer: null, // 冷卻 5 分鐘完結嘅計時器，完咗先解鎖返咪掣
      micCooldownUiTimer: null, // 冷卻期間每秒刷新按鈕文字（顯示倒數）用嘅 interval
      micCooldownUntil: null // 冷卻結束嘅時間戳（ms），畀 UI 計倒數用
    };

    const ROOM_POMODORO_BREAK_SECONDS = 5 * 60; // 房入面每輪專注完之後嘅小休長度，暫時定死 5 分鐘
    const MIC_OPEN_LIMIT_SECONDS = 3 * 60; // 每次開咪最多連續 3 分鐘，避免學生掛住傾偈唔記得溫習
    const MIC_COOLDOWN_SECONDS = 5 * 60; // 開咪上限一到，要等 5 分鐘冷卻先可以再開

    const ROOM_CAPACITY = 4; // 同一房間最多同時容納的用家人數（包括自己）
    window.ROOM_CAPACITY = ROOM_CAPACITY; // 開放俾其他 <script> 區塊（例如大廳房間卡片）讀取

    // 房間上限 4 人，鏡頭恆常都用 2x2「四格漫畫」版面（見 CSS，唔理
    // 螢幕幾闊都唔會變 3 欄、4 欄），四格一致大細。想再放到最大、睇得
    // 更清楚，可以撳「⛶ 全螢幕」——特登連同 room-bar（開鏡頭／咪嘅
    // 按鈕、退出房間等）一齊放大蓋晒成個畫面，唔係淨係得個視訊格，
    // 唔係嘅話全螢幕嗰陣會撳唔到呢啲按鈕（見下面 toggleVideoFullscreenMode）。
    // 按實際可用空間，計一個保持 4:3（跟返 getUserMedia 理想解像度
    // 640x480 嘅比例）嘅 2x2 格仔大細，等全螢幕嗰陣唔理個螢幕幾闊幾
    // 扁，四格都唔會被谷到變形，又盡量攞盡剩低嘅空間。淨係喺仲係全
    // 螢幕狀態先計，唔係就乜都唔做（例如 resize 事件喺退出咗全螢幕
    // 之後先觸發嗰種情況）。
    function updateFullscreenGridSize() {
      const roomActive = document.getElementById('room-active');
      const grid = document.getElementById('video-grid-container');
      if (!roomActive || !grid || !roomActive.classList.contains('video-fullscreen-mode')) return;

      const rect = grid.getBoundingClientRect();
      const availW = rect.width;
      const availH = rect.height;
      if (availW <= 0 || availH <= 0) return;

      const GAP = 12; // 要同 .video-grid-container 嘅 CSS gap 一致
      const CELL_RATIO = 4 / 3;

      let cellW = (availW - GAP) / 2;
      let cellH = cellW / CELL_RATIO;
      if (cellH * 2 + GAP > availH) {
        cellH = (availH - GAP) / 2;
        cellW = cellH * CELL_RATIO;
      }
      cellW = Math.max(40, Math.floor(cellW));
      cellH = Math.max(30, Math.floor(cellH));

      grid.style.gridTemplateColumns = `repeat(2, ${cellW}px)`;
      grid.style.gridTemplateRows = `repeat(2, ${cellH}px)`;
    }
    // 視窗大細改變（例如手機轉方向、電腦拉闊縮窄視窗）都要重新計過
    window.addEventListener('resize', updateFullscreenGridSize);
    window.addEventListener('orientationchange', () => {
      // 手機轉向嗰刻讀到嘅 viewport 尺寸有時未即刻更新，等多一個 tick
      setTimeout(() => {
        updateFullscreenGridSize();
        broadcastMyCameraRotation();
      }, 100);
    });

    window.toggleVideoFullscreenMode = function() {
      const roomActive = document.getElementById('room-active');
      const fsBtn = document.getElementById('video-fullscreen-btn');
      if (!roomActive) return;
      const willBeFullscreen = !roomActive.classList.contains('video-fullscreen-mode');
      roomActive.classList.toggle('video-fullscreen-mode', willBeFullscreen);
      if (fsBtn) fsBtn.innerHTML = willBeFullscreen ? '⛶ 退出全螢幕' : '⛶ 全螢幕';
      // 全螢幕嗰陣鎖住背景頁面唔畀捲動，唔係嘅話手指喺黑色空隙度拖到
      // 都會意外拉動咗底下嗰版，畀人覺得畫面甩晒版
      document.body.style.overflow = willBeFullscreen ? 'hidden' : '';
      if (willBeFullscreen) {
        // 等 class 切換完、CSS 已經套用、room-bar 都已經收埋咗多餘
        // 按鈕之後，先量度可用空間嚟計格仔大細，唔係就會量到轉換前
        // 嘅舊尺寸
        requestAnimationFrame(() => requestAnimationFrame(updateFullscreenGridSize));
      } else {
        const grid = document.getElementById('video-grid-container');
        if (grid) { grid.style.gridTemplateColumns = ''; grid.style.gridTemplateRows = ''; }
        // 退返出全螢幕：全螢幕專用嘅背景音細面板收返埋，控制列都還原
        // 返做「顯示緊」狀態，等下次再入全螢幕都係由呢個乾淨狀態開始
        const fsBgNoisePanel = document.getElementById('fs-bg-noise-panel');
        if (fsBgNoisePanel) fsBgNoisePanel.style.display = 'none';
        resetFsRoomBarCollapse();
      }
    };
    // 退房、或者第二個 <script> 區塊（doLeaveRoom）要喺唔知而家係咪
    // 全螢幕狀態嘅情況下都安全咁強制退返出嚟，所以獨立開一個「淨係
    // 退出」嘅版本，而唔淨係得返一個「切換」掣
    window.exitVideoFullscreenMode = function() {
      const roomActive = document.getElementById('room-active');
      const fsBtn = document.getElementById('video-fullscreen-btn');
      if (roomActive) roomActive.classList.remove('video-fullscreen-mode');
      if (fsBtn) fsBtn.innerHTML = '⛶ 全螢幕';
      document.body.style.overflow = '';
      // 清返 inline style，唔係就會用返呢啲 px 數值蓋晒返正常（非全
      // 螢幕）嗰個 CSS 版面規則
      const grid = document.getElementById('video-grid-container');
      if (grid) { grid.style.gridTemplateColumns = ''; grid.style.gridTemplateRows = ''; }
      const fsBgNoisePanel = document.getElementById('fs-bg-noise-panel');
      if (fsBgNoisePanel) fsBgNoisePanel.style.display = 'none';
      resetFsRoomBarCollapse();
    };

    // 全螢幕控制列收埋／顯示：撳一下就將 room-bar 收埋到淨返呢粒掣咁大
    // （靠 CSS .controls-collapsed 隱藏晒其他嘢、橫向嗰陣仲會將條窄
    // 控制條由 148px 縮到 44px，畀返空間鏡頭畫面），再撳一下就還原。
    window.toggleFsRoomBarCollapse = function() {
      const roomActive = document.getElementById('room-active');
      const btn = document.getElementById('fs-room-bar-collapse-btn');
      if (!roomActive) return;
      const collapsed = roomActive.classList.toggle('controls-collapsed');
      if (btn) {
        btn.innerText = collapsed ? '☰' : '➖';
        btn.title = collapsed ? '顯示控制列' : '收埋控制列';
      }
      // 收埋緊控制列嗰陣，背景音細面板（如果啱啱開緊）都會跟住俾隱藏
      // 咗嘅祖先元素蓋埋見唔到，順便都將個 display 狀態校正返做「關閉」，
      // 唔係遲啲重新顯示控制列會無啦啦見到個面板彈返出嚟
      if (collapsed) {
        const panel = document.getElementById('fs-bg-noise-panel');
        if (panel) panel.style.display = 'none';
      }
    };
    // 退出全螢幕／退房嗰陣還原返做「顯示緊」，唔好帶住「已收埋」嘅
    // 狀態去下一次入返全螢幕
    function resetFsRoomBarCollapse() {
      const roomActive = document.getElementById('room-active');
      const btn = document.getElementById('fs-room-bar-collapse-btn');
      if (roomActive) roomActive.classList.remove('controls-collapsed');
      if (btn) { btn.innerText = '➖'; btn.title = '收埋控制列'; }
    }

    // 表情反應平時收埋，撳個細圓掣先彈出嚟揀（唔係成日用，冇必要成
    // 日霸住畫面），揀完／再撳一次掣就會自動收返
    window.toggleEmojiReactionPanel = function() {
      const pop = document.getElementById('emoji-reaction-popover');
      if (!pop) return;
      pop.style.display = (pop.style.display === 'none' || !pop.style.display) ? 'flex' : 'none';
    };
    window.closeEmojiReactionPanel = function() {
      const pop = document.getElementById('emoji-reaction-popover');
      if (pop) pop.style.display = 'none';
    };

    // 之前一直用純 STUN，喺部分網路環境（例如其中一方喺較嚴格嘅 NAT／防火牆後面）
    // 好可能完全連唔通——訊號（Offer/Answer）交換得晒，但實際媒體流永遠過唔到，
    // 症狀就係一直卡喺「連線中」。而家加返一個公開嘅測試用 TURN 伺服器
    // （Metered Open Relay Project，官方公開提供嘅測試帳號，唔使自己註冊）。
    // 除錯用：同時寫入瀏覽器 Console 同埋畫面上嘅記錄面板，
    // 咁樣手機用戶（冇方便嘅開發者工具）都可以睇到同複製呢啲記錄
    function wrtcLog(msg) {
      console.log('[WebRTC] ' + msg);
      const panel = document.getElementById('webrtc-debug-log');
      if (!panel) return;
      const line = document.createElement('div');
      const time = new Date().toLocaleTimeString('zh-HK', { hour12: false });
      line.textContent = `${time}  ${msg}`;
      panel.appendChild(line);
      panel.scrollTop = panel.scrollHeight;
      while (panel.children.length > 80) panel.removeChild(panel.firstChild);
    }

    window.copyWebrtcLog = function() {
      const panel = document.getElementById('webrtc-debug-log');
      const text = panel ? Array.from(panel.children).map(el => el.textContent).join('\n') : '';
      navigator.clipboard.writeText(text || '（暫時未有記錄）').then(() => {
        window.showToast('已複製除錯記錄', '📋');
      }).catch(() => {
        window.showToast('複製失敗，請長按選取文字手動複製', '⚠️');
      });
    };

    const rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: 'turn:openrelay.metered.ca:443?transport=tcp',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ]
    };

    // ===================== 四格視窗 & 房間人數上限 =====================

    function getSlotElement(slotNum) {
      return document.getElementById('video-slot-' + slotNum);
    }

    // 將格 2/3/4 還原成「等待用家加入」的黑色佔位卡片
    function setSlotPlaceholder(slotNum) {
      const el = getSlotElement(slotNum);
      if (!el) return;
      el.className = 'video-card-single video-slot-placeholder';
      el.innerHTML = `
        <div class="slot-empty-inner">
          <div class="slot-empty-icon">➕</div>
          <p>等待用家加入...</p>
          <button class="btn btn-outline" type="button" style="margin-top:8px; font-size:13px; padding:5px 10px;" onclick="openInviteFriendModal()">🤝 邀請朋友</button>
        </div>
      `;
    }

    // 重置所有格子（返回大廳 / 離開房間時使用）
    function resetVideoSlots() {
      [2, 3, 4].forEach(setSlotPlaceholder);
      state.slotAssignments = {};
    }

    // 把某位遠端用家安排到一個空格，並回傳該格內的 <video> 元素供 WebRTC 串流使用
    function getOrCreateRemoteSlot(uid, name) {
      // 記住呢位遠端用家個名，畀之後連線斷咗要自動重連（createOfferTo 需要
      // 一個名嚟顯示）嗰陣用，唔使當時先至去問
      if (name) state.peerNames[uid] = name;
      let slotNum = state.slotAssignments[uid];

      if (!slotNum) {
        const taken = Object.values(state.slotAssignments);
        slotNum = [2, 3, 4].find(n => !taken.includes(n));
        if (!slotNum) return null; // 理論上不會發生，因為加入房間時已檢查人數上限
        state.slotAssignments[uid] = slotNum;
      }

      const el = getSlotElement(slotNum);
      if (!el) return null;

      if (!el.querySelector('video')) {
        el.className = 'video-card-single remote-video-card';
        el.innerHTML = `
          <video class="remote-video-element" autoplay playsinline muted></video>
          <div class="video-overlay" style="display:none;">
            <div class="avatar-circle" style="opacity:.6;">🚫</div>
            <p style="font-size:13px; color:#ccc; margin-top:6px;">對方鏡頭已關閉</p>
          </div>
          <div class="video-header">
            <span class="video-tag" style="cursor:pointer;" onclick="viewUserProfile('${uid}')" title="撳一下看資料／加好友">📹 ${name || '其他用家'}</span>
            <span class="video-tag" id="remote-host-badge-${slotNum}" style="background:#D9EBEF; color:#1E4550; display:none;">👑 房主</span>
            <span class="video-tag" id="stream-status-${uid}" style="background:#3E7A8A; color:#fff;">🔗 連線中...</span>
            <div class="video-more-menu-wrap">
              <span class="video-tag video-more-menu-toggle" onclick="event.stopPropagation(); window.toggleVideoMoreMenu('${uid}')" title="更多選項">⋮</span>
              <div class="video-more-menu-dropdown" id="video-more-menu-${uid}" style="display:none;">
                <button type="button" class="video-more-menu-item" id="transfer-host-btn-${uid}" style="display:none;" onclick="event.stopPropagation(); window.toggleVideoMoreMenu('${uid}'); window.transferHostTo('${uid}', '${(name||'呢位同學').replace(/'/g, "\\'")}')">👑 轉移房主給他</button>
                <button type="button" class="video-more-menu-item danger" id="kick-btn-${uid}" style="display:none;" onclick="event.stopPropagation(); window.toggleVideoMoreMenu('${uid}'); window.kickParticipant('${uid}', '${(name||'呢位同學').replace(/'/g, "\\'")}')">🚫 踢走呢位同學</button>
                <button type="button" class="video-more-menu-item danger" onclick="event.stopPropagation(); window.toggleVideoMoreMenu('${uid}'); window.openReportModal('${uid}', '${(name||'呢位同學').replace(/'/g, "\\'")}')">🚩 舉報呢位同學</button>
              </div>
            </div>
          </div>
          <div class="sticker-container-box"></div>
        `;
        // 呢個格岩岩先建立，如果佔用呢格嘅正正就係目前嘅房主，
        // 要即刻幫佢掛返個「👑 房主」牌，唔使等落一次房主轉移先反映到
        updateHostBadge();
      }
      return el.querySelector('video');
    }

    // 統一管理「👑 房主」牌應該掛喺邊一格：自己個格（isMyRoom）或者相應嘅
    // 遠端格（依 state.slotAssignments 揾返邊個 uid 對應邊一格）。每次房主
    // 轉移、有人新入房、或者岩岩開好房間嗰陣都要 call 呢個 function 重新整理一次。
    function updateHostBadge() {
      const hostUid = state.currentRoomHostUid;
      const myUid = window.currentUser ? window.currentUser.uid : null;

      const selfHostTag = document.getElementById('room-host-tag');
      if (selfHostTag) {
        if (hostUid && myUid && hostUid === myUid) {
          selfHostTag.style.display = 'flex';
          selfHostTag.innerText = '你是房主 👑';
        } else {
          selfHostTag.style.display = 'none';
          selfHostTag.innerText = '';
        }
      }

      [2, 3, 4].forEach(slotNum => {
        const badge = document.getElementById('remote-host-badge-' + slotNum);
        if (!badge) return;
        const uidInThisSlot = Object.keys(state.slotAssignments).find(u => state.slotAssignments[u] === slotNum);
        badge.style.display = (hostUid && uidInThisSlot && uidInThisSlot === hostUid) ? 'flex' : 'none';
      });

      // 「🚫 踢走」同「👑 轉移房主俾佢」呢兩個選項淨係房主先睇到（每個
      // 遠端格都有一粒，跟返 uid 唔跟 slotNum，因為換咗人入嗰格都要即刻
      // 更新返啱嘅顯示狀態）；兩者都收埋喺「⋮」下拉選單入面
      const amIHost = !!(state.isHost && myUid && hostUid === myUid);
      Object.keys(state.slotAssignments).forEach(uid => {
        const kickBtn = document.getElementById('kick-btn-' + uid);
        if (kickBtn) kickBtn.style.display = amIHost ? 'block' : 'none';
        const transferBtn = document.getElementById('transfer-host-btn-' + uid);
        if (transferBtn) transferBtn.style.display = amIHost ? 'block' : 'none';
      });
    }

    // 房主專用：將某位用家踢出房間。做法係喺房間文件加一個 bannedUids
    // 陣列，個目標用家自己個 client 會透過已經有嘅房間文件監聽（見
    // listenToParticipants 入面嗰個 roomDocUnsubscribe）發現自己被踢，
    // 自動執行「離開房間」嘅流程——唔使畀房主直接刪第二人嘅 participants
    // 文件（跨用戶寫入權限太危險，唔想開呢個口）。呢個名單會一直留喺
    // 房間文件度（唔會自動清走），所以俾踢走嘅人之後想撳「加入」返嚟
    // 同一間房都會俾 enterRoomSetup 擋返出去，直到呢間房執咗為止。
    window.kickParticipant = async function(targetUid, targetName) {
      if (!state.isHost || !state.currentRoomId || !window.db || !window.fs) return;
      if (!confirm(`確定要將「${targetName}」移出這個溫習房？他之後都唔可以再加入返呢間房。`)) return;
      try {
        await window.fs.updateDoc(window.fs.doc(window.db, 'rooms', state.currentRoomId), {
          bannedUids: window.fs.arrayUnion(targetUid)
        });
        window.showToast(`已將「${targetName}」移出房間，他唔可以再加入呢間房`, '🚫');
      } catch (e) {
        window.showToast('踢走失敗：' + (e.message || e), '❌');
      }
    };

    // 房主專用：將房主身份轉移俾房入面另一位用家。做法同 hostLeaveKeepRoom
    // 嗰個「自動揀最早入房嗰位」轉移邏輯一樣，都係淨係改返 rooms/{roomId}
    // 文件嘅 hostUid／hostName，唔同之處係呢度由房主自己揀邊個、亦唔會
    // 令房主本人離開房間——兩邊 client 都靠現有嘅 roomDocUnsubscribe
    // listener（見 listenToParticipants）自動偵測到 hostUid 變咗，即時
    // 更新返 state.isHost／👑 房主牌／邊個睇到「踢走、轉移房主」呢兩個
    // 選項，唔使額外寫多一套同步邏輯。
    window.transferHostTo = async function(targetUid, targetName) {
      if (!state.isHost || !state.currentRoomId || !window.db || !window.fs) return;
      if (!confirm(`確定要將房主身份轉移給「${targetName}」？轉移之後你會變返做普通成員，唔會再有踢人／轉移房主的權限。`)) return;
      try {
        await window.fs.updateDoc(window.fs.doc(window.db, 'rooms', state.currentRoomId), {
          hostUid: targetUid,
          hostName: targetName
        });
        window.showToast(`已將房主身份轉移給「${targetName}」`, '👑');
      } catch (e) {
        window.showToast('轉移房主失敗：' + (e.message || e), '❌');
      }
    };

    // ===================== 視訊格「⋮」更多選項選單 =====================
    // 踢走／轉移房主（房主專用，見 updateHostBadge 點樣控制顯示）同埋
    // 🚩 舉報（任何人都用到，為咗保障未成年用家安全）都收埋喺呢個選單
    // 入面，唔會好似獨立大掣咁顯眼，減少誤觸。舉報撳咗之後仲要揀原因
    // 先送到，一共要三個步驟先真正送出。

    window.toggleVideoMoreMenu = function(uid) {
      document.querySelectorAll('.video-more-menu-dropdown').forEach(el => {
        if (el.id !== 'video-more-menu-' + uid) el.style.display = 'none';
      });
      const menu = document.getElementById('video-more-menu-' + uid);
      if (menu) menu.style.display = (menu.style.display === 'block') ? 'none' : 'block';
    };
    // 撳呢粒「⋮」以外任何地方，開緊嘅選單都要自動收埋
    document.addEventListener('click', () => {
      document.querySelectorAll('.video-more-menu-dropdown').forEach(el => { el.style.display = 'none'; });
    });

    let pendingReportTarget = null; // { uid, name }
    let pendingReportScreenshot = null; // base64 data URL，或者 null（例如對方鏡頭關咗，截唔到）

    // 由對方個 <video> 元素度截低目前一幀畫面，縮細到最闊 480px 並用中等
    // 壓縮質素轉做 JPEG data URL，控制證據截圖嘅檔案大細（呢個 app 冇用
    // Firebase Storage，截圖係直接連同舉報記錄一齊存落 Firestore 文件，
    // 壓縮細啲可以確保穩陣噉喺 1MB 嘅文件大細上限之內）
    function captureRemoteVideoFrame(uid) {
      const slotNum = state.slotAssignments[uid];
      if (!slotNum) return null;
      const el = getSlotElement(slotNum);
      const videoEl = el ? el.querySelector('video') : null;
      if (!videoEl || !videoEl.videoWidth) return null;
      try {
        const maxWidth = 480;
        const scale = Math.min(1, maxWidth / videoEl.videoWidth);
        const w = Math.max(1, Math.round(videoEl.videoWidth * scale));
        const h = Math.max(1, Math.round(videoEl.videoHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        // <video> 元素本身有用 CSS transform:scaleX(-1) 校正返做自然方向
        // 畀人睇（見 .remote-video-element），但 drawImage 讀嘅係原始未經
        // CSS 校正嘅畫面資料，所以呢度都要用返同一個左右反轉，等截圖證據
        // 同截圖嗰一刻畫面上實際見到嘅方向一致，唔會令管理員睇到相反畫面
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoEl, 0, 0, w, h);
        return canvas.toDataURL('image/jpeg', 0.6);
      } catch (e) {
        console.error('截取舉報證據畫面失敗:', e);
        return null;
      }
    }

    // 撳「🚩 舉報呢位同學」嗰一刻即刻截圖（爭取第一時間留低證據，等用家
    // 之後填緊原因期間對方畫面已經變晒都唔緊要），然後先至彈個 modal
    // 出嚟畀用家揀舉報原因、加補充說明
    window.openReportModal = function(targetUid, targetName) {
      if (!window.currentUser) { window.showToast('請先登入', '⚠️'); return; }
      if (targetUid === window.currentUser.uid) { window.showToast('唔可以舉報返自己', '⚠️'); return; }
      pendingReportTarget = { uid: targetUid, name: targetName || '呢位同學' };
      pendingReportScreenshot = captureRemoteVideoFrame(targetUid);

      const nameEl = document.getElementById('report-target-name');
      if (nameEl) nameEl.innerText = pendingReportTarget.name;

      const previewWrap = document.getElementById('report-screenshot-wrap');
      const previewImg = document.getElementById('report-screenshot-preview');
      const missingEl = document.getElementById('report-screenshot-missing');
      if (pendingReportScreenshot) {
        if (previewImg) previewImg.src = pendingReportScreenshot;
        if (previewWrap) previewWrap.style.display = 'block';
        if (missingEl) missingEl.style.display = 'none';
      } else {
        if (previewWrap) previewWrap.style.display = 'none';
        if (missingEl) missingEl.style.display = 'block';
      }

      const reasonEl = document.getElementById('report-reason');
      const notesEl = document.getElementById('report-notes');
      if (reasonEl) reasonEl.value = '不當／不雅行為';
      if (notesEl) notesEl.value = '';

      openModal('modal-report-user');
    };

    window.closeReportModal = function() {
      closeModal('modal-report-user');
      pendingReportTarget = null;
      pendingReportScreenshot = null;
    };

    window.submitReport = async function() {
      if (!pendingReportTarget || !window.currentUser || !window.db || !window.fs) {
        window.showToast('舉報資料有錯，請重新再試', '❌'); return;
      }
      const btn = document.getElementById('report-submit-btn');
      const reasonEl = document.getElementById('report-reason');
      const notesEl = document.getElementById('report-notes');
      const reason = (reasonEl && reasonEl.value) || '其他';
      const notes = (notesEl && notesEl.value || '').trim();

      if (btn) { btn.disabled = true; btn.innerText = '⏳ 送緊出...'; }
      try {
        // 順便攞埋被舉報用家嘅帳號 ID／Email，等管理員唔使再自己查一次
        // 就知道實際要停權邊個帳戶
        let targetLoginId = '', targetEmail = '';
        try {
          const targetSnap = await window.fs.getDoc(window.fs.doc(window.db, 'users', pendingReportTarget.uid));
          if (targetSnap.exists()) {
            const td = targetSnap.data();
            targetLoginId = td.loginId || '';
            targetEmail = td.email || '';
          }
        } catch (e) {
          console.error('查詢被舉報用家資料失敗（唔影響舉報送出）:', e);
        }

        await window.fs.addDoc(window.fs.collection(window.db, 'reports'), {
          reporterUid: window.currentUser.uid,
          reporterName: window.currentUser.username || '同學',
          reporterLoginId: window.currentUser.loginId || '',
          reportedUid: pendingReportTarget.uid,
          reportedName: pendingReportTarget.name,
          reportedLoginId: targetLoginId,
          reportedEmail: targetEmail,
          roomId: state.currentRoomId || '',
          roomName: (document.getElementById('active-room-title') || {}).innerText || '',
          reason,
          notes,
          screenshot: pendingReportScreenshot || null,
          status: 'pending',
          createdAt: Date.now()
        });

        window.showToast('已送出舉報，管理員會盡快跟進，多謝你保障大家的安全 🙏', '🚩');
        window.closeReportModal();
      } catch (e) {
        window.showToast('舉報送出失敗：' + (e.message || e), '❌');
      } finally {
        if (btn) { btn.disabled = false; btn.innerText = '🚩 確認送出舉報'; }
      }
    };

    // 依對方目前的鏡頭開關狀態，顯示／隱藏「對方鏡頭已關閉」的黑色遮罩
    // （這樣關閉自己鏡頭的一方也不會誤以為對方畫面卡住，而是清楚顯示鏡頭已關閉）
    function updateRemoteSlotCameraState(uid, cameraOn) {
      const slotNum = state.slotAssignments[uid];
      if (!slotNum) return;
      const el = getSlotElement(slotNum);
      if (!el) return;
      const overlay = el.querySelector('.video-overlay');
      if (overlay) overlay.style.display = cameraOn ? 'none' : 'flex';
    }

    // 跟返對方廣播落嚟嘅鏡頭方向角度（見 broadcastMyCameraRotation），
    // 喺 .remote-video-element 度加返對應嘅 CSS rotate，等對方打橫
    // 手機嗰陣，自己度睇到嘅都自動跟住轉返啱方向。
    //
    // 註：曾經試過畀 90／270 度加返 CSS rotate 做旋轉修正，但用戶實測
    // 反覆推算之後發現，對呢部 iPhone 嚟講 90／270 度嗰陣根本唔使外
    // 加任何旋轉（裝置／瀏覽器已經自行處理咗），我哋之前加嘅旋轉先係
    // 令佢變錯嘅元兇（見 startCanvasRenderLoop 嗰邊完全一樣嘅註解）。
    // 所以而家 90／270 度都唔再加 CSS rotate，淨係保留 180 度（倒轉）
    // 先要特別處理。
    function updateRemoteSlotRotation(uid, angle) {
      const slotNum = state.slotAssignments[uid];
      if (!slotNum) return;
      const el = getSlotElement(slotNum);
      if (!el) return;
      const video = el.querySelector('.remote-video-element');
      if (!video) return;
      if (angle === 180) {
        video.style.transform = 'scaleX(-1) rotate(180deg)';
      } else {
        video.style.transform = ''; // 跟返 CSS class 預設嘅 scaleX(-1) 就夠
      }
    }

    // 收到對方實際的視訊畫面（track）後，把狀態標籤改成「即時串流」
    function markSlotLive(uid) {
      const statusTag = document.getElementById('stream-status-' + uid);
      if (statusTag) {
        statusTag.style.background = '#D2C4AD';
        statusTag.innerText = '🟢 即時串流';
      }
    }

    // 用家離開房間時，釋放其佔用的格子
    function releaseRemoteSlot(uid) {
      const slotNum = state.slotAssignments[uid];
      if (!slotNum) return;
      delete state.slotAssignments[uid];
      setSlotPlaceholder(slotNum);

      if (state.peerConnections[uid]) {
        state.peerConnections[uid].close();
        delete state.peerConnections[uid];
      }
    }

    function updateParticipantCountUI(count) {
      const countEl = document.getElementById('room-participant-count');
      const tagEl = document.getElementById('room-capacity-tag');
      if (countEl) countEl.innerText = count;
      if (tagEl) tagEl.classList.toggle('full', count >= ROOM_CAPACITY);
    }

    // 進入房間前檢查人數上限，未滿則寫入自己的 participants 紀錄。回傳 true/false 代表能否加入
    async function joinRoomParticipants(roomId) {
      const myUid = window.currentUser.uid;
      const participantsRef = window.fs.collection(window.db, "rooms", roomId, "participants");

      const snapshot = await window.fs.getDocs(participantsRef);
      const existingUids = snapshot.docs.map(d => d.id);
      const alreadyIn = existingUids.includes(myUid);

      if (!alreadyIn && existingUids.length >= ROOM_CAPACITY) {
        return false; // 房間已滿 4 人，禁止加入
      }

      await window.fs.setDoc(window.fs.doc(window.db, "rooms", roomId, "participants", myUid), {
        uid: myUid,
        name: window.currentUser.username || '同學',
        joinedAt: Date.now(),
        cameraOn: false
      });

      // 同步更新房間文件的人數統計，等大廳嘅房間卡片可以即時顯示「👥 X/4 人」
      if (!alreadyIn) {
        try {
          await window.fs.updateDoc(window.fs.doc(window.db, "rooms", roomId), {
            participantCount: window.fs.increment(1)
          });
        } catch (e) {
          console.error("更新房間人數失敗:", e);
        }
      }

      return true;
    }

    // 把自己目前鏡頭開／關的狀態寫回 participants 文件，讓其他人看到正確的「鏡頭已關閉」提示
    async function updateMyCameraStatus(cameraOn) {
      if (!window.currentUser || !state.currentRoomId || !window.db) return;
      try {
        await window.fs.setDoc(window.fs.doc(window.db, "rooms", state.currentRoomId, "participants", window.currentUser.uid), {
          cameraOn
        }, { merge: true });
      } catch (e) {
        console.error("更新鏡頭狀態失敗:", e);
      }
    }

    // 廣播自己目前嘅鏡頭方向角度（見 getScreenOrientationAngle），
    // 等其他人個瀏覽器可以喺顯示層（.remote-video-element）加返同一個
    // CSS 旋轉，令佢哋睇你個畫面都係啱方向——特登唔改實際送出去嗰條
    // WebRTC 視訊軌道（同 .remote-video-element 嗰個鏡像修正用返一樣
    // 嘅思路：改顯示層，唔改軌道本身，成本低好多亦唔會影響到連線）。
    async function broadcastMyCameraRotation() {
      if (!window.currentUser || !state.currentRoomId || !window.db || !state.isCameraOn) return;
      try {
        await window.fs.setDoc(window.fs.doc(window.db, "rooms", state.currentRoomId, "participants", window.currentUser.uid), {
          camRotation: getScreenOrientationAngle()
        }, { merge: true });
      } catch (e) {
        console.error("更新鏡頭方向失敗:", e);
      }
    }

    // 監聽房間目前的用家名單，動態分配 / 釋放格子，並更新人數顯示
    function listenToParticipants(roomId) {
      if (state.participantsUnsubscribe) state.participantsUnsubscribe();

      const participantsRef = window.fs.collection(window.db, "rooms", roomId, "participants");
      state.participantsUnsubscribe = window.fs.onSnapshot(participantsRef, (snapshot) => {
        const myUid = window.currentUser ? window.currentUser.uid : null;
        const others = snapshot.docs
          .map(d => d.data())
          .filter(p => p.uid !== myUid)
          .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));

        const currentUids = others.map(p => p.uid);

        // 釋放已離開的用家所佔用的格子
        Object.keys(state.slotAssignments).forEach(uid => {
          if (!currentUids.includes(uid)) releaseRemoteSlot(uid);
        });

        // 為在場但尚未分配格子的用家安排格子（僅顯示佔位，鏡頭畫面待 WebRTC 連線後填入）
        // 並同步「對方鏡頭是否開啟」的狀態，讓對方關鏡頭時能正確顯示「鏡頭已關閉」而不是卡住的畫面
        others.forEach(p => {
          if (!state.slotAssignments[p.uid]) getOrCreateRemoteSlot(p.uid, p.name);
          updateRemoteSlotCameraState(p.uid, !!p.cameraOn);
          updateRemoteSlotRotation(p.uid, p.camRotation || 0);
        });

        // 保險起見再掃一次：格子分配一有變動（新人入房／有人走咗），
        // 就重新確認「👑 房主」牌仍然掛喺啱嘅格度
        updateHostBadge();

        updateParticipantCountUI(snapshot.size);
      });

      // 同時監聽房間文件本身：若房主選擇「關閉房間」刪咗個文件，
      // 其他仍然在房的成員會即時被踢返大廳
      if (state.roomDocUnsubscribe) state.roomDocUnsubscribe();
      const roomDocRef = window.fs.doc(window.db, "rooms", roomId);
      let isFirstRoomSnapshot = true;
      state.roomDocUnsubscribe = window.fs.onSnapshot(roomDocRef, (docSnap) => {
        if (isFirstRoomSnapshot) { isFirstRoomSnapshot = false; return; }
        if (!docSnap.exists()) {
          // 房間文件被刪除（房主關閉房間）
          cleanupRoomConnections();
          document.getElementById('room-active').style.display = 'none';
          document.getElementById('room-lobby').style.display = 'block';
          window.showToast('房主已關閉房間，你已被移返大廳', '🚪');
        } else {
          // 房主轉移：更新邊個係房主，「👑 房主」牌會由 updateHostBadge()
          // 自動掛去返正確嗰一格（自己個格或者相應嘅遠端格）
          const data = docSnap.data();
          if (data && data.hostUid) {
            state.isHost = !!(window.currentUser && data.hostUid === window.currentUser.uid);
            state.currentRoomHostUid = data.hostUid;
            updateHostBadge();
          }

          // 檢查自己係咪俾房主踢咗出嚟（見 window.kickParticipant）。
          // bannedUids 呢個名單唔會自動清走，所以之後想撳「加入」返嚟都會
          // 俾 enterRoomSetup 嗰個檢查擋返出去，唔可以再入返嚟。
          const myUid = window.currentUser ? window.currentUser.uid : null;
          if (myUid && data && Array.isArray(data.bannedUids) && data.bannedUids.includes(myUid)) {
            doLeaveRoom(false, '你已被房主移出這個溫習房，之後都唔可以再加入 🚫');
          }
        }
      });
    }

    // 離開房間時，移除自己的 participants 紀錄並停止監聽
    async function leaveRoomParticipants() {
      if (state.participantsUnsubscribe) {
        state.participantsUnsubscribe();
        state.participantsUnsubscribe = null;
      }
      if (state.currentRoomId && window.currentUser && window.db && window.fs) {
        const roomId = state.currentRoomId;
        try {
          await window.fs.deleteDoc(window.fs.doc(window.db, "rooms", roomId, "participants", window.currentUser.uid));

          // 檢查係咪最後一個人走：如果房入面已經冇任何人，就連房間本身都一拼
          // 刪走，唔好留低一間「0/4 人但仲顯示直播中」嘅幽靈房喺大廳。
          const remainingSnap = await window.fs.getDocs(window.fs.collection(window.db, "rooms", roomId, "participants"));
          if (remainingSnap.empty) {
            await window.fs.deleteDoc(window.fs.doc(window.db, "rooms", roomId)).catch(() => {});
          } else {
            await window.fs.updateDoc(window.fs.doc(window.db, "rooms", roomId), {
              participantCount: window.fs.increment(-1)
            });
          }
        } catch (e) {
          console.error("移除房間人數紀錄失敗:", e);
        }
      }
    }

    // 分頁關閉 / 重新整理時盡量清理自己的 participants 紀錄。
    // 呢個 handler 盡量重現 leaveRoomParticipants()（正式退房流程）嘅邏輯：
    // 刪走自己個 participant 紀錄之後，check 埋房入面係咪已經冇晒人，如果
    // 自己啱啱好係最後一個，就連房間文件本身都一拼刪走，唔好留低一間
    // 「0/4 人但仲顯示🟢直播中」嘅幽靈房喺大廳（見用家反映嘅問題）。
    // ⚠️ 注意：beforeunload 入面嘅 async 操作，瀏覽器唔保證一定會俾佢行
    // 完先關閉分頁（尤其係要兩個來回嘅 getDocs→deleteDoc），所以呢度只
    // 係盡做，唔可以完全倚賴——大廳嗰邊嘅 gcStaleRooms 快速清理（見上面
    // EMPTY_ROOM_GRACE_MS）同埋原本嘅 5 分鐘冇心跳清理機制會做埋後備。
    window.addEventListener('beforeunload', () => {
      if (state.currentRoomId && window.currentUser && window.db && window.fs) {
        const roomId = state.currentRoomId;
        const myUid = window.currentUser.uid;
        window.fs.deleteDoc(window.fs.doc(window.db, "rooms", roomId, "participants", myUid)).catch(() => {});
        window.fs.getDocs(window.fs.collection(window.db, "rooms", roomId, "participants")).then(snap => {
          const remaining = snap.docs.filter(d => d.id !== myUid);
          if (remaining.length === 0) {
            window.fs.deleteDoc(window.fs.doc(window.db, "rooms", roomId)).catch(() => {});
          } else {
            window.fs.updateDoc(window.fs.doc(window.db, "rooms", roomId), {
              participantCount: window.fs.increment(-1)
            }).catch(() => {});
          }
        }).catch(() => {
          // 連讀取都失敗嘅話，至少退返舊做法扣返個人數
          window.fs.updateDoc(window.fs.doc(window.db, "rooms", roomId), {
            participantCount: window.fs.increment(-1)
          }).catch(() => {});
        });
      }
    });

    window.handleCreateRoomSubmit = async function(e) {
      e.preventDefault();

      // 防止撳「立即建立並廣播」撳得太快／連撳幾下：第一下撳落嗰陣，
      // setDoc 仲未完成（await 緊）之前，畫面上個掣睇落去同平時冇分別，
      // 好易再撳多一兩下，每一下都各自跑一次呢個 function、各自建立多一間
      // 房間，於是大廳度就會同時出現幾間內容一模一樣嘅房。而家加返個鎖，
      // 建立緊嗰陣期間嘅任何額外呼叫都直接忽略；同時將個掣停用並改文字，
      // 等使用者都睇得出「已經處理緊，唔使再撳」。
      if (state.creatingRoom) {
        return;
      }

      if (!window.currentUser || !window.db || !window.fs) {
        window.showToast("請先登入會員", "⚠️");
        return;
      }

      state.creatingRoom = true;
      const submitBtn = document.getElementById('btn-create-room-submit');
      const originalBtnText = submitBtn ? submitBtn.innerText : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = '⏳ 建立緊…';
      }

      try {
        const roomName = document.getElementById('modal-room-name').value.trim();
        const subject = document.getElementById('modal-room-subject').value;
        const durationMins = parseInt(document.getElementById('modal-room-duration').value, 10);

        const roomId = 'room_' + Date.now();
        const createdAt = Date.now();
        const roomData = {
          name: roomName,
          subject: subject,
          duration: durationMins,
          hostUid: window.currentUser.uid,
          hostName: window.currentUser.username || '匿名同學',
          participantCount: 0,
          createdAt: createdAt,
          lastActiveAt: createdAt // 心跳時間戳，畀幽靈房自動清理機制用（見 gcStaleRooms）
        };

        await window.fs.setDoc(window.fs.doc(window.db, "rooms", roomId), roomData);
        closeModal('modal-create-room');

        await enterRoomSetup(roomId, roomName, subject, durationMins, window.currentUser.username || '匿名同學', true, createdAt, window.currentUser.uid);
        window.showToast("🚀 溫習房建立成功並已廣播至公開大廳！", "✨");
      } catch (err) {
        window.showToast("建立房間失敗: " + err.message, "❌");
      } finally {
        state.creatingRoom = false;
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerText = originalBtnText || '🚀 立即建立並廣播';
        }
      }
    };

    window.joinPublicRoom = async function(roomId, roomName, subject, durationMins, hostName, isMyRoom, createdAt, hostUid) {
      const success = await enterRoomSetup(roomId, roomName, subject, durationMins, hostName, isMyRoom, createdAt, hostUid);
      if (success) {
        window.showToast(`成功加入「${roomName}」！`, "🦦");
      }
    };

    async function enterRoomSetup(roomId, roomName, subject, durationMins, hostName, isMyRoom, createdAt, hostUid) {
      if (!window.currentUser || !window.db || !window.fs) {
        window.showToast("請先登入會員", "⚠️");
        return false;
      }

      // 曾經俾房主踢走過嘅用家唔可以再加入返呢間房（bannedUids 名單一直
      // 留喺房間文件度，唔會自動清走，見 window.kickParticipant）
      try {
        const roomCheckSnap = await window.fs.getDoc(window.fs.doc(window.db, 'rooms', roomId));
        const roomCheckData = roomCheckSnap.exists() ? roomCheckSnap.data() : null;
        if (roomCheckData && Array.isArray(roomCheckData.bannedUids) && roomCheckData.bannedUids.includes(window.currentUser.uid)) {
          window.showToast('你已經給房主移出過呢間房，唔可以再加入', '🚫');
          return false;
        }
      } catch (e) {
        console.error('檢查房間封鎖名單失敗:', e);
      }

      // 房間人數上限檢查：最多 4 人同時使用同一個房間
      const canJoin = await joinRoomParticipants(roomId);
      if (!canJoin) {
        window.showToast(`房間已滿（${ROOM_CAPACITY}/${ROOM_CAPACITY}），暫時無法加入`, "🚫");
        return false;
      }

      // 呢一刻即係真正「入咗視訊溫習室」——唔理房主定參加者、唔理留幾耐，
      // 溫習日曆同「連續溫習日」都當今日有溫習
      if (typeof window.recordStudyDayIfNeeded === 'function') window.recordStudyDayIfNeeded();

      state.currentRoomId = roomId;
      state.isHost = isMyRoom;
      // 「👑 房主」牌而家改為掛喺真正房主本人嗰一格（自己或者遠端），
      // 唔再淨係得自己個格出現一句固定文字，見返 updateHostBadge()
      state.currentRoomHostUid = isMyRoom ? window.currentUser.uid : (hostUid || null);

      document.getElementById('active-room-title').innerText = roomName;
      document.getElementById('active-room-subject').innerText = subject;
      updateHostBadge();

      // 用「房間建立時間」而非「進入房間時間」起計倒數，確保所有人睇到一致嘅剩餘時間
      const totalSeconds = (durationMins || 30) * 60;
      let remainingSeconds = totalSeconds;
      if (createdAt) {
        const elapsedSeconds = Math.floor((Date.now() - createdAt) / 1000);
        remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);
      }
      state.remainingSeconds = remainingSeconds;
      // 房主揀嘅「目標時間」而家變成「番茄鐘」每一輪嘅專注長度，
      // 專注完會自動小休 5 分鐘，再自動開始新一輪專注，一直循環到退房為止
      state.pomodoroPhase = 'focus';
      state.focusDurationSeconds = totalSeconds;
      state.pomodoroCyclesCompleted = 0; // 每次新入房，「已完成番茄鐘」由 0 開始儲
      state.roomTotalSeconds = 0; // 每次新入房，「呢間房總溫習時間」由 0 開始順時計
      updateTimerDisplay();

      resetVideoSlots();
      document.getElementById('room-lobby').style.display = 'none';
      document.getElementById('room-active').style.display = 'block';
      // 「視訊溫習室」呢個畫面本身淨係喺「視訊溫習室」分頁入面，如果用家係
      // 喺第二個分頁（例如撳咗朋友邀請彈窗）先接受入房，一定要連埋分頁都
      // 一齊切返去，唔係個房間狀態變咗但畫面仲留喺原本嗰頁，睇落好似冇反應
      if (typeof window.switchTab === 'function') window.switchTab('room');

      startTimer();
      listenToRoomSignaling(roomId);
      listenToParticipants(roomId);
      listenToReactions(roomId);
      startRoomHeartbeat();
      startPresenceCheckLoop();

      // 一入房就廣播上線通知並接駁現有用家，唔再要求「一定要開咗鏡頭先可以睇到人」
      await broadcastPresenceAndConnect();
      await connectToExistingPeers(roomId);
      return true;
    }

    // 房間心跳：每 45 秒更新一次 lastActiveAt，等大廳嗰邊嘅幽靈房自動清理
    // 機制（gcStaleRooms）識別到「呢間房仲有人喺度」，唔會誤刪。就算冇人特登
    // 用鏡頭／做嘢，只要個分頁仲開住喺房入面，心跳就會繼續跳。
    const ROOM_HEARTBEAT_INTERVAL_MS = 45 * 1000;
    function startRoomHeartbeat() {
      if (state.heartbeatTimer) clearInterval(state.heartbeatTimer);
      state.heartbeatTimer = setInterval(async () => {
        if (!state.currentRoomId || !window.db || !window.fs) return;
        try {
          await window.fs.updateDoc(window.fs.doc(window.db, "rooms", state.currentRoomId), {
            lastActiveAt: Date.now()
          });
        } catch (e) { /* 房間可能已經被刪走，忽略 */ }
      }, ROOM_HEARTBEAT_INTERVAL_MS);
    }

    window.deleteRoomQuick = async function(roomId) {
      if (!window.db || !window.fs) return;
      try {
        await window.fs.deleteDoc(window.fs.doc(window.db, "rooms", roomId));
        window.showToast("已刪除該溫習房", "🗑️");
      } catch (err) {
        window.showToast("刪除失敗", "❌");
      }
    };

    // ===================== 專注背景音（真實錄音 MP3，循環播放）=====================
    // 之前用 Web Audio API 即時合成雜訊，後來改用管理員提供嘅 ElevenLabs
    // 錄音（放喺 sound/ 資料夾），音質靚好多，所以呢度改用簡單嘅
    // <audio loop> 方式播放，唔再需要濾波器/雜訊合成嗰套邏輯。
    const BG_SOUND_FILES = {
      white: { label: '白噪音',        file: 'sound/white-noise.mp3' },
      rain1: { label: '雨聲 1',        file: 'sound/rain-1.mp3' },
      rain2: { label: '雨聲 2',        file: 'sound/rain-2.mp3' },
      cafe1: { label: '咖啡室環境聲 1', file: 'sound/cafe-1.mp3' },
      cafe2: { label: '咖啡室環境聲 2', file: 'sound/cafe-2.mp3' },
      train1: { label: '火車聲 1',      file: 'sound/train-1.mp3' },
      train2: { label: '火車聲 2',      file: 'sound/train-2.mp3' }
    };

    let bgAudioEl = null;

    // 背景音而家有兩組控制項會同時存在喺畫面度：一組喺正常（非全螢幕）
    // room-bar 度（id 前綴 bg-noise-），一組喺全螢幕專用嘅細面板度（id
    // 前綴 fs-bg-noise-，平時收埋，撳「🔊 背景音」先打開）。兩組控制項
    // 揀嘅嘢一定要保持一致，唔理你喺邊一組度操作，所以呢度用呢個共用
    // helper 揸住呢兩組 id，逐樣同步返個值/狀態。
    const BG_NOISE_SELECT_IDS = ['bg-noise-select', 'fs-bg-noise-select'];
    const BG_NOISE_VOLUME_IDS = ['bg-noise-volume', 'fs-bg-noise-volume'];
    const BG_NOISE_PAUSE_BTN_IDS = ['bg-noise-pause-btn', 'fs-bg-noise-pause-btn'];

    function stopBgNoise() {
      if (bgAudioEl) {
        bgAudioEl.pause();
        bgAudioEl.src = '';
        bgAudioEl = null;
      }
      updateBgNoisePauseBtn();
    }

    // 暫停／繼續已經在播緊嘅背景音，唔會好似之前咁樣完全停咗再要重新
    // 揀一次先再播（會由頭開始播），保留返播放緊嗰個位置。
    window.toggleBgNoisePause = function() {
      if (!bgAudioEl) return;
      if (bgAudioEl.paused) {
        bgAudioEl.play().catch((err) => {
          console.warn('背景音繼續播放失敗：', err);
        });
      } else {
        bgAudioEl.pause();
      }
      updateBgNoisePauseBtn();
    };

    function updateBgNoisePauseBtn() {
      const hasSound = !!bgAudioEl;
      const isPaused = hasSound && bgAudioEl.paused;
      BG_NOISE_PAUSE_BTN_IDS.forEach(id => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.disabled = !hasSound;
        btn.innerText = isPaused ? '▶️' : '⏸️';
        btn.style.opacity = hasSound ? '1' : '.4';
      });
    }

    window.setBgNoiseType = function(type) {
      stopBgNoise();
      // 兩組背景音控制項嘅揀選狀態要同步——例如喺全螢幕細面板度揀咗
      // 「雨聲 1」，退返出全螢幕之後，正常嗰組 select 都應該顯示緊
      // 「雨聲 1」，唔應該打回「關閉」
      BG_NOISE_SELECT_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = type;
      });
      if (type === 'off') return;
      const preset = BG_SOUND_FILES[type];
      if (!preset) return;

      bgAudioEl = new Audio(preset.file);
      bgAudioEl.loop = true;
      const volEl = document.getElementById('bg-noise-volume');
      bgAudioEl.volume = volEl ? parseFloat(volEl.value) : 0.39;
      // play() 係 async，未必即刻 resolve/reject，先即刻更新一次暫停掣
      // 狀態（呢個時候 bgAudioEl 已經存在，暫停掣應該即刻變得撳）,
      // 等 play() 真正有結果之後、下面 .then()/.catch() 再校正返
      // 播放中／暫停緊嘅圖示
      updateBgNoisePauseBtn();
      bgAudioEl.play().then(() => {
        updateBgNoisePauseBtn();
      }).catch((err) => {
        // 大部分瀏覽器要求音頻播放一定要響用戶手動操作（呢度即係揀 select）
        // 入面觸發先得，正常情況呢度唔會撞到，但都保留錯誤處理以防萬一
        console.warn('背景音播放失敗：', err);
        window.showToast('背景音播放失敗，請再揀一次', '⚠️');
        updateBgNoisePauseBtn();
      });
    };

    window.setBgNoiseVolume = function(vol) {
      BG_NOISE_VOLUME_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = vol;
      });
      if (bgAudioEl) bgAudioEl.volume = parseFloat(vol);
    };

    // 全螢幕入面「🔊 背景音」呢粒掣：平時（唔係全螢幕）呢個位置收埋
    // 晒，一入到全螢幕先現形（見 CSS .fs-bg-noise-only）；掣本身撳一下
    // 就開／關個細面板，等用戶有需要至打開嚟揀，唔會成塊全螢幕視訊畫面
    // 都長期霸住呢個控制列位置。
    //
    // 面板用 position:fixed（見 HTML 度個註解），所以要用 JS 計實際
    // 座標——按「🔊 背景音」呢粒掣而家喺畫面邊度（getBoundingClientRect），
    // 揀返貼近掣、又唔會出晒螢幕邊界嘅位置（橫向全螢幕嗰陣 room-bar
    // 喺右手邊窄條，面板應該向左伸展；直向全螢幕 room-bar 喺頂部，面板
    // 應該喺掣下面伸展），先至唔會好似之前咁樣一部分俾窄條裁走、顯示唔晒。
    function positionFsBgNoisePanel() {
      const btn = document.getElementById('fs-bg-noise-toggle-btn');
      const panel = document.getElementById('fs-bg-noise-panel');
      if (!btn || !panel) return;
      const margin = 8;
      const btnRect = btn.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const panelW = panelRect.width || 170;
      const panelH = panelRect.height || 120;

      // 先試「貼喺掣個右邊」，出晒界先改做「貼喺掣個左邊」；
      // 兩邊都唔夠位（例如窄手機直向）就索性同螢幕右邊界留返個 margin
      let left = btn.getBoundingClientRect().right + margin;
      if (left + panelW > window.innerWidth - margin) {
        left = btnRect.left - panelW - margin;
      }
      if (left < margin) left = Math.max(margin, window.innerWidth - panelW - margin);

      // 垂直方向：先試同粒掣頂對齊，出晒螢幕下邊界先向上挪返
      let top = btnRect.top;
      if (top + panelH > window.innerHeight - margin) {
        top = window.innerHeight - panelH - margin;
      }
      if (top < margin) top = margin;

      panel.style.left = left + 'px';
      panel.style.top = top + 'px';
    }

    window.toggleFsBgNoisePanel = function() {
      const panel = document.getElementById('fs-bg-noise-panel');
      if (!panel) return;
      const willOpen = panel.style.display !== 'flex';
      if (willOpen) {
        // 要先擺出嚟先量到 panelRect 嘅實際闊高，所以分兩步：
        // 隱形咁擺出嚟度尺 → 計位 → 先真正顯示
        panel.style.visibility = 'hidden';
        panel.style.display = 'flex';
        positionFsBgNoisePanel();
        panel.style.visibility = 'visible';
      } else {
        panel.style.display = 'none';
      }
    };

    // 轉螢幕方向／窗口大細變咗（例如手機由直向轉橫向）嗰陣，如果個
    // 背景音面板啱啱好開緊，要即時重新計位，唔係就會停留喺轉向之前
    // 嗰個已經唔啱嘅座標
    window.addEventListener('resize', () => {
      const panel = document.getElementById('fs-bg-noise-panel');
      if (panel && panel.style.display === 'flex') positionFsBgNoisePanel();
    });
    window.addEventListener('orientationchange', () => {
      const panel = document.getElementById('fs-bg-noise-panel');
      if (panel && panel.style.display === 'flex') setTimeout(positionFsBgNoisePanel, 100);
    });

    function startTimer() {
      if (state.countdownTimer) clearInterval(state.countdownTimer);

      // 房入面嘅計時器而家係「番茄鐘」循環：專注 → 小休 → 專注 → 小休……
      // 一直到退房為止先停。追蹤依家呢一輪（專注／小休）已經過咗幾多秒，
      // 專注階段每滿 60 秒獎勵 1 PTS，小休階段唔計分（避免同時計分令獎勵翻倍）。
      let secondsElapsedInPhase = 0;

      // 依家嘅年輕學生專注力普遍比較弱，成段專注時間（例如 40 分鐘）一次過睇落
      // 好遙遠、好難捱到終點。所以將專注階段拆做 4 個「小目標」（大約每 1/4 時長
      // 一個），每達成一個就即時彈提示鼓勵一下、個底部進度條都會一段一段咁儲滿，
      // 等學生睇到自己一步步接近終點，而唔係得一條望唔到盡頭嘅長 bar。
      let lastQuarterMilestoneShown = 0;

      state.countdownTimer = setInterval(async () => {
        // 「呢間房總溫習時間」順時累加：淨係喺無被判定為閒置（awardingPaused）
        // 嘅時候先計，同積分／時數嘅暫停邏輯保持一致
        if (!state.awardingPaused) {
          state.roomTotalSeconds = (state.roomTotalSeconds || 0) + 1;
        }

        if (state.remainingSeconds > 0) {
          state.remainingSeconds--;
          secondsElapsedInPhase++;
          updateTimerDisplay();

          if (state.pomodoroPhase === 'focus' && secondsElapsedInPhase % 60 === 0 && !state.awardingPaused) {
            // 每滿 60 秒真正嘅專注時間，除咗畀 1 PTS，仲要累加 1/60 小時到
            // 「累積溫習時數」度，等個時數可以同視訊房嘅實際專注時間掛鈎
            awardStudyPoint(1, 1 / 60);
          }

          if (state.pomodoroPhase === 'focus' && !state.awardingPaused) {
            const quarterSeconds = Math.max(60, Math.round((state.focusDurationSeconds || 1) / 4));
            const quartersDone = Math.min(4, Math.floor(secondsElapsedInPhase / quarterSeconds));
            // 第 4 個小目標其實即係「成輪專注完成」，留返俾下面嗰個「番茄鐘完成」
            // 提示去講就夠，唔使呢度重複彈多次
            if (quartersDone > lastQuarterMilestoneShown && quartersDone < 4) {
              lastQuarterMilestoneShown = quartersDone;
              window.showToast(`🎯 小目標達成！已完成 ${quartersDone}/4 段，繼續加油～`, '🌟');
            }
          }
        } else {
          secondsElapsedInPhase = 0;
          lastQuarterMilestoneShown = 0;
          if (state.pomodoroPhase === 'focus') {
            state.pomodoroPhase = 'break';
            state.remainingSeconds = ROOM_POMODORO_BREAK_SECONDS;
            state.pomodoroCyclesCompleted = (state.pomodoroCyclesCompleted || 0) + 1;
            window.showToast(`🍅 第 ${state.pomodoroCyclesCompleted} 個番茄鐘完成！小休 5 分鐘啦～`, '🎉');
          } else {
            state.pomodoroPhase = 'focus';
            state.remainingSeconds = state.focusDurationSeconds;
            window.showToast('☕ 小休完畢，開始新一輪專注！', '🍅');
          }
          updateTimerDisplay();
        }
      }, 1000);
    }

    // hoursIncrement：呢次要累加幾多小時到「累積溫習時數」（users.hours），
    // 淨係房入面實際專注嘅每一分鐘先會傳呢個值（1/60），其他獎勵（例如溫習卡
    // 複習、「仲喺度嗎」確認嘅額外 PTS）唔代表真正流逝咗嘅專注時間，所以預設
    // 唔會影響時數，避免將時數同「賺咗幾多分」混埋一齊。
    async function awardStudyPoint(pointsAmount, hoursIncrement) {
      pointsAmount = (typeof pointsAmount === 'number' && pointsAmount > 0) ? pointsAmount : 1;
      hoursIncrement = (typeof hoursIncrement === 'number' && hoursIncrement > 0) ? hoursIncrement : 0;

      // 更新畫面
      const ptsEl = document.getElementById('stat-points');
      if (ptsEl) {
        const current = parseInt(ptsEl.innerText || '0');
        ptsEl.innerText = current + pointsAmount;
        syncGachaPtsDisplay();
        const homePts = document.getElementById('home-stat-pts');
        if (homePts) homePts.innerText = current + pointsAmount;
      }

      // 簡短閃亮提示（唔彈 toast 避免騷擾）
      if (ptsEl) {
        ptsEl.style.transition = 'color .3s';
        ptsEl.style.color = '#D9C9B5';
        setTimeout(() => { ptsEl.style.color = ''; }, 800);
      }

      if (!window.currentUser || !window.db || !window.fs) return;

      const expPerPoint = (LEVEL_CONFIG && typeof LEVEL_CONFIG.expPerMinute === 'number') ? LEVEL_CONFIG.expPerMinute : 1;
      const expGain = expPerPoint * pointsAmount;
      // 「今日目標」同一次處理埋：如果 todayDate 仲係今日就當「今日累積」加多
      // 1 分鐘，如果隔咗一日（或者未設過）就當呢分鐘係新一日嘅第一分鐘。
      const isNewDay = hoursIncrement > 0 && window.currentUser.todayDate !== getTodayDateStr();

      // 先喺本機即刻更新（唔等 Firestore 寫入成功先至反映畫面）——同 PTS 顯示
      // 用返一致嘅「樂觀更新」做法。之前呢部份寫喺 await 寫入成功之後先做，
      // 一旦嗰次寫入因為網絡問題（例如視訊房用緊頻寬）而失敗，「今日目標」
      // 同「累積時數」就會靜靜雞停咗，睇落好似溫咗好耐都冇進度，但實際上
      // 個問題係個更新本身冧咗、唔係冇儲夠鐘。而家改為本機狀態即時更新，
      // Firestore 淨係負責喺背景盡量同步返（失敗都唔會擋住畫面）。
      window.currentUser.points = (window.currentUser.points || 0) + pointsAmount;
      const prevLevel = calcLevelInfo(window.currentUser.exp || 0).level;
      window.currentUser.exp = (window.currentUser.exp || 0) + expGain;
      updateLevelDisplay();
      const newLevel = calcLevelInfo(window.currentUser.exp).level;
      if (newLevel > prevLevel) {
        const rank = getRankTitle(newLevel);
        window.showToast(`🎉 升級喇！現在是 Lv.${newLevel} ${rank.emoji} ${rank.title}！`, '⬆️');
      }
      if (hoursIncrement > 0) {
        const newHours = (parseFloat(window.currentUser.hours) || 0) + hoursIncrement;
        window.currentUser.hours = newHours;
        const hoursDisplay = newHours.toFixed(1);
        const statHoursEl = document.getElementById('stat-hours');
        if (statHoursEl) statHoursEl.innerText = hoursDisplay;
        const homeHoursEl = document.getElementById('home-stat-hours');
        if (homeHoursEl) homeHoursEl.innerText = formatHoursMinutes(newHours);

        if (isNewDay) {
          window.currentUser.todayMinutes = 1;
          window.currentUser.todayDate = getTodayDateStr();
        } else {
          window.currentUser.todayMinutes = (window.currentUser.todayMinutes || 0) + 1;
        }
        updateGoalBarDisplay();
      }

      // 寫入 Firestore（atomic increment，就算多頁面同時開都唔會出問題）——
      // 呢度純粹係背景持久化，就算失敗都唔會影響用家而家見到嘅畫面
      try {
        const userRef = window.fs.doc(window.db, "users", window.currentUser.uid);
        const updatePayload = {
          points: window.fs.increment(pointsAmount),
          exp: window.fs.increment(expGain)
        };
        if (hoursIncrement > 0) {
          updatePayload.hours = window.fs.increment(hoursIncrement);
          if (isNewDay) {
            updatePayload.todayMinutes = 1;
            updatePayload.todayDate = getTodayDateStr();
          } else {
            updatePayload.todayMinutes = window.fs.increment(1);
          }
        }
        await window.fs.updateDoc(userRef, updatePayload);
      } catch (e) {
        console.warn("積分同步到 Firestore 失敗（畫面已經即時更新，唔影響使用；下次成功寫入時會追返）:", e);
      }
    }

    // ===================== 學習工具：溫習卡（間隔重複記憶法） =====================
    // 用簡化版 Leitner Box 演算法：答啱就跳去下一級（複習間隔拉長），
    // 答錯就打番落第一級（好快再見到嗰張卡）。
    let flashcardsCache = [];
    let flashcardReviewQueue = [];
    let flashcardReviewIndex = 0;
    let flashcardReviewFlipped = false;
    let flashcardsReviewedSinceAward = 0;

    const FLASHCARD_BOX_INTERVALS_MS = [
      0,
      10 * 60 * 1000,          // Box 1 → 10 分鐘後（未熟，好快再見）
      24 * 60 * 60 * 1000,     // Box 2 → 1 日後
      3 * 24 * 60 * 60 * 1000, // Box 3 → 3 日後
      7 * 24 * 60 * 60 * 1000, // Box 4 → 7 日後
      14 * 24 * 60 * 60 * 1000 // Box 5 → 14 日後
    ];

    // 學科溫習卡：固定嘅學科 Tab 列表，格局同「疑難解答區」嗰套學科 Tab 一致。
    // 未喺 FLASHCARD_KNOWN_SUBJECTS 入面嘅科目（或者未填科目）一律歸入「其他」，
    // 等就算 admin 手動輸入自訂科目名，都唔會冇 tab 收容佢。
    const FLASHCARD_SUBJECT_TABS = [
      { key: 'all',  label: '📚 全部' },
      { key: '數學', label: '➕ 數學' },
      { key: '中文', label: '📝 中文' },
      { key: '英文', label: '🔤 英文' },
      { key: '科學', label: '🔬 科學' },
      { key: '經濟', label: '💹 經濟' },
      { key: '其他', label: '💬 其他' }
    ];
    const FLASHCARD_KNOWN_SUBJECTS = ['數學', '中文', '英文', '科學', '經濟'];
    function getFlashcardSubjectBucket(subject) {
      return FLASHCARD_KNOWN_SUBJECTS.includes(subject) ? subject : '其他';
    }

    // ===================== 英文詞彙庫（DSE 8 大議題範疇）=====================
    // 畀 admin 喺後台「一鍵匯入」用嘅預備內容：8 個 DSE 常見議題範疇，每個範疇
    // 20 個詞彙，包含詞性、中文意思、例句同例句中文翻譯。匯入之後 admin 仍然
    // 可以喺後台隨時修正／刪除個別詞卡。
    const ENGLISH_VOCAB_CATEGORIES = [
      { key: "social",      label: "社會議題與基層民生",   labelEn: "Social Issues & Welfare" },
      { key: "tech",        label: "科技發展與數位生活",   labelEn: "Technology & Digital Era" },
      { key: "environment", label: "環境保護與可持續發展", labelEn: "Environment & Sustainability" },
      { key: "youth",       label: "青少年成長與身心健康", labelEn: "Youth, Education & Well-being" },
      { key: "workplace",   label: "職場文化與生涯規劃",   labelEn: "Workplace & Professional Communication" },
      { key: "culture",     label: "文化、娛樂與休閒潮流", labelEn: "Culture, Arts & Pop Trends" },
      { key: "school",      label: "學校政策與學生活動",   labelEn: "School Life & Policy" },
      { key: "ethics",      label: "道德倫理與爭議辯論",   labelEn: "Ethics & Global Perspectives" }
    ];

    // 呢個 const 掛喺 window 度，等後台管理員嗰個 <script> 區塊（另一個獨立
    // scope）都可以攞到（畀「新增溫習卡」同「批量貼上匯入」嘅範疇下拉選單用）
    window.ENGLISH_VOCAB_CATEGORIES = ENGLISH_VOCAB_CATEGORIES;

    // 溫習卡內容而家由管理員喺後台統一管理（Firestore 頂層 flashcards 集合），
    // 學生淨係讀取內容，唔可以自己新增/編輯/刪除。每個學生自己嘅複習進度
    // （記憶等級、下次複習時間）就分開存喺 users/{uid}/flashcardProgress，
    // 咁樣就算大家睇緊同一批卡，各自嘅複習排程都唔會撞埋一齊。
    // 每次撳「學科溫習卡」分頁都會 call 呢個函數，用嚟同步返最新內容／
    // 複習進度。但如果已經有 cache（唔係第一次入呢個分頁），就唔好將
    // 個列表清空變返「🔄 載入緊...」——用返而家個 cache 令畫面即刻顯示
    // 返舊資料，然後喺背景靜靜雞問 Firestore 攞新資料，攞到先換新，
    // 咁樣就唔會每次撳返呢個分頁都閃一次 loading（之前嘅寫法係無論
    // 有冇 cache 都即刻清空畫面，用戶感覺成日都喺度載入緊）。
    let flashcardsHasLoadedOnce = false;
    async function loadFlashcards() {
      if (!window.currentUser || !window.currentUser.uid || !window.fs || !window.db) return;
      const listEl = document.getElementById('flashcards-list-container');
      if (!flashcardsHasLoadedOnce && listEl) {
        listEl.innerHTML = '<p style="text-align:center; color:#999; font-size:13px; padding:20px;">🔄 載入緊溫習卡...</p>';
      }
      try {
        const [cardsSnap, progressSnap] = await Promise.all([
          window.fs.getDocs(window.fs.collection(window.db, 'flashcards')),
          window.fs.getDocs(window.fs.collection(window.db, 'users', window.currentUser.uid, 'flashcardProgress'))
        ]);
        const progressMap = {};
        progressSnap.docs.forEach(d => { progressMap[d.id] = d.data(); });
        flashcardsCache = cardsSnap.docs.map(d => {
          const data = d.data();
          const prog = progressMap[d.id] || {};
          return {
            id: d.id,
            front: data.front || '',
            back: data.back || '',
            subject: data.subject || '',
            category: data.category || '',
            box: prog.box || 1,
            nextReviewAt: (typeof prog.nextReviewAt === 'number') ? prog.nextReviewAt : 0
          };
        });
        flashcardsCache.sort((a, b) => (a.nextReviewAt || 0) - (b.nextReviewAt || 0));
        flashcardsHasLoadedOnce = true;
        renderFlashcardSubjectTabs();
        renderFlashcardsList();
      } catch (e) {
        console.error('載入溫習卡失敗', e);
        if (!flashcardsHasLoadedOnce && listEl) listEl.innerHTML = '<p style="text-align:center; color:#D9764A; font-size:13px; padding:20px;">載入失敗，請重新整理頁面再試</p>';
      }
    }
    window.loadFlashcards = loadFlashcards;

    // 學生揀嘅科目／範疇篩選（唔同科目適合唔同溫習方法，例如英文詞彙可以再細分
    // 8 大 DSE 議題範疇，方便針對性溫習）
    let flashcardsFilterSubject = 'all';
    let flashcardsFilterCategory = 'all';

    function getVisibleFlashcards() {
      return flashcardsCache.filter(c => {
        const bucket = getFlashcardSubjectBucket(c.subject);
        if (flashcardsFilterSubject !== 'all' && bucket !== flashcardsFilterSubject) return false;
        if (flashcardsFilterSubject === '英文' && flashcardsFilterCategory !== 'all' && (c.category || '') !== flashcardsFilterCategory) return false;
        return true;
      });
    }

    // 學科 Tab 列：格局同「疑難解答區」一致。每次 flashcardsCache 更新完都要重新
    // 計返每個學科有幾多張卡——未有內容嘅學科都照樣顯示個 tab，但 disable 撳唔到，
    // 等學生知道呢科將來會有溫習卡，唔會以為個功能壞咗／唔存在。
    function renderFlashcardSubjectTabs() {
      const container = document.getElementById('flashcards-subject-tabs');
      if (!container) return;

      const countsBySubject = {};
      flashcardsCache.forEach(c => {
        const bucket = getFlashcardSubjectBucket(c.subject);
        countsBySubject[bucket] = (countsBySubject[bucket] || 0) + 1;
      });

      // 如果目前揀緊嘅學科而家冇卡（例如 admin 啱啱刪走晒），自動退返去「全部」，
      // 避免學生停留喺一個已經 disable 咗嘅 tab 度
      if (flashcardsFilterSubject !== 'all' && !countsBySubject[flashcardsFilterSubject]) {
        flashcardsFilterSubject = 'all';
        flashcardsFilterCategory = 'all';
      }

      container.innerHTML = FLASHCARD_SUBJECT_TABS.map(s => {
        const count = s.key === 'all' ? flashcardsCache.length : (countsBySubject[s.key] || 0);
        const disabled = s.key !== 'all' && count === 0;
        const active = flashcardsFilterSubject === s.key;
        const cls = 'qa-subject-btn' + (active ? ' active' : '') + (disabled ? ' disabled' : '');
        return disabled
          ? `<button type="button" class="${cls}" disabled title="呢科暫時未有溫習卡">${s.label}</button>`
          : `<button type="button" class="${cls}" onclick="switchFlashcardSubject('${s.key}')">${s.label}</button>`;
      }).join('');

      renderFlashcardCategoryTabs();
    }

    // 英文專屬嘅「範疇」次一級 Tab（8 大 DSE 議題範疇），淨係揀咗「英文」呢個
    // 學科 Tab 先會顯示；同樣，未有內容嘅範疇會顯示但 disable。
    function renderFlashcardCategoryTabs() {
      const wrap = document.getElementById('flashcards-category-tabs');
      if (!wrap) return;

      if (flashcardsFilterSubject !== '英文') {
        wrap.style.display = 'none';
        wrap.innerHTML = '';
        return;
      }
      wrap.style.display = 'flex';

      const englishCards = flashcardsCache.filter(c => getFlashcardSubjectBucket(c.subject) === '英文');
      const countsByCategory = {};
      englishCards.forEach(c => {
        const cat = c.category || '';
        if (!cat) return;
        countsByCategory[cat] = (countsByCategory[cat] || 0) + 1;
      });

      if (flashcardsFilterCategory !== 'all' && !countsByCategory[flashcardsFilterCategory]) {
        flashcardsFilterCategory = 'all';
      }

      const categories = window.ENGLISH_VOCAB_CATEGORIES || [];
      const allActive = flashcardsFilterCategory === 'all';
      const allBtn = `<button type="button" class="flashcard-category-btn${allActive ? ' active' : ''}" onclick="switchFlashcardCategory('all')">🗂 全部範疇（${englishCards.length}）</button>`;
      const catBtns = categories.map(cat => {
        const count = countsByCategory[cat.label] || 0;
        const disabled = count === 0;
        const active = flashcardsFilterCategory === cat.label;
        const cls = 'flashcard-category-btn' + (active ? ' active' : '') + (disabled ? ' disabled' : '');
        return disabled
          ? `<button type="button" class="${cls}" disabled title="這個範疇暫時未有詞卡">${escapeHtml(cat.label)}（0）</button>`
          : `<button type="button" class="${cls}" onclick="switchFlashcardCategory('${cat.label}')">${escapeHtml(cat.label)}（${count}）</button>`;
      }).join('');
      wrap.innerHTML = allBtn + catBtns;
    }

    window.switchFlashcardSubject = function(subject) {
      flashcardsFilterSubject = subject;
      flashcardsFilterCategory = 'all';
      renderFlashcardSubjectTabs();
      renderFlashcardsList();
    };

    window.switchFlashcardCategory = function(category) {
      flashcardsFilterCategory = category;
      renderFlashcardCategoryTabs();
      renderFlashcardsList();
    };

    function formatNextReviewLabel(nextReviewAt) {
      const diffMs = nextReviewAt - Date.now();
      if (diffMs <= 0) return '✅ 現在可複習';
      const diffMin = Math.ceil(diffMs / (60 * 1000));
      if (diffMin < 60) {
        return `⏳ ${diffMin} 分鐘後可複習`;
      }
      const diffHours = Math.ceil(diffMs / (60 * 60 * 1000));
      if (diffHours < 24) {
        return `⏳ ${diffHours} 小時後可複習`;
      }
      return '⏳ ' + new Date(nextReviewAt).toLocaleDateString('zh-HK', { month: '2-digit', day: '2-digit' }) + ' 再複習';
    }

    function renderFlashcardsList() {
      const listEl = document.getElementById('flashcards-list-container');
      const totalEl = document.getElementById('flashcards-total-count');
      const dueEl = document.getElementById('flashcards-due-count');
      const visible = getVisibleFlashcards();
      if (totalEl) totalEl.innerText = visible.length;
      const now = Date.now();
      const dueCount = visible.filter(c => (c.nextReviewAt || 0) <= now).length;
      if (dueEl) dueEl.innerText = dueCount;

      if (!listEl) return;
      if (flashcardsCache.length === 0) {
        listEl.innerHTML = '<p style="text-align:center; color:#999; font-size:13px; padding:20px;">現在仲未有溫習卡，等下老師／管理員新增啦！</p>';
        return;
      }
      if (visible.length === 0) {
        listEl.innerHTML = '<p style="text-align:center; color:#999; font-size:13px; padding:20px;">這個篩選範圍暫時未有溫習卡，試吓揀返「全部」看看！</p>';
        return;
      }

      listEl.innerHTML = visible.map(c => {
        const due = (c.nextReviewAt || 0) <= now;
        const boxLabel = '記憶等級 ' + (c.box || 1) + '/5';
        const nextLabel = formatNextReviewLabel(c.nextReviewAt || 0);
        return `
          <div class="card" style="display:flex; flex-direction:column; gap:4px;">
            <div style="font-weight:bold; color:var(--brand-800); font-size:14px;">${escapeHtml(c.front)}</div>
            <div style="font-size:13px; color:#999; white-space:pre-wrap;">${escapeHtml(c.back)}</div>
            <div style="margin-top:4px; display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
              ${c.subject ? `<span class="tag">${escapeHtml(c.subject)}</span>` : ''}
              ${c.category ? `<span class="tag" style="background:#F0E9DF;">${escapeHtml(c.category)}</span>` : ''}
              <span class="tag" style="background:${due ? '#D9EBEF' : '#F0E9DF'};">${boxLabel}</span>
              <span style="font-size:13px; color:#999;">${nextLabel}</span>
            </div>
          </div>
        `;
      }).join('');
    }

    window.startFlashcardReview = function() {
      const now = Date.now();
      flashcardReviewQueue = getVisibleFlashcards().filter(c => (c.nextReviewAt || 0) <= now);
      if (flashcardReviewQueue.length === 0) {
        window.showToast('現在沒有待複習的卡片，遲些再返來啦！', 'ℹ️');
        return;
      }
      flashcardReviewIndex = 0;
      flashcardsReviewedSinceAward = 0;
      document.getElementById('flashcards-manage-view').style.display = 'none';
      document.getElementById('flashcards-review-view').style.display = '';
      showFlashcardReviewCard();
    };

    function showFlashcardReviewCard() {
      const c = flashcardReviewQueue[flashcardReviewIndex];
      if (!c) { endFlashcardReview(); return; }
      flashcardReviewFlipped = false;
      const cardEl = document.getElementById('flashcard-review-card');
      if (cardEl) cardEl.innerText = c.front;
      const progressEl = document.getElementById('flashcard-review-progress');
      if (progressEl) progressEl.innerText = (flashcardReviewIndex + 1) + ' / ' + flashcardReviewQueue.length;
      const subjectEl = document.getElementById('flashcard-review-subject');
      if (subjectEl) subjectEl.innerText = c.category ? (c.subject + ' · ' + c.category) : (c.subject || '');
      document.getElementById('flashcard-review-actions-front').style.display = '';
      document.getElementById('flashcard-review-actions-back').style.display = 'none';
    }

    window.flipFlashcard = function() {
      const c = flashcardReviewQueue[flashcardReviewIndex];
      if (!c) return;
      flashcardReviewFlipped = true;
      const cardEl = document.getElementById('flashcard-review-card');
      if (cardEl) cardEl.innerText = c.back;
      document.getElementById('flashcard-review-actions-front').style.display = 'none';
      document.getElementById('flashcard-review-actions-back').style.display = 'flex';
    };

    window.gradeFlashcard = async function(known) {
      const c = flashcardReviewQueue[flashcardReviewIndex];
      if (!c) return;
      const newBox = known ? Math.min(5, (c.box || 1) + 1) : 1;
      const nextReviewAt = Date.now() + FLASHCARD_BOX_INTERVALS_MS[newBox];

      try {
        if (window.currentUser && window.fs && window.db) {
          // 用 setDoc（唔係 updateDoc）：因為呢張卡可能係第一次複習，
          // users/{uid}/flashcardProgress/{cardId} 呢份文件可能仲未存在，
          // updateDoc 遇到唔存在嘅文件會報錯，setDoc 就會自動幫手建立。
          await window.fs.setDoc(
            window.fs.doc(window.db, 'users', window.currentUser.uid, 'flashcardProgress', c.id),
            { box: newBox, nextReviewAt }
          );
        }
        c.box = newBox;
        c.nextReviewAt = nextReviewAt;
      } catch (e) {
        console.warn('更新學科溫習卡進度失敗（唔影響繼續複習）:', e);
      }

      // 每複習 5 張卡先 +1 PTS（同 awardStudyPoint 共用，避免用家瘋狂撳掣洗積分）
      flashcardsReviewedSinceAward++;
      if (flashcardsReviewedSinceAward >= 5) {
        flashcardsReviewedSinceAward = 0;
        awardStudyPoint();
      }

      flashcardReviewIndex++;
      if (flashcardReviewIndex >= flashcardReviewQueue.length) {
        window.showToast('🎉 呢輪複習完成！做得好！', '🗂');
        endFlashcardReview();
      } else {
        showFlashcardReviewCard();
      }
    };

    window.endFlashcardReview = function() {
      document.getElementById('flashcards-manage-view').style.display = '';
      document.getElementById('flashcards-review-view').style.display = 'none';
      loadFlashcards();
    };

    // 將秒數格式化做「順時」顯示：唔夠 1 小時就 MM:SS，夠鐘就變 H:MM:SS，
    // 等總溫習時間就算計耐咗都睇得清楚（唔會淨係得兩位數字爆晒格）。
    function formatElapsedClock(totalSeconds) {
      const s = Math.max(0, Math.floor(totalSeconds || 0));
      const hrs = Math.floor(s / 3600);
      const mins = Math.floor((s % 3600) / 60);
      const secs = s % 60;
      if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      }
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    function updateTimerDisplay() {
      // 番茄鐘改為順時顯示：畫面上顯示嘅係「呢一輪（專注／小休）已經計咗幾耐」，
      // 唔再係倒數剩返幾耐——實際循環邏輯（幾時完、幾時轉階段）仍然係靠
      // state.remainingSeconds 喺背後倒數控制，淨係顯示方式改咗。
      const phaseTotalSecondsForDisplay = state.pomodoroPhase === 'break' ? ROOM_POMODORO_BREAK_SECONDS : (state.focusDurationSeconds || 1);
      const elapsedForDisplay = Math.max(0, phaseTotalSecondsForDisplay - state.remainingSeconds);
      const timerEl = document.getElementById('room-timer');
      if (timerEl) {
        timerEl.innerText = formatElapsedClock(elapsedForDisplay);
      }
      const totalTimeEl = document.getElementById('room-total-time');
      if (totalTimeEl) {
        totalTimeEl.innerText = formatElapsedClock(state.roomTotalSeconds || 0);
      }
      const phaseEl = document.getElementById('room-timer-phase');
      if (phaseEl) {
        phaseEl.innerText = state.pomodoroPhase === 'break' ? '☕ 小休中' : '🍅 專注中';
      }

      // 番茄鐘進度條：喺個 widget 底部畫 4 段幼幼嘅進度線，代表呢一節專注拆開嘅
      // 4 個小目標，一段一段咁儲滿（唔係一條望唔到盡頭嘅長 bar）——每一格啱啱好
      // 等如成輪專注時間嘅 25%，等學生覺得每格都係一個好快捱到嘅小終點，同時
      // 唔會加高成個 widget，保持同旁邊其他掣（開啟鏡頭／已靜音／人數）高度
      // 一致。未填色嘅底色用灰色，同個白色 widget 背景清晰分開，4 段界線同
      // 進度都望得清楚啲；填滿咗嘅段仲會加返少少光暈，等「呢段啱啱達成」更加
      // 吸引眼球。
      const phaseTotalSeconds = state.pomodoroPhase === 'break' ? ROOM_POMODORO_BREAK_SECONDS : (state.focusDurationSeconds || 1);
      const elapsedInPhase = Math.max(0, phaseTotalSeconds - state.remainingSeconds);
      const segColor = state.pomodoroPhase === 'break' ? '#7DB8C5' : '#F2A65A';
      const segTrackColor = '#D9D9D9';
      const segEls = document.querySelectorAll('#room-timer-progress-track .pomodoro-quarter-seg');
      if (segEls && segEls.length) {
        const quarterTotal = phaseTotalSeconds / segEls.length;
        segEls.forEach((segEl, i) => {
          const segElapsed = Math.min(quarterTotal, Math.max(0, elapsedInPhase - i * quarterTotal));
          const segPct = quarterTotal > 0 ? (segElapsed / quarterTotal) * 100 : 0;
          segEl.style.background = `linear-gradient(to right, ${segColor} ${segPct}%, ${segTrackColor} ${segPct}%)`;
          segEl.style.boxShadow = segPct >= 100 ? `0 0 4px ${segColor}` : 'none';
        });
      }

      // 第幾輪計數器：房間唔會因為房主揀嘅專注時間到咗就自動關閉，學生可以一直
      // 逗留繼續一輪接一輪咁溫習，所以要有個清晰嘅數字話俾佢知而家踏入第幾輪。
      // 專注中顯示緊做嘅呢一輪；小休中就顯示啱啱完成嗰一輪（小休完先會跳去下一輪）。
      const completed = state.pomodoroCyclesCompleted || 0;
      const roundNumber = state.pomodoroPhase === 'break' ? Math.max(1, completed) : completed + 1;
      const roundLabelEl = document.getElementById('pomodoro-round-label');
      if (roundLabelEl) {
        roundLabelEl.innerText = `第 ${roundNumber} 輪`;
        roundLabelEl.title = `已完成 ${completed} 個完整番茄鐘（這個計數只是計這次入房，離開房間會重新開始計）`;
      }

    }

    // ===================== 防「開房掛機刷分」：定時確認用家是否真係喺度 =====================
    // 每 15 分鐘彈窗問一次「仲喺度嗎？」，5 分鐘內冇撳確認就暫停計分（PTS/EXP／
    // 本房總時間都唔再累積），彈窗本身唔會自動閂——會一直留喺度，直至用家
    // 自己撳「是，我仍在學習」先恢復累積、先真正閂返個彈窗。
    //
    // 特登唔會因為「開緊鏡頭」就跳過呢個檢查：單純開住鏡頭唔代表個人真係
    // 坐喺鏡頭前專心溫緊書（例如鏡頭可以擺住影住空凳、或者對住鏡頭做第二
    // 樣嘢），如果淨係憑鏡頭開住就當佢在場、跳過確認，會令人可以一開鏡頭
    // 就掛住唔理攞盡計分，變相冇咗呢個防刷分機制原本嘅意義。所以唔理有冇
    // 開鏡頭，都要定期主動撳一下確認先算數。
    const ROOM_PRESENCE_CHECK_INTERVAL_MS = 15 * 60 * 1000; // 每 15 分鐘check 一次
    const ROOM_PRESENCE_RESPONSE_MS = 5 * 60 * 1000;        // 彈窗後 5 分鐘內要確認

    function startPresenceCheckLoop() {
      if (state.presenceCheckTimer) clearInterval(state.presenceCheckTimer);
      state.presenceConfirmed = true;
      state.awardingPaused = false;
      state.presenceCheckTimer = setInterval(() => {
        triggerPresenceCheck();
      }, ROOM_PRESENCE_CHECK_INTERVAL_MS);
    }

    function stopPresenceCheckLoop() {
      if (state.presenceCheckTimer) { clearInterval(state.presenceCheckTimer); state.presenceCheckTimer = null; }
      if (state.presenceTimeoutTimer) { clearTimeout(state.presenceTimeoutTimer); state.presenceTimeoutTimer = null; }
      closeModal('modal-presence-check');
      state.awardingPaused = false;
    }

    function triggerPresenceCheck() {
      if (!state.currentRoomId) return;
      state.presenceConfirmed = false;
      openModal('modal-presence-check');
      if (state.presenceTimeoutTimer) clearTimeout(state.presenceTimeoutTimer);
      // 逾時唔會自動閂返個彈窗——個彈窗會一直留喺度，等用家自己撳
      // 「是，我仍在學習」先閂，先算真正確認咗返嚟
      state.presenceTimeoutTimer = setTimeout(() => {
        if (!state.presenceConfirmed) {
          handlePresenceTimeout();
        }
      }, ROOM_PRESENCE_RESPONSE_MS);
    }

    function handlePresenceTimeout() {
      // 淨係暫停計分，唔會自動幫佢退房、都唔會自動閂彈窗——房間同彈窗都會
      // 一直等到用家自己撳「是，我仍在學習」為止先恢復
      state.awardingPaused = true;
      updateTimerDisplay();
      window.showToast('偵測到你可能唔在，已暫停計分。撳「是，我仍在學習」即可恢復', '⏸️');
    }

    // 淨係解除暫停狀態、閂返彈窗，唔會有額外 +2 PTS 獎勵——畀開返鏡頭
    // 自動觸發嗰種情況用（見 toggleCamera），因為嗰種唔算用家主動撳確認
    function resumePresenceSilently() {
      state.presenceConfirmed = true;
      state.awardingPaused = false;
      if (state.presenceTimeoutTimer) { clearTimeout(state.presenceTimeoutTimer); state.presenceTimeoutTimer = null; }
      closeModal('modal-presence-check');
      updateTimerDisplay();
    }

    window.confirmStillHere = function() {
      resumePresenceSilently();
      // 主動確認「仲喺度」都算係一種投入專注嘅表現，順手獎多 2 分鼓勵一下
      awardStudyPoint(2);
      window.showToast('讚！繼續加油溫習，額外送你 +2 PTS 🎁', '💪');
    };

    window.leaveRoom = async function() {
      // 房主特別處理：先彈出選擇視窗，問佢想保留定係關閉房間
      if (state.isHost) {
        const participantsRef = window.fs.collection(window.db, "rooms", state.currentRoomId, "participants");
        const snap = await window.fs.getDocs(participantsRef);
        const othersCount = snap.docs.filter(d => d.id !== window.currentUser.uid).length;

        if (othersCount > 0) {
          // 仲有其他人喺房：問房主點處理
          openModal('modal-host-leave');
          return;
        }
        // 冇其他人：直接刪除房間同退出（唔使問）
        await hostLeaveDeleteRoom();
        return;
      }

      // 普通成員：直接退出
      await doLeaveRoom(false);
    };

    // 房主選擇：保留房間，自己退出並轉移房主身份
    window.hostLeaveKeepRoom = async function() {
      closeModal('modal-host-leave');

      try {
        // 找出除自己以外加入最早嘅用家，升佢做新房主
        const participantsRef = window.fs.collection(window.db, "rooms", state.currentRoomId, "participants");
        const snap = await window.fs.getDocs(participantsRef);
        const others = snap.docs
          .map(d => d.data())
          .filter(p => p.uid !== window.currentUser.uid)
          .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));

        if (others.length > 0) {
          const newHost = others[0];
          await window.fs.setDoc(window.fs.doc(window.db, "rooms", state.currentRoomId), {
            hostName: newHost.name,
            hostUid: newHost.uid
          }, { merge: true });
          window.showToast(`房主已移交給 ${newHost.name}，房間繼續開放`, '👑');
        }
      } catch (e) {
        console.error("移交房主失敗:", e);
      }

      await doLeaveRoom(false);
    };

    // 房主選擇：關閉房間，踢走所有人
    window.hostLeaveDeleteRoom = async function() {
      closeModal('modal-host-leave');
      await doLeaveRoom(true);
    };

    // 共用嘅退出邏輯
    async function doLeaveRoom(deleteRoom, customToastMsg) {
      if (deleteRoom && state.currentRoomId && window.fs && window.db) {
        try {
          await window.fs.deleteDoc(window.fs.doc(window.db, "rooms", state.currentRoomId));
        } catch(e) { console.error("刪除房間失敗", e); }
      }
      await cleanupRoomConnections();
      document.getElementById('room-active').style.display = 'none';
      document.getElementById('room-lobby').style.display = 'block';
      // 退房一定要順手退埋全螢幕：唔係嘅話個全螢幕黑色遮罩仲蓋住成個
      // 畫面，用戶會以為個 app 死咗機
      if (typeof window.exitVideoFullscreenMode === 'function') window.exitVideoFullscreenMode();
      // 自己主動撳「退出房間」/「關閉房間」唔再彈 toast——畫面已經即時
      // 由房間切返去大廳，結果好明顯，唔使再額外講一次。但如果係俾人
      // 踢走／房主移交呢啲對方主動觸發、用戶未必預期到嘅情況，
      // customToastMsg 會帶住明確原因傳入嚟，呢啲仍然要顯示（唔係
      // 用戶會唔知發生咗咩事）。
      if (customToastMsg) window.showToast(customToastMsg, '🚪');
    }

    async function cleanupRoomConnections() {
      if (state.renderFrameId) cancelAnimationFrame(state.renderFrameId);
      if (state.countdownTimer) clearInterval(state.countdownTimer);
      if (state.heartbeatTimer) { clearInterval(state.heartbeatTimer); state.heartbeatTimer = null; }
      stopPresenceCheckLoop();

      // 離開房間就要停止背景白噪音，唔可以帶去大廳／其他分頁繼續播；
      // 兩組控制項（正常 + 全螢幕細面板）嘅 select 都要打返去「關閉」，
      // 全螢幕嗰個細面板亦都要收埋返，等下次入返房、開全螢幕都係由
      // 收埋狀態開始
      stopBgNoise();
      ['bg-noise-select', 'fs-bg-noise-select'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = 'off';
      });
      const fsBgNoisePanel = document.getElementById('fs-bg-noise-panel');
      if (fsBgNoisePanel) fsBgNoisePanel.style.display = 'none';
      if (typeof resetFsRoomBarCollapse === 'function') resetFsRoomBarCollapse();

      // 完整結束鏡頭＋麥克風（離開房間跟單純「關閉鏡頭」不同，要整個釋放掉）
      // 注意釋放次序：先斷開 P2P 連線入面 sender 對軌道嘅參照 → 解除 <video>
      // 元素嘅綁定 → 先至停止軌道本身。部分手機瀏覽器要全部「消費者」都釋放
      // 咗先會真正放開鏡頭／咪硬件，如果次序調轉，重新開鏡頭好易失敗。
      Object.values(state.peerConnections).forEach(pc => {
        pc.getSenders().forEach(sender => {
          if (sender.track) {
            try { sender.replaceTrack(null); } catch (e) { /* 連線可能已經斷咗，忽略 */ }
          }
        });
      });

      const videoElForCleanup = document.getElementById('behind-video-engine');
      if (videoElForCleanup) {
        videoElForCleanup.pause();
        videoElForCleanup.srcObject = null;
      }
      if (state.mediaStream) {
        state.mediaStream.getTracks().forEach(track => track.stop());
        state.mediaStream = null;
      }
      state.isCameraOn = false;
      state.isMicOn = false;

      // 離開房間就清埋開咪上限／冷卻嘅計時器，唔好帶落去下一次入房
      if (state.micOpenTimer) { clearTimeout(state.micOpenTimer); state.micOpenTimer = null; }
      if (state.micOpenUiTimer) { clearInterval(state.micOpenUiTimer); state.micOpenUiTimer = null; }
      state.micOpenUntil = null;
      state.micUsedSeconds = 0;
      state.micSegmentStart = null;
      if (state.micCooldownTimer) { clearTimeout(state.micCooldownTimer); state.micCooldownTimer = null; }
      if (state.micCooldownUiTimer) { clearInterval(state.micCooldownUiTimer); state.micCooldownUiTimer = null; }
      state.micCooldownUntil = null;

      const videoEl = document.getElementById('behind-video-engine');
      const canvasEl = document.getElementById('canvas-stream-display');
      const overlayEl = document.getElementById('self-overlay');
      const statusTag = document.getElementById('camera-status-tag');
      const btn = document.getElementById('btn-camera');
      if (canvasEl) canvasEl.style.display = 'none';
      if (overlayEl) overlayEl.style.display = 'flex';
      if (statusTag) statusTag.style.display = 'none';
      if (btn) { btn.innerText = '📹 開啟鏡頭'; btn.className = 'btn btn-primary'; }
      updateMicButtonUI();

      if (state.signalingUnsubscribe) {
        state.signalingUnsubscribe();
        state.signalingUnsubscribe = null;
      }
      if (state.candidatesUnsubscribe) {
        state.candidatesUnsubscribe();
        state.candidatesUnsubscribe = null;
      }
      if (state.reactionsUnsubscribe) {
        state.reactionsUnsubscribe();
        state.reactionsUnsubscribe = null;
      }
      if (state.roomDocUnsubscribe) {
        state.roomDocUnsubscribe();
        state.roomDocUnsubscribe = null;
      }
      state.pendingCandidates = {};
      state.lastProcessedOfferTs = {};
      state.lastProcessedAnswerTs = {};
      state.connectingTo = new Set();

      // 主動清走自己嘅 presence 同已經送出嘅 offer/answer 文件，
      // 等其他人之後重新入返嚟嗰陣，唔會執到自己呢次留低嘅舊訊號資料
      if (state.currentRoomId && window.currentUser) {
        const myUid = window.currentUser.uid;
        const roomId = state.currentRoomId;
        Object.keys(state.peerConnections).forEach(remoteUid => {
          window.fs.deleteDoc(window.fs.doc(window.db, "rooms", roomId, "signals", myUid + "_to_" + remoteUid)).catch(() => {});
        });
        window.fs.deleteDoc(window.fs.doc(window.db, "rooms", roomId, "signals", myUid)).catch(() => {});
      }

      Object.values(state.peerConnections).forEach(pc => pc.close());
      state.peerConnections = {};

      await leaveRoomParticipants();
      resetVideoSlots();

      state.currentRoomId = null;
      state.isHost = false;
      state.currentRoomHostUid = null;
    }

    window.wakeVideoEngine = function() {
      const video = document.getElementById('behind-video-engine');
      if (video && video.srcObject && video.paused) {
        video.play().catch(e => console.log(e));
      }
    };

    // 讀返手機／裝置而家嘅螢幕方向角度（0／90／180／270）。
    // 大部分 Android 裝置用 screen.orientation.angle 就讀到；iOS Safari
    // 對呢個 API 支援唔完整，退而求其次用返舊式、已棄用但仍然可用嘅
    // window.orientation（注意佢淨係得 -90／0／90／180 呢幾個值）。
    // 讀唔到就當 0 度（即係冇特別打橫，唔使做任何修正）。
    function getScreenOrientationAngle() {
      try {
        if (screen.orientation && typeof screen.orientation.angle === 'number') {
          return ((screen.orientation.angle % 360) + 360) % 360;
        }
      } catch (e) { /* 忽略 */ }
      if (typeof window.orientation === 'number') {
        return ((window.orientation % 360) + 360) % 360;
      }
      return 0;
    }

    function startCanvasRenderLoop() {
      const video = document.getElementById('behind-video-engine');
      const canvas = document.getElementById('canvas-stream-display');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      // 曾經試過用 canvas.captureStream() 攞一條「已經做咗方向修正」嘅
      // 畫面串流，改為送呢條去對方（唔再送原始鏡頭 track），等對方都
      // 見到啱方向。但實測發現部分裝置／瀏覽器用呢個方法會令對方個
      // WebRTC 連線收唔到畫面、卡喺「連線中...」（核心嘅睇到對方鏡頭
      // 功能反而壞咗），所以已經還原返送原始鏡頭 track 呢個做法
      // （見 getOutgoingMediaTracks），寧願方向修正暫時只做到自己個
      // 預覽，都唔想累到基本嘅視訊連線都用唔到。

      function drawFrame() {
        if (!state.isCameraOn) return;
        if (video.paused && video.srcObject) video.play().catch(() => {});

        if (video.readyState >= 2 && video.videoWidth > 0) {
          const vw = video.videoWidth, vh = video.videoHeight;
          // 手機喺拍緊嘅過程中打橫，鏡頭嘅原始畫面唔會自動跟住轉向
          // （呢個係好多瀏覽器/裝置嘅共同限制），所以要自己靠螢幕方向
          // 角度，喺畫落 canvas 之前手動旋轉返啱，令自己個預覽睇落去
          // 都係啱方向。
          // 注意：呢度改嘅淨係自己個預覽（canvas-stream-display）畫面，
          // 冇改實際送俾對方嗰條 WebRTC track（見 getOutgoingMediaTracks
          // 嘅註解——曾經試過連埋送出去嗰條都轉正，但會累到部分裝置嘅
          // 視訊連線斷晒，所以還原返送原始 track）。想令對方都睇到啱
          // 方向，係靠 broadcastMyCameraRotation() 將呢個角度寫入
          // participants 文件，等對方個瀏覽器喺顯示層（.remote-video-
          // element）加返 CSS rotate 嚟做（見 updateRemoteSlotRotation），
          // 唔會影響到 WebRTC 軌道本身。
          const angle = getScreenOrientationAngle();
          // 註：曾經試過畀 angle===90／270 分別加返 ±90 度旋轉，但用戶
          // 實測（連同佢描述「而家張相要再轉番右 90 度先啱」）反覆推
          // 算之後發現：對呢部 iPhone 嚟講，90／270 度嗰陣其實根本唔
          // 使外加任何旋轉——即係話呢部裝置個瀏覽器／鏡頭本身喺打橫嗰
          // 陣已經自行處理咗方向，我哋之前額外加嘅旋轉先係令佢變錯嘅
          // 元兇。所以而家 90／270 度都當正常（唔轉），淨係保留 180
          // 度（倒轉）先要特別處理。如果之後發現原來仲係唔啱，
          // 唔好再憑估旋轉方向，應該直接攞返除錯提示嘅角度數值同用戶
          // 核對返實際畫面對唔對得上。
          if (canvas.width !== vw || canvas.height !== vh) {
            canvas.width = vw;
            canvas.height = vh;
          }
          ctx.save();
          if (angle === 180) {
            ctx.translate(canvas.width, canvas.height);
            ctx.rotate(Math.PI);
            ctx.drawImage(video, 0, 0, vw, vh);
          } else {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          }
          ctx.restore();
        }
        state.renderFrameId = requestAnimationFrame(drawFrame);
      }

      state.renderFrameId = requestAnimationFrame(drawFrame);
    }

    // 揀返而家真正應該送俾其他人嘅 track：聲音、畫面都直接用麥克風／
    // 鏡頭原始 track（曾經試過改用 canvas.captureStream() 嚟做埋方向
    // 修正，但會累到部分裝置嘅 WebRTC 連線收唔到對方畫面，所以還原返
    // 送原始 track，保住基本嘅視訊連線可靠）。
    function getOutgoingMediaTracks() {
      const tracks = [];
      if (!state.mediaStream) return tracks;
      state.mediaStream.getTracks().forEach(t => tracks.push(t));
      return tracks;
    }

    // 當自己開咗鏡頭／咪，需要讓對方知道「我依家有 track 可以送」。
    // 之前嘗試用 replaceTrack 直接修改現有 transceiver 嘅 sender，
    // 但因為 offerer 同 answerer 兩邊嘅 transceiver 次序唔一定一樣，
    // 配對容易出錯，令軌道塞唔進去。
    //
    // 正確做法：直接重新協商（renegotiate）——把新嘅軌道加入現有連線後，
    // 再走一次 Offer/Answer，讓對方嘅 SDP 重新描述晒最新嘅媒體狀態。
    // 呢樣嘢 WebRTC 本身已經設計支援，唔需要斷開舊連線。
    async function renegotiateWithPeers() {
      if (!state.mediaStream || !state.currentRoomId) return;
      const roomId = state.currentRoomId;
      const myUid = window.currentUser.uid;

      for (const [remoteUid, pc] of Object.entries(state.peerConnections)) {
        if (pc.connectionState === 'closed' || pc.connectionState === 'failed') continue;

        // 將本地媒體軌道加入連線（如果未加過嘅話）。
        //
        // 注意：關鏡頭嗰陣（toggleCameraInner）淨係用 videoSender.replaceTrack(null)
        // 停用個 sender，並冇真正 removeTrack，所以嗰個 sender 仍然存在於
        // pc.getSenders() 入面，只不過 .track 變咗 null。舊邏輯淨係用
        // 「s.track 存在先計」嚟判斷「有冇加過呢種 kind」，結果重開鏡頭嗰陣會
        // 誤判做「未加過 video」，於是又 pc.addTrack() 多一次——喺同一個
        // peer connection 度整多咗一條新嘅 video m-line，令對方個 SDP 出現
        // 重複／衝突嘅 transceiver，永遠都收唔到重開返嘅鏡頭畫面。
        //
        // 修正：如果揾到一個「同種 kind、但而家冇 track」嘅舊 transceiver，
        // 就用 replaceTrack 重用返佢（見返 receiver.track.kind 嚟辨認種類，
        // 呢個唔會因為自己 sender track 變 null 而受影響），先至喺真係冇
        // 任何相關 transceiver 嘅情況先用 addTrack 開一條新嘅。
        const existingSenderKinds = new Set(pc.getSenders().filter(s => s.track).map(s => s.track.kind));
        for (const track of getOutgoingMediaTracks()) {
          if (existingSenderKinds.has(track.kind)) continue;

          const reusableTransceiver = pc.getTransceivers().find(t =>
            !t.stopped && t.sender && !t.sender.track &&
            t.receiver && t.receiver.track && t.receiver.track.kind === track.kind
          );

          if (reusableTransceiver) {
            try {
              await reusableTransceiver.sender.replaceTrack(track);
              // replaceTrack 唔會自動調返 transceiver 嘅方向，要手動確保
              // 方向包含「send」，唔係方向唔啱、track 都送唔出去俾對方
              if (reusableTransceiver.direction === 'recvonly') {
                reusableTransceiver.direction = 'sendrecv';
              } else if (reusableTransceiver.direction === 'inactive') {
                reusableTransceiver.direction = 'sendonly';
              }
              wrtcLog(`重用返同 ${remoteUid} 的舊 ${track.kind} transceiver（避免重複 m-line）`);
            } catch (e) {
              console.warn(`replaceTrack 失敗，改用 addTrack (${remoteUid}, ${track.kind}):`, e);
              pc.addTrack(track, state.mediaStream);
              wrtcLog(`加入 ${track.kind} track 到與 ${remoteUid} 的連線`);
            }
          } else {
            pc.addTrack(track, state.mediaStream);
            wrtcLog(`加入 ${track.kind} track 到與 ${remoteUid} 的連線`);
          }
        }

        // 判斷呢條連線係咪仲有「本機已經加咗 track 做 sender，但從未真正經
        // Offer/Answer 協商過」嘅情況。呢個唔淨止喺岩岩呢次 call 先會出現——
        // 例如喺 handleIncomingOffer／createPeerConnection 建立新連線嗰陣，
        // 如果自己已經開咗鏡頭，會將現有 track 自動 addTrack 落新連線，但如果
        // 嗰次負責主動發 Offer 嘅係對方（而對方仲未開自己鏡頭，Offer 入面
        // 根本冇對應嘅 media m-line），咁自己呢邊自動加落嘅 track 就會停留喺
        // 「已加咗 sender，但 transceiver.currentDirection 仍然係 null（未曾
        // 出現喺任何一次完整協商入面）」嘅狀態，對方永遠都收唔到。所以呢度
        // 唔可以淨係睇「岩岩呢次 call 咗 addTrack 冇」，要直接睇返 transceiver
        // 本身有冇真正協商過先準確。
        const needsRenegotiation = pc.getTransceivers().some(t =>
          t.sender && t.sender.track &&
          (t.currentDirection === null || t.currentDirection === 'recvonly' || t.currentDirection === 'inactive')
        );
        if (!needsRenegotiation) continue;

        // 之前呢度用「只有 UID 字母序較細嘅一方先可以重新協商」嚟避免雙方同時
        // 發起造成衝突，但呢個做法有個致命 bug：如果 UID 較細嗰位之後一直冇
        // 再開／關過自己嘅鏡頭或咪，佢就永遠都唔會再送 Offer，於是 UID 較大
        // 嗰位新加入嘅視訊／音訊軌道就會永遠停留喺未協商嘅狀態——對方會永遠
        // 見唔到呢個人嘅畫面（呢個正正就係「房主見唔到某位同學鏡頭」嘅成因）。
        // 而家改為雙方都可以主動發起重新協商，只用 signalingState 嚟避免喺
        // 傾緊嘢嗰陣重複再發一次；如果兩邊真係撞正同時發 Offer，就交俾
        // handleIncomingOffer 嗰邊嘅 polite/impolite 邏輯去化解（一方讓步、
        // 一方堅持）。
        if (pc.signalingState !== 'stable') {
          wrtcLog(`與 ${remoteUid} 的連線暫時未 stable（${pc.signalingState}），跳過這次重新協商`);
          continue;
        }

        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await window.fs.setDoc(window.fs.doc(window.db, "rooms", roomId, "signals", myUid + "_to_" + remoteUid), {
            from: myUid,
            to: remoteUid,
            offer: JSON.parse(JSON.stringify(offer)),
            timestamp: Date.now()
          });
          wrtcLog(`重新協商 Offer 已送出 → ${remoteUid}`);
        } catch (err) {
          console.error(`重新協商失敗 (${remoteUid}):`, err);
        }
      }
    }

    // 將秒數格式化做 M:SS 嘅倒數顯示（例如 185 秒 → "3:05"）
    function formatMicCountdown(totalSeconds) {
      const s = Math.max(0, Math.floor(totalSeconds));
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return `${m}:${String(sec).padStart(2, '0')}`;
    }

    function updateMicButtonUI() {
      const micBtn = document.getElementById('btn-mic');
      const micTag = document.getElementById('mic-status-tag');
      if (!micBtn) return;

      // 冷卻中：咪掣鎖住，用實時倒數顯示仲需幾耐先可以再開咪
      // （用 micCooldownUntil 呢個時間戳嚟判斷，唔靠 micCooldownTimer 個 id，
      // 因為 startMicCooldown() 入面設 micCooldownUntil 同攞到個新 timer id
      // 有先後之分，如果淨係睇 timer id，中間嗰一刻 updateMicButtonUI() 會判斷錯）
      if (state.micCooldownUntil && Date.now() < state.micCooldownUntil) {
        const remainSec = Math.ceil((state.micCooldownUntil - Date.now()) / 1000);
        const countdown = formatMicCountdown(remainSec);
        micBtn.disabled = true;
        micBtn.innerText = `🧊 冷卻中 ${countdown}`;
        micBtn.className = 'btn btn-outline';
        if (micTag) {
          micTag.style.display = state.isCameraOn ? 'flex' : 'none';
          micTag.innerText = `🧊 咪冷卻中 ${countdown}`;
          micTag.style.background = 'rgba(125,184,197,0.7)';
        }
        return;
      }
      micBtn.disabled = false;

      if (state.isMicOn) {
        // 顯示仲有幾耐先撞到 3 分鐘開咪上限（實時倒數）；統一同其他計時器（例如
        // 房間嘅番茄鐘）一樣淨係用空格分隔，唔加括號
        const remainSec = state.micOpenUntil ? Math.ceil((state.micOpenUntil - Date.now()) / 1000) : null;
        const countdown = remainSec !== null ? ` ${formatMicCountdown(remainSec)}` : '';
        micBtn.innerText = `🎤 已開咪${countdown}`;
        micBtn.className = 'btn btn-outline';
        if (micTag) {
          micTag.style.display = state.isCameraOn ? 'flex' : 'none';
          micTag.innerText = `🎤 已開啟麥克風${countdown}`;
          micTag.style.background = 'rgba(134,239,172,0.9)';
        }
      } else {
        micBtn.innerText = '🔇 已靜音';
        micBtn.className = 'btn btn-red';
        if (micTag) {
          micTag.style.display = state.isCameraOn ? 'flex' : 'none';
          micTag.innerText = '🔇 已靜音';
          micTag.style.background = 'rgba(125,184,197,0.7)';
        }
      }
    }

    // 包裝 getUserMedia：如果裝置暫時「忙緊」（常見於剛關閉鏡頭/咪就馬上重開，
    // 手機裝置釋放鏡頭硬件有時需要多過半秒），會分階段延遲重試多次先俾使用者見到失敗。
    async function getUserMediaSafe(constraints, retries = 3, delayMs = 500) {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          return await navigator.mediaDevices.getUserMedia(constraints);
        } catch (err) {
          const isBusy = err.name === 'NotReadableError' || err.name === 'TrackStartError';
          if (!isBusy || attempt === retries) throw err;
          console.warn(`裝置暫時忙緊，${delayMs}ms 後重試（第 ${attempt + 1} 次）:`, err);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    // 統一將 getUserMedia 的錯誤代碼轉做用家睇得明嘅訊息
    function describeMediaError(err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        return '權限被拒絕。請到瀏覽器／系統設定允許這個網站使用鏡頭與麥克風後再試一次。';
      }
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        return '未偵測到鏡頭或麥克風裝置。';
      }
      if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        return '鏡頭或麥克風正被其他 App／分頁佔用，請關閉後再試一次（或重新整理網頁）。';
      }
      return '無法存取鏡頭／麥克風，請檢查瀏覽器權限設定。';
    }

    window.toggleCamera = async function() {
      // 防止手機上快速連撳兩下（或者其他原因觸發嘅重複呼叫）：
      // 開鏡頭嘅過程中 state.isCameraOn 仲未變成 true 之前，
      // 兩次呼叫都會行入「開鏡頭」呢個分支，各自建立多一次連線，
      // 令同一位用家出現兩條互相衝突嘅 P2P 連線。加返呢個鎖之後，
      // 呼叫緊嗰陣其他呼叫會直接被忽略。
      if (state.cameraToggleInProgress) {
        wrtcLog('⚠️ 開/關鏡頭操作進行緊，忽略重複的呼叫');
        return;
      }
      state.cameraToggleInProgress = true;

      try {
        await toggleCameraInner();
      } finally {
        state.cameraToggleInProgress = false;
      }
    };

    async function toggleCameraInner() {
      const videoEl = document.getElementById('behind-video-engine');
      const canvasEl = document.getElementById('canvas-stream-display');
      const overlayEl = document.getElementById('self-overlay');
      const statusTag = document.getElementById('camera-status-tag');
      const btn = document.getElementById('btn-camera');

      if (state.isCameraOn) {
        // 只關閉「鏡頭」本身：停止視訊軌道，但刻意不去關閉 P2P 連線、
        // 不呼叫 resetVideoSlots()。不然自己會連帶看不到其他人本來就開著的鏡頭畫面。
        if (state.renderFrameId) cancelAnimationFrame(state.renderFrameId);

        // 同全面離開房間一樣：先斷開 sender 對視訊軌道嘅參照，先至停止軌道本身
        Object.values(state.peerConnections).forEach(pc => {
          const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
          if (videoSender) {
            try { videoSender.replaceTrack(null); } catch (e) { /* 忽略 */ }
          }
        });

        videoEl.pause();
        videoEl.srcObject = null;

        if (state.mediaStream) {
          state.mediaStream.getVideoTracks().forEach(track => {
            track.stop();
            state.mediaStream.removeTrack(track);
          });
        }

        state.isCameraOn = false;
        canvasEl.style.display = 'none';
        overlayEl.style.display = 'flex';
        statusTag.style.display = 'none';
        btn.innerText = '📹 開啟鏡頭';
        btn.className = 'btn btn-primary';
        updateMicButtonUI();

        updateMyCameraStatus(false);
      } else {
        btn.innerText = '⏳ 鏡頭啟動中...';

        try {
          let videoTrack;

          if (state.mediaStream) {
            // 已經有現成的媒體串流（例如之前已經開過麥克風，或只是重新開鏡頭），
            // 這次只需要另外取得視訊畫面即可
            const videoOnlyStream = await getUserMediaSafe({
              video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }
            });
            videoTrack = videoOnlyStream.getVideoTracks()[0];
            state.mediaStream.addTrack(videoTrack);
          } else {
            // 全新啟動：嘗試一次過取得鏡頭＋麥克風（麥克風權限失敗則退回純鏡頭畫面）
            let stream;
            try {
              stream = await getUserMediaSafe({
                video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
              });
            } catch (mediaErr) {
              console.warn("同時取得鏡頭與麥克風失敗，改為僅開啟鏡頭:", mediaErr);
              stream = await getUserMediaSafe({
                video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
                audio: false
              });
              window.showToast('未能存取麥克風，僅開啟鏡頭畫面', '⚠️');
            }

            state.mediaStream = stream;
            videoTrack = stream.getVideoTracks()[0];

            // 麥克風預設保持靜音，需要按「開咪」才會出聲
            if (stream.getAudioTracks().length > 0) {
              stream.getAudioTracks().forEach(t => t.enabled = false);
              state.isMicOn = false;
              updateMicButtonUI();
            }
          }

          state.isCameraOn = true;

          videoEl.muted = true;
          videoEl.volume = 0;
          videoEl.setAttribute('playsinline', 'true');
          videoEl.srcObject = state.mediaStream;
          await videoEl.play().catch(e => console.log(e));

          canvasEl.style.display = 'block';
          overlayEl.style.display = 'none';
          statusTag.style.display = 'flex';
          btn.innerText = '🔴 關閉鏡頭';
          btn.className = 'btn btn-red';
          updateMicButtonUI();

          startCanvasRenderLoop();

          // 開咗鏡頭之後，通知所有已連線嘅 peer 重新協商，
          // 令佢哋嘅 SDP 包含到我哋新加入嘅視訊軌道
          await renegotiateWithPeers();

          // 如果仲未有任何連線（例如係第一個入房嘅人），先補一次廣播+掃描
          if (Object.keys(state.peerConnections).length === 0 && state.currentRoomId) {
            await broadcastPresenceAndConnect();
            await connectToExistingPeers(state.currentRoomId);
          }

          updateMyCameraStatus(true);
          broadcastMyCameraRotation();
          // 開鏡頭成功唔再彈 toast——掣本身已經由「📹 開啟鏡頭」變咗做
          // 「🔴 關閉鏡頭」、畫面亦已經即時見到自己個鏡頭預覽，呢個結果
          // 已經好清楚，唔使再額外彈一個字幕重複講一次，減少每次撳掣
          // 都有嘢彈出嚟嘅視覺干擾
        } catch (err) {
          console.error("相機存取失敗:", err);
          window.showToast(describeMediaError(err), '❌');
          btn.innerText = '📹 開啟鏡頭';
          btn.className = 'btn btn-primary';
        }
      }
    }

    // 靜音 / 開咪：跟鏡頭開關互相獨立，就算未開鏡頭也可以先按這顆掣。
    // 第一次按下且尚未有任何音訊軌道時，會另外請求麥克風權限；
    // 已經切換過的話，只是單純切換音軌的 enabled 狀態（不會中斷 P2P 連線）。
    window.toggleMic = async function() {
      const micBtn = document.getElementById('btn-mic');

      // 開咪冷卻中：直接擋咗，唔畀重新開咪（防止學生掛住傾偈唔記得溫習）
      if (!state.isMicOn && state.micCooldownUntil && Date.now() < state.micCooldownUntil) {
        const remainSec = Math.max(0, Math.ceil((state.micCooldownUntil - Date.now()) / 1000));
        const mins = Math.ceil(remainSec / 60);
        window.showToast(`咪仲喺冷卻緊，大約 ${mins} 分鐘後先可以再開咪 🧊`, '⏳');
        return;
      }

      if (!state.mediaStream || state.mediaStream.getAudioTracks().length === 0) {
        if (micBtn) micBtn.innerText = '⏳ 取得麥克風中...';
        try {
          let audioStream;
          try {
            audioStream = await getUserMediaSafe({
              audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
            });
          } catch (constrainedErr) {
            // 部分手機瀏覽器對進階音訊限制較敏感，改用最簡單的 audio:true 再試一次
            console.warn("進階麥克風設定取得失敗，改用預設設定重試:", constrainedErr);
            audioStream = await getUserMediaSafe({ audio: true });
          }

          const audioTrack = audioStream.getAudioTracks()[0];

          if (!state.mediaStream) {
            state.mediaStream = audioStream;
          } else {
            state.mediaStream.addTrack(audioTrack);
          }

          await renegotiateWithPeers();
        } catch (err) {
          console.error("取得麥克風失敗:", err);
          window.showToast(describeMediaError(err), '❌');
          updateMicButtonUI();
          return;
        }
      }

      state.isMicOn = !state.isMicOn;
      state.mediaStream.getAudioTracks().forEach(track => track.enabled = state.isMicOn);

      // 3 分鐘開咪上限：用 micUsedSeconds 累積「呢個冷卻循環入面總共開咗幾耐咪」，
      // 手動關咪只係停止計時，唔會令個累積數歸零——所以熄咗再開返，剩返嘅
      // 時間會接住計落去，唔會變相攞到無限開咪時間。累積夠 3 分鐘先會真正
      // 觸發自動收咪 + 冷卻；累積數要等冷卻完成先歸零，開始新一個循環。
      if (state.micOpenTimer) { clearTimeout(state.micOpenTimer); state.micOpenTimer = null; }
      if (state.micOpenUiTimer) { clearInterval(state.micOpenUiTimer); state.micOpenUiTimer = null; }
      state.micOpenUntil = null;

      if (state.isMicOn) {
        // 開返咪：將呢段開始嘅時間戳記低，計返仲有幾多預算未用完
        state.micSegmentStart = Date.now();
        const remainingSeconds = Math.max(0, MIC_OPEN_LIMIT_SECONDS - (state.micUsedSeconds || 0));

        if (remainingSeconds <= 0) {
          // 理論上唔應該發生（冇用盡預算前應該已經俾冷卻擋咗），保險起見
          // 直接當即刻用晒，收返咪、入冷卻
          state.isMicOn = false;
          state.mediaStream.getAudioTracks().forEach(track => track.enabled = false);
          state.micSegmentStart = null;
          startMicCooldown();
          updateMicButtonUI();
          return;
        }

        state.micOpenUntil = Date.now() + remainingSeconds * 1000;
        state.micOpenUiTimer = setInterval(updateMicButtonUI, 1000);
        state.micOpenTimer = setTimeout(() => {
          state.micOpenTimer = null;
          if (state.micOpenUiTimer) { clearInterval(state.micOpenUiTimer); state.micOpenUiTimer = null; }
          state.micOpenUntil = null;
          state.micSegmentStart = null;
          state.micUsedSeconds = MIC_OPEN_LIMIT_SECONDS;
          if (state.isMicOn && state.mediaStream) {
            state.isMicOn = false;
            state.mediaStream.getAudioTracks().forEach(track => track.enabled = false);
            window.showToast('開咪已滿 3 分鐘，已幫你自動收埋，專心返去溫習啦！咪掣進入 5 分鐘冷卻 🧊', '⏳');
            startMicCooldown();
          } else {
            updateMicButtonUI();
          }
        }, remainingSeconds * 1000);
      } else {
        // 主動關咪：將呢段用咗幾耐計落 micUsedSeconds，落次再開咪會接住計
        if (state.micSegmentStart) {
          const elapsedSeconds = (Date.now() - state.micSegmentStart) / 1000;
          state.micUsedSeconds = Math.min(MIC_OPEN_LIMIT_SECONDS, (state.micUsedSeconds || 0) + elapsedSeconds);
        }
        state.micSegmentStart = null;
      }

      updateMicButtonUI();
    };

    // 開始 5 分鐘咪冷卻：鎖住咪掣、每秒刷新倒數顯示，時間到自動解鎖，
    // 並且將 micUsedSeconds 歸零，開始新一個 3 分鐘預算循環
    function startMicCooldown() {
      if (state.micCooldownTimer) { clearTimeout(state.micCooldownTimer); state.micCooldownTimer = null; }
      if (state.micCooldownUiTimer) { clearInterval(state.micCooldownUiTimer); state.micCooldownUiTimer = null; }

      state.micCooldownUntil = Date.now() + MIC_COOLDOWN_SECONDS * 1000;
      updateMicButtonUI();
      state.micCooldownUiTimer = setInterval(updateMicButtonUI, 1000);
      state.micCooldownTimer = setTimeout(() => {
        state.micCooldownTimer = null;
        state.micCooldownUntil = null;
        state.micUsedSeconds = 0;
        if (state.micCooldownUiTimer) { clearInterval(state.micCooldownUiTimer); state.micCooldownUiTimer = null; }
        updateMicButtonUI();
        window.showToast('咪冷卻完成，可以再開咪啦 🎤', '✅');
      }, MIC_COOLDOWN_SECONDS * 1000);
    }

    async function broadcastPresenceAndConnect() {
      if (!window.currentUser || !state.currentRoomId || !window.db) return;
      const myUid = window.currentUser.uid;
      const presenceRef = window.fs.doc(window.db, "rooms", state.currentRoomId, "signals", myUid);
      
      await window.fs.setDoc(presenceRef, {
        uid: myUid,
        name: window.currentUser.username || '同學',
        timestamp: Date.now()
      }, { merge: true });
      wrtcLog(`已廣播上線通知（我的 UID: ${myUid}）`);
    }

    // 開鏡頭當下，主動掃描房內「早已存在」的其他用家並嘗試建立連線。
    // 若只靠監聽器被動反應，會漏掉兩種情況：
    // (1) 對方比我早開鏡頭 → 對方的 presence 文件不會再變動，我方監聽器不會再被觸發
    // (2) 對方已經送來 Offer，但當時我的鏡頭還沒開 → Offer 被略過後就永久錯過了
    //     （Firestore 的 "added" 事件對同一份文件只會觸發一次）
    async function connectToExistingPeers(roomId) {
      if (!window.currentUser || !window.db || !roomId) return;
      const myUid = window.currentUser.uid;

      try {
        const signalsRef = window.fs.collection(window.db, "rooms", roomId, "signals");
        const snapshot = await window.fs.getDocs(signalsRef);
        wrtcLog(`掃描房內現有用家，共讀到 ${snapshot.docs.length} 份 signals 文件`);

        for (const docSnap of snapshot.docs) {
          const data = docSnap.data();

          // (a) 對方的上線通知（presence）→ 依 UID 排序決定是否由我方主動發起 Offer
          if (data.uid && data.uid !== myUid) {
            wrtcLog(`發現房內用家: ${data.uid}（我 ${myUid < data.uid ? '負責發起' : '等他發起'}）`);
            getOrCreateRemoteSlot(data.uid, data.name);
            if (myUid < data.uid && !state.peerConnections[data.uid]) {
              await createOfferTo(roomId, data.uid, data.name);
            }
            continue;
          }

          // (b) 指名給我、但之前鏡頭未開而被略過的 Offer → 現在補上 Answer
          if (data.to === myUid && data.offer && state.lastProcessedOfferTs[data.from] !== data.timestamp) {
            wrtcLog(`發現一份之前錯過的 Offer ← ${data.from}，補上處理`);
            state.lastProcessedOfferTs[data.from] = data.timestamp;
            await handleIncomingOffer(roomId, data.from, data.offer);
          }
        }
      } catch (err) {
        console.error("掃描現有房內用家失敗:", err);
        wrtcLog(`⚠️ 掃描房內用家失敗: ${err.message || err}`);
      }
    }

    function listenToRoomSignaling(roomId) {
      if (state.signalingUnsubscribe) state.signalingUnsubscribe();

      const signalsRef = window.fs.collection(window.db, "rooms", roomId, "signals");
      state.signalingUnsubscribe = window.fs.onSnapshot(signalsRef, (snapshot) => {
        if (!window.currentUser) return;
        const myUid = window.currentUser.uid;

        snapshot.docChanges().forEach(async (change) => {
          const data = change.doc.data();

          // (a) 用家上線通知（presence）：發現房內其他人，並安排到四格視窗其中一格
          if (data.uid && data.uid !== myUid) {
            const remoteUid = data.uid;
            getOrCreateRemoteSlot(remoteUid, data.name);

            // 只由 UID 字母序較小的一方主動發起 Offer，避免雙方同時發起造成衝突
            if (myUid < remoteUid && !state.peerConnections[remoteUid]) {
              wrtcLog(`（監聽器）偵測到 ${remoteUid} 上線，我負責發起連線`);
              await createOfferTo(roomId, remoteUid, data.name);
            }
            return;
          }

          // offer / answer：用時間戳去重，唔再淨係睇 change.type === 'added'。
          // 之前淨係處理 'added' 會有個race condition：如果一開始執到嘅係
          // 舊版本嘅 offer/answer（例如同一時間對方啱啱又覆寫緊份文件），
          // 之後嗰個帶住新內容嘅 'modified' 事件會被完全忽略，永遠停留喺舊嘅、
          // 唔啱嘅 SDP 度。而家改用 timestamp 判斷「呢份係咪已經處理過」，
          // 咁樣就算一開始執到舊版本，之後嗰個新版本都會被正確處理返。

          // (b) 收到指名給自己的 Offer → 建立連線並回覆 Answer
          if (data.to === myUid && data.offer) {
            if (state.lastProcessedOfferTs[data.from] === data.timestamp) return;
            state.lastProcessedOfferTs[data.from] = data.timestamp;
            await handleIncomingOffer(roomId, data.from, data.offer);
            return;
          }

          // (c) 收到指名給自己的 Answer → 完成連線協商
          if (data.to === myUid && data.answer) {
            if (state.lastProcessedAnswerTs[data.from] === data.timestamp) return;
            state.lastProcessedAnswerTs[data.from] = data.timestamp;
            await handleIncomingAnswer(data.from, data.answer);
            return;
          }
        });
      });

      listenToIceCandidates(roomId);
    }

    async function createOfferTo(roomId, remoteUid, remoteName) {
      // 防止監聽器同掃描同時對同一個 peer 發起多條 offer
      if (state.connectingTo.has(remoteUid)) {
        wrtcLog(`⚠️ 已經在向 ${remoteUid} 發起連線的途中，跳過重複請求`);
        return;
      }
      state.connectingTo.add(remoteUid);

      wrtcLog(`主動發起連線 → ${remoteUid}`);

      const existing = state.peerConnections[remoteUid];
      if (existing) {
        wrtcLog(`與 ${remoteUid} 已經有舊連線，捨棄並重新建立`);
        existing.close();
        delete state.peerConnections[remoteUid];
      }

      const pc = createPeerConnection(remoteUid, remoteName);
      state.peerConnections[remoteUid] = pc;

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await window.fs.setDoc(window.fs.doc(window.db, "rooms", roomId, "signals", window.currentUser.uid + "_to_" + remoteUid), {
          from: window.currentUser.uid,
          to: remoteUid,
          offer: JSON.parse(JSON.stringify(offer)),
          timestamp: Date.now()
        });
        wrtcLog(`Offer 已送出 → ${remoteUid}`);
      } catch (err) {
        console.error("建立 WebRTC Offer 失敗:", err);
        delete state.peerConnections[remoteUid];
      } finally {
        state.connectingTo.delete(remoteUid);
      }
    }

    async function handleIncomingOffer(roomId, fromUid, offer) {
      wrtcLog(`收到 Offer ← ${fromUid}`);

      const myUid = window.currentUser.uid;
      // 撞正兩邊同時重新協商（glare）時邊個讓步嘅 tie-break：UID 較大嘅一方係
      // 「polite」，會捨棄自己未完成嘅 Offer 改為接受對方嗰個；UID 較細嗰位
      // 係「impolite」，會堅持自己嘅 Offer、忽略呢個撞埋嚟嘅對方 Offer。
      const polite = myUid > fromUid;

      let pc = state.peerConnections[fromUid];
      const isDead = pc && (pc.connectionState === 'failed' || pc.connectionState === 'closed');

      if (!pc || isDead) {
        // 之前呢度不論任何情況，一收到 Offer 就無條件關咗舊連線再重新建立，
        // 結果連「純粹加多條 track 嘅重新協商」都會被當成「對方重新入房」，
        // 令已經傾掂、運作緊嘅連線白白斷咗再重連一次。而家只喺完全冇連線，
        // 或者舊連線已經死咗（failed／closed，即真係代表對方重新入房）嗰陣，
        // 先重新建立；如果連線仲生生猛猛，就沿用返同一個 pc 做正常重新協商。
        if (pc) {
          wrtcLog(`與 ${fromUid} 的舊連線已經死了，捨棄並用新 Offer 重新建立`);
          pc.close();
        }
        pc = createPeerConnection(fromUid, null);
        state.peerConnections[fromUid] = pc;
      } else if (pc.signalingState === 'have-local-offer') {
        if (!polite) {
          wrtcLog(`⚠️ 與 ${fromUid} 的重新協商撞正，我方 UID 較細，忽略對方這個 Offer`);
          return;
        }
        wrtcLog(`⚠️ 與 ${fromUid} 的重新協商撞正，我方讓步，捨棄自己未完成的 Offer`);
        await pc.setLocalDescription({ type: 'rollback' });
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await flushPendingCandidates(fromUid);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        await window.fs.setDoc(window.fs.doc(window.db, "rooms", roomId, "signals", window.currentUser.uid + "_to_" + fromUid), {
          from: window.currentUser.uid,
          to: fromUid,
          answer: JSON.parse(JSON.stringify(answer)),
          timestamp: Date.now()
        });
        wrtcLog(`Answer 已送出 → ${fromUid}`);

        // 呢個 Answer 一定跟返對方個 Offer 嘅 m-line 數量／次序，唔可以喺
        // Answer 入面私自加多啲對方冇問過嘅 media。如果自己之前已經開咗鏡頭
        // ／咪，但對方個 Offer（例如佢仲未開自己鏡頭時發嘅）根本冇包含相應
        // 嘅 m-line，噉自己已有嘅畫面／聲音就會停留喺「已加咗 sender 但未經
        // 協商」嘅狀態，永遠傳唔到出去。所以呢度答完 Answer 之後，主動行多
        // 一次 renegotiateWithPeers() 掃描一次，如果發現有track仲未真正協商
        // 過，就即刻由自己呢邊補發一個新嘅 Offer 補上。
        await renegotiateWithPeers();
      } catch (err) {
        console.error("處理 Offer / 建立 Answer 失敗:", err);
      }
    }

    async function handleIncomingAnswer(fromUid, answer) {
      const pc = state.peerConnections[fromUid];
      if (!pc) return;
      // 用 signalingState 判斷「而家係咪真係度等緊 answer」，比起淨係睇
      // currentRemoteDescription 準確得多——後者一旦第一次協商成功之後就會
      // 永遠得個真，令之後任何重新協商嘅 answer 都被誤判成「已經處理過」而略過。
      if (pc.signalingState !== 'have-local-offer') {
        wrtcLog(`⚠️ 收到 ${fromUid} 的 Answer，但目前狀態是 ${pc.signalingState}，忽略`);
        return;
      }
      wrtcLog(`收到 Answer ← ${fromUid}`);

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        await flushPendingCandidates(fromUid);
      } catch (err) {
        console.error("設定 Answer 失敗:", err);
      }
    }

    function listenToIceCandidates(roomId) {
      if (state.candidatesUnsubscribe) state.candidatesUnsubscribe();

      // 同 reactions 一樣：略過第一次快照，唔好處理呢個房間歷史上（例如之前好多次
      // 退出／重新入房嘅測試）已經留低嘅舊 ICE candidate 文件。呢啲舊文件屬於早已
      // 失效嘅連線，混入而家呢個新連線只會令 addIceCandidate 塞入垃圾資料，
      // 反而阻礙真正嘅候選位處理，令連線一直卡喺「連線中」。
      let isFirstSnapshot = true;
      const candidatesRef = window.fs.collection(window.db, "rooms", roomId, "candidates");
      state.candidatesUnsubscribe = window.fs.onSnapshot(candidatesRef, (snapshot) => {
        if (isFirstSnapshot) {
          isFirstSnapshot = false;
          return;
        }
        if (!window.currentUser) return;
        const myUid = window.currentUser.uid;

        snapshot.docChanges().forEach(async (change) => {
          if (change.type !== 'added') return;
          const data = change.doc.data();
          if (data.to !== myUid || !data.candidate) return;

          const pc = state.peerConnections[data.from];
          if (pc && pc.remoteDescription && pc.remoteDescription.type) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (err) {
              console.error("加入 ICE Candidate 失敗:", err);
            }
          } else {
            if (!state.pendingCandidates[data.from]) state.pendingCandidates[data.from] = [];
            state.pendingCandidates[data.from].push(data.candidate);
          }
        });
      });
    }

    async function flushPendingCandidates(remoteUid) {
      const pc = state.peerConnections[remoteUid];
      const queued = state.pendingCandidates[remoteUid];
      if (!pc || !queued || queued.length === 0) return;

      for (const candidate of queued) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error("加入排隊中的 ICE Candidate 失敗:", err);
        }
      }
      state.pendingCandidates[remoteUid] = [];
    }

    function createPeerConnection(remoteUid, remoteName) {
      const pc = new RTCPeerConnection(rtcConfig);

      // 如果開咗鏡頭先，喺建立連線時就直接加入軌道；
      // 如果未開鏡頭，就先建立空白連線接收對方嘅畫面，
      // 等之後開鏡頭時再由 renegotiateWithPeers 加入軌道並重新協商。
      if (state.mediaStream) {
        getOutgoingMediaTracks().forEach(track => pc.addTrack(track, state.mediaStream));
      }

      pc.ontrack = (event) => {
        wrtcLog(`收到 ${remoteUid} 的 track: ${event.track.kind}, streams: ${event.streams.length}`);
        const remoteVideo = getOrCreateRemoteSlot(remoteUid, remoteName);
        if (!remoteVideo) return;

        if (event.streams[0]) {
          remoteVideo.srcObject = event.streams[0];
        } else {
          if (!remoteVideo.srcObject) remoteVideo.srcObject = new MediaStream();
          remoteVideo.srcObject.addTrack(event.track);
        }

        // Desktop Chrome 嘅 autoplay policy：有 audio track 嘅 video 唔可以直接 autoplay，
        // 但 muted 狀態就可以。所以先 muted 播放，播放成功後立即 unmute，
        // 呢樣嘢係目前業界通用嘅 workaround（類似 Zoom、Google Meet 嘅做法）。
        remoteVideo.muted = true;
        remoteVideo.play()
          .then(() => { remoteVideo.muted = false; })
          .catch(e => {
            console.log('remote video play failed:', e);
            // 如果 unmute 播放都失敗，保持 muted 至少顯示畫面
            remoteVideo.muted = true;
            remoteVideo.play().catch(() => {});
          });
        if (event.track.kind === 'video') markSlotLive(remoteUid);
      };

      pc.onicecandidate = async (event) => {
        if (event.candidate && state.currentRoomId && window.currentUser) {
          const docRef = await window.fs.addDoc(window.fs.collection(window.db, "rooms", state.currentRoomId, "candidates"), {
            from: window.currentUser.uid,
            to: remoteUid,
            candidate: event.candidate.toJSON(),
            timestamp: Date.now()
          });
          // candidate 文件用完即棄，發送後過幾秒自動刪除，
          // 避免呢個 collection 隨住每次開關鏡頭不斷累積、拖累之後嘅連線
          setTimeout(() => {
            window.fs.deleteDoc(docRef).catch(() => {});
          }, 8000);
        }
      };

      // 診斷用日誌：如果之後仍然連唔到，喺瀏覽器 Console 睇呢啲 log
      // 可以清楚知道係卡喺邊一步（訊號交換？ICE 收集？定係實際連線？）
      pc.oniceconnectionstatechange = () => {
        wrtcLog(`與 ${remoteUid} 的 ICE 連線狀態: ${pc.iceConnectionState}`);
      };
      pc.onicegatheringstatechange = () => {
        wrtcLog(`與 ${remoteUid} 的 ICE 收集狀態: ${pc.iceGatheringState}`);
      };
      pc.onsignalingstatechange = () => {
        wrtcLog(`與 ${remoteUid} 的 signaling 狀態: ${pc.signalingState}`);
      };
      pc.onconnectionstatechange = () => {
        wrtcLog(`與 ${remoteUid} 的整體連線狀態: ${pc.connectionState}`);
        if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
          console.warn(`與 ${remoteUid} 的連線狀態變為 ${pc.connectionState}`);
        }

        if (pc.connectionState === 'connected') {
          // 連線好返（或者本身就一路穩定），取消任何仲排緊隊嘅自動重連
          if (state.peerReconnectTimers[remoteUid]) {
            clearTimeout(state.peerReconnectTimers[remoteUid]);
            delete state.peerReconnectTimers[remoteUid];
          }
          return;
        }

        // 'disconnected' 好多時淨係短暫網絡波動，過幾秒會自動變返 'connected'，
        // 未必需要成個連線推倒重來。所以先畀 6 秒寬限，時間到仲未自己好返
        // 先真係當佢係「呢個 viewer 單方面斷咗」（例如 NAT／路由問題只影響
        // 緊一邊嘅視角，其他人明明都仲見到晒），主動幫佢重新連過，
        // 唔好就咁畀個黑畫面一直卡喺度冇人理。
        if (pc.connectionState === 'disconnected') {
          if (state.peerReconnectTimers[remoteUid]) clearTimeout(state.peerReconnectTimers[remoteUid]);
          state.peerReconnectTimers[remoteUid] = setTimeout(() => {
            delete state.peerReconnectTimers[remoteUid];
            if (state.peerConnections[remoteUid] === pc &&
                pc.connectionState !== 'connected' && pc.connectionState !== 'completed') {
              wrtcLog(`與 ${remoteUid} 的連線持續 disconnected 超過寬限期，主動重新連線`);
              attemptPeerReconnect(remoteUid, pc);
            }
          }, 6000);
          return;
        }

        // 關鍵修正：連線徹底死咗（failed／closed）之後，一定要將佢由
        // state.peerConnections 度移除。之前冇做呢步，導致對方離開房間後，
        // 呢個已經失效嘅連線物件會一直卡喺 state.peerConnections 度，
        // 令 "!state.peerConnections[remoteUid]" 呢個檢查永遠都係 false，
        // 對方之後重新入房都再冇機會收到一個全新嘅 Offer——
        // 佢哋只可以撿到一份舊時已經冇人理會嘅過時 Offer 文件，白費工夫。
        if (state.peerReconnectTimers[remoteUid]) {
          clearTimeout(state.peerReconnectTimers[remoteUid]);
          delete state.peerReconnectTimers[remoteUid];
        }
        if (pc.connectionState === 'failed') {
          // 已經確定死咗，唔使再等，直接試下自動重新連線，好過就咁擺爛
          // 一直畀對方個黑畫面
          attemptPeerReconnect(remoteUid, pc);
        } else if (pc.connectionState === 'closed') {
          cleanupDeadPeerConnection(remoteUid, pc);
        }
      };

      return pc;
    }

    // 連線卡死（failed，或者 disconnected 寬限期過咗都未自己好返）之後嘅
    // 自動補救：清走呢條舊連線，然後好似對方啱啱先上線咁，重新發一次
    // Offer 幫佢建立返一條全新連線——唔理原本邊個負責發起，因為呢度純粹
    // 係「我依家見到嘅畫面壞咗，我要自己搶返」嘅補救，唔係初次配對，
    // 就算兩邊啱啱好同時咁做都唔會有問題（createOfferTo 本身已經會捨棄
    // 重建任何舊連線）。
    async function attemptPeerReconnect(remoteUid, pc) {
      if (state.peerConnections[remoteUid] !== pc) return; // 已經俾第二條新連線取代咗，唔使處理
      if (!state.currentRoomId || !window.currentUser) return;
      await cleanupDeadPeerConnection(remoteUid, pc);
      const remoteName = state.peerNames[remoteUid] || '同學';
      getOrCreateRemoteSlot(remoteUid, remoteName);
      try {
        await createOfferTo(state.currentRoomId, remoteUid, remoteName);
      } catch (e) {
        console.warn(`自動重連 ${remoteUid} 失敗:`, e);
      }
    }

    // 連線徹底失效後嘅清理：釋放格仔、由連線清單中移除，
    // 並刪走自己之前送出、而家已經過時嘅 offer/answer 文件，
    // 咁對方之後重新入房先唔會執到呢份舊嘢
    async function cleanupDeadPeerConnection(remoteUid, pc) {
      if (state.peerConnections[remoteUid] !== pc) return; // 已經俾一條新連線取代咗，唔使處理
      delete state.peerConnections[remoteUid];
      releaseRemoteSlot(remoteUid);
      wrtcLog(`已清理與 ${remoteUid} 的失效連線`);

      if (state.currentRoomId && window.currentUser) {
        try {
          await window.fs.deleteDoc(window.fs.doc(window.db, "rooms", state.currentRoomId, "signals", window.currentUser.uid + "_to_" + remoteUid));
        } catch (e) { /* 文件可能本身就唔存在，忽略 */ }
      }
    }
