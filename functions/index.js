// ConcenMate · Cloud Functions
// ------------------------------------------------------------
// 呢個係第一次設定 Cloud Functions，先寫一個最簡單嘅測試 function
// （pingCloudFunctions），純粹用嚟確認成條部署管道（Firebase CLI、
// Blaze 帳單、登入、部署、前端呼叫）行得通，未牽涉任何真正業務邏輯。
//
// 之後會逐個加返：
//   1. verifyRoomPassword —— 房間密碼伺服器端驗證
//   2. verifyEmailToken —— 電郵驗證唔使登入都做得到
//   3. requestPasswordReset / confirmPasswordReset —— 忘記密碼、電郵重設
//
// 每個 function 都會用 onCall（HTTPS Callable），等前端可以用
// firebase-functions 嘅 httpsCallable() 直接呼叫，唔使自己砌 fetch()。

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore"); // 分區／學校溫習排行榜：users/{uid} 一寫入就自動同步
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineSecret } = require("firebase-functions/params");
// ⚠️ v1.198.0：忘記密碼電郵改由伺服器寄出，需要 EmailJS 嘅 Private Key。
// 設定方法（只需做一次，兩個 Firebase 專案各做一次）：
//   firebase functions:secrets:set EMAILJS_PRIVATE_KEY --project concenmate-dev
//   firebase functions:secrets:set EMAILJS_PRIVATE_KEY --project concenmate-app
// EmailJS 後台亦要喺 Account → Security 剔選
// 「Allow EmailJS API for non-browser applications」。
const EMAILJS_PRIVATE_KEY = defineSecret("EMAILJS_PRIVATE_KEY");
const admin = require("firebase-admin");
const crypto = require("crypto");
const vision = require("@google-cloud/vision");
const { PDFDocument } = require("pdf-lib"); // 導師教材：讀 PDF 頁數／抽頁產生預覽版用

admin.initializeApp();
const db = admin.firestore();
const bucket = admin.storage().bucket();
const visionClient = new vision.ImageAnnotatorClient();

// 全部 function 預設用香港附近嘅 asia-east1（台灣）region，減少延遲。
setGlobalOptions({ region: "asia-east1" });

// ===================== 🚦 簡易速率限制（防止亂咁試密碼／濫發請求） =====================
// verifyRoomPassword（房間密碼只有 4 位數字，得 10000 種組合）同
// requestPasswordReset（忘記密碼申請）呢兩個 function 一直都有喺註解度
// 提過「v1 未有速率限制」——即係話理論上有人可以寫個簡單腳本，短時間
// 內不斷呼叫呢兩個 function 去暴力試晒啲組合，或者濫發大量重設密碼
// token。呢個 helper 用一份 Firestore 文件（rateLimits/{key}）記低
// 「呢個時間窗入面已經試咗幾多次」，用 transaction 做到原子讀取＋累加，
// 超出上限就拋錯，前端會見到「請稍後再試」訊息。
//
// 呢個純粹係伺服器內部用嘅記帳文件，前端完全冇必要（亦都唔應該）直接
// 讀寫佢，所以 firestore.rules 度會將 rateLimits/{key} 成個 collection
// 鎖死（allow read, write: if false）——Admin SDK 唔受呢條規則約束，
// 唔影響呢度嘅寫入。
async function checkRateLimit(key, maxAttempts, windowMs) {
  const ref = db.doc(`rateLimits/${key}`);
  const blocked = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    let windowStart = now;
    let count = 0;
    if (snap.exists) {
      const data = snap.data();
      if (typeof data.windowStart === "number" && now - data.windowStart < windowMs) {
        windowStart = data.windowStart;
        count = data.count || 0;
      }
    }
    if (count >= maxAttempts) {
      return true; // 呢個時間窗入面已經試爆咗上限
    }
    tx.set(ref, { windowStart, count: count + 1 });
    return false;
  });
  if (blocked) {
    throw new HttpsError("resource-exhausted", "嘗試次數過多，請稍後再試");
  }
}

exports.pingCloudFunctions = onCall((request) => {
  return {
    ok: true,
    message: "🎉 Cloud Functions 部署成功，管道行得通！",
    receivedAt: new Date().toISOString(),
  };
});

// ===================== 🔒 房間密碼鎖（伺服器端驗證） =====================
// 真正嘅密碼值存喺 rooms/{roomId}/private/secret，Firestore 規則寫死
// 「allow read: if false」，前端 SDK 完全讀唔到（房主都讀唔到）；淨係
// Cloud Functions 用 Admin SDK 先讀得到（Admin SDK 唔受規則約束）。
//
// verifyRoomPassword —— 而家一律要喺 room-video.js 嘅 enterRoomSetup()
//   入房嗰一刻呼叫（唔理間房有冇設密碼），淨係回傳 { ok: true/false }，
//   唔會將真正密碼傳返去前端。
//
//   ⚠️ 安全修補（見 docs/PROGRESS.md）：之前呢個 function 純粹係「畀個
//   密碼輸入框核對啱唔啱」，核對完之後前端自己直接寫 participants／
//   signals（WebRTC 訊令）呢幾個 collection——但 firestore.rules 嗰邊
//   淨係要求「已登入」就寫得入，完全冇強制一定要經呢個 function 驗證
//   過先得。即係話只要知道 roomId，任何已登入用戶都可以用瀏覽器
//   devtools 直接打 Firestore SDK 寫入 signals，完全繞過密碼／踢人名
//   單，觸發真正嘅 WebRTC 連線、偷收學生嘅鏡頭／麥克風串流。
//
//   而家呢個 function 除咗核對密碼，仲會：(1) 伺服器端強制核實
//   bannedUids（唔再淨係信任前端自己檢查）；(2) 通過之後簽發一張 10
//   分鐘內有效嘅「入場證」（rooms/{roomId}/entryTickets/{uid}，Admin
//   SDK 寫入，前端完全讀寫唔到）。firestore.rules 嗰邊已經改成：
//   participants 一定要有呢張入場證先寫得入，signals／candidates 一定
//   要已經係合法 participants 先讀寫得到——三層扣埋一齊，先真正令密碼
//   同踢人名單喺 WebRTC 呢一層都有實際約束力。
//
// getRoomPassword —— 房主／已經入咗房嘅參加者，撳房內嗰粒🔒掣想再睇返
//   密碼嗰陣用，回傳 { password }。淨係「係房主」或者「已經喺
//   participants 名單度」先俾睇，其他人一律拒絕。
//
// ✅ 已加返速率限制（見上面 checkRateLimit）：同一個已登入用戶對住
// 同一間房，5 分鐘內最多試 10 次密碼，超咗就要等先可以再試，令暴力
// 試晒 10000 種 4 位數組合變到不切實際咁耐。

const ROOM_ENTRY_TICKET_TTL_MS = 10 * 60 * 1000; // 入場證有效期：10 分鐘

exports.verifyRoomPassword = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "請先登入會員");
  }

  const roomId = request.data && request.data.roomId;
  // password 而家係「可選」——冇密碼鎖嘅房間，前端會傳空字串嚟攞入場證。
  const password = (request.data && typeof request.data.password === "string")
    ? request.data.password
    : "";
  if (!roomId) {
    throw new HttpsError("invalid-argument", "缺少 roomId");
  }

  await checkRateLimit(`verifyRoomPassword_${uid}_${roomId}`, 10, 5 * 60 * 1000);

  const roomSnap = await db.doc(`rooms/${roomId}`).get();
  if (!roomSnap.exists) {
    throw new HttpsError("not-found", "這個溫習室已經不存在");
  }
  const roomData = roomSnap.data();
  const isHost = roomData.hostUid === uid;

  // 曾經被房主踢走嘅用家，一律唔可以再次入房——而家伺服器端強制執
  // 行，唔再淨係信任前端自己核對 bannedUids（前端嗰個檢查隨時可以喺
  // devtools 度被跳過）。
  if (!isHost && Array.isArray(roomData.bannedUids) && roomData.bannedUids.includes(uid)) {
    throw new HttpsError("permission-denied", "你已經被房主移出過這間房，不可以再加入");
  }

  // 房主本人建立嘅房間，唔使核對自己岩岩設定嘅密碼（同原本前端
  // isMyRoom 嗰個判斷一致）。
  let ok = true;
  if (roomData.hasPassword && !isHost) {
    const privateSnap = await db.doc(`rooms/${roomId}/private/secret`).get();
    if (privateSnap.exists) {
      const stored = privateSnap.data().password;
      ok = stored === password;
    }
    // 冇 private/secret 記錄（理論上唔會發生）就當冇上鎖，通行。
  }

  if (!ok) {
    return { ok: false };
  }

  // v1.223.1：兩池隔離喺伺服器再擋一次。冇密碼、唔係房主、冇被邀請嘅公開房，
  // 一定要同自己個池一致（同 firestore.rules 的 viewerRoomPool 同一套判斷）；
  // 就算有人改咗前端掣或者知道房號，都攞唔到入場證。管理員豁免。
  if (!isHost && !roomData.hasPassword && typeof roomData.roomPool === "string") {
    const [userSnap, inviteSnap] = await Promise.all([
      db.doc(`users/${uid}`).get(),
      db.doc(`rooms/${roomId}/invitedUids/${uid}`).get(),
    ]);
    const userData = userSnap.exists ? userSnap.data() : {};
    const myPool = userData.isSecondaryStudent === true ? "secondary" : "public";
    if (!inviteSnap.exists && roomData.roomPool !== myPool) {
      const adminSnap = await db.doc("admin_config/adminIds").get();
      const ids = (adminSnap.exists && Array.isArray(adminSnap.data().ids)) ? adminSnap.data().ids : [];
      if (!userData.loginId || !ids.includes(userData.loginId)) {
        throw new HttpsError("permission-denied", "這個溫習室只開放給同一類帳戶的用戶");
      }
    }
  }

  // 密碼核對（或本身冇密碼／係房主）通過：簽發一張短效入場證，等
  // firestore.rules 可以確認呢個 uid 真係啱啱先經伺服器驗證過，先俾
  // 佢寫 participants（見 firestore.rules 嘅 hasValidRoomEntryTicket()）。
  await db.doc(`rooms/${roomId}/entryTickets/${uid}`).set({
    uid,
    issuedAt: Date.now(),
    expiresAt: Date.now() + ROOM_ENTRY_TICKET_TTL_MS,
  });

  return { ok: true };
});

exports.getRoomPassword = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "請先登入會員");
  }

  const roomId = request.data && request.data.roomId;
  if (!roomId) {
    throw new HttpsError("invalid-argument", "缺少 roomId");
  }

  const roomSnap = await db.doc(`rooms/${roomId}`).get();
  if (!roomSnap.exists) {
    throw new HttpsError("not-found", "這個溫習室已經不存在");
  }

  const isHost = roomSnap.data().hostUid === uid;
  if (!isHost) {
    const participantSnap = await db.doc(`rooms/${roomId}/participants/${uid}`).get();
    if (!participantSnap.exists) {
      throw new HttpsError("permission-denied", "你不在這個溫習室內，無法查看密碼");
    }
  }

  const privateSnap = await db.doc(`rooms/${roomId}/private/secret`).get();
  if (!privateSnap.exists) {
    throw new HttpsError("not-found", "這個房間沒有設定密碼");
  }

  return { password: privateSnap.data().password };
});

// ===================== 📧 電郵驗證（唔使登入都做得到） =====================
// 舊做法：前端撳完驗證連結之後，直接用 Firestore SDK 幫自己個
// users/{uid} 文件 updateDoc({emailVerified:true})——Firestore 規則淨係
// 俾用戶自己改自己，所以一定要「撳連結嗰部裝置岩岩好登入緊本人」先
// 做得到；如果喺手機開封信、喺另一部電腦撳連結，或者根本未登入過，
// 就完全卡死（見返 app-core.js 舊版 checkEmailVerifyHashRoute 嘅
// 「請先用返那個帳戶登入」提示）。
//
// verifyEmailToken 呢個 Cloud Function 用 Admin SDK 做返呢一步，完全
// 唔受「淨係俾用戶自己改自己」嗰條規則約束，所以唔理撳連結嗰部裝置
// 有冇登入、登入緊邊個帳戶都做得到。
//   - 已經驗證過：回傳 { ok: true, alreadyVerified: true }（等用戶
//     重複撳連結都唔會見到錯誤，係一個溫和嘅「已經做咗」提示）。
//   - token 唔啱（可能已經用過、或者之後又攞新 token）：拋
//     failed-precondition。
//   - uid 對應嘅帳戶已經唔存在：拋 not-found。
exports.verifyEmailToken = onCall(async (request) => {
  const uid = request.data && request.data.uid;
  const token = request.data && request.data.token;
  if (!uid || !token) {
    throw new HttpsError("invalid-argument", "缺少 uid 或 token");
  }

  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    throw new HttpsError("not-found", "這個帳戶已經不存在");
  }
  const userData = userSnap.data();

  if (userData.emailVerified) {
    return { ok: true, alreadyVerified: true };
  }
  if (userData.emailVerifyToken !== token) {
    throw new HttpsError("failed-precondition", "驗證連結已經失效");
  }

  await userRef.update({ emailVerified: true, emailVerifyToken: null });
  return { ok: true };
});

// ===================== 🔑 忘記密碼（電郵重設） =====================
// 帳號 ID 登入制度入面，Firebase Auth 真正嘅 email 係合成嘅
// `{id}@concenmate.local`，前端完全冇辦法用 Firebase 內建嘅
// sendPasswordResetEmail()／改第二個用戶密碼呢類需要 Admin 權限嘅嘢，
// 所以呢兩個 function 一定要用 Admin SDK 做：
//
// requestPasswordReset —— 用戶喺登入畫面撳「忘記密碼」、輸入返個帳號 ID
//   嗰陣用（呢一刻佢未登入，冇 auth.uid）。查返 usernames/{id} 攞 uid、
//   users/{uid} 攞登記電郵，生成一個 30 分鐘後失效嘅一次性 token 存落
//   passwordResets/{token}（Firestore 規則寫死前端讀寫唔到）。回傳
//   token + 登記電郵畀前端，前端負責用 EmailJS 寄信（呢個 app 一直都
//   係咁寄信，冇後端郵件伺服器）。
//   ⚠️ 特登唔理個帳號 ID 存唔存在、有冇登記電郵都一律回傳 { ok: true }
//   （淨係喺真係搵到先夾埋 token／contactEmail 一齊回傳），等前端可以
//   一律顯示同一個「如果呢個帳號存在就已經寄咗」訊息，唔會俾人攞嚟
//   逐個帳號 ID 咁試，反過嚟推斷邊個帳號登記咗邊個電郵。
//
// confirmPasswordReset —— 用戶撳完電郵入面個連結、輸入新密碼提交嗰陣
//   用（都仲未登入）。核對 token 未用過、未過期，用
//   admin.auth().updateUser() 強制幫嗰個 uid 設定新密碼，然後即刻刪走
//   個 token（一次性，用完即棄）。
//
// ✅ 已加返速率限制（見上面 checkRateLimit）：同一個帳號 ID，1 小時內
// 最多申請 5 次重設密碼，超咗就要等先可以再申請，防止俾人攞嚟濫發
// token（或者間接濫用你哋 EmailJS 嘅免費寄信額度）。
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000; // 30 分鐘

