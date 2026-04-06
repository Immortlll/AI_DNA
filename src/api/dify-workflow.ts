/**
 * Dify Workflow API 集成 + Agent 自主分析 + 本地关键词引擎
 *
 * 三通道智能分析：Agent → Dify → 本地兜底
 *
 * 配置方式：
 *   - Dify: localStorage 中设置 dify_api_base 和 dify_api_key
 *   - Agent: 需要团队中有可用的 AI Agent（如 Claude）
 */

import * as orgApi from "./organization-projects";
import type { Agent } from "../types";

// ── 类型定义 ─────────────────────────────────────────────────────────────────

export interface RoleBlueprint {
  roleKey: string;
  title: string;
  titleZh: string;
  departmentHint: "planning" | "development" | "design" | "qa" | "devsecops" | "operations";
  role: "team_leader" | "senior" | "junior";
  provider: "claude" | "codex" | "gemini" | "opencode" | "kimi" | "copilot" | "antigravity" | "api";
  skills: string[];
  critical: boolean;
  reason: string;
}

export interface GapItem {
  area: string;
  description: string;
  severity: "high" | "medium" | "low";
  suggestion: string;
}

export interface AnalysisResult {
  industry: string;
  industryZh: string;
  summary: string;
  roles: RoleBlueprint[];
  gaps: GapItem[];
  risks: string[];
  source: "dify" | "local" | "agent";
}

// ── Provider 可用性检测 ──────────────────────────────────────────────────────

/** 所有已知 CLI provider（按优先级排序） */
const ALL_PROVIDERS: RoleBlueprint["provider"][] = [
  "claude", "gemini", "codex", "opencode", "kimi", "copilot", "antigravity", "api",
];

/**
 * 从已有 agent 列表中提取系统上实际可用的 provider。
 * 如果没有任何已有 agent，返回 fallback 默认值 ["gemini"]。
 */
export function detectAvailableProviders(existingAgents: Agent[]): Set<string> {
  const used = new Set<string>();
  for (const a of existingAgents) {
    if (a.cli_provider && a.status !== "offline") {
      used.add(a.cli_provider);
    }
  }
  // 如果系统没有任何已有 agent，至少返回 gemini 作为安全默认
  if (used.size === 0) used.add("gemini");
  return used;
}

/**
 * 将模板指定的 provider 映射到实际可用的 provider。
 * 优先使用模板指定的；不可用时按优先级选第一个可用的。
 */
export function resolveProvider(
  desired: RoleBlueprint["provider"],
  available: Set<string>,
): RoleBlueprint["provider"] {
  if (available.has(desired)) return desired;
  for (const p of ALL_PROVIDERS) {
    if (available.has(p)) return p;
  }
  return "gemini"; // 最终兜底
}

// ── Dify 配置 ────────────────────────────────────────────────────────────────

const DIFY_STORAGE_BASE_KEY = "dify_api_base";
const DIFY_STORAGE_KEY_KEY = "dify_api_key";

export function getDifyConfig(): { base: string; key: string } | null {
  try {
    const base = localStorage.getItem(DIFY_STORAGE_BASE_KEY)?.trim();
    const key = localStorage.getItem(DIFY_STORAGE_KEY_KEY)?.trim();
    if (base && key) return { base, key };
  } catch { /* ignore */ }
  return null;
}

export function setDifyConfig(base: string, key: string): void {
  try {
    localStorage.setItem(DIFY_STORAGE_BASE_KEY, base.trim());
    localStorage.setItem(DIFY_STORAGE_KEY_KEY, key.trim());
  } catch { /* ignore */ }
}

export function isDifyConfigured(): boolean {
  return getDifyConfig() !== null;
}

// ── Dify Workflow 调用 ───────────────────────────────────────────────────────

