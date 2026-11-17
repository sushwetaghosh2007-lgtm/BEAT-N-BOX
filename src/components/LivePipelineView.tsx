import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Square,
  Activity,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  CharacterState,
  GeneratedBeat,
  GothicEpisode,
  PipelineStageTiming,
  Stage1TelemetryResult,
  Stage3AuditResult,
  SystemConstraintConfig,
} from '../types/storyteller';
import { getStressBandLabel } from '../data/scenarios';
import { base64WavToObjectUrl, gothicAudioEngine } from '../utils/audioEngine';
import { HeartbeatMonitor } from './HeartbeatMonitor';
import { StressHistoryChart } from './StressHistoryChart';

interface LivePipelineViewProps {
  episodes: GothicEpisode[];
  activeEpisode: GothicEpisode;
  onSelectEpisode: (episodeId: string) => void;
  characters: CharacterState[];
  onBpmChange: (charId: string, bpm: number) => void;
  onToggleAutoDrive: (charId: string) => void;
  stressLevel: number;
  stressOverride: boolean;
  onStressChange: (val: number) => void;
  onToggleStressOverride: () => void;
  beats: GeneratedBeat[];
  streamingProse: string;
  activeStage: 0 | 1 | 2 | 3;
  stageStatusMessage: string;
  stageTimings: PipelineStageTiming;
  latestTelemetry: Stage1TelemetryResult | null;
  latestAudit: Stage3AuditResult | null;
  beatPrompt: string;
  onBeatPromptChange: (val: string) => void;
  onRunPipeline: (customPrompt?: string) => void;
  onCancelPipeline: () => void;
  onReviseBeat: (beat: GeneratedBeat) => void;
  revisingBeatId: string | null;
  onResetEpisode: () => void;
  isRunning: boolean;
  errorMessage: string | null;
  onDismissError: () => void;
  constraints: SystemConstraintConfig;
}

const SENSORY_TERMS =
  /\b(shadow|shadows|cold|frost|damp|slick|whisper|whispers|echo|echoes|lantern|candle|tallow|gutter|guttering|fog|mist|stone|iron|breath|dark|darkness|chill|shudder|flame|smoke|tremor|silence|hiss|drip|bell|bronze|rain|latch|vault|draft|draught)\b/gi;

