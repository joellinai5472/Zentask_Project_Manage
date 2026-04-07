---
name: ZenTask Code Status
description: 已解決的問題紀錄與目前仍待處理的事項
type: project
---

# 代碼狀態（2026-04-08）

## 已解決

| 問題 | 解法 |
|------|------|
| App.tsx / AuthContext.tsx 重複定義 error utilities | 整合至 `src/errors.ts` |
| 多餘套件（@google/genai、express、dotenv、react-mentions） | 從 package.json 移除 |
| MentionsInput crash（React 19 defaultProps 廢棄） | 改用原生 textarea |
| 查看→編輯時 isNewTask 未重置導致重複任務 | 補上 setIsNewTask(false) |
| 新任務缺少 tags: [] 欄位 | onAddTask 補上 tags: [] |
| 頁籤標題顯示「My Google AI Studio App」 | index.html 改為「ZenTask — 專案任務管理」 |
| 預覽 modal 的 Checklist 無法互動 | 改為 button，點選即時 toggle + 同步 Firestore |
| 看板精簡模式資訊過多 | 標題置頂，只顯示優先級+截止日期同行 |
| 「新增階段欄位」按鈕占滿整欄 | 縮為 w-10 窄條，vertical 文字 |
| 欄位寬度重整後重置 | 改用 localStorage 持久化（key: zentask_col_widths） |
| 列表視圖資訊過多、標題換行 | 移除備註行、優先+日期同行、標題 truncate |
| 卡片標題輕易換行 | 加 truncate class |

## 待處理

- **樂觀更新失敗無 rollback**：`updateProject` 在 `setDoc` 失敗時不會恢復 state。
- **Firestore 安全規則寬鬆**：任意登入用戶可刪除/更新任意專案。

## 注意事項

- `renderNotesWithMentions()` 保留於 App.tsx，用於顯示舊 Firestore 資料中的 `@[Name](uid)` 格式。
- 欄位寬度存在 localStorage，不同裝置/瀏覽器各自獨立。
- `colWidths` state 以 `colId` 為 key，預設寬度 320px，範圍 200–600px。
