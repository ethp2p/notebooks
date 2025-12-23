export function initMobileNav() {
  const menuButtonContainer = document.getElementById('mobile-nav-buttons');
  const tocButtonContainer = document.getElementById('mobile-toc-buttons');
  const menuButton = document.getElementById('mobile-menu-button');
  const tocButton = document.getElementById('mobile-toc-button');
  const backdrop = document.getElementById('mobile-nav-backdrop');
  const sidebarDrawer = document.getElementById('mobile-sidebar-drawer');
  const tocDrawer = document.getElementById('mobile-toc-drawer');
  const closeButtons = document.querySelectorAll('.mobile-drawer-close');

  if (!backdrop || !menuButton) return;

  let activeDrawer: HTMLElement | null = null;
  let isTocOpen = false;
  let hideTimeout: ReturnType<typeof setTimeout> | null = null;

  // Check if we're in mobile mode (below lg breakpoint)
  const isMobile = () => window.innerWidth < 1024;

  function showButtons() {
    if (activeDrawer || isTocOpen) return;
    // Menu button container (mobile only)
    menuButtonContainer?.classList.remove('opacity-0', 'translate-y-4');
    menuButtonContainer?.classList.add('opacity-100', 'translate-y-0');
    // TOC button container (mobile only - at lg+ it's always visible via CSS)
    if (isMobile() && tocButtonContainer) {
      tocButtonContainer.classList.remove('opacity-0');
      tocButtonContainer.classList.add('opacity-100');
    }

    if (hideTimeout) clearTimeout(hideTimeout);
    hideTimeout = setTimeout(hideButtons, 2500);
  }

  function hideButtons() {
    if (activeDrawer || isTocOpen) return;
    menuButtonContainer?.classList.add('opacity-0', 'translate-y-4');
    menuButtonContainer?.classList.remove('opacity-100', 'translate-y-0');
    // Only hide TOC button on mobile
    if (isMobile() && tocButtonContainer) {
      tocButtonContainer.classList.add('opacity-0');
      tocButtonContainer.classList.remove('opacity-100');
    }
  }

  function openSidebar() {
    if (isTocOpen) closeToc();
    activeDrawer = sidebarDrawer;
    sidebarDrawer?.classList.remove('-translate-x-full');
    sidebarDrawer?.classList.add('translate-x-0');
    backdrop!.classList.remove('opacity-0', 'pointer-events-none');
    backdrop!.classList.add('opacity-100');
    menuButton!.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    if (hideTimeout) clearTimeout(hideTimeout);
  }

  function closeSidebar() {
    sidebarDrawer?.classList.add('-translate-x-full');
    sidebarDrawer?.classList.remove('translate-x-0');
    backdrop!.classList.add('opacity-0', 'pointer-events-none');
    backdrop!.classList.remove('opacity-100');
    menuButton!.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    activeDrawer = null;
    hideTimeout = setTimeout(hideButtons, 2500);
  }

  function openToc() {
    if (activeDrawer) closeSidebar();
    isTocOpen = true;
    tocDrawer?.classList.remove('opacity-0', 'scale-95', 'pointer-events-none');
    tocDrawer?.classList.add('opacity-100', 'scale-100', 'pointer-events-auto');
    tocButton?.setAttribute('aria-expanded', 'true');
    if (hideTimeout) clearTimeout(hideTimeout);
  }

  function closeToc() {
    isTocOpen = false;
    tocDrawer?.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
    tocDrawer?.classList.remove('opacity-100', 'scale-100', 'pointer-events-auto');
    tocButton?.setAttribute('aria-expanded', 'false');
    hideTimeout = setTimeout(hideButtons, 2500);
  }

  function closeAll() {
    if (activeDrawer) closeSidebar();
    if (isTocOpen) closeToc();
  }

  // Scroll listener - show buttons on scroll (mobile only for menu button)
  let ticking = false;

  const onScroll = () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        showButtons();
        ticking = false;
      });
      ticking = true;
    }
  };

  window.removeEventListener('scroll', onScroll); // Clean up potential old listeners if any (though init is usually fresh)
  window.addEventListener('scroll', onScroll, { passive: true });

  // Touch move also shows buttons (for momentum scrolling)
  window.addEventListener('touchmove', showButtons, { passive: true });

  // Menu button toggles sidebar
  // Clone to remove old listeners
  const newMenuBtn = menuButton.cloneNode(true);
  menuButton.parentNode?.replaceChild(newMenuBtn, menuButton);
  newMenuBtn.addEventListener('click', () => {
    showButtons(); // Ensure visible
    if (activeDrawer) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });

  // TOC button toggles TOC bubble
  if (tocButton) {
     const newTocBtn = tocButton.cloneNode(true);
     tocButton.parentNode?.replaceChild(newTocBtn, tocButton);
     newTocBtn.addEventListener('click', () => {
      showButtons(); // Ensure visible
      if (isTocOpen) {
        closeToc();
      } else {
        openToc();
      }
    });
  }

  // Close buttons
  closeButtons.forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode?.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => {
      if (activeDrawer) closeSidebar();
      if (isTocOpen) closeToc();
    });
  });

  // Backdrop click closes sidebar
  const newBackdrop = backdrop.cloneNode(true);
  backdrop.parentNode?.replaceChild(newBackdrop, backdrop);
  newBackdrop.addEventListener('click', closeSidebar);

  // Click outside TOC bubble closes it
  document.addEventListener('click', (e) => {
    if (!isTocOpen) return;
    const target = e.target as HTMLElement;
    // We need to re-query buttons because we cloned them
    const currentTocDrawer = document.getElementById('mobile-toc-drawer');
    const currentTocButton = document.getElementById('mobile-toc-button');
    
    if (currentTocDrawer && !currentTocDrawer.contains(target) && currentTocButton && !currentTocButton.contains(target)) {
      closeToc();
    }
  });

  // Escape key closes all
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAll();
    }
  });

  // Links close their drawer
  sidebarDrawer?.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => setTimeout(closeSidebar, 100));
  });
  tocDrawer?.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => setTimeout(closeToc, 100));
  });

  // Resize to desktop closes all
  window.matchMedia('(min-width: 1024px)').addEventListener('change', (e) => {
    if (e.matches) closeAll();
  });
}