// ⚠️ v1.198.0 安全修補：之前呢個 function 會將重設 token 同登記電郵
// 直接回傳俾呼叫者（再由前端用 EmailJS 寄信）——即係任何人（唔使登入）
// 只要知道對方帳號 ID，就可以攞到 token 即刻改對方密碼，盜用任何帳戶，
// 包括管理員。而家改為由伺服器直接寄信，token 永遠唔會離開伺服器，
// 回傳一律只係 { ok: true }（亦唔再透露對方嘅電郵地址）。
const EMAILJS_SERVICE_ID = "service_armrtdv";
const EMAILJS_PASSWORD_RESET_TEMPLATE_ID = "template_m2u8ioh";
const EMAILJS_PUBLIC_KEY = "1J-O_m3KYXCpUQEY7";

// 重設連結嘅網址由伺服器按 Firebase 專案決定，唔接受前端傳入，
// 防止有人將連結改成指向釣魚網站。
function getSiteBaseUrl() {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "";
  return projectId === "concenmate-app"
    ? "https://concenmate.com/"
    : "https://pakchan422.github.io/concenmate-staging/";
}

// v1.201.0：驗證電郵都改由伺服器寄（之前喺瀏覽器用 EmailJS SDK 寄，
// 所以 EmailJS 後台嘅「Use Private Key」一直開唔到）。兩種信共用呢個 helper。
const EMAILJS_VERIFY_TEMPLATE_ID = "template_nms9igc";

async function sendEmailJsServerSide(templateId, toEmail, username, link) {
  const resp = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: templateId,
      user_id: EMAILJS_PUBLIC_KEY,
      accessToken: EMAILJS_PRIVATE_KEY.value(),
      template_params: {
        to_email: toEmail,
        to_name: username || "同學",
        verify_link: link,
      },
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`EmailJS ${resp.status}: ${text}`);
  }
}

async function sendPasswordResetEmailServerSide(toEmail, username, token) {
  const resetLink = `${getSiteBaseUrl()}#reset-password=${token}`;
  await sendEmailJsServerSide(EMAILJS_PASSWORD_RESET_TEMPLATE_ID, toEmail, username, resetLink);
}

// sendVerificationEmail —— 註冊完成／「重新發送驗證電郵」時由前端呼叫。
// token 由伺服器產生、寫入 users/{uid}.emailVerifyToken，永遠唔經前端，
// 前端亦唔可以再自己寫 emailVerifyToken／emailVerified（見 firestore.rules）。
// 速率限制：每個帳戶每小時最多 5 封，防止濫用 EmailJS 額度。
exports.sendVerificationEmail = onCall({ secrets: [EMAILJS_PRIVATE_KEY] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "請先登入");
  }
  const uid = request.auth.uid;
  await checkRateLimit(`sendVerificationEmail_${uid}`, 5, 60 * 60 * 1000);

  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    throw new HttpsError("not-found", "找不到這個帳戶");
  }
  const userData = userSnap.data();
  if (userData.emailVerified) {
    return { ok: true, alreadyVerified: true };
  }
  const toEmail = typeof userData.contactEmail === "string" ? userData.contactEmail.trim() : "";
  if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
    throw new HttpsError("failed-precondition", "此帳戶未登記有效的電郵地址");
  }

  const token = crypto.randomBytes(24).toString("hex");
  await userRef.update({ emailVerifyToken: token, emailVerified: false });

  const verifyLink = `${getSiteBaseUrl()}#verify-email=${uid}:${token}`;
  try {
    await sendEmailJsServerSide(EMAILJS_VERIFY_TEMPLATE_ID, toEmail, userData.username, verifyLink);
  } catch (e) {
    console.error("寄驗證電郵失敗:", e);
    throw new HttpsError("internal", "暫時未能寄出驗證電郵，請稍後再試");
  }
  return { ok: true };
});

exports.requestPasswordReset = onCall({ secrets: [EMAILJS_PRIVATE_KEY] }, async (request) => {
  const loginId = request.data && request.data.loginId;
  if (!loginId || typeof loginId !== "string") {
    throw new HttpsError("invalid-argument", "缺少帳號 ID");
  }
  const idLower = loginId.trim().toLowerCase();

  await checkRateLimit(`requestPasswordReset_${idLower}`, 5, 60 * 60 * 1000);

  const usernameSnap = await db.doc(`usernames/${idLower}`).get();
  if (!usernameSnap.exists) {
    return { ok: true }; // 唔透露呢個帳號 ID 存唔存在
  }
  const uid = usernameSnap.data().uid;

  const userSnap = await db.doc(`users/${uid}`).get();
  const contactEmail = userSnap.exists ? userSnap.data().contactEmail : null;
  if (!contactEmail) {
    return { ok: true }; // 冇登記電郵，冇地方寄，都係一律話「ok」
  }

  const token = crypto.randomBytes(24).toString("hex");
  await db.doc(`passwordResets/${token}`).set({
    uid,
    loginId: idLower,
    createdAt: Date.now(),
    expiresAt: Date.now() + PASSWORD_RESET_TTL_MS,
    used: false,
  });

  try {
    await sendPasswordResetEmailServerSide(contactEmail, userSnap.data().username || loginId, token);
  } catch (e) {
    console.error("寄重設密碼電郵失敗:", e);
    await db.doc(`passwordResets/${token}`).delete().catch(() => {});
    throw new HttpsError("internal", "暫時未能寄出重設密碼電郵，請稍後再試");
  }

  return { ok: true };
});

exports.confirmPasswordReset = onCall(async (request) => {
  const token = request.data && request.data.token;
  const newPassword = request.data && request.data.newPassword;
  if (!token || typeof token !== "string") {
    throw new HttpsError("invalid-argument", "缺少 token");
  }
  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
    throw new HttpsError("invalid-argument", "新密碼最少要 6 位");
  }

  const resetRef = db.doc(`passwordResets/${token}`);
  const resetSnap = await resetRef.get();
  if (!resetSnap.exists || resetSnap.data().used) {
    throw new HttpsError("not-found", "連結已經失效或者已經用過，請重新申請一次");
  }
  const resetData = resetSnap.data();
  if (Date.now() > resetData.expiresAt) {
    await resetRef.delete();
    throw new HttpsError("deadline-exceeded", "連結已過期");
  }

  await admin.auth().updateUser(resetData.uid, { password: newPassword });
  await resetRef.delete(); // 一次性，用完即棄

  return { ok: true };
});

// ===================== 🎰 扭蛋扣分（伺服器端驗證，防止變負數） =====================
// 舊做法：前端撳扭蛋掣嗰陣，「夠唔夠分」呢個檢查、同「扣分」嗰下寫入
// Firestore，兩步都純粹靠前端畫面顯示緊嘅數字（stat-points 嗰個 HTML
// 元素）嚟判斷，然後直接用 increment(-cost) 去扣，冇經過伺服器驗證，
// 亦都冇 Firestore transaction 保證原子性。如果用戶開咗多過一個分頁／
// 裝置，或者手快連撳兩下掣，「檢查」同「扣分」之間就有機會用返舊
// （未夾埋更新）嘅分數去判斷，導致兩邊都覺得「夠分」但加埋扣完就爆
// 咗負數——呢個就係之前收到嘅「積分變負數」報告嘅根本原因。
//
// spendGachaPoints 呢個 Cloud Function 用 Admin SDK + Firestore
// transaction 做返呢一步：喺同一個原子操作入面讀取用戶而家真正嘅
// PTS、確認夠分先扣，唔夠分就直接拋錯（前端唔會扣到負數）。扭蛋費用
// 表（GACHA_COST）呢度只係「揀個先預設值」，實際收費一律以管理後台
// 喺 admin_config/gacha（costNormal／costLucky）度儲存嘅數值為準——
// 呢份設定同管理後台畫面顯示嗰份係同一個 Firestore 文件，兩邊一定一
// 致；管理員未曾入去改過設定嘅話（呢份文件唔存在），先會 fallback
// 用返呢度嘅預設值。舊做法試過伺服器同前端各自寫死一份唔同數字，搞
// 到管理後台畫面寫住「1 PTS」，撳落去伺服器卻按住舊嘅寫死值扣 30
// PTS，兩邊對唔上——而家改成伺服器都讀返同一份設定，就唔會再出現呢
// 個落差。不再信任前端直接傳落嚟嘅 cost 數值，避免有人喺瀏覽器
// devtools 度自己改個 cost 走位。
const GACHA_COST_DEFAULT = { normal: 60, lucky: 540 };

// ===================== 🧩 貼圖碎片（v1.217.0） =====================
// 扭到已擁有的貼圖會自動轉為碎片（數量按稀有度），碎片可兌換未擁有的
// 貼圖。碎片數量存喺 users/{uid}.stickerFragments（firestore.rules 白名單
// 冇呢個欄位，前端改唔到，只可以經呢度嘅 Cloud Function 改）。
// 每件貼圖最多只會記 1 件（ownedStickers.{id} = 1）；舊資料入面數量大過 1
// 嘅，會喺下一次扭蛋／兌換／打開扭蛋頁時一次過轉為碎片。
// 數值可喺管理後台「扭蛋機貼圖」設定（admin_config/gacha 的
// fragmentGain／fragmentCost），冇設定就用以下預設值。
const FRAGMENT_GAIN_DEFAULT = { common: 1, rare: 3, limited: 6 };
const FRAGMENT_COST_DEFAULT = { common: 3, rare: 9, limited: 18 };
const RARITIES = ["common", "rare", "limited"];

function readFragmentRules(configData) {
  const gain = Object.assign({}, FRAGMENT_GAIN_DEFAULT);
  const cost = Object.assign({}, FRAGMENT_COST_DEFAULT);
  if (configData) {
    RARITIES.forEach((r) => {
      const g = configData.fragmentGain && configData.fragmentGain[r];
      const c = configData.fragmentCost && configData.fragmentCost[r];
      if (typeof g === "number" && g >= 0 && g <= 1000) gain[r] = Math.floor(g);
      if (typeof c === "number" && c >= 1 && c <= 10000) cost[r] = Math.floor(c);
    });
  }
  return { gain, cost };
}

function stickerRarityOf(allStickers, id) {
  const st = (allStickers || []).find((p) => p && String(p.id) === String(id));
  const r = st && st.rarity;
  return RARITIES.includes(r) ? r : "common";
}

// 將 ownedStickers 入面數量大過 1 嘅貼圖收返做 1 件，多出嘅轉做碎片。
// 會直接改動傳入嘅 owned（工作副本），回傳 Firestore 更新欄位同碎片數。
function collapseDuplicateStickers(owned, allStickers, gain) {
  const updates = {};
  let gained = 0;
  Object.keys(owned).forEach((id) => {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return;
    const n = owned[id] || 0;
    if (n > 1) {
      gained += (n - 1) * gain[stickerRarityOf(allStickers, id)];
      owned[id] = 1;
      updates[`ownedStickers.${id}`] = 1;
    }
  });
  return { updates, gained };
}

async function loadGachaConfigData() {
  try {
    const snap = await db.doc("admin_config/gacha").get();
    return snap.exists ? snap.data() : null;
  } catch (e) {
    console.warn("讀取扭蛋設定失敗:", e);
    return null;
  }
}

// 打開扭蛋頁時，如果發現有舊的重複貼圖，就呼叫呢個一次過轉為碎片
exports.convertDuplicateStickers = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "請先登入會員");
  await checkRateLimit(`convertDuplicateStickers_${uid}`, 10, 60 * 1000);
  const configData = await loadGachaConfigData();
  const allStickers = (configData && Array.isArray(configData.stickers)) ? configData.stickers : [];
  const { gain } = readFragmentRules(configData);
  const userRef = db.doc(`users/${uid}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new HttpsError("not-found", "找不到這個帳戶");
    const data = snap.data();
    const owned = Object.assign({}, data.ownedStickers || {});
    const current = data.stickerFragments || 0;
    const { updates, gained } = collapseDuplicateStickers(owned, allStickers, gain);
    if (Object.keys(updates).length) {
      updates.stickerFragments = current + gained;
      tx.update(userRef, updates);
    }
    return { ok: true, gained, fragments: current + gained };
  });
});

// 用碎片兌換一張未擁有的貼圖
exports.exchangeStickerFragments = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "請先登入會員");
  const rawId = request.data && request.data.stickerId;
  const stickerId = (typeof rawId === "number" || typeof rawId === "string") ? String(rawId) : "";
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(stickerId)) throw new HttpsError("invalid-argument", "無效的貼圖");
  await checkRateLimit(`exchangeStickerFragments_${uid}`, 20, 60 * 1000);

  const configData = await loadGachaConfigData();
  const allStickers = (configData && Array.isArray(configData.stickers)) ? configData.stickers : [];
  const seriesList = (configData && Array.isArray(configData.series)) ? configData.series : [];
  const sticker = allStickers.find((p) => p && String(p.id) === stickerId);
  if (!sticker) throw new HttpsError("not-found", "找不到這張貼圖");
  if (sticker.seriesId && seriesList.length) {
    const se = seriesList.find((x) => x && String(x.id) === String(sticker.seriesId));
    if (!se || se.enabled === false) throw new HttpsError("failed-precondition", "此系列已停售，未能兌換");
  }
  const { gain, cost } = readFragmentRules(configData);
  const price = cost[stickerRarityOf(allStickers, stickerId)];

  const userRef = db.doc(`users/${uid}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new HttpsError("not-found", "找不到這個帳戶");
    const data = snap.data();
    const owned = Object.assign({}, data.ownedStickers || {});
    const { updates, gained } = collapseDuplicateStickers(owned, allStickers, gain);
    const available = (data.stickerFragments || 0) + gained;
    if ((owned[stickerId] || 0) > 0) throw new HttpsError("failed-precondition", "你已擁有這張貼圖");
    if (available < price) {
      throw new HttpsError("failed-precondition", `碎片不足，需要 ${price} 個，目前只有 ${available} 個`);
    }
    updates[`ownedStickers.${stickerId}`] = 1;
    updates.stickerFragments = available - price;
    tx.update(userRef, updates);
    return { ok: true, stickerId, fragments: available - price, cost: price };
  });
});

