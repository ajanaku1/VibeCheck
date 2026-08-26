const screens = [...document.querySelectorAll('[data-screen]')];
const navigation = [...document.querySelectorAll('[data-go]')];

function screenExists(name) {
  return screens.some((screen) => screen.dataset.screen === name);
}

function showScreen(name, updateHash = true) {
  const target = screenExists(name) ? name : 'landing';
  screens.forEach((screen) => {
    screen.hidden = screen.dataset.screen !== target;
  });
  navigation.forEach((control) => {
    const active = control.dataset.go === target;
    control.toggleAttribute('data-current', active);
    if (control.matches('[data-screen-link]')) {
      control.setAttribute('aria-current', active ? 'page' : 'false');
    }
  });
  if (updateHash) history.replaceState(null, '', `#${target}`);
  window.scrollTo({ top: 0, behavior: 'instant' });
  document.querySelector(`[data-screen="${target}"] h1`)?.focus({ preventScroll: true });
}

navigation.forEach((control) => {
  control.addEventListener('click', () => showScreen(control.dataset.go));
});

document.addEventListener('keydown', (event) => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (/^[1-3]$/.test(event.key) || ['ArrowLeft', 'ArrowRight', 'r', 'R'].includes(event.key)) {
    parent.postMessage({ type: 'vibecheck-prototype-key', key: event.key }, '*');
  }
});

window.addEventListener('hashchange', () => showScreen(location.hash.slice(1), false));
showScreen(location.hash.slice(1) || 'landing', false);
