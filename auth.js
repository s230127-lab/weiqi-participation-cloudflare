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
    return { error: json({ error: "登入已失效，請重新登入。" }, 401) };
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
