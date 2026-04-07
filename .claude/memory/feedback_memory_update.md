---
name: 每次任務後更新 memory
description: 每次任務結束後，自動更新相關的 memory 文件
type: feedback
---

每次任務結束後，必須更新相關的 memory 文件（project_overview.md、known_issues.md 等）。

**Why:** 使用者明確要求此行為，確保跨對話的上下文保持最新。

**How to apply:** 任務完成時，判斷哪些 memory 文件需要更新（例如新功能完成、bug 修復、架構變更），並寫入最新狀態。不需要更新與本次任務無關的文件。Memory 檔案位於專案內 `.claude/memory/`，系統路徑的 MEMORY.md 索引指向這些檔案。