const DIFY_SYSTEM_PROMPT = `你是一个企业组织架构分析专家。用户会描述他们想创建的公司类型和需要的岗位。
请分析需求，输出严格的JSON格式（不要有任何其他文字）：
{
  "industry": "英文行业名",
  "industryZh": "中文行业名",
  "summary": "一段话总结分析结论",
  "roles": [
    {
      "roleKey": "唯一标识(kebab-case)",
      "title": "英文岗位名",
      "titleZh": "中文岗位名",
      "departmentHint": "planning|development|design|qa|devsecops|operations",
      "role": "team_leader|senior|junior",
      "provider": "claude|codex|gemini|opencode|kimi",
      "skills": ["技能1", "技能2", "技能3"],
      "critical": true/false,
      "reason": "为什么需要这个岗位"
    }
  ],
  "gaps": [
    {
      "area": "缺口领域",
      "description": "问题描述",
      "severity": "high|medium|low",
      "suggestion": "建议"
    }
  ],
  "risks": ["风险点1", "风险点2"]
}

规则：
- provider根据岗位特性分配：创意类用claude，技术开发用codex，分析研究用gemini，工具集成用opencode，内容生成用kimi
- departmentHint 必须是上述6个之一，按岗位属性合理映射
- critical=true 的岗位会自动双备份
- 至少分析3个潜在缺口
- 至少列出2个风险点`;

export async function callDifyWorkflow(userDescription: string): Promise<AnalysisResult | null> {
  const config = getDifyConfig();
  if (!config) return null;

  try {
    const response = await fetch(`${config.base}/v1/chat-messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.key}`,
      },
      body: JSON.stringify({
        inputs: {},
        query: `${DIFY_SYSTEM_PROMPT}\n\n用户需求：\n${userDescription}`,
        response_mode: "blocking",
        user: "dna-manufacturer",
      }),
    });

    if (!response.ok) {
      console.error("Dify API error:", response.status, await response.text().catch(() => ""));
      return null;
    }

    const data = await response.json();
    const answer: string = data?.answer ?? data?.data?.outputs?.text ?? "";

    // 从回复中提取 JSON
    const jsonMatch = answer.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Dify response has no JSON:", answer.slice(0, 200));
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as Omit<AnalysisResult, "source">;
    return { ...parsed, source: "dify" };
  } catch (err) {
    console.error("Dify workflow call failed:", err);
    return null;
  }
}

// ── 本地关键词解析引擎（兜底方案）──────────────────────────────────────────

interface RoleTemplate {
  keywords: RegExp;
  role: Omit<RoleBlueprint, "roleKey">;
}

