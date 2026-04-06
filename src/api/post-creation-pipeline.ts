/**
 * 团队创建后的流水线：技能导入 → 创建项目 → 分配初始任务 → 启动工作
 *
 * 支持两种模式：
 *   - 一键流水线：全自动依次执行所有步骤
 *   - 分步引导：每步由用户手动触发
 */

import * as api from "./organization-projects";
import { startSkillLearning, type SkillLearnProvider } from "./workflow-skills-subtasks";
import type { Agent, WorkflowPackKey } from "../types";
import type { AnalysisResult, RoleBlueprint } from "./dify-workflow";

// ── 类型 ─────────────────────────────────────────────────────────────────────

export type PipelineStepId = "skills" | "project" | "tasks" | "run";

export type PipelineStepStatus = "pending" | "running" | "done" | "error" | "skipped";

export interface PipelineStep {
  id: PipelineStepId;
  label: string;
  labelZh: string;
  icon: string;
  status: PipelineStepStatus;
  message?: string;
}

export interface PipelineState {
  steps: PipelineStep[];
  projectId?: string;
  taskIds: string[];
  running: boolean;
}

export type PipelineProgressCallback = (state: PipelineState) => void;

// ── 常量 ─────────────────────────────────────────────────────────────────────

const SKILL_REPOS = [
  "https://github.com/titanwings/colleague-skill",
  "https://github.com/beita6969/ScienceClaw",
];

const LEARNABLE_PROVIDERS = new Set<string>(["claude", "codex", "gemini", "opencode", "kimi"]);

// ── 辅助 ─────────────────────────────────────────────────────────────────────

function extractLearnProviders(agents: Agent[]): SkillLearnProvider[] {
  const set = new Set<string>();
  for (const a of agents) {
    if (LEARNABLE_PROVIDERS.has(a.cli_provider)) set.add(a.cli_provider);
  }
  return Array.from(set) as SkillLearnProvider[];
}

function mkInitialSteps(): PipelineStep[] {
  return [
    { id: "skills", label: "Import Skills", labelZh: "导入技能", icon: "📦", status: "pending" },
    { id: "project", label: "Create Project", labelZh: "创建项目", icon: "📁", status: "pending" },
    { id: "tasks", label: "Assign Tasks", labelZh: "分配任务", icon: "📋", status: "pending" },
    { id: "run", label: "Start Work", labelZh: "启动工作", icon: "🚀", status: "pending" },
  ];
}

function updateStep(
  state: PipelineState,
  stepId: PipelineStepId,
  patch: Partial<PipelineStep>,
  onProgress: PipelineProgressCallback,
): PipelineState {
  const next: PipelineState = {
    ...state,
    steps: state.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)),
  };
  onProgress(next);
  return next;
}

// ── 各步骤独立执行函数 ───────────────────────────────────────────────────────

/** Step 1: 技能蒸馏 */
export async function runSkillImport(
  agents: Agent[],
  state: PipelineState,
  onProgress: PipelineProgressCallback,
): Promise<PipelineState> {
  state = updateStep(state, "skills", { status: "running", message: "正在提取可学习的 Provider..." }, onProgress);

  const providers = extractLearnProviders(agents);
  if (providers.length === 0) {
    return updateStep(state, "skills", { status: "skipped", message: "团队中没有可学习技能的 Provider" }, onProgress);
  }

  try {
    state = updateStep(state, "skills", { status: "running", message: `正在向 ${providers.join(", ")} 发起技能蒸馏...` }, onProgress);
    for (const repo of SKILL_REPOS) {
      await startSkillLearning({ repo, providers });
    }
    return updateStep(state, "skills", { status: "done", message: `✅ 已向 ${providers.join(", ")} 发起 ${SKILL_REPOS.length} 个技能库蒸馏` }, onProgress);
  } catch (err) {
    console.error("Skill import failed:", err);
    return updateStep(state, "skills", { status: "error", message: "技能导入失败（请检查 CLI 认证状态）" }, onProgress);
  }
}

