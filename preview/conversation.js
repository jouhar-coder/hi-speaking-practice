const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const chat = document.getElementById('chat');
const mic = document.getElementById('mic');
const statusText = document.getElementById('status');
const stateText = document.getElementById('state');
const language = document.getElementById('language');
const transcript = document.getElementById('transcript');
const empty = document.getElementById('empty');
const levelSelect = document.getElementById('level');
const themeToggle = document.getElementById('themeToggle');
if (localStorage.getItem('hi-theme') === 'dark') document.body.classList.add('dark');
themeToggle?.addEventListener('click', () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('hi-theme', document.body.classList.contains('dark') ? 'dark' : 'light');
  themeToggle.textContent = document.body.classList.contains('dark') ? '☀ Light' : '☾ Theme';
});
if (themeToggle) themeToggle.textContent = document.body.classList.contains('dark') ? '☀ Light' : '☾ Theme';
let recognition;
let listening = false;
let waitingForReply = false;
const history = [];
const languageIds = {
  'en-US': 'en', 'es-ES': 'es', 'fr-FR': 'fr', 'de-DE': 'de',
  'it-IT': 'it', 'ja-JP': 'ja', 'ko-KR': 'ko', 'hi-IN': 'hi',
  'ar-SA': 'ar', 'ml-IN': 'ml'
};

function add(text, you = false, translation = '') {
  empty?.remove();
  const bubble = document.createElement('div');
  bubble.className = `bubble${you ? ' you' : ''}`;
  bubble.append(document.createTextNode(text));
  const meta = document.createElement('small');
  meta.textContent = `${you ? 'You' : 'hi coach'} · just now`;
  bubble.append(meta);
  if (!you && translation) {
    const translated = document.createElement('div');
    translated.className = 'translation';
    translated.append(document.createTextNode('🇬🇧 Meaning: ' + translation));
    bubble.append(translated);
  }
  chat.append(bubble);
  chat.scrollTop = chat.scrollHeight;
}

function speak(text) {
  if (!('speechSynthesis' in window)) {
    statusText.textContent = 'Your device does not support spoken playback. You can still read the reply.';
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language.value;
  utterance.rate = 0.88;
  const voices = speechSynthesis.getVoices();
  const voice = voices.find(item => item.lang.toLowerCase() === language.value.toLowerCase())
    || voices.find(item => item.lang.toLowerCase().startsWith(language.value.slice(0, 2).toLowerCase()));
  if (voice) utterance.voice = voice;
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
}

async function replyTo(text) {
  if (waitingForReply) return;
  waitingForReply = true;
  mic.disabled = true;
  statusText.textContent = 'hi is thinking…';
  stateText.textContent = '● preparing reply';
  history.push({ role: 'user', content: text });
  const recentMessages = history.slice(-12);
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        languageId: languageIds[language.value] || 'en',
        level: levelSelect?.value || 'Beginner',
        scenario: 'friendly everyday speaking practice',
        messages: recentMessages
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'The AI could not reply. Please try again.');
    const answer = String(data.reply || '').trim();
    if (!answer) throw new Error('The AI returned an empty reply. Please try again.');
    history.push({ role: 'assistant', content: answer });
    if (history.length > 12) history.splice(0, history.length - 12);
    add(answer, false, data.translation || '');
    speak(answer);
    statusText.textContent = `AI replied in ${data.language || language.options[language.selectedIndex].text.replace(/^..\\s/, '')}. Tap the microphone to continue.`;
    stateText.textContent = '● ready to listen';
  } catch (error) {
    history.pop();
    statusText.textContent = error.message || 'Could not connect to the AI. Please try again.';
    stateText.textContent = '● connection issue';
    add(`Connection issue: ${error.message || 'Please try again.'}`);
  } finally {
    waitingForReply = false;
    mic.disabled = false;
  }
}

function setListening(on) {
  listening = on;
  mic.classList.toggle('live', on);
  mic.textContent = on ? '■' : '🎙';
  statusText.textContent = on ? 'Listening… speak now' : 'Tap the microphone to continue';
  stateText.textContent = on ? '● listening' : '● ready to listen';
}

function createRecognition() {
  if (!SpeechRecognition) {
    statusText.textContent = 'Speech recognition is not supported in this browser. Try Chrome or Edge.';
    return null;
  }
  const r = new SpeechRecognition();
  r.continuous = false;
  r.interimResults = true;
  r.lang = language.value;
  r.onstart = () => setListening(true);
  r.onresult = event => {
    let words = '';
    for (let i = event.resultIndex; i < event.results.length; i++) words += event.results[i][0].transcript;
    transcript.textContent = `Hearing: “${words}”`;
    if (event.results[event.results.length - 1].isFinal) {
      const finalText = words.trim();
      transcript.textContent = '';
      if (finalText) {
        add(finalText, true);
        replyTo(finalText);
      }
    }
  };
  r.onerror = event => {
    const reason = event.error === 'not-allowed'
      ? 'Please allow microphone access in your browser, then try again.'
      : `I could not hear you (${event.error}). Try again.`;
    statusText.textContent = reason;
  };
  r.onend = () => setListening(false);
  return r;
}

mic.addEventListener('click', () => {
  if (waitingForReply) return;
  if (listening) {
    recognition?.stop();
    return;
  }
  recognition = createRecognition();
  try { recognition?.start(); } catch { statusText.textContent = 'Microphone is busy. Please try again in a moment.'; }
});

language.addEventListener('change', () => {
  history.length = 0;
  chat.replaceChildren();
  const emptyMessage = document.createElement('div');
  emptyMessage.className = 'empty';
  emptyMessage.id = 'empty';
  emptyMessage.textContent = 'Language changed. Press the microphone and start a new conversation.';
  chat.append(emptyMessage);
  statusText.textContent = `Ready to practise ${language.options[language.selectedIndex].text.replace(/^..\\s/, '')}.`;
  speechSynthesis?.cancel();
});