const ROLE_TEMPLATES: RoleTemplate[] = [
  // ── 二次元/游戏/动漫 ──
  {
    keywords: /3[dD]建模|3[dD]模型|建模师|3[dD]\s*model/i,
    role: { title: "3D Modeler", titleZh: "3D建模师", departmentHint: "design", role: "senior", provider: "codex", skills: ["3D modeling", "Blender/Maya", "rigging", "texturing"], critical: true, reason: "核心生产力岗位，直接决定产品质量" },
  },
  {
    keywords: /化妆|妆容|美妆|makeup|cosmetic/i,
    role: { title: "Digital Makeup Artist", titleZh: "数字化妆师", departmentHint: "design", role: "senior", provider: "claude", skills: ["character makeup design", "color theory", "style consistency", "trend research"], critical: true, reason: "乙女游戏角色颜值的核心保障" },
  },
  {
    keywords: /创意|想法|策划|creative|idea|concept/i,
    role: { title: "Creative Director", titleZh: "创意总监", departmentHint: "planning", role: "team_leader", provider: "claude", skills: ["concept design", "art direction", "storytelling", "trend forecasting"], critical: true, reason: "把控整体创意方向和产品调性" },
  },
  {
    keywords: /爬取|截图|观测|crawl|scrape|screenshot|monitor/i,
    role: { title: "Trend Scout & Data Crawler", titleZh: "趋势观测爬取员", departmentHint: "development", role: "junior", provider: "codex", skills: ["web scraping", "data collection", "trend monitoring", "screenshot archiving"], critical: false, reason: "市场情报采集，保持对行业趋势的敏感度" },
  },
  {
    keywords: /小红书|红书|xiaohongshu|RED|社媒运营/i,
    role: { title: "Xiaohongshu Operator", titleZh: "小红书运营", departmentHint: "operations", role: "junior", provider: "kimi", skills: ["content planning", "community management", "KOL collaboration", "data analysis"], critical: false, reason: "女性用户主阵地，直接影响获客和品牌认知" },
  },
  {
    keywords: /运营|operation|社区|community/i,
    role: { title: "Community Operator", titleZh: "社区运营", departmentHint: "operations", role: "junior", provider: "kimi", skills: ["user engagement", "event planning", "feedback collection", "content curation"], critical: false, reason: "维护用户社区活跃度和忠诚度" },
  },
  {
    keywords: /原画|concept\s*art|角色设计|character\s*design/i,
    role: { title: "Concept Artist", titleZh: "原画师", departmentHint: "design", role: "senior", provider: "claude", skills: ["character design", "illustration", "style guide", "visual storytelling"], critical: true, reason: "角色视觉设计是乙女游戏的灵魂" },
  },
  {
    keywords: /动画|animation|动效|motion/i,
    role: { title: "Animator", titleZh: "动画师", departmentHint: "design", role: "senior", provider: "codex", skills: ["character animation", "motion design", "spine/live2d", "expression system"], critical: true, reason: "角色动态表现力直接影响玩家沉浸感" },
  },
  {
    keywords: /UI|界面|用户界面|interface/i,
    role: { title: "UI Designer", titleZh: "UI设计师", departmentHint: "design", role: "junior", provider: "opencode", skills: ["UI layout", "icon design", "interaction design", "responsive design"], critical: false, reason: "游戏界面的视觉体验" },
  },
  {
    keywords: /文案|剧情|剧本|story|script|narrative|writer/i,
    role: { title: "Narrative Designer", titleZh: "剧情策划/文案", departmentHint: "planning", role: "senior", provider: "claude", skills: ["storytelling", "dialogue writing", "character arc", "world building"], critical: true, reason: "乙女游戏以剧情为核心卖点" },
  },
  {
    keywords: /音频|音乐|声优|配音|audio|music|voice|sound/i,
    role: { title: "Audio Director", titleZh: "音频总监", departmentHint: "design", role: "senior", provider: "gemini", skills: ["sound design", "music direction", "voice casting", "audio implementation"], critical: false, reason: "声音体验对女性向游戏沉浸感很重要" },
  },
  {
    keywords: /测试|QA|质检|test|quality/i,
    role: { title: "QA Engineer", titleZh: "质量测试", departmentHint: "qa", role: "junior", provider: "gemini", skills: ["test planning", "bug tracking", "regression testing", "user acceptance"], critical: false, reason: "保障产品质量" },
  },
  {
    keywords: /市场|marketing|推广|promote/i,
    role: { title: "Marketing Specialist", titleZh: "市场推广", departmentHint: "operations", role: "junior", provider: "kimi", skills: ["campaign planning", "channel management", "brand positioning", "analytics"], critical: false, reason: "产品上线推广和品牌建设" },
  },
  {
    keywords: /数据分析|data\s*analy|BI|数据/i,
    role: { title: "Data Analyst", titleZh: "数据分析师", departmentHint: "planning", role: "junior", provider: "gemini", skills: ["data analysis", "user behavior", "A/B testing", "reporting"], critical: false, reason: "数据驱动决策" },
  },
  {
    keywords: /项目管理|PM|project\s*manage|制作人|producer/i,
    role: { title: "Project Manager / Producer", titleZh: "项目经理/制作人", departmentHint: "planning", role: "team_leader", provider: "claude", skills: ["project planning", "resource allocation", "timeline management", "stakeholder communication"], critical: true, reason: "统筹全局进度和资源" },
  },
  {
    keywords: /前端|后端|开发|程序|engineer|developer|coder|code/i,
    role: { title: "Game Developer", titleZh: "游戏开发工程师", departmentHint: "development", role: "senior", provider: "codex", skills: ["game engine", "Unity/Unreal", "shader programming", "performance optimization"], critical: true, reason: "技术实现核心" },
  },
  {
    keywords: /安全|security|合规|compliance/i,
    role: { title: "Security & Compliance", titleZh: "安全合规", departmentHint: "devsecops", role: "junior", provider: "copilot", skills: ["content compliance", "data protection", "platform policy", "audit"], critical: false, reason: "确保内容合规和数据安全" },
  },
  // ── 通用行业 ──
  {
    keywords: /销售|sales|BD|商务/i,
    role: { title: "Sales / BD", titleZh: "销售/商务", departmentHint: "operations", role: "junior", provider: "claude", skills: ["client acquisition", "deal negotiation", "pipeline management", "partnership"], critical: false, reason: "商业拓展和收入增长" },
  },
  {
    keywords: /财务|finance|会计|account/i,
    role: { title: "Finance Specialist", titleZh: "财务专员", departmentHint: "operations", role: "junior", provider: "gemini", skills: ["budgeting", "financial reporting", "cost control", "tax compliance"], critical: false, reason: "财务健康管理" },
  },
  {
    keywords: /HR|人事|招聘|人力/i,
    role: { title: "HR Specialist", titleZh: "人力资源", departmentHint: "operations", role: "junior", provider: "claude", skills: ["recruitment", "talent management", "culture building", "onboarding"], critical: false, reason: "团队建设和人才管理" },
  },
];

