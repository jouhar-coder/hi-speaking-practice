# hi backend

Run the complete local MVP from this folder:

```powershell
npm start
```

Then visit `http://localhost:3000`. The server hosts the website and exposes 10 initial languages: English, Spanish, French, German, Italian, Japanese, Korean, Hindi, Arabic, and Malayalam.

- `GET /api/health` — confirms status and language count
- `GET /api/languages` — the 8 initial supported languages
- `POST /api/auth/register` — creates a user with an scrypt password hash
- `POST /api/auth/login` — starts a session
- `GET /api/me` — returns the signed-in user with a Bearer token
- `POST /api/sessions` — starts a language-practice session

This is an MVP backend: users and session tokens are deliberately stored in memory, so restarting the process clears them. For deployment, keep these API routes as Vercel Functions/Route Handlers and put users, sessions, progress, and feedback in Postgres (for example Neon or Supabase). Use HTTP-only secure cookies rather than browser storage for production sessions.
