/**
 * Mobile menu handling
 */

export interface MobileMenuControls {
  toggleMenu: () => void;
  closeMenu: () => void;
}

export function initMobileMenu(): MobileMenuControls | undefined {
  const menuToggle: HTMLElement | null = document.getElementById('menuToggle');
  const menuOverlay: HTMLElement | null = document.getElementById('menuOverlay');
  const controls: HTMLElement | null = document.getElementById('controls');

  if (!menuToggle || !menuOverlay || !controls) {
    console.warn('Mobile menu elements not found');
    return;
  }

  function toggleMenu(): void {
    const isActive: boolean = controls!.classList.toggle('active');
    menuToggle!.classList.toggle('active', isActive);
    menuOverlay!.classList.toggle('active', isActive);

    if (window.innerWidth <= 768) {
      document.body.style.overflow = isActive ? 'hidden' : '';
    }
  }

  function closeMenu(): void {
    controls!.classList.remove('active');
    menuToggle!.classList.remove('active');
    menuOverlay!.classList.remove('active');
    if (window.innerWidth <= 768) {
      document.body.style.overflow = '';
    }
  }

  menuToggle.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    toggleMenu();
  });

  menuOverlay.addEventListener('click', closeMenu);

  if (window.innerWidth <= 768) {
    const actionButtons: NodeListOf<Element> = document.querySelectorAll('.shape-buttons button, #resetFlow, #scatterFlow');
    actionButtons.forEach((btn: Element) => {
      btn.addEventListener('click', () => {
        setTimeout(closeMenu, 300);
      });
    });
  }

  let resizeTimeout: ReturnType<typeof setTimeout>;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (window.innerWidth > 768) {
        controls!.classList.remove('active');
        menuToggle!.classList.remove('active');
        menuOverlay!.classList.remove('active');
        document.body.style.overflow = '';
      }
    }, 250);
  });

  console.log('✓ Mobile menu initialized');

  return { toggleMenu, closeMenu };
}
