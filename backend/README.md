# hi backend

Run the complete local MVP from this folder:

```powershell
npm start
```

Then visit `http://localhost:3000`.

## API routes

- `GET /api/health` — status, supported language count, and whether the AI API key is configured
- `GET /api/languages` — the 10 supported languages: English, Spanish, French, German, Italian, Japanese, Korean, Hindi, Arabic, and Malayalam
- `POST /api/chat` — sends recent conversation messages to the AI and asks for a reply in the selected target language
- `POST /api/auth/register` — creates a user with an scrypt password hash
- `POST /api/auth/login` — starts a session
- `GET /api/me` — returns the signed-in user with a Bearer token
- `POST /api/sessions` — starts a language-practice session

## Configure AI replies

Set one provider key on Render (or in your local shell):

- `GROQ_API_KEY` — recommended option to try Groq's available free developer tier; when present, the backend uses `https://api.groq.com/openai/v1/chat/completions` and defaults to `openai/gpt-oss-120b`.
- `OPENAI_API_KEY` — optional alternative if you use OpenAI API billing. Groq is preferred automatically when both keys are present.
- `AI_MODEL` — optional override for the model when using Groq or OpenAI.
- `OPENAI_MODEL` — legacy OpenAI-only model override when `AI_MODEL` is not set.

Free-tier access, model availability, and rate limits depend on the provider account and can change. A `429` can mean the provider's rate limit or quota has been reached; wait or check the provider dashboard.

Never put the API key in frontend JavaScript, Flutter source, or GitHub. The `/api/chat` route has basic in-memory rate limiting and request-size limits, but these are not a substitute for production-grade shared rate limiting, authentication, monitoring, and abuse controls.

## MVP limitations

Users and session tokens are stored in memory, so restarts clear them. Conversation history is sent by the client and is not persisted by the server. Before public scale, move accounts and learning progress to Postgres (for example, Neon or Supabase), use secure sessions, and add shared rate limiting.
