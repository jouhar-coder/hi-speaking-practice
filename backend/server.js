// hi's local API server. Production should replace the in-memory stores with Postgres.
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const port = Number(process.env.PORT || 3000);
const previewDir = path.resolve(__dirname, '..', 'preview');
const users = new Map(); // email -> { id, name, email, passwordHash, createdAt }
const sessions = new Map(); // token -> userId
const languages = [
  { id: 'en', name: 'English', flag: '🇬🇧', levels: ['A1', 'A2', 'B1', 'B2', 'C1'] },
  { id: 'es', name: 'Spanish', flag: '🇪🇸', levels: ['A1', 'A2', 'B1', 'B2', 'C1'] },
  { id: 'fr', name: 'French', flag: '🇫🇷', levels: ['A1', 'A2', 'B1', 'B2', 'C1'] },
  { id: 'de', name: 'German', flag: '🇩🇪', levels: ['A1', 'A2', 'B1', 'B2', 'C1'] },
  { id: 'it', name: 'Italian', flag: '🇮🇹', levels: ['A1', 'A2', 'B1', 'B2', 'C1'] },
  { id: 'ja', name: 'Japanese', flag: '🇯🇵', levels: ['A1', 'A2', 'B1', 'B2'] },
  { id: 'ko', name: 'Korean', flag: '🇰🇷', levels: ['A1', 'A2', 'B1', 'B2'] },
  { id: 'hi', name: 'Hindi', flag: '🇮🇳', levels: ['A1', 'A2', 'B1', 'B2'] },
  { id: 'ar', name: 'Arabic', flag: '🇸🇦', levels: ['A1', 'A2', 'B1', 'B2'] },
  { id: 'ml', name: 'Malayalam', flag: '🇮🇳', levels: ['A1', 'A2', 'B1', 'B2'] }
];

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 100_000) req.destroy(); });
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { status: 'ok', languages: languages.length });
    if (req.method === 'GET' && url.pathname === '/api/languages') return json(res, 200, { languages });
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
  } catch (error) { return json(res, 400, { error: error.message || 'Invalid request.' }); }
});
server.listen(port, () => console.log(`hi is running at http://localhost:${port}`));