exports.spendGachaPoints = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "請先登入會員");
  }

  const type = request.data && request.data.type;
  if (type !== "normal" && type !== "lucky") {
    throw new HttpsError("invalid-argument", "無效的扭蛋類型");
  }
  // v1.220.0：升級獎勵的免費扭蛋券，只可以用嚟單抽一次
  const useTicket = !!(request.data && request.data.useTicket);
  if (useTicket && type !== "normal") {
    throw new HttpsError("invalid-argument", "免費扭蛋券只可用於單抽");
  }

  // 讀返管理後台喺 Firestore 度儲存嘅扭蛋收費設定，冇設定過就用返
  // 呢個檔案頭段嘅預設值——同管理後台畫面（admin-panel.js 的
  // loadGachaConfigFromFirestore）讀緊嗰份係同一份文件，確保「畫面
  // 顯示幾多」同「實際扣幾多」永遠一致。
  // v1.214.0：可以指定扭邊個系列（seriesId）；唔傳就喺所有「已開啟」
  // 系列嘅貼圖入面抽（舊前端／未設定系列嘅情況都照用得）
  const rawSeriesId = request.data && request.data.seriesId;
  const seriesId = (typeof rawSeriesId === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(rawSeriesId)) ? rawSeriesId : null;
  let seriesList = [];
  let cost = GACHA_COST_DEFAULT[type];
  let stickerPool = null;
  let fragmentRules = readFragmentRules(null);
  try {
    const configSnap = await db.doc("admin_config/gacha").get();
    if (configSnap.exists) {
      const configData = configSnap.data();
      fragmentRules = readFragmentRules(configData);
      if (Array.isArray(configData.stickers) && configData.stickers.length) {
        stickerPool = configData.stickers;
      }
      if (Array.isArray(configData.series)) seriesList = configData.series;
      const configuredCost = type === "normal" ? configData.costNormal : configData.costLucky;
      if (typeof configuredCost === "number" && configuredCost > 0) {
        cost = configuredCost;
      }
    }
  } catch (e) {
    // 讀唔到設定就靜靜哋 fallback 用返預設值，唔好因為呢一步失敗就
    // 令成個扭蛋功能用唔到
    console.warn("讀取扭蛋收費設定失敗，fallback 用返預設值:", e);
  }

  // ⚠️ v1.201.0：抽貼紙改喺伺服器做，同扣分喺同一個 transaction 入面
  // 寫入 ownedStickers——之前係前端自己抽、自己寫 ownedStickers，
  // 識技術嘅學生可以唔扣分就喺 devtools 寫自己擁有晒全部貼紙。
  // firestore.rules 已經將 ownedStickers 移出用戶自改白名單。
  let pool = stickerPool || Array.from({ length: 50 }, (_, i) => ({ id: i + 1, weight: 1 }));
  const enabledSeriesIds = new Set(seriesList.filter((se) => se && se.enabled !== false).map((se) => String(se.id)));
  if (seriesId) {
    if (!enabledSeriesIds.has(seriesId)) {
      throw new HttpsError("failed-precondition", "此系列暫時未能扭蛋，請選擇其他系列");
    }
    pool = pool.filter((p) => p && String(p.seriesId) === seriesId);
  } else if (seriesList.length) {
    // 有設定系列但冇指定：只喺已開啟系列（或者未分類）嘅貼圖入面抽
    pool = pool.filter((p) => p && (!p.seriesId || enabledSeriesIds.has(String(p.seriesId))));
  }
  pool = pool.filter((p) => (parseFloat(p.weight) || 0) > 0);
  if (!pool.length) {
    throw new HttpsError("failed-precondition", "此系列暫時未有可抽的貼圖");
  }
  const allStickers = stickerPool || [];
  const rollCount = type === "lucky" ? 10 : 1;
  const rolledIds = [];
  for (let i = 0; i < rollCount; i++) rolledIds.push(rollGachaSticker(pool));

  const userRef = db.doc(`users/${uid}`);
  const rollResults = [];
  let fragmentsAfter = 0;
  let ticketsAfter = 0;
  const newPoints = await db.runTransaction(async (tx) => {
    rollResults.length = 0;
    const snap = await tx.get(userRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", "找不到這個帳戶");
    }
    const current = snap.data().points || 0;
    const ticketsNow = snap.data().freeGachaTickets || 0;
    if (useTicket) {
      if (ticketsNow < 1) throw new HttpsError("failed-precondition", "你沒有免費扭蛋券");
    } else if (current < cost) {
      throw new HttpsError(
        "failed-precondition",
        `積分不足，需要 ${cost} PTS，目前只有 ${current} PTS`
      );
    }
    const updated = useTicket ? current : current - cost;
    ticketsAfter = useTicket ? ticketsNow - 1 : ticketsNow;
    // v1.217.0：每件貼圖最多記 1 件，重複的自動轉為碎片
    const owned = Object.assign({}, snap.data().ownedStickers || {});
    const collapsed = collapseDuplicateStickers(owned, allStickers, fragmentRules.gain);
    const payload = Object.assign({ points: updated }, collapsed.updates);
    if (useTicket) payload.freeGachaTickets = ticketsAfter;
    let fragments = (snap.data().stickerFragments || 0) + collapsed.gained;
    rolledIds.forEach((id) => {
      if ((owned[id] || 0) > 0) {
        const g = fragmentRules.gain[stickerRarityOf(allStickers, id)];
        fragments += g;
        rollResults.push({ id, dup: true, fragments: g });
      } else {
        owned[id] = 1;
        payload[`ownedStickers.${id}`] = 1;
        rollResults.push({ id, dup: false, fragments: 0 });
      }
    });
    payload.stickerFragments = fragments;
    fragmentsAfter = fragments;
    tx.update(userRef, payload);
    return updated;
  });

  return { ok: true, points: newPoints, stickerIds: rolledIds, results: rollResults, fragments: fragmentsAfter, freeGachaTickets: ticketsAfter, usedTicket: useTicket };
});

// 按管理後台設定嘅 weight 抽一隻貼紙，回傳貼紙 id（數字）。
function rollGachaSticker(pool) {
  const valid = pool.filter((p) => p && (typeof p.id === "number" || typeof p.id === "string") &&
    /^[A-Za-z0-9_-]+$/.test(String(p.id)));
  const total = valid.reduce((sum, p) => sum + (parseFloat(p.weight) || 0), 0);
  if (!valid.length || total <= 0) return valid.length ? valid[0].id : 1;
  let rand = Math.random() * total;
  for (const p of valid) {
    rand -= (parseFloat(p.weight) || 0);
    if (rand <= 0) return p.id;
  }
  return valid[valid.length - 1].id;
}

// ===================== 🎯 賺取 PTS／EXP／時數（伺服器端驗證） =====================
// 舊做法：房入面每滿 60 秒專注時間、「仲喺度嗎」確認額外獎勵，全部都
// 係前端直接用 Firestore SDK 嘅 increment() 寫入 users/{uid} 嘅
// points／exp／hours，數值幾多、寫幾多次完全冇伺服器驗證——雖然
// Firestore 規則（selfUserUpdateOk）有做基本止血（改動方向、單次幅
// 度上限），但始終係前端話寫幾多就幾多，同扭蛋扣分嗰個舊 Bug一樣屬
// 於「淨係信任前端」嘅模式，長遠都係風險。
//
// awardStudyPoints 呢個 Cloud Function 將「呢次可以攞幾多分」鎖死做
// 一張白名單（ALLOWED_POINTS／ALLOWED_HOURS_INCREMENTS，對應前端目前
// 真實獎勵情境：專注 1 分鐘 +1 PTS +1/60 小時、確認「仲喺度」+2
// PTS），用 Admin SDK + Firestore transaction 原子咁做加分，前端傳落
// 嚟嘅只係「呢次係邊一種獎勵」，唔再直接控制寫入 Firestore 嘅實際數
// 值。（原本仲有「學科溫習卡每複習 5 張 +1 PTS」呢一種情境，但溫習卡
// 功能已經完全移除，唔會再觸發呢個 function。）
//
// ⚠️ todayMinutes／todayDate（「今日目標」進度條用嘅欄位）呢兩個字段
// 對積分／時數呢啲有實質價值嘅數字冇影響，純粹畫面顯示用，所以繼續信
// 任前端傳嚟嘅日期字串，唔使伺服器度另外處理時區換算。
//
// ✅ 已加返速率限制（見上面 checkRateLimit）：呢個 function 雖然已經
// 用白名單鎖死咗「每次可以攞幾多分」，但一開始冇限制「攞嘅次數」——
// 識用 devtools 嘅學生理論上可以喺瀏覽器度直接連環呼叫呢個 callable，
// 完全跳過真正嘅專注計時器邏輯，短時間內刷爆分數，等於將前面「白名
// 單鎖死金額」嗰重保護整個繞過。而家同一個用戶 60 秒內最多攞 6 次
// （留返充裕嘅空間：專注計時器正常最密都係每 60 秒一次，加埋「仲喺
// 度」確認等偶爾同時觸發嘅情況），超咗要等先攞到下一次，令批量刷分
// 變到冇意思。
// ⚠️ 原本呢兩個白名單係寫死嘅常數——Admin後台「計分規則」分頁推出之後
// （admin_config/scoringRules 文件，欄位 ptsPerMinute／
// presenceCheckBonus），呢個白名單改做動態讀返個設定文件嚟組成，等
// 管理員喺Admin後台改咗計分規則，呢度嘅伺服器端驗證都會跟住自動更新，
// 唔使改呢份檔、唔使重新部署 Cloud Function。
//
// 為咗唔好「每次呼叫都讀多一次 Firestore」（會拖慢反應、加成本），用
// 一個好短（30 秒）嘅記憶體內快取——Cloud Function instance 之間唔會
// 共享記憶體，但同一個 instance 處理緊一輪連續請求嗰陣（warm start）
// 就會重用返呢個快取，已經可以減走絕大部分重複讀取。
const DEFAULT_PTS_PER_MINUTE = 1;
const DEFAULT_PRESENCE_CHECK_BONUS = 2;
const ALLOWED_AWARD_HOURS_INCREMENTS = [0, 1 / 60]; // 呢個同「真正流逝咗幾多專注時間」掛鈎，唔屬於「計分規則」，唔開放俾管理員自訂

let scoringRulesCache = null;
let scoringRulesCacheAt = 0;
const SCORING_RULES_CACHE_TTL_MS = 30 * 1000;

// 「仍在溫習緊？」確認彈窗相隔幾多分鐘（admin_config/antiIdleRules），
// 用嚟限制確認獎勵嘅派發速度。最少當 5 分鐘，避免設定錯誤令獎勵可以狂刷。
let presenceIntervalCache = null;
let presenceIntervalCacheAt = 0;
async function getPresenceCheckIntervalMin() {
  const now = Date.now();
  if (presenceIntervalCache && (now - presenceIntervalCacheAt) < 30 * 1000) return presenceIntervalCache;
  let mins = 30;
  try {
    const snap = await db.doc("admin_config/antiIdleRules").get();
    if (snap.exists && typeof snap.data().presenceCheckIntervalMin === "number" && snap.data().presenceCheckIntervalMin > 0) {
      mins = snap.data().presenceCheckIntervalMin;
    }
  } catch (e) {
    console.warn("讀取防掛機參數失敗，暫時使用預設 30 分鐘:", e);
  }
  presenceIntervalCache = Math.max(5, mins);
  presenceIntervalCacheAt = now;
  return presenceIntervalCache;
}

async function getScoringRules() {
  const now = Date.now();
  if (scoringRulesCache && (now - scoringRulesCacheAt) < SCORING_RULES_CACHE_TTL_MS) {
    return scoringRulesCache;
  }
  let ptsPerMinute = DEFAULT_PTS_PER_MINUTE;
  let presenceCheckBonus = DEFAULT_PRESENCE_CHECK_BONUS;
  try {
    const snap = await db.doc("admin_config/scoringRules").get();
    if (snap.exists) {
      const data = snap.data();
      if (typeof data.ptsPerMinute === "number" && data.ptsPerMinute > 0) ptsPerMinute = data.ptsPerMinute;
      if (typeof data.presenceCheckBonus === "number" && data.presenceCheckBonus > 0) presenceCheckBonus = data.presenceCheckBonus;
    }
  } catch (e) {
    console.warn("讀取計分規則設定失敗，暫時使用內建預設值:", e);
  }
  scoringRulesCache = { ptsPerMinute, presenceCheckBonus };
  scoringRulesCacheAt = now;
  return scoringRulesCache;
}

// 「本月排行榜」用嘅月份字串（例如 "2026-09"），一定要伺服器自己算，
// 唔可以信任前端傳嚟嘅值（同 todayDateStr 嗰種「前端話晒事」做法唔
// 同）——因為呢個字串會直接影響緊要嘅排行榜歸零時機，用伺服器時間
// （香港時區）計算至可靠，唔怕用戶手機時鐘唔準或者刻意作假。
function getServerMonthStr() {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit" });
  const parts = fmt.formatToParts(new Date());
  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  return `${y}-${m}`;
}

// ===================== 升級獎勵（v1.220.0） =====================
// 每升一級送免費扭蛋券（freeGachaTickets），每到指定級數（例如 5、10、15…）
// 額外送碎片。數值喺管理後台「等級系統」設定（admin_config/levelSystem 的
// levelUpTickets／milestoneEvery／milestoneFragments），冇設定就用預設值。
// rewardedLevel 記住「已經派到第幾級」，咁樣管理員手動補 EXP 之後，下次
// 溫習都會補派返中間嘅獎勵，而且每一級只會派一次。
// freeGachaTickets／rewardedLevel 唔喺 firestore.rules 白名單，前端改唔到。
const LEVEL_REWARD_DEFAULT = { levelCurveFactor: 10, levelUpTickets: 1, milestoneEvery: 5, milestoneFragments: 5 };
let levelRulesCache = null;
let levelRulesCacheAt = 0;
async function getLevelRewardRules() {
  const now = Date.now();
  if (levelRulesCache && (now - levelRulesCacheAt) < 30 * 1000) return levelRulesCache;
  const rules = Object.assign({}, LEVEL_REWARD_DEFAULT);
  try {
    const snap = await db.doc("admin_config/levelSystem").get();
    if (snap.exists) {
      const d = snap.data();
      if (typeof d.levelCurveFactor === "number" && d.levelCurveFactor >= 1) rules.levelCurveFactor = d.levelCurveFactor;
      if (typeof d.levelUpTickets === "number" && d.levelUpTickets >= 0 && d.levelUpTickets <= 10) rules.levelUpTickets = Math.floor(d.levelUpTickets);
      if (typeof d.milestoneEvery === "number" && d.milestoneEvery >= 1 && d.milestoneEvery <= 100) rules.milestoneEvery = Math.floor(d.milestoneEvery);
      if (typeof d.milestoneFragments === "number" && d.milestoneFragments >= 0 && d.milestoneFragments <= 1000) rules.milestoneFragments = Math.floor(d.milestoneFragments);
      if (Array.isArray(d.ranks) && d.ranks.length) rules.ranks = d.ranks;
      rules.goldenHour = sanitizeGoldenHour(d.goldenHour);
    }
  } catch (e) {
    console.warn("讀取等級設定失敗，暫時使用預設值:", e);
  }
  levelRulesCache = rules;
  levelRulesCacheAt = now;
  return rules;
}

