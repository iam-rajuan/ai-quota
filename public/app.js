/**
 * AI Quota Studio • Production Application Controller
 * High-performance UI/UX state management, real-time telemetry & audio feedback
 */

// ============================================================================
// State & Configuration
// ============================================================================
const CONFIG = {
  endpoints: {
    openai: "/api/check/openai",
    anthropic: "/api/check/anthropic",
    gemini: "/api/check/gemini",
  },
  modelEndpoints: {
    openai: "/api/models/openai",
    anthropic: "/api/models/anthropic",
    gemini: "/api/models/gemini",
  },
  billingUrls: {
    openai: "https://platform.openai.com/account/billing/overview",
    anthropic: "https://console.anthropic.com/settings/plans",
    gemini: "https://aistudio.google.com/app/plan_information",
  },
  keyPrefixes: {
    openai: ["sk-", "sk-proj-"],
    anthropic: ["sk-ant-"],
    gemini: ["AIza"],
  },
  storageKeys: {
    theme: "ai_quota_theme",
    sound: "ai_quota_sound_enabled",
    remember: "ai_quota_remember_keys",
    keys: "ai_quota_saved_keys",
  },
};

const appState = {
  soundEnabled: localStorage.getItem(CONFIG.storageKeys.sound) === "true",
  rememberKeys: localStorage.getItem(CONFIG.storageKeys.remember) === "true",
  historyCache: [],
  summaryCache: null,
  activeChecksCount: 0,
};

// ============================================================================
// Web Audio Feedback Synthesizer
// ============================================================================
class AudioSynthesizer {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  playTone(frequency, type, duration, gainValue = 0.08) {
    if (!appState.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, this.ctx.currentTime);

      gain.gain.setValueAtTime(gainValue, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (_) {
      // Audio not supported or blocked by browser policy
    }
  }

  success() {
    this.playTone(523.25, "sine", 0.12, 0.06); // C5
    setTimeout(() => this.playTone(659.25, "sine", 0.18, 0.06), 90); // E5
  }

  error() {
    this.playTone(220, "triangle", 0.22, 0.08); // A3
  }

