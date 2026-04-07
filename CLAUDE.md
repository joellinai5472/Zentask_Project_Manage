# ZenTask — 專案指引

## 專案簡介
小團隊用的跨裝置 Kanban 看板管理 App。已部署於 Netlify，資料存在 Firebase Firestore，所有登入用戶共用同一份資料（刻意設計，非 bug）。

**線上網址**: https://zentask-project-manage.netlify.app
**GitHub**: https://github.com/joellinai5472/Zentask_Project_Manage

---

## 技術架構

| 項目 | 技術 |
|------|------|
| 前端 | React 19 + TypeScript |
| 建置 | Vite 6 |
| 樣式 | Tailwind CSS 4 (`@tailwindcss/vite`) |
| 動畫 | Framer Motion (`motion/react`) |
| 後端 | Firebase Auth + Firestore |
| 圖示 | lucide-react |
| 部署 | Netlify（連接 GitHub main branch 自動部署） |

---

## 檔案結構

```
src/
  App.tsx           # 全部 UI 元件 + 狀態管理（~1400 行，單一大檔）
  AuthContext.tsx   # Firebase Auth 狀態、登入/登出方法
  firebase.ts       # Firebase 初始化與 export
  errors.ts         # 共用：OperationType, handleFirestoreError, useThrowAsyncError
  ErrorBoundary.tsx # 全域錯誤邊界，解析 Firestore 錯誤詳情
  main.tsx          # 入口：ErrorBoundary > AuthProvider > App
  index.css         # 全域樣式
firestore.rules     # Firestore 安全規則
netlify.toml        # Netlify 建置設定（command: npm run build, publish: dist）
firebase-applet-config.json  # Firebase 設定（已 git 追蹤）
```

---

## 主要功能
- **認證**：Email/密碼 + Google OAuth
- **多專案**：左側抽屜切換，可新增/改名/刪除
- **Kanban 看板**：拖曳任務、自訂欄位（名稱/顏色）
- **列表視圖**：可摺疊欄位
- **任務欄位**：標題、優先級（高/中/低）、截止日期、負責人、標籤、備註、Checklist
- **篩選/排序**：優先級、欄位、負責人、標籤
- **完成區**：拖曳標記完成，可恢復
- **主題**：深色/淺色，存 localStorage
- **CSV 匯出**、**個人資料編輯**

---

## 架構決策（重要）

**共享工作區**：Firestore 查詢不加 `ownerId` 過濾，所有登入用戶可存取所有專案。新增功能時不需加 owner 限制。

**任務軟刪除**：刪除任務用 `_deleted: true` 旗標，不從 Firestore 移除。`filteredTasks` 過濾掉 `_deleted`。

**樂觀更新**：先更新本地 state，再非同步寫入 Firestore。失敗時目前不 rollback。

**react-mentions 已移除**：備註改用原生 `textarea`（react-mentions 與 React 19 defaultProps 不相容會 crash）。`renderNotesWithMentions()` 保留用於顯示舊有的 mention 標記格式 `@[Name](uid)`。

---

## 開發規則

### Bug 修復
- 最小改動原則。同一套件需要 2 次以上修復時，直接移除套件。
- 不要一次改多個系統。

### 代碼風格
- 不添加不必要的 docstring、comment、type annotation。
- 不加不可能發生情境的 error handling。
- 不做需求範圍外的「順手改進」。

### 設定檔
- **未獲明確許可前不修改設定檔**（`vite.config.ts`, `netlify.toml`, `firestore.rules` 等）。

### 部署流程
```bash
git add <files> && git commit -m "..." && git push origin main
netlify deploy --trigger
```

---

## 目前狀態（2026-04-07）

**已完成：**
- ✅ 整合重複 error utilities 至 `src/errors.ts`
- ✅ 移除未使用 import、`INIT_PROJECTS` 常數
- ✅ 移除 AI/無用套件（@google/genai, express, dotenv, react-mentions）
- ✅ 修復 MentionsInput crash（改用 textarea）
- ✅ 修復查看→編輯時 `isNewTask` 未重置導致重複任務的 bug
- ✅ 新任務初始化補上 `tags: []`

**待處理：**
- ⬜ 樂觀更新失敗時的 rollback 機制
- ⬜ Firestore 規則允許任意登入用戶刪除任意專案（目前為共享工作區設計）
