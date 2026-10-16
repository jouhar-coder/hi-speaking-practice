// hi's API server. Production should replace in-memory stores and rate limits with a database/shared limiter.
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const port = Number(process.env.PORT || 3000);
const previewDir = path.resolve(__dirname, '..', 'preview');
const users = new Map(); // email -> { id, name, email, passwordHash, createdAt }
const sessions = new Map(); // token -> userId
const chatRate = new Map(); // IP -> { count, resetAt }; use a shared limiter in production
const languages = [
  { id: 'en', name: 'English', flag: '🇬🇧', locale: 'en-US', levels: ['A1', 'A2', 'B1', 'B2', 'C1'] },
  { id: 'es', name: 'Spanish', flag: '🇪🇸', locale: 'es-ES', levels: ['A1', 'A2', 'B1', 'B2', 'C1'] },
  { id: 'fr', name: 'French', flag: '🇫🇷', locale: 'fr-FR', levels: ['A1', 'A2', 'B1', 'B2', 'C1'] },
  { id: 'de', name: 'German', flag: '🇩🇪', locale: 'de-DE', levels: ['A1', 'A2', 'B1', 'B2', 'C1'] },
  { id: 'it', name: 'Italian', flag: '🇮🇹', locale: 'it-IT', levels: ['A1', 'A2', 'B1', 'B2', 'C1'] },
  { id: 'ja', name: 'Japanese', flag: '🇯🇵', locale: 'ja-JP', levels: ['A1', 'A2', 'B1', 'B2'] },
  { id: 'ko', name: 'Korean', flag: '🇰🇷', locale: 'ko-KR', levels: ['A1', 'A2', 'B1', 'B2'] },
  { id: 'hi', name: 'Hindi', flag: '🇮🇳', locale: 'hi-IN', levels: ['A1', 'A2', 'B1', 'B2'] },
  { id: 'ar', name: 'Arabic', flag: '🇸🇦', locale: 'ar-SA', levels: ['A1', 'A2', 'B1', 'B2'] },
  { id: 'ml', name: 'Malayalam', flag: '🇮🇳', locale: 'ml-IN', levels: ['A1', 'A2', 'B1', 'B2'] }
];

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 100_000) { reject(new Error('Request body is too large.')); req.destroy(); }
    });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Invalid JSON body.')); } });
    req.on('error', reject);
  });
}
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function comparePassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
}
function publicUser(user) { return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt }; }
function createSession(user) { const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, user.id); return token; }
function authorize(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const id = sessions.get(token);
  return [...users.values()].find(user => user.id === id);
}
function contentType(file) { return ({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'})[path.extname(file)] || 'application/octet-stream'; }
function serveStatic(url, res) {
  const requested = url === '/' ? '/index.html' : url;
  const file = path.resolve(previewDir, `.${requested}`);
  if (!file.startsWith(previewDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return json(res, 404, { error: 'Not found.' });
  res.writeHead(200, { 'Content-Type': contentType(file) });
  fs.createReadStream(file).pipe(res);
}
function allowedChatRequest(req) {
  const key = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const bucket = chatRate.get(key);
  if (!bucket || bucket.resetAt <= now) {
    chatRate.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (bucket.count >= 20) return false;
  bucket.count += 1;
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { status: 'ok', languages: languages.length, aiConfigured: Boolean(process.env.OPENAI_API_KEY) });
    if (req.method === 'GET' && url.pathname === '/api/languages') return json(res, 200, { languages });
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      if (!allowedChatRequest(req)) return json(res, 429, { error: 'Too many messages. Please wait a minute and try again.' });
      if (!process.env.OPENAI_API_KEY) return json(res, 503, { error: 'AI chat is not configured yet. Add OPENAI_API_KEY in the Render environment settings.' });
      const { languageId, nativeLanguageId, level = 'A1', scenario = 'friendly everyday conversation', messages = [] } = await readJson(req);
      const language = languages.find(item => item.id === languageId);
      const nativeLanguage = languages.find(item => item.id === nativeLanguageId);
      if (!language) return json(res, 400, { error: 'Choose a supported conversation language.' });
      if (!Array.isArray(messages) || messages.length < 1 || messages.length > 12) return json(res, 400, { error: 'Send between 1 and 12 recent conversation messages.' });
      const safeMessages = messages.map(message => {
        if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || !message.content.trim() || message.content.length > 1200) {
          throw new Error('Each message must have a valid role and contain 1–1200 characters.');
        }
        return { role: message.role, content: message.content.trim() };
      });
      const systemPrompt = [
        'You are hi, a friendly and patient multilingual speaking partner for language learners.',
        `The target language is ${language.name} (${language.locale}).`,
        `The learner's level is ${String(level).slice(0, 20)}.`,
        `Conversation scenario: ${String(scenario).slice(0, 120)}.`,
        `Respond in ${language.name} only. Never answer in English or another language unless the user explicitly asks for a translation.`,
        'Understand the meaning of what the learner says even if they use another language, then continue the conversation in the target language.',
        'Use natural, everyday language appropriate to the learner level. Keep each response to 1–4 short sentences and finish with one relevant question when it feels natural.',
        'Do not merely translate the learner. Be a conversation partner. Be encouraging, and do not interrupt the conversation with long grammar lectures.',
        `If the user explicitly asks for a translation or an explanation, use their preferred language (${nativeLanguage?.name || 'the language they ask for'}) for that explanation, then continue the conversation in ${language.name}.`
      ].join(' ');
      const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-5.5',
          messages: [{ role: 'system', content: systemPrompt }, ...safeMessages],
          max_completion_tokens: 220
        }),
        signal: AbortSignal.timeout(25_000)
      });
      const result = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        console.error('AI provider returned status', upstream.status);
        return json(res, 502, { error: upstream.status === 429 ? 'The AI service is busy. Please try again shortly.' : 'The AI service could not complete this reply. Check the server API configuration.' });
      }
      const reply = result.choices?.[0]?.message?.content?.trim();
      if (!reply) return json(res, 502, { error: 'The AI returned an empty reply. Please try again.' });
      return json(res, 200, { reply, language: language.name });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/register') {
      const { name, email, password } = await readJson(req);
      if (!name?.trim() || !email?.includes('@') || !password || password.length < 8) return json(res, 400, { error: 'Name, a valid email, and an 8-character password are required.' });
      const key = email.trim().toLowerCase();
      if (users.has(key)) return json(res, 409, { error: 'An account already exists for that email.' });
      const user = { id: crypto.randomUUID(), name: name.trim(), email: key, passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
      users.set(key, user);
      return json(res, 201, { token: createSession(user), user: publicUser(user) });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const { email, password } = await readJson(req);
      const user = users.get(email?.trim().toLowerCase());
      if (!user || !password || !comparePassword(password, user.passwordHash)) return json(res, 401, { error: 'Email or password is incorrect.' });
      return json(res, 200, { token: createSession(user), user: publicUser(user) });
    }
    if (req.method === 'GET' && url.pathname === '/api/me') {
      const user = authorize(req);
      return user ? json(res, 200, { user: publicUser(user) }) : json(res, 401, { error: 'Sign in required.' });
    }
    if (req.method === 'POST' && url.pathname === '/api/sessions') {
      const user = authorize(req); if (!user) return json(res, 401, { error: 'Sign in required.' });
      const { languageId, scenario, level = 'A1' } = await readJson(req);
      const language = languages.find(item => item.id === languageId);
      if (!language || !scenario) return json(res, 400, { error: 'Choose a language and scenario.' });
      return json(res, 201, { session: { id: crypto.randomUUID(), userId: user.id, language, scenario, level, startedAt: new Date().toISOString() } });
    }
    return serveStatic(url.pathname, res);
  } catch (error) {
    if (res.headersSent || res.destroyed) return;
    return json(res, 400, { error: error.message || 'Invalid request.' });
  }
});
server.listen(port, () => console.log(`hi is running at http://localhost:${port}`));