  click() {
    this.playTone(800, "sine", 0.04, 0.03);
  }
}

const audio = new AudioSynthesizer();

// ============================================================================
// DOM References
// ============================================================================
const dom = {
  themeToggle: document.getElementById("themeToggle"),
  soundToggle: document.getElementById("soundToggle"),
  runAllBtn: document.getElementById("runAllBtn"),
  persistKeysToggle: document.getElementById("persistKeysToggle"),
  historyBody: document.querySelector("[data-history]"),
  historySearch: document.getElementById("historySearch"),
  providerFilter: document.getElementById("providerFilter"),
  statusFilter: document.getElementById("statusFilter"),
  refreshHistoryBtn: document.querySelector("[data-refresh-history]"),
  clearHistoryBtn: document.querySelector("[data-clear-history]"),
  toastShelf: document.getElementById("toastShelf"),
  
  // Stats
  statTotalChecks: document.querySelector('[data-stat="totalChecks"]'),
  statPassRate: document.querySelector('[data-stat="passRate"]'),
  statSuccessCount: document.querySelector('[data-stat="successCount"]'),
  statPassRateFill: document.getElementById("passRateFill"),
  statAvgLatency: document.querySelector('[data-stat="avgLatency"]'),
  statAvgLatencySignal: document.getElementById("avgLatencySignal"),
  statTotalTokens: document.querySelector('[data-stat="totalTokens"]'),
  statTokenRatio: document.querySelector('[data-stat-sub="tokenRatio"]'),
  statEstimatedCost: document.querySelector('[data-stat="estimatedCost"]'),
  statTodayChecks: document.querySelector('[data-stat-sub="todayChecks"]'),

  // Modal
  modal: document.getElementById("detailModal"),
  modalTitle: document.getElementById("modalTitle"),
  modalStatusBadge: document.getElementById("modalStatusBadge"),
  modalFactsGrid: document.getElementById("modalFactsGrid"),
  modalJsonContent: document.getElementById("modalJsonContent"),
  closeModalBtn: document.getElementById("closeModalBtn"),
  modalDismissBtn: document.getElementById("modalDismissBtn"),
  copyModalJsonBtn: document.getElementById("copyModalJsonBtn"),
};

// ============================================================================
// Initialization & Theme Setup
// ============================================================================
function initTheme() {
  const savedTheme = localStorage.getItem(CONFIG.storageKeys.theme);
  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const activeTheme = savedTheme || (systemPrefersDark ? "dark" : "light");

  applyTheme(activeTheme);

  dom.themeToggle.addEventListener("click", () => {
    const currentTheme = document.documentElement.dataset.theme;
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    applyTheme(newTheme);
    localStorage.setItem(CONFIG.storageKeys.theme, newTheme);
    audio.click();
    showToast(`Switched to ${newTheme} theme`, "info");
  });
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const moonIcon = dom.themeToggle.querySelector(".theme-moon");
  const sunIcon = dom.themeToggle.querySelector(".theme-sun");

  if (theme === "dark") {
    moonIcon.classList.remove("hidden");
    sunIcon.classList.add("hidden");
  } else {
    moonIcon.classList.add("hidden");
    sunIcon.classList.remove("hidden");
  }
}

function initSoundToggle() {
  updateSoundUI();
  dom.soundToggle.addEventListener("click", () => {
    appState.soundEnabled = !appState.soundEnabled;
    localStorage.setItem(CONFIG.storageKeys.sound, appState.soundEnabled ? "true" : "false");
    updateSoundUI();
    if (appState.soundEnabled) audio.click();
    showToast(appState.soundEnabled ? "Sound feedback enabled" : "Sound muted", "info");
  });
}

function updateSoundUI() {
  if (appState.soundEnabled) {
    dom.soundToggle.classList.remove("sound-muted");
  } else {
    dom.soundToggle.classList.add("sound-muted");
  }
}

// ============================================================================
// Key Persistence & Autofill
// ============================================================================
function initKeyPersistence() {
  dom.persistKeysToggle.checked = appState.rememberKeys;

  dom.persistKeysToggle.addEventListener("change", (e) => {
    appState.rememberKeys = e.target.checked;
    localStorage.setItem(CONFIG.storageKeys.remember, appState.rememberKeys ? "true" : "false");
    audio.click();

    if (appState.rememberKeys) {
      saveKeysToStorage();
      showToast("Keys will be remembered in this browser on this computer", "info");
    } else {
      localStorage.removeItem(CONFIG.storageKeys.keys);
      showToast("Stored keys purged from local storage", "info");
    }
  });

  if (appState.rememberKeys) {
    loadSavedKeys();
  }
}

function saveKeysToStorage() {
  if (!appState.rememberKeys) return;
  const saved = {};
  document.querySelectorAll("[data-provider]").forEach((panel) => {
    const provider = panel.dataset.provider;
    const keyInput = panel.querySelector("[data-key]");
    if (keyInput && keyInput.value) {
      saved[provider] = keyInput.value;
    }
  });
  localStorage.setItem(CONFIG.storageKeys.keys, JSON.stringify(saved));
}

function loadSavedKeys() {
  try {
    const raw = localStorage.getItem(CONFIG.storageKeys.keys);
    if (!raw) return;
    const saved = JSON.parse(raw);
    document.querySelectorAll("[data-provider]").forEach((panel) => {
      const provider = panel.dataset.provider;
      const keyInput = panel.querySelector("[data-key]");
      if (keyInput && saved[provider]) {
        keyInput.value = saved[provider];
        validateKeySyntax(provider, keyInput);
      }
    });
  } catch (_) {
    // Ignore JSON parse errors
  }
}

function validateKeySyntax(provider, input) {
  const panel = input.closest("[data-provider]");
  const badge = panel ? panel.querySelector("[data-key-badge]") : null;
  const val = input.value.trim();
  const prefixes = CONFIG.keyPrefixes[provider] || [];
  const isValid = prefixes.some((p) => val.startsWith(p)) && val.length > 15;

  if (isValid) {
    input.classList.add("valid-syntax");
    if (badge) {
      badge.classList.add("valid");
      badge.querySelector(".syntax-text").textContent = `✓ Valid ${prefixes[0]} format`;
    }
  } else {
    input.classList.remove("valid-syntax");
    if (badge) {
      badge.classList.remove("valid");
      const defaultText = provider === "openai" ? "sk-... or sk-proj-..." : provider === "anthropic" ? "sk-ant-..." : "AIzaSy...";
      badge.querySelector(".syntax-text").textContent = defaultText;
    }
  }
}

// ============================================================================
// Provider Panel Controller
// ============================================================================
function initProviderPanels() {
  document.querySelectorAll("[data-provider]").forEach((panel) => {
    const provider = panel.dataset.provider;
    const button = panel.querySelector("[data-check]");
    const loadModelsButton = panel.querySelector("[data-load-models]");
    const keyInput = panel.querySelector("[data-key]");
    const modelInput = panel.querySelector("[data-model]");
    const modelSelect = panel.querySelector("[data-model-select]");
    const quickChips = panel.querySelectorAll("[data-model-chip]");

    // Key Syntax check on input
    keyInput.addEventListener("input", () => {
      validateKeySyntax(provider, keyInput);
      saveKeysToStorage();
    });

    // Quick Model Chips click handler
    quickChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        quickChips.forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        modelInput.value = chip.dataset.modelChip;
        if (modelSelect) modelSelect.value = "";
        audio.click();
      });
    });

    // If user types in manual override, deactivate chips and clear dropdown selection
    if (modelInput) {
      modelInput.addEventListener("input", () => {
        if (modelInput.value.trim().length > 0) {
          quickChips.forEach((c) => c.classList.remove("active"));
          if (modelSelect) modelSelect.value = "";
        }
      });
    }

    // If user changes dropdown select, clear manual override and chip active states
    if (modelSelect) {
      modelSelect.addEventListener("change", () => {
        if (modelSelect.value) {
          if (modelInput) modelInput.value = "";
          quickChips.forEach((c) => c.classList.remove("active"));
        }
      });
    }

    // Toggle password visibility
    const toggleVisBtn = panel.querySelector('[data-action="toggle-visibility"]');
    if (toggleVisBtn) {
      toggleVisBtn.addEventListener("click", () => {
        const isPassword = keyInput.type === "password";
        keyInput.type = isPassword ? "text" : "password";
        toggleVisBtn.querySelector(".eye-open").classList.toggle("hidden", isPassword);
        toggleVisBtn.querySelector(".eye-closed").classList.toggle("hidden", !isPassword);
        audio.click();
      });
    }

    // Paste Key
    const pasteBtn = panel.querySelector('[data-action="paste"]');
    if (pasteBtn) {
      pasteBtn.addEventListener("click", async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (text) {
            keyInput.value = text.trim();
            validateKeySyntax(provider, keyInput);
            saveKeysToStorage();
            showToast(`Pasted ${provider.toUpperCase()} key`, "success");
            audio.click();
          }
        } catch (_) {
          showToast("Clipboard access denied. Please paste manually.", "error");
        }
      });
    }

    // Clear Key
    const clearBtn = panel.querySelector('[data-action="clear"]');
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        keyInput.value = "";
        validateKeySyntax(provider, keyInput);
        saveKeysToStorage();
        audio.click();
      });
    }

    // Keyboard Shortcut (Ctrl+Enter / Cmd+Enter)
    panel.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        runSingleCheck(provider, panel);
      }
    });

    // Check Button Handler
    button.addEventListener("click", () => runSingleCheck(provider, panel));

    // Load Models Handler
    loadModelsButton.addEventListener("click", () => fetchProviderModels(provider, panel));
  });

  // Run All Provider Checks button in Header
  dom.runAllBtn.addEventListener("click", runAllActiveChecks);
}

