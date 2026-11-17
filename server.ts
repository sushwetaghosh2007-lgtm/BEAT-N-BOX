import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  AuditCheck,
  CadenceBandRule,
  CadenceTierId,
  CadenceViolation,
  CharacterCadenceStat,
  CharacterState,
  DeterministicCadenceReport,
  RevisionRequestContext,
  Stage1TelemetryResult,
  Stage3AuditResult,
  SystemConstraintConfig,
} from './src/types/storyteller.ts';
import { resolveStressBand } from './src/data/scenarios.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const CONTINUITY_MAX_CHARS = 4500;
const OPENING_ANCHOR_MAX_CHARS = 1100;

function getOptionalThinkingConfig(modelName: string): {
  thinkingConfig?: { thinkingLevel: ThinkingLevel };
} {
  const lower = modelName.toLowerCase();
  if (lower.includes('gemini-3') || lower.includes('gemini-4')) {
    return { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } };
  }
  return {};
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please verify your key in the Settings > Secrets panel.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractHttpStatus(err: unknown): number | null {
  if (err && typeof err === 'object') {
    const rec = err as { status?: unknown; code?: unknown; statusCode?: unknown };
    if (typeof rec.status === 'number') return rec.status;
    if (typeof rec.statusCode === 'number') return rec.statusCode;
    if (typeof rec.code === 'number') return rec.code;
  }
  return null;
}

function formatApiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  const explicitStatus = extractHttpStatus(err);

  const isApiKeyFailure =
    lower.includes('api_key_invalid') ||
    lower.includes('invalid api key') ||
    lower.includes('api key not valid') ||
    (lower.includes('api key') && (lower.includes('invalid') || lower.includes('missing')));

  if (isApiKeyFailure) {
    return {
      status: 400,
      message:
        'API key validation failed (400). Please check your GEMINI_API_KEY in the Settings > Secrets panel.',
    };
  }
  if (lower.includes('permission_denied') || explicitStatus === 403) {
    return {
      status: 403,
      message:
        'Permission denied by Gemini API (403). Please verify your API key permissions in Settings > Secrets.',
    };
  }
  if (lower.includes('resource_exhausted') || explicitStatus === 429) {
    return {
      status: 429,
      message:
        'Gemini API quota exceeded (429). Retry shortly or select a billing-enabled API key in Settings > Secrets.',
    };
  }
  if (lower.includes('not_found') || explicitStatus === 404) {
    return {
      status: 404,
      message: `Requested model (${MODEL_NAME}) was not found (404).`,
    };
  }
  if (explicitStatus === 400 || lower.includes('invalid_argument')) {
    return {
      status: 400,
      message: raw || 'Bad request (400) returned by Gemini API.',
    };
  }
  return {
    status: explicitStatus && explicitStatus >= 400 ? explicitStatus : 500,
    message: raw || 'Unexpected error communicating with Gemini API.',
  };
}

function resolveBand(bpm: number, bands: CadenceBandRule[]): CadenceBandRule {
  const found = bands.find((b) => bpm >= b.minBpm && bpm <= b.maxBpm);
  if (found) return found;
  if (bpm < (bands[0]?.minBpm ?? 55)) return bands[0];
  return bands[bands.length - 1];
}

function resolveTierId(bpm: number): CadenceTierId {
  if (bpm <= 85) return 'resting';
  if (bpm <= 118) return 'guarded';
  if (bpm <= 145) return 'acute';
  return 'fractured';
}

function clampBpm(val: number): number {
  return Math.max(55, Math.min(175, Math.round(val)));
}

function clampStress(val: number): number {
  return Math.max(5, Math.min(100, Math.round(val)));
}

/**
 * Builds up to ~4,500 chars of story continuity while always preserving the
 * episode's opening anchor so early facts and character voice do not drift.
 */
function buildContinuityContext(openingProse: string, priorProse: string): string {
  const trimmedPrior = priorProse.trim();
  const trimmedOpening = openingProse.trim();

  if (trimmedPrior.length <= CONTINUITY_MAX_CHARS) {
    return trimmedPrior;
  }

  const anchor = trimmedOpening.slice(0, OPENING_ANCHOR_MAX_CHARS);
  const recentBudget = Math.max(1200, CONTINUITY_MAX_CHARS - anchor.length - 80);
  const recentTail = trimmedPrior.slice(-recentBudget);

  if (recentTail.startsWith(anchor.slice(0, 80))) {
    return trimmedPrior.slice(-CONTINUITY_MAX_CHARS);
  }

  return `[Opening Episode Anchor]\n${anchor}\n\n[Recent Episode Continuity]\n...${recentTail}`;
}

