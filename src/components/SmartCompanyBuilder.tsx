import { useState, useCallback } from "react";
import * as api from "../api";
import { useI18n } from "../i18n";
import type { Agent, Department, WorkflowPackKey } from "../types";
import {
  analyzeBusinessNeeds,
  isDifyConfigured,
  setDifyConfig,
  pickAnalystAgent,
  detectAvailableProviders,
  resolveProvider,
  type AnalysisResult,
  type AnalysisChannel,
  type AgentAnalysisProgress,
  type RoleBlueprint,
  type GapItem,
} from "../api/dify-workflow";
import {
  createInitialPipelineState,
  runFullPipeline,
  runSkillImport,
  runCreateProject,
  runAssignTasks,
  runStartWork,
  type PipelineState,
  type PipelineStepId,
} from "../api/post-creation-pipeline";

type Props = {
  departments: Department[];
  agents: Agent[];
  activeOfficeWorkflowPack: WorkflowPackKey;
  onAgentsChange: () => void;
};

function findDepartmentId(departments: Department[], hint: RoleBlueprint["departmentHint"]): string | null {
  const byId = departments.find((d) => d.id.toLowerCase().includes(hint));
  if (byId) return byId.id;
  const kw: Record<string, string[]> = {
    planning: ["plan", "planning", "企划", "规划"],
    development: ["dev", "development", "开发"],
    design: ["design", "设计"],
    qa: ["qa", "qc", "quality", "质检"],
    devsecops: ["sec", "ops", "安全"],
    operations: ["operation", "ops", "运营"],
  };
  const matched = departments.find((d) => {
    const bucket = `${d.id} ${d.name} ${d.name_zh ?? ""}`.toLowerCase();
    return kw[hint]?.some((w) => bucket.includes(w));
  });
  return matched?.id ?? departments[0]?.id ?? null;
}

const SEVERITY_STYLE: Record<GapItem["severity"], { bg: string; text: string; label: string }> = {
  high: { bg: "bg-red-500/10", text: "text-red-400", label: "🔴 高" },
  medium: { bg: "bg-amber-500/10", text: "text-amber-400", label: "🟡 中" },
  low: { bg: "bg-green-500/10", text: "text-green-400", label: "🟢 低" },
};

