import { useCallback, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_SYSTEM_CONSTRAINTS,
  STARTER_EPISODES,
} from './data/scenarios';
import type {
  CharacterState,
  GeneratedBeat,
  PipelineStageTiming,
  RevisionRequestContext,
  Stage1TelemetryResult,
  Stage3AuditResult,
  SystemConstraintConfig,
  WorkspaceTab,
} from './types/storyteller';
import { TopBar } from './components/TopBar';
import { LivePipelineView } from './components/LivePipelineView';
import { SystemConstraintsView } from './components/SystemConstraintsView';

interface EpisodeRuntimeState {
  characters: CharacterState[];
  stressLevel: number;
  stressOverride: boolean;
  beats: GeneratedBeat[];
  latestTelemetry: Stage1TelemetryResult | null;
  latestAudit: Stage3AuditResult | null;
  beatPrompt: string;
}

function buildInitialState(): Record<string, EpisodeRuntimeState> {
  const state: Record<string, EpisodeRuntimeState> = {};
  for (const ep of STARTER_EPISODES) {
    state[ep.id] = {
      characters: ep.characters.map((c) => ({ ...c })),
      stressLevel: ep.initialStress,
      stressOverride: false,
      beats: [],
      latestTelemetry: null,
      latestAudit: null,
      beatPrompt: ep.presetBeats[0]?.prompt ?? '',
    };
  }
  return state;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('pipeline');
  const [activeEpisodeId, setActiveEpisodeId] = useState<string>(
    STARTER_EPISODES[0].id
  );
  const [episodeStates, setEpisodeStates] = useState<
    Record<string, EpisodeRuntimeState>
  >(buildInitialState);
  const [constraints, setConstraints] = useState<SystemConstraintConfig>(
    DEFAULT_SYSTEM_CONSTRAINTS
  );

  // Live streaming pipeline execution state
  const [isRunning, setIsRunning] = useState(false);
  const [revisingBeatId, setRevisingBeatId] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<0 | 1 | 2 | 3>(0);
  const [stageStatusMessage, setStageStatusMessage] = useState('');
  const [streamingProse, setStreamingProse] = useState('');
  const [stageTimings, setStageTimings] = useState<PipelineStageTiming>({
    stage1Ms: null,
    stage2Ms: null,
    stage3Ms: null,
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const activeEpisode = useMemo(
    () =>
      STARTER_EPISODES.find((ep) => ep.id === activeEpisodeId) ??
      STARTER_EPISODES[0],
    [activeEpisodeId]
  );

  const currentEpState = episodeStates[activeEpisode.id];

  const updateCurrentEpState = useCallback(
    (updater: (prev: EpisodeRuntimeState) => EpisodeRuntimeState) => {
      setEpisodeStates((prev) => ({
        ...prev,
        [activeEpisode.id]: updater(prev[activeEpisode.id]),
      }));
    },
    [activeEpisode.id]
  );

  const handleBpmChange = useCallback(
    (charId: string, bpm: number) => {
      updateCurrentEpState((prev) => ({
        ...prev,
        characters: prev.characters.map((c) =>
          c.id === charId ? { ...c, bpm, autoDrive: false } : c
        ),
      }));
    },
    [updateCurrentEpState]
  );

  const handleToggleAutoDrive = useCallback(
    (charId: string) => {
      updateCurrentEpState((prev) => ({
        ...prev,
        characters: prev.characters.map((c) =>
          c.id === charId ? { ...c, autoDrive: !c.autoDrive } : c
        ),
      }));
    },
    [updateCurrentEpState]
  );

  const handleStressChange = useCallback(
    (val: number) => {
      updateCurrentEpState((prev) => ({
        ...prev,
        stressLevel: val,
        stressOverride: true,
      }));
    },
    [updateCurrentEpState]
  );

  const handleToggleStressOverride = useCallback(() => {
    updateCurrentEpState((prev) => ({
      ...prev,
      stressOverride: !prev.stressOverride,
    }));
  }, [updateCurrentEpState]);

  const handleCancelPipeline = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsRunning(false);
    setRevisingBeatId(null);
    setActiveStage(0);
    setStageStatusMessage('');
    setStreamingProse('');
  }, []);

  const handleResetEpisode = useCallback(() => {
    const template = STARTER_EPISODES.find((ep) => ep.id === activeEpisode.id);
    if (!template) return;
    setEpisodeStates((prev) => ({
      ...prev,
      [activeEpisode.id]: {
        characters: template.characters.map((c) => ({ ...c })),
        stressLevel: template.initialStress,
        stressOverride: false,
        beats: [],
        latestTelemetry: null,
        latestAudit: null,
        beatPrompt: template.presetBeats[0]?.prompt ?? '',
      },
    }));
    setStageTimings({ stage1Ms: null, stage2Ms: null, stage3Ms: null });
    setActiveStage(0);
    setStreamingProse('');
    setErrorMessage(null);
  }, [activeEpisode.id]);

  const executePipelineStream = useCallback(
    async (
      promptToRun: string,
      revisionContext?: RevisionRequestContext
    ) => {
      if (!promptToRun || isRunning) return;

      if (activeTab !== 'pipeline') {
        setActiveTab('pipeline');
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsRunning(true);
      setRevisingBeatId(revisionContext ? revisionContext.beatId : null);
      setActiveStage(revisionContext ? 2 : 1);
      setStageStatusMessage(
        revisionContext
          ? 'Revising prose against deterministic cadence & audit feedback...'
          : 'Evaluating character psychological heartbeats...'
      );
      setStreamingProse('');
      setErrorMessage(null);
      setStageTimings({ stage1Ms: null, stage2Ms: null, stage3Ms: null });

      const beatsBeforeTarget = revisionContext
        ? currentEpState.beats.filter((b) => b.beatIndex < revisionContext.beatIndex)
        : currentEpState.beats;

      const priorProse = [
        activeEpisode.openingProse,
        ...beatsBeforeTarget.map((b) => b.prose),
      ].join('\n\n');

      let capturedTelemetry: Stage1TelemetryResult | null =
        revisionContext?.telemetry ?? null;
      let capturedStress =
        revisionContext?.effectiveStress ?? currentEpState.stressLevel;
      let capturedProse = '';
      let capturedAudit: Stage3AuditResult | null = null;
      let capturedTotalMs = 0;

      try {
        const response = await fetch('/api/pipeline/run-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            episodeTitle: activeEpisode.title,
            location: activeEpisode.location,
            hourLabel: activeEpisode.hourLabel,
            openingProse: activeEpisode.openingProse,
            priorProse,
            beatPrompt: promptToRun,
            characters: currentEpState.characters,
            stressLevel: currentEpState.stressLevel,
            stressOverride: currentEpState.stressOverride,
            constraints,
            revisionContext,
          }),
        });

        if (!response.ok || !response.body) {
          throw new Error('Pipeline server returned an unexpected response.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const processEventBlock = (block: string) => {
          const lines = block.split('\n');
          let eventName = 'message';
          const dataLines: string[] = [];

          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              dataLines.push(line.slice(5).trim());
            }
          }

          if (dataLines.length === 0) return;
          const payload = JSON.parse(dataLines.join('\n'));

          if (eventName === 'status') {
            setActiveStage(payload.stage);
            setStageStatusMessage(payload.message);
          } else if (eventName === 'stage1') {
            capturedTelemetry = payload.telemetry as Stage1TelemetryResult;
            capturedStress = payload.effectiveStress as number;
            setStageTimings((t) => ({ ...t, stage1Ms: payload.elapsedMs }));
            setActiveStage(2);

            if (!revisionContext) {
              updateCurrentEpState((prev) => ({
                ...prev,
                stressLevel: capturedStress,
                latestTelemetry: capturedTelemetry,
                characters: prev.characters.map((char) => {
                  const upd = capturedTelemetry?.characterUpdates.find(
                    (u) => u.characterId === char.id
                  );
                  return upd
                    ? {
                        ...char,
                        bpm: upd.newBpm,
                        lastTrigger: upd.triggerReason,
                      }
                    : char;
                }),
              }));
            }
          } else if (eventName === 'chunk') {
            const delta = payload.text as string;
            capturedProse += delta;
            setStreamingProse((prev) => prev + delta);
          } else if (eventName === 'stage2_done') {
            capturedProse = payload.fullProse as string;
            setStageTimings((t) => ({ ...t, stage2Ms: payload.elapsedMs }));
            setActiveStage(3);
          } else if (eventName === 'stage3') {
            capturedAudit = payload.audit as Stage3AuditResult;
            setStageTimings((t) => ({ ...t, stage3Ms: payload.elapsedMs }));
            updateCurrentEpState((prev) => ({
              ...prev,
              latestAudit: capturedAudit,
            }));
          } else if (eventName === 'complete') {
            capturedTotalMs = payload.totalLatencyMs as number;
          } else if (eventName === 'pipeline_error') {
            throw new Error(payload.message || 'Pipeline execution failed.');
          }
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() ?? '';
          for (const frame of frames) {
            if (frame.trim()) {
              processEventBlock(frame);
            }
          }
        }
        if (buffer.trim()) {
          processEventBlock(buffer);
        }

        if (capturedProse && !controller.signal.aborted) {
          const nowTime = new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });

          if (revisionContext) {
            updateCurrentEpState((prev) => ({
              ...prev,
              beats: prev.beats.map((b) =>
                b.id === revisionContext.beatId
                  ? {
                      ...b,
                      prose: capturedProse,
                      audit: capturedAudit,
                      latencyMs: capturedTotalMs,
                      createdAt: nowTime,
                    }
                  : b
              ),
              latestTelemetry: capturedTelemetry,
              latestAudit: capturedAudit,
            }));
          } else {
            const nextBeatIndex = currentEpState.beats.length + 1;
            const newBeat: GeneratedBeat = {
              id: `${activeEpisode.id}-beat-${Date.now()}`,
              beatIndex: nextBeatIndex,
              prompt: promptToRun,
              prose: capturedProse,
              stressLevel: capturedStress,
              telemetry: capturedTelemetry,
              audit: capturedAudit,
              latencyMs: capturedTotalMs,
              createdAt: nowTime,
            };

            updateCurrentEpState((prev) => ({
              ...prev,
              beats: [...prev.beats, newBeat],
              latestTelemetry: capturedTelemetry,
              latestAudit: capturedAudit,
            }));
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setErrorMessage(
            err instanceof Error
              ? err.message
              : 'Pipeline execution encountered an error.'
          );
        }
      } finally {
        setIsRunning(false);
        setRevisingBeatId(null);
        setActiveStage(0);
        setStageStatusMessage('');
        setStreamingProse('');
      }
    },
    [
      activeEpisode,
      activeTab,
      constraints,
      currentEpState,
      isRunning,
      updateCurrentEpState,
    ]
  );

  const runLivePipeline = useCallback(
    (customPrompt?: string) => {
      const promptToRun = (customPrompt ?? currentEpState.beatPrompt).trim();
      void executePipelineStream(promptToRun);
    },
    [currentEpState.beatPrompt, executePipelineStream]
  );

  const handleReviseBeat = useCallback(
    (beat: GeneratedBeat) => {
      if (!beat.telemetry || !beat.audit || isRunning) return;
      const revisionContext: RevisionRequestContext = {
        beatId: beat.id,
        beatIndex: beat.beatIndex,
        previousProse: beat.prose,
        telemetry: beat.telemetry,
        effectiveStress: beat.stressLevel,
        deterministicViolations:
          beat.audit.deterministicCadence?.violations ?? [],
        llmCritique: [
          beat.audit.summaryVerdict,
          ...beat.audit.checks
            .filter((c) => !c.passed)
            .map((c) => `${c.criterion}: ${c.rationale}`),
        ].join(' | '),
      };
      void executePipelineStream(beat.prompt, revisionContext);
    },
    [executePipelineStream, isRunning]
  );

  const handleSelectEpisode = useCallback(
    (episodeId: string) => {
      if (isRunning) return;
      setActiveEpisodeId(episodeId);
      setStageTimings({ stage1Ms: null, stage2Ms: null, stage3Ms: null });
      setErrorMessage(null);
    },
    [isRunning]
  );

  return (
    <div className="min-h-screen bg-[#0B0B0D] text-[#F3EFEA]">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onPrimaryAction={() => runLivePipeline()}
        onCancelAction={handleCancelPipeline}
        isRunning={isRunning}
        primaryLabel="Run Pipeline Test"
      />

      {activeTab === 'pipeline' && (
        <LivePipelineView
          episodes={STARTER_EPISODES}
          activeEpisode={activeEpisode}
          onSelectEpisode={handleSelectEpisode}
          characters={currentEpState.characters}
          onBpmChange={handleBpmChange}
          onToggleAutoDrive={handleToggleAutoDrive}
          stressLevel={currentEpState.stressLevel}
          stressOverride={currentEpState.stressOverride}
          onStressChange={handleStressChange}
          onToggleStressOverride={handleToggleStressOverride}
          beats={currentEpState.beats}
          streamingProse={streamingProse}
          activeStage={activeStage}
          stageStatusMessage={stageStatusMessage}
          stageTimings={stageTimings}
          latestTelemetry={currentEpState.latestTelemetry}
          latestAudit={currentEpState.latestAudit}
          beatPrompt={currentEpState.beatPrompt}
          onBeatPromptChange={(val) =>
            updateCurrentEpState((prev) => ({ ...prev, beatPrompt: val }))
          }
          onRunPipeline={runLivePipeline}
          onCancelPipeline={handleCancelPipeline}
          onReviseBeat={handleReviseBeat}
          revisingBeatId={revisingBeatId}
          onResetEpisode={handleResetEpisode}
          isRunning={isRunning}
          errorMessage={errorMessage}
          onDismissError={() => setErrorMessage(null)}
          constraints={constraints}
        />
      )}

      {activeTab === 'constraints' && (
        <SystemConstraintsView
          constraints={constraints}
          onUpdateConstraints={setConstraints}
          onResetDefaults={() => setConstraints(DEFAULT_SYSTEM_CONSTRAINTS)}
        />
      )}
    </div>
  );
}
