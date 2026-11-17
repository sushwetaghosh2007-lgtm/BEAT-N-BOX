import React from 'react';
import { Lock, Activity } from 'lucide-react';
import type { CadenceBandRule, CharacterState } from '../types/storyteller';
import { resolveCadenceTier } from '../data/scenarios';

interface HeartbeatMonitorProps {
  character: CharacterState;
  cadenceBands: CadenceBandRule[];
  onBpmChange: (id: string, bpm: number) => void;
  onToggleAutoDrive: (id: string) => void;
}

export const HeartbeatMonitor: React.FC<HeartbeatMonitorProps> = ({
  character,
  cadenceBands,
  onBpmChange,
  onToggleAutoDrive,
}) => {
  const tier = resolveCadenceTier(character.bpm);
  const band = cadenceBands.find((b) => b.id === tier.id) ?? cadenceBands[0];

  // Cycle duration in seconds scales inversely with BPM
  const cycleSec = Math.max(0.65, Number(((60 / character.bpm) * 2.2).toFixed(2)));
  const isElevated = character.bpm >= 119;
  const isFractured = character.bpm >= 146;

  const strokeColor = isFractured
    ? '#E14B5A'
    : isElevated
      ? '#D97706'
      : '#9C9790';

  const bpmColorClass = isFractured
    ? 'text-[#E14B5A]'
    : isElevated
      ? 'text-[#EAB308]'
      : 'text-[#F3EFEA]';

  // Higher BPM yields sharper QRS amplitude
  const peakY = isFractured ? 4 : isElevated ? 7 : 11;
  const valleyY = isFractured ? 36 : isElevated ? 33 : 29;
  const ecgSegment = `M 0 20 L 22 20 L 27 16 L 31 20 L 36 22 L 40 ${peakY} L 45 ${valleyY} L 49 20 L 56 15 L 62 20 L 90 20`;
  const ecgDoubled = `${ecgSegment} M 90 20 L 112 20 L 117 16 L 121 20 L 126 22 L 130 ${peakY} L 135 ${valleyY} L 139 20 L 146 15 L 152 20 L 180 20`;

  return (
    <div className="border-b border-[#23232A] py-4 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-display text-lg font-semibold text-[#F3EFEA] leading-tight truncate">
            {character.name}
          </h4>
          <p className="mt-0.5 text-xs text-[#9C9790] truncate">{character.role}</p>
        </div>

        <div className="text-right shrink-0">
          <div className={`font-mono text-xl font-semibold tabular-nums leading-none ${bpmColorClass}`}>
            {character.bpm}
            <span className="ml-1 text-[11px] font-normal text-[#9C9790]">BPM</span>
          </div>
        </div>
      </div>

      {/* Live ECG Trace */}
      <div className="my-2.5 h-10 w-full overflow-hidden rounded border border-[#23232A] bg-[#0B0B0D] px-1">
        <svg
          viewBox="0 0 90 40"
          preserveAspectRatio="none"
          className="h-full w-[200%] animate-ecg-scroll"
          style={{ '--ecg-duration': `${cycleSec}s` } as React.CSSProperties}
          aria-hidden="true"
        >
          <path
            d={ecgDoubled}
            fill="none"
            stroke={strokeColor}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-[#D6D0C8] truncate">{band.label}</span>
        <button
          type="button"
          onClick={() => onToggleAutoDrive(character.id)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#9C9790] hover:text-[#F3EFEA] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C83E4D] rounded px-1 py-0.5"
          title={
            character.autoDrive
              ? 'Stage 1 updates BPM from narrative tension. Click to pin manually.'
              : 'BPM is pinned manually. Click to let Stage 1 drive from tension.'
          }
        >
          {character.autoDrive ? (
            <>
              <Activity className="h-3 w-3 text-[#16A34A]" aria-hidden="true" />
              <span>Auto-Drive</span>
            </>
          ) : (
            <>
              <Lock className="h-3 w-3 text-[#C83E4D]" aria-hidden="true" />
              <span>Pinned</span>
            </>
          )}
        </button>
      </div>

      <div className="mt-2">
        <label className="sr-only" htmlFor={`bpm-slider-${character.id}`}>
          {character.name} psychological heartbeat in BPM
        </label>
        <input
          id={`bpm-slider-${character.id}`}
          type="range"
          min={55}
          max={175}
          value={character.bpm}
          onChange={(e) => onBpmChange(character.id, Number(e.target.value))}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-[#27272E] accent-[#C83E4D]"
        />
      </div>

      <p className="mt-1.5 text-[11px] leading-relaxed text-[#8A847C]">
        {band.syntaxDirective}
      </p>
    </div>
  );
};