// ===================== 溫習黃金時段（v1.224.0） =====================
// 管理後台「等級系統」設定 admin_config/levelSystem.goldenHour：
// { enabled, title, start: "19:00", end: "23:00", expMultiplier, stoneMultiplier }
// 以香港時間判斷；end 早過 start 代表跨過午夜。只影響「每分鐘溫習」嘅 EXP 同石頭進度。
function sanitizeGoldenHour(g) {
  const ok = (t) => typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  const mult = (v) => (typeof v === "number" && v >= 1 && v <= 5) ? Math.round(v * 10) / 10 : 1;
  if (!g || typeof g !== "object" || g.enabled !== true || !ok(g.start) || !ok(g.end) || g.start === g.end) return null;
  return { start: g.start, end: g.end, expMultiplier: mult(g.expMultiplier), stoneMultiplier: mult(g.stoneMultiplier) };
}
function hkMinuteOfDay() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Hong_Kong", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const h = parseInt(parts.find((p) => p.type === "hour").value, 10);
  const m = parseInt(parts.find((p) => p.type === "minute").value, 10);
  return h * 60 + m;
}
function goldenHourNow(g) {
  if (!g) return null;
  const toMin = (t) => parseInt(t.slice(0, 2), 10) * 60 + parseInt(t.slice(3), 10);
  const s = toMin(g.start); const e = toMin(g.end); const now = hkMinuteOfDay();
  const inside = s < e ? (now >= s && now < e) : (now >= s || now < e);
  return inside ? g : null;
}

// ===================== Ottie 的石頭（v1.222.0） =====================
// 每溫 15 分鐘磨好一粒，款式跟當時段位（1 灰石、2 鵝卵石、3 雲石、4 水晶、5 寶石）。
// users/{uid}.stones = { "1": n, ..., "5": n } 分款累積；stoneMinutes = 未夠 15 分鐘的餘數。
// 兩個欄位都唔喺 firestore.rules 白名單，前端改唔到，留待日後兌換 Ottie 物品。
const STONE_MINUTES = 15;
const DEFAULT_RANK_LEVELS = [1, 10, 20, 40, 60];
function sortedRanks(ranks) {
  const list = (Array.isArray(ranks) && ranks.length) ? ranks : DEFAULT_RANK_LEVELS.map((minLevel) => ({ minLevel }));
  return list.slice().sort((a, b) => (a.minLevel || 0) - (b.minLevel || 0));
}
function stoneTypeAtLevel(level, ranks) {
  const sorted = sortedRanks(ranks);
  let idx = 0;
  sorted.forEach((r, i) => { if (level >= (r.minLevel || 0)) idx = i; });
  const n = parseInt(sorted[idx] && sorted[idx].stone);
  return (n >= 1 && n <= 5) ? n : Math.min(5, idx + 1);
}
// v1.223.0：段位升到邊度，就解鎖到邊款石頭；用戶可以揀返已解鎖的舊款嚟磨
function unlockedStoneTypes(level, ranks) {
  const set = new Set();
  sortedRanks(ranks).forEach((r) => { if (level >= (r.minLevel || 0)) set.add(stoneTypeAtLevel(r.minLevel || 0, ranks)); });
  if (!set.size) set.add(1);
  return set;
}
// 第一次計石頭：按以前累積的溫習時數補返，並按當時 EXP 經過的段位分配款式
function backfillStones(data, f, ranks) {
  const stones = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  const totalMin = Math.max(0, Math.floor((parseFloat(data.hours) || 0) * 60));
  const total = Math.floor(totalMin / STONE_MINUTES);
  const exp = Math.max(0, data.exp || 0);
  const sorted = sortedRanks(ranks);
  let given = 0;
  if (total > 0 && exp > 0) {
    sorted.forEach((r, i) => {
      const startExp = f * (r.minLevel || 1) * ((r.minLevel || 1) - 1);
      const next = sorted[i + 1];
      const endExp = next ? f * (next.minLevel || 1) * ((next.minLevel || 1) - 1) : Infinity;
      const part = Math.max(0, Math.min(exp, endExp) - startExp);
      if (part <= 0) return;
      const n = Math.floor(total * part / exp);
      const t = String(stoneTypeAtLevel(r.minLevel || 1, ranks));
      stones[t] += n;
      given += n;
    });
  }
  const cur = String(stoneTypeAtLevel(levelFromExp(exp, f), ranks));
  stones[cur] += Math.max(0, total - given);
  return { stones, stoneMinutes: totalMin % STONE_MINUTES };
}

// 同前端 app-features.js 的 calcLevelInfo 用同一條公式：
// 升到第 L 級總共需要的 EXP = f × L × (L−1)
function levelFromExp(exp, f) {
  exp = Math.max(0, Math.floor(exp || 0));
  let level = Math.max(1, Math.floor((f + Math.sqrt(f * f + 4 * f * exp)) / (2 * f)));
  while (f * (level + 1) * level <= exp) level++;
  while (level > 1 && f * level * (level - 1) > exp) level--;
  return level;
}

exports.awardStudyPoints = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "請先登入會員");
  }

  await checkRateLimit(`awardStudyPoints_${uid}`, 6, 60 * 1000);

  const pointsAmount = request.data && request.data.points;
  const hoursIncrement = (request.data && typeof request.data.hoursIncrement === "number")
    ? request.data.hoursIncrement
    : 0;
  const isNewDay = !!(request.data && request.data.isNewDay);
  const todayDateStr = (request.data && typeof request.data.todayDateStr === "string")
    ? request.data.todayDateStr
    : null;

  const { ptsPerMinute, presenceCheckBonus } = await getScoringRules();
  if (pointsAmount !== ptsPerMinute && pointsAmount !== presenceCheckBonus) {
    throw new HttpsError("invalid-argument", "無效的積分數量");
  }
  if (!ALLOWED_AWARD_HOURS_INCREMENTS.some((v) => Math.abs(v - hoursIncrement) < 1e-9)) {
    throw new HttpsError("invalid-argument", "無效的時數增量");
  }
  // 「每分鐘溫習分」一定要帶時數增量；「仍在學習確認獎勵」就唔帶時數
  const isMinuteAward = hoursIncrement > 0;
  if (isMinuteAward && pointsAmount !== ptsPerMinute) {
    throw new HttpsError("invalid-argument", "無效的積分數量");
  }
  if (!isMinuteAward && pointsAmount !== presenceCheckBonus) {
    throw new HttpsError("invalid-argument", "無效的積分數量");
  }

  // ⚠️ v1.199.0 防刷分：
  // (1) 一定要真係喺某間溫習室入面（rooms/{roomId}/participants/{uid} 存在）。
  //     之前完全冇核對，寫個 script 不停 call 就可以喺房外面刷分。
  // (2) 用「額度桶」限制派分速度：每分鐘分每過 1 分鐘先回復 1 個額度，最多
  //     儲 5 個（容許斷線後補寄幾次）；確認獎勵按「仍在溫習緊？」彈窗相隔
  //     時間回復，最多儲 2 個。超出就拒絕（failed-precondition，前端會放棄
  //     呢次，唔會不停重試）。
  const roomId = request.data && request.data.roomId;
  if (!roomId || typeof roomId !== "string" || roomId.includes("/")) {
    throw new HttpsError("failed-precondition", "請先進入溫習室");
  }
  const participantSnap = await db.doc(`rooms/${roomId}/participants/${uid}`).get();
  if (!participantSnap.exists) {
    throw new HttpsError("failed-precondition", "請先進入溫習室");
  }
  const bonusIntervalMin = await getPresenceCheckIntervalMin();
  const levelRules = await getLevelRewardRules();

  const expPerPoint = 1; // 同前端 LEVEL_CONFIG.expPerMinute 保持一致
  // v1.224.0：黃金時段內，每分鐘溫習嘅 EXP 同石頭進度按倍數計（「仍在學習」獎勵不受影響）
  const golden = isMinuteAward ? goldenHourNow(levelRules.goldenHour) : null;
  // 倍數可以係小數（例如 1.5）：EXP 一定係整數，小數部分記喺 expFrac，下一分鐘再加返
  const rawExpGain = expPerPoint * pointsAmount * (golden ? golden.expMultiplier : 1);

  const userRef = db.doc(`users/${uid}`);
  const bucketRef = db.doc(`rateLimits/studyAwardBucket_${uid}`);
  const result = await db.runTransaction(async (tx) => {
    const [snap, bucketSnap] = await Promise.all([tx.get(userRef), tx.get(bucketRef)]);
    if (!snap.exists) {
      throw new HttpsError("not-found", "找不到這個帳戶");
    }
    const nowMs = Date.now();
    const bucket = bucketSnap.exists ? bucketSnap.data() : {};
    const field = isMinuteAward ? "minute" : "bonus";
    const refillMs = isMinuteAward ? 60 * 1000 : bonusIntervalMin * 60 * 1000 * 0.9;
    const cap = isMinuteAward ? 5 : 2;
    const prevCredit = typeof bucket[field + "Credit"] === "number" ? bucket[field + "Credit"] : cap;
    const prevAt = typeof bucket[field + "At"] === "number" ? bucket[field + "At"] : 0;
    const credit = Math.min(cap, prevCredit + (prevAt ? (nowMs - prevAt) / refillMs : cap));
    if (credit < 1) {
      throw new HttpsError("failed-precondition", "積分派發過於頻密");
    }
    tx.set(bucketRef, { [field + "Credit"]: credit - 1, [field + "At"]: nowMs }, { merge: true });
    const data = snap.data();
    const newPoints = (data.points || 0) + pointsAmount;
    const prevFrac = (typeof data.expFrac === "number" && data.expFrac >= 0 && data.expFrac < 1) ? data.expFrac : 0;
    const totalGain = rawExpGain + prevFrac;
    const expGain = Math.floor(totalGain + 1e-9);
    const newExp = (data.exp || 0) + expGain;
    const update = { points: newPoints, exp: newExp };
    const newFrac = Math.round((totalGain - expGain) * 1000) / 1000;
    if (newFrac !== prevFrac) update.expFrac = newFrac;

    // 升級獎勵：由「已派到嘅級數」之後每一級都派一次
    let levelReward = null;
    const oldLevel = levelFromExp(data.exp || 0, levelRules.levelCurveFactor);
    const newLevel = levelFromExp(newExp, levelRules.levelCurveFactor);
    const rewardedLevel = (typeof data.rewardedLevel === "number") ? data.rewardedLevel : oldLevel;
    if (newLevel > rewardedLevel) {
      let tickets = 0;
      let fragments = 0;
      for (let L = rewardedLevel + 1; L <= newLevel; L++) {
        tickets += levelRules.levelUpTickets;
        if (levelRules.milestoneEvery > 0 && L % levelRules.milestoneEvery === 0) fragments += levelRules.milestoneFragments;
      }
      update.rewardedLevel = newLevel;
      if (tickets > 0) update.freeGachaTickets = (data.freeGachaTickets || 0) + tickets;
      if (fragments > 0) update.stickerFragments = (data.stickerFragments || 0) + fragments;
      levelReward = {
        level: newLevel,
        tickets,
        fragments,
        freeGachaTickets: update.freeGachaTickets !== undefined ? update.freeGachaTickets : (data.freeGachaTickets || 0),
        stickerFragments: update.stickerFragments !== undefined ? update.stickerFragments : (data.stickerFragments || 0),
      };
    } else if (typeof data.rewardedLevel !== "number") {
      update.rewardedLevel = newLevel; // 舊帳戶第一次記錄，唔補派之前嘅級數
    }

    // 石頭：只有「每分鐘溫習」先計
    let stoneInfo = null;
    if (hoursIncrement > 0) {
      let stones;
      let stoneMinutes;
      if (data.stones && typeof data.stones === "object") {
        stones = Object.assign({ "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 }, data.stones);
        stoneMinutes = typeof data.stoneMinutes === "number" ? data.stoneMinutes : 0;
      } else {
        const b = backfillStones(data, levelRules.levelCurveFactor, levelRules.ranks);
        stones = b.stones;
        stoneMinutes = b.stoneMinutes;
      }
      stoneMinutes = Math.round((stoneMinutes + (golden ? golden.stoneMultiplier : 1)) * 1000) / 1000;
      // activeStone：0 = 自動（最新解鎖嗰款），1–5 = 用戶手動揀的款式（要已解鎖）
      let activeStone = (typeof data.activeStone === "number") ? data.activeStone : 0;
      const reqStone = request.data && request.data.activeStone;
      if (typeof reqStone === "number" && Number.isInteger(reqStone) && reqStone >= 0 && reqStone <= 5) {
        activeStone = reqStone;
        update.activeStone = reqStone;
      }
      const unlocked = unlockedStoneTypes(newLevel, levelRules.ranks);
      let earned = null;
      while (stoneMinutes >= STONE_MINUTES) {
        stoneMinutes -= STONE_MINUTES;
        earned = String((activeStone && unlocked.has(activeStone)) ? activeStone : stoneTypeAtLevel(newLevel, levelRules.ranks));
        stones[earned] = (stones[earned] || 0) + 1;
      }
      update.stones = stones;
      update.stoneMinutes = stoneMinutes;
      stoneInfo = { stones, stoneMinutes, earned, activeStone };
    }

    // 用 parseFloat 而唔係直接 || 0：就算 Firestore 度而家存緊嘅 hours 已經
    // 被舊 bug（admin 後台冇轉數字就直接寫入）搞到變咗文字／亂碼，都可以
    // 解讀返出一個合理嘅數字，等個帳戶自動「復原」返，唔使個個都要人手
    // 逐一去後台補救。
    let newHours = parseFloat(data.hours) || 0;
    let newTodayMinutes = data.todayMinutes || 0;
    let newTodayDate = data.todayDate || null;
    // 「本月排行榜」用嘅 monthlyHours／monthlyPeriod：邏輯同 todayMinutes／
    // todayDate 嗰套「一日一組」好相似，改成「一個月一組」。一旦而家嘅
    // 月份（伺服器算）同上次記錄嘅 monthlyPeriod 唔同，代表跨咗新一個
    // 月，由 0 重新計，等於自動歸零重新競賽。
    const curMonthStr = getServerMonthStr();
    let newMonthlyHours = (data.monthlyPeriod === curMonthStr) ? (parseFloat(data.monthlyHours) || 0) : 0;
    if (hoursIncrement > 0) {
      newHours = newHours + hoursIncrement;
      update.hours = newHours;
      // v1.199.6：「今日」改由伺服器用香港時間判斷，唔再信前端傳嚟嘅
      // isNewDay／todayDateStr——之前前端一開網頁就喺本機將 todayDate 改做
      // 今日（寫 Firestore 又俾規則擋），之後送嚟嘅 isNewDay 永遠係 false，
      // 伺服器就將今日嘅分鐘數接住尋日繼續加，「今日目標」同發佈溫習相片
      // 嘅 15 分鐘門檻都會計錯。
      const serverToday = getHongKongDateStr();
      newTodayMinutes = (data.todayDate === serverToday) ? newTodayMinutes + 1 : 1;
      newTodayDate = serverToday;
      update.todayMinutes = newTodayMinutes;
      update.todayDate = newTodayDate;
      newMonthlyHours = newMonthlyHours + hoursIncrement;
      update.monthlyHours = newMonthlyHours;
      update.monthlyPeriod = curMonthStr;
    }

    tx.update(userRef, update);
    return { points: newPoints, exp: newExp, hours: newHours, todayMinutes: newTodayMinutes, todayDate: newTodayDate, monthlyHours: newMonthlyHours, monthlyPeriod: curMonthStr, levelReward, stoneInfo, golden: golden ? { expMultiplier: golden.expMultiplier, stoneMultiplier: golden.stoneMultiplier } : null };
  });

  return { ok: true, ...result };
});

