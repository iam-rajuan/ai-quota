const endpointByProvider = {
  openai: "/api/check/openai",
  anthropic: "/api/check/anthropic",
  gemini: "/api/check/gemini",
};

const modelEndpointByProvider = {
  openai: "/api/models/openai",
  anthropic: "/api/models/anthropic",
  gemini: "/api/models/gemini",
};

const historyBody = document.querySelector("[data-history]");
const summaryEl = document.querySelector("[data-summary]");
const refreshHistoryButton = document.querySelector("[data-refresh-history]");
const clearHistoryButton = document.querySelector("[data-clear-history]");

refreshHistoryButton.addEventListener("click", loadHistory);
clearHistoryButton.addEventListener("click", clearHistory);
loadHistory();

document.querySelectorAll("[data-provider]").forEach((panel) => {
  const provider = panel.dataset.provider;
  const button = panel.querySelector("[data-check]");
  const loadModelsButton = panel.querySelector("[data-load-models]");
  const keyInput = panel.querySelector("[data-key]");
  const modelInput = panel.querySelector("[data-model]");
  const modelSelect = panel.querySelector("[data-model-select]");
  const result = panel.querySelector("[data-result]");
  const badge = panel.querySelector(".badge");

  loadModelsButton.addEventListener("click", loadModels);

  button.addEventListener("click", async () => {
    setState("checking", "Checking...");
    result.textContent = "Sending a tiny test request...";

    try {
      const response = await fetch(endpointByProvider[provider], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: keyInput.value,
          model: getSelectedModel(),
        }),
      });
      const data = await response.json();
      setState(data.ok ? "ok" : "error", data.ok ? "Available" : "Blocked");
      renderResult(data);
      loadHistory();
    } catch (error) {
      setState("error", "Failed");
      renderResult({
        title: "Request failed",
        status: "n/a",
        code: "browser_error",
        message: error.message || "Request failed.",
      });
    }
  });

  async function loadModels() {
    setState("checking", "Loading...");
    result.textContent = "Loading models from the provider with this key...";

    try {
      const response = await fetch(modelEndpointByProvider[provider], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: keyInput.value }),
      });
      const data = await response.json();

      if (!data.ok) {
        setState("error", "Failed");
        renderResult(data);
        return;
      }

      modelSelect.replaceChildren(
        ...data.models.map((model, index) => {
          const option = document.createElement("option");
          option.value = model;
          option.textContent = index === 0 ? `${model} (auto)` : model;
          return option;
        })
      );
      modelInput.value = "";
      setState("idle", "Loaded");
      renderResult({
        title: data.title,
        status: "n/a",
        code: "models_loaded",
        message: `${data.message}\nDefault selected: ${data.defaultModel || "n/a"}`,
      });
    } catch (error) {
      setState("error", "Failed");
      renderResult({
        title: "Could not load models",
        status: "n/a",
        code: "browser_error",
        message: error.message || "Could not load models.",
      });
    }
  }

  function getSelectedModel() {
    return modelInput.value.trim() || modelSelect.value;
  }

  function setState(state, text) {
    panel.dataset.state = state;
    badge.className = `badge ${state}`;
    badge.textContent = text;
    button.disabled = state === "checking";
    loadModelsButton.disabled = state === "checking";
  }

  function renderResult(data) {
    result.replaceChildren();

    const title = document.createElement("strong");
    title.textContent = data.title || "Result";

    const meta = document.createElement("span");
    meta.className = "result-meta";
    meta.textContent = `HTTP ${data.status || "n/a"} / ${data.code || "unknown"}`;

    const message = document.createElement("p");
    message.textContent = data.message || "";

    result.append(title, meta, message);

    const facts = buildFacts(data);
    if (facts.length) {
      const list = document.createElement("dl");
      list.className = "result-facts";

      facts.forEach(([label, value]) => {
        const item = document.createElement("div");
        const term = document.createElement("dt");
        const description = document.createElement("dd");

        term.textContent = label;
        description.textContent = value;
        item.append(term, description);
        list.append(item);
      });

      result.append(list);
    }
  }

  function buildFacts(data) {
    const facts = [];
    if (data.model) facts.push(["Model", data.model]);
    if (data.creditInfo) facts.push([data.creditInfo.label, data.creditInfo.value]);
    if (data.creditInfo?.detail) facts.push(["Signal detail", data.creditInfo.detail]);

    if (data.usage) {
      facts.push(["Input tokens", formatNumber(data.usage.inputTokens)]);
      facts.push(["Output tokens", formatNumber(data.usage.outputTokens)]);
      facts.push(["Total tokens", formatNumber(data.usage.totalTokens)]);
    }

    if (Number.isFinite(data.estimatedCostUsd)) {
      facts.push(["Estimated cost", formatUsd(data.estimatedCostUsd)]);
    }

    if (!data.usage && data.ok) {
      facts.push(["Token usage", "Provider did not return usage details for this response."]);
    }

    return facts;
  }

  function formatNumber(value) {
    return Number.isFinite(value) ? value.toLocaleString() : "n/a";
  }
});

async function loadHistory() {
  try {
    const response = await fetch("/api/history");
    const data = await response.json();
    renderSummary(data.summary);
    renderHistory(data.checks);
  } catch (error) {
    historyBody.replaceChildren(historyRow([`Could not load history: ${error.message}`], 7));
  }
}

async function clearHistory() {
  const confirmed = window.confirm("Clear local check history? API keys are not stored, but this will remove all tracked results.");
  if (!confirmed) return;

  const response = await fetch("/api/history", { method: "DELETE" });
  const data = await response.json();
  renderSummary(data.summary);
  renderHistory(data.checks);
}

function renderSummary(summary = {}) {
  const values = [
    summary.totalChecks || 0,
    summary.todayChecks || 0,
    summary.successfulChecks || 0,
    summary.failedChecks || 0,
    summary.totalTokens || 0,
    formatUsd(summary.estimatedCostUsd || 0),
  ];

  summaryEl.querySelectorAll("strong").forEach((node, index) => {
    node.textContent = index === 5 ? values[index] : formatNumber(values[index]);
  });
}

function renderHistory(checks = []) {
  if (!checks.length) {
    historyBody.replaceChildren(historyRow(["No checks yet."], 7));
    return;
  }

  historyBody.replaceChildren(
    ...checks.slice(0, 50).map((check) =>
      historyRow([
        formatTime(check.checkedAt),
        check.provider || "Unknown",
        `${check.ok ? "OK" : "Blocked"} / ${check.code || "unknown"}`,
        check.model || "n/a",
        formatNumber(check.usage?.totalTokens),
        Number.isFinite(check.estimatedCostUsd) ? formatUsd(check.estimatedCostUsd) : "n/a",
        check.keyFingerprint || "n/a",
      ])
    )
  );
}

function historyRow(values, colspan) {
  const row = document.createElement("tr");

  if (colspan) {
    const cell = document.createElement("td");
    cell.colSpan = colspan;
    cell.textContent = values[0];
    row.append(cell);
    return row;
  }

  values.forEach((value) => {
    const cell = document.createElement("td");
    cell.textContent = value;
    row.append(cell);
  });

  return row;
}

function formatTime(value) {
  if (!value) return "n/a";
  return new Date(value).toLocaleString();
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toLocaleString() : "n/a";
}

function formatUsd(value) {
  return Number.isFinite(value) ? `$${value.toFixed(6)}` : "n/a";
}
