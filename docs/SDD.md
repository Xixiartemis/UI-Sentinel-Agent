# UI Sentinel Agent - Software Design Document (SDD)

**Document Status:**  Approved for MVP**Version:**  1.0

## 1. Introduction (引言)

### 1.1 项目定位

UI Sentinel Agent 是一个面向现代前端工程的**智能质量分析与故障诊断系统**。 其核心目标是通过 AI Agent 自动执行前端页面交互，收集多维度的运行时证据（Runtime Evidence），并结合 Codebase RAG 检索本地源码上下文，最终生成包含完整证据链的 UI 问题诊断报告。

### 1.2 与开源生态的关系声明

本项目底层执行器以开源项目 `browser-use` 为基座进行二次开发。**重要声明：**  本项目**不保留** `browser-use/web-ui` 原有的 Gradio 前端。我们将复用其 Python 侧的浏览器自动化控制能力，并使用 React + NestJS 完全重构控制平面（Control Plane）与用户界面，以支撑复杂的长任务编排、SSE 实时事件流、RAG 结果可视化以及结构化诊断报告展示。

## 2. System Architecture (系统架构)

本系统采用**控制面 (Control Plane) 与执行面 (Execution Plane) 读写分离**的微服务架构设计。

### 2.1 高层架构图

```
graph TD
    subgraph Frontend [Frontend: React / Vite]
        UI1[Run Workspace]
        UI2[Agent Timeline & SSE]
        UI3[Browser Evidence Panel]
        UI4[Diagnosis Report]
    end

    subgraph ControlPlane [Control Plane: NestJS]
        CP1[Task Orchestrator]
        CP2[Event Consumer & SSE]
        CP3[Prisma ORM]
    end

    subgraph Persistence [Data & Storage]
        DB[(PostgreSQL + pgvector\nTruth Source & RAG)]
        MQ[(Redis Streams\nTask Queue & Realtime)]
        S3[(Local FS / S3\nArtifacts)]
    end

    subgraph ExecutionPlane [Execution Plane: Python]
        EP1[Browser Agent / Playwright]
        EP2[Code Indexer / tree-sitter]
        EP3[Diagnosis & Verifier]
    end

    %% Connections
    Frontend -- REST / SSE --> ControlPlane
    ControlPlane -- BullMQ --> MQ
    ControlPlane -- Read / Write --> DB
    
    MQ -- Consume Tasks --> ExecutionPlane
    ExecutionPlane -- POST /internal/events --> ControlPlane
    ExecutionPlane -- Save Artifacts --> S3
    
    ExecutionPlane -- Query/Write Vectors --> DB
```

### 2.2 核心设计原则

1. **控制面不承担重计算：**  NestJS 仅负责任务流转、状态管理、数据库读写和前端 SSE 推送。AST 解析、浏览器执行、大模型推理一律交由 Python Worker 处理。
2. **事件驱动与事实溯源 (Truth Source)：**  `PostgreSQL` 是事件历史的唯一真相源（Source of Truth）。Python Worker 通过内部 REST API 将事件发给 NestJS，NestJS 负责持久化落库并同步推送 SSE，确保刷新不断流。
3. **大文件存储解耦：**  截图、DOM Snapshot 等大体积 Artifact 严禁落库数据库，一律存入对象存储/文件系统，事件及数据库中仅保留 `storage_key` 或 `url`。
4. **诊断证据链 (Evidence-based Diagnosis)：**  LLM 生成的诊断报告必须严格基于收集到的 Runtime Evidence 和 Code Evidence，Verifier Agent 将对无证据支撑的“幻觉”进行驳回标记。

## 3. Extensibility Validation (架构扩展性验证)

*注：以下扩展性目标不属于 MVP 实现范围，仅用于验证架构的长期演进能力。*

* **支持多步骤跨页面流：**  NestJS 状态机可将跨页面流拆解为 Sub-runs，利用 PostgreSQL 的 `run_events` 历史实现断点恢复。
* **支持更多追踪维度 (Traces)：**  执行平面的 Evidence Collector 是插件化的，未来可轻松扩展注入 Chrome CDP Performance Trace 检测性能和内存泄漏。
* **演进至自动修复 (Auto-Fix)：**  凭借 Code Chunk 强保留的 `start_line` / `end_line` 元数据，配合 Verifier 的隔离验证机制，未来可安全地引入 Patch Agent 直接生成修复代码并提交 PR。