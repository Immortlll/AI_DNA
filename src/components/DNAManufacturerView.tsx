import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../api";
import { useI18n } from "../i18n";
import type { Agent, Department, WorkflowPackKey } from "../types";
import type { SkillLearnProvider, LearnedSkillEntry, SkillLearningHistoryEntry } from "../api/workflow-skills-subtasks";
import type { DNAProfile, DNAEvolutionStatus, PersonaDNA, WorkDNA, DecisionDNA, MemoryDNA, RelationshipDNA } from "../types/dna";

type Props = {
  departments: Department[];
  agents: Agent[];
  activeOfficeWorkflowPack: WorkflowPackKey;
  onAgentsChange: () => void;
};

const SKILL_REPOS = [
  { url: "https://github.com/titanwings/colleague-skill", label: "colleague-skill" },
  { url: "https://github.com/beita6969/ScienceClaw", label: "ScienceClaw" },
];

const LEARNABLE = new Set(["claude", "codex", "gemini", "opencode", "kimi"]);

const STATUS_CFG: Record<DNAEvolutionStatus, { zh: string; en: string; color: string; icon: string }> = {
  embryo: { zh: "胚胎", en: "Embryo", color: "text-gray-400", icon: "🧬" },
  learning: { zh: "学习中", en: "Learning", color: "text-amber-400", icon: "📡" },
  active: { zh: "活跃", en: "Active", color: "text-emerald-400", icon: "⚡" },
  mature: { zh: "成熟", en: "Mature", color: "text-cyan-400", icon: "🧠" },
};

function evolutionStatus(skills: number, tasks: number): DNAEvolutionStatus {
  if (skills === 0 && tasks === 0) return "embryo";
  if (skills > 0 && tasks === 0) return "learning";
  if (tasks > 0 && skills < 3) return "active";
  return "mature";
}

function mkPersona(a: Agent): PersonaDNA {
  const p = a.personality ?? "";
  const traits: string[] = [];
  if (/leader|planning/i.test(a.role)) traits.push("leadership");
  if (/senior/i.test(a.role)) traits.push("mentorship", "deep-focus");
  if (/junior|intern/i.test(a.role)) traits.push("fast-learner", "adaptive");
  if (/critical/i.test(p)) traits.push("resilience-backup");
  if (traits.length === 0) traits.push("generalist");
  return {
    traits,
    communication_style: /leader/i.test(a.role) ? "directive" : "collaborative",
    stress_response: /critical/i.test(p) ? "failover-ready" : "standard",
    collaboration_preference: /planning/i.test(a.role) ? "orchestrator" : "executor",
    culture_tag: p.match(/industry=([^\n]+)/)?.[1] ?? "general",
  };
}

function mkWork(a: Agent, ls: LearnedSkillEntry[]): WorkDNA {
  const p = a.personality ?? "";
  const m = p.match(/skills=([^\n]+)/);
  const core = m ? m[1].split(",").map((s) => s.trim()) : [];
  const ext = ls.filter((s) => s.provider === a.cli_provider).map((s) => s.skill_label);
  return {
    core_skills: [...new Set([...core, ...ext])],
    task_decomposition_style: /leader/i.test(a.role) ? "top-down" : "task-oriented",
    delivery_template: /senior/i.test(a.role) ? "structured-report" : "quick-output",
    analysis_framework: a.cli_provider === "claude" ? "chain-of-thought" : "direct",
    tools: [a.cli_provider],
  };
}

function mkDecision(a: Agent): DecisionDNA {
  return {
    risk_preference: /leader/i.test(a.role) ? "moderate" : "conservative",
    priority_style: /senior/i.test(a.role) ? "impact-first" : "deadline-first",
    decision_basis: [a.cli_provider, a.role],
    tradeoff_logic: "quality-over-speed",
  };
}

function mkMemory(a: Agent, ls: LearnedSkillEntry[]): MemoryDNA {
  return {
    learned_skill_count: ls.filter((s) => s.provider === a.cli_provider).length,
    task_completed_count: a.stats_tasks_done,
    report_count: 0,
    key_experiences: [],
  };
}

function mkRelationship(a: Agent): RelationshipDNA {
  return {
    leadership_style: a.acts_as_planning_leader ? "planning-leader" : "individual-contributor",
    feedback_style: /senior|leader/i.test(a.role) ? "mentoring" : "peer",
    delegation_preference: /leader/i.test(a.role) ? "task-delegation" : "self-driven",
    conflict_resolution: "consensus",
  };
}

