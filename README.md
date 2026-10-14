# AI Quota Studio (Production UI/UX)

A high-performance, air-gapped local workstation suite for verifying OpenAI, Anthropic Claude, and Google Gemini API quota, measuring real-world handshake latency, tracking token usage, and analyzing diagnostic health.

## Key Capabilities

- **Mission Control Telemetry**: Real-time pass rate gauge, handshake latency radar (ms), token volume visualizer (Input vs Output), and micro-spend estimates.
- **Provider Probes**:
  - **OpenAI / Codex**: Responses API probe, automatic model categorization, and billing sanity checks.
  - **Anthropic Claude**: Messages API probe with credit exhaustion intelligence.
  - **Google Gemini**: `generateContent` probe and Google AI Studio quota check.
- **Batch Diagnostics**: 1-click **"Run All Checks"** to probe all active providers concurrently.
- **Ergonomic Key Management**: Format validator checkmark (`sk-...`, `sk-ant-...`, `AIza...`), mask/reveal visibility toggle, 1-click clipboard paste, and optional local session persistence.
- **Audio Feedback**: Subtle Web Audio API synthesis for auditory validation and error cues (toggleable in header).
- **Theme System**: Modern Obsidian Dark Theme by default with fluid toggle to Crisp Light Theme.
- **Actionable Diagnostics**: Human-readable recommendations for `429 insufficient_quota`, `401 auth_error`, and `404 unsupported_model` with direct console links.
- **Audit Trail & JSON Inspector**: Filterable local history log with search, provider filter, latency badges, and modal JSON inspector.
- **Keyboard Shortcuts**: `Ctrl + Enter` (or `Cmd + Enter`) anywhere inside a provider card to execute checks instantly.

## Getting Started

```powershell
cd D:\RAJUAN-PERSONAL\VSCODE\ai-quota
npm install
npm run dev
```

Open:

```text
http://localhost:5177
```

## Security & Privacy Guarantee

- 100% local execution: keys are sent strictly to your local Node process (`localhost:5177`) to bypass browser CORS limitations.
- Zero external tracking, zero cloud telemetry, air-gapped safe.

