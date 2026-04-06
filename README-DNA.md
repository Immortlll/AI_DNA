# 🧬 AI DNA 制造商 — 使用文档

> **将人的能力、人格、经验、决策方式，克隆成可持续工作的 AI 数字生命体。**

---

## 目录

- [项目简介](#项目简介)
- [核心概念](#核心概念)
- [快速启动](#快速启动)
- [功能指南](#功能指南)
  - [行业自画像建司](#1-行业自画像建司)
  - [DNA 制造商面板](#2-dna-制造商面板)
  - [DNA 蒸馏](#3-dna-蒸馏)
  - [数字生命体管理](#4-数字生命体管理)
  - [五维 DNA 详情](#5-五维-dna-详情)
- [DNA 类型系统](#dna-类型系统)
- [技术架构](#技术架构)
- [文件结构](#文件结构)
- [常见问题](#常见问题)

---

## 项目简介

AI DNA 制造商是基于 [Claw-Empire](https://github.com/clawempire/claw-empire) 构建的 **AI 数字生命体制造平台**。它不是生物克隆，而是将真实人类的认知能力数字化——提取人的**工作方式、性格特征、决策逻辑、协作风格**，注入 AI Agent，使其像真人一样持续工作。

### 核心价值

| 痛点 | 解决方案 |
|------|----------|
| 核心员工离职导致业务中断 | 将其能力克隆为数字生命体，永续运转 |
| 新人培养周期长 | 通过 DNA 蒸馏，快速复制老员工能力 |
| AI Agent 缺乏个性化 | 五维 DNA 赋予每个 Agent 独特的人格和决策方式 |
| 技能管理碎片化 | 统一的 DNA Profile 整合所有能力维度 |

### 双层架构

```
┌─────────────────────────────────┐
│       AI DNA Engine（本项目）     │  ← 数字生命体制造与管理
│  PersonaDNA / WorkDNA / DecisionDNA │
├─────────────────────────────────┤
│       Claw-Empire（执行 OS）      │  ← 任务编排、Agent 调度、技能学习
│  Agents / Tasks / Skills / Workflows │
└─────────────────────────────────┘
```

---

## 核心概念

### 五维 DNA 模型

每个数字生命体由五个 DNA 维度组成：

| DNA 维度 | 图标 | 描述 | 示例字段 |
|----------|------|------|----------|
| **Persona DNA** | 🎭 | 人格层 — 性格特征、沟通风格、压力反应 | `traits`, `communication_style`, `stress_response` |
| **Work DNA** | ⚙️ | 工作能力层 — 核心技能、任务拆解、交付模式 | `core_skills`, `task_decomposition_style`, `tools` |
| **Decision DNA** | 🎯 | 决策层 — 风险偏好、优先级策略、取舍逻辑 | `risk_preference`, `priority_style`, `tradeoff_logic` |
| **Memory DNA** | 💾 | 记忆层 — 已学技能数、完成任务数、关键经验 | `learned_skill_count`, `task_completed_count` |
| **Relationship DNA** | 🤝 | 协作层 — 领导风格、反馈方式、冲突处理 | `leadership_style`, `delegation_preference` |

### 进化状态

数字生命体有四个进化阶段：

| 状态 | 图标 | 条件 | 说明 |
|------|------|------|------|
| **胚胎** | 🧬 | 无技能 + 无任务完成 | 刚创建，尚未注入任何能力 |
| **学习中** | 📡 | 有技能学习 + 无任务完成 | 正在吸收能力，还未实战 |
| **活跃** | ⚡ | 有任务完成 + 技能 < 3 | 已开始工作，能力还在积累 |
| **成熟** | 🧠 | 有任务完成 + 技能 ≥ 3 | 多技能多经验，可独立承担复杂工作 |

### DNA 蒸馏

DNA 蒸馏是将外部能力源（如 GitHub 上的 colleague-skill 仓库）中的技能提取并注入团队 Agent 的过程。

```
外部能力源              蒸馏引擎              数字生命体
┌──────────────┐      ┌──────────┐      ┌──────────────┐
│colleague-skill│ ──→ │ 技能提取  │ ──→ │  Agent DNA   │
│ ScienceClaw  │      │ 分发注入  │      │  Profile 更新 │
└──────────────┘      └──────────┘      └──────────────┘
```

---

## 快速启动

### 前置条件

- **Node.js** ≥ 22
- **pnpm** 包管理器
- 至少一个 CLI Provider 已认证（如 Claude、Codex、Gemini 等）

### 安装与运行

```bash
# 1. 克隆项目
git clone <your-repo-url>
cd claw-empire

# 2. 安装依赖
pnpm install

# 3. 启动开发服务器
pnpm run dev:local
```

启动后：
- **前端**: http://127.0.0.1:8800
- **API**: http://127.0.0.1:8790

### 验证安装

1. 打开浏览器访问 `http://127.0.0.1:8800`
2. 左侧导航栏应显示 **🧬 DNA 制造商** 入口
3. 点击进入 DNA 制造商页面

---

## 功能指南

### 1. 行业自画像建司

**入口**: 侧边栏 → 🏭 行业画像

这是创建数字生命体团队的第一步。

**操作步骤**:
1. 点击 **「开始自画像」** 按钮
2. 在弹框中填写：
   - **行业** — 如：医疗、电商、教育、金融
   - **公司阶段** — 初创 / 增长 / 成熟
   - **团队人数** — 6 ~ 80 人
   - **优先能力** — 勾选交付、销售、合规、AI自动化、客户成功
3. 点击 **「一键生成公司」**
4. 系统自动生成对应岗位和员工，关键岗位自动双备份

**技能蒸馏**:
- 点击 **「导入同事 Skills」** 可从外部仓库蒸馏技能
- 系统会自动检测团队中所有可学习的 Provider（如 claude、codex、gemini）
- 如果团队中没有可学习的 Agent，会提示先创建员工

### 2. 智能建司（Smart Company Builder）

**入口**: 侧边栏 → 🏭 行业画像 → 页面下方「🤖 智能建司」区域

这是 **B+C 方案**——自然语言输入 + AI 深度分析的核心功能。

**使用场景举例**:

> 我是二次元行业的老板，想要针对女性游戏乙游做一套3D建模的企业。
> 需要观测爬取截图的人员，还需要想法创意人员，需要化妆人员，
> 需要会3D建模的人员，需要小红书运营人员...

**操作步骤**:

1. 在大文本框中用自然语言描述你的业务需求（中文/英文均可）
2. 点击 **「🔍 智能分析」**
3. 系统自动输出：
   - **行业识别** — 自动判断你属于哪个行业
   - **岗位蓝图** — 匹配所有需要的岗位，每个岗位带技能标签和设置理由
   - **缺口分析** — 告诉你团队缺什么（如：缺管理层、缺QA、缺运营）
   - **风险评估** — 提示潜在风险（如：团队太小、关键岗位不足）
4. 勾选/取消你需要的岗位
5. 点击 **「🚀 一键创建团队」** — 自动创建所有 Agent，关键岗位自动双备份

**双通道分析引擎**:

| 通道 | 条件 | 能力 |
|------|------|------|
| **Dify AI** | 配置了 Dify API | AI 深度分析，理解复杂需求，输出精准蓝图 |
| **本地引擎** | 未配置 Dify（兜底） | 关键词匹配 20+ 岗位模板，覆盖常见行业 |

**接入 Dify 工作流**:

1. 点击页面右上角的 **「⚪ Dify」** 按钮
2. 填入 Dify API Base URL（如 `https://api.dify.ai`）
3. 填入 API Key（如 `app-xxxxx`）
4. 保存后按钮变为 **「🟢 Dify」**，分析将由 Dify AI 驱动

> 💡 **Tip**: 你可以在 Dify 中创建自定义工作流，专门针对你的行业进行深度分析。
> 系统会将用户描述发送给 Dify，Dify 返回结构化的岗位蓝图 JSON。

**本地引擎已覆盖的岗位模板**（部分）:

| 关键词 | 匹配岗位 | Provider |
|--------|----------|----------|
| 3D建模 | 3D建模师 | codex |
| 化妆/妆容 | 数字化妆师 | claude |
| 创意/策划 | 创意总监 | claude |
| 爬取/截图/观测 | 趋势观测爬取员 | codex |
| 小红书/社媒 | 小红书运营 | kimi |
| 原画/角色设计 | 原画师 | claude |
| 动画/动效 | 动画师 | codex |
| 剧情/文案 | 剧情策划 | claude |
| 运营/社区 | 社区运营 | kimi |
| 数据分析 | 数据分析师 | gemini |
| 项目管理/制作人 | 项目经理 | claude |
| 开发/程序 | 游戏开发工程师 | codex |

### 3. DNA 制造商面板

**入口**: 侧边栏 → 🧬 DNA 制造商

这是核心管理界面，包含四个区域：

#### 组织 DNA 概览

顶部四个统计卡片：
- **数字生命体** — 团队中的 Agent 总数
- **已学技能** — 通过蒸馏学习到的技能总数
- **基因类型** — 团队使用的不同 AI Provider 数
- **可工作** — 处于「活跃」或「成熟」状态的生命体数

下方显示四个进化状态的分布。

#### DNA 蒸馏管线

当存在进行中或已完成的蒸馏任务时显示：
- **进行中** — 显示正在蒸馏的任务（amber 圆点）
- **最近完成** — 显示最近成功的蒸馏（emerald 对勾）

#### 数字生命体列表

以卡片网格展示所有 Agent 的 DNA 概要：
- 头像 + 名称
- Provider · 部门 · 角色
- 进化状态图标
- 核心技能标签（最多显示 4 个）

**点击任意卡片可展开五维 DNA 详情**。

### 3. DNA 蒸馏

**操作步骤**:
1. 进入 🧬 DNA 制造商页面
2. 点击顶部 **「DNA 蒸馏」** 按钮
3. 系统自动：
   - 检测团队中所有可学习的 Provider
   - 从 `colleague-skill` 和 `ScienceClaw` 两个仓库发起蒸馏
   - 将提取的技能分发到对应 Provider
4. 蒸馏完成后，点击 **「刷新」** 更新 DNA 状态

**当前支持的能力源仓库**:
- `https://github.com/titanwings/colleague-skill` — 同事技能克隆
- `https://github.com/beita6969/ScienceClaw` — 科学爪技能库

**支持蒸馏的 Provider**:
`claude` · `codex` · `gemini` · `opencode` · `kimi`

### 4. 数字生命体管理

每个数字生命体是一个 Agent 的完整 DNA 档案。DNA 会根据以下因素自动推断：

| 数据来源 | 影响的 DNA 维度 |
|----------|-----------------|
| Agent 角色（leader/senior/junior） | Persona、Decision、Relationship |
| Agent personality 字段 | Persona（culture_tag）、Work（core_skills） |
| cli_provider | Work（tools, analysis_framework） |
| 已学习的技能 | Work（core_skills）、Memory |
| 完成的任务数 | Memory、进化状态 |
| acts_as_planning_leader | Relationship |

### 5. 五维 DNA 详情

点击任一数字生命体卡片，下方展开详情面板，包含 6 个模块：

| 模块 | 显示内容 |
|------|----------|
| 🎭 人格 DNA | 特征、沟通风格、压力反应、协作偏好、文化标签 |
| ⚙️ 工作 DNA | 核心能力、分析框架、任务拆解、交付方式、工具 |
| 🎯 决策 DNA | 风险偏好、优先级策略、决策依据、取舍逻辑 |
| 💾 记忆 DNA | 已学技能数、完成任务数 |
| 🤝 协作 DNA | 领导风格、反馈方式、委派偏好、冲突处理 |
| 📦 DNA 来源 | 连接的能力源仓库 |

---

## DNA 类型系统

类型定义文件：`src/types/dna.ts`

### 类型总览

```typescript
// DNA 来源类型
type DNASourceType = "chat_history" | "document" | "email" | "meeting_notes"
                   | "task_history" | "code_repo" | "skill_repo" | "manual_input";

// 五维 DNA
interface PersonaDNA      { traits, communication_style, stress_response, collaboration_preference, culture_tag }
interface WorkDNA          { core_skills, task_decomposition_style, delivery_template, analysis_framework, tools }
interface DecisionDNA      { risk_preference, priority_style, decision_basis, tradeoff_logic }
interface MemoryDNA        { learned_skill_count, task_completed_count, report_count, key_experiences }
interface RelationshipDNA  { leadership_style, feedback_style, delegation_preference, conflict_resolution }

// 完整档案
interface DNAProfile {
  agent_id, agent_name, provider, department, role, avatar_emoji,
  persona: PersonaDNA,
  work: WorkDNA,
  decision: DecisionDNA,
  memory: MemoryDNA,
  relationship: RelationshipDNA,
  evolution_status: "embryo" | "learning" | "active" | "mature",
  dna_version, created_at, updated_at, sources: DNASource[]
}

// 蒸馏任务
interface DistillationJob { id, repo, target_providers, status, started_at, completed_at, skills_extracted }
```

---

## 技术架构

```
前端 (React + TypeScript + Vite)          后端 (Express + SQLite)        外部服务
┌────────────────────────────┐           ┌────────────────────────┐    ┌──────────┐
│  SmartCompanyBuilder       │           │  /api/agents           │    │ Dify API │
│  DNAManufacturerView       │  ──HTTP─→ │  /api/skills/learn     │    │ (可选)   │
│  IndustryPortraitView      │           │  /api/skills/available │    └──────────┘
│  DNA 类型系统 (types/dna)   │  ←─WS──  │  /api/skills/history   │         ↑
│  Dify Workflow 集成         │  ─────────────────────────────────────→  AI 分析
└────────────────────────────┘           └────────────────────────┘
        │                                         │
        ↓                                         ↓
   浏览器渲染                               SQLite 持久化
   HMR 热更新                              WebSocket 实时推送
```

### 关键技术选型

| 层 | 技术 |
|----|------|
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite 7 |
| 后端 | Express + Node.js ≥ 22 |
| 数据库 | SQLite (node:sqlite) |
| 包管理 | pnpm |
| 国际化 | 自研 i18n（韩/英/日/中 四语言） |

---

## 文件结构

```
src/
├── types/
│   └── dna.ts                       # DNA 类型系统定义
├── components/
│   ├── SmartCompanyBuilder.tsx       # ⭐ 智能建司（自然语言 + Dify/本地双引擎）
│   ├── DNAManufacturerView.tsx       # DNA 制造商主视图
│   ├── IndustryPortraitView.tsx      # 行业自画像建司视图（集成 SmartBuilder）
│   └── Sidebar.tsx                   # 侧边栏（含 🧬 导航入口）
├── app/
│   ├── types.ts                      # View 类型（含 "dna"）
│   ├── AppMainLayout.tsx             # 主布局（渲染 DNA 视图）
│   ├── useAppLabels.ts               # 标题国际化（含 DNA 标题）
│   └── ...
├── api/
│   ├── dify-workflow.ts              # ⭐ Dify 工作流 API + 本地解析引擎
│   ├── workflow-skills-subtasks.ts   # 技能学习/蒸馏 API
│   ├── organization-projects.ts      # Agent/部门 CRUD API
│   └── ...
└── api.ts                            # API 统一导出
```

---

## 常见问题

### Q: 如何添加新的能力源仓库？

编辑 `src/components/DNAManufacturerView.tsx` 中的 `SKILL_REPOS` 数组：

```typescript
const SKILL_REPOS = [
  { url: "https://github.com/titanwings/colleague-skill", label: "colleague-skill" },
  { url: "https://github.com/beita6969/ScienceClaw", label: "ScienceClaw" },
  // 在此添加新仓库
  { url: "https://github.com/your-org/your-skill-repo", label: "your-skills" },
];
```

### Q: DNA 蒸馏按钮提示「没有可学习的员工」？

需要先通过 **行业自画像** 创建团队，且团队中的 Agent 使用的 `cli_provider` 必须是以下之一：
`claude`、`codex`、`gemini`、`opencode`、`kimi`。

### Q: 如何自定义 DNA 推断逻辑？

DNA 的推断逻辑在 `DNAManufacturerView.tsx` 的以下函数中：

| 函数 | 影响 |
|------|------|
| `mkPersona(agent)` | 人格 DNA 推断 |
| `mkWork(agent, learnedSkills)` | 工作 DNA 推断 |
| `mkDecision(agent)` | 决策 DNA 推断 |
| `mkMemory(agent, learnedSkills)` | 记忆 DNA 推断 |
| `mkRelationship(agent)` | 协作 DNA 推断 |
| `evolutionStatus(skills, tasks)` | 进化状态判定 |

修改这些函数可以调整 DNA 生成策略。

### Q: 端口被占用怎么办？

```bash
# Windows — 查找占用端口的进程
netstat -ano | findstr "8790"

# 杀掉对应进程（PID 替换为实际值）
taskkill /F /PID <PID>

# 重新启动
pnpm run dev:local
```

### Q: 如何在生产环境部署？

```bash
# 构建前端
pnpm run build

# 产物在 dist/ 目录
# 使用 pnpm run start 启动生产模式
pnpm run start
```

---

## 路线图

- [ ] DNA Profile 持久化到数据库
- [ ] 支持手动编辑/校正 DNA 属性
- [ ] DNA 对比功能（两个生命体之间的能力差异）
- [ ] DNA 导出/导入（JSON 格式）
- [ ] 基于真实聊天记录自动提取 Persona DNA
- [ ] DNA 版本历史与回滚
- [ ] 生命体之间的技能转移/克隆

---

## 许可证

本项目基于 Claw-Empire 构建，遵循其原始许可证。

---

*AI DNA 制造商 — 让每一个优秀的人，都能成为永不离开的数字生命体。*
