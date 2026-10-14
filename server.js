import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 5177);

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/models/openai", async (req, res) => {
  const apiKey = getString(req.body?.apiKey);
  if (!apiKey) return res.status(400).json(errorResult("missing_key", "OpenAI API key is required."));

  const result = await listOpenAIModels(apiKey);
  res.status(result.ok ? 200 : 400).json(result);
});

app.post("/api/models/anthropic", async (req, res) => {
  const apiKey = getString(req.body?.apiKey);
  if (!apiKey) return res.status(400).json(errorResult("missing_key", "Claude API key is required."));

  const result = await listAnthropicModels(apiKey);
  res.status(result.ok ? 200 : 400).json(result);
});

app.post("/api/models/gemini", async (req, res) => {
  const apiKey = getString(req.body?.apiKey);
  if (!apiKey) return res.status(400).json(errorResult("missing_key", "Gemini API key is required."));

  const result = await listGeminiModels(apiKey);
  res.status(result.ok ? 200 : 400).json(result);
});

app.post("/api/check/openai", async (req, res) => {
  const apiKey = getString(req.body?.apiKey);
  if (!apiKey) return res.status(400).json(errorResult("missing_key", "OpenAI API key is required."));
  const modelResult = await resolveModel(apiKey, getString(req.body?.model), listOpenAIModels, "OpenAI");
  if (!modelResult.ok) return res.json(modelResult);
  const model = modelResult.model;

  logCheckStart("OpenAI", model, apiKey);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: "Return exactly: ok",
        max_output_tokens: 16,
      }),
    });
    const bodyText = await response.text();
    const result = classifyProviderResponse("OpenAI", response.status, bodyText);
    logCheckResult("OpenAI", result);
    res.json(result);
  } catch (error) {
    const result = errorResult("network_error", error.message || "OpenAI request failed.");
    logCheckResult("OpenAI", result, error);
    res.json(result);
  }
});

app.post("/api/check/anthropic", async (req, res) => {
  const apiKey = getString(req.body?.apiKey);
  if (!apiKey) return res.status(400).json(errorResult("missing_key", "Claude API key is required."));
  const modelResult = await resolveModel(apiKey, getString(req.body?.model), listAnthropicModels, "Claude");
  if (!modelResult.ok) return res.json(modelResult);
  const model = modelResult.model;

  logCheckStart("Claude", model, apiKey);
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 8,
        messages: [{ role: "user", content: "Return exactly: ok" }],
      }),
    });
    const bodyText = await response.text();
    const result = classifyProviderResponse("Claude", response.status, bodyText);
    logCheckResult("Claude", result);
    res.json(result);
  } catch (error) {
    const result = errorResult("network_error", error.message || "Claude request failed.");
    logCheckResult("Claude", result, error);
    res.json(result);
  }
});

app.post("/api/check/gemini", async (req, res) => {
  const apiKey = getString(req.body?.apiKey);
  if (!apiKey) return res.status(400).json(errorResult("missing_key", "Gemini API key is required."));
  const modelResult = await resolveModel(apiKey, getString(req.body?.model), listGeminiModels, "Gemini");
  if (!modelResult.ok) return res.json(modelResult);
  const model = modelResult.model;

  logCheckStart("Gemini", model, apiKey);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Return exactly: ok" }] }],
        generationConfig: { maxOutputTokens: 8 },
      }),
    });
    const bodyText = await response.text();
    const result = classifyProviderResponse("Gemini", response.status, bodyText);
    logCheckResult("Gemini", result);
    res.json(result);
  } catch (error) {
    const result = errorResult("network_error", error.message || "Gemini request failed.");
    logCheckResult("Gemini", result, error);
    res.json(result);
  }
});