// ===================== 🚩 舉報（伺服器端驗證＋速率限制） =====================
// 舊做法：前端喺視訊房入面撳「舉報」，直接用前端 Firestore SDK
// addDoc() 寫入 reports collection（Firestore 規則淨係核對
// reporterUid 係咪本人、status 係咪 'pending'，冇任何次數限制）。呢個
// 冇速率限制嘅漏洞已經喺程式碼審查度指出：惡意學生可以短時間內狂洗
// 同一個人嘅舉報記錄嚟滋擾對方，或者洗版管理後台嘅舉報清單，令真正
// 需要處理嘅舉報被淹沒。
//
// submitReport 呢個 Cloud Function 將寫入 reports 呢一步搬去伺服器
// 端做（用 Admin SDK），套用返同 verifyRoomPassword／
// requestPasswordReset 一樣嘅 checkRateLimit 速率限制（同一個舉報人
// 10 分鐘內最多送出 5 次舉報，足夠應付真正需要連續舉報幾個人嘅情
// 況，但擋得住洗版式濫用）。順手將「查被舉報用家嘅帳號 ID／Email」
// 呢步都搬埋嚟伺服器度做（本身都要讀 users/{uid}，搬過嚟冇額外成
// 本），前端唔再需要呢部分邏輯。
//
// 配合 firestore.rules 將 reports 嘅 allow create 改做 if false，即係
// 話而家全部舉報一定要經呢個 function 先寫得入去，前端冇辦法再繞過
// 呢個 function 直接寫。
exports.submitReport = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "請先登入會員");
  }

  const reportedUid = request.data && request.data.reportedUid;
  if (!reportedUid || typeof reportedUid !== "string") {
    throw new HttpsError("invalid-argument", "缺少被舉報用戶");
  }
  const reportedName = (request.data && typeof request.data.reportedName === "string") ? request.data.reportedName : "";
  const roomId = (request.data && typeof request.data.roomId === "string") ? request.data.roomId : "";
  const roomName = (request.data && typeof request.data.roomName === "string") ? request.data.roomName : "";
  const reason = (request.data && typeof request.data.reason === "string" && request.data.reason) ? request.data.reason : "其他";
  const notes = (request.data && typeof request.data.notes === "string") ? request.data.notes.trim() : "";
  const screenshot = (request.data && typeof request.data.screenshot === "string") ? request.data.screenshot : null;

  await checkRateLimit(`submitReport_${uid}`, 5, 10 * 60 * 1000);

  let reporterName = "同學";
  let reporterLoginId = "";
  try {
    const reporterSnap = await db.doc(`users/${uid}`).get();
    if (reporterSnap.exists) {
      const rd = reporterSnap.data();
      reporterName = rd.username || reporterName;
      reporterLoginId = rd.loginId || "";
    }
  } catch (e) {
    console.warn("讀取舉報人資料失敗（唔影響舉報送出）:", e);
  }

  let targetLoginId = "";
  let targetEmail = "";
  try {
    const targetSnap = await db.doc(`users/${reportedUid}`).get();
    if (targetSnap.exists) {
      const td = targetSnap.data();
      targetLoginId = td.loginId || "";
      targetEmail = td.email || "";
    }
  } catch (e) {
    console.warn("讀取被舉報用家資料失敗（唔影響舉報送出）:", e);
  }

  await db.collection("reports").add({
    reporterUid: uid,
    reporterName,
    reporterLoginId,
    reportedUid,
    reportedName,
    reportedLoginId: targetLoginId,
    reportedEmail: targetEmail,
    roomId,
    roomName,
    reason,
    notes,
    screenshot,
    status: "pending",
    createdAt: Date.now(),
  });

  return { ok: true };
});

// ===================== 🖼️ 會員頭像上傳（附 AI 內容審查） =====================
// 學生喺「編輯個人資料」揀相做頭像，前端會先將相片壓縮／裁切做正方形
// 再轉做 base64（見 app-features.js handleAvatarFileSelected），淨係傳
// 呢個 base64 字串上嚟——真正嘅寫入同審查全部喺呢個 function 度做，
// 前端／Firestore Rules 唔容許用戶自己直接寫 avatarBase64 呢個欄位
// （見 firestore.rules selfUserUpdateOk()），逼所有頭像更新都一定要
// 經過呢度嘅 AI 內容審查先寫得入 Firestore。
//
// 用 Google Cloud Vision 嘅 SafeSearch Detection 偵測相片入面係咪含有
// 色情／暴露（adult／racy）或者暴力血腥（violence）內容，呢個 project
// 要喺 Google Cloud Console 開通「Cloud Vision API」先用得（Blaze 帳單
// 已經開咗；Vision API 每月首 1000 張免費，超出後大約 US$1.5/1000 張，
// 以呢個 app 嘅使用量嚟講成本應該好低）。偵測到 LIKELY／VERY_LIKELY
// 就會拒絕呢次上傳，前端會顯示明確嘅拒絕原因，等學生換第二張相。
const MAX_AVATAR_BASE64_LENGTH = 700 * 1024; // base64 字串長度上限，粗略對應原圖約 500KB，防止異常巨大嘅圖片塞爆 Firestore 單一文件 1MB 嘅上限
const AVATAR_BLOCKED_LEVELS = ["LIKELY", "VERY_LIKELY"];

exports.uploadAvatar = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "請先登入會員");
  }

  const image = request.data && request.data.image;
  if (typeof image !== "string" || !image.startsWith("data:image/")) {
    throw new HttpsError("invalid-argument", "無效的圖片格式");
  }
  if (image.length > MAX_AVATAR_BASE64_LENGTH) {
    throw new HttpsError("invalid-argument", "圖片檔案過大，請使用較小的相片");
  }

  // 上傳頭像唔係高頻操作，1 小時 10 次已經足夠應付「揀完覺得唔滿意再換
  // 一張」呢類正常使用情境，同時防止有人不斷呼叫呢個 function 濫用
  // SafeSearch 額度（每次呼叫都要計錢）。
  await checkRateLimit(`uploadAvatar_${uid}`, 10, 60 * 60 * 1000);

  const base64Data = image.split(",")[1] || "";
  const imageBuffer = Buffer.from(base64Data, "base64");

  let safeSearchResult;
  try {
    const [result] = await visionClient.safeSearchDetection({ image: { content: imageBuffer } });
    safeSearchResult = result.safeSearchAnnotation;
  } catch (e) {
    console.error("頭像 SafeSearch 偵測失敗:", e);
    throw new HttpsError("internal", "頭像檢測服務暫時無法使用，請稍後再試");
  }

  if (
    safeSearchResult &&
    (AVATAR_BLOCKED_LEVELS.includes(safeSearchResult.adult) ||
      AVATAR_BLOCKED_LEVELS.includes(safeSearchResult.racy) ||
      AVATAR_BLOCKED_LEVELS.includes(safeSearchResult.violence))
  ) {
    throw new HttpsError("invalid-argument", "偵測到相片可能含有不當內容，請更換其他相片作頭像");
  }

  await db.doc(`users/${uid}`).update({
    avatarBase64: image,
    avatarUpdatedAt: Date.now(),
  });

  return { ok: true };
});

// ===================== 📸 每日溫習相片動態（附發佈門檻＋AI 內容審查） =====================
// 呢個係一個好似 Instagram 咁嘅「個人溫習相簿」功能：學生每日最多可以
// 發佈一張相片，記錄自己嗰日嘅溫習狀態，其他人（好友）可以喺佢個人
// 資料卡度碌相簿、Follow 佢。因為呢個係一個會「持續產生內容」嘅功能
// （唔似頭像淨係一個人一張），設計上刻意加咗兩重門檻，減低濫用同埋
// 內容審查／Storage 嘅長遠成本：
//   1. 發佈門檻：一定要當日已經喺視訊溫習室專注溫習夠 15 分鐘
//      （users/{uid}.todayMinutes，同「今日目標」進度條共用嘅同一個
//      欄位，前端「今日目標」已經證明呢個欄位可靠）先解鎖發佈掣。
//   2. 每日一張：用 users/{uid}.lastPhotoPostDate 記低「今日已經發佈
//      咗」，同一日內唔可以再發第二張。
//
// ⚠️ todayMinutes／todayDate 本身喺 awardStudyPoints 度已經講過係「主要
// 畀畫面顯示用，信任前端傳嚟嘅日期字串」，但呢度用嚟做發佈門檻，屬於
// 有實質後果嘅判斷（決定使唔使使費一次 Storage／Vision API），所以
// 「今日」呢個日期唔再信任前端，而係伺服器自己用香港時區獨立計算，
// 淨係 todayMinutes 呢個數值（已經係伺服器逐分鐘、有速率限制咁樣加返
// 上嚟嘅，唔係前端一次過話畀幾多就幾多）沿用返做門檻依據。
function getHongKongDateStr(date) {
  // Asia/Hong_Kong 冇夏令時，UTC+8 係固定嘅，直接加 8 小時再攞返
  // UTC 嘅年月日就得，唔使處理夏令時切換嗰啲複雜情況。
  const hk = new Date((date || new Date()).getTime() + 8 * 60 * 60 * 1000);
  const yyyy = hk.getUTCFullYear();
  const mm = String(hk.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(hk.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const MAX_STUDY_PHOTO_BASE64_LENGTH = 1.5 * 1024 * 1024; // 約對應原圖 1MB 左右
const STUDY_PHOTO_BLOCKED_LEVELS = ["LIKELY", "VERY_LIKELY"];
const STUDY_PHOTO_MIN_MINUTES = 15;

exports.postStudyPhoto = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "請先登入會員");
  }

  const image = request.data && request.data.image;
  if (typeof image !== "string" || !image.startsWith("data:image/")) {
    throw new HttpsError("invalid-argument", "無效的圖片格式");
  }
  if (image.length > MAX_STUDY_PHOTO_BASE64_LENGTH) {
    throw new HttpsError("invalid-argument", "圖片檔案過大，請使用較小的相片");
  }

  // 發佈相片本身已經受「每日一張」呢個天然限制，呢度加返輕量嘅速率
  // 限制純粹係防止短時間內反覆試錯（例如撳完撳多次）浪費 Vision API
  // 額度，唔係真正嘅每日次數限制（真正限制睇下面 lastPhotoPostDate）。
  await checkRateLimit(`postStudyPhoto_${uid}`, 5, 10 * 60 * 1000);
  // v1.206.0：可以刪除當日相片再重新發佈，所以加每日上限防止反覆發佈／刪除
  await checkRateLimit(`postStudyPhotoDaily_${uid}`, 6, 24 * 60 * 60 * 1000);

  const todayStr = getHongKongDateStr();

  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    throw new HttpsError("not-found", "找不到這個帳戶");
  }
  const userData = userSnap.data();

  if (userData.lastPhotoPostDate === todayStr) {
    throw new HttpsError("failed-precondition", "今日已經發佈過一張溫習相片，請明天再發佈");
  }
  const todayMinutes = (userData.todayDate === todayStr) ? (userData.todayMinutes || 0) : 0;
  if (todayMinutes < STUDY_PHOTO_MIN_MINUTES) {
    throw new HttpsError(
      "failed-precondition",
      `需要在視訊溫習室累積溫習滿 ${STUDY_PHOTO_MIN_MINUTES} 分鐘，先可以發佈當日溫習相片（現時：${todayMinutes} 分鐘）`
    );
  }

  const base64Data = image.split(",")[1] || "";
  const imageBuffer = Buffer.from(base64Data, "base64");

  let safeSearchResult;
  try {
    const [result] = await visionClient.safeSearchDetection({ image: { content: imageBuffer } });
    safeSearchResult = result.safeSearchAnnotation;
  } catch (e) {
    console.error("溫習相片 SafeSearch 偵測失敗:", e);
    throw new HttpsError("internal", "相片檢測服務暫時無法使用，請稍後再試");
  }

  if (
    safeSearchResult &&
    (STUDY_PHOTO_BLOCKED_LEVELS.includes(safeSearchResult.adult) ||
      STUDY_PHOTO_BLOCKED_LEVELS.includes(safeSearchResult.racy) ||
      STUDY_PHOTO_BLOCKED_LEVELS.includes(safeSearchResult.violence))
  ) {
    throw new HttpsError("invalid-argument", "偵測到相片可能含有不當內容，請更換其他相片");
  }

  const contentType = image.substring(5, image.indexOf(";"));
  const extension = contentType === "image/png" ? "png" : "jpg";
  const storagePath = `study_photos/${uid}/${Date.now()}.${extension}`;
  const file = bucket.file(storagePath);
  const downloadToken = crypto.randomUUID();
  await file.save(imageBuffer, {
    metadata: {
      contentType,
      metadata: { firebaseStorageDownloadTokens: downloadToken },
    },
  });
  const photoUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;

  const photoRef = db.collection("studyPhotos").doc();
  const createdAt = Date.now();
  await photoRef.set({
    uid,
    photoUrl,
    storagePath,
    createdAt,
    dateStr: todayStr,
  });

  await userRef.update({
    photoCount: admin.firestore.FieldValue.increment(1),
    lastPhotoPostDate: todayStr,
  });

  return { ok: true, photoId: photoRef.id, photoUrl, createdAt };
});

// ===================== 刪除溫習相片（v1.206.0） =====================
// 淨係相片主人自己可以刪。刪除今日嗰張之後，lastPhotoPostDate 會清走，
// 今日可以再發佈一張——溫習日記入面每日始終最多一張。
exports.deleteStudyPhoto = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "請先登入會員");
  const photoId = request.data && request.data.photoId;
  if (typeof photoId !== "string" || !/^[A-Za-z0-9]{1,64}$/.test(photoId)) {
    throw new HttpsError("invalid-argument", "無效的相片");
  }
  const photoRef = db.doc(`studyPhotos/${photoId}`);
  const photoSnap = await photoRef.get();
  if (!photoSnap.exists) throw new HttpsError("not-found", "相片已經不存在");
  const photo = photoSnap.data();
  if (photo.uid !== uid) throw new HttpsError("permission-denied", "只可以刪除自己的相片");

  const todayStr = getHongKongDateStr();
  const userRef = db.doc(`users/${uid}`);
  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const updates = { photoCount: admin.firestore.FieldValue.increment(-1) };
    if (userSnap.exists && (userSnap.data().photoCount || 0) <= 0) delete updates.photoCount;
    if (photo.dateStr === todayStr && userSnap.exists && userSnap.data().lastPhotoPostDate === todayStr) {
      updates.lastPhotoPostDate = admin.firestore.FieldValue.delete();
    }
    tx.delete(photoRef);
    if (userSnap.exists) tx.update(userRef, updates);
  });
  if (photo.storagePath && String(photo.storagePath).startsWith(`study_photos/${uid}/`)) {
    await bucket.file(photo.storagePath).delete().catch((e) => console.warn("刪除相片檔案失敗:", e.message));
  }
  return { ok: true, wasToday: photo.dateStr === todayStr };
});

