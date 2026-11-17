import type {
  CadenceTierId,
  GothicEpisode,
  StressThresholdBand,
  SystemConstraintConfig,
} from '../types/storyteller';

export const STRESS_THRESHOLDS: readonly StressThresholdBand[] = [
  {
    id: 'quiet-dread',
    label: 'Quiet Dread',
    min: 0,
    max: 29,
    stage2Guidance:
      'QUIET DREAD (0-29%): Maintain eerie stillness, cold architectural observation, and deceptive calm beneath formal dialogue.',
  },
  {
    id: 'rising-unease',
    label: 'Rising Unease',
    min: 30,
    max: 59,
    stage2Guidance:
      'RISING UNEASE (30-59%): Tightly weave ominous environmental cues—subtle shadow shifts, damp chill, distant drafts—between guarded exchanges.',
  },
  {
    id: 'acute-paranoia',
    label: 'Acute Paranoia',
    min: 60,
    max: 81,
    stage2Guidance:
      'ACUTE PARANOIA (60-81%): Heighten acoustic reverberation, constrict lantern radius, and pressure characters with claustrophobic framing and restless physical tension.',
  },
  {
    id: 'gothic-crisis',
    label: 'Gothic Crisis',
    min: 82,
    max: 100,
    stage2Guidance:
      'GOTHIC CRISIS (82-100%): Saturate every descriptive paragraph with oppressive sensory detail—narrowing walls, failing candle or gas light, biting cold dampness, amplified echoes, and visceral somatic dread.',
  },
] as const;

export const HIGH_STRESS_REFERENCE_LINE = 75;

export function resolveStressBand(stress: number): StressThresholdBand {
  const clamped = Math.max(0, Math.min(100, Math.round(stress)));
  const match = STRESS_THRESHOLDS.find(
    (band) => clamped >= band.min && clamped <= band.max
  );
  return match ?? STRESS_THRESHOLDS[STRESS_THRESHOLDS.length - 1];
}

export function getStressBandLabel(stress: number): string {
  return resolveStressBand(stress).label;
}

export const DEFAULT_SYSTEM_CONSTRAINTS: SystemConstraintConfig = {
  coreDirective:
    'Enforce episodic gothic suspense constraints where dialogue shifts based on character psychological heartbeat. Every spoken sentence inside double quotation marks must physically obey the exact word-count range, hesitation pattern, and breath cadence dictated by the speaker’s current BPM band.',
  atmosphericDirective:
    'Ensure atmospheric descriptions intensify proportionally during high-stress scenes: narrow spatial geometry, sharpen acoustic echoes, emphasize damp cold, failing light, and physical claustrophobia without descending into modern slang or gratuitous gore.',
  episodicHookRule:
    'Conclude every generated beat on an unresolved sensory anomaly, half-spoken confession, or encroaching dread that compels the next episodic turn.',
  forbiddenTropes:
    'Avoid modern psychological jargon ("panic attack", "adrenaline spike"), explicit BPM numbers inside the prose, camp horror tropes, or omniscient exposition that resolves the mystery prematurely.',
  cadenceBands: [
    {
      id: 'resting',
      label: 'Composure · Measured',
      minBpm: 55,
      maxBpm: 85,
      minWords: 14,
      maxWords: 24,
      syntaxDirective: 'Complete, balanced periodic sentences (14–24 words).',
      dialogueTrait:
        'Controlled Victorian restraint, veiled subtext, deliberate pauses, formal diction.',
    },
    {
      id: 'guarded',
      label: 'Guarded · Suspicious',
      minBpm: 86,
      maxBpm: 118,
      minWords: 8,
      maxWords: 14,
      syntaxDirective: 'Medium clauses (8–14 words) interrupted by self-corrections.',
      dialogueTrait:
        'Evasive deflections, rhetorical questions, clipped politeness concealing unease.',
    },
    {
      id: 'acute',
      label: 'Acute Strain · Clipped',
      minBpm: 119,
      maxBpm: 145,
      minWords: 4,
      maxWords: 9,
      syntaxDirective: 'Short urgent bursts (4–9 words) with em-dash breaks.',
      dialogueTrait:
        'Defensive interruptions, dropped formalities, repetitive grounding phrases.',
    },
    {
      id: 'fractured',
      label: 'Fractured · Breathless',
      minBpm: 146,
      maxBpm: 175,
      minWords: 1,
      maxWords: 6,
      syntaxDirective: 'Fragmented clauses (1–6 words), ellipses, rapid staccato.',
      dialogueTrait:
        'Half-finished sentences, auditory fixation, breathless whispers or sudden sharp commands.',
    },
  ],
};