// ============================================================================
// Check Runner Logic
// ============================================================================
async function runSingleCheck(provider, panel) {
  const button = panel.querySelector("[data-check]");
  const keyInput = panel.querySelector("[data-key]");
  const modelInput = panel.querySelector("[data-model]");
  const modelSelect = panel.querySelector("[data-model-select]");
  const resultArea = panel.querySelector("[data-result-area]");

  const apiKey = keyInput.value.trim();
  const selectedModel = modelInput.value.trim() || modelSelect.value;

  if (!apiKey) {
    showToast(`Please enter an API key for ${provider.toUpperCase()}`, "error");
    keyInput.focus();
    audio.error();
    return;
  }

  setPanelState(panel, "checking", "Probing...");
  renderCheckingPlaceholder(resultArea, provider, selectedModel);
  appState.activeChecksCount++;
  updateRunAllButtonState();

  try {
    const response = await fetch(CONFIG.endpoints[provider], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey, model: selectedModel }),
    });

    const data = await response.json();
    setPanelState(panel, data.ok ? "ok" : "error", data.ok ? "Ready" : "Blocked");
    renderDiagnosticResult(resultArea, data, provider);

    if (data.ok) {
      audio.success();
      showToast(`${provider.toUpperCase()} quota verified available!`, "success");
    } else {
      audio.error();
      showToast(`${provider.toUpperCase()} probe failed (${data.code || "blocked"})`, "error");
    }

    loadHistory();
  } catch (error) {
    setPanelState(panel, "error", "Failed");
    renderDiagnosticResult(resultArea, {
      title: "Connection Failed",
      status: 0,
      code: "network_error",
      message: error.message || "Failed to reach local checker server.",
    }, provider);
    audio.error();
    showToast("Network error checking provider", "error");
  } finally {
    appState.activeChecksCount = Math.max(0, appState.activeChecksCount - 1);
    updateRunAllButtonState();
  }
}