// ===================== 👥 Follow（單向追蹤，唔同於互相要確認嘅「好友」） =====================
// follows/{followerUid}_{followedUid} 文件記錄一段追蹤關係；followerCount／
// followingCount 分別存喺 users/{uid} 文件度，用嚟喺個人資料卡即時顯示，
// 呢兩個 counter 一定要經呢兩個 function（用 transaction）先改得到——
// firestore.rules 已經將呢兩個欄位、同 follows collection 本身都鎖死
// 唔畀前端直接寫，避免用戶自己作大自己嘅粉絲數。
function followDocId(followerUid, followedUid) {
  return `${followerUid}_${followedUid}`;
}

exports.followUser = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "請先登入會員");
  }
  const targetUid = request.data && request.data.targetUid;
  if (!targetUid || typeof targetUid !== "string") {
    throw new HttpsError("invalid-argument", "缺少 targetUid");
  }
  if (targetUid === uid) {
    throw new HttpsError("invalid-argument", "不能追蹤自己");
  }

  await checkRateLimit(`followUser_${uid}`, 30, 60 * 1000);

  const followRef = db.doc(`follows/${followDocId(uid, targetUid)}`);
  const meRef = db.doc(`users/${uid}`);
  const targetRef = db.doc(`users/${targetUid}`);

  await db.runTransaction(async (tx) => {
    const [followSnap, targetSnap] = await Promise.all([tx.get(followRef), tx.get(targetRef)]);
    if (!targetSnap.exists) {
      throw new HttpsError("not-found", "找不到這個帳戶");
    }
    if (followSnap.exists) {
      return; // 已經追蹤緊，唔使重複計數
    }
    tx.set(followRef, { followerUid: uid, followedUid: targetUid, createdAt: Date.now() });
    tx.update(meRef, { followingCount: admin.firestore.FieldValue.increment(1) });
    tx.update(targetRef, { followerCount: admin.firestore.FieldValue.increment(1) });
  });

  return { ok: true };
});

exports.unfollowUser = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "請先登入會員");
  }
  const targetUid = request.data && request.data.targetUid;
  if (!targetUid || typeof targetUid !== "string") {
    throw new HttpsError("invalid-argument", "缺少 targetUid");
  }

  const followRef = db.doc(`follows/${followDocId(uid, targetUid)}`);
  const meRef = db.doc(`users/${uid}`);
  const targetRef = db.doc(`users/${targetUid}`);

  await db.runTransaction(async (tx) => {
    const followSnap = await tx.get(followRef);
    if (!followSnap.exists) {
      return; // 本身冇追蹤緊，唔使做嘢
    }
    tx.delete(followRef);
    tx.update(meRef, { followingCount: admin.firestore.FieldValue.increment(-1) });
    tx.update(targetRef, { followerCount: admin.firestore.FieldValue.increment(-1) });
  });

  return { ok: true };
});

// ===================== 🎓 導師身份：申請與審批（Phase A：導師 PDF 筆記商店） =====================
// 呢一批 function 係「導師 PDF 筆記商店」呢個延伸功能嘅第一階段，只負責
// 「學生點樣變成導師」呢件事本身，完全未涉及上傳筆記、落單、付款呢啲
// 後續階段（見 docs/TUTOR_MARKETPLACE_DESIGN.md 第 6 節）。
//
// 身份轉換嘅完整流程：
//   1. 學生喺前台填資料，呼叫 applyTutorRole → 喺 tutorApplications/{uid}
//      建立一份 status='pending' 嘅申請（唔會即刻改 role）。
//   2. 管理員喺後台「導師申請」分頁睇到呢份申請，撳「批准」或者「駁回」，
//      分別觸發 approveTutorApplication／rejectTutorApplication。
//   3. 批准嗰刻先用一個 transaction 同時做三件事：申請文件標記做
//      approved、建立 tutors/{uid} 呢份導師公開資料、同埋將
//      users/{uid}.role 改做 'tutor'——三者一定要一齊成功或者一齊失敗，
//      所以用 transaction，唔可以分開幾次獨立寫入。
//
// 呢五個 function 全部用 Admin SDK 寫，firestore.rules 已經將
// tutorApplications／tutors 兩個 collection 嘅前端直接寫入權限鎖死
// （write: if false），逼死一定要經呢度先改得到，避免用戶自己偽造
// 「已批核」狀態，或者管理員以外嘅人幫自己/別人停權／解除停權。

// 檢查呼叫者是否管理員：讀返佢自己 users/{uid} 嘅 loginId，再睇吓呢個
// loginId 是否喺 admin_config/adminIds 嘅名單入面——同 firestore.rules
// 嘅 isAdmin() 用緊完全一樣嘅判斷邏輯，兩邊要保持一致。
async function assertIsAdmin(uid) {
  if (!uid) {
    throw new HttpsError("unauthenticated", "請先登入會員");
  }
  const userSnap = await db.doc(`users/${uid}`).get();
  const loginId = userSnap.exists ? userSnap.data().loginId : null;
  if (!loginId) {
    throw new HttpsError("permission-denied", "只有管理員可以執行這個操作");
  }
  const adminSnap = await db.doc("admin_config/adminIds").get();
  const ids = (adminSnap.exists && Array.isArray(adminSnap.data().ids)) ? adminSnap.data().ids : [];
  if (!ids.includes(loginId)) {
    throw new HttpsError("permission-denied", "只有管理員可以執行這個操作");
  }
}

// applyTutorRole —— 學生喺前台填好「顯示名稱／自我介紹／想教嘅科目／
// 聯絡方式」之後呼叫，建立一份待審批嘅導師申請。加咗速率限制（同一
// 用戶 24 小時內最多 3 次），避免有人手快唔覺意或者惡意狂咁交重複申請，
// 洗版管理後台嘅審批列表。
exports.applyTutorRole = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "請先登入會員");
  }

  const data = request.data || {};
  const displayName = typeof data.displayName === "string" ? data.displayName.trim().slice(0, 40) : "";
  const bio = typeof data.bio === "string" ? data.bio.trim().slice(0, 500) : "";
  const contactInfo = typeof data.contactInfo === "string" ? data.contactInfo.trim().slice(0, 200) : "";
  let subjectsIntended = Array.isArray(data.subjectsIntended) ? data.subjectsIntended : [];
  subjectsIntended = subjectsIntended
    .filter((s) => typeof s === "string" && s.trim())
    .map((s) => s.trim().slice(0, 20))
    .slice(0, 10);

  if (!displayName) {
    throw new HttpsError("invalid-argument", "請填寫顯示名稱");
  }
  if (subjectsIntended.length === 0) {
    throw new HttpsError("invalid-argument", "請至少填寫一個想教的科目");
  }

  await checkRateLimit(`applyTutorRole_${uid}`, 3, 24 * 60 * 60 * 1000);

  const userRef = db.doc(`users/${uid}`);
  const appRef = db.doc(`tutorApplications/${uid}`);
  const tutorRef = db.doc(`tutors/${uid}`);

  await db.runTransaction(async (tx) => {
    const [userSnap, appSnap, tutorSnap] = await Promise.all([
      tx.get(userRef),
      tx.get(appRef),
      tx.get(tutorRef),
    ]);
    if (!userSnap.exists) {
      throw new HttpsError("not-found", "找不到你的帳戶資料");
    }
    if (tutorSnap.exists) {
      throw new HttpsError("failed-precondition", "你已經是導師身份");
    }
    if (appSnap.exists && appSnap.data().status === "pending") {
      throw new HttpsError("failed-precondition", "你已經有一個申請正在審批中");
    }
    tx.set(appRef, {
      uid,
      displayName,
      bio,
      subjectsIntended,
      contactInfo,
      status: "pending",
      rejectionReason: null,
      submittedAt: Date.now(),
      reviewedAt: null,
      reviewedBy: null,
    });
    // accountType 純粹畀前端即時判斷「呢個帳戶揀咗導師呢條路」用，
    // 等側邊欄喺管理員仲未批核之前，都已經顯示導師專用嘅殼（連同
    // 「審批中」提示），唔會好似普通學生咁見到一整套學生功能——真正
    // 嘅權限（可唔可以新增科目／上傳教材）仍然係睇 role／
    // tutors.status，同呢個欄位完全分開。
    tx.update(userRef, { accountType: "tutor" });
  });

  return { ok: true };
});

// approveTutorApplication —— 管理員後台撳「批准」時呼叫。一個 transaction
// 內同時：(1) 將申請標記做 approved，(2) 建立 tutors/{uid} 公開資料，
// (3) 將 users/{uid}.role 改做 'tutor'。
exports.approveTutorApplication = onCall(async (request) => {
  const adminUid = request.auth && request.auth.uid;
  await assertIsAdmin(adminUid);

  const targetUid = request.data && request.data.targetUid;
  if (!targetUid || typeof targetUid !== "string") {
    throw new HttpsError("invalid-argument", "缺少 targetUid");
  }

  const appRef = db.doc(`tutorApplications/${targetUid}`);
  const tutorRef = db.doc(`tutors/${targetUid}`);
  const userRef = db.doc(`users/${targetUid}`);

  await db.runTransaction(async (tx) => {
    const [appSnap, userSnap] = await Promise.all([tx.get(appRef), tx.get(userRef)]);
    if (!appSnap.exists) {
      throw new HttpsError("not-found", "找不到這個導師申請");
    }
    const app = appSnap.data();
    if (app.status !== "pending") {
      throw new HttpsError("failed-precondition", "這個申請已經處理過");
    }
    if (!userSnap.exists) {
      throw new HttpsError("not-found", "找不到這位用戶");
    }

    const now = Date.now();
    tx.update(appRef, { status: "approved", reviewedAt: now, reviewedBy: adminUid });
    tx.set(tutorRef, {
      uid: targetUid,
      displayName: app.displayName || "",
      bio: app.bio || "",
      subjectsIntended: app.subjectsIntended || [],
      contactInfo: app.contactInfo || "",
      payoutName: "",
      payoutNote: "",
      status: "active",
      createdAt: now,
    });
    tx.update(userRef, { role: "tutor" });
  });

  return { ok: true };
});

// rejectTutorApplication —— 管理員後台撳「駁回」時呼叫，可以附上駁回原因
// （會喺前端畀申請人睇到），唔會建立 tutors 文件、亦唔會改 role。
exports.rejectTutorApplication = onCall(async (request) => {
  const adminUid = request.auth && request.auth.uid;
  await assertIsAdmin(adminUid);

  const targetUid = request.data && request.data.targetUid;
  const rejectionReason =
    typeof (request.data && request.data.rejectionReason) === "string"
      ? request.data.rejectionReason.trim().slice(0, 300)
      : "";
  if (!targetUid || typeof targetUid !== "string") {
    throw new HttpsError("invalid-argument", "缺少 targetUid");
  }

  const appRef = db.doc(`tutorApplications/${targetUid}`);
  await db.runTransaction(async (tx) => {
    const appSnap = await tx.get(appRef);
    if (!appSnap.exists) {
      throw new HttpsError("not-found", "找不到這個導師申請");
    }
    if (appSnap.data().status !== "pending") {
      throw new HttpsError("failed-precondition", "這個申請已經處理過");
    }
    tx.update(appRef, {
      status: "rejected",
      rejectionReason: rejectionReason || null,
      reviewedAt: Date.now(),
      reviewedBy: adminUid,
    });
  });

  return { ok: true };
});

// 分批將一批 tutorNotes 改做指定狀態（Firestore 單一 batch 最多 500 個
//寫入操作，呢度保守咁用 400 一批，避免導師教材數量好多嗰陣爆錶）。
async function bulkUpdateTutorNoteStatus(tutorUid, fromStatus, toStatus) {
  const snap = await db.collection("tutorNotes")
    .where("tutorUid", "==", tutorUid)
    .where("status", "==", fromStatus)
    .get();
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    docs.slice(i, i + 400).forEach((d) => {
      batch.update(d.ref, { status: toStatus, updatedAt: Date.now() });
    });
    await batch.commit();
  }
  return docs.length;
}

// suspendTutor —— 管理員停權一位導師。同一時間會將呢位導師所有
// status='published' 嘅 tutorNotes 批量改做 'delisted'（新客戶睇唔到、
// 買唔到），但已經購買過嘅學生保留下載權（entitlements 唔受呢度影
// 響——Phase D 先會有呢個 collection，而家仲未有真正嘅購買紀錄）。
exports.suspendTutor = onCall(async (request) => {
  const adminUid = request.auth && request.auth.uid;
  await assertIsAdmin(adminUid);

  const targetUid = request.data && request.data.targetUid;
  if (!targetUid || typeof targetUid !== "string") {
    throw new HttpsError("invalid-argument", "缺少 targetUid");
  }

  const tutorRef = db.doc(`tutors/${targetUid}`);
  const tutorSnap = await tutorRef.get();
  if (!tutorSnap.exists) {
    throw new HttpsError("not-found", "找不到這位導師");
  }
  await tutorRef.update({ status: "suspended" });
  const delistedCount = await bulkUpdateTutorNoteStatus(targetUid, "published", "delisted");

  return { ok: true, delistedCount };
});

// reinstateTutor —— 管理員解除停權。將呢位導師所有 status='delisted'
// （唔包括導師自己主動下架嘅 'removed'）嘅 tutorNotes 復原做
// 'published'，'removed' 嘅教材唔會被呢個動作意外復活。
exports.reinstateTutor = onCall(async (request) => {
  const adminUid = request.auth && request.auth.uid;
  await assertIsAdmin(adminUid);

  const targetUid = request.data && request.data.targetUid;
  if (!targetUid || typeof targetUid !== "string") {
    throw new HttpsError("invalid-argument", "缺少 targetUid");
  }

  const tutorRef = db.doc(`tutors/${targetUid}`);
  const tutorSnap = await tutorRef.get();
  if (!tutorSnap.exists) {
    throw new HttpsError("not-found", "找不到這位導師");
  }
  await tutorRef.update({ status: "active" });
  const restoredCount = await bulkUpdateTutorNoteStatus(targetUid, "delisted", "published");

  return { ok: true, restoredCount };
});

