# Weiqi Participation · Cloudflare 免費方案

獨立的圍棋參與確認及內置問卷網站，採用：

- **Cloudflare Pages**：託管前端頁面。
- **Cloudflare Pages Functions（Workers runtime）**：處理登入核實、提交及查詢。
- **Cloudflare D1**：儲存私人問卷回應。
- **現有 Firebase Authentication**：沿用 `weiqi-online` 的 Google 登入，確保 Firebase UID 與圍棋遊戲紀錄一致。
- **現有 Firestore**：只讀取 `leaderboard/{uid}.games`，不需要 Firebase Cloud Functions。

此版本不依賴 Google Forms、Google Sheets、Firebase Cloud Functions 或 Firebase Blaze。

## 架構

1. 玩家使用 `weiqi-online` 的 Google 登入。
2. 前端取得 Firebase ID token，透過 HTTPS 傳送至 Pages Function。
3. Function 使用 Identity Toolkit `accounts:lookup` 核實 ID token 及已驗證電郵，取得 UID。
4. Function 讀取同一 Firebase 專案的 `leaderboard/{uid}`，核對 `games`。
5. 問卷答案寫入 Cloudflare D1，使用 Firebase UID 作為唯一鍵，每個帳戶只可提交一次。
6. 管理員以 Cloudflare Secret `ADMIN_KEY` 登入 `/admin.html` 檢視及匯出 CSV。

Firestore 目前的 `firestore.rules` 對 `leaderboard/{uid}` 設有公開讀取規則（`allow read: if true`）。這個網站只讀取目前登入玩家自己的文件。若你日後收緊 Firestore 規則，需同步調整此架構。

## 免費額度（可能隨 Cloudflare 政策更新）

根據 Cloudflare 文件目前列出的 Workers Free / D1 Free 額度：

- Workers 請求：每日 100,000 次。
- D1：每日 5,000,000 行讀取、100,000 行寫入。
- D1 單一資料庫：500 MB；帳戶總儲存額度 5 GB。
- Pages Free：每月最多 500 次建置。

若超出 D1 免費每日讀寫額度，該日的 D1 查詢會暫停直至 UTC 午夜重設；超出儲存額度則須清理資料或調整方案。Cloudflare 不需要你在這個方案連接信用卡以啟用付費計費，但請在 Cloudflare Dashboard 核對帳戶實際方案及最新限額。

官方資料：
- Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Pages limits: https://developers.cloudflare.com/pages/platform/limits/
- D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- Pages Functions bindings: https://developers.cloudflare.com/pages/functions/bindings/

## 1. 建立 Cloudflare D1 資料庫

安裝 Node.js，然後在此 repository 根目錄開啟終端機：

```bash
npm install -g wrangler
npx wrangler login
npx wrangler d1 create weiqi-participation
```

Cloudflare 會回傳資料庫 ID。把 `wrangler.toml` 內的：

```toml
database_id = "REPLACE_WITH_D1_DATABASE_ID"
```

改成 Cloudflare 回傳的真實 ID。

套用資料庫結構：

```bash
npx wrangler d1 migrations apply weiqi-participation --remote
```

## 2. 設定管理員密鑰

產生一組長而隨機的管理員密鑰（不要使用 Google 密碼）。把它設為 Cloudflare Secret：

```bash
npx wrangler pages secret put ADMIN_KEY --project-name weiqi-participation
```

按提示輸入密鑰。**不要將密鑰放入 GitHub、HTML、`wrangler.toml` 或聊天訊息。** 管理頁網址為 `/admin.html`。

## 3. 建立 Cloudflare Pages 網站