/**
 * Builds searchable name aliases for speaker attribution around dialogue quotes.
 */
function getSpeakerAliases(fullName: string): string[] {
  const cleaned = fullName.replace(/\./g, '').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const aliases = new Set<string>([fullName.toLowerCase(), cleaned.toLowerCase()]);

  const honorifics = new Set(['father', 'dr', 'doctor', 'matron', 'inspector', 'miss', 'mr', 'mrs']);
  for (const part of parts) {
    const low = part.toLowerCase();
    if (!honorifics.has(low) && low.length >= 3) {
      aliases.add(low);
    }
  }
  if (parts.length >= 2) {
    aliases.add(`${parts[0].toLowerCase()} ${parts[parts.length - 1].toLowerCase()}`);
  }
  return Array.from(aliases);
}

function attributeSpeaker(
  beforeContext: string,
  afterContext: string,
  characterNames: string[],
  previousSpeakerIndex: number
): number {
  const lowerAfter = afterContext.toLowerCase();
  const lowerBefore = beforeContext.toLowerCase();

  // Check immediate post-quote attribution first (e.g., `"...", Eleanor whispered.`)
  let bestAfterIdx = Infinity;
  let bestAfterChar = -1;
  characterNames.forEach((name, charIdx) => {
    for (const alias of getSpeakerAliases(name)) {
      const regex = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      const match = regex.exec(lowerAfter);
      if (match && match.index < 65 && match.index < bestAfterIdx) {
        bestAfterIdx = match.index;
        bestAfterChar = charIdx;
      }
    }
  });
  if (bestAfterChar !== -1) {
    return bestAfterChar;
  }

  // Check pre-quote attribution closest to the opening quotation mark
  let bestBeforeDist = Infinity;
  let bestBeforeChar = -1;
  characterNames.forEach((name, charIdx) => {
    for (const alias of getSpeakerAliases(name)) {
      const regex = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      let match: RegExpExecArray | null;
      while ((match = regex.exec(lowerBefore)) !== null) {
        const distFromQuote = lowerBefore.length - (match.index + alias.length);
        if (distFromQuote < bestBeforeDist) {
          bestBeforeDist = distFromQuote;
          bestBeforeChar = charIdx;
        }
      }
    }
  });
  if (bestBeforeChar !== -1) {
    return bestBeforeChar;
  }

  // Alternating fallback for untagged two-character exchanges
  if (previousSpeakerIndex >= 0 && characterNames.length > 1) {
    return (previousSpeakerIndex + 1) % characterNames.length;
  }
  return 0;
}

/**
 * Deterministic mathematical cadence verifier:
 * Parses double-quoted dialogue ("..."), attributes each line to its active speaker,
 * counts exact words per sentence, and validates against the speaker's BPM band.
 */
