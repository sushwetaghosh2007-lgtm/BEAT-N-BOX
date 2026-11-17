import React, { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { GeneratedBeat } from '../types/storyteller';
import { getStressBandLabel, HIGH_STRESS_REFERENCE_LINE } from '../data/scenarios';

interface StressHistoryChartProps {
  episodeTitle: string;
  initialStress: number;
  beats: GeneratedBeat[];
}

interface StressDataPoint {
  stepLabel: string;
  stressLevel: number;
  bandLabel: string;
  bpmSummary: string;
  isBaseline: boolean;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: StressDataPoint }>;
}

const StressChartTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;

  return (
    <div className="rounded-md border border-[#363640] bg-[#0B0B0D]/95 px-3 py-2 text-xs shadow-lg">
      <div className="flex items-center justify-between gap-4">
        <span className="font-semibold text-[#F3EFEA]">{point.stepLabel}</span>
        <span className="font-mono font-semibold tabular-nums text-[#E14B5A]">
          {point.stressLevel}%
        </span>
      </div>
      <div className="mt-1 text-[11px] text-[#D6D0C8]">{point.bandLabel}</div>
      {point.bpmSummary && (
        <div className="mt-1 font-mono text-[10px] tabular-nums text-[#8A847C]">
          {point.bpmSummary}
        </div>
      )}
    </div>
  );
};

export const StressHistoryChart: React.FC<StressHistoryChartProps> = ({
  episodeTitle,
  initialStress,
  beats,
}) => {
  const data = useMemo<StressDataPoint[]>(() => {
    const points: StressDataPoint[] = [
      {
        stepLabel: 'Opening',
        stressLevel: initialStress,
        bandLabel: getStressBandLabel(initialStress),
        bpmSummary: 'Episode baseline',
        isBaseline: true,
      },
    ];

    for (const beat of beats) {
      const bpmSummary = beat.telemetry
        ? beat.telemetry.characterUpdates
            .map((u) => `${u.characterName.split(' ')[0]} ${u.newBpm} BPM`)
            .join(' · ')
        : '';

      points.push({
        stepLabel: `Beat ${beat.beatIndex}`,
        stressLevel: beat.stressLevel,
        bandLabel: getStressBandLabel(beat.stressLevel),
        bpmSummary,
        isBaseline: false,
      });
    }

    return points;
  }, [initialStress, beats]);

  const latestStress = data[data.length - 1]?.stressLevel ?? initialStress;
  const peakStress = Math.max(...data.map((d) => d.stressLevel));
  const netDelta = latestStress - initialStress;

  return (
    <section
      aria-label="Episode Stress Progression Chart"
      className="rounded-lg border border-[#27272E] bg-[#131317] p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold tracking-wide text-[#9C9790]">
            Stress History · {episodeTitle}
          </h2>
          <p className="mt-0.5 text-[11px] text-[#8A847C]">
            Atmospheric stress progression across generated beats
          </p>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs tabular-nums text-[#9C9790]">
          <span>
            Current <strong className="text-[#F3EFEA] font-semibold">{latestStress}%</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Peak <strong className="text-[#F3EFEA] font-semibold">{peakStress}%</strong>
          </span>
          {beats.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className={netDelta > 0 ? 'text-[#E14B5A]' : 'text-[#16A34A]'}>
                {netDelta > 0 ? `+${netDelta}%` : `${netDelta}%`} Δ
              </span>
            </>
          )}
        </div>
      </div>

      {beats.length === 0 ? (
        <div className="mt-4 flex flex-col items-center justify-center rounded-md border border-[#23232A] bg-[#0B0B0D] px-4 py-8 text-center">
          <div className="font-mono text-xs tabular-nums text-[#9C9790]">
            Opening Baseline: {initialStress}% ({getStressBandLabel(initialStress)})
          </div>
          <p className="mt-1.5 max-w-md text-xs text-[#8A847C]">
            Run a pipeline test below to plot beat-by-beat atmospheric stress escalation for this episode.
          </p>
        </div>
      ) : (
        <div className="mt-4 h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 8, right: 12, left: -18, bottom: 0 }}
            >
              <defs>
                <linearGradient id="stressAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#C83E4D" stopOpacity={0.42} />
                  <stop offset="100%" stopColor="#C83E4D" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="#23232A"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="stepLabel"
                stroke="#8A847C"
                tick={{ fill: '#8A847C', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                tickLine={false}
                axisLine={{ stroke: '#27272E' }}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                stroke="#8A847C"
                tick={{ fill: '#8A847C', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) => `${value}%`}
              />
              <ReferenceLine
                y={HIGH_STRESS_REFERENCE_LINE}
                stroke="#C83E4D"
                strokeOpacity={0.45}
                strokeDasharray="4 4"
              />
              <Tooltip
                content={<StressChartTooltip />}
                cursor={{ stroke: '#3F3F4C', strokeWidth: 1 }}
              />
              <Area
                type="monotone"
                dataKey="stressLevel"
                stroke="#C83E4D"
                strokeWidth={2}
                fill="url(#stressAreaGradient)"
                activeDot={{ r: 5, fill: '#E14B5A', stroke: '#F3EFEA', strokeWidth: 1.5 }}
                dot={{ r: 3.5, fill: '#0B0B0D', stroke: '#C83E4D', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
};