function renderAnnotatedProse(text: string): React.ReactNode {
  // Split out quoted dialogue vs narrative description
  const segments = text.split(/("[^"]*")/g);
  return segments.map((seg, i) => {
    if (seg.startsWith('"') && seg.endsWith('"')) {
      return (
        <span
          key={i}
          className="rounded-sm bg-[#C83E4D]/15 px-1 text-[#F8E6E8] underline decoration-[#C83E4D]/45 underline-offset-4"
          title="Heartbeat-regulated character dialogue"
        >
          {seg}
        </span>
      );
    }

    // Highlight atmospheric sensory cues inside narration
    const words = seg.split(SENSORY_TERMS);
    return (
      <React.Fragment key={i}>
        {words.map((part, j) => {
          if (j % 2 === 1) {
            return (
              <span
                key={j}
                className="text-[#E2C992] underline decoration-[#D97706]/40 decoration-dotted underline-offset-4"
                title="Stress-intensified sensory cue"
              >
                {part}
              </span>
            );
          }
          return <React.Fragment key={j}>{part}</React.Fragment>;
        })}
      </React.Fragment>
    );
  });
}

export const LivePipelineView: React.FC<LivePipelineViewProps> = ({
  episodes,
  activeEpisode,
  onSelectEpisode,
  characters,
  onBpmChange,
  onToggleAutoDrive,
  stressLevel,
  stressOverride,
  onStressChange,
  onToggleStressOverride,
  beats,
  streamingProse,
  activeStage,
  stageStatusMessage,
  stageTimings,
  latestTelemetry,
  latestAudit,
  beatPrompt,
  onBeatPromptChange,
  onRunPipeline,
  onCancelPipeline,
  onReviseBeat,
  revisingBeatId,
  onResetEpisode,
  isRunning,
  errorMessage,
  onDismissError,
  constraints,
}) => {
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [imageFailed, setImageFailed] = useState(false);

  // Web Audio Heartbeat & Ambient Drone state
  const [audioEnabled, setAudioEnabled] = useState(false);
  // Gemini TTS Gothic Narration state
  const [autoNarrate, setAutoNarrate] = useState(false);
  const [narratingId, setNarratingId] = useState<string | null>(null);
  const [loadingNarrationId, setLoadingNarrationId] = useState<string | null>(null);
  const [narrationError, setNarrationError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlsRef = useRef<Record<string, string>>({});
  const narrationAbortRef = useRef<AbortController | null>(null);
  const prevBeatsCountRef = useRef(beats.length);

  const peakBpm = Math.max(...characters.map((c) => c.bpm), 70);

  useEffect(() => {
    if (audioEnabled) {
      gothicAudioEngine.start(peakBpm, stressLevel);
    } else {
      gothicAudioEngine.stop();
    }
  }, [audioEnabled, peakBpm, stressLevel]);

  const stopNarration = useCallback(() => {
    if (narrationAbortRef.current) {
      narrationAbortRef.current.abort();
      narrationAbortRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setNarratingId(null);
    setLoadingNarrationId(null);
  }, []);

  useEffect(() => {
    return () => {
      gothicAudioEngine.stop();
      stopNarration();
      Object.values(audioUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
      audioUrlsRef.current = {};
    };
  }, [stopNarration]);

  const handleToggleAudio = () => {
    const next = !audioEnabled;
    if (next) {
      gothicAudioEngine.start(peakBpm, stressLevel);
    } else {
      gothicAudioEngine.stop();
    }
    setAudioEnabled(next);
  };

  const playNarration = useCallback(
    async (id: string, text: string, targetStress: number) => {
      if (narratingId === id || loadingNarrationId === id) {
        stopNarration();
        return;
      }

      stopNarration();
      setNarrationError(null);

      const cacheKey = `${id}:${text.length}:${text.slice(0, 32)}`;
      let url = audioUrlsRef.current[cacheKey];
      if (!url) {
        const controller = new AbortController();
        narrationAbortRef.current = controller;
        setLoadingNarrationId(id);

        try {
          const response = await fetch('/api/pipeline/narrate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, stressLevel: targetStress }),
            signal: controller.signal,
          });
          const data = (await response.json()) as { audioBase64?: string; error?: string };
          if (!response.ok || !data.audioBase64) {
            throw new Error(data.error || 'Voice narration failed.');
          }
          url = base64WavToObjectUrl(data.audioBase64);
          audioUrlsRef.current[cacheKey] = url;
        } catch (err) {
          if ((err as Error).name !== 'AbortError') {
            setNarrationError(
              err instanceof Error ? err.message : 'Unable to generate voice narration.'
            );
          }
          setLoadingNarrationId(null);
          return;
        } finally {
          if (narrationAbortRef.current === controller) {
            narrationAbortRef.current = null;
          }
        }
        setLoadingNarrationId(null);
      }

      const audio = new Audio(url);
      audioRef.current = audio;
      setNarratingId(id);
      audio.onended = () => {
        if (audioRef.current === audio) {
          audioRef.current = null;
          setNarratingId(null);
        }
      };
      audio.onerror = () => {
        setNarrationError('Audio playback failed in this browser.');
        setNarratingId(null);
      };
      try {
        await audio.play();
      } catch {
        setNarrationError('Browser blocked playback — click Narrate to play.');
        setNarratingId(null);
      }
    },
    [loadingNarrationId, narratingId, stopNarration]
  );

  // Auto-narrate newly completed beats when Auto-Narrate is toggled on
  useEffect(() => {
    const prevCount = prevBeatsCountRef.current;
    prevBeatsCountRef.current = beats.length;
    if (autoNarrate && !isRunning && beats.length === prevCount + 1) {
      const latestBeat = beats[beats.length - 1];
      if (latestBeat) {
        void playNarration(latestBeat.id, latestBeat.prose, latestBeat.stressLevel);
      }
    }
  }, [autoNarrate, beats, isRunning, playNarration]);

  // Clear narration cache if the active episode changes or beats reset
  useEffect(() => {
    stopNarration();
    Object.values(audioUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    audioUrlsRef.current = {};
    prevBeatsCountRef.current = beats.length;
  }, [activeEpisode.id, stopNarration]);

  const wordCountLive = streamingProse
    ? streamingProse.trim().split(/\s+/).filter(Boolean).length
    : beats.length > 0
      ? beats[beats.length - 1].prose.trim().split(/\s+/).filter(Boolean).length
      : 0;

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[310px_minmax(0,1fr)_340px] lg:items-start">
        {/* LEFT RAIL: Episode Selector + Character Heartbeats + Atmospheric Stress */}
        <aside className="rounded-lg border border-[#27272E] bg-[#131317] p-5">
          <div>
            <h2 className="text-xs font-semibold tracking-wide text-[#9C9790]">
              01. Active Episode
            </h2>
            <div className="mt-3 space-y-1.5">
              {episodes.map((ep) => {
                const selected = ep.id === activeEpisode.id;
                return (
                  <button
                    key={ep.id}
                    type="button"
                    disabled={isRunning}
                    onClick={() => {
                      setImageFailed(false);
                      onSelectEpisode(ep.id);
                    }}
                    className={`w-full rounded-md px-3 py-2 text-left transition-colors duration-150 disabled:opacity-60 ${
                      selected
                        ? 'bg-[#1D1D24] text-[#F3EFEA] border border-[#363640]'
                        : 'text-[#9C9790] hover:bg-[#191920] hover:text-[#F3EFEA] border border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-base font-semibold truncate">
                        {ep.title}
                      </span>
                      <span className="font-mono text-[11px] text-[#8A847C] shrink-0">
                        {ep.episodeNumber}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-[#8A847C] truncate">
                      {ep.location}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="my-5 border-t border-[#23232A]" />

          {/* Character Psychological Heartbeats */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold tracking-wide text-[#9C9790]">
                02. Psychological Heartbeat
              </h2>
              <span className="font-mono text-[11px] text-[#8A847C] tabular-nums">
                55–175 BPM
              </span>
            </div>

            <div className="mt-2">
              {characters.map((char) => (
                <HeartbeatMonitor
                  key={char.id}
                  character={char}
                  cadenceBands={constraints.cadenceBands}
                  onBpmChange={onBpmChange}
                  onToggleAutoDrive={onToggleAutoDrive}
                />
              ))}
            </div>
          </div>

          <div className="my-5 border-t border-[#23232A]" />

          {/* Environmental Stress Control */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold tracking-wide text-[#9C9790]">
                03. Atmospheric Stress
              </h2>
              <button
                type="button"
                onClick={onToggleStressOverride}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#9C9790] hover:text-[#F3EFEA] transition-colors"
              >
                {stressOverride ? (
                  <>
                    <Lock className="h-3 w-3 text-[#C83E4D]" aria-hidden="true" />
                    <span>Pinned</span>
                  </>
                ) : (
                  <>
                    <Activity className="h-3 w-3 text-[#16A34A]" aria-hidden="true" />
                    <span>Auto-Scale</span>
                  </>
                )}
              </button>
            </div>

            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-sm font-medium text-[#F3EFEA]">
                {getStressBandLabel(stressLevel)}
              </span>
              <span className="font-mono text-lg font-semibold tabular-nums text-[#F3EFEA]">
                {stressLevel}%
              </span>
            </div>

            <label className="sr-only" htmlFor="scene-stress-slider">
              Scene atmospheric stress intensity
            </label>
            <input
              id="scene-stress-slider"
              type="range"
              min={5}
              max={100}
              value={stressLevel}
              onChange={(e) => onStressChange(Number(e.target.value))}
              className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-[#27272E] accent-[#C83E4D]"
            />

            <p className="mt-2 text-[11px] leading-relaxed text-[#8A847C]">
              Higher stress compresses spatial geometry, sharpens acoustics, and intensifies dark sensory prose.
            </p>

            {/* Live Heartbeat & Ambient Drone Audio Toggle */}
            <div className="mt-4 border-t border-[#23232A] pt-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-medium text-[#F3EFEA]">
                    Heartbeat &amp; Room Drone
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] tabular-nums text-[#8A847C]">
                    Syncs to peak {peakBpm} BPM · {stressLevel}% stress
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleToggleAudio}
                  className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    audioEnabled
                      ? 'border-[#C83E4D] bg-[#261216] text-[#F8E6E8] hover:bg-[#3A1920]'
                      : 'border-[#2A2A33] bg-[#1A1A20] text-[#D6D0C8] hover:text-[#F3EFEA]'
                  }`}
                >
                  {audioEnabled ? (
                    <>
                      <Volume2 className="h-3.5 w-3.5 text-[#E14B5A]" aria-hidden="true" />
                      <span>Sound On</span>
                    </>
                  ) : (
                    <>
                      <VolumeX className="h-3.5 w-3.5 text-[#9C9790]" aria-hidden="true" />
                      <span>Enable Sound</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* CENTER VIEWPORT: Banner + Pipeline Stage Tracker + Streaming Manuscript + Composer */}
        <main className="min-w-0 space-y-5">
          {/* Atmospheric Scene Header */}
          <section className="overflow-hidden rounded-lg border border-[#27272E] bg-[#131317]">
            <div className="relative h-44 w-full bg-[#191920]">
              {!imageFailed ? (
                <img
                  src={activeEpisode.imageUrl}
                  alt={activeEpisode.imageAlt}
                  referrerPolicy="no-referrer"
                  onError={() => setImageFailed(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#16161C] via-[#1C171B] to-[#0B0B0D]">
                  <span className="font-display text-2xl text-[#9C9790]">
                    {activeEpisode.title}
                  </span>
                </div>
              )}
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-[#131317] via-[#131317]/65 to-transparent"
              />
              <div className="absolute inset-x-0 bottom-0 p-5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#D6D0C8]">
                  <span>{activeEpisode.episodeNumber}</span>
                  <span aria-hidden="true">·</span>
                  <span>{activeEpisode.location}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{activeEpisode.hourLabel}</span>
                </div>
                <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-[#F3EFEA] text-balance">
                  {activeEpisode.title}
                </h1>
              </div>
            </div>

            {/* 3-Stage Live Pipeline Execution Bar */}
            <div className="grid grid-cols-1 divide-y divide-[#23232A] border-t border-[#23232A] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="px-4 py-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-[#D6D0C8]">01. Heartbeat Telemetry</span>
                  <span className="font-mono text-[11px] tabular-nums text-[#8A847C]">
                    {stageTimings.stage1Ms !== null ? `${stageTimings.stage1Ms} ms` : 'Ready'}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-[#9C9790]">
                  {activeStage === 1 ? (
                    <span className="inline-flex items-center gap-1.5 text-[#EAB308]">
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                      Evaluating BPM shifts
                    </span>
                  ) : stageTimings.stage1Ms !== null ? (
                    <span className="text-[#16A34A]">Telemetry locked</span>
                  ) : (
                    <span>Awaiting beat prompt</span>
                  )}
                </div>
              </div>

              <div className="px-4 py-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-[#D6D0C8]">02. Prose &amp; Dialogue Stream</span>
                  <span className="font-mono text-[11px] tabular-nums text-[#8A847C]">
                    {stageTimings.stage2Ms !== null
                      ? `${stageTimings.stage2Ms} ms`
                      : wordCountLive > 0
                        ? `${wordCountLive} w`
                        : 'Ready'}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-[#9C9790]">
                  {activeStage === 2 ? (
                    <span className="inline-flex items-center gap-1.5 text-[#C83E4D]">
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                      Streaming constrained scene
                    </span>
                  ) : stageTimings.stage2Ms !== null ? (
                    <span className="text-[#16A34A]">Stream complete ({wordCountLive} words)</span>
                  ) : (
                    <span>Enforces BPM cadence</span>
                  )}
                </div>
              </div>

              <div className="px-4 py-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-[#D6D0C8]">03. Constraint Audit</span>
                  <span className="font-mono text-[11px] tabular-nums text-[#8A847C]">
                    {stageTimings.stage3Ms !== null ? `${stageTimings.stage3Ms} ms` : 'Ready'}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-[#9C9790]">
                  {activeStage === 3 ? (
                    <span className="inline-flex items-center gap-1.5 text-[#EAB308]">
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                      Verifying syntax &amp; tension
                    </span>
                  ) : latestAudit ? (
                    <span className={latestAudit.overallPassed ? 'text-[#16A34A]' : 'text-[#D97706]'}>
                      {latestAudit.overallPassed ? 'All constraints verified' : 'Revision suggested'}
                    </span>
                  ) : (
                    <span>Post-generation audit</span>
                  )}
                </div>
              </div>
            </div>
          </section>

          {errorMessage && (
            <div
              role="alert"
              className="flex items-start justify-between gap-4 rounded-lg border border-[#C83E4D]/60 bg-[#C83E4D]/10 px-4 py-3 text-sm text-[#F8E6E8]"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#E14B5A]" aria-hidden="true" />
                <span>{errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={onDismissError}
                className="text-xs font-medium text-[#F3EFEA] underline underline-offset-4 shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Episode Stress Progression */}
          <StressHistoryChart
            episodeTitle={activeEpisode.title}
            initialStress={activeEpisode.initialStress}
            beats={beats}
          />

          {/* Manuscript Viewport */}
          <section className="rounded-lg border border-[#27272E] bg-[#131317]">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#23232A] px-6 py-3.5">
              <div className="flex items-center gap-2 text-xs text-[#9C9790]">
                <span className="font-semibold text-[#F3EFEA]">Episodic Manuscript</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {beats.length} {beats.length === 1 ? 'generated beat' : 'generated beats'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAutoNarrate((v) => !v)}
                  className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    autoNarrate
                      ? 'border-[#C83E4D] bg-[#261216] text-[#F8E6E8] hover:bg-[#3A1920]'
                      : 'border-[#2A2A33] bg-[#1A1A20] text-[#D6D0C8] hover:text-[#F3EFEA]'
                  }`}
                >
                  {autoNarrate ? (
                    <Volume2 className="h-3.5 w-3.5 text-[#E14B5A]" aria-hidden="true" />
                  ) : (
                    <VolumeX className="h-3.5 w-3.5 text-[#9C9790]" aria-hidden="true" />
                  )}
                  <span>{autoNarrate ? 'Auto-Narrate On' : 'Auto-Narrate Off'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowAnnotations((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded border border-[#2A2A33] bg-[#1A1A20] px-2.5 py-1 text-xs font-medium text-[#D6D0C8] hover:text-[#F3EFEA] transition-colors whitespace-nowrap shrink-0"
                >
                  {showAnnotations ? (
                    <Eye className="h-3.5 w-3.5 text-[#C83E4D]" aria-hidden="true" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5 text-[#9C9790]" aria-hidden="true" />
                  )}
                  <span>{showAnnotations ? 'Annotations Visible' : 'Clean Reading'}</span>
                </button>
              </div>
            </div>

            {showAnnotations && (
              <div className="flex flex-wrap items-center gap-5 border-b border-[#1E1E24] bg-[#101014] px-6 py-2 text-[11px] text-[#9C9790]">
                <span>
                  <span className="inline-block h-2 w-2 rounded-xs bg-[#C83E4D]/60 mr-1.5 align-middle" />
                  Heartbeat-regulated dialogue
                </span>
                <span>
                  <span className="inline-block h-2 w-2 rounded-xs bg-[#D97706]/60 mr-1.5 align-middle" />
                  Stress-intensified sensory cues
                </span>
              </div>
            )}

            {narrationError && (
              <div
                role="alert"
                className="flex items-center justify-between gap-3 border-b border-[#C83E4D]/40 bg-[#C83E4D]/10 px-6 py-2 text-xs text-[#F8E6E8]"
              >
                <span>{narrationError}</span>
                <button
                  type="button"
                  onClick={() => setNarrationError(null)}
                  className="underline underline-offset-4 shrink-0"
                >
                  Dismiss
                </button>
              </div>
            )}

            <div className="space-y-6 px-6 py-6">
              {/* Opening Episode Anchor */}
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[#8A847C]">
                  <div className="flex items-center gap-2">
                    <span>Opening Context</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">Baseline {activeEpisode.initialStress}% Stress</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void playNarration(
                        `opening-${activeEpisode.id}`,
                        activeEpisode.openingProse,
                        activeEpisode.initialStress
                      )
                    }
                    className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                      narratingId === `opening-${activeEpisode.id}`
                        ? 'border-[#C83E4D] bg-[#261216] text-[#F8E6E8]'
                        : 'border-[#2A2A33] bg-[#1A1A20] text-[#D6D0C8] hover:text-[#F3EFEA]'
                    }`}
                  >
                    {loadingNarrationId === `opening-${activeEpisode.id}` ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin text-[#E14B5A]" aria-hidden="true" />
                        <span>Synthesizing...</span>
                      </>
                    ) : narratingId === `opening-${activeEpisode.id}` ? (
                      <>
                        <Square className="h-2.5 w-2.5 fill-current text-[#E14B5A]" aria-hidden="true" />
                        <span>Stop Narration</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="h-3 w-3 text-[#C83E4D]" aria-hidden="true" />
                        <span>Narrate</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="font-display text-[19px] leading-[1.7] text-[#D6D0C8] whitespace-pre-line">
                  {showAnnotations
                    ? renderAnnotatedProse(activeEpisode.openingProse)
                    : activeEpisode.openingProse}
                </div>
              </div>

              {/* Generated Beats */}
              {beats.map((beat) => {
                const isBeingRevised = revisingBeatId === beat.id;
                const beatFailedAudit = Boolean(beat.audit && !beat.audit.overallPassed);

                return (
                  <article
                    key={beat.id}
                    className="border-t border-[#23232A] pt-6"
                  >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#9C9790]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-[#F3EFEA]">
                          Beat {beat.beatIndex}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {beat.stressLevel}% Stress ({getStressBandLabel(beat.stressLevel)})
                        </span>
                        {beat.telemetry && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              {beat.telemetry.characterUpdates
                                .map((u) => `${u.characterName.split(' ')[0]} ${u.newBpm} BPM`)
                                .join(' / ')}
                            </span>
                          </>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        {beatFailedAudit && (
                          <button
                            type="button"
                            disabled={isRunning}
                            onClick={() => onReviseBeat(beat)}
                            className="inline-flex items-center gap-1.5 rounded border border-[#D97706]/60 bg-[#D97706]/10 px-2.5 py-1 text-[11px] font-semibold text-[#F6D58E] hover:bg-[#D97706]/20 disabled:opacity-50 whitespace-nowrap shrink-0"
                          >
                            <RefreshCw
                              className={`h-3 w-3 ${isBeingRevised ? 'animate-spin' : ''}`}
                              aria-hidden="true"
                            />
                            <span>
                              {isBeingRevised ? 'Revising Beat...' : 'Fix with Audit Feedback'}
                            </span>
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isBeingRevised}
                          onClick={() => void playNarration(beat.id, beat.prose, beat.stressLevel)}
                          className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 ${
                            narratingId === beat.id
                              ? 'border-[#C83E4D] bg-[#261216] text-[#F8E6E8]'
                              : 'border-[#2A2A33] bg-[#1A1A20] text-[#D6D0C8] hover:text-[#F3EFEA]'
                          }`}
                        >
                          {loadingNarrationId === beat.id ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin text-[#E14B5A]" aria-hidden="true" />
                              <span>Synthesizing...</span>
                            </>
                          ) : narratingId === beat.id ? (
                            <>
                              <Square className="h-2.5 w-2.5 fill-current text-[#E14B5A]" aria-hidden="true" />
                              <span>Stop Narration</span>
                            </>
                          ) : (
                            <>
                              <Volume2 className="h-3 w-3 text-[#C83E4D]" aria-hidden="true" />
                              <span>Narrate</span>
                            </>
                          )}
                        </button>
                        <span className="font-mono text-[11px] tabular-nums text-[#8A847C]">
                          {beat.latencyMs} ms
                        </span>
                      </div>
                    </div>

                    <p className="mb-3 text-xs italic text-[#8A847C]">
                      Prompt: {beat.prompt}
                    </p>

                    <div className="font-display text-[19px] leading-[1.7] text-[#F3EFEA] whitespace-pre-line">
                      {isBeingRevised && streamingProse
                        ? showAnnotations
                          ? renderAnnotatedProse(streamingProse)
                          : streamingProse
                        : showAnnotations
                          ? renderAnnotatedProse(beat.prose)
                          : beat.prose}
                    </div>
                  </article>
                );
              })}

              {/* Active Streaming New Beat */}
              {isRunning && !revisingBeatId && (
                <article className="border-t border-[#23232A] pt-6">
                  <div className="mb-3 flex items-center justify-between gap-2 text-xs text-[#C83E4D]">
                    <span className="inline-flex items-center gap-2 font-medium">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      <span>{stageStatusMessage || 'Running live pipeline...'}</span>
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={onCancelPipeline}
                        className="inline-flex items-center gap-1.5 rounded border border-[#C83E4D]/60 bg-[#261216] px-2.5 py-1 text-[11px] font-medium text-[#F8E6E8] hover:bg-[#3A1920] whitespace-nowrap shrink-0"
                      >
                        <Square className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
                        <span>Cancel Run</span>
                      </button>
                      <span className="font-mono tabular-nums text-[#9C9790]">
                        Beat {beats.length + 1}
                      </span>
                    </div>
                  </div>

                  {streamingProse ? (
                    <div className="font-display text-[19px] leading-[1.7] text-[#F3EFEA] whitespace-pre-line">
                      {showAnnotations ? renderAnnotatedProse(streamingProse) : streamingProse}
                    </div>
                  ) : (
                    <div className="space-y-2.5 py-2" aria-hidden="true">
                      <div className="h-4 w-11/12 rounded bg-[#1E1E26] animate-pulse" />
                      <div className="h-4 w-5/6 rounded bg-[#1E1E26] animate-pulse" />
                      <div className="h-4 w-3/4 rounded bg-[#1E1E26] animate-pulse" />
                    </div>
                  )}
                </article>
              )}
            </div>
          </section>

          {/* Beat Prompt Composer */}
          <section className="rounded-lg border border-[#27272E] bg-[#131317] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label
                htmlFor="beat-prompt-input"
                className="text-xs font-semibold tracking-wide text-[#9C9790]"
              >
                Next Episodic Beat Prompt
              </label>

              <div className="flex flex-wrap items-center gap-2">
                {activeEpisode.presetBeats.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    disabled={isRunning}
                    onClick={() => onBeatPromptChange(preset.prompt)}
                    className="rounded border border-[#2A2A33] bg-[#1A1A20] px-2.5 py-1 text-xs text-[#D6D0C8] hover:border-[#3F3F4C] hover:text-[#F3EFEA] transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              id="beat-prompt-input"
              rows={3}
              value={beatPrompt}
              onChange={(e) => onBeatPromptChange(e.target.value)}
              disabled={isRunning}
              placeholder="Describe the next gothic suspense event, confrontation, or sensory anomaly..."
              className="mt-3 w-full rounded-md border border-[#27272E] bg-[#0B0B0D] px-3.5 py-2.5 text-sm leading-relaxed text-[#F3EFEA] placeholder:text-[#6E6963] focus:border-[#C83E4D] focus:outline-none disabled:opacity-60"
            />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-[#8A847C]">
                Enforces active character BPM bands &amp; {stressLevel}% stress escalation
              </span>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onResetEpisode}
                  disabled={isRunning || beats.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#2A2A33] bg-[#1A1A20] px-3.5 py-2 text-xs font-medium text-[#D6D0C8] hover:text-[#F3EFEA] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Reset Episode</span>
                </button>
                {isRunning ? (
                  <button
                    type="button"
                    onClick={onCancelPipeline}
                    className="inline-flex items-center gap-2 rounded-md border border-[#C83E4D] bg-[#261216] px-4 py-2 text-xs font-semibold text-[#F8E6E8] hover:bg-[#3A1920] whitespace-nowrap shrink-0"
                  >
                    <Square className="h-3.5 w-3.5 fill-current text-[#E14B5A]" aria-hidden="true" />
                    <span>Cancel Run</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onRunPipeline()}
                    disabled={!beatPrompt.trim()}
                    className="inline-flex items-center gap-2 rounded-md bg-[#C83E4D] px-4 py-2 text-xs font-semibold text-[#F3EFEA] hover:bg-[#D64B5B] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
                  >
                    <span>Run Pipeline Test</span>
                  </button>
                )}
              </div>
            </div>
          </section>
        </main>

        {/* RIGHT RAIL: Telemetry Delta + Atmospheric Mandates + Stage 3 Audit */}
        <aside className="rounded-lg border border-[#27272E] bg-[#131317] p-5 space-y-6">
          {/* Stage 1 Telemetry Delta */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold tracking-wide text-[#9C9790]">
                01. Heartbeat Delta Log
              </h2>
              {latestTelemetry && (
                <span className="font-mono text-[11px] text-[#8A847C] tabular-nums">
                  {latestTelemetry.recommendedStress}% Stress
                </span>
              )}
            </div>

            {latestTelemetry ? (
              <div className="mt-3 space-y-3">
                {latestTelemetry.characterUpdates.map((upd) => (
                  <div
                    key={upd.characterId}
                    className="border-b border-[#23232A] pb-3 last:border-b-0 last:pb-0"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-[#F3EFEA]">
                        {upd.characterName}
                      </span>
                      <span className="font-mono text-xs tabular-nums text-[#D6D0C8]">
                        {upd.previousBpm} &rarr; {upd.newBpm} BPM
                        {upd.deltaBpm !== 0 && (
                          <span
                            className={`ml-1.5 ${
                              upd.deltaBpm > 0 ? 'text-[#E14B5A]' : 'text-[#16A34A]'
                            }`}
                          >
                            ({upd.deltaBpm > 0 ? `+${upd.deltaBpm}` : upd.deltaBpm})
                          </span>
                        )}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[#9C9790]">{upd.cadenceLabel}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-[#8A847C]">
                      {upd.triggerReason}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs leading-relaxed text-[#8A847C]">
                Run a pipeline test to inspect Stage 1 psychological BPM shifts and dialogue triggers.
              </p>
            )}
          </div>

          <div className="border-t border-[#23232A]" />

          {/* Stage 2 Atmospheric Directives */}
          <div>
            <h2 className="text-xs font-semibold tracking-wide text-[#9C9790]">
              02. Atmospheric Directives
            </h2>
            {latestTelemetry ? (
              <div className="mt-3 space-y-2">
                <p className="text-sm font-medium text-[#F3EFEA]">
                  {latestTelemetry.atmosphericProfile}
                </p>
                <ul className="space-y-1.5 text-xs leading-relaxed text-[#B7B1A8]">
                  {latestTelemetry.sensoryMandates.map((mandate, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="font-mono text-[11px] text-[#8A847C] mt-0.5 tabular-nums">
                        0{idx + 1}
                      </span>
                      <span>{mandate}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-3 text-xs leading-relaxed text-[#8A847C]">
                Sensory escalation directives (acoustics, failing light, thermal drop) populate during Stage 1.
              </p>
            )}
          </div>

          <div className="border-t border-[#23232A]" />

          {/* Stage 3 Constraint Audit */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold tracking-wide text-[#9C9790]">
                03. Constraint Audit Verdict
              </h2>
              {latestAudit && (
                <span
                  className={`inline-flex items-center gap-1 text-xs font-semibold ${
                    latestAudit.overallPassed ? 'text-[#16A34A]' : 'text-[#D97706]'
                  }`}
                >
                  {latestAudit.overallPassed ? (
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span>{latestAudit.overallPassed ? 'Passed' : 'Drifted'}</span>
                </span>
              )}
            </div>

            {latestAudit ? (
              <div className="mt-3 space-y-3.5">
                <p className="text-xs leading-relaxed text-[#D6D0C8]">
                  {latestAudit.summaryVerdict}
                </p>

                <div className="flex items-center gap-3 text-[11px] text-[#9C9790]">
                  <span>Cadence: {latestAudit.dialogueAlignmentScore}</span>
                  <span aria-hidden="true">·</span>
                  <span>Atmosphere: {latestAudit.atmosphericEscalationScore}</span>
                </div>

                {/* Deterministic Word-Count Cadence Check */}
                {latestAudit.deterministicCadence && (
                  <div className="rounded-md border border-[#23232A] bg-[#0B0B0D] p-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#F3EFEA]">
                        Deterministic Cadence Check
                      </span>
                      <span
                        className={`text-[11px] font-medium ${
                          latestAudit.deterministicCadence.passed
                            ? 'text-[#16A34A]'
                            : 'text-[#D97706]'
                        }`}
                      >
                        {latestAudit.deterministicCadence.passed ? 'Exact Match' : 'Violations'}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {latestAudit.deterministicCadence.characterStats.map((st) => (
                        <div
                          key={st.characterName}
                          className="flex items-center justify-between gap-2 text-[11px]"
                        >
                          <span className="text-[#D6D0C8] truncate">
                            {st.characterName.split(' ')[0]} ({st.expectedMinWords}–{st.expectedMaxWords}w)
                          </span>
                          <span className="font-mono tabular-nums text-[#8A847C] shrink-0">
                            {st.sentenceCount > 0
                              ? `avg ${st.avgWords}w · ${st.outOfRangeCount} err`
                              : '0 lines'}
                          </span>
                        </div>
                      ))}
                    </div>

                    {latestAudit.deterministicCadence.violations.length > 0 && (
                      <div className="border-t border-[#1E1E24] pt-2 space-y-1.5">
                        {latestAudit.deterministicCadence.violations.slice(0, 3).map((v, idx) => (
                          <div key={idx} className="text-[11px] leading-snug text-[#F6D58E]">
                            <span className="font-mono tabular-nums">
                              {v.speakerName.split(' ')[0]} ({v.actualWords}w / target {v.expectedMinWords}–{v.expectedMaxWords}w):
                            </span>{' '}
                            <span className="italic text-[#D6D0C8]">&ldquo;{v.sentenceQuote}&rdquo;</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {!latestAudit.overallPassed && beats.length > 0 && (
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={() => onReviseBeat(beats[beats.length - 1])}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-[#D97706]/60 bg-[#D97706]/15 px-3 py-2 text-xs font-semibold text-[#F6D58E] hover:bg-[#D97706]/25 disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${
                        revisingBeatId === beats[beats.length - 1]?.id ? 'animate-spin' : ''
                      }`}
                      aria-hidden="true"
                    />
                    <span>
                      {revisingBeatId === beats[beats.length - 1]?.id
                        ? 'Revising Beat...'
                        : 'Fix with Audit Feedback'}
                    </span>
                  </button>
                )}

                <div className="space-y-3 pt-1">
                  {latestAudit.checks.map((chk, idx) => (
                    <div
                      key={idx}
                      className="rounded-md border border-[#23232A] bg-[#0F0F13] p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#F3EFEA]">
                          {chk.criterion}
                        </span>
                        <span
                          className={`text-[11px] font-medium ${
                            chk.passed ? 'text-[#16A34A]' : 'text-[#D97706]'
                          }`}
                        >
                          {chk.passed ? 'Verified' : 'Flagged'}
                        </span>
                      </div>
                      {chk.evidenceQuote && (
                        <blockquote className="mt-1.5 font-display text-sm italic text-[#D6D0C8]">
                          &ldquo;{chk.evidenceQuote}&rdquo;
                        </blockquote>
                      )}
                      <p className="mt-1.5 text-[11px] leading-relaxed text-[#8A847C]">
                        {chk.rationale}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs leading-relaxed text-[#8A847C]">
                Stage 3 evaluates generated dialogue syntax and atmospheric density against active heartbeat thresholds.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