async function runAllActiveChecks() {
  const panels = Array.from(document.querySelectorAll("[data-provider]"));
  const panelsWithKeys = panels.filter((p) => p.querySelector("[data-key]").value.trim().length > 0);

  if (panelsWithKeys.length === 0) {
    showToast("Please enter at least one API key first", "error");
    audio.error();
    return;
  }

  audio.click();
  showToast(`Running batch diagnostics for ${panelsWithKeys.length} provider(s)...`, "info");

  await Promise.allSettled(panelsWithKeys.map((panel) => {
    const provider = panel.dataset.provider;
    return runSingleCheck(provider, panel);
  }));

  showToast("All provider checks completed!", "success");
}

function updateRunAllButtonState() {
  dom.runAllBtn.disabled = appState.activeChecksCount > 0;
  const label = dom.runAllBtn.querySelector("span");
  if (appState.activeChecksCount > 0) {
    label.textContent = `Checking (${appState.activeChecksCount})...`;
  } else {
    label.textContent = "Run All Checks";
  }
}

function setPanelState(panel, state, text) {
  panel.dataset.state = state;
  const badge = panel.querySelector("[data-badge]");
  badge.className = `status-badge badge-${state}`;
  badge.querySelector(".badge-text").textContent = text;

  const checkBtn = panel.querySelector("[data-check]");
  const loadBtn = panel.querySelector("[data-load-models]");
  checkBtn.disabled = state === "checking";
  loadBtn.disabled = state === "checking";
}

// ============================================================================
// Model Fetching Logic
// ============================================================================
async function fetchProviderModels(provider, panel) {
  const keyInput = panel.querySelector("[data-key]");
  const modelSelect = panel.querySelector("[data-model-select]");
  const loadBtn = panel.querySelector("[data-load-models]");
  const spinIcon = loadBtn.querySelector(".spin-icon");
  const btnText = loadBtn.querySelector("span");
  const apiKey = keyInput.value.trim();

  if (!apiKey) {
    showToast(`Enter an API key to query ${provider.toUpperCase()} models`, "error");
    keyInput.focus();
    audio.error();
    return;
  }

  spinIcon.classList.remove("hidden");
  btnText.textContent = "Querying...";
  loadBtn.disabled = true;

  try {
    const response = await fetch(CONFIG.modelEndpoints[provider], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    });

    const data = await response.json();

    if (!data.ok) {
      showToast(data.message || "Failed to load models", "error");
      audio.error();
      return;
    }

    modelSelect.replaceChildren();

    if (data.models && data.models.length > 0) {
      // Clear manual written model override and reset chips so queried models take effect
      const modelInput = panel.querySelector("[data-model]");
      if (modelInput) modelInput.value = "";
      panel.querySelectorAll("[data-model-chip]").forEach((c) => c.classList.remove("active"));

      data.models.forEach((model, index) => {
        const option = document.createElement("option");
        option.value = model;
        option.textContent = index === 0 ? `${model} (Recommended)` : model;
        modelSelect.appendChild(option);
      });

      modelSelect.selectedIndex = 0;

      showToast(`Loaded ${data.models.length} model(s) • Manual override cleared`, "success");
      audio.success();
    } else {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No usable generation models found";
      modelSelect.appendChild(option);
    }
  } catch (error) {
    showToast(`Error: ${error.message}`, "error");
    audio.error();
  } finally {
    spinIcon.classList.add("hidden");
    btnText.textContent = "Query API Models";
    loadBtn.disabled = false;
  }
}

