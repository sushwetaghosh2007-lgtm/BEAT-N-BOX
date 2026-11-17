import React from 'react';
import { Play, Square } from 'lucide-react';
import type { WorkspaceTab } from '../types/storyteller';

interface TopBarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  onPrimaryAction: () => void;
  onCancelAction: () => void;
  isRunning: boolean;
  primaryLabel: string;
}

const NAV_ITEMS: { id: WorkspaceTab; label: string }[] = [
  { id: 'pipeline', label: 'Live Pipeline' },
  { id: 'constraints', label: 'System Constraints' },
];

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  onPrimaryAction,
  onCancelAction,
  isRunning,
  primaryLabel,
}) => {
  return (
    <header className="sticky top-0 z-30 border-b border-[#27272E] bg-[#0B0B0D]/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-6 py-3.5">
        <button
          type="button"
          onClick={() => onSelectTab('pipeline')}
          className="font-display text-2xl font-semibold tracking-tight text-[#F3EFEA] whitespace-nowrap shrink-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C83E4D] rounded"
        >
          Storyteller Co-Pilot
        </button>

        <nav aria-label="Workspace Navigation" className="hidden md:flex items-center gap-7">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`relative py-1.5 text-sm font-medium transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C83E4D] rounded ${
                  isActive
                    ? 'text-[#F3EFEA]'
                    : 'text-[#9C9790] hover:text-[#F3EFEA]'
                }`}
              >
                {item.label}
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-0 -bottom-[15px] h-[2px] transition-opacity duration-150 ${
                    isActive ? 'bg-[#C83E4D] opacity-100' : 'opacity-0'
                  }`}
                />
              </button>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          {isRunning ? (
            <button
              type="button"
              onClick={onCancelAction}
              className="inline-flex items-center gap-2 rounded-md border border-[#C83E4D] bg-[#261216] px-4 py-2 text-xs font-semibold text-[#F8E6E8] transition-colors duration-150 hover:bg-[#3A1920] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F3EFEA]"
            >
              <Square className="h-3.5 w-3.5 fill-current text-[#E14B5A]" aria-hidden="true" />
              <span>Cancel Run</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onPrimaryAction}
              className="inline-flex items-center gap-2 rounded-md bg-[#C83E4D] px-4 py-2 text-xs font-semibold text-[#F3EFEA] transition-colors duration-150 hover:bg-[#D64B5B] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F3EFEA]"
            >
              <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              <span>{primaryLabel}</span>
            </button>
          )}
        </div>
      </div>

      {/* Mobile navigation strip */}
      <nav
        aria-label="Mobile Workspace Navigation"
        className="flex md:hidden items-center gap-5 overflow-x-auto border-t border-[#1D1D23] px-6 py-2"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`text-xs font-medium whitespace-nowrap shrink-0 py-1 ${
                isActive ? 'text-[#F3EFEA] underline decoration-[#C83E4D] underline-offset-4' : 'text-[#9C9790]'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