export function resolveCadenceTier(bpm: number): { id: CadenceTierId; label: string } {
  if (bpm <= 85) {
    return { id: 'resting', label: 'Composure · Measured' };
  }
  if (bpm <= 118) {
    return { id: 'guarded', label: 'Guarded · Suspicious' };
  }
  if (bpm <= 145) {
    return { id: 'acute', label: 'Acute Strain · Clipped' };
  }
  return { id: 'fractured', label: 'Fractured · Breathless' };
}

export const STARTER_EPISODES: GothicEpisode[] = [
  {
    id: 'belfry-crypt',
    episodeNumber: 'Episode I',
    title: "The Bell-Founder's Crypt",
    location: 'St. Jude-in-the-Marsh',
    hourLabel: '02:15 GMT · Freezing Rain',
    premise:
      'An archivist descends the flooded spiral stair beneath St. Jude to verify why the parish ledger lists a thirteenth bronze casting that was never hung in the belfry.',
    imageUrl: '/images/gothic_belfry_crypt_1794927227240.jpg',
    imageAlt:
      'Spiral stone staircase descending into a candlelit gothic crypt with rain-streaked lancet window',
    initialStress: 38,
    characters: [
      {
        id: 'eleanor',
        name: 'Eleanor Vance',
        role: 'Diocesan Archivist',
        temperament: 'Methodical, sceptical, haunted by acoustic memory',
        bpm: 74,
        baselineBpm: 70,
        autoDrive: true,
        lastTrigger: 'Descending into damp limestone air with a single tallow lantern',
      },
      {
        id: 'julian',
        name: 'Father Julian',
        role: 'Parish Bell-Keeper',
        temperament: 'Measured, protective of parish silence, concealing frostbitten hands',
        bpm: 88,
        baselineBpm: 76,
        autoDrive: true,
        lastTrigger: 'Standing between Eleanor and the padlocked bronze vault',
      },
    ],
    presetBeats: [
      {
        label: 'Subterranean Toll',
        prompt:
          'Mid-conversation, a muffled bronze vibration rises through the wet flagstones beneath their boots—impossible, because the belfry above is empty. Eleanor demands the vault key.',
      },
      {
        label: 'Wet Ledger Ink',
        prompt:
          'Eleanor opens the parish register and notices the thirteenth entry was written in fresh iron-gall ink within the hour. Julian reaches to snuff out her lantern.',
      },
      {
        label: 'Whisper in the Well',
        prompt:
          'Something answers Eleanor’s name from behind the bricked-up ossuary arch, echoing Julian’s exact cadence back to her in the dark.',
      },
    ],
    openingProse:
      'Rain lashed the narrow lancet behind them, turning the limestone steps slick as oiled slate. Eleanor held the tallow lantern low so its meagre circle stayed clear of Father Julian’s face. "The foundry receipt is dated November 1841," she said, keeping her voice level against the hollow drip of the stairwell. "Twelve bells cast for the spire, yet the tithe roll distinctly pays for thirteen tongues of bronze."\n\nJulian did not look down from the landing. His gloved fingers rested lightly on the iron handrail, as though testing the stone for a tremor. "Some castings crack in the mould, Miss Vance, and a parish buries its failures where frost will not split them."',
  },
  {
    id: 'ashbourne-conservatory',
    episodeNumber: 'Episode II',
    title: 'Ashbourne Conservatory',
    location: 'Northumberland Coast',
    hourLabel: '23:40 GMT · Sea Fog',
    premise:
      'Inside a decaying Victorian glasshouse on a cliff edge, an heiress confronts her late brother’s physician after discovering the winter ivy has been pruned from the inside.',
    imageUrl: '/images/gothic_conservatory_night_1794927227336.jpg',
    imageAlt:
      'Abandoned Victorian iron-and-glass conservatory overgrown with dead winter ivy under silver moonlight and fog',
    initialStress: 52,
    characters: [
      {
        id: 'clara',
        name: 'Clara Ashbourne',
        role: 'Estate Heiress',
        temperament: 'Composed under scrutiny, acutely observant, sleep-deprived',
        bpm: 84,
        baselineBpm: 72,
        autoDrive: true,
        lastTrigger: 'Spotting fresh shears beside the shattered glass dome',
      },
      {
        id: 'mercer',
        name: 'Dr. Arthur Mercer',
        role: 'Estate Physician',
        temperament: 'Clinical, paternalistic, concealing laudanum vials in his coat',
        bpm: 96,
        baselineBpm: 74,
        autoDrive: true,
        lastTrigger: 'Realizing Clara already unlocked the glasshouse ward log',
      },
    ],
    presetBeats: [
      {
        label: 'Shattered Pane',
        prompt:
          'A high glass pane above the iron cupola fractures from the outside pressure of the fog; Mercer insists Clara leave immediately, but she finds footprints leading toward the cistern.',
      },
      {
        label: 'Laudanum Confession',
        prompt:
          'Clara drops the silver tonic ledger onto the cracked flagstones and asks why her brother’s dosage doubled on the night he vanished.',
      },
      {
        label: 'Roots Under Stone',
        prompt:
          'As sea fog floods through the missing panes, something drags slowly across the wet iron ribs overhead, blotting out the moonlight.',
      },
    ],
    openingProse:
      'Sea fog pressed against the soot-stained glass like a pale woollen shroud, swallowing the cliff path ten paces beyond the conservatory doors. Clara set her lantern on the stone plinth beside the blackened shears. "You swore to the magistrate last week that this entire glass wing had remained bolted since October," she observed coolly.\n\nDr. Mercer adjusted his spectacles, though the mist inside the dome rendered them useless. "Grief plays strange tricks with brass locks, Clara, and coastal wind often finds an unlatched bolt."',
  },
  {
    id: 'ward-four-sanatorium',
    episodeNumber: 'Episode III',
    title: 'Ward IV Hydrotherapy Wing',
    location: 'Blackwood Asylum Annex',
    hourLabel: '03:50 GMT · Gaslight Failing',
    premise:
      'During a winter power cut, an inspector and a night matron are sealed inside the stone corridor of Ward IV as the single remaining gas lamp begins to gutter.',
    imageUrl: '/images/gothic_manor_ward_1794927227934.jpg',
    imageAlt:
      'Long 19th-century stone sanatorium corridor with arched doorways, single distant gas lamp, and fog along flagstones',
    initialStress: 68,
    characters: [
      {
        id: 'hale',
        name: 'Inspector Thomas Hale',
        role: 'Lunacy Commission Examiner',
        temperament: 'Dogged, pragmatic, newly unsettled by acoustic echoes',
        bpm: 102,
        baselineBpm: 75,
        autoDrive: true,
        lastTrigger: 'Hearing the heavy oak ward doors latch behind them on their own',
      },
      {
        id: 'morris',
        name: 'Matron Agnes Morris',
        role: 'Senior Night Supervisor',
        temperament: 'Stoic, rigid, terrified of what lies behind Arch Seven',
        bpm: 116,
        baselineBpm: 80,
        autoDrive: true,
        lastTrigger: 'Counting twenty-one brass keys on a ring meant for twenty doors',
      },
    ],
    presetBeats: [
      {
        label: 'Gaslight Drops',
        prompt:
          'The distant wall sconce gutters down to a blue bead of flame; Matron Morris whispers that they must not move until the footsteps in Arch Seven pass.',
      },
      {
        label: 'Twenty-First Key',
        prompt:
          'Hale forces Morris to hand over the iron key ring and discovers a brass ward key etched with his own initials.',
      },
      {
        label: 'Cold Draught',
        prompt:
          'Water begins seeping from beneath the sealed oak door of the hydrotherapy room while a dry voice inside counts their heartbeats aloud.',
      },
    ],
    openingProse:
      'Fog curled ankle-deep across the wet flagstones, deadening the sound of their boots until only the hiss of the distant gas mantle remained. Inspector Hale paused beneath the fourth stone arch, his thumb hooked over the brass latch of his notebook. "Twenty rooms appear on the board’s ground plan, yet this corridor runs farther than your ledger admits," he muttered.\n\nMatron Morris pressed her back nearer the damp masonry, her fingers tightening around the iron key ring until the brass teeth bit her palm. "The annex was bricked off after the fever—nothing inside requires counting."',
  },
];