/** Step 2: 创建项目 */
export async function runCreateProject(
  analysis: AnalysisResult,
  agents: Agent[],
  packKey: WorkflowPackKey,
  state: PipelineState,
  onProgress: PipelineProgressCallback,
): Promise<PipelineState> {
  state = updateStep(state, "project", { status: "running", message: "正在创建项目..." }, onProgress);

  const projectName = `${analysis.industryZh || analysis.industry} - AI DNA 自动建司`;
  const coreGoal =
    `行业：${analysis.industryZh}（${analysis.industry}）\n` +
    `岗位数：${analysis.roles.length}\n` +
    `分析来源：${analysis.source}\n\n` +
    (analysis.summary || "");

  try {
    const project = await api.createProject({
      name: projectName,
      project_path: `./projects/${analysis.industry.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      core_goal: coreGoal,
      default_pack_key: packKey,
      create_path_if_missing: true,
      assignment_mode: "auto",
      agent_ids: agents.map((a) => a.id),
    });
    state = { ...state, projectId: project.id };
    return updateStep(state, "project", { status: "done", message: `✅ 项目「${projectName}」已创建` }, onProgress);
  } catch (err) {
    console.error("Project creation failed:", err);
    return updateStep(state, "project", { status: "error", message: "项目创建失败" }, onProgress);
  }
}

/** 为每个岗位生成初始任务描述 */
function buildInitialTaskDescription(role: RoleBlueprint, analysis: AnalysisResult): string {
  return (
    `你是「${analysis.industryZh}」行业的「${role.titleZh}」（${role.title}）。\n\n` +
    `你的核心技能：${role.skills.join("、")}\n` +
    `设置原因：${role.reason}\n\n` +
    `请完成以下初始化工作：\n` +
    `1. 分析你在「${analysis.industryZh}」行业中的职责边界\n` +
    `2. 列出你需要重点关注的 3-5 个关键领域\n` +
    `3. 制定一份简要的 30 天工作计划\n` +
    `4. 识别与团队其他角色的协作接口\n`
  );
}

/** Step 3: 分配初始任务 */
export async function runAssignTasks(
  analysis: AnalysisResult,
  createdAgents: Agent[],
  selectedRoles: RoleBlueprint[],
  packKey: WorkflowPackKey,
  state: PipelineState,
  onProgress: PipelineProgressCallback,
): Promise<PipelineState> {
  state = updateStep(state, "tasks", { status: "running", message: `正在为 ${selectedRoles.length} 个岗位创建初始任务...` }, onProgress);

  const taskIds: string[] = [];

  try {
    for (const role of selectedRoles) {
      // 找到匹配该角色的 Agent（按名称包含 titleZh 匹配）
      const matchedAgent = createdAgents.find(
        (a) => a.personality?.includes(role.title) || a.name.includes(role.titleZh),
      );

      const taskId = await api.createTask({
        title: `[${analysis.industryZh}] ${role.titleZh} - 岗位初始化`,
        description: buildInitialTaskDescription(role, analysis),
        task_type: "analysis",
        priority: role.critical ? 1 : 2,
        assigned_agent_id: matchedAgent?.id,
        department_id: matchedAgent?.department_id ?? undefined,
        project_id: state.projectId ?? undefined,
        workflow_pack_key: packKey,
      });
      taskIds.push(taskId);
    }

    state = { ...state, taskIds: [...state.taskIds, ...taskIds] };
    return updateStep(state, "tasks", { status: "done", message: `✅ 已创建 ${taskIds.length} 个岗位初始化任务` }, onProgress);
  } catch (err) {
    console.error("Task assignment failed:", err);
    state = { ...state, taskIds: [...state.taskIds, ...taskIds] };
    return updateStep(state, "tasks", { status: "error", message: `任务创建部分失败（已创建 ${taskIds.length} 个）` }, onProgress);
  }
}

/** Step 4: 启动工作 */
export async function runStartWork(
  state: PipelineState,
  onProgress: PipelineProgressCallback,
): Promise<PipelineState> {
  if (state.taskIds.length === 0) {
    return updateStep(state, "run", { status: "skipped", message: "没有可启动的任务" }, onProgress);
  }

  state = updateStep(state, "run", { status: "running", message: `正在启动 ${state.taskIds.length} 个任务...` }, onProgress);

  let started = 0;
  let failed = 0;
  for (const taskId of state.taskIds) {
    try {
      await api.runTask(taskId);
      started++;
    } catch (err) {
      console.warn(`Failed to start task ${taskId}:`, err);
      failed++;
    }
  }

  if (failed > 0) {
    return updateStep(state, "run", {
      status: started > 0 ? "done" : "error",
      message: `已启动 ${started} 个任务，${failed} 个失败（Agent 可能无空闲 CLI 会话）`,
    }, onProgress);
  }

  return updateStep(state, "run", { status: "done", message: `✅ ${started} 个任务已启动，Agent 正在工作中！` }, onProgress);
}

// ── 一键流水线 ───────────────────────────────────────────────────────────────

export async function runFullPipeline(opts: {
  analysis: AnalysisResult;
  createdAgents: Agent[];
  selectedRoles: RoleBlueprint[];
  packKey: WorkflowPackKey;
  onProgress: PipelineProgressCallback;
}): Promise<PipelineState> {
  const { analysis, createdAgents, selectedRoles, packKey, onProgress } = opts;

  let state: PipelineState = {
    steps: mkInitialSteps(),
    taskIds: [],
    running: true,
  };
  onProgress(state);

  // Step 1
  state = await runSkillImport(createdAgents, state, onProgress);

  // Step 2
  state = await runCreateProject(analysis, createdAgents, packKey, state, onProgress);

  // Step 3
  state = await runAssignTasks(analysis, createdAgents, selectedRoles, packKey, state, onProgress);

  // Step 4
  state = await runStartWork(state, onProgress);

  state = { ...state, running: false };
  onProgress(state);
  return state;
}

/** 创建初始 pipeline state（供分步模式使用） */
export function createInitialPipelineState(): PipelineState {
  return { steps: mkInitialSteps(), taskIds: [], running: false };
}
