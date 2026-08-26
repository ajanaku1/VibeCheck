const screens = document.querySelectorAll('[data-screen]')

function showScreen(name) {
  screens.forEach((screen) => screen.toggleAttribute('hidden', screen.dataset.screen !== name))
  window.scrollTo({ top: 0, behavior: 'instant' })
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-go]')
  if (target) showScreen(target.dataset.go)
})

showScreen('landing')
