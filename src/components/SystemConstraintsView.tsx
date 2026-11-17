import React from 'react';
import { RotateCcw } from 'lucide-react';
import type { CadenceTierId, SystemConstraintConfig } from '../types/storyteller';

interface SystemConstraintsViewProps {
  constraints: SystemConstraintConfig;
  onUpdateConstraints: (next: SystemConstraintConfig) => void;
  onResetDefaults: () => void;
}

export const SystemConstraintsView: React.FC<SystemConstraintsViewProps> = ({
  constraints,
  onUpdateConstraints,
  onResetDefaults,
}) => {
  const updateBand = (
    tierId: CadenceTierId,
    field: 'syntaxDirective' | 'dialogueTrait',
    value: string
  ) => {
    onUpdateConstraints({
      ...constraints,
      cadenceBands: constraints.cadenceBands.map((band) =>
        band.id === tierId ? { ...band, [field]: value } : band
      ),
    });
  };

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-6 border-b border-[#27272E] pb-6">
        <div className="max-w-2xl">
          <p className="text-xs font-medium text-[#9C9790]">
            Live Pipeline System Prompt Engineering
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-[#F3EFEA] text-balance">
            Episodic Gothic Suspense &amp; Heartbeat Constraints
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[#9C9790]">
            Edits made here propagate immediately to Stage 1 telemetry, Stage 2 prose generation, and Stage 3 constraint verification.
          </p>
        </div>

        <button
          type="button"
          onClick={onResetDefaults}
          className="inline-flex items-center gap-2 rounded-md border border-[#2A2A33] bg-[#1A1A20] px-4 py-2 text-xs font-medium text-[#D6D0C8] hover:text-[#F3EFEA] whitespace-nowrap shrink-0"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Restore Defaults</span>
        </button>
      </div>

      {/* Primary System Directives */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-[#27272E] bg-[#131317] p-5 space-y-4">
          <div>
            <label
              htmlFor="core-directive"
              className="block text-xs font-semibold text-[#D6D0C8]"
            >
              01. Core Heartbeat &amp; Dialogue Directive
            </label>
            <textarea
              id="core-directive"
              rows={4}
              value={constraints.coreDirective}
              onChange={(e) =>
                onUpdateConstraints({ ...constraints, coreDirective: e.target.value })
              }
              className="mt-2 w-full rounded-md border border-[#27272E] bg-[#0B0B0D] px-3.5 py-2.5 text-sm leading-relaxed text-[#F3EFEA] focus:border-[#C83E4D] focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="atmospheric-directive"
              className="block text-xs font-semibold text-[#D6D0C8]"
            >
              02. High-Stress Atmospheric Escalation Rule
            </label>
            <textarea
              id="atmospheric-directive"
              rows={4}
              value={constraints.atmosphericDirective}
              onChange={(e) =>
                onUpdateConstraints({
                  ...constraints,
                  atmosphericDirective: e.target.value,
                })
              }
              className="mt-2 w-full rounded-md border border-[#27272E] bg-[#0B0B0D] px-3.5 py-2.5 text-sm leading-relaxed text-[#F3EFEA] focus:border-[#C83E4D] focus:outline-none"
            />
          </div>
        </div>

        <div className="rounded-lg border border-[#27272E] bg-[#131317] p-5 space-y-4">
          <div>
            <label
              htmlFor="episodic-hook-rule"
              className="block text-xs font-semibold text-[#D6D0C8]"
            >
              03. Episodic Suspense Hook Constraint
            </label>
            <textarea
              id="episodic-hook-rule"
              rows={4}
              value={constraints.episodicHookRule}
              onChange={(e) =>
                onUpdateConstraints({ ...constraints, episodicHookRule: e.target.value })
              }
              className="mt-2 w-full rounded-md border border-[#27272E] bg-[#0B0B0D] px-3.5 py-2.5 text-sm leading-relaxed text-[#F3EFEA] focus:border-[#C83E4D] focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="forbidden-tropes"
              className="block text-xs font-semibold text-[#D6D0C8]"
            >
              04. Guardrails &amp; Prohibited Tropes
            </label>
            <textarea
              id="forbidden-tropes"
              rows={4}
              value={constraints.forbiddenTropes}
              onChange={(e) =>
                onUpdateConstraints({ ...constraints, forbiddenTropes: e.target.value })
              }
              className="mt-2 w-full rounded-md border border-[#27272E] bg-[#0B0B0D] px-3.5 py-2.5 text-sm leading-relaxed text-[#F3EFEA] focus:border-[#C83E4D] focus:outline-none"
            />
          </div>
        </div>
      </section>

      {/* BPM Cadence Matrix */}
      <section className="rounded-lg border border-[#27272E] bg-[#131317]">
        <div className="border-b border-[#23232A] px-6 py-4">
          <h2 className="font-display text-2xl font-semibold text-[#F3EFEA]">
            Psychological Heartbeat Cadence Matrix
          </h2>
          <p className="mt-0.5 text-xs text-[#9C9790]">
            Syntax length and behavioural modifiers injected per character BPM bracket.
          </p>
        </div>

        <div className="divide-y divide-[#23232A]">
          {constraints.cadenceBands.map((band) => (
            <div
              key={band.id}
              className="grid grid-cols-1 gap-4 px-6 py-5 md:grid-cols-[220px_1fr_1fr]"
            >
              <div>
                <div className="text-sm font-semibold text-[#F3EFEA]">{band.label}</div>
                <div className="mt-1 font-mono text-xs tabular-nums text-[#C83E4D]">
                  {band.minBpm}–{band.maxBpm} BPM
                </div>
              </div>

              <div>
                <label
                  htmlFor={`syntax-${band.id}`}
                  className="block text-[11px] font-medium text-[#8A847C]"
                >
                  Syntax &amp; Clause Directive
                </label>
                <input
                  id={`syntax-${band.id}`}
                  type="text"
                  value={band.syntaxDirective}
                  onChange={(e) =>
                    updateBand(band.id, 'syntaxDirective', e.target.value)
                  }
                  className="mt-1.5 w-full rounded border border-[#27272E] bg-[#0B0B0D] px-3 py-2 text-xs text-[#F3EFEA] focus:border-[#C83E4D] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor={`trait-${band.id}`}
                  className="block text-[11px] font-medium text-[#8A847C]"
                >
                  Dialogue Behaviour Trait
                </label>
                <input
                  id={`trait-${band.id}`}
                  type="text"
                  value={band.dialogueTrait}
                  onChange={(e) =>
                    updateBand(band.id, 'dialogueTrait', e.target.value)
                  }
                  className="mt-1.5 w-full rounded border border-[#27272E] bg-[#0B0B0D] px-3 py-2 text-xs text-[#F3EFEA] focus:border-[#C83E4D] focus:outline-none"
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
