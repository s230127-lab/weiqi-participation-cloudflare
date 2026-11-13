/** Validate a Firebase ID token through Google's Identity Toolkit endpoint. */
export async function requireFirebaseUser(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return { error: json({ error: "請先使用 Google 帳戶登入。" }, 401) };

  if (!env.FIREBASE_API_KEY || !env.FIREBASE_PROJECT_ID) {
    return { error: json({ error: "網站尚未完成 Firebase 設定。" }, 500) };
  }

  let response;
  try {
    response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: match[1] })
      }
    );
  } catch (error) {
    console.error("Firebase token lookup failed:", error);
    return { error: json({ error: "暫時無法驗證登入狀態，請稍後再試。" }, 503) };
  }

  if (!response.ok) {
    // Google may reject the request because of an invalid/restricted API key,
    // a disabled Identity Toolkit API, or an invalid ID token. Keep these
    // cases distinct instead of reporting every failure as an expired login.
    const errorData = await response.json().catch(() => ({}));
    const googleMessage = String(errorData?.error?.message || "UNKNOWN");
    const errorCode = googleMessage.split(/[\s:]/, 1)[0].toUpperCase();
    console.error("Firebase token lookup rejected:", response.status, googleMessage);

    let message;
    let status = 502;

    if (errorCode === "API_KEY_INVALID") {
      message = "Firebase API Key 無效（API_KEY_INVALID）。請核對 Cloudflare 的 FIREBASE_API_KEY。";
    } else if (errorCode === "API_KEY_SERVICE_BLOCKED") {
      message = "Firebase API Key 未獲准呼叫 Identity Toolkit API（API_KEY_SERVICE_BLOCKED）。請檢查 Google Cloud API 限制及 Identity Toolkit API。";
    } else if (
      errorCode === "API_KEY_HTTP_REFERRER_BLOCKED" ||
      /referer.*blocked|blocked.*referer/i.test(googleMessage)
    ) {
      message = "API Key 的網站來源限制阻擋了 Cloudflare Functions（HTTP referrer blocked）。請勿用只允許瀏覽器網域的 Key 驗證伺服器請求。";
    } else if (errorCode === "API_KEY_IP_ADDRESS_BLOCKED") {
      message = "API Key 的 IP 限制阻擋了 Cloudflare Functions（API_KEY_IP_ADDRESS_BLOCKED）。";
    } else if (
      errorCode === "INVALID_ID_TOKEN" ||
      errorCode === "TOKEN_EXPIRED" ||
      errorCode === "USER_NOT_FOUND" ||
      errorCode === "EMAIL_NOT_FOUND"
    ) {
      message = "登入憑證無效或已過期，請登出後重新使用 Google 登入。";
      status = 401;
    } else if (errorCode === "USER_DISABLED") {
      message = "此 Firebase 帳戶已停用（USER_DISABLED），請聯絡網站管理員。";
      status = 403;
    } else {
      message = `Firebase 登入驗證失敗（HTTP ${response.status}，${errorCode}）。請把這段錯誤訊息提供給網站管理員。`;
    }

    return { error: json({ error: message, code: errorCode }, status) };
  }

  const data = await response.json().catch(() => ({}));
  const user = Array.isArray(data.users) ? data.users[0] : null;
  if (!user || !user.localId || user.emailVerified !== true) {
    return { error: json({ error: "請使用已驗證電郵地址的 Google 帳戶登入。" }, 403) };
  }
  return { user: { uid: user.localId, email: user.email || "", displayName: user.displayName || "" } };
}

/** Read this user's public game-stat document. Firestore rules for leaderboard allow read. */
export async function getCompletedGames(uid, env) {
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents/leaderboard/${encodeURIComponent(uid)}?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`;
  const response = await fetch(url);
  if (response.status === 404) return 0;
  if (!response.ok) {
    console.error("Firestore read failed:", response.status, await response.text());
    throw new Error("無法讀取圍棋紀錄。請檢查 Firebase Firestore API 及 API key 限制設定。");
  }
  const doc = await response.json();
  const raw = doc.fields && doc.fields.games && doc.fields.games.integerValue;
  const games = Number(raw || 0);
  return Number.isFinite(games) && games > 0 ? games : 0;
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export async function readJson(request, maxBytes = 20000) {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > maxBytes) throw new Error("提交資料過大。");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error("提交資料過大。");
  try { return JSON.parse(text); } catch { throw new Error("提交資料格式不正確。"); }
}

export function cleanText(value, label, limit) {
  if (typeof value !== "string") throw new Error(`${label}格式不正確。`);
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > limit) throw new Error(`${label}不可留空，並且不可超過 ${limit} 個字元。`);
  return cleaned;
}
