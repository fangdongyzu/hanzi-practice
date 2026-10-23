# 華語練習所 Chinese Practice Hub

六個華語學習網站的響應式入口，支援繁體中文、英文、越南文與泰文。

- 正式網址：https://fangdongyzu.github.io/hanzi-practice/portal/
- GitHub 位置：`fangdongyzu/hanzi-practice` 的 `portal/` 目錄
- 純靜態 HTML、CSS、JavaScript，無需安裝或建置。
- 以手機單欄、平板雙欄、電腦三欄顯示。
- 六張內嵌 SVG 為原創功能示意圖，非網站實際截圖。
- 語言切換涵蓋標題、說明、按鈕及輔助文字，選擇儲存在瀏覽器。
- `?lang=zh-Hant`、`?lang=en`、`?lang=vi`、`?lang=th` 可指定分享語言。
- 原網站的功能與語言由各網站提供；入口以新分頁開啟。

## 更新

編輯 `app.js` 的 `translations` 修改四語文字；編輯 `index.html` 修改連結與內嵌示意圖；編輯 `styles.css` 修改版型。推送 `main` 後由既有 GitHub Pages 發佈。

## 本機預覽

在本目錄執行 `python3 -m http.server 8080`，開啟 http://localhost:8080 。
