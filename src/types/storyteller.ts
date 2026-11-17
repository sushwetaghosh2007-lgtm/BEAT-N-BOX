export type WorkspaceTab = 'pipeline' | 'constraints';

export type CadenceTierId = 'resting' | 'guarded' | 'acute' | 'fractured';

export type StressBandId = 'quiet-dread' | 'rising-unease' | 'acute-paranoia' | 'gothic-crisis';

export interface StressThresholdBand {
  id: StressBandId;
  label: string;
  min: number;
  max: number;
  stage2Guidance: string;
}

export interface CadenceBandRule {
  id: CadenceTierId;
  label: string;
  minBpm: number;
  maxBpm: number;
  minWords: number;
  maxWords: number;
  syntaxDirective: string;
  dialogueTrait: string;
}

export interface CharacterState {
  id: string;
  name: string;
  role: string;
  temperament: string;
  bpm: number;
  baselineBpm: number;
  autoDrive: boolean;
  lastTrigger: string;
}

export interface GothicEpisode {
  id: string;
  episodeNumber: string;
  title: string;
  location: string;
  hourLabel: string;
  premise: string;
  imageUrl: string;
  imageAlt: string;
  initialStress: number;
  characters: CharacterState[];
  presetBeats: {
    label: string;
    prompt: string;
  }[];
  openingProse: string;
}

export interface SystemConstraintConfig {
  coreDirective: string;
  atmosphericDirective: string;
  episodicHookRule: string;
  forbiddenTropes: string;
  cadenceBands: CadenceBandRule[];
}

export interface TelemetryUpdate {
  characterId: string;
  characterName: string;
  previousBpm: number;
  newBpm: number;
  deltaBpm: number;
  cadenceTier: CadenceTierId;
  cadenceLabel: string;
  triggerReason: string;
}

export interface Stage1TelemetryResult {
  recommendedStress: number;
  atmosphericProfile: string;
  sensoryMandates: string[];
  characterUpdates: TelemetryUpdate[];
}

export interface CadenceViolation {
  speakerName: string;
  bpm: number;
  tierLabel: string;
  expectedMinWords: number;
  expectedMaxWords: number;
  actualWords: number;
  sentenceQuote: string;
}

export interface CharacterCadenceStat {
  characterName: string;
  bpm: number;
  tierLabel: string;
  expectedMinWords: number;
  expectedMaxWords: number;
  sentenceCount: number;
  avgWords: number;
  outOfRangeCount: number;
}

export interface DeterministicCadenceReport {
  passed: boolean;
  totalDialogueLines: number;
  totalDialogueSentences: number;
  violations: CadenceViolation[];
  characterStats: CharacterCadenceStat[];
  summary: string;
}

export interface AuditCheck {
  criterion: string;
  passed: boolean;
  evidenceQuote: string;
  rationale: string;
}

export interface Stage3AuditResult {
  overallPassed: boolean;
  dialogueAlignmentScore: string;
  atmosphericEscalationScore: string;
  summaryVerdict: string;
  checks: AuditCheck[];
  deterministicCadence: DeterministicCadenceReport;
}

export interface GeneratedBeat {
  id: string;
  beatIndex: number;
  prompt: string;
  prose: string;
  stressLevel: number;
  telemetry: Stage1TelemetryResult | null;
  audit: Stage3AuditResult | null;
  latencyMs: number;
  createdAt: string;
}

export interface PipelineStageTiming {
  stage1Ms: number | null;
  stage2Ms: number | null;
  stage3Ms: number | null;
}

export interface RevisionRequestContext {
  beatId: string;
  beatIndex: number;
  previousProse: string;
  telemetry: Stage1TelemetryResult;
  effectiveStress: number;
  deterministicViolations: CadenceViolation[];
  llmCritique: string;
}