export function runDeterministicCadenceCheck(
  prose: string,
  telemetry: Stage1TelemetryResult,
  constraints: SystemConstraintConfig
): DeterministicCadenceReport {
  const quoteRegex = /"([^"]+)"|“([^”]+)”/g;
  const characterUpdates = telemetry.characterUpdates;
  const characterNames = characterUpdates.map((u) => u.characterName);

  const violations: CadenceViolation[] = [];
  const statsMap = new Map<
    string,
    {
      characterName: string;
      bpm: number;
      tierLabel: string;
      minWords: number;
      maxWords: number;
      wordCounts: number[];
      outOfRangeCount: number;
    }
  >();

  for (const upd of characterUpdates) {
    const band = resolveBand(upd.newBpm, constraints.cadenceBands);
    statsMap.set(upd.characterName, {
      characterName: upd.characterName,
      bpm: upd.newBpm,
      tierLabel: band.label,
      minWords: band.minWords,
      maxWords: band.maxWords,
      wordCounts: [],
      outOfRangeCount: 0,
    });
  }

  let totalDialogueLines = 0;
  let totalDialogueSentences = 0;
  let previousSpeakerIdx = -1;
  let match: RegExpExecArray | null;

  while ((match = quoteRegex.exec(prose)) !== null) {
    const quoteText = (match[1] ?? match[2] ?? '').trim();
    if (!quoteText) continue;

    totalDialogueLines += 1;
    const beforeStart = Math.max(0, match.index - 180);
    const beforeContext = prose.slice(beforeStart, match.index);
    const afterEnd = Math.min(prose.length, match.index + match[0].length + 120);
    const afterContext = prose.slice(match.index + match[0].length, afterEnd);

    const speakerIdx = attributeSpeaker(
      beforeContext,
      afterContext,
      characterNames,
      previousSpeakerIdx
    );
    previousSpeakerIdx = speakerIdx;

    const speakerUpdate = characterUpdates[speakerIdx];
    if (!speakerUpdate) continue;

    const band = resolveBand(speakerUpdate.newBpm, constraints.cadenceBands);
    const stat = statsMap.get(speakerUpdate.characterName);

    // Split spoken quote into individual sentences / elliptical fragments
    const rawSentences = quoteText
      .split(/(?:[.!?]+|…+|\.{3,})/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const sentence of rawSentences) {
      const words = sentence
        .split(/\s+/)
        .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
        .filter((w) => w.length > 0);

      const wordCount = words.length;
      if (wordCount === 0) continue;

      totalDialogueSentences += 1;
      if (stat) {
        stat.wordCounts.push(wordCount);
      }

      if (wordCount < band.minWords || wordCount > band.maxWords) {
        if (stat) {
          stat.outOfRangeCount += 1;
        }
        violations.push({
          speakerName: speakerUpdate.characterName,
          bpm: speakerUpdate.newBpm,
          tierLabel: band.label,
          expectedMinWords: band.minWords,
          expectedMaxWords: band.maxWords,
          actualWords: wordCount,
          sentenceQuote: sentence,
        });
      }
    }
  }

  const characterStats: CharacterCadenceStat[] = Array.from(statsMap.values()).map((s) => {
    const count = s.wordCounts.length;
    const avg =
      count > 0
        ? Number((s.wordCounts.reduce((a, b) => a + b, 0) / count).toFixed(1))
        : 0;
    return {
      characterName: s.characterName,
      bpm: s.bpm,
      tierLabel: s.tierLabel,
      expectedMinWords: s.minWords,
      expectedMaxWords: s.maxWords,
      sentenceCount: count,
      avgWords: avg,
      outOfRangeCount: s.outOfRangeCount,
    };
  });

  const passed = totalDialogueSentences > 0 && violations.length === 0;
  const summary =
    totalDialogueSentences === 0
      ? 'No double-quoted dialogue sentences detected to verify cadence.'
      : passed
        ? `All ${totalDialogueSentences} spoken sentences matched their speaker BPM word-count bounds.`
        : `${violations.length} of ${totalDialogueSentences} spoken sentences fell outside assigned BPM word-count bounds.`;

  return {
    passed,
    totalDialogueLines,
    totalDialogueSentences,
    violations,
    characterStats,
    summary,
  };
}