const server = app.listen(port, () => {
  console.log(`AI quota checker running at http://localhost:${port}`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Stop the old server or run with another port, for example:`);
    console.error(`$env:PORT=5180; npm run dev`);
    process.exit(1);
  }

  console.error("Server failed to start:", error);
  process.exit(1);
});

function getString(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function resolveModel(apiKey, requestedModel, listModels, provider) {
  if (requestedModel) return { ok: true, model: normalizeModelName(provider, requestedModel) };

  const result = await listModels(apiKey);
  if (!result.ok) return result;
  if (!result.defaultModel) {
    return errorResult("no_supported_models", `${provider} did not return a usable generation model for this key.`);
  }

  return { ok: true, model: result.defaultModel };
}

async function listOpenAIModels(apiKey) {
  console.log(`[${new Date().toISOString()}] OpenAI model list started`, { key: maskKey(apiKey) });

  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const bodyText = await response.text();
    if (!response.ok) return logAndReturnModelListError("OpenAI", response.status, bodyText);

    const parsed = JSON.parse(bodyText);
    const models = (parsed.data || [])
      .map((model) => getString(model.id))
      .filter(isLikelyOpenAIGenerationModel)
      .sort(compareOpenAIModels);

    return logAndReturnModelListSuccess("OpenAI", models);
  } catch (error) {
    return logAndReturnModelListException("OpenAI", error);
  }
}

async function listAnthropicModels(apiKey) {
  console.log(`[${new Date().toISOString()}] Claude model list started`, { key: maskKey(apiKey) });

  try {
    const response = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    });
    const bodyText = await response.text();
    if (!response.ok) return logAndReturnModelListError("Claude", response.status, bodyText);

    const parsed = JSON.parse(bodyText);
    const models = (parsed.data || [])
      .map((model) => getString(model.id))
      .filter(Boolean)
      .sort(compareClaudeModels);

    return logAndReturnModelListSuccess("Claude", models);
  } catch (error) {
    return logAndReturnModelListException("Claude", error);
  }
}

async function listGeminiModels(apiKey) {
  console.log(`[${new Date().toISOString()}] Gemini model list started`, { key: maskKey(apiKey) });

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    );
    const bodyText = await response.text();
    if (!response.ok) return logAndReturnModelListError("Gemini", response.status, bodyText);

    const parsed = JSON.parse(bodyText);
    const models = (parsed.models || [])
      .filter((model) => Array.isArray(model.supportedGenerationMethods))
      .filter((model) => model.supportedGenerationMethods.includes("generateContent"))
      .filter((model) => isUsableGeminiModel(model))
      .map((model) => normalizeModelName("Gemini", getString(model.name)))
      .filter(Boolean)
      .sort(compareGeminiModels);

    return logAndReturnModelListSuccess("Gemini", models);
  } catch (error) {
    return logAndReturnModelListException("Gemini", error);
  }
}

function logAndReturnModelListSuccess(provider, models) {
  const result = {
    ok: true,
    models,
    defaultModel: models[0] || "",
    title: `${provider} models loaded`,
    message: models.length ? `Loaded ${models.length} usable model(s).` : "No usable generation models were returned.",
  };
  console.log(`[${new Date().toISOString()}] ${provider} model list finished`, {
    count: models.length,
    defaultModel: result.defaultModel || "n/a",
  });
  return result;
}

function logAndReturnModelListError(provider, status, bodyText) {
  const result = classifyProviderResponse(provider, status, bodyText);
  console.error(`[${new Date().toISOString()}] ${provider} model list failed`, {
    status,
    code: result.code,
    message: result.message,
  });
  return result;
}

function logAndReturnModelListException(provider, error) {
  const result = errorResult("network_error", error.message || `${provider} model list request failed.`);
  console.error(`[${new Date().toISOString()}] ${provider} model list failed`, {
    code: result.code,
    message: result.message,
  });
  if (error?.stack) console.error(error.stack);
  return result;
}

function normalizeModelName(provider, model) {
  if (provider === "Gemini" && model.startsWith("models/")) return model.slice("models/".length);
  return model;
}

function isLikelyOpenAIGenerationModel(model) {
  return (
    /^gpt-/.test(model) ||
    /^o\d/.test(model) ||
    model.startsWith("chatgpt-") ||
    model.includes("codex")
  );
}

function compareOpenAIModels(a, b) {
  return scoreOpenAIModel(b) - scoreOpenAIModel(a) || a.localeCompare(b);
}

function scoreOpenAIModel(model) {
  let score = 0;
  if (model.startsWith("gpt-5")) score += 1000;
  if (model.startsWith("gpt-4.1")) score += 800;
  if (model.startsWith("gpt-4o")) score += 700;
  if (model.includes("mini")) score += 60;
  if (model.includes("nano")) score += 30;
  if (model.includes("realtime") || model.includes("audio") || model.includes("transcribe")) score -= 300;
  if (model.includes("preview") || model.includes("deprecated")) score -= 100;
  return score;
}

function compareClaudeModels(a, b) {
  return scoreClaudeModel(b) - scoreClaudeModel(a) || b.localeCompare(a);
}

function scoreClaudeModel(model) {
  let score = 0;
  if (model.includes("haiku")) score += 1000;
  if (model.includes("sonnet")) score += 800;
  if (model.includes("opus")) score += 500;
  if (model.includes("-5")) score += 400;
  if (model.includes("4-5")) score += 300;
  return score;
}

function compareGeminiModels(a, b) {
  return scoreGeminiModel(b) - scoreGeminiModel(a) || b.localeCompare(a);
}

function isUsableGeminiModel(model) {
  const searchableText = [
    model.name,
    model.displayName,
    model.description,
    model.version,
  ]
    .map(getString)
    .join(" ")
    .toLowerCase();

  return !(
    searchableText.includes("deprecated") ||
    searchableText.includes("discontinued") ||
    searchableText.includes("no longer available")
  );
}

function scoreGeminiModel(model) {
  let score = 0;
  if (model.includes("flash")) score += 1000;
  if (model.includes("3.5")) score += 700;
  if (model.includes("3.")) score += 600;
  if (model.includes("2.5")) score += 400;
  if (model.includes("2.0")) score += 200;
  if (model.includes("pro")) score += 100;
  if (model.includes("lite")) score += 60;
  if (model.includes("gemini-2.5-flash-lite")) score -= 650;
  if (model.includes("preview") || model.includes("experimental") || model.includes("exp")) score -= 200;
  return score;
}

function logCheckStart(provider, model, apiKey) {
  console.log(`[${new Date().toISOString()}] ${provider} check started`, {
    model,
    key: maskKey(apiKey),
  });
}

function logCheckResult(provider, result, error) {
  const level = result.ok ? "log" : "error";
  console[level](`[${new Date().toISOString()}] ${provider} check finished`, {
    ok: result.ok,
    status: result.status || "n/a",
    code: result.code,
    message: result.message,
  });

  if (error?.stack) {
    console.error(error.stack);
  }
}

function maskKey(apiKey) {
  if (!apiKey) return "(empty)";
  if (apiKey.length <= 10) return `${apiKey.slice(0, 3)}...`;
  return `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}`;
}

function classifyProviderResponse(provider, status, bodyText) {
  const lower = bodyText.toLowerCase();
  const message = extractMessage(bodyText) || bodyText.slice(0, 500) || `HTTP ${status}`;

  if (status >= 200 && status < 300) {
    return {
      ok: true,
      status,
      code: "available",
      title: `${provider} quota appears available`,
      message: "The provider accepted a small test generation request.",
      rawMessage: message,
    };
  }

  if (status === 401 || status === 403 || lower.includes("invalid api key") || lower.includes("authentication")) {
    return {
      ok: false,
      status,
      code: "auth_error",
      title: `${provider} key is invalid or unauthorized`,
      message,
      rawMessage: message,
    };
  }

  if (
    status === 404 &&
    (lower.includes("model") || lower.includes("not found") || lower.includes("does not exist"))
  ) {
    return {
      ok: false,
      status,
      code: "unsupported_model",
      title: `${provider} model is not supported`,
      message,
      rawMessage: message,
    };
  }

  if (
    status === 429 ||
    lower.includes("insufficient_quota") ||
    lower.includes("credit_balance_exhausted") ||
    lower.includes("quota") ||
    lower.includes("rate limit")
  ) {
    return {
      ok: false,
      status,
      code: "quota_or_rate_limit",
      title: `${provider} quota/rate limit is not available`,
      message,
      rawMessage: message,
    };
  }

  return {
    ok: false,
    status,
    code: "provider_error",
    title: `${provider} returned an error`,
    message,
    rawMessage: message,
  };
}

function extractMessage(bodyText) {
  try {
    const parsed = JSON.parse(bodyText);
    if (typeof parsed?.error?.message === "string") return parsed.error.message;
    if (typeof parsed?.error === "string") return parsed.error;
    if (typeof parsed?.message === "string") return parsed.message;
  } catch {
    return "";
  }
  return "";
}

function errorResult(code, message) {
  return {
    ok: false,
    status: 0,
    code,
    title: "Check could not run",
    message,
    rawMessage: message,
  };
}
