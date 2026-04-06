import { useMemo, useState } from "react";
import * as api from "../api";
import { useI18n } from "../i18n";
import type { Agent, Department, WorkflowPackKey } from "../types";
import type { SkillLearnProvider } from "../api/workflow-skills-subtasks";
import { detectAvailableProviders, resolveProvider } from "../api/dify-workflow";
import SmartCompanyBuilder from "./SmartCompanyBuilder";

type IndustryStage = "seed" | "growth" | "mature";
type SkillFocus = "sales" | "delivery" | "compliance" | "ai_automation" | "customer_success";

type BlueprintRole = {
  roleKey: string;
  title: string;
  departmentHint: "planning" | "development" | "design" | "qa" | "devsecops" | "operations";
  role: "team_leader" | "senior" | "junior";
  provider: "claude" | "codex" | "gemini" | "opencode" | "kimi" | "copilot" | "antigravity" | "api";
  skills: string[];
  critical: boolean;
};

type Props = {
  departments: Department[];
  agents: Agent[];
  activeOfficeWorkflowPack: WorkflowPackKey;
  onAgentsChange: () => void;
};

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function findDepartmentId(departments: Department[], hint: BlueprintRole["departmentHint"]): string | null {
  const byId = departments.find((dept) => normalizeText(dept.id).includes(hint));
  if (byId) return byId.id;

  const keywordMap: Record<BlueprintRole["departmentHint"], string[]> = {
    planning: ["plan", "planning", "기획", "企划", "规划"],
    development: ["dev", "development", "개발", "开发"],
    design: ["design", "디자인", "设计"],
    qa: ["qa", "qc", "quality", "품질", "质检"],
    devsecops: ["devsecops", "sec", "ops", "보안", "安全"],
    operations: ["operation", "ops", "운영", "运营"],
  };

  const matched = departments.find((dept) => {
    const bucket = `${dept.id} ${dept.name} ${dept.name_ko ?? ""} ${dept.name_ja ?? ""} ${dept.name_zh ?? ""}`.toLowerCase();
    return keywordMap[hint].some((word) => bucket.includes(word));
  });

  return matched?.id ?? departments[0]?.id ?? null;
}

