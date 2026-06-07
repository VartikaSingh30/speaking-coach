# Roadmap

Echo today is a working, local-first demo. This is the path toward a more
production-shaped product. Items are roughly ordered by impact.

## Near-term
- [ ] **Persistent storage** — wire the existing Mongo-ready schema to MongoDB Atlas so sessions/reports survive restarts (`apps/api/src/db`).
- [ ] **Consolidate scoring on `@echo/core`** — remove the in-sync copy in `apps/api/src/routes/session.ts` once `tsx`/ESM path resolution is verified in dev and build.
- [ ] **Lock down CORS** — replace `cors()` allow-all with an allow-list driven by env.
- [ ] **Request validation layer** — adopt a schema validator (e.g. `zod`) for all REST bodies and return consistent error envelopes.
- [ ] **Screenshots / demo GIF** — add to `docs/screenshots/` and the README.

## Mid-term
- [ ] **Authentication + history** — accounts, saved sessions, and progress trends over time.
- [ ] **Integration tests** — REST + WebSocket happy-path tests; mock the Gemini/Speech calls.
- [ ] **Structure score v2** — optional LLM-assisted structure analysis with the current heuristic as a fast fallback.
- [ ] **Configurable coaching targets** — let users set pace/filler goals per scenario.
- [ ] **Accessibility pass** — full keyboard nav + screen-reader audit of the live view.

## Longer-term
- [ ] **Deployment** — API on Cloud Run, web on Vercel; secrets via Secret Manager (see `infra/`).
- [ ] **Multi-language coaching** — beyond `en-US`.
- [ ] **Shareable report links** — signed, expiring URLs backed by persistent storage.
- [ ] **Team / cohort mode** — instructors reviewing student sessions.

## Known technical debt
- In-memory stores (`sessions`, `reports`, mock `__REPORTS__`) are process-local.
- Scoring logic is duplicated between `apps/api` and `packages/core` (intentional, documented).
- CI runs install, typecheck, tests, and production build on PRs and pushes to `main`.
