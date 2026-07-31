# Production Readiness Checklist

This checklist is the remaining Phase 7 gate. Automated checks run in the repository; provider-side items require confirmation in Supabase, Vercel, and Cloudflare.

## Automated in repository

- [x] `npm test -- --run`
- [x] `npm run lint`
- [x] `npm run build`
- [x] Verify all browser-facing API keys are personal user settings; no service keys are bundled by Vite.
- [x] Verify owner filters remain on learning sessions, attempts, learning cards, imports, and vocabulary repositories.

## Manual/provider confirmation required

- [x] Run an authenticated learner/admin smoke test against the deployed Vercel URL.
- [x] Supabase: confirm RLS is enabled, run security/performance advisors, configure scheduled backups, and perform one restore drill.
- [x] Vercel: configure production environment variables, verify Function logs, timeout/memory limits, and deployment rollback.
- [x] Cloudflare R2: verify private bucket policy, object lifecycle/cleanup policy, CORS, and key rotation.
- [x] Accessibility: keyboard-only pass, visible focus pass, screen-reader labels, zoom to 200%, and reduced-motion pass.
- [x] Load: run a representative CSV import and review session against a staging database; record latency and error rate.
- [x] Monitoring: define alert thresholds for failed Supabase writes, Gemini quota/HTTP errors, R2 upload failures, and Vercel 5xx responses.

## Verification result

All Phase 7 checks were confirmed passing by the owner on 2026-07-31.
