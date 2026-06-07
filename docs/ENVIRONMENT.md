# Environment variables

Echo reads configuration from two files (both git-ignored):

- **Backend:** `apps/api/.env`  → template: `apps/api/.env.example`
- **Frontend:** `apps/web/.env.local` → template: `apps/web/.env.example`

> ⚠️ **Never commit real secrets.** API keys and Google credential JSON files
> are excluded by `.gitignore`. Rotate any key that is accidentally committed.

## Backend (`apps/api/.env`)

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | For AI review + mock | — | Google AI Studio key. Without it, sessions still score; the AI review is skipped. |
| `GOOGLE_APPLICATION_CREDENTIALS` | For live transcription | — | Absolute path to a Google Cloud service-account JSON with Speech-to-Text enabled. |
| `SPEECH_LANGUAGE` | No | `en-US` | BCP-47 language code for transcription. |
| `PORT` | No | `8787` | API + WebSocket port. |
| `LOG_LEVEL` | No | `info` | `silent` \| `error` \| `warn` \| `info` \| `debug`. |
| `GEMINI_REVIEW_MODEL` | No | `gemini-2.5-flash` | Model for the coaching review. |
| `GEMINI_REVIEW_TEMPERATURE` | No | `0.2` | Sampling temperature for review. |
| `GEMINI_REVIEW_MAX_TOKENS` | No | `2048` | Max output tokens for review. |
| `GEMINI_MOCK_MODEL` | No | `gemini-2.5-flash` | Model for mock questions + grading. |
| `GEMINI_MOCK_TEMPERATURE` | No | `0.2` | Sampling temperature for mock. |
| `GEMINI_MOCK_MAX_TOKENS` | No | `2048` | Max output tokens for mock. |

## Frontend (`apps/web/.env.local`)

All browser-exposed variables must be prefixed `NEXT_PUBLIC_`.

| Variable | Required | Example | Description |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Yes | `http://localhost:8787` | Base URL for REST calls. |
| `NEXT_PUBLIC_WS_URL` | Yes | `ws://localhost:8787/ws/coaching` | Coaching metrics WebSocket. |
| `NEXT_PUBLIC_WS_LIVE_URL` | Yes | `ws://localhost:8787/ws/live` | Live transcription WebSocket. |

## Getting a Gemini API key
1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Create/select a project and generate an API key.
3. Put it in `apps/api/.env` as `GEMINI_API_KEY`.

## Getting Google Cloud Speech credentials
1. Create a Google Cloud project and enable **Speech-to-Text API**.
2. Create a service account, grant the Speech role, and download a JSON key.
3. Point `GOOGLE_APPLICATION_CREDENTIALS` at the **absolute path** of that file.
4. Keep the JSON outside version control (it matches the credential patterns in `.gitignore`).

## Graceful degradation
- **No Gemini key:** live sessions and metrics still work; the report shows scores
  and the helpful built-in tips, but the AI review section stays unavailable.
- **No Google credentials:** the live transcription socket sends a `state` message
  explaining the missing credentials; metrics that don't depend on transcription
  (loudness, eye contact, smile) still function.