function buildIndustryRoles(industry: string, stage: IndustryStage, focus: SkillFocus[]): BlueprintRole[] {
  const normalizedIndustry = normalizeText(industry);
  const isMedical = /(med|health|clinic|hospital|医疗|医药)/.test(normalizedIndustry);
  const isEducation = /(edu|school|training|课程|教育)/.test(normalizedIndustry);
  const isRetail = /(retail|ecommerce|shop|电商|零售)/.test(normalizedIndustry);
  const isManufacturing = /(manufact|factory|supply|制造|工厂)/.test(normalizedIndustry);

  const shared: BlueprintRole[] = [
    {
      roleKey: "strategy-lead",
      title: "Strategy Lead",
      departmentHint: "planning",
      role: "team_leader",
      provider: "claude",
      skills: ["industry research", "roadmap", "decision framework"],
      critical: true,
    },
    {
      roleKey: "delivery-lead",
      title: "Delivery Lead",
      departmentHint: "development",
      role: "team_leader",
      provider: "codex",
      skills: ["execution planning", "process orchestration", "risk control"],
      critical: true,
    },
    {
      roleKey: "quality-guard",
      title: "Quality Guard",
      departmentHint: "qa",
      role: "senior",
      provider: "gemini",
      skills: ["qa audit", "acceptance checklist", "stability review"],
      critical: true,
    },
    {
      roleKey: "operations-anchor",
      title: "Operations Anchor",
      departmentHint: "operations",
      role: "senior",
      provider: "claude",
      skills: ["operations runbook", "incident response", "handover routine"],
      critical: true,
    },
    {
      roleKey: "design-architect",
      title: "Design Architect",
      departmentHint: "design",
      role: "senior",
      provider: "opencode",
      skills: ["ux clarity", "workflow simplification", "visual language"],
      critical: false,
    },
    {
      roleKey: "security-operator",
      title: "Security Operator",
      departmentHint: "devsecops",
      role: "senior",
      provider: "copilot",
      skills: ["compliance control", "access policy", "secrets handling"],
      critical: true,
    },
  ];

  const industrySpecific: BlueprintRole[] = isMedical
    ? [
        {
          roleKey: "clinical-ops",
          title: "Clinical Ops Specialist",
          departmentHint: "operations",
          role: "junior",
          provider: "claude",
          skills: ["patient workflow", "medical regulation", "service quality"],
          critical: false,
        },
      ]
    : isEducation
      ? [
          {
            roleKey: "learning-experience",
            title: "Learning Experience Specialist",
            departmentHint: "design",
            role: "junior",
            provider: "gemini",
            skills: ["content structure", "learner journey", "retention design"],
            critical: false,
          },
        ]
      : isRetail
        ? [
            {
              roleKey: "commerce-ops",
              title: "Commerce Ops Specialist",
              departmentHint: "operations",
              role: "junior",
              provider: "codex",
              skills: ["funnel optimization", "campaign rhythm", "conversion loop"],
              critical: false,
            },
          ]
        : isManufacturing
          ? [
              {
                roleKey: "supply-analyst",
                title: "Supply Chain Analyst",
                departmentHint: "planning",
                role: "junior",
                provider: "claude",
                skills: ["supply forecast", "resource planning", "capacity management"],
                critical: false,
              },
            ]
          : [
              {
                roleKey: "industry-analyst",
                title: "Industry Analyst",
                departmentHint: "planning",
                role: "junior",
                provider: "gemini",
                skills: ["market mapping", "customer segmentation", "competitive signal"],
                critical: false,
              },
            ];

  const focusRoles: BlueprintRole[] = focus.includes("sales")
    ? [
        {
          roleKey: "growth-operator",
          title: "Growth Operator",
          departmentHint: "operations",
          role: "junior",
          provider: "claude",
          skills: ["pipeline management", "lead scoring", "deal cadence"],
          critical: false,
        },
      ]
    : [];

  if (focus.includes("ai_automation")) {
    focusRoles.push({
      roleKey: "automation-engineer",
      title: "Automation Engineer",
      departmentHint: "development",
      role: "senior",
      provider: "codex",
      skills: ["agent workflow", "prompt engineering", "tool integration"],
      critical: true,
    });
  }

  if (focus.includes("customer_success")) {
    focusRoles.push({
      roleKey: "customer-success",
      title: "Customer Success Partner",
      departmentHint: "operations",
      role: "junior",
      provider: "claude",
      skills: ["client onboarding", "adoption plan", "retention feedback"],
      critical: false,
    });
  }

  if (focus.includes("compliance")) {
    focusRoles.push({
      roleKey: "compliance-analyst",
      title: "Compliance Analyst",
      departmentHint: "devsecops",
      role: "junior",
      provider: "copilot",
      skills: ["policy checklist", "audit trace", "regulation monitoring"],
      critical: true,
    });
  }

  const growthExpansion: BlueprintRole[] =
    stage === "growth" || stage === "mature"
      ? [
          {
            roleKey: "delivery-coordinator",
            title: "Delivery Coordinator",
            departmentHint: "operations",
            role: "junior",
            provider: "claude",
            skills: ["cross-team sync", "handover discipline", "service continuity"],
            critical: false,
          },
        ]
      : [];

  if (stage === "mature") {
    growthExpansion.push({
      roleKey: "platform-reliability",
      title: "Platform Reliability Engineer",
      departmentHint: "devsecops",
      role: "senior",
      provider: "opencode",
      skills: ["platform resilience", "failover", "runbook automation"],
      critical: true,
    });
  }

  return [...shared, ...industrySpecific, ...focusRoles, ...growthExpansion];
}