// ── 行业识别 ─────────────────────────────────────────────────────────────────

interface IndustryInfo {
  industry: string;
  industryZh: string;
  defaultRoles: Omit<RoleBlueprint, "roleKey">[];
  defaultGaps: GapItem[];
}

function detectIndustry(text: string): IndustryInfo {
  const t = text.toLowerCase();

  if (/二次元|乙[女游]|otome|anime|动漫|漫画|女性向|女性游戏/.test(t)) {
    return {
      industry: "Anime / Otome Game",
      industryZh: "二次元 · 乙女游戏",
      defaultRoles: [
        { title: "Creative Director", titleZh: "创意总监", departmentHint: "planning", role: "team_leader", provider: "claude", skills: ["art direction", "concept design", "trend forecasting"], critical: true, reason: "创意核心决策者" },
        { title: "Project Producer", titleZh: "制作人", departmentHint: "planning", role: "team_leader", provider: "claude", skills: ["project management", "resource planning", "milestone tracking"], critical: true, reason: "项目全局把控" },
      ],
      defaultGaps: [
        { area: "IP版权管理", description: "二次元行业IP侵权风险高，需要专人管理版权", severity: "high", suggestion: "建议配置IP法务或版权管理岗" },
        { area: "本地化", description: "乙女游戏出海需要多语言本地化能力", severity: "medium", suggestion: "考虑增加本地化翻译岗" },
      ],
    };
  }

  if (/3[dD]|建模|model|游戏|game/.test(t)) {
    return {
      industry: "Game / 3D Production",
      industryZh: "游戏 · 3D制作",
      defaultRoles: [
        { title: "Technical Art Director", titleZh: "技术美术总监", departmentHint: "design", role: "team_leader", provider: "codex", skills: ["shader", "pipeline", "tool development"], critical: true, reason: "技术与美术的桥梁" },
      ],
      defaultGaps: [
        { area: "渲染管线", description: "3D生产缺少渲染管线工程师", severity: "high", suggestion: "建议配置技术美术（TA）" },
      ],
    };
  }

  return {
    industry: "General Business",
    industryZh: "综合企业",
    defaultRoles: [
      { title: "Strategy Lead", titleZh: "策略负责人", departmentHint: "planning", role: "team_leader", provider: "claude", skills: ["strategic planning", "market analysis"], critical: true, reason: "企业战略规划" },
    ],
    defaultGaps: [],
  };
}

// ── 本地解析主函数 ───────────────────────────────────────────────────────────

