# Frontend

Task 9 实现 UI Sentinel Agent 的 Vite React Run Workspace。

## 运行

在仓库根目录执行：

```powershell
npm run dev --workspace @ui-sentinel/frontend
```

默认访问地址：

```text
http://127.0.0.1:5173/
```

前端读取：

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:3100
```

如果未设置该变量，默认使用 `http://127.0.0.1:3100`。

## 页面

- Dashboard：列出项目、创建项目、进入 Run Workspace。
- Run Workspace：创建 run、恢复历史事件、连接 SSE、展示浏览器证据、RAG 匹配和诊断报告。

## API

前端调用：

- `GET /api/projects`
- `POST /api/projects`
- `POST /api/runs`
- `GET /api/runs/:id`
- `GET /api/runs/:id/events`
- `GET /api/runs/:id/stream`

Task 9 不新增 browser/indexer/retrieval/diagnosis 的编排 API。当前选中 run 没有这些输出时，界面会显示 development-only fallback 卡片。

## 验证

```powershell
npm run typecheck --workspace @ui-sentinel/frontend
npm run build --workspace @ui-sentinel/frontend
```
