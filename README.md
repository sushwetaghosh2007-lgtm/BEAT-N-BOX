# Storyteller Co-Pilot

Episodic gothic suspense co-pilot and live Gemini pipeline workbench enforcing psychological heartbeat dialogue constraints and stress-driven atmospheric escalation.

## Architecture

1. **Stage 1 — Heartbeat & Stress Telemetry (`JSON`)**: Evaluates the incoming narrative beat against an expanded continuity window (~4,500 chars with opening anchor preservation), updating character BPM (`55–175`) and extracting three stress-calibrated sensory mandates.
2. **Stage 2 — Constrained Manuscript Stream (`SSE`)**: Streams prose and dialogue using `process.env.GEMINI_MODEL` (defaulting to `gemini-2.5-flash`), enforcing BPM-band sentence length rules and `STRESS_THRESHOLDS` atmospheric intensity directives. Supports mid-flight cancellation via `AbortController` on client disconnect or Cancel Run.
3. **Stage 3 — Deterministic Cadence Check & LLM Audit**:
   - `runDeterministicCadenceCheck()` parses double-quoted dialogue (`"..."`), attributes lines to active characters, counts exact words per sentence, and mathematically checks each sentence against the character's active BPM band (`Resting` 14–24, `Guarded` 8–14, `Acute` 4–9, `Fractured` 1–6 words).
   - Combines deterministic violations with structured LLM critique and exposes a 1-click **Fix with Audit Feedback** auto-revise pass.

## Environment Variables

Copy `.env.example` to `.env` or configure via Secrets:

- `GEMINI_API_KEY`: Required server-side Gemini API key.
- `GEMINI_MODEL`: Optional model override (defaults to `gemini-2.5-flash`).
- `APP_URL`: Optional hosted application URL.

## Scripts

```bash
npm run dev      # Start Express + Vite dev middleware on port 3000
npm run lint     # Type-check client and server with tsc --noEmit
npm run build    # Build production frontend bundle into dist/
npm run start    # Start production server (requires dist/ from npm run build)
```
