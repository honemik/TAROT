# ARCANA · Astro 塔羅牌桌

以 Astro 靜態輸出與 TypeScript 實作，沒有 React、後端或執行階段的牌面 API。包含完整 78 張牌、四種預設牌陣、自由擺牌與兩套本機牌面。

## 開始使用

```powershell
npm install
npm run dev
```

預設開發網址為 http://localhost:4321。也可在同一區域網路的手機開啟終端機顯示的 Network 網址。正式環境建議 HTTPS。

Astro 7 需要 Node 22.23.4 以上；本專案附開發用的 `node` 套件，`npm run` 會優先使用專案內的版本，不更動系統 Node。首次安裝可由既有 Node 22.13 及 npm 完成，安裝前半段可能顯示 engine 提醒。若主機已安裝相容的 Node，可自行移除這個開發相依套件。

```powershell
npm run check     # Astro／TypeScript 檢查
npm test          # 洗牌、抽牌、資料與座標測試
npm run build    # 產生 dist/
npm run preview  # 檢查正式靜態輸出
```

將 `dist/` 部署到任意靜態主機即可。牌面已附在 `public/decks/`；開發安裝不需要重新下載。若部署到子路徑，請先在 `astro.config.mjs` 設定 `base` 再建置。

## 操作

- 點牌堆抽牌，在固定牌陣中依序放牌；也可先選空牌位。點牌背直接揭牌。
- 頂部共用面板選牌陣或牌面；自由模式也從這裡切換。
- 選牌後只顯示「查看」與「更多」；蓋牌、移動、旋轉、堆疊與選取下一張收在更多選單。
- 「選取下一張」可以選到被蓋住的牌。
- 自由模式點牌堆後再點目的地；支援直接從牌堆拖出與拖曳已放牌。
- 空白處拖曳平移；雙指或滑鼠滾輪縮放；右上選單提供 ＋／－，右下圖示回到全陣。
- 鍵盤 Tab 導覽、Enter 啟動、Esc 取消、Ctrl／Cmd＋Z 復原。自由模式選牌後可用方向鍵微調。
- 鍵盤放置：點抽牌後聚焦牌桌，按 Enter 放在觀看中心，再以方向鍵調整位置。
- 洗牌只重排剩餘牌；右上選單的「收牌重開」才收回全部牌。復原抽牌後再次抽出會得到同一張。
- 更換牌面保留牌身分、方向、位置與牌序。馬賽 VIII 正義／XI 力量以牌義對應。

## 保存與限制

牌局存在本機 IndexedDB，偏好與分頁協調存在 localStorage。不跨裝置同步；清除網站資料會移除存檔。資料讀取失敗可重試或開啟不覆寫原存檔的暫存牌桌。復原歷史保留最近 40 個動作，僅在目前分頁中有效。

多分頁透過短租約避免同時編輯；其他分頁可查看或按「在這裡接續」。它是瀏覽器內的協調機制，不是伺服器交易鎖。

Google Fonts 只用於中文字型，無法連線時使用系統字型；應用核心與牌面可獨立運作。首次開啟仍需要載入網站，尚未加入離線快取。自訂牌面匯入、自訂牌陣保存、圖片匯出及 AI 解牌未納入 v0.1。

## 素材

- 偉特：Pamela Colman Smith／Arthur Edward Waite，1909；Steve P. 掃描修復。
- 馬賽：Wikimedia Commons 公有領域牌面。
- 整理來源：[mixvlad/TarotCards](https://github.com/mixvlad/TarotCards)；來源清單與逐牌 metadata 保存在 `public/decks/`。
- 圖片只轉為 720px 高度 WebP，未裁切或改變比例。兩款牌背為此專案的原創 SVG 幾何設計。
- 圖示：[Lucide](https://lucide.dev/)，ISC 授權。

開發時可執行 `npm run assets:fetch` 重建牌面；下載腳本處理馬賽的力量／正義編號差異。

完整需求、Astro 模組規劃與驗收方式見 [plan.md](plan.md)。
# TAROT
