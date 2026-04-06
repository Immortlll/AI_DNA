/**
 * AI DNA 制造商 — 数字生命体类型系统
 *
 * 将人的能力、人格、经验、决策方式克隆为可持续工作的 AI 数字生命体。
 */

// ── DNA 来源 ──────────────────────────────────────────────────────────────────

export type DNASourceType =
  | "chat_history"
  | "document"
  | "email"
  | "meeting_notes"
  | "task_history"
  | "code_repo"
  | "skill_repo"
  | "manual_input";

export interface DNASource {
  id: string;
  type: DNASourceType;
  label: string;
  uri: string;
  ingested_at: number;
  item_count: number;
}

// ── Persona DNA（人格层）──────────────────────────────────────────────────────

export interface PersonaDNA {
  traits: string[];
  communication_style: string;
  stress_response: string;
  collaboration_preference: string;
  culture_tag: string;
}

// ── Work DNA（工作能力层）─────────────────────────────────────────────────────

export interface WorkDNA {
  core_skills: string[];
  task_decomposition_style: string;
  delivery_template: string;
  analysis_framework: string;
  tools: string[];
}

// ── Decision DNA（决策层）─────────────────────────────────────────────────────

export type RiskPreference = "conservative" | "moderate" | "aggressive";

export interface DecisionDNA {
  risk_preference: RiskPreference;
  priority_style: string;
  decision_basis: string[];
  tradeoff_logic: string;
}

// ── Memory DNA（记忆/经验层）──────────────────────────────────────────────────

export interface MemoryDNA {
  learned_skill_count: number;
  task_completed_count: number;
  report_count: number;
  key_experiences: string[];
}

// ── Relationship DNA（协作层）─────────────────────────────────────────────────

export interface RelationshipDNA {
  leadership_style: string;
  feedback_style: string;
  delegation_preference: string;
  conflict_resolution: string;
}

// ── DNA Profile（完整数字生命体档案）──────────────────────────────────────────

export type DNAEvolutionStatus = "embryo" | "learning" | "active" | "mature";

export interface DNAProfile {
  agent_id: string;
  agent_name: string;
  provider: string;
  department: string;
  role: string;
  avatar_emoji: string;

  persona: PersonaDNA;
  work: WorkDNA;
  decision: DecisionDNA;
  memory: MemoryDNA;
  relationship: RelationshipDNA;

  evolution_status: DNAEvolutionStatus;
  dna_version: number;
  created_at: number;
  updated_at: number;
  sources: DNASource[];
}

// ── DNA 蒸馏任务 ─────────────────────────────────────────────────────────────

export type DistillationStatus = "pending" | "running" | "completed" | "failed";

export interface DistillationJob {
  id: string;
  repo: string;
  target_providers: string[];
  status: DistillationStatus;
  started_at: number | null;
  completed_at: number | null;
  skills_extracted: number;
}