export function localAnalyze(userDescription: string): AnalysisResult {
  const info = detectIndustry(userDescription);
  const matchedRoles: RoleBlueprint[] = [];
  const usedKeys = new Set<string>();
  let keyIdx = 0;

  // 从模板匹配岗位
  for (const tpl of ROLE_TEMPLATES) {
    if (tpl.keywords.test(userDescription)) {
      const key = `${tpl.role.title.toLowerCase().replace(/\s+/g, "-")}-${++keyIdx}`;
      if (!usedKeys.has(tpl.role.title)) {
        usedKeys.add(tpl.role.title);
        matchedRoles.push({ ...tpl.role, roleKey: key });
      }
    }
  }

  // 添加行业默认岗位（去重）
  for (const dr of info.defaultRoles) {
    if (!usedKeys.has(dr.title)) {
      usedKeys.add(dr.title);
      matchedRoles.push({ ...dr, roleKey: `default-${++keyIdx}` });
    }
  }

  // 缺口分析
  const gaps: GapItem[] = [...info.defaultGaps];

  const hasLeader = matchedRoles.some((r) => r.role === "team_leader");
  if (!hasLeader) {
    gaps.push({
      area: "管理层缺失",
      description: "团队没有明确的负责人/领导者",
      severity: "high",
      suggestion: "建议设置一名创意总监或项目经理作为团队核心",
    });
  }

  const hasQA = matchedRoles.some((r) => r.departmentHint === "qa");
  if (!hasQA) {
    gaps.push({
      area: "质量保障缺失",
      description: "没有质检/测试岗位，可能导致产出质量不稳定",
      severity: "medium",
      suggestion: "建议增加QA/质量审核岗位",
    });
  }

  const hasOps = matchedRoles.some((r) => r.departmentHint === "operations");
  if (!hasOps) {
    gaps.push({
      area: "运营空白",
      description: "没有运营岗位，产品做出来没人推",
      severity: "high",
      suggestion: "至少需要社媒运营或市场推广岗位",
    });
  }

  const hasDev = matchedRoles.some((r) => r.departmentHint === "development");
  if (!hasDev) {
    gaps.push({
      area: "技术实现空白",
      description: "缺少开发/技术岗位",
      severity: "high",
      suggestion: "3D游戏需要游戏开发工程师，建议补充",
    });
  }

  const hasSecurity = matchedRoles.some((r) => r.departmentHint === "devsecops");
  if (!hasSecurity) {
    gaps.push({
      area: "安全合规",
      description: "缺少安全合规岗位，游戏内容审核和数据保护有风险",
      severity: "low",
      suggestion: "建议在团队壮大后配置合规专员",
    });
  }

  // 风险评估
  const risks: string[] = [];
  if (matchedRoles.length < 5) {
    risks.push("团队规模偏小，可能在多线并行时产能不足");
  }
  if (matchedRoles.filter((r) => r.critical).length < 2) {
    risks.push("关键岗位太少，单点故障风险高");
  }
  if (!matchedRoles.some((r) => /data|analy/i.test(r.skills.join(" ")))) {
    risks.push("缺乏数据分析能力，难以做数据驱动决策");
  }
  if (/乙女|otome|女性/.test(userDescription) && !matchedRoles.some((r) => /story|narrative|剧情/i.test(r.skills.join(" ")))) {
    risks.push("乙女游戏以剧情为核心，但团队缺少专职剧情策划");
  }

  return {
    industry: info.industry,
    industryZh: info.industryZh,
    summary: `基于您的描述，识别为「${info.industryZh}」行业。共匹配 ${matchedRoles.length} 个岗位，发现 ${gaps.length} 个潜在缺口，${risks.length} 个风险点。`,
    roles: matchedRoles,
    gaps,
    risks,
    source: "local",
  };
}

// ── Agent 自主分析（方案 C）────────────────────────────────────────────────