// ===================== 🗂️ 導師教材管理（Phase B／C：科目、課題、PDF 筆記） =====================
// 科目（tutorSubjects）、課題（tutorTopics）純粹係分類用嘅文字結構，
// 前端直接用 Firestore SDK 讀寫（firestore.rules 已經用 isActiveTutor()
// ＋擁有者判斷保護好），唔需要額外 Cloud Function。
//
// 教材（tutorNotes）就唔同，因為涉及真正嘅 PDF 檔案，一定要行呢個流程：
//   1. beginTutorNoteUpload —— 導師喺後台填好標題／簡介／定價，呼叫呢個
//      function 建立一份 status='draft' 嘅教材文件，攞返 noteId。
//   2. 前端用返個 noteId，將 PDF 檔直接（唔經 Cloud Function）上傳去
//      Storage 嘅 tutor_notes/{uid}/{noteId}/full.pdf（storage.rules
//      已經開放導師本人寫入呢條路徑，上限 50MB）。
//   3. registerTutorNoteUpload —— 上傳完成之後呼叫，用 Admin SDK 讀返
//      個 PDF 檔案本身，用 pdf-lib 讀出實際頁數，狀態轉做
//      'awaiting_preview_selection'。
//   4. selectTutorNotePreviewPages —— 導師揀最多 3 頁做預覽，呢個
//      function 用 pdf-lib 由 full.pdf 抽返嗰幾頁另存做
//      preview.pdf，狀態轉做 'published'。之後都可以再揀過，唔限一次。
//   5. deleteTutorNote —— 刪除教材，會一併清理 Storage 入面嘅
//      full.pdf／preview.pdf，唔留低孤兒檔案。
//
// 呢個流程特登唔用返 avatar／溫習相片嗰種「轉 base64 經 Cloud Function
// 寫入」做法——PDF 筆記檔通常有幾 MB 甚至幾十 MB，Cloud Functions
// onCall 嘅 request body 有大細限制，一定要用返「前端直接上傳去
// Storage，Cloud Function 淨係負責之後嘅後續處理」呢種做法先撐得住。

// 檢查呼叫者是否一位「仲喺正常狀態」嘅導師，同時攞返嗰份 tutors 文件
// （暫時未用到內容，但保留俾之後擴充，例如記錄最後活躍時間）。
async function assertIsActiveTutor(uid) {
  if (!uid) {
    throw new HttpsError("unauthenticated", "請先登入會員");
  }
  const tutorSnap = await db.doc(`tutors/${uid}`).get();
  if (!tutorSnap.exists || tutorSnap.data().status !== "active") {
    throw new HttpsError("permission-denied", "只有正常狀態的導師可以執行這個操作");
  }
  return tutorSnap.data();
}

exports.beginTutorNoteUpload = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  await assertIsActiveTutor(uid);

  const data = request.data || {};
  const subjectId = typeof data.subjectId === "string" ? data.subjectId : "";
  const topicId = typeof data.topicId === "string" ? data.topicId : "";
  const title = typeof data.title === "string" ? data.title.trim().slice(0, 80) : "";
  const description = typeof data.description === "string" ? data.description.trim().slice(0, 1000) : "";
  // ⚠️ 定價一定要係「以蚊為單位嘅整數」（priceCents 一定要係 100 嘅倍數），
  // 唔可以有仙、亦唔可以低過 HKD$10——同前端 tutor-panel.js 嘅
  // submitTutorNoteUpload() 表面驗證一致，呢度係第二重（伺服器端）
  // 把關，防止有人繞過前端直接打 Cloud Function 塞低過 $10 或者有仙嘅價。
  const priceCents = Number.isInteger(data.priceCents) && data.priceCents >= 1000 && data.priceCents % 100 === 0
    ? data.priceCents
    : NaN;

  if (!subjectId || !topicId) {
    throw new HttpsError("invalid-argument", "缺少科目或課題");
  }
  if (!title) {
    throw new HttpsError("invalid-argument", "請填寫教材標題");
  }
  if (Number.isNaN(priceCents)) {
    throw new HttpsError("invalid-argument", "定價必須為 HKD$10 或以上的整數金額");
  }

  const [subjectSnap, topicSnap] = await Promise.all([
    db.doc(`tutorSubjects/${subjectId}`).get(),
    db.doc(`tutorTopics/${topicId}`).get(),
  ]);
  if (!subjectSnap.exists || subjectSnap.data().tutorUid !== uid) {
    throw new HttpsError("not-found", "找不到這個科目");
  }
  if (!topicSnap.exists || topicSnap.data().tutorUid !== uid || topicSnap.data().subjectId !== subjectId) {
    throw new HttpsError("not-found", "找不到這個課題");
  }

  await checkRateLimit(`beginTutorNoteUpload_${uid}`, 20, 24 * 60 * 60 * 1000);

  const noteRef = db.collection("tutorNotes").doc();
  const now = Date.now();
  await noteRef.set({
    tutorUid: uid,
    subjectId,
    topicId,
    title,
    description,
    priceCents,
    pageCount: null,
    previewPages: [],
    fullStoragePath: `tutor_notes/${uid}/${noteRef.id}/full.pdf`,
    previewStoragePath: null,
    status: "draft",
    purchaseCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  return { ok: true, noteId: noteRef.id };
});

exports.registerTutorNoteUpload = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  await assertIsActiveTutor(uid);

  const noteId = request.data && request.data.noteId;
  if (!noteId || typeof noteId !== "string") {
    throw new HttpsError("invalid-argument", "缺少 noteId");
  }

  const noteRef = db.doc(`tutorNotes/${noteId}`);
  const noteSnap = await noteRef.get();
  if (!noteSnap.exists || noteSnap.data().tutorUid !== uid) {
    throw new HttpsError("not-found", "找不到這份教材");
  }
  const note = noteSnap.data();
  if (note.status !== "draft") {
    throw new HttpsError("failed-precondition", "這份教材已經完成上傳登記");
  }

  let pdfBytes;
  try {
    const [contents] = await bucket.file(note.fullStoragePath).download();
    pdfBytes = contents;
  } catch (e) {
    throw new HttpsError("not-found", "找不到已上傳的 PDF 檔案，請先完成上傳再試");
  }

  let pageCount;
  try {
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    pageCount = pdfDoc.getPageCount();
  } catch (e) {
    throw new HttpsError("invalid-argument", "無法讀取這個 PDF 檔案，請確認檔案沒有損壞");
  }
  if (!pageCount || pageCount < 1) {
    throw new HttpsError("invalid-argument", "這個 PDF 檔案沒有任何頁面");
  }

  await noteRef.update({ pageCount, status: "awaiting_preview_selection", updatedAt: Date.now() });

  return { ok: true, pageCount };
});

exports.selectTutorNotePreviewPages = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  await assertIsActiveTutor(uid);

  const data = request.data || {};
  const noteId = data.noteId;
  let pages = Array.isArray(data.pages) ? data.pages : [];
  pages = [...new Set(pages.filter((p) => Number.isInteger(p) && p >= 1))].sort((a, b) => a - b);

  if (!noteId || typeof noteId !== "string") {
    throw new HttpsError("invalid-argument", "缺少 noteId");
  }
  if (pages.length === 0) {
    throw new HttpsError("invalid-argument", "請至少選擇一頁作為預覽");
  }
  if (pages.length > 3) {
    throw new HttpsError("invalid-argument", "預覽頁數最多只可以選 3 頁");
  }

  const noteRef = db.doc(`tutorNotes/${noteId}`);
  const noteSnap = await noteRef.get();
  if (!noteSnap.exists || noteSnap.data().tutorUid !== uid) {
    throw new HttpsError("not-found", "找不到這份教材");
  }
  const note = noteSnap.data();
  if (!["awaiting_preview_selection", "published"].includes(note.status)) {
    throw new HttpsError("failed-precondition", "這份教材目前的狀態不可以設定預覽頁");
  }
  if (!note.pageCount || pages.some((p) => p > note.pageCount)) {
    throw new HttpsError("invalid-argument", "選擇的頁數超出了這份教材的實際頁數");
  }

  await checkRateLimit(`selectTutorNotePreviewPages_${uid}`, 30, 60 * 60 * 1000);

  const [pdfBytes] = await bucket.file(note.fullStoragePath).download();
  const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const previewDoc = await PDFDocument.create();
  const copiedPages = await previewDoc.copyPages(srcDoc, pages.map((p) => p - 1));
  copiedPages.forEach((p) => previewDoc.addPage(p));
  const previewBytes = await previewDoc.save();

  const previewStoragePath = `tutor_notes/${uid}/${noteId}/preview.pdf`;
  await bucket.file(previewStoragePath).save(Buffer.from(previewBytes), {
    contentType: "application/pdf",
  });

  await noteRef.update({
    previewPages: pages,
    previewStoragePath,
    status: "published",
    updatedAt: Date.now(),
  });

  return { ok: true };
});

exports.deleteTutorNote = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "請先登入會員");
  }

  const noteId = request.data && request.data.noteId;
  if (!noteId || typeof noteId !== "string") {
    throw new HttpsError("invalid-argument", "缺少 noteId");
  }

  const noteRef = db.doc(`tutorNotes/${noteId}`);
  const noteSnap = await noteRef.get();
  if (!noteSnap.exists) {
    throw new HttpsError("not-found", "找不到這份教材");
  }
  const note = noteSnap.data();

  const isOwner = note.tutorUid === uid;
  if (!isOwner) {
    await assertIsAdmin(uid);
  }

  const filesToDelete = [note.fullStoragePath, note.previewStoragePath].filter(Boolean);
  await Promise.all(
    filesToDelete.map((path) =>
      bucket
        .file(path)
        .delete({ ignoreNotFound: true })
        .catch((e) => {
          console.error(`刪除 Storage 檔案失敗（${path}）：`, e);
        })
    )
  );

  await noteRef.delete();

  return { ok: true };
});

// ===================== 分區／學校溫習排行榜 =====================
// 「用帳號 ID 搜尋朋友」之前個 firestore.rules 教訓：users 呢個 collection
// 一直都刻意唔開放 list（見 firestore.rules 嘅 `allow list: if
// isAdmin(database);`）——一開放俾人隨便查詢／排序，就等於任何已登入
// 用戶都可以成個 collection 咁掃出所有人嘅電郵、學校、帳號 ID 等私隱
// 資料，唔安全。所以排行榜唔係直接畀前端查 users，而係由呢個 trigger
// 喺 users/{uid} 每次寫入（建立／更新／刪除）嗰陣，自動同步一份「刪走
// 晒私隱資料、淨係得返排行榜用得着嘅幾個欄位」嘅公開文件去
// leaderboardEntries/{uid}（個人分區排行榜用）同 schoolLeaderboard/
// {schoolId}（學校加總排行榜用，一間學校一份文件，累加緊該校所有學
// 生嘅時數同人數）。前端對呢兩個 collection 有 list 權限（見
// firestore.rules），但寫入淨係呢個 trigger（用 Admin SDK）先做得到。
//
// 導師帳號完全唔應該出現喺任何排行榜（導師冇「溫習時數」呢個概念，
// 見 tutor-panel.js applyRoleBasedSidebar 對導師隱藏晒呢批統計），所以
// role 或 accountType 係 'tutor' 嘅用戶，如果之前有份 leaderboardEntries
// 文件（例如曾經係學生、之後先轉做導師）就要清走。