export default function SmartCompanyBuilder({ departments, agents, activeOfficeWorkflowPack, onAgentsChange }: Props) {
  const { t } = useI18n();
  const tr = (ko: string, en: string, ja = en, zh = en) => t({ ko, en, ja, zh });

  const [description, setDescription] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showDifyConfig, setShowDifyConfig] = useState(false);
  const [difyBase, setDifyBase] = useState("");
  const [difyKey, setDifyKey] = useState("");
  const [checkedRoles, setCheckedRoles] = useState<Set<string>>(new Set());
  const [channel, setChannel] = useState<AnalysisChannel>("auto");
  const [agentProgress, setAgentProgress] = useState<AgentAnalysisProgress | null>(null);
  const [createdAgents, setCreatedAgents] = useState<Agent[]>([]);
  const [pipeline, setPipeline] = useState<PipelineState | null>(null);

  const bestAgent = pickAnalystAgent(agents);

  const onPipelineProgress = useCallback((s: PipelineState) => setPipeline({ ...s }), []);

  // ── 分析 ──
  const handleAnalyze = async (overrideChannel?: AnalysisChannel) => {
    if (!description.trim()) {
      setMessage(tr("请输入您的业务需求描述", "Please describe your business needs", "ビジネスニーズを入力してください", "请输入您的业务需求描述"));
      return;
    }
    const ch = overrideChannel ?? channel;
    setAnalyzing(true);
    setResult(null);
    setMessage(null);
    setAgentProgress(null);
    try {
      const r = await analyzeBusinessNeeds(description, {
        channel: ch,
        agents,
        onAgentProgress: (p) => setAgentProgress({ ...p }),
      });
      setResult(r);
      setCheckedRoles(new Set(r.roles.map((role) => role.roleKey)));
      const srcLabel = r.source === "agent" ? "🤖 Agent AI" : r.source === "dify" ? "🔮 Dify AI" : "⚙️ Local";
      setMessage(`✅ ${srcLabel} ${tr("分析完成", "analysis done", "分析完了", "分析完成")}`);
    } catch (err) {
      console.error("Analysis failed:", err);
      setMessage(tr("分析失败", "Analysis failed", "分析失敗", "分析失败"));
    } finally {
      setAnalyzing(false);
      setAgentProgress(null);
    }
  };

  // ── 创建团队 ──
  const handleCreateTeam = async () => {
    if (!result) return;
    const selectedRoles = result.roles.filter((r) => checkedRoles.has(r.roleKey));
    if (selectedRoles.length === 0) {
      setMessage(tr("请至少选择一个岗位", "Select at least one role", "少なくとも1つの役職を選択してください", "请至少选择一个岗位"));
      return;
    }

    setCreating(true);
    setMessage(null);
    try {
      const existingNames = new Set(agents.map((a) => a.name.trim().toLowerCase()));
      const hires: Promise<Agent>[] = [];
      let seed = 1;

      const entries: Array<{ role: RoleBlueprint; isBackup: boolean; serial: number }> = [];
      for (const role of selectedRoles) {
        entries.push({ role, isBackup: false, serial: seed++ });
        if (role.critical) {
          entries.push({ role, isBackup: true, serial: seed++ });
        }
      }

      const industryTag = (result.industryZh || result.industry).replace(/\s+/g, "-").slice(0, 20).toLowerCase();
      const availableProviders = detectAvailableProviders(agents);

      for (const entry of entries) {
        const deptId = findDepartmentId(departments, entry.role.departmentHint);
        if (!deptId) continue;

        const baseName = `${result.industryZh} ${entry.role.titleZh} ${entry.serial}`;
        const name = existingNames.has(baseName.toLowerCase()) ? `${baseName}-${Date.now() % 1000}` : baseName;
        existingNames.add(name.toLowerCase());

        hires.push(
          api.createAgent({
            name,
            name_ko: name,
            name_ja: name,
            name_zh: name,
            department_id: deptId,
            role: entry.role.role,
            cli_provider: resolveProvider(entry.role.provider, availableProviders),
            avatar_emoji: entry.isBackup ? "🧩" : entry.role.critical ? "⭐" : "🧠",
            personality:
              `[SmartBuilder]\nindustry=${result.industry}\nindustry_zh=${result.industryZh}\n` +
              `industry_tag=${industryTag}\njob=${entry.role.title}\njob_zh=${entry.role.titleZh}\n` +
              `skills=${entry.role.skills.join(", ")}\nreason=${entry.role.reason}\n` +
              `critical=${entry.role.critical}\nbackup=${entry.isBackup}\n` +
              `workflow_pack=${activeOfficeWorkflowPack}`,
            workflow_pack_key: activeOfficeWorkflowPack,
          }),
        );
      }

      const newAgents = await Promise.all(hires);
      setCreatedAgents(newAgents);
      onAgentsChange();
      setPipeline(createInitialPipelineState());
      setMessage(
        tr(
          `✅ 团队已创建：${entries.length} 名员工（含 ${entries.filter((e) => e.isBackup).length} 个关键岗位备份）—— 请继续下一步⬇️`,
          `✅ Team created: ${entries.length} agents (${entries.filter((e) => e.isBackup).length} critical backups) — continue below ⬇️`,
          `✅ チーム作成：${entries.length}名 — 次のステップへ⬇️`,
          `✅ 团队已创建：${entries.length} 名员工（含 ${entries.filter((e) => e.isBackup).length} 个关键岗位备份）—— 请继续下一步⬇️`,
        ),
      );
    } catch (err) {
      console.error("Team creation failed:", err);
      setMessage(tr("创建失败", "Creation failed", "作成失敗", "创建失败"));
    } finally {
      setCreating(false);
    }
  };

  // ── 流水线：一键启动全部 ──
  const handleFullPipeline = async () => {
    if (!result || createdAgents.length === 0) return;
    const selectedRoles = result.roles.filter((r) => checkedRoles.has(r.roleKey));
    await runFullPipeline({
      analysis: result,
      createdAgents,
      selectedRoles,
      packKey: activeOfficeWorkflowPack,
      onProgress: onPipelineProgress,
    });
    onAgentsChange();
  };

  // ── 流水线：单步执行 ──
  const handleStepRun = async (stepId: PipelineStepId) => {
    if (!pipeline || !result) return;
    let state = { ...pipeline, running: true };
    setPipeline(state);

    const selectedRoles = result.roles.filter((r) => checkedRoles.has(r.roleKey));
    switch (stepId) {
      case "skills":
        state = await runSkillImport(createdAgents, state, onPipelineProgress);
        break;
      case "project":
        state = await runCreateProject(result, createdAgents, activeOfficeWorkflowPack, state, onPipelineProgress);
        break;
      case "tasks":
        state = await runAssignTasks(result, createdAgents, selectedRoles, activeOfficeWorkflowPack, state, onPipelineProgress);
        break;
      case "run":
        state = await runStartWork(state, onPipelineProgress);
        break;
    }
    setPipeline({ ...state, running: false });
    onAgentsChange();
  };

  // ── Dify 配置保存 ──
  const saveDifyConfig = () => {
    if (difyBase.trim() && difyKey.trim()) {
      setDifyConfig(difyBase, difyKey);
      setShowDifyConfig(false);
      setMessage(tr("✅ Dify 配置已保存", "✅ Dify config saved", "✅ Dify設定保存済み", "✅ Dify 配置已保存"));
    }
  };

  const toggleRole = (key: string) => {
    setCheckedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* ── 标题 + Dify 状态 ── */}
      <section className="rounded-2xl p-5" style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-surface)" }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold" style={{ color: "var(--th-text-heading)" }}>
              🤖 {tr("智能建司", "Smart Company Builder", "スマート会社設立", "智能建司")}
            </h2>
            <p className="mt-1 text-sm" style={{ color: "var(--th-text-secondary)" }}>
              {tr(
                "用自然语言描述你的业务需求，AI 自动分析岗位需求、生成团队、并告诉你哪里不足。",
                "Describe your business needs in natural language. AI analyzes roles, generates your team, and reports gaps.",
                "自然言語でビジネスニーズを記述すると、AIが自動で分析・チーム生成・ギャップ報告します。",
                "用自然语言描述你的业务需求，AI 自动分析岗位需求、生成团队、并告诉你哪里不足。",
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowDifyConfig(!showDifyConfig)}
            className="shrink-0 rounded-lg px-3 py-1.5 text-xs"
            style={{
              border: "1px solid var(--th-border)",
              color: isDifyConfigured() ? "var(--th-text-success, #34d399)" : "var(--th-text-muted)",
            }}
          >
            {isDifyConfigured() ? "🟢 Dify" : "⚪ Dify"}
          </button>
        </div>

        {/* Dify 配置面板 */}
        {showDifyConfig && (
          <div className="mt-3 rounded-lg p-3" style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-elevated)" }}>
            <div className="text-xs font-medium mb-2" style={{ color: "var(--th-text-heading)" }}>
              Dify Workflow {tr("配置", "Config", "設定", "配置")}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={difyBase}
                onChange={(e) => setDifyBase(e.target.value)}
                placeholder="API Base URL (e.g. https://api.dify.ai)"
                className="w-full rounded px-2 py-1.5 text-xs"
                style={{ border: "1px solid var(--th-input-border)", background: "var(--th-input-bg)", color: "var(--th-text-primary)" }}
              />
              <input
                value={difyKey}
                onChange={(e) => setDifyKey(e.target.value)}
                placeholder="API Key (app-xxx...)"
                type="password"
                className="w-full rounded px-2 py-1.5 text-xs"
                style={{ border: "1px solid var(--th-input-border)", background: "var(--th-input-bg)", color: "var(--th-text-primary)" }}
              />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={saveDifyConfig}
                className="rounded px-3 py-1 text-xs font-medium"
                style={{ background: "var(--th-btn-primary-bg)", color: "var(--th-btn-primary-text)" }}
              >
                {tr("保存", "Save", "保存", "保存")}
              </button>
              <span className="text-xs" style={{ color: "var(--th-text-muted)" }}>
                {tr("配置Dify后可获得AI深度分析，未配置则使用本地引擎", "With Dify: AI-powered deep analysis. Without: local keyword engine.", "Dify設定でAI深層分析。未設定ならローカルエンジン。", "配置Dify后可获得AI深度分析，未配置则使用本地引擎")}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* ── 自然语言输入 + 三通道选择 ── */}
      <section className="rounded-2xl p-5" style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-surface)" }}>
        <div className="text-sm font-medium mb-2" style={{ color: "var(--th-text-heading)" }}>
          💬 {tr("描述你的公司", "Describe Your Company", "会社を説明", "描述你的公司")}
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder={tr(
            "例如：我是二次元行业的老板，想要针对女性游戏乙游做一套3D建模的企业。需要观测爬取截图的人员，还需要想法创意人员，需要化妆人员，需要会3D建模的人员，需要小红书运营人员...",
            "E.g.: I'm building a 3D modeling studio for otome games. I need trend scouts, creative directors, digital makeup artists, 3D modelers, and Xiaohongshu operators...",
            "例：乙女ゲーム向け3Dモデリングスタジオを作りたい。トレンドスカウト、クリエイティブディレクター、メイクアップアーティスト、3Dモデラー、SNS運営が必要...",
            "例如：我是二次元行业的老板，想要针对女性游戏乙游做一套3D建模的企业。需要观测爬取截图的人员，还需要想法创意人员，需要化妆人员，需要会3D建模的人员，需要小红书运营人员...",
          )}
          className="w-full rounded-lg px-3 py-2.5 text-sm leading-relaxed resize-none"
          style={{ border: "1px solid var(--th-input-border)", background: "var(--th-input-bg)", color: "var(--th-text-primary)" }}
        />

        {/* 三通道选择器 */}
        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          <span className="text-xs mr-1" style={{ color: "var(--th-text-muted)" }}>
            {tr("分析通道", "Channel", "チャネル", "分析通道")}:
          </span>
          {([
            { key: "agent" as const, icon: "🤖", label: "Agent AI", desc: bestAgent ? `${bestAgent.avatar_emoji} ${bestAgent.name}` : tr("无可用Agent", "No agent", "Agent無し", "无可用Agent"), ok: !!bestAgent },
            { key: "dify" as const, icon: "🔮", label: "Dify", desc: isDifyConfigured() ? tr("已配置", "Ready", "設定済", "已配置") : tr("未配置", "Not set", "未設定", "未配置"), ok: isDifyConfigured() },
            { key: "local" as const, icon: "⚙️", label: tr("本地", "Local", "ローカル", "本地"), desc: tr("关键词引擎", "Keyword engine", "キーワード", "关键词引擎"), ok: true },
            { key: "auto" as const, icon: "🔄", label: "Auto", desc: tr("自动选最佳", "Auto-best", "自動", "自动选最佳"), ok: true },
          ]).map((ch) => (
            <button
              key={ch.key}
              type="button"
              onClick={() => setChannel(ch.key)}
              disabled={!ch.ok && ch.key !== "auto"}
              className="rounded-lg px-2.5 py-1.5 text-xs transition-colors"
              style={{
                border: `1.5px solid ${channel === ch.key ? "var(--th-btn-primary-bg, #3b82f6)" : "var(--th-border)"}`,
                background: channel === ch.key ? "var(--th-bg-elevated)" : "transparent",
                color: ch.ok ? "var(--th-text-primary)" : "var(--th-text-muted)",
                opacity: ch.ok || ch.key === "auto" ? 1 : 0.5,
              }}
            >
              {ch.icon} {ch.label}
              <span className="ml-1" style={{ color: "var(--th-text-muted)", fontSize: "10px" }}>{ch.desc}</span>
            </button>
          ))}
        </div>

        {/* 分析按钮 */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => { void handleAnalyze(); }}
            disabled={analyzing}
            className="rounded-lg px-4 py-2 text-sm font-medium"
            style={{ background: "var(--th-btn-primary-bg)", color: "var(--th-btn-primary-text)" }}
          >
            {analyzing
              ? (channel === "agent"
                  ? tr("🤖 Agent 分析中...", "🤖 Agent analyzing...", "🤖 Agent分析中...", "🤖 Agent 分析中...")
                  : tr("🔍 分析中...", "🔍 Analyzing...", "🔍 分析中...", "🔍 分析中..."))
              : (channel === "agent"
                  ? tr("🤖 Agent 自主分析", "🤖 Agent Analyze", "🤖 Agent分析", "🤖 Agent 自主分析")
                  : tr("🔍 智能分析", "🔍 Smart Analyze", "🔍 スマート分析", "🔍 智能分析"))}
          </button>
          {channel === "agent" && bestAgent && (
            <span className="text-xs" style={{ color: "var(--th-text-secondary)" }}>
              {tr("将由", "By", "", "将由")} {bestAgent.avatar_emoji} {bestAgent.name} ({bestAgent.cli_provider}) {tr("深度分析你的需求", "to deeply analyze your needs", "が深層分析", "深度分析你的需求")}
            </span>
          )}
          {channel !== "agent" && (
            <span className="text-xs" style={{ color: "var(--th-text-muted)" }}>
              {channel === "dify" ? tr("Dify AI 深度分析", "Dify AI analysis", "Dify AI分析", "Dify AI 深度分析")
                : channel === "local" ? tr("本地关键词引擎", "Local keyword engine", "ローカルエンジン", "本地关键词引擎")
                : tr("自动选择最佳通道", "Auto-select best channel", "自動選択", "自动选择最佳通道")}
            </span>
          )}
        </div>
      </section>

      {/* ── Agent 分析进度 ── */}
      {agentProgress && (
        <section className="rounded-2xl p-4" style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-surface)" }}>
          <div className="flex items-center gap-3">
            <div className="relative">
              <span className="text-2xl">{agentProgress.agentEmoji ?? "🤖"}</span>
              {agentProgress.phase === "polling" && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium" style={{ color: "var(--th-text-primary)" }}>
                {agentProgress.message}
              </div>
              {agentProgress.phase === "polling" && agentProgress.elapsed != null && (
                <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--th-border)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{
                      background: "var(--th-btn-primary-bg, #3b82f6)",
                      width: `${Math.min(95, (agentProgress.elapsed / 180) * 100)}%`,
                    }}
                  />
                </div>
              )}
              {agentProgress.taskId && (
                <div className="text-xs mt-0.5" style={{ color: "var(--th-text-muted)" }}>
                  Task: {agentProgress.taskId.slice(0, 8)}...
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── 消息提示 ── */}
      {message && (
        <div className="rounded-lg px-4 py-2.5 text-sm" style={{ border: "1px solid var(--th-border)", color: "var(--th-text-secondary)", background: "var(--th-bg-elevated)" }}>
          {message}
        </div>
      )}

      {/* ── 分析结果 ── */}
      {result && (
        <>
          {/* 行业 + 摘要 */}
          <section className="rounded-2xl p-5" style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-surface)" }}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">🏢</span>
              <div>
                <div className="text-base font-semibold" style={{ color: "var(--th-text-heading)" }}>
                  {result.industryZh} <span className="text-xs font-normal" style={{ color: "var(--th-text-muted)" }}>({result.industry})</span>
                </div>
                <div className="text-xs" style={{ color: "var(--th-text-muted)" }}>
                  {tr("分析来源", "Source", "ソース", "分析来源")}：{result.source === "agent" ? "🤖 Agent AI" : result.source === "dify" ? "🔮 Dify AI" : "⚙️ Local Engine"}
                </div>
              </div>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: "var(--th-text-secondary)" }}>{result.summary}</p>
          </section>

          {/* 岗位蓝图 */}
          <section className="rounded-2xl p-5" style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-surface)" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold" style={{ color: "var(--th-text-heading)" }}>
                👥 {tr("岗位蓝图", "Role Blueprint", "職種ブループリント", "岗位蓝图")}
                <span className="ml-2 text-xs font-normal" style={{ color: "var(--th-text-muted)" }}>
                  ({checkedRoles.size}/{result.roles.length} {tr("已选", "selected", "選択済み", "已选")})
                </span>
              </h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCheckedRoles(new Set(result.roles.map((r) => r.roleKey)))}
                  className="text-xs px-2 py-1 rounded"
                  style={{ border: "1px solid var(--th-border)", color: "var(--th-text-muted)" }}
                >
                  {tr("全选", "All", "全選択", "全选")}
                </button>
                <button
                  type="button"
                  onClick={() => setCheckedRoles(new Set())}
                  className="text-xs px-2 py-1 rounded"
                  style={{ border: "1px solid var(--th-border)", color: "var(--th-text-muted)" }}
                >
                  {tr("清空", "None", "クリア", "清空")}
                </button>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {result.roles.map((role) => {
                const checked = checkedRoles.has(role.roleKey);
                return (
                  <label
                    key={role.roleKey}
                    className="flex gap-2 rounded-lg px-3 py-2.5 cursor-pointer transition-colors"
                    style={{
                      border: `1px solid ${checked ? "var(--th-btn-primary-bg, #3b82f6)" : "var(--th-border)"}`,
                      background: checked ? "var(--th-bg-elevated)" : "transparent",
                    }}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggleRole(role.roleKey)} className="mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium" style={{ color: "var(--th-text-primary)" }}>
                        {role.critical && <span title="关键岗位（自动双备份）">⭐ </span>}
                        {role.titleZh}
                        <span className="ml-1 text-xs font-normal" style={{ color: "var(--th-text-muted)" }}>({role.title})</span>
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--th-text-muted)" }}>
                        {role.skills.slice(0, 4).join(" · ")}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--th-text-secondary)" }}>
                        💡 {role.reason}
                      </div>
                      <div className="flex gap-2 mt-1 text-xs" style={{ color: "var(--th-text-muted)" }}>
                        <span>📂 {role.departmentHint}</span>
                        <span>🎖 {role.role}</span>
                        <span>🤖 {role.provider}</span>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={() => { void handleCreateTeam(); }}
                disabled={creating || checkedRoles.size === 0}
                className="rounded-lg px-4 py-2 text-sm font-medium"
                style={{ background: "var(--th-btn-primary-bg)", color: "var(--th-btn-primary-text)" }}
              >
                {creating
                  ? tr("🏗️ 创建中...", "🏗️ Creating...", "🏗️ 作成中...", "🏗️ 创建中...")
                  : tr("🚀 一键创建团队", "🚀 Create Team", "🚀 チーム作成", "🚀 一键创建团队")}
              </button>
              <span className="text-xs" style={{ color: "var(--th-text-muted)" }}>
                {tr(
                  `将创建 ${checkedRoles.size} 个岗位 + 关键岗位自动双备份`,
                  `Will create ${checkedRoles.size} roles + auto-backup for critical ones`,
                  `${checkedRoles.size}職種を作成 + 重要職務自動バックアップ`,
                  `将创建 ${checkedRoles.size} 个岗位 + 关键岗位自动双备份`,
                )}
              </span>
            </div>
          </section>

          {/* 缺口分析 */}
          {result.gaps.length > 0 && (
            <section className="rounded-2xl p-5" style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-surface)" }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--th-text-heading)" }}>
                🔍 {tr("缺口分析", "Gap Analysis", "ギャップ分析", "缺口分析")}
              </h3>
              <div className="space-y-2">
                {result.gaps.map((gap, i) => {
                  const sev = SEVERITY_STYLE[gap.severity];
                  return (
                    <div key={i} className={`rounded-lg px-3 py-2.5 ${sev.bg}`} style={{ border: "1px solid var(--th-border)" }}>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold ${sev.text}`}>{sev.label}</span>
                        <span className="text-sm font-medium" style={{ color: "var(--th-text-primary)" }}>{gap.area}</span>
                      </div>
                      <div className="text-xs mt-1" style={{ color: "var(--th-text-secondary)" }}>{gap.description}</div>
                      <div className="text-xs mt-1" style={{ color: "var(--th-text-muted)" }}>💡 {gap.suggestion}</div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 风险评估 */}
          {result.risks.length > 0 && (
            <section className="rounded-2xl p-5" style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-surface)" }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--th-text-heading)" }}>
                ⚠️ {tr("风险评估", "Risk Assessment", "リスク評価", "风险评估")}
              </h3>
              <ul className="space-y-1.5">
                {result.risks.map((risk, i) => (
                  <li key={i} className="text-sm flex items-start gap-2" style={{ color: "var(--th-text-secondary)" }}>
                    <span className="shrink-0">⚠️</span>
                    <span>{risk}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {/* ── 创建后流水线引导 ── */}
          {pipeline && (
            <section className="rounded-2xl p-5" style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-surface)" }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold" style={{ color: "var(--th-text-heading)" }}>
                  ⚡ {tr("下一步：启动你的 AI 公司", "Next: Launch Your AI Company", "次へ：AI会社を起動", "下一步：启动你的 AI 公司")}
                </h3>
                <button
                  type="button"
                  onClick={() => { void handleFullPipeline(); }}
                  disabled={pipeline.running || pipeline.steps.every((s) => s.status === "done" || s.status === "skipped")}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium"
                  style={{ background: "var(--th-btn-primary-bg)", color: "var(--th-btn-primary-text)" }}
                >
                  {pipeline.running
                    ? tr("⏳ 流水线执行中...", "⏳ Pipeline running...", "⏳ パイプライン実行中...", "⏳ 流水线执行中...")
                    : pipeline.steps.every((s) => s.status === "done" || s.status === "skipped")
                      ? tr("✅ 全部完成", "✅ All Done", "✅ 全完了", "✅ 全部完成")
                      : tr("🚀 一键启动全部", "🚀 Launch All", "🚀 一括起動", "🚀 一键启动全部")}
                </button>
              </div>

              <div className="space-y-2">
                {pipeline.steps.map((step, idx) => {
                  const statusIcon =
                    step.status === "done" ? "✅" :
                    step.status === "running" ? "⏳" :
                    step.status === "error" ? "❌" :
                    step.status === "skipped" ? "⏭️" :
                    `${idx + 1}`;
                  const canRun = step.status === "pending" || step.status === "error";

                  return (
                    <div
                      key={step.id}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                      style={{
                        border: `1px solid ${step.status === "running" ? "var(--th-btn-primary-bg, #3b82f6)" : "var(--th-border)"}`,
                        background: step.status === "done" ? "rgba(34, 197, 94, 0.05)" :
                                    step.status === "running" ? "rgba(59, 130, 246, 0.05)" :
                                    step.status === "error" ? "rgba(239, 68, 68, 0.05)" :
                                    "transparent",
                      }}
                    >
                      <span className="text-lg w-7 text-center shrink-0">{step.status === "pending" ? step.icon : statusIcon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium" style={{ color: "var(--th-text-primary)" }}>
                          {step.labelZh}
                          <span className="ml-1 text-xs font-normal" style={{ color: "var(--th-text-muted)" }}>({step.label})</span>
                        </div>
                        {step.message && (
                          <div className="text-xs mt-0.5" style={{ color: step.status === "error" ? "var(--th-text-error, #ef4444)" : "var(--th-text-secondary)" }}>
                            {step.message}
                          </div>
                        )}
                        {step.status === "running" && (
                          <div className="mt-1 h-1 rounded-full overflow-hidden" style={{ background: "var(--th-border)" }}>
                            <div className="h-full rounded-full animate-pulse" style={{ background: "var(--th-btn-primary-bg, #3b82f6)", width: "60%" }} />
                          </div>
                        )}
                      </div>
                      {canRun && !pipeline.running && (
                        <button
                          type="button"
                          onClick={() => { void handleStepRun(step.id); }}
                          className="shrink-0 rounded px-2.5 py-1 text-xs font-medium"
                          style={{ border: "1px solid var(--th-border)", color: "var(--th-text-primary)" }}
                        >
                          {step.status === "error"
                            ? tr("🔄 重试", "🔄 Retry", "🔄 再試行", "🔄 重试")
                            : tr("▶️ 执行", "▶️ Run", "▶️ 実行", "▶️ 执行")}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {pipeline.steps.every((s) => s.status === "done" || s.status === "skipped") && (
                <div className="mt-4 rounded-lg px-4 py-3 text-center" style={{ background: "rgba(34, 197, 94, 0.08)", border: "1px solid rgba(34, 197, 94, 0.2)" }}>
                  <div className="text-sm font-medium" style={{ color: "var(--th-text-primary)" }}>
                    🎉 {tr(
                      "你的 AI 公司已启动！Agent 正在工作中，可在任务面板查看进度。",
                      "Your AI company is live! Agents are working. Check the Tasks panel for progress.",
                      "AI会社が起動しました！タスクパネルで進捗を確認できます。",
                      "你的 AI 公司已启动！Agent 正在工作中，可在任务面板查看进度。",
                    )}
                  </div>
                  <div className="text-xs mt-1" style={{ color: "var(--th-text-muted)" }}>
                    {tr(
                      "切换到「📋 任务」或「🧬 DNA 制造商」面板查看 Agent 工作状态和 DNA 进化",
                      "Switch to Tasks or DNA Manufacturer panels to monitor agent work and DNA evolution",
                      "タスクまたはDNA製造パネルでエージェントの作業とDNA進化を確認",
                      "切换到「📋 任务」或「🧬 DNA 制造商」面板查看 Agent 工作状态和 DNA 进化",
                    )}
                  </div>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