const AGENT_ANALYSIS_PROMPT = `你是一个企业组织架构分析专家。请分析以下业务需求，输出严格的JSON（不要多余文字）。

输出格式：
{
  "industry": "英文行业名",
  "industryZh": "中文行业名",
  "summary": "一段话总结分析结论",
  "roles": [
    {
      "roleKey": "唯一标识(kebab-case)",
      "title": "英文岗位名",
      "titleZh": "中文岗位名",
      "departmentHint": "planning|development|design|qa|devsecops|operations",
      "role": "team_leader|senior|junior",
      "provider": "claude|codex|gemini|opencode|kimi",
      "skills": ["技能1", "技能2", "技能3"],
      "critical": true或false,
      "reason": "为什么需要这个岗位"
    }
  ],
  "gaps": [
    { "area": "缺口领域", "description": "问题描述", "severity": "high|medium|low", "suggestion": "建议" }
  ],
  "risks": ["风险点1", "风险点2"]
}

规则：
- provider根据岗位特性分配：创意类用claude，技术类用codex，分析类用gemini，工具集成用opencode，内容类用kimi
- departmentHint必须是 planning/development/design/qa/devsecops/operations 之一
- critical=true 的岗位系统会自动双备份
- 至少分析3个缺口和2个风险点
- 仅输出JSON，不要任何前缀后缀`;

/** 从团队中选择最适合做分析的 Agent（优先 claude leader） */
export function pickAnalystAgent(agents: Agent[]): Agent | null {
  const preferred = ["claude", "gemini", "kimi", "opencode", "codex"];
  // 优先 leader
  for (const p of preferred) {
    const a = agents.find((x) => x.cli_provider === p && /leader/i.test(x.role) && x.status !== "offline");
    if (a) return a;
  }
  // 再找 senior
  for (const p of preferred) {
    const a = agents.find((x) => x.cli_provider === p && /senior/i.test(x.role) && x.status !== "offline");
    if (a) return a;
  }
  // 任意可用
  for (const p of preferred) {
    const a = agents.find((x) => x.cli_provider === p && x.status !== "offline");
    if (a) return a;
  }
  return agents.find((x) => x.status !== "offline") ?? null;
}

export interface AgentAnalysisProgress {
  phase: "selecting" | "creating" | "running" | "polling" | "parsing" | "done" | "error";
  agentName?: string;
  agentEmoji?: string;
  taskId?: string;
  elapsed?: number;
  message: string;
}

type ProgressCallback = (p: AgentAnalysisProgress) => void;

/**
 * 让已有的 AI Agent 自主分析用户的业务需求。
 * 创建任务 → 指派 → 运行 → 轮询完成 → 解析结果
 */
