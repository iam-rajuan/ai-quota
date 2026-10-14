# AI Quota Checker

Small local tool for checking whether OpenAI/Codex, Claude, and Gemini API keys have usable quota.

## Run

```powershell
cd D:\RAJUAN-PERSONAL\VSCODE\ai-quota
npm install
npm run dev
```

Open:

```text
http://localhost:5177
```

## Notes

- This is intentionally local-only.
- API keys are not saved to disk.
- The UI sends keys to the local Express server, and the server sends a tiny request to the selected provider.
- Pure frontend-only quota checks are not reliable because provider APIs usually block browser calls with CORS and browser-side keys are exposed.