async function runStage1Telemetry(
  ai: GoogleGenAI,
  payload: {
    episodeTitle: string;
    location: string;
    continuityContext: string;
    beatPrompt: string;
    characters: CharacterState[];
    stressLevel: number;
    stressOverride: boolean;
    constraints: SystemConstraintConfig;
  },
  abortSignal: AbortSignal
): Promise<{ telemetry: Stage1TelemetryResult; effectiveStress: number }> {
  const charSummary = payload.characters
    .map(
      (c) =>
        `- id="${c.id}" | name="${c.name}" | role="${c.role}" | currentBpm=${c.bpm} | baselineBpm=${c.baselineBpm} | autoDrive=${c.autoDrive} | temperament="${c.temperament}"`
    )
    .join('\n');

  const prompt = `Evaluate the psychological heartbeat shifts and atmospheric stress requirements for the next episodic gothic suspense beat.

Episode: ${payload.episodeTitle} (${payload.location})
Current Scene Stress Level: ${payload.stressLevel}/100 (Manual Lock: ${payload.stressOverride ? 'YES' : 'NO'})

Active Characters:
${charSummary}

Episode Continuity Context:
${payload.continuityContext}

Incoming Narrative Beat Prompt:
"${payload.beatPrompt}"

Instructions:
1. For any character with autoDrive=true, calculate a realistic newBpm (integer 55-175) reflecting how this beat escalates or shifts their psychological dread. If autoDrive=false, keep newBpm equal to their currentBpm.
2. Provide a concise, vivid gothic psychological triggerReason for each character.
3. Recommend an overall scene stress integer (5-100) and a short atmosphericProfile label (e.g., "Subterranean Claustrophobia", "Acute Acoustic Paranoia").
4. Output exactly 3 concrete sensoryMandates (acoustics, light/shadow, thermal/tactile) calibrated to that stress intensity.`;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
    config: {
      abortSignal,
      ...getOptionalThinkingConfig(MODEL_NAME),
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          recommendedStress: { type: Type.INTEGER },
          atmosphericProfile: { type: Type.STRING },
          sensoryMandates: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          characterUpdates: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                characterId: { type: Type.STRING },
                newBpm: { type: Type.INTEGER },
                triggerReason: { type: Type.STRING },
              },
              required: ['characterId', 'newBpm', 'triggerReason'],
            },
          },
        },
        required: [
          'recommendedStress',
          'atmosphericProfile',
          'sensoryMandates',
          'characterUpdates',
        ],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as {
    recommendedStress?: number;
    atmosphericProfile?: string;
    sensoryMandates?: string[];
    characterUpdates?: Array<{
      characterId: string;
      newBpm: number;
      triggerReason: string;
    }>;
  };

  const effectiveStress = payload.stressOverride
    ? clampStress(payload.stressLevel)
    : clampStress(parsed.recommendedStress ?? payload.stressLevel);

  const characterUpdates = payload.characters.map((char) => {
    const match = parsed.characterUpdates?.find((u) => u.characterId === char.id);
    const nextBpm = char.autoDrive
      ? clampBpm(match?.newBpm ?? char.bpm)
      : clampBpm(char.bpm);
    const band = resolveBand(nextBpm, payload.constraints.cadenceBands);
    return {
      characterId: char.id,
      characterName: char.name,
      previousBpm: char.bpm,
      newBpm: nextBpm,
      deltaBpm: nextBpm - char.bpm,
      cadenceTier: resolveTierId(nextBpm),
      cadenceLabel: band.label,
      triggerReason: match?.triggerReason || char.lastTrigger,
    };
  });

  const telemetry: Stage1TelemetryResult = {
    recommendedStress: effectiveStress,
    atmosphericProfile: parsed.atmosphericProfile || 'Gothic Suspense Escalation',
    sensoryMandates: (parsed.sensoryMandates ?? []).slice(0, 3),
    characterUpdates,
  };

  return { telemetry, effectiveStress };
}

function buildStage2SystemInstruction(
  constraints: SystemConstraintConfig,
  telemetry: Stage1TelemetryResult,
  effectiveStress: number
): string {
  const charRules = telemetry.characterUpdates
    .map((u) => {
      const band = resolveBand(u.newBpm, constraints.cadenceBands);
      return `- ${u.characterName} [Psychological Heartbeat: ${u.newBpm} BPM -> Tier: ${band.label}]
  * Trigger: ${u.triggerReason}
  * STRICT SENTENCE WORD COUNT: Every sentence spoken by ${u.characterName} MUST contain strictly between ${band.minWords} and ${band.maxWords} words.
  * Mandatory Dialogue Syntax: ${band.syntaxDirective}
  * Mandatory Dialogue Behaviour: ${band.dialogueTrait}`;
    })
    .join('\n');

  const stressBand = resolveStressBand(effectiveStress);
  const sensoryList = telemetry.sensoryMandates
    .map((m, idx) => `  ${idx + 1}. ${m}`)
    .join('\n');

  return `${constraints.coreDirective}

ATMOSPHERIC INTENSIFICATION RULE:
${constraints.atmosphericDirective}
Current Scene Stress: ${effectiveStress}/100 (${stressBand.label} · ${telemetry.atmosphericProfile})
${stressBand.stage2Guidance}
Active Sensory Mandates:
${sensoryList}

CHARACTER PSYCHOLOGICAL HEARTBEAT CONSTRAINTS (STRICTLY ENFORCED IN DIALOGUE):
${charRules}

EPISODIC STRUCTURE & PROHIBITIONS:
- ${constraints.episodicHookRule}
- ${constraints.forbiddenTropes}
- Always tag each spoken line clearly with the speaker's name in narration (e.g., Eleanor whispered, Father Julian replied).
- Write 180 to 260 words of literary gothic prose with direct spoken dialogue in double quotation marks ("..."). Do not include headers, metadata, or BPM numbers in the prose.`;
}