1. 登入 Cloudflare Dashboard。
2. 開啟 **Workers & Pages**，選擇 **Create application → Pages → Connect to Git**。
3. 連接 GitHub，選擇此 repository。
4. Framework preset 選 **None**。
5. Build command 留空；Build output directory 設為 `public`。
6. 完成首次部署。
7. `functions/` 目錄會隨 Pages 專案部署，`wrangler.toml` 會設定 D1 binding。
8. 在 Cloudflare Pages 專案設定中確認 D1 binding 名稱為 `DB`，並連接 `weiqi-participation` 資料庫。如使用 Dashboard 手動新增 binding，完成後要重新部署。

也可以用 CLI 發佈：

```bash
npx wrangler pages deploy public --project-name weiqi-participation
```

請勿同時用不同設定覆寫 Wrangler config 與 Dashboard binding；以 `wrangler.toml` 為主要設定來源。

## 4. Firebase 設定

本網站沿用現有 Firebase 專案 `weiqi-online`，而不是新建 Firebase Auth 專案，否則玩家 UID 會不同，不能直接配對現有遊戲紀錄。

1. 在 Firebase Authentication → Settings → Authorized domains 加入 Cloudflare Pages 網域，例如 `你的專案.pages.dev`。
2. 在 Google Cloud Console 的 API key 限制設定中，確保此 Web API key 可使用：
   - `identitytoolkit.googleapis.com`
   - `firestore.googleapis.com`
3. 確認 `weiqi-online` 的 Firestore 已啟用，而且 `leaderboard/{uid}` 文件仍有 `games` 欄位。
4. 如果 API key 有 HTTP referrer 限制，也要加入 Cloudflare Pages 網域。

程式中的 Firebase Web API key 是前端公開設定，不是服務帳戶密碼。它不能取代登入驗證；後端仍會驗證 ID token。

## 5. 問卷題目

此版本已加入「圍棋展覽知識問答－匯文軒活動（19/11–20/11）」的五條單選題，並保留必填的班級及班號欄位。每題只能選擇一個指定選項；後端會再驗證答案是否屬於該題的選項，不能只靠瀏覽器驗證。

題目包括堯帝與丹朱的傳說、AlphaGo 對李世石的比賽、標準佈局、棋子的「氣」，以及終局貼目的用途。若日後更改任何題目或選項，必須同步更新 `public/index.html` 的 `QUESTIONS` 陣列及 `functions/api/questionnaire.js` 的 `QUESTIONS` 白名單，避免前後端選項不一致。

## 6. 測試

1. 在 `weiqi_online` 使用 Google 帳戶登入並完成一盤棋。
2. 打開 Cloudflare Pages 網站並使用相同 Google 帳戶登入。
3. 填寫班級、班號及五題答案，提交。
4. 確認對局數及問卷狀態均正確。
5. 登出並以另一個測試帳戶登入，確認它不能看到第一個帳戶的問卷答案，也不能重複提交第一個帳戶的紀錄。
6. 管理員開啟 `/admin.html`，輸入 `ADMIN_KEY`，檢查及匯出測試 CSV。

## 私隱及限制

- 每份提交以 Firebase UID 為唯一鍵；每個帳戶只可提交一次。
- 玩家頁只收到自己的對局數及問卷已提交狀態；不會回傳問卷答案。
- 只有持有 `ADMIN_KEY` 的管理員可透過管理 API 檢視答案。密鑰由 Cloudflare Secret 保存，並不儲存在 repository。
- 管理員匯出的 CSV 會包括電郵、班級、班號及答案，必須妥善保管，完成管理用途後按需要刪除。
- 問卷答案未加密儲存在 D1；Cloudflare 平台管理員及獲授權的 Cloudflare 帳戶操作者可能有資料庫存取能力。不要收集與活動無關的敏感資料。
- 五條題目均為單選題，伺服器端會驗證答案是否為該題其中一個有效選項。
- 此版本不會自動將舊 Google Form 回應搬入 D1。若要承認舊表單紀錄，需要另行設計經管理員核實的匯入流程。
- 此 repository 不包含學生資料、問卷答案、管理員密鑰或 Cloudflare API token。
