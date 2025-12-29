/**
 * Mobile menu handling
 */

export function initMobileMenu() {
  const menuToggle = document.getElementById('menuToggle');
  const menuOverlay = document.getElementById('menuOverlay');
  const controls = document.getElementById('controls');

  if (!menuToggle || !menuOverlay || !controls) {
    console.warn('Mobile menu elements not found');
    return;
  }

  function toggleMenu() {
    const isActive = controls.classList.toggle('active');
    menuToggle.classList.toggle('active', isActive);
    menuOverlay.classList.toggle('active', isActive);

    if (window.innerWidth <= 768) {
      document.body.style.overflow = isActive ? 'hidden' : '';
    }
  }

  function closeMenu() {
    controls.classList.remove('active');
    menuToggle.classList.remove('active');
    menuOverlay.classList.remove('active');
    if (window.innerWidth <= 768) {
      document.body.style.overflow = '';
    }
  }

  menuToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMenu();
  });

  menuOverlay.addEventListener('click', closeMenu);

  if (window.innerWidth <= 768) {
    const actionButtons = document.querySelectorAll('.shape-buttons button, #resetFlow, #scatterFlow');
    actionButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        setTimeout(closeMenu, 300);
      });
    });
  }

  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (window.innerWidth > 768) {
        controls.classList.remove('active');
        menuToggle.classList.remove('active');
        menuOverlay.classList.remove('active');
        document.body.style.overflow = '';
      }
    }, 250);
  });

  console.log('✓ Mobile menu initialized');

  return { toggleMenu, closeMenu };
}
