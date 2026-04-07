---
name: ZenTask Project Overview
description: ZenTask 技術架構、功能、檔案結構、架構決策的完整摘要
type: project
---

# ZenTask 專案概覽

Kanban 看板管理 App，React 19 + Firebase，部署在 Netlify。

## 技術架構
- React 19 + TypeScript + Vite 6
- Tailwind CSS 4、Framer Motion（motion/react）、lucide-react
- Firebase Auth（Email + Google OAuth）+ Firestore
- 部署：Netlify 自動部署（連接 GitHub main）

## 重要檔案
- `src/App.tsx` — 全部 UI + 狀態（~1600 行單一大檔）
- `src/AuthContext.tsx` — Auth 狀態與方法
- `src/errors.ts` — 共用錯誤工具（OperationType、handleFirestoreError、useThrowAsyncError）
- `src/firebase.ts` — Firebase 初始化
- `index.html` — 頁面標題（ZenTask — 專案任務管理）

## 主要功能
- **認證**：Email/密碼 + Google OAuth
- **多專案**：左側抽屜切換，可新增/改名/刪除
- **三種視圖**：看板（Kanban 拖曳）、列表（可摺疊）、月曆（按截止日期呈現）
- **任務欄位**：標題、優先級（高/中/低）、截止日期、負責人、標籤、備註、Checklist
- **篩選/排序**：優先級、欄位、負責人、標籤
- **個人資料**：顯示名稱、職稱、自我介紹、頭像（emoji 預設 / 上傳 base64 / URL）
- **主題**：深色/淺色、CSV 匯出

## 模組層級常數與工具函式（App.tsx 頂部）
- `PRIORITIES` — 優先級顏色定義
- `DONE_COL_ID = "__done__"` — 完成欄位 ID
- `PRESET_AVATARS` — 16 個 emoji 預設頭像
- `isEmojiAvatar(str)` — 判斷是否為 emoji 頭像
- `buildCalendarDays(year, month)` — 建立月曆格陣列
- `renderNotesWithMentions(notes)` — 解析舊 @mention 格式顯示

## 關鍵架構決策
1. **共享工作區**：所有登入用戶可讀寫所有專案，Firestore 查詢無 ownerId 過濾
2. **軟刪除**：任務刪除用 `_deleted: true` 旗標
3. **樂觀更新**：先更新 state 再寫 Firestore（無 rollback）
4. **react-mentions 已移除**：與 React 19 不相容；備註改用 textarea；`renderNotesWithMentions()` 保留顯示舊格式
5. **頭像儲存**：emoji 字元直接存 Firestore；圖片用 FileReader 轉 base64（限 200KB）
6. **欄位寬度**：儲存在 `localStorage`（key: `zentask_col_widths`），重整後恢復

## 已完成功能（截至 2026-04-08）
- error utilities 整合至 `errors.ts`
- 移除 AI/無用套件
- 修復 MentionsInput React 19 crash
- 修復 isNewTask 未重置 bug
- 新增月曆視圖（純 JS，無外部套件）、週末視覺區分（日=玫瑰紅、六=天空藍）
- 月曆每格 hover 顯示 + 按鈕可直接新增任務，導覽列也有新增按鈕
- 增強個人資料編輯（bio、role、emoji/上傳頭像）
- 看板精簡模式：標題在上，優先級+截止日期同行在下
- 新增階段欄位按鈕縮小為窄條（w-10），不佔版面
- 欄位可拖曳調整寬度（200–600px），寬度存 localStorage
- 列表視圖行列：優先級+截止日期同行，移除備註，標題 truncate
- 任務預覽 modal 的 Checklist 可直接點選打勾（即時同步 Firestore）
- 頁籤標題改為「ZenTask — 專案任務管理」
- Memory 檔案移至專案內 `.claude/memory/`

## 待處理
- 樂觀更新失敗 rollback
- Firestore 規則：任意用戶可刪任意專案

**Why:** 設計用於小團隊共用。
**How to apply:** 新增功能時不需加 ownerId 過濾；修 bug 優先最小改動，套件反覆出問題直接移除。