export async function agentAnalyze(
  userDescription: string,
  agents: Agent[],
  onProgress?: ProgressCallback,
): Promise<AnalysisResult | null> {
  const report = (p: AgentAnalysisProgress) => onProgress?.(p);

  // 1. 选择分析 Agent
  report({ phase: "selecting", message: "正在选择最佳分析 Agent..." });
  const analyst = pickAnalystAgent(agents);
  if (!analyst) {
    report({ phase: "error", message: "没有可用的 Agent，请先创建员工" });
    return null;
  }
  report({
    phase: "selecting",
    agentName: analyst.name,
    agentEmoji: analyst.avatar_emoji,
    message: `已选择 ${analyst.avatar_emoji} ${analyst.name} (${analyst.cli_provider}) 进行分析`,
  });

  // 2. 创建分析任务
  report({ phase: "creating", agentName: analyst.name, agentEmoji: analyst.avatar_emoji, message: "正在创建分析任务..." });
  let taskId: string;
  try {
    taskId = await orgApi.createTask({
      title: `[DNA] 行业需求智能分析`,
      description: `${AGENT_ANALYSIS_PROMPT}\n\n===== 用户需求 =====\n${userDescription}`,
      task_type: "analysis",
      priority: 1,
      assigned_agent_id: analyst.id,
      department_id: analyst.department_id ?? undefined,
      workflow_pack_key: "report",
    });
  } catch (err) {
    console.error("Failed to create analysis task:", err);
    report({ phase: "error", message: "创建分析任务失败" });
    return null;
  }
  report({ phase: "creating", taskId, agentName: analyst.name, agentEmoji: analyst.avatar_emoji, message: `分析任务已创建：${taskId.slice(0, 8)}` });

  // 3. 运行任务
  report({ phase: "running", taskId, agentName: analyst.name, agentEmoji: analyst.avatar_emoji, message: `${analyst.avatar_emoji} ${analyst.name} 正在启动分析...` });
  try {
    await orgApi.runTask(taskId);
  } catch (err) {
    console.error("Failed to run analysis task:", err);
    report({ phase: "error", taskId, message: "启动分析任务失败（请检查 Agent CLI 认证状态）" });
    return null;
  }

  // 4. 轮询等待完成（最多 180 秒）
  const MAX_POLL_MS = 180_000;
  const POLL_INTERVAL_MS = 4_000;
  const startTime = Date.now();

  report({ phase: "polling", taskId, agentName: analyst.name, agentEmoji: analyst.avatar_emoji, elapsed: 0, message: `${analyst.avatar_emoji} ${analyst.name} 正在分析中...` });

  let resultText: string | null = null;
  while (Date.now() - startTime < MAX_POLL_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    try {
      const { task } = await orgApi.getTask(taskId);
      if (task.status === "done" || task.status === "review") {
        resultText = task.result;
        break;
      }
      if (task.status === "cancelled") {
        report({ phase: "error", taskId, message: "分析任务被取消" });
        return null;
      }
      report({
        phase: "polling",
        taskId,
        agentName: analyst.name,
        agentEmoji: analyst.avatar_emoji,
        elapsed,
        message: `${analyst.avatar_emoji} ${analyst.name} 正在深度分析...（${elapsed}s）`,
      });
    } catch (err) {
      console.warn("Poll error:", err);
    }
  }

  if (!resultText) {
    report({ phase: "error", taskId, message: "分析超时（180秒），Agent 可能仍在工作中，请稍后在任务面板查看结果" });
    return null;
  }

  // 5. 解析 Agent 输出
  report({ phase: "parsing", taskId, agentName: analyst.name, agentEmoji: analyst.avatar_emoji, message: "正在解析分析结果..." });

  try {
    const jsonMatch = resultText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Agent output has no JSON:", resultText.slice(0, 300));
      report({ phase: "error", taskId, message: "Agent 输出无法解析为结构化数据，回退到本地分析" });
      return null;
    }
    const parsed = JSON.parse(jsonMatch[0]) as Omit<AnalysisResult, "source">;
    const result: AnalysisResult = { ...parsed, source: "agent" };
    report({ phase: "done", taskId, agentName: analyst.name, agentEmoji: analyst.avatar_emoji, message: `✅ ${analyst.avatar_emoji} ${analyst.name} 分析完成！` });
    return result;
  } catch (err) {
    console.error("Failed to parse agent output:", err);
    report({ phase: "error", taskId, message: "解析 Agent 输出失败，回退到本地分析" });
    return null;
  }
}

// ── 统一入口：三通道 ─────────────────────────────────────────────────────────

export type AnalysisChannel = "auto" | "agent" | "dify" | "local";

export async function analyzeBusinessNeeds(
  userDescription: string,
  options?: {
    channel?: AnalysisChannel;
    agents?: Agent[];
    onAgentProgress?: ProgressCallback;
  },
): Promise<AnalysisResult> {
  const channel = options?.channel ?? "auto";

  // Agent 通道
  if (channel === "agent" || (channel === "auto" && options?.agents?.length)) {
    if (options?.agents?.length) {
      const agentResult = await agentAnalyze(userDescription, options.agents, options.onAgentProgress);
      if (agentResult) return agentResult;
      console.warn("Agent analysis failed, trying next channel");
    }
  }

  // Dify 通道
  if (channel === "dify" || channel === "auto") {
    if (isDifyConfigured()) {
      const difyResult = await callDifyWorkflow(userDescription);
      if (difyResult) return difyResult;
      console.warn("Dify call failed, falling back to local analysis");
    }
  }

  // 本地兜底
  return localAnalyze(userDescription);
}
