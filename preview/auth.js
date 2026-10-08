const form = document.querySelector('form');
const message = document.getElementById('message');
const isSignup = form.id === 'signup-form';
function showMessage(text, ok = false) { message.textContent = text; message.className = `message${ok ? ' ok' : ''}`; }
form?.addEventListener('submit', async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  if (isSignup) data.name = document.getElementById('name').value.trim();
  data.email = document.getElementById('email').value.trim();
  data.password = document.getElementById('password').value;
  try {
    const response = await fetch(`/api/auth/${isSignup ? 'register' : 'login'}`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Something went wrong.');
    localStorage.setItem('hi_session', result.token);
    showMessage(`Welcome${result.user.name ? `, ${result.user.name}` : ''}! Your dashboard is ready.`, true);
    setTimeout(() => location.href = 'index.html', 850);
  } catch (error) { showMessage(error.message.includes('Failed to fetch') ? 'Start the hi backend first, then try again.' : error.message); }
});