// ============================================================================
// Diagnostic Result Rendering & Syntax Highlighter
// ============================================================================
function highlightJson(obj) {
  let json = typeof obj !== "string" ? JSON.stringify(obj, null, 2) : obj;
  json = escapeHtml(json);
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
    let cls = "json-number";
    if (/^"/.test(match)) {
      if (/:$/.test(match)) {
        cls = "json-key";
      } else {
        cls = "json-string";
      }
    } else if (/true|false/.test(match)) {
      cls = "json-boolean";
    } else if (/null/.test(match)) {
      cls = "json-null";
    }
    return `<span class="${cls}">${match}</span>`;
  });
}

function renderCheckingPlaceholder(container, provider, model) {
  container.innerHTML = `
    <div class="diagnostic-placeholder">
      <div class="spin-icon" style="width:26px;height:26px;margin-bottom:6px;color:var(--accent-primary);">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>
      </div>
      <strong style="color:var(--text-primary);font-size:13.5px;">Executing Handshake Probe (${provider.toUpperCase()})</strong>
      <span style="font-size:11px;font-family:var(--font-mono);color:var(--text-muted);">${escapeHtml(model || "Default Model")}</span>
    </div>
  `;
}

function renderDiagnosticResult(container, data, provider) {
  const isOk = !!data.ok;
  const statusClass = isOk ? "status-ok" : "status-error";

  let latencyTag = "";
  if (typeof data.latencyMs === "number") {
    const lat = data.latencyMs;
    const speedClass = lat < 600 ? "latency-fast" : lat < 1600 ? "latency-medium" : "latency-slow";
    latencyTag = `<span class="pill-tag ${speedClass}" title="Response round-trip latency">⚡ ${lat}ms</span>`;
  }

  // Token Gauge Visualizer
  let tokenGaugeHtml = "";
  if (data.usage && (data.usage.inputTokens || data.usage.outputTokens)) {
    const inTokens = data.usage.inputTokens || 0;
    const outTokens = data.usage.outputTokens || 0;
    const total = inTokens + outTokens || 1;
    const inPct = Math.max(5, Math.round((inTokens / total) * 100));
    const outPct = Math.max(5, 100 - inPct);

    tokenGaugeHtml = `
      <div class="token-gauge-wrap">
        <div class="token-gauge-labels">
          <span>Tokens: In (${inTokens}) / Out (${outTokens})</span>
          <span>Total: ${inTokens + outTokens}</span>
        </div>
        <div class="token-gauge-bar">
          <div class="gauge-segment-in" style="width: ${inPct}%" title="Input tokens: ${inTokens}"></div>
          <div class="gauge-segment-out" style="width: ${outPct}%" title="Output tokens: ${outTokens}"></div>
        </div>
      </div>
    `;
  }

  // Actionable Troubleshooting Box if error occurred
  let troubleshootHtml = "";
  if (!isOk) {
    const advice = getTroubleshootAdvice(provider, data.code, data.message);
    troubleshootHtml = `
      <div class="troubleshoot-box">
        <div class="troubleshoot-head">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:15px;height:15px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          <span>Diagnostic Recommendation</span>
        </div>
        <p class="troubleshoot-body">${escapeHtml(advice.message)}</p>
        ${advice.link ? `<a class="troubleshoot-action" href="${advice.link}" target="_blank" rel="noopener noreferrer">${advice.linkText} →</a>` : ""}
      </div>
    `;
  }

  const costDisplay = Number.isFinite(data.estimatedCostUsd) ? `$${data.estimatedCostUsd.toFixed(6)}` : "Free / N/A";

  container.innerHTML = `
    <div class="result-banner ${statusClass}">
      <div class="result-title-group">
        <div class="result-status-icon">
          ${isOk 
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`
          }
        </div>
        <div>
          <div class="result-title">${escapeHtml(data.title || (isOk ? "Available" : "Access Blocked"))}</div>
          <div class="result-subtitle">${escapeHtml(data.message || "")}</div>
        </div>
      </div>
      <div class="result-pill-group">
        ${latencyTag}
        <span class="pill-tag">HTTP ${data.status || "N/A"}</span>
        <span class="pill-tag">${escapeHtml(data.code || "unknown")}</span>
      </div>
    </div>

    <div class="facts-grid">
      <div class="fact-item">
        <span class="fact-term">Model Probed</span>
        <span class="fact-val" title="${escapeHtml(data.model || "Default")}">${escapeHtml(data.model || "Default")}</span>
      </div>
      <div class="fact-item">
        <span class="fact-term">Quota Signal</span>
        <span class="fact-val" style="color: ${isOk ? "var(--status-ok)" : "var(--status-error)"};">${escapeHtml(data.creditInfo?.value || (isOk ? "Active" : "Blocked"))}</span>
      </div>
      <div class="fact-item">
        <span class="fact-term">Est. Probe Cost</span>
        <span class="fact-val">${costDisplay}</span>
      </div>
      <div class="fact-item">
        <span class="fact-term">Key Hash</span>
        <span class="fact-val">${escapeHtml(data.keyFingerprint || "N/A")}</span>
      </div>
    </div>

    ${tokenGaugeHtml}
    ${troubleshootHtml}

    <div class="raw-drawer-toggle">
      <span>Raw Provider Response</span>
      <button type="button" class="text-link-btn" data-copy-raw>Copy JSON</button>
    </div>
    <div class="raw-content-block">${highlightJson(data)}</div>
  `;

  // Attach copy raw handler
  const copyRawBtn = container.querySelector("[data-copy-raw]");
  if (copyRawBtn) {
    copyRawBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      showToast("Diagnostic payload copied to clipboard", "success");
      audio.click();
    });
  }
}

function getTroubleshootAdvice(provider, code, rawMessage = "") {
  const msgLower = (rawMessage || "").toLowerCase();
  const billingUrl = CONFIG.billingUrls[provider] || "#";

  if (code === "auth_error" || msgLower.includes("api key") || msgLower.includes("unauthorized")) {
    return {
      message: "The key was rejected by the provider's authentication layer. Verify that the key has not been deleted, rotated, or restricted to other IPs.",
      link: billingUrl,
      linkText: `Manage ${provider.toUpperCase()} API Keys`,
    };
  }

  if (code === "quota_or_rate_limit" || msgLower.includes("quota") || msgLower.includes("insufficient_quota") || msgLower.includes("credit")) {
    return {
      message: "Your account credit balance is depleted or rate limits have been reached. Add funds or update your billing subscription tier.",
      link: billingUrl,
      linkText: `Open ${provider.toUpperCase()} Billing Console`,
    };
  }

  if (code === "unsupported_model" || msgLower.includes("not found")) {
    return {
      message: "The requested model is either invalid, deprecated, or restricted on your API plan tier. Use 'Query API Models' to load available identifiers.",
      link: null,
    };
  }

  return {
    message: "The provider returned an error during synthetic request generation. Check the raw payload below for specific error descriptions.",
    link: billingUrl,
    linkText: `Visit ${provider.toUpperCase()} Developer Dashboard`,
  };
}

// ============================================================================
// History & Analytics Controller
// ============================================================================
async function loadHistory() {
  try {
    const response = await fetch("/api/history");
    const data = await response.json();

    if (data.ok) {
      appState.historyCache = data.checks || [];
      appState.summaryCache = data.summary || {};
      renderTelemetryStats(data.summary);
      renderFilteredHistory();
    }
  } catch (error) {
    console.error("Failed to load history:", error);
  }
}

function renderTelemetryStats(summary = {}) {
  const total = summary.totalChecks || 0;
  const successes = summary.successfulChecks || 0;
  const passRate = total > 0 ? Math.round((successes / total) * 100) : 100;

  dom.statTotalChecks.textContent = total.toLocaleString();
  dom.statTodayChecks.textContent = `${summary.todayChecks || 0} recorded today`;

  dom.statPassRate.textContent = `${passRate}%`;
  dom.statSuccessCount.textContent = `${successes} OK`;
  dom.statPassRateFill.style.width = `${passRate}%`;

  const avgLat = summary.avgLatencyMs || 0;
  dom.statAvgLatency.textContent = avgLat > 0 ? `${avgLat} ms` : "N/A";

  if (dom.statAvgLatencySignal) {
    if (avgLat === 0) {
      dom.statAvgLatencySignal.textContent = "Standby";
      dom.statAvgLatencySignal.style.color = "var(--text-muted)";
    } else if (avgLat < 600) {
      dom.statAvgLatencySignal.textContent = "⚡ Optimal";
      dom.statAvgLatencySignal.style.color = "var(--status-ok)";
    } else if (avgLat < 1600) {
      dom.statAvgLatencySignal.textContent = "⚡ Moderate";
      dom.statAvgLatencySignal.style.color = "var(--status-warning)";
    } else {
      dom.statAvgLatencySignal.textContent = "⚡ Slow";
      dom.statAvgLatencySignal.style.color = "var(--status-error)";
    }
  }

  dom.statTotalTokens.textContent = (summary.totalTokens || 0).toLocaleString();
  dom.statTokenRatio.textContent = `${(summary.inputTokens || 0).toLocaleString()} In / ${(summary.outputTokens || 0).toLocaleString()} Out`;

  dom.statEstimatedCost.textContent = Number.isFinite(summary.estimatedCostUsd)
    ? `$${summary.estimatedCostUsd.toFixed(6)}`
    : "$0.000000";
}

function renderFilteredHistory() {
  const searchQuery = dom.historySearch.value.trim().toLowerCase();
  const providerFilter = dom.providerFilter.value;
  const statusFilter = dom.statusFilter.value;

  const filtered = appState.historyCache.filter((item) => {
    if (providerFilter !== "all" && item.provider !== providerFilter) return false;
    if (statusFilter === "ok" && !item.ok) return false;
    if (statusFilter === "error" && item.ok) return false;

    if (searchQuery) {
      const matchTarget = `${item.provider} ${item.model} ${item.code} ${item.keyFingerprint} ${item.title} ${item.message}`.toLowerCase();
      if (!matchTarget.includes(searchQuery)) return false;
    }

    return true;
  });

  if (filtered.length === 0) {
    dom.historyBody.innerHTML = `
      <tr>
        <td colspan="9" class="empty-table-cell">
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle><line x1="8" y1="12" x2="16" y2="12"></line></svg>
            <p>${appState.historyCache.length === 0 ? "No checks recorded yet. Run a check above." : "No records match your filter criteria."}</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  dom.historyBody.replaceChildren();

  filtered.slice(0, 100).forEach((item) => {
    const tr = document.createElement("tr");

    const timeFormatted = item.checkedAt ? new Date(item.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "N/A";
    const dateFormatted = item.checkedAt ? new Date(item.checkedAt).toLocaleDateString([], { month: "short", day: "numeric" }) : "";

    const latencyHtml = typeof item.latencyMs === "number" 
      ? `<span style="color:${item.latencyMs < 600 ? "var(--status-ok)" : item.latencyMs < 1600 ? "var(--status-warning)" : "var(--status-error)"};">⚡ ${item.latencyMs}ms</span>` 
      : "—";

    const inTokens = item.usage?.inputTokens || 0;
    const outTokens = item.usage?.outputTokens || 0;
    const tokensDisplay = (inTokens || outTokens) ? `${inTokens} / ${outTokens}` : "—";
    const costDisplay = Number.isFinite(item.estimatedCostUsd) ? `$${item.estimatedCostUsd.toFixed(6)}` : "—";

    tr.innerHTML = `
      <td title="${escapeHtml(item.checkedAt || "")}">
        <div style="font-weight:600;color:var(--text-primary);">${timeFormatted}</div>
        <div style="font-size:10px;color:var(--text-muted);">${dateFormatted}</div>
      </td>
      <td>
        <div class="provider-cell-tag">
          <span class="provider-cell-dot ${escapeHtml(item.provider)}"></span>
          <span>${escapeHtml(item.provider)}</span>
        </div>
      </td>
      <td>
        <span class="status-badge-cell ${item.ok ? "ok" : "error"}">
          ${item.ok ? "OK" : "Blocked"} • ${escapeHtml(item.code || "unknown")}
        </span>
      </td>
      <td><span class="model-pill">${escapeHtml(item.model || "Default")}</span></td>
      <td>${latencyHtml}</td>
      <td>${tokensDisplay}</td>
      <td>${costDisplay}</td>
      <td><span class="hash-pill">${escapeHtml(item.keyFingerprint || "—")}</span></td>
      <td>
        <div class="row-actions">
          <button type="button" class="btn-icon-subtle" data-inspect title="Inspect Payload Details">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
          </button>
        </div>
      </td>
    `;

    tr.querySelector("[data-inspect]").addEventListener("click", () => {
      openDetailModal(item);
    });

    dom.historyBody.appendChild(tr);
  });
}