async function runStage3Audit(
  ai: GoogleGenAI,
  prose: string,
  telemetry: Stage1TelemetryResult,
  effectiveStress: number,
  constraints: SystemConstraintConfig,
  abortSignal: AbortSignal
): Promise<Stage3AuditResult> {
  const deterministicCadence = runDeterministicCadenceCheck(prose, telemetry, constraints);

  const expectedCadences = telemetry.characterUpdates
    .map((u) => {
      const band = resolveBand(u.newBpm, constraints.cadenceBands);
      return `- ${u.characterName} (${u.newBpm} BPM, ${band.label}, strict ${band.minWords}-${band.maxWords} words/sentence): ${band.syntaxDirective} | ${band.dialogueTrait}`;
    })
    .join('\n');

  const stressBand = resolveStressBand(effectiveStress);

  const prompt = `Audit the generated gothic suspense scene against the enforced storyteller constraints.

Expected Character Dialogue Cadences:
${expectedCadences}

Deterministic Word-Count Verification Findings:
${deterministicCadence.summary}
${
  deterministicCadence.violations.length > 0
    ? deterministicCadence.violations
        .map(
          (v) =>
            `- VIOLATION: ${v.speakerName} (${v.bpm} BPM, expected ${v.expectedMinWords}-${v.expectedMaxWords} words) spoke ${v.actualWords} words: "${v.sentenceQuote}"`
        )
        .join('\n')
    : 'No word-count violations detected.'
}

Target Scene Stress Level: ${effectiveStress}/100 (${stressBand.label} · ${telemetry.atmosphericProfile})
Target Sensory Mandates: ${telemetry.sensoryMandates.join(' | ')}

Generated Scene Prose:
"""
${prose}
"""

Evaluate strictly on 3 criteria:
1. "Dialogue-to-Heartbeat Cadence": Did each speaker's syntax length, pauses, and tone accurately reflect their assigned BPM band?
2. "Atmospheric Stress Escalation": Did environmental descriptions (light, acoustics, cold, enclosure) match the ${effectiveStress}/100 (${stressBand.label}) stress level?
3. "Episodic Gothic Restraint": Did the scene avoid forbidden modern/camp tropes and close on an unresolved suspense hook?

For each check, quote an exact short phrase from the Generated Scene Prose in evidenceQuote.`;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
    config: {
      abortSignal,
      ...getOptionalThinkingConfig(MODEL_NAME),
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overallPassed: { type: Type.BOOLEAN },
          dialogueAlignmentScore: { type: Type.STRING },
          atmosphericEscalationScore: { type: Type.STRING },
          summaryVerdict: { type: Type.STRING },
          checks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                criterion: { type: Type.STRING },
                passed: { type: Type.BOOLEAN },
                evidenceQuote: { type: Type.STRING },
                rationale: { type: Type.STRING },
              },
              required: ['criterion', 'passed', 'evidenceQuote', 'rationale'],
            },
          },
        },
        required: [
          'overallPassed',
          'dialogueAlignmentScore',
          'atmosphericEscalationScore',
          'summaryVerdict',
          'checks',
        ],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as {
    overallPassed?: boolean;
    dialogueAlignmentScore?: string;
    atmosphericEscalationScore?: string;
    summaryVerdict?: string;
    checks?: AuditCheck[];
  };

  const llmPassed = Boolean(parsed.overallPassed);
  const combinedPassed = llmPassed && deterministicCadence.passed;

  const adjustedChecks: AuditCheck[] = Array.isArray(parsed.checks)
    ? parsed.checks.slice(0, 3).map((chk, idx) => {
        if (idx === 0 && !deterministicCadence.passed) {
          return {
            ...chk,
            passed: false,
            rationale: `${deterministicCadence.summary} ${chk.rationale}`,
          };
        }
        return chk;
      })
    : [];

  return {
    overallPassed: combinedPassed,
    dialogueAlignmentScore: !deterministicCadence.passed
      ? `Out of Bounds (${deterministicCadence.violations.length} violations)`
      : parsed.dialogueAlignmentScore || 'Aligned',
    atmosphericEscalationScore: parsed.atmosphericEscalationScore || 'Evaluated',
    summaryVerdict: !deterministicCadence.passed
      ? `${deterministicCadence.summary} ${parsed.summaryVerdict || ''}`.trim()
      : parsed.summaryVerdict || 'Audit completed.',
    checks: adjustedChecks,
    deterministicCadence,
  };
}

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  const distPath = path.resolve(__dirname, 'dist');
  const distIndexPath = path.join(distPath, 'index.html');

  if (isProd && (!fs.existsSync(distPath) || !fs.existsSync(distIndexPath))) {
    console.error(
      '[startup] Production build directory "dist/" is missing or incomplete. Run "npm run build" before starting in production mode.'
    );
    process.exit(1);
  }

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, model: MODEL_NAME });
  });

  app.post('/api/pipeline/run-stream', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const abortController = new AbortController();
    const handleDisconnect = () => {
      if (!res.writableEnded && !abortController.signal.aborted) {
        abortController.abort();
      }
    };
    req.on('aborted', handleDisconnect);
    res.on('close', handleDisconnect);

    const sendEvent = (eventName: string, data: unknown) => {
      if (abortController.signal.aborted || res.writableEnded) return;
      res.write(`event: ${eventName}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const ai = getAiClient();
      const {
        episodeTitle,
        location,
        hourLabel,
        openingProse,
        priorProse,
        beatPrompt,
        characters,
        stressLevel,
        stressOverride,
        constraints,
        revisionContext,
      } = req.body as {
        episodeTitle: string;
        location: string;
        hourLabel: string;
        openingProse?: string;
        priorProse: string;
        beatPrompt: string;
        characters: CharacterState[];
        stressLevel: number;
        stressOverride: boolean;
        constraints: SystemConstraintConfig;
        revisionContext?: RevisionRequestContext;
      };

      const continuityContext = buildContinuityContext(
        openingProse || priorProse,
        priorProse
      );

      let telemetry: Stage1TelemetryResult;
      let effectiveStress: number;
      let stage1Ms = 0;

      if (revisionContext) {
        telemetry = revisionContext.telemetry;
        effectiveStress = revisionContext.effectiveStress;
        sendEvent('stage1', { telemetry, effectiveStress, elapsedMs: 0 });
      } else {
        sendEvent('status', {
          stage: 1,
          message: 'Evaluating character psychological heartbeats...',
        });
        const s1Start = Date.now();
        const s1 = await runStage1Telemetry(
          ai,
          {
            episodeTitle,
            location,
            continuityContext,
            beatPrompt,
            characters,
            stressLevel,
            stressOverride,
            constraints,
          },
          abortController.signal
        );
        if (abortController.signal.aborted) return;
        telemetry = s1.telemetry;
        effectiveStress = s1.effectiveStress;
        stage1Ms = Date.now() - s1Start;
        sendEvent('stage1', { telemetry, effectiveStress, elapsedMs: stage1Ms });
      }

      if (abortController.signal.aborted) return;

      // Stage 2: Streaming Prose & Dialogue Generation (or Targeted Revision)
      sendEvent('status', {
        stage: 2,
        message: revisionContext
          ? 'Revising prose against deterministic cadence & audit feedback...'
          : 'Streaming constraint-enforced gothic prose...',
      });

      const s2Start = Date.now();
      const systemInstruction = buildStage2SystemInstruction(
        constraints,
        telemetry,
        effectiveStress
      );

      let userPrompt = `Episode: ${episodeTitle}
Setting: ${location} · ${hourLabel}

Continuity Window:
${continuityContext}

Next Narrative Beat to Write:
${beatPrompt}`;

      if (revisionContext) {
        const violationLines =
          revisionContext.deterministicViolations.length > 0
            ? revisionContext.deterministicViolations
                .map(
                  (v, i) =>
                    `${i + 1}. ${v.speakerName} (${v.bpm} BPM, ${v.tierLabel}) spoke ${v.actualWords} words ("${v.sentenceQuote}"), but MUST speak strictly ${v.expectedMinWords}–${v.expectedMaxWords} words per sentence.`
                )
                .join('\n')
            : 'No deterministic word-count violations; focus on LLM audit critique below.';

        userPrompt = `${userPrompt}

TARGETED REVISION PASS (FIX THESE AUDIT VIOLATIONS):
Previous Draft to Revise:
"""
${revisionContext.previousProse}
"""

Exact Deterministic Cadence Violations:
${violationLines}

Audit Critique to Resolve:
${revisionContext.llmCritique}

Rewrite this scene cleanly, keeping the narrative beat and gothic atmosphere intact while ensuring EVERY spoken sentence inside double quotes strictly obeys its speaker's exact word-count range.`;
      }

      const stream = await ai.models.generateContentStream({
        model: MODEL_NAME,
        contents: userPrompt,
        config: {
          abortSignal: abortController.signal,
          systemInstruction,
          ...getOptionalThinkingConfig(MODEL_NAME),
        },
      });

      let fullProse = '';
      for await (const chunk of stream) {
        if (abortController.signal.aborted) break;
        const text = chunk.text ?? '';
        if (text) {
          fullProse += text;
          sendEvent('chunk', { text });
        }
      }
      if (abortController.signal.aborted) return;

      const stage2Ms = Date.now() - s2Start;
      sendEvent('stage2_done', { fullProse: fullProse.trim(), elapsedMs: stage2Ms });

      // Stage 3: Deterministic Cadence Check + LLM Constraint Audit
      sendEvent('status', {
        stage: 3,
        message: 'Running deterministic cadence verification & audit...',
      });
      const s3Start = Date.now();
      const audit = await runStage3Audit(
        ai,
        fullProse.trim(),
        telemetry,
        effectiveStress,
        constraints,
        abortController.signal
      );
      if (abortController.signal.aborted) return;

      const stage3Ms = Date.now() - s3Start;
      sendEvent('stage3', { audit, elapsedMs: stage3Ms });

      sendEvent('complete', {
        totalLatencyMs: stage1Ms + stage2Ms + stage3Ms,
      });
      if (!res.writableEnded) {
        res.end();
      }
    } catch (err) {
      if (abortController.signal.aborted || (err as Error)?.name === 'AbortError') {
        if (!res.writableEnded) {
          res.end();
        }
        return;
      }
      const formatted = formatApiError(err);
      sendEvent('pipeline_error', formatted);
      if (!res.writableEnded) {
        res.end();
      }
    }
  });

  app.post('/api/pipeline/narrate', async (req, res) => {
    const { text, stressLevel } = req.body as {
      text?: string;
      stressLevel?: number;
    };

    if (!text || typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ error: 'Prose text is required for gothic voice narration.' });
      return;
    }

    const abortController = new AbortController();
    const handleDisconnect = () => {
      if (!res.writableEnded && !abortController.signal.aborted) {
        abortController.abort();
      }
    };
    req.on('aborted', handleDisconnect);
    res.on('close', handleDisconnect);

    try {
      const ai = getAiClient();
      const clampedStress = Math.max(0, Math.min(100, Number(stressLevel) || 50));
      const style =
        clampedStress >= 75
          ? 'Whispered, tense, gothic suspense narration, slow measured dread with tight urgency'
          : clampedStress >= 45
            ? 'Low, atmospheric gothic suspense narration, grave and measured'
            : 'Calm, velvety nocturnal gothic narration, deliberate pacing';

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: text.trim().slice(0, 2800),
                speechMetadata: { style },
              },
            ],
          },
        ],
        config: {
          abortSignal: abortController.signal,
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Charon' },
            },
          },
        },
      });

      if (abortController.signal.aborted) return;

      const audioBase64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!audioBase64) {
        res.status(502).json({ error: 'Narration model did not return audio data.' });
        return;
      }

      res.json({
        audioBase64,
        mimeType: 'audio/wav',
      });
    } catch (err) {
      if (abortController.signal.aborted || (err as Error)?.name === 'AbortError') {
        return;
      }
      const formatted = formatApiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(distIndexPath);
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(
      `Storyteller Co-Pilot server running on http://0.0.0.0:${port} (model: ${MODEL_NAME})`
    );
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