export default function IndustryPortraitView({ departments, agents, activeOfficeWorkflowPack, onAgentsChange }: Props) {
  const { t, language } = useI18n();
  const [open, setOpen] = useState(false);
  const [industry, setIndustry] = useState("");
  const [stage, setStage] = useState<IndustryStage>("growth");
  const [teamSize, setTeamSize] = useState(18);
  const [focus, setFocus] = useState<SkillFocus[]>(["delivery", "ai_automation"]);
  const [submitting, setSubmitting] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [learningSkills, setLearningSkills] = useState(false);

  const tr = (ko: string, en: string, ja = en, zh = en) => t({ ko, en, ja, zh });
  const effectiveIndustry = industry.trim() || tr("일반", "General", "一般", "通用");

  const blueprint = useMemo(
    () => buildIndustryRoles(effectiveIndustry, stage, focus),
    [effectiveIndustry, focus, stage],
  );

  const criticalCount = useMemo(() => blueprint.filter((role) => role.critical).length, [blueprint]);

  const SKILL_LEARN_PROVIDERS: Set<string> = new Set(["claude", "codex", "gemini", "opencode", "kimi"]);

  const getTeamLearnProviders = (): SkillLearnProvider[] => {
    const providerSet = new Set<string>();
    for (const agent of agents) {
      if (SKILL_LEARN_PROVIDERS.has(agent.cli_provider)) {
        providerSet.add(agent.cli_provider);
      }
    }
    return Array.from(providerSet) as SkillLearnProvider[];
  };

  const createCompanyTeam = async () => {
    if (!industry.trim()) {
      setResultMessage(tr("업종을 입력해 주세요.", "Please enter an industry.", "業種を入力してください。", "请输入行业。"));
      return;
    }

    setSubmitting(true);
    setResultMessage(null);

    try {
      const existingNames = new Set(agents.map((agent) => normalizeText(agent.name)));
      const targetCount = Math.max(teamSize, blueprint.length + criticalCount);
      const hires: Array<Promise<Agent>> = [];
      const mentorPool = blueprint.filter((entry) => entry.role !== "junior").map((entry) => entry.title);

      let seed = 1;
      const entriesForCreation: Array<{ role: BlueprintRole; isBackup: boolean; serial: number }> = [];
      for (const role of blueprint) {
        entriesForCreation.push({ role, isBackup: false, serial: seed++ });
        if (role.critical) {
          entriesForCreation.push({ role, isBackup: true, serial: seed++ });
        }
      }

      while (entriesForCreation.length < targetCount) {
        const reused = blueprint[entriesForCreation.length % blueprint.length];
        entriesForCreation.push({ role: reused, isBackup: false, serial: seed++ });
      }

      const industryTag = effectiveIndustry.replace(/\s+/g, "-").slice(0, 18).toLowerCase();
      for (const entry of entriesForCreation) {
        const deptId = findDepartmentId(departments, entry.role.departmentHint);
        if (!deptId) continue;

        const baseName = `${effectiveIndustry} ${entry.role.title} ${entry.serial}`;
        const uniqueName = existingNames.has(normalizeText(baseName)) ? `${baseName}-${Date.now() % 1000}` : baseName;
        existingNames.add(normalizeText(uniqueName));

        const mentor = mentorPool[entry.serial % Math.max(mentorPool.length, 1)] || entry.role.title;
        const resilienceNote = entry.role.critical
          ? `critical-role=true;backup-track=${entry.isBackup ? "secondary" : "primary"}`
          : "critical-role=false";

        hires.push(
          api.createAgent({
            name: uniqueName,
            name_ko: uniqueName,
            name_ja: uniqueName,
            name_zh: uniqueName,
            department_id: deptId,
            role: entry.role.role,
            cli_provider: resolveProvider(entry.role.provider, detectAvailableProviders(agents)),
            avatar_emoji: entry.isBackup ? "🧩" : "🧠",
            personality:
              `[IndustryPortrait]\nindustry=${effectiveIndustry}\nindustry_tag=${industryTag}\njob=${entry.role.title}\n` +
              `skills=${entry.role.skills.join(", ")}\nmentor=${mentor}\npeer-learning=true\n` +
              `${resilienceNote}\nworkflow_pack=${activeOfficeWorkflowPack}`,
            workflow_pack_key: activeOfficeWorkflowPack,
          }),
        );
      }

      await Promise.all(hires);
      onAgentsChange();
      setResultMessage(
        tr(
          `완료: ${effectiveIndustry} 업종 팀 생성 (${entriesForCreation.length}명, 핵심직무 이중화 ${criticalCount}개)`,
          `Done: ${effectiveIndustry} team generated (${entriesForCreation.length} staff, ${criticalCount} critical-role backups).`,
          `${effectiveIndustry} チームを作成しました（${entriesForCreation.length}名、重要職務冗長化 ${criticalCount} 件）。`,
          `已完成：${effectiveIndustry} 团队已生成（${entriesForCreation.length} 人，关键岗位双备份 ${criticalCount} 项）。`,
        ),
      );
      setOpen(false);
    } catch (error) {
      console.error("Industry team generation failed:", error);
      setResultMessage(tr("생성 중 오류가 발생했습니다.", "Failed to generate the team.", "生成中にエラーが発生しました。", "生成团队失败。"));
    } finally {
      setSubmitting(false);
    }
  };

  const importColleagueSkills = async () => {
    const providers = getTeamLearnProviders();
    if (providers.length === 0) {
      setResultMessage(
        tr(
          "현재 팀에 스킬 학습이 가능한 에이전트가 없습니다. 먼저 에이전트를 생성하세요.",
          "No agents with learnable providers in current team. Please create agents first.",
          "現在のチームに学習可能なエージェントがいません。先にエージェントを作成してください。",
          "当前团队没有可学习技能的员工，请先创建员工。",
        ),
      );
      return;
    }

    setLearningSkills(true);
    setResultMessage(null);
    try {
      await api.startSkillLearning({
        repo: "https://github.com/titanwings/colleague-skill",
        providers,
      });
      await api.startSkillLearning({
        repo: "https://github.com/beita6969/ScienceClaw",
        providers,
      });

      setResultMessage(
        tr(
          `동료 스킬 학습 잡을 큐에 등록했습니다. 대상: ${providers.join(", ")}`,
          `Queued skill distillation for team providers: ${providers.join(", ")}. Check Skills page for progress.`,
          `同僚スキル学習ジョブをキュー登録しました。対象: ${providers.join(", ")}`,
          `已向团队发起技能蒸馏，学习对象：${providers.join("、")}。可在 Skills 页面查看进度。`,
        ),
      );
    } catch (error) {
      console.error("Skill learning enqueue failed:", error);
      setResultMessage(
        tr(
          "스킬 학습 등록에 실패했습니다. CLI 인증 상태를 확인해 주세요.",
          "Failed to queue skill learning. Please verify CLI auth status.",
          "スキル学習登録に失敗しました。CLI 認証状態を確認してください。",
          "技能学习入队失败，请检查 CLI 认证状态。",
        ),
      );
    } finally {
      setLearningSkills(false);
    }
  };

  const focusOptions: Array<{ key: SkillFocus; label: string }> = [
    { key: "delivery", label: tr("交付", "Delivery", "デリバリー", "交付") },
    { key: "sales", label: tr("销售", "Sales", "営業", "销售") },
    { key: "compliance", label: tr("合规", "Compliance", "コンプライアンス", "合规") },
    { key: "ai_automation", label: tr("AI 自动化", "AI Automation", "AI自動化", "AI 自动化") },
    { key: "customer_success", label: tr("客户成功", "Customer Success", "カスタマーサクセス", "客户成功") },
  ];

  return (
    <div className="space-y-4">
      <section className="rounded-2xl p-5" style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-surface)" }}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-lg font-semibold" style={{ color: "var(--th-text-heading)" }}>
              {tr("行业自画像建司", "Industry Portrait Setup", "業界ポートレート設定", "行业自画像建司")}
            </h2>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--th-text-secondary)" }}>
              {tr(
                "普通用户只需输入行业，即可自动生成岗位与员工。系统会默认做关键岗位双备份，减少核心人员离开后的中断风险。",
                "Enter an industry and generate positions + employees automatically. Critical roles get backup staffing by default for continuity.",
                "業界を入力するだけで職種と社員を自動生成します。重要職務は既定でバックアップ配置し、離脱リスクを抑えます。",
                "输入行业即可自动生成岗位与员工，并默认给关键岗位做双备份，降低核心人员离开导致停摆的风险。",
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-lg px-3 py-2 text-sm font-medium"
              style={{ background: "var(--th-btn-primary-bg)", color: "var(--th-btn-primary-text)" }}
            >
              {tr("开始自画像", "Start Portrait", "ポートレート開始", "开始自画像")}
            </button>
            <button
              type="button"
              onClick={() => {
                void importColleagueSkills();
              }}
              disabled={learningSkills}
              className="rounded-lg px-3 py-2 text-sm font-medium"
              style={{ border: "1px solid var(--th-border)", color: "var(--th-text-primary)" }}
            >
              {learningSkills
                ? tr("导入中...", "Importing...", "取込中...", "导入中...")
                : tr("导入同事 Skills", "Import Colleague Skills", "同僚Skills取込", "导入同事 Skills")}
            </button>
          </div>
        </div>

        {resultMessage && (
          <div className="mt-4 rounded-lg px-3 py-2 text-sm" style={{ border: "1px solid var(--th-border)", color: "var(--th-text-secondary)" }}>
            {resultMessage}
          </div>
        )}
      </section>

      <section className="rounded-2xl p-5" style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-surface)" }}>
        <h3 className="text-sm font-semibold" style={{ color: "var(--th-text-heading)" }}>
          {tr("当前生成预览", "Current Blueprint Preview", "現在の生成プレビュー", "当前生成预览")}
        </h3>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {blueprint.slice(0, 12).map((item) => (
            <div
              key={item.roleKey}
              className="rounded-lg px-3 py-2"
              style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-elevated)" }}
            >
              <div className="text-sm font-medium" style={{ color: "var(--th-text-primary)" }}>
                {item.title}
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--th-text-muted)" }}>
                {item.skills.join(" · ")}
              </div>
            </div>
          ))}
        </div>
      </section>


      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "var(--th-modal-overlay)" }}>
          <div
            className="w-full max-w-2xl rounded-2xl p-5"
            style={{ border: "1px solid var(--th-border)", background: "var(--th-card-bg)" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold" style={{ color: "var(--th-text-heading)" }}>
                {tr("行业自画像", "Industry Portrait", "業界ポートレート", "行业自画像")}
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded px-2 py-1 text-sm"
                style={{ color: "var(--th-text-muted)" }}
              >
                ×
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm">
                <div className="mb-1" style={{ color: "var(--th-text-secondary)" }}>
                  {tr("行业", "Industry", "業界", "行业")}
                </div>
                <input
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder={tr("例如：医疗 / 电商 / 教育", "e.g. medical / ecommerce / education")}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: "1px solid var(--th-input-border)", background: "var(--th-input-bg)", color: "var(--th-text-primary)" }}
                />
              </label>

              <label className="text-sm">
                <div className="mb-1" style={{ color: "var(--th-text-secondary)" }}>
                  {tr("公司阶段", "Company Stage", "会社ステージ", "公司阶段")}
                </div>
                <select
                  value={stage}
                  onChange={(e) => setStage(e.target.value as IndustryStage)}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: "1px solid var(--th-input-border)", background: "var(--th-input-bg)", color: "var(--th-text-primary)" }}
                >
                  <option value="seed">{tr("初创", "Seed", "シード", "初创")}</option>
                  <option value="growth">{tr("增长", "Growth", "グロース", "增长")}</option>
                  <option value="mature">{tr("成熟", "Mature", "成熟", "成熟")}</option>
                </select>
              </label>

              <label className="text-sm md:col-span-2">
                <div className="mb-1" style={{ color: "var(--th-text-secondary)" }}>
                  {tr("团队人数", "Team Size", "チーム人数", "团队人数")}
                </div>
                <input
                  type="number"
                  min={6}
                  max={80}
                  value={teamSize}
                  onChange={(e) => setTeamSize(Math.max(6, Math.min(80, Number(e.target.value || 6))))}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: "1px solid var(--th-input-border)", background: "var(--th-input-bg)", color: "var(--th-text-primary)" }}
                />
              </label>

              <div className="md:col-span-2">
                <div className="mb-2 text-sm" style={{ color: "var(--th-text-secondary)" }}>
                  {tr("优先能力", "Skill Focus", "優先スキル", "优先能力")}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {focusOptions.map((item) => {
                    const checked = focus.includes(item.key);
                    return (
                      <label
                        key={item.key}
                        className="flex items-center gap-2 rounded-lg px-3 py-2"
                        style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-elevated)" }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setFocus((prev) => {
                              if (prev.includes(item.key)) return prev.filter((x) => x !== item.key);
                              return [...prev, item.key];
                            });
                          }}
                        />
                        <span className="text-sm" style={{ color: "var(--th-text-primary)" }}>
                          {item.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div className="text-xs" style={{ color: "var(--th-text-muted)" }}>
                {tr("关键岗位自动双备份，保证人员变动后公司持续运转。", "Critical roles are duplicated by default for continuity.")}
              </div>
              <button
                type="button"
                onClick={() => {
                  void createCompanyTeam();
                }}
                disabled={submitting}
                className="rounded-lg px-4 py-2 text-sm font-medium"
                style={{ background: "var(--th-btn-primary-bg)", color: "var(--th-btn-primary-text)" }}
              >
                {submitting
                  ? tr("生成中...", "Generating...", "生成中...", "生成中...")
                  : tr("一键生成公司", "Generate Company", "会社を生成", "一键生成公司")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 智能建司（自然语言 + Dify/本地 AI 分析）── */}
      <SmartCompanyBuilder
        departments={departments}
        agents={agents}
        activeOfficeWorkflowPack={activeOfficeWorkflowPack}
        onAgentsChange={onAgentsChange}
      />

      <div className="text-xs" style={{ color: "var(--th-text-muted)" }}>
        {tr("语言：", "Language:", "言語:", "语言：")}
        {language.toUpperCase()}
      </div>
    </div>
  );
}
