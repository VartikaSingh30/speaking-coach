# Launch checklist

Run through this before making the repository public.

## 🔐 Secrets & hygiene
- [ ] Confirm `apps/api/.env` and `apps/web/.env.local` are **not** tracked (`git status` should not list them).
- [ ] Confirm no Google credential JSON is tracked (`git ls-files | grep -i json` → only `package.json`/`tsconfig.json`/manifests).
- [ ] `git ls-files | grep -E "\.env"` returns only `*.env.example` files.
- [ ] Build/cache dirs are ignored: `.next/`, `dist/`, `.turbo/`, `node_modules/`.
- [ ] Remove local scratch files if undesired: `dev.log`, `curl.json`, `session-payload.json` (already git-ignored).
- [ ] **Rotate** any key that was ever committed in history.

## 🧪 Quality gates
- [ ] `npm run typecheck` passes (core + api + web).
- [ ] `npm test` passes (core unit tests).
- [ ] `npm run build` succeeds.
- [ ] App boots: `npm run dev` → home loads at `http://localhost:3000`, `/healthz` returns `{ ok: true }`.

## 🖱️ Manual smoke test
- [ ] Home renders; scenario picker + CTAs work; `S` / `M` shortcuts work.
- [ ] Nav links resolve: `/`, `/mock`, `/about`, `/privacy`, `/terms` (no 404s); unknown route shows the styled 404.
- [ ] Start a live session → mic/camera prompt → transcript + meters update.
- [ ] End session → report renders (with AI review if `GEMINI_API_KEY` is set).
- [ ] Mock flow: start → answer → end → graded report.

## 📝 Repo presentation
- [ ] README placeholders replaced (author, portfolio, repo URL).
- [ ] Optional screenshots/demo GIF added when available.
- [ ] `LICENSE` author/year set.
- [ ] Footer/layout repository link updated (`apps/web/app/layout.tsx`).
- [ ] `metadataBase` and social metadata in `layout.tsx` updated.
- [ ] Optional: remove or relocate `GEMINI_FIX_README.md` (internal dev notes).

## 🌐 If hosting publicly (not just GitHub)
- [ ] Restrict CORS to known origins.
- [ ] Put real values behind a secret manager; never ship keys in client bundles.
- [ ] Add rate limiting in front of Gemini/Speech-backed routes.