function sanitizeSchoolIdForDoc(schoolName) {
  const trimmed = (schoolName || "").trim();
  if (!trimmed) return null;
  // Firestore 文件 ID 唔可以含 "/"，都唔可以淨係 "." 或 ".."；學校名
  // 幾乎唔會撞到呢幾種情況，但都寫定一個保護措施，避免整份文件寫入
  // 失敗。長度都做返上限（Firestore 文件 ID 上限 1500 bytes，學校名遠
  // 遠用唔到咁多，呢度淨係加一個保守嘅上限）。
  const safe = trimmed.replace(/\//g, "_").slice(0, 300);
  return safe === "." || safe === ".." ? null : safe;
}

exports.syncLeaderboardOnUserWrite = onDocumentWritten("users/{uid}", async (event) => {
  const uid = event.params.uid;
  const beforeSnap = event.data && event.data.before;
  const afterSnap = event.data && event.data.after;
  const before = beforeSnap && beforeSnap.exists ? beforeSnap.data() : null;
  const after = afterSnap && afterSnap.exists ? afterSnap.data() : null;

  const isTutor = (u) => !!u && (u.accountType === "tutor" || u.role === "tutor");
  // 排行榜（分區個人榜／校內榜／學校總榜）由「僅中學適用」改版起，淨係
  // 應該有中學生（「我的帳戶」嘅「現時年級」選咗中一至中六）先出現，
  // 大專／大學同其他／自修生一律唔應該出現喺實際榜單入面（呢兩類帳戶
  // 前端會喺自己嗰行顯示「不適用」，見 app-features.js
  // isLeaderboardGradeNotApplicable）。grade 呢個欄位喺「年級選擇」呢個
  // 功能推出之前已經註冊嘅舊帳戶可能未設定（undefined），一律當合資
  // 格（沿用返之前『所有非導師帳戶都上榜』嘅保守做法），淨係將明確揀
  // 咗「大專/大學」或者「其他自修生」擋喺排行榜門外。
  const SECONDARY_GRADES = ["中一 (S1)", "中二 (S2)", "中三 (S3)", "中四 (S4)", "中五 (S5)", "中六 (S6 DSE)"];
  const isGradeEligible = (u) => !u || !u.grade || SECONDARY_GRADES.includes(u.grade);
  const wasEligible = !!before && !isTutor(before) && isGradeEligible(before);
  const isEligible = !!after && !isTutor(after) && isGradeEligible(after);

  const leaderboardRef = db.collection("leaderboardEntries").doc(uid);

  // 由「應該喺榜」變成「唔應該喺榜」（帳戶刪除、或者轉做導師）：清走
  // 個人排行榜文件，並且將呢位用戶之前貢獻落佢學校嗰份時數／人數，
  // 由 schoolLeaderboard（累積）同 schoolLeaderboardMonthly（本月，如果
  // 佢仲喺同一個月）度扣返走。
  if (wasEligible && !isEligible) {
    await leaderboardRef.delete().catch(() => {});
    const oldSchoolId = sanitizeSchoolIdForDoc(before.school);
    if (oldSchoolId) {
      await adjustSchoolLeaderboard(oldSchoolId, before.school, -(parseFloat(before.hours) || 0), -1);
      const curMonthStr = getServerMonthStr();
      if (before.monthlyPeriod === curMonthStr) {
        await adjustSchoolLeaderboardMonthly(oldSchoolId, before.school, curMonthStr, -(parseFloat(before.monthlyHours) || 0));
      }
    }
    return;
  }

  if (!isEligible) return; // 由頭到尾都唔應該喺榜（例如導師帳戶啱啱建立），乜都唔使做

  // ⚠️ v1.198.0 慳錢修補：在線用戶每 45 秒會更新一次 lastSeenAt（好友
  // 在線狀態用），之前每次都會觸發呢個 function 再寫一次 leaderboardEntries，
  // 人一多 Firestore 寫入同 function 次數會急升。而家如果排行榜用到嘅欄位
  // 完全冇變（同埋之前已經喺榜），就直接收工。
  if (wasEligible) {
    const LB_FIELDS = ["hours", "school", "district", "username", "avatarBase64", "grade", "monthlyHours", "monthlyPeriod"];
    const unchanged = LB_FIELDS.every((k) => JSON.stringify(before[k] === undefined ? null : before[k]) === JSON.stringify(after[k] === undefined ? null : after[k]));
    if (unchanged) return;
  }

  const curMonthStr = getServerMonthStr();
  const newHours = parseFloat(after.hours) || 0;
  const newSchool = (after.school || "").trim();
  const newDistrict = (after.district || "").trim();
  const newUsername = after.username || "同學";
  // 本月時數：如果呢位用戶最後一次更新已經係今個月，攞返個真實數字；
  // 如果佢個 monthlyPeriod 停留喺舊月份（代表今個月一直未再溫習過），
  // 就當佢本月貢獻係 0——呢個判斷對個人榜同學校總榜都要一致，唔係
  // 「本月排行榜」會混入上個月嘅殘留數字。
  const newMonthlyHours = (after.monthlyPeriod === curMonthStr) ? (parseFloat(after.monthlyHours) || 0) : 0;
  // 頭像一齊同步落嚟，等排行榜可以直接顯示相片，唔使前端逐個用戶再
  // 查一次（users 冚唪唥 50 個一齊查會好嘥）。加一個保守嘅大小上限
  // （300KB），異常巨大嘅 base64 就唔存，前端會自動 fallback 做用戶名
  // 首字母，避免單一份 leaderboardEntries 文件因為相片太大超出
  // Firestore 1MiB 上限。
  const rawAvatar = typeof after.avatarBase64 === "string" ? after.avatarBase64 : null;
  const newAvatarBase64 = (rawAvatar && rawAvatar.length <= 300000) ? rawAvatar : null;

  await leaderboardRef.set({
    uid,
    username: newUsername,
    avatarBase64: newAvatarBase64,
    hours: newHours,
    school: newSchool,
    district: newDistrict,
    grade: after.grade || "",
    monthlyHours: newMonthlyHours,
    monthlyPeriod: curMonthStr,
    exp: Math.max(0, Math.floor(after.exp || 0)), // v1.220.0：排行榜顯示段位稱號用
    updatedAt: Date.now(),
  });

  const oldHours = wasEligible ? (parseFloat(before.hours) || 0) : 0;
  const oldSchool = wasEligible ? (before.school || "").trim() : "";
  const oldSchoolId = sanitizeSchoolIdForDoc(oldSchool);
  const newSchoolId = sanitizeSchoolIdForDoc(newSchool);
  // 舊資料嘅「本月貢獻」都要用同一套「係咪今個月」嘅邏輯，先唔會將上
  // 個月嘅殘留數字誤當做今個月要扣走嘅數。
  const oldMonthlyHours = (wasEligible && before.monthlyPeriod === curMonthStr) ? (parseFloat(before.monthlyHours) || 0) : 0;

  if (oldSchoolId === newSchoolId) {
    // 學校冇改變（包括「一直都冇填學校」嘅情況），淨係時數有變化就得
    if (newSchoolId && newHours !== oldHours) {
      await adjustSchoolLeaderboard(newSchoolId, newSchool, newHours - oldHours, 0);
    }
    if (newSchoolId && newMonthlyHours !== oldMonthlyHours) {
      await adjustSchoolLeaderboardMonthly(newSchoolId, newSchool, curMonthStr, newMonthlyHours - oldMonthlyHours);
    }
  } else {
    // 學校改變咗（或者呢次先第一次有學校）：舊學校扣走呢位用戶嘅貢獻，
    // 新學校加返落去，兩個 collection 嘅寫入冇因果關係，可以並行處理
    const tasks = [];
    if (oldSchoolId) tasks.push(adjustSchoolLeaderboard(oldSchoolId, oldSchool, -oldHours, -1));
    if (newSchoolId) tasks.push(adjustSchoolLeaderboard(newSchoolId, newSchool, newHours, 1));
    if (oldSchoolId && oldMonthlyHours > 0) tasks.push(adjustSchoolLeaderboardMonthly(oldSchoolId, oldSchool, curMonthStr, -oldMonthlyHours));
    if (newSchoolId && newMonthlyHours > 0) tasks.push(adjustSchoolLeaderboardMonthly(newSchoolId, newSchool, curMonthStr, newMonthlyHours));
    await Promise.all(tasks);
  }
});

// schoolLeaderboard/{schoolId} 一間學校一份文件，用 transaction 安全咁
// 累加／扣減 totalHours（幾位同校學生嘅 trigger 有機會幾乎同時觸發，
// 一定要用 transaction 而唔係讀出嚟加完再寫返去，唔係會撞失更新）。
// deltaCount 用嚟維持返「呢間學校而家有幾多位有記錄嘅學生」，文件本
// 身歸零（totalHours<=0 且 studentCount<=0）就直接刪走，唔留低一堆
// 已經冇學生嘅學校空文件喺個排行榜度。
async function adjustSchoolLeaderboard(schoolId, schoolName, deltaHours, deltaCount) {
  const ref = db.collection("schoolLeaderboard").doc(schoolId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists ? snap.data() : { totalHours: 0, studentCount: 0 };
    const newTotalHours = Math.max(0, (cur.totalHours || 0) + deltaHours);
    const newStudentCount = Math.max(0, (cur.studentCount || 0) + deltaCount);
    if (newTotalHours <= 0 && newStudentCount <= 0) {
      tx.delete(ref);
      return;
    }
    tx.set(ref, {
      schoolName: schoolName || (snap.exists ? cur.schoolName : "") || "",
      totalHours: newTotalHours,
      studentCount: newStudentCount,
      updatedAt: Date.now(),
    });
  });
}

// schoolLeaderboardMonthly/{schoolId}_{period} —「學校總排行榜」嘅本月
// 版本，用「一個月一份文件」嘅方式做（文件 ID 附加咗年-月），一到新
// 一個月就自動由一份全新、totalHours=0 嘅文件開始計，唔使另外寫排程
// 去重設舊文件；舊月份嗰份文件會保留喺 Firestore（冇歷史榜功能嚟讀
// 佢，純粹閒置，唔會影響「本月」查詢），日後如果想加返「上月冠軍」
// 之類嘅歷史榜功能，呢啲舊文件已經現成可以攞嚟用。
async function adjustSchoolLeaderboardMonthly(schoolId, schoolName, period, deltaHours) {
  if (!deltaHours) return; // 冇實質變化就唔使多開一個 transaction
  const docId = `${schoolId}_${period}`;
  const ref = db.collection("schoolLeaderboardMonthly").doc(docId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists ? snap.data() : { totalHours: 0 };
    const newTotalHours = Math.max(0, (cur.totalHours || 0) + deltaHours);
    tx.set(ref, {
      schoolId,
      period,
      schoolName: schoolName || (snap.exists ? cur.schoolName : "") || "",
      totalHours: newTotalHours,
      updatedAt: Date.now(),
    });
  });
}

// ===================== 公開個人資料（v1.200.0 私隱修補） =====================
// users/{uid} 入面有真實電郵（contactEmail）、出生年月、電郵驗證 token 等
// 私人資料，之前任何登入用戶都可以逐個 uid 讀出嚟（uid 喺排行榜就見到）。
// 而家 users/{uid} 淨係本人同管理員讀得到；其他人睇資料卡、溫習日記、
// 好友搜尋、導師主頁等，改讀呢度自動同步嘅 publicProfiles/{uid}，入面
// 淨係得下面呢啲「本來就會顯示俾人睇」嘅欄位。
const PUBLIC_PROFILE_FIELDS = [
  "username", "loginId", "avatarBase64", "school", "grade",
  "favSubjects", "dislikeSubjects", "followerCount", "followingCount",
  "photoCount", "hours", "exp", "role", "accountType",
];

function buildPublicProfile(uid, u) {
  const p = { uid, updatedAt: Date.now() };
  for (const f of PUBLIC_PROFILE_FIELDS) {
    if (u[f] !== undefined) p[f] = u[f];
  }
  return p;
}

exports.syncPublicProfileOnUserWrite = onDocumentWritten("users/{uid}", async (event) => {
  const uid = event.params.uid;
  const beforeSnap = event.data && event.data.before;
  const afterSnap = event.data && event.data.after;
  const before = beforeSnap && beforeSnap.exists ? beforeSnap.data() : null;
  const after = afterSnap && afterSnap.exists ? afterSnap.data() : null;
  const ref = db.collection("publicProfiles").doc(uid);

  if (!after) {
    await ref.delete().catch(() => {});
    return;
  }
  // 公開欄位完全冇變（例如淨係改咗語言、登入時間）就唔使寫
  if (before && PUBLIC_PROFILE_FIELDS.every((k) =>
    JSON.stringify(before[k] === undefined ? null : before[k]) === JSON.stringify(after[k] === undefined ? null : after[k]))) {
    return;
  }
  await ref.set(buildPublicProfile(uid, after));
});

// 一次性補建：功能推出之前已經註冊嘅用戶未有 publicProfiles 文件，
// 由管理員喺後台撳一次「同步公開資料」就會全部補返。重複撳都冇問題。
exports.backfillPublicProfiles = onCall({ timeoutSeconds: 540, memory: "512MiB" }, async (request) => {
  await assertIsAdmin(request.auth && request.auth.uid);
  let count = 0;
  let last = null;
  for (;;) {
    let q = db.collection("users").orderBy(admin.firestore.FieldPath.documentId()).limit(100);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => {
      batch.set(db.collection("publicProfiles").doc(d.id), buildPublicProfile(d.id, d.data()));
    });
    await batch.commit();
    count += snap.size;
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 100) break;
  }
  return { ok: true, count };
});


// ===================== 中轉伺服器（TURN，v1.209.0） =====================
// 學生喺學校 Wi-Fi／部分流動網絡入面，兩部機未必可以直接連線，要經
// 「中轉伺服器」轉送畫面。用 Cloudflare Realtime TURN（每月首 1,000 GB 免費，
// 之後 US$0.05/GB）。長期密鑰只存喺伺服器（Firebase secret），前端每次入房
// 只會攞到一組有時限嘅臨時密碼。
//
// 防止開支失控（三重保險）：
//  1. 管理員可以喺後台「中轉伺服器」即時關閉（admin_config/turnSettings.enabled）
//  2. 每月估算用量（由前端回報「經中轉嘅連線分鐘數」推算）超過上限
//     （預設 900 GB，即仲喺免費額度之內）就自動停發臨時密碼，直到下個月
//  3. 每個帳戶每小時最多攞 30 次臨時密碼
const CF_TURN_KEY_ID = defineSecret("CF_TURN_KEY_ID");
const CF_TURN_API_TOKEN = defineSecret("CF_TURN_API_TOKEN");
const TURN_TTL_SECONDS = 6 * 60 * 60;          // 臨時密碼有效 6 個鐘（足夠一次長時間溫習）
const TURN_DEFAULT_MONTHLY_CAP_GB = 900;        // 預設每月上限（留 100 GB 安全距離）
const TURN_GB_PER_RELAY_MINUTE = 0.0075;        // 估算：每條經中轉嘅連線每分鐘約 7.5 MB（雙向、限速 500 kbps）

function rtcMonthKey(d = new Date()) {
  // 用香港時間計月份
  const hk = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return `${hk.getUTCFullYear()}${String(hk.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function readTurnSettings() {
  const snap = await db.doc("admin_config/turnSettings").get();
  const data = snap.exists ? snap.data() : {};
  return {
    enabled: data.enabled !== false, // 預設開啟
    monthlyCapGB: typeof data.monthlyCapGB === "number" && data.monthlyCapGB > 0 ? data.monthlyCapGB : TURN_DEFAULT_MONTHLY_CAP_GB,
  };
}

exports.getTurnCredentials = onCall({ secrets: [CF_TURN_KEY_ID, CF_TURN_API_TOKEN] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "請先登入");
  const uid = request.auth.uid;
  await checkRateLimit(`getTurnCredentials_${uid}`, 30, 60 * 60 * 1000);

  const settings = await readTurnSettings();
  if (!settings.enabled) return { iceServers: [], disabled: "admin" };

  const statsSnap = await db.doc(`admin_config/rtcStats_${rtcMonthKey()}`).get();
  const relayMinutes = statsSnap.exists ? (statsSnap.data().relayMinutes || 0) : 0;
  const estimatedGB = relayMinutes * TURN_GB_PER_RELAY_MINUTE;
  if (estimatedGB >= settings.monthlyCapGB) return { iceServers: [], disabled: "cap" };

  try {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${CF_TURN_KEY_ID.value()}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${CF_TURN_API_TOKEN.value()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: TURN_TTL_SECONDS }),
    });
    if (!res.ok) {
      console.error("Cloudflare TURN 回應錯誤:", res.status, await res.text().catch(() => ""));
      return { iceServers: [], disabled: "error" };
    }
    const json = await res.json();
    let servers = Array.isArray(json.iceServers) ? json.iceServers : (json.iceServers ? [json.iceServers] : []);
    // 瀏覽器會擋 port 53，濾走以免連線等超時
    servers = servers.map((s) => {
      const urls = (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => typeof u === "string" && !/:53(\?|$)/.test(u));
      return { ...s, urls };
    }).filter((s) => s.urls.length > 0);
    return { iceServers: servers };
  } catch (e) {
    console.error("攞 TURN 臨時密碼失敗:", e);
    return { iceServers: [], disabled: "error" };
  }
});

// 前端回報連線結果，用嚟喺後台顯示「直接連線／經中轉／失敗」比例，同估算中轉用量。
//  · result: 'direct' | 'relay' | 'failed'（每條連線成功／失敗時報一次）
//  · relayTick: 經中轉嘅連線每 5 分鐘報一次，minutes 固定為 5
exports.reportRtcResult = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "請先登入");
  const uid = request.auth.uid;
  await checkRateLimit(`reportRtcResult_${uid}`, 60, 60 * 60 * 1000);
  const data = request.data || {};
  const ref = db.doc(`admin_config/rtcStats_${rtcMonthKey()}`);
  const inc = admin.firestore.FieldValue.increment;
  if (data.type === "relayTick") {
    await ref.set({ relayMinutes: inc(5), updatedAt: Date.now() }, { merge: true });
    return { ok: true };
  }
  if (["direct", "relay", "failed"].includes(data.result)) {
    await ref.set({ [data.result]: inc(1), updatedAt: Date.now() }, { merge: true });
    return { ok: true };
  }
  throw new HttpsError("invalid-argument", "資料格式不正確");
});