// History Filters & Toolbar
function initHistoryControls() {
  dom.historySearch.addEventListener("input", renderFilteredHistory);
  dom.providerFilter.addEventListener("change", renderFilteredHistory);
  dom.statusFilter.addEventListener("change", renderFilteredHistory);

  dom.refreshHistoryBtn.addEventListener("click", () => {
    loadHistory();
    showToast("Audit trail refreshed", "info");
    audio.click();
  });

  dom.clearHistoryBtn.addEventListener("click", async () => {
    const confirmed = window.confirm("Are you sure you want to purge all local diagnostic check history?");
    if (!confirmed) return;

    try {
      const response = await fetch("/api/history", { method: "DELETE" });
      const data = await response.json();
      if (data.ok) {
        appState.historyCache = [];
        renderTelemetryStats(data.summary);
        renderFilteredHistory();
        showToast("Diagnostic history purged successfully", "success");
        audio.click();
      }
    } catch (error) {
      showToast(`Failed to purge history: ${error.message}`, "error");
    }
  });
}

// ============================================================================
// Inspection Modal Controller
// ============================================================================
function openDetailModal(item) {
  dom.modalTitle.textContent = `${item.provider} Diagnostic Record`;
  dom.modalStatusBadge.textContent = item.ok ? "AVAILABLE" : "BLOCKED";
  dom.modalStatusBadge.className = `badge ${item.ok ? "badge-ok" : "badge-error"}`;

  dom.modalFactsGrid.innerHTML = `
    <div class="fact-item">
      <span class="fact-term">Provider</span>
      <span class="fact-val">${escapeHtml(item.provider)}</span>
    </div>
    <div class="fact-item">
      <span class="fact-term">Model</span>
      <span class="fact-val">${escapeHtml(item.model || "Default")}</span>
    </div>
    <div class="fact-item">
      <span class="fact-term">HTTP Code</span>
      <span class="fact-val">${item.status || "N/A"} (${escapeHtml(item.code || "")})</span>
    </div>
    <div class="fact-item">
      <span class="fact-term">Latency</span>
      <span class="fact-val">${item.latencyMs ? `${item.latencyMs} ms` : "N/A"}</span>
    </div>
    <div class="fact-item">
      <span class="fact-term">Tokens Consumed</span>
      <span class="fact-val">${item.usage ? `${item.usage.inputTokens || 0} In / ${item.usage.outputTokens || 0} Out` : "N/A"}</span>
    </div>
    <div class="fact-item">
      <span class="fact-term">Key Fingerprint</span>
      <span class="fact-val">${escapeHtml(item.keyFingerprint || "N/A")}</span>
    </div>
  `;

  dom.modalJsonContent.innerHTML = highlightJson(item);
  dom.modal.classList.remove("hidden");
  audio.click();
}