function buildProfile(a: Agent, dept: Department | undefined, ls: LearnedSkillEntry[]): DNAProfile {
  const mem = mkMemory(a, ls);
  return {
    agent_id: a.id, agent_name: a.name, provider: a.cli_provider,
    department: dept?.name ?? "unassigned", role: a.role, avatar_emoji: a.avatar_emoji,
    persona: mkPersona(a), work: mkWork(a, ls), decision: mkDecision(a),
    memory: mem, relationship: mkRelationship(a),
    evolution_status: evolutionStatus(mem.learned_skill_count, mem.task_completed_count),
    dna_version: 1, created_at: a.created_at, updated_at: Date.now(), sources: [],
  };
}

export default function DNAManufacturerView({ departments, agents, activeOfficeWorkflowPack, onAgentsChange }: Props) {
  const { t, language } = useI18n();
  const tr = (ko: string, en: string, ja = en, zh = en) => t({ ko, en, ja, zh });

  const [learnedSkills, setLearnedSkills] = useState<LearnedSkillEntry[]>([]);
  const [history, setHistory] = useState<SkillLearningHistoryEntry[]>([]);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [distilling, setDistilling] = useState(false);
  const [distillMsg, setDistillMsg] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoadingSkills(true);
    try {
      const [sk, hi] = await Promise.all([
        api.getAvailableLearnedSkills({ limit: 500 }),
        api.getSkillLearningHistory({ limit: 100 }).then((r) => r.history),
      ]);
      setLearnedSkills(sk);
      setHistory(hi);
    } catch (e) { console.error("Load skill data failed:", e); }
    finally { setLoadingSkills(false); }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const deptMap = useMemo(() => {
    const m = new Map<string, Department>();
    for (const d of departments) m.set(d.id, d);
    return m;
  }, [departments]);

  const profiles = useMemo(
    () => agents.map((a) => buildProfile(a, deptMap.get(a.department_id ?? ""), learnedSkills)),
    [agents, deptMap, learnedSkills],
  );

  const selected = useMemo(() => profiles.find((p) => p.agent_id === selectedId) ?? null, [profiles, selectedId]);

  const stats = useMemo(() => {
    const byS = { embryo: 0, learning: 0, active: 0, mature: 0 };
    for (const p of profiles) byS[p.evolution_status]++;
    return {
      total: profiles.length,
      byS,
      providers: new Set(agents.map((a) => a.cli_provider)).size,
      skills: learnedSkills.length,
    };
  }, [profiles, agents, learnedSkills]);

  const handleDistill = async () => {
    const provs: SkillLearnProvider[] = [];
    for (const a of agents) {
      if (LEARNABLE.has(a.cli_provider) && !provs.includes(a.cli_provider as SkillLearnProvider))
        provs.push(a.cli_provider as SkillLearnProvider);
    }
    if (provs.length === 0) {
      setDistillMsg(tr("팀에 학습 가능한 에이전트가 없습니다.", "No learnable agents. Create agents first.", "学習可能なエージェントがいません。", "当前团队没有可学习的员工，请先创建员工。"));
      return;
    }
    setDistilling(true); setDistillMsg(null);
    try {
      for (const r of SKILL_REPOS) await api.startSkillLearning({ repo: r.url, providers: provs });
      await loadData();
      setDistillMsg(tr(
        `DNA 증류 큐 등록 완료. 대상: ${provs.join(", ")}`,
        `DNA distillation queued: ${provs.join(", ")}. ${SKILL_REPOS.length} repos injected.`,
        `DNA蒸留をキューしました: ${provs.join(", ")}`,
        `DNA 蒸馏已发起：${provs.join("、")}。${SKILL_REPOS.length} 个能力源已注入。`,
      ));
    } catch (e) {
      console.error("Distill failed:", e);
      setDistillMsg(tr("DNA 증류 실패.", "Distillation failed. Check CLI auth.", "DNA蒸留失敗。", "DNA 蒸馏失败，请检查 CLI 认证。"));
    } finally { setDistilling(false); }
  };

  const activeJobs = useMemo(() => history.filter((h) => h.status === "queued" || h.status === "running"), [history]);
  const recentDone = useMemo(() => history.filter((h) => h.status === "succeeded").slice(0, 6), [history]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <section className="rounded-2xl p-5" style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-surface)" }}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-lg font-semibold" style={{ color: "var(--th-text-heading)" }}>
              {"🧬 "}{tr("AI DNA 제조소", "AI DNA Manufacturer", "AI DNA製造所", "AI DNA 制造商")}
            </h2>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--th-text-secondary)" }}>
              {tr(
                "인간의 능력·인격·경험·의사결정 방식을 클론하여 지속적으로 일하는 AI 디지털 생명체를 제조합니다.",
                "Clone human capabilities, personality, experience & decision-making into sustainable AI digital life forms.",
                "人の能力・人格・経験・意思決定をクローンし、持続稼働するAIデジタル生命体を製造します。",
                "将人的能力、人格、经验、决策方式，克隆成可持续工作的 AI 数字生命体。",
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => { void handleDistill(); }} disabled={distilling}
              className="rounded-lg px-3 py-2 text-sm font-medium"
              style={{ background: "var(--th-btn-primary-bg)", color: "var(--th-btn-primary-text)" }}>
              {distilling ? tr("蒸馏中...", "Distilling...", "蒸留中...", "蒸馏中...") : tr("DNA 증류", "DNA Distillation", "DNA蒸留", "DNA 蒸馏")}
            </button>
            <button type="button" onClick={() => { void loadData(); }} disabled={loadingSkills}
              className="rounded-lg px-3 py-2 text-sm font-medium"
              style={{ border: "1px solid var(--th-border)", color: "var(--th-text-primary)" }}>
              {loadingSkills ? tr("로딩...", "Loading...", "読込中...", "加载中...") : tr("새로고침", "Refresh", "更新", "刷新")}
            </button>
          </div>
        </div>
        {distillMsg && (
          <div className="mt-4 rounded-lg px-3 py-2 text-sm" style={{ border: "1px solid var(--th-border)", color: "var(--th-text-secondary)" }}>
            {distillMsg}
          </div>
        )}
      </section>

      {/* Stats */}
      <section className="rounded-2xl p-5" style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-surface)" }}>
        <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--th-text-heading)" }}>
          {tr("조직 DNA 현황", "Organization DNA", "組織DNA", "组织 DNA 概览")}
        </h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { v: stats.total, l: tr("생명체", "Life Forms", "生命体", "数字生命体") },
            { v: stats.skills, l: tr("학습 스킬", "Learned Skills", "学習スキル", "已学技能") },
            { v: stats.providers, l: tr("유전자형", "Gene Types", "遺伝子型", "基因类型") },
            { v: stats.byS.mature + stats.byS.active, l: tr("가동 중", "Operational", "稼働中", "可工作") },
          ].map((item) => (
            <div key={item.l} className="rounded-lg px-3 py-3 text-center" style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-elevated)" }}>
              <div className="text-2xl font-bold" style={{ color: "var(--th-text-heading)" }}>{item.v}</div>
              <div className="text-xs mt-1" style={{ color: "var(--th-text-muted)" }}>{item.l}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          {(Object.keys(STATUS_CFG) as DNAEvolutionStatus[]).map((s) => (
            <div key={s} className="flex items-center gap-1.5 text-xs">
              <span>{STATUS_CFG[s].icon}</span>
              <span className={STATUS_CFG[s].color}>{tr(STATUS_CFG[s].zh, STATUS_CFG[s].en)}: {stats.byS[s]}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Pipeline */}
      {(activeJobs.length > 0 || recentDone.length > 0) && (
        <section className="rounded-2xl p-5" style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-surface)" }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--th-text-heading)" }}>
            {tr("DNA 파이프라인", "DNA Pipeline", "DNAパイプライン", "DNA 蒸馏管线")}
          </h3>
          {activeJobs.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-medium mb-2" style={{ color: "var(--th-text-secondary)" }}>
                {tr("진행 중", "In Progress", "進行中", "进行中")} ({activeJobs.length})
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {activeJobs.map((j) => (
                  <div key={j.id} className="rounded-lg px-3 py-2 flex items-center gap-2"
                    style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-elevated)" }}>
                    <span className="text-amber-400 text-xs">{"●"}</span>
                    <div className="text-xs truncate" style={{ color: "var(--th-text-primary)" }}>
                      {j.provider} {"←"} {j.skill_label || j.repo.split("/").pop()}
                    </div>
                    <div className="text-xs ml-auto" style={{ color: "var(--th-text-muted)" }}>{j.status}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {recentDone.length > 0 && (
            <div>
              <div className="text-xs font-medium mb-2" style={{ color: "var(--th-text-secondary)" }}>
                {tr("최근 완료", "Recent", "最近完了", "最近完成")}
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {recentDone.map((j) => (
                  <div key={j.id} className="rounded-lg px-3 py-2 flex items-center gap-2"
                    style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-elevated)" }}>
                    <span className="text-emerald-400 text-xs">{"✓"}</span>
                    <div className="text-xs truncate" style={{ color: "var(--th-text-primary)" }}>
                      {j.provider} {"←"} {j.skill_label || j.repo.split("/").pop()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* DNA Grid */}
      <section className="rounded-2xl p-5" style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-surface)" }}>
        <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--th-text-heading)" }}>
          {tr("디지털 생명체", "Digital Life Forms", "デジタル生命体", "数字生命体")}
          <span className="ml-2 font-normal text-xs" style={{ color: "var(--th-text-muted)" }}>({profiles.length})</span>
        </h3>
        {profiles.length === 0 ? (
          <div className="text-sm py-8 text-center" style={{ color: "var(--th-text-muted)" }}>
            {tr("생명체 없음. 업종 초상화에서 팀을 먼저 생성하세요.", "No life forms yet. Create a team from Industry Portrait.", "生命体なし。業界ポートレートからチームを作成してください。", "暂无数字生命体，请先在行业自画像中创建团队。")}
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {profiles.map((p) => {
              const sc = STATUS_CFG[p.evolution_status];
              const sel = selectedId === p.agent_id;
              return (
                <button type="button" key={p.agent_id}
                  onClick={() => setSelectedId(sel ? null : p.agent_id)}
                  className="rounded-lg px-3 py-3 text-left transition-all"
                  style={{ border: sel ? "2px solid var(--th-btn-primary-bg)" : "1px solid var(--th-border)", background: "var(--th-bg-elevated)" }}>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{p.avatar_emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: "var(--th-text-primary)" }}>{p.agent_name}</div>
                      <div className="text-xs" style={{ color: "var(--th-text-muted)" }}>{p.provider} · {p.department} · {p.role}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs">{sc.icon}</span>
                      <span className={`text-xs font-medium ${sc.color}`}>{tr(sc.zh, sc.en)}</span>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.work.core_skills.slice(0, 4).map((sk) => (
                      <span key={sk} className="rounded px-1.5 py-0.5 text-xs" style={{ background: "var(--th-bg-surface)", color: "var(--th-text-secondary)" }}>{sk}</span>
                    ))}
                    {p.work.core_skills.length > 4 && (
                      <span className="text-xs" style={{ color: "var(--th-text-muted)" }}>+{p.work.core_skills.length - 4}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Detail Panel */}
      {selected && (
        <section className="rounded-2xl p-5" style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-surface)" }}>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">{selected.avatar_emoji}</span>
            <div>
              <h3 className="text-base font-semibold" style={{ color: "var(--th-text-heading)" }}>{selected.agent_name}</h3>
              <div className="text-xs" style={{ color: "var(--th-text-muted)" }}>
                {selected.provider} · {selected.department} · v{selected.dna_version}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <span>{STATUS_CFG[selected.evolution_status].icon}</span>
              <span className={`text-sm font-medium ${STATUS_CFG[selected.evolution_status].color}`}>
                {tr(STATUS_CFG[selected.evolution_status].zh, STATUS_CFG[selected.evolution_status].en)}
              </span>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {/* Persona DNA */}
            <div className="rounded-lg p-3" style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-elevated)" }}>
              <div className="text-xs font-semibold mb-2" style={{ color: "var(--th-text-heading)" }}>
                {"🎭 "}{tr("페르소나 DNA", "Persona DNA", "ペルソナDNA", "人格 DNA")}
              </div>
              <div className="space-y-1 text-xs" style={{ color: "var(--th-text-secondary)" }}>
                <div><b>{tr("특성", "Traits", "特性", "特征")}:</b> {selected.persona.traits.join(", ")}</div>
                <div><b>{tr("소통", "Comm", "通信", "沟通")}:</b> {selected.persona.communication_style}</div>
                <div><b>{tr("스트레스", "Stress", "ストレス", "压力")}:</b> {selected.persona.stress_response}</div>
                <div><b>{tr("협업", "Collab", "協業", "协作")}:</b> {selected.persona.collaboration_preference}</div>
                <div><b>{tr("문화", "Culture", "文化", "文化")}:</b> {selected.persona.culture_tag}</div>
              </div>
            </div>

            {/* Work DNA */}
            <div className="rounded-lg p-3" style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-elevated)" }}>
              <div className="text-xs font-semibold mb-2" style={{ color: "var(--th-text-heading)" }}>
                {"⚙️ "}{tr("업무 DNA", "Work DNA", "業務DNA", "工作 DNA")}
              </div>
              <div className="space-y-1 text-xs" style={{ color: "var(--th-text-secondary)" }}>
                <div><b>{tr("핵심능력", "Skills", "スキル", "核心能力")}:</b> {selected.work.core_skills.slice(0, 5).join(", ")}{selected.work.core_skills.length > 5 ? ` +${selected.work.core_skills.length - 5}` : ""}</div>
                <div><b>{tr("분석", "Analysis", "分析", "分析框架")}:</b> {selected.work.analysis_framework}</div>
                <div><b>{tr("분해", "Decompose", "分解", "任务拆解")}:</b> {selected.work.task_decomposition_style}</div>
                <div><b>{tr("산출물", "Delivery", "成果物", "交付方式")}:</b> {selected.work.delivery_template}</div>
                <div><b>{tr("도구", "Tools", "ツール", "工具")}:</b> {selected.work.tools.join(", ")}</div>
              </div>
            </div>

            {/* Decision DNA */}
            <div className="rounded-lg p-3" style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-elevated)" }}>
              <div className="text-xs font-semibold mb-2" style={{ color: "var(--th-text-heading)" }}>
                {"🎯 "}{tr("의사결정 DNA", "Decision DNA", "意思決定DNA", "决策 DNA")}
              </div>
              <div className="space-y-1 text-xs" style={{ color: "var(--th-text-secondary)" }}>
                <div><b>{tr("리스크", "Risk", "リスク", "风险偏好")}:</b> {selected.decision.risk_preference}</div>
                <div><b>{tr("우선순위", "Priority", "優先", "优先级")}:</b> {selected.decision.priority_style}</div>
                <div><b>{tr("근거", "Basis", "根拠", "决策依据")}:</b> {selected.decision.decision_basis.join(", ")}</div>
                <div><b>{tr("트레이드오프", "Tradeoff", "トレードオフ", "取舍逻辑")}:</b> {selected.decision.tradeoff_logic}</div>
              </div>
            </div>

            {/* Memory DNA */}
            <div className="rounded-lg p-3" style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-elevated)" }}>
              <div className="text-xs font-semibold mb-2" style={{ color: "var(--th-text-heading)" }}>
                {"💾 "}{tr("기억 DNA", "Memory DNA", "記憶DNA", "记忆 DNA")}
              </div>
              <div className="space-y-1 text-xs" style={{ color: "var(--th-text-secondary)" }}>
                <div><b>{tr("학습 스킬", "Learned", "学習済み", "已学技能")}:</b> {selected.memory.learned_skill_count}</div>
                <div><b>{tr("완료 작업", "Tasks Done", "完了タスク", "完成任务")}:</b> {selected.memory.task_completed_count}</div>
              </div>
            </div>

            {/* Relationship DNA */}
            <div className="rounded-lg p-3" style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-elevated)" }}>
              <div className="text-xs font-semibold mb-2" style={{ color: "var(--th-text-heading)" }}>
                {"🤝 "}{tr("관계 DNA", "Relationship DNA", "関係DNA", "协作 DNA")}
              </div>
              <div className="space-y-1 text-xs" style={{ color: "var(--th-text-secondary)" }}>
                <div><b>{tr("리더십", "Leadership", "リーダーシップ", "领导风格")}:</b> {selected.relationship.leadership_style}</div>
                <div><b>{tr("피드백", "Feedback", "フィードバック", "反馈方式")}:</b> {selected.relationship.feedback_style}</div>
                <div><b>{tr("위임", "Delegation", "委任", "委派偏好")}:</b> {selected.relationship.delegation_preference}</div>
                <div><b>{tr("갈등해결", "Conflict", "紛争解決", "冲突处理")}:</b> {selected.relationship.conflict_resolution}</div>
              </div>
            </div>

            {/* Sources */}
            <div className="rounded-lg p-3" style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-elevated)" }}>
              <div className="text-xs font-semibold mb-2" style={{ color: "var(--th-text-heading)" }}>
                {"📦 "}{tr("DNA 소스", "DNA Sources", "DNAソース", "DNA 来源")}
              </div>
              <div className="space-y-1 text-xs" style={{ color: "var(--th-text-secondary)" }}>
                {SKILL_REPOS.map((r) => (
                  <div key={r.url}>{"→ "}{r.label}</div>
                ))}
                {selected.sources.length === 0 && (
                  <div style={{ color: "var(--th-text-muted)" }}>
                    {tr("증류를 시작하면 소스가 연결됩니다.", "Start distillation to connect sources.", "蒸留開始でソース接続。", "开始蒸馏后将连接能力来源。")}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