function closeDetailModal() {
  dom.modal.classList.add("hidden");
  audio.click();
}

function initModalHandlers() {
  dom.closeModalBtn.addEventListener("click", closeDetailModal);
  dom.modalDismissBtn.addEventListener("click", closeDetailModal);

  dom.modal.addEventListener("click", (e) => {
    if (e.target === dom.modal) closeDetailModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !dom.modal.classList.contains("hidden")) {
      closeDetailModal();
    }
  });

  dom.copyModalJsonBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(dom.modalJsonContent.textContent);
    showToast("Telemetry JSON copied to clipboard", "success");
    audio.click();
  });
}

// ============================================================================
// Toast Notification Engine
// ============================================================================
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  let iconSvg = "";
  if (type === "success") {
    iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  } else if (type === "error") {
    iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
  } else {
    iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
  }

  toast.innerHTML = `${iconSvg}<span>${escapeHtml(message)}</span>`;
  dom.toastShelf.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(30px)";
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

// Utility: HTML Escaping
function escapeHtml(str) {
  if (typeof str !== "string") return str == null ? "" : String(str);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function updateEnvironmentInfo() {
  const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const statusEl = document.querySelector("[data-server-status]");
  const hostEl = document.querySelector("[data-server-host]");
  const brandSub = document.querySelector(".brand-sub");

  if (hostEl) {
    hostEl.textContent = window.location.host;
  }

  if (statusEl) {
    statusEl.textContent = isLocal ? `Local • Port ${window.location.port || "5177"}` : `${window.location.hostname} • Active`;
  }

  if (brandSub) {
    brandSub.textContent = isLocal ? "Local API Sentinel • Real-Time Latency & Quota Radar" : "Cloud Sentinel • Real-Time Latency & Quota Radar";
  }
}

// ============================================================================
// Bootstrapper
// ============================================================================
document.addEventListener("DOMContentLoaded", () => {
  updateEnvironmentInfo();
  initTheme();
  initSoundToggle();
  initKeyPersistence();
  initProviderPanels();
  initHistoryControls();
  initModalHandlers();
  loadHistory();
});
