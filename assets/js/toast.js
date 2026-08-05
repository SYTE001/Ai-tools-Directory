(function(window) {
  function createToastContainer() {
    let container = document.getElementById("toastContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "toastContainer";
      container.setAttribute("role", "alert");
      container.setAttribute("aria-live", "polite");
      container.style.cssText = `
        position: fixed;
        top: 24px;
        right: 24px;
        z-index: 99999;
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: none;
        max-width: 380px;
        width: calc(100vw - 48px);
      `;
      document.body.appendChild(container);
    }
    return container;
  }

  function showToast(message, type = 'info', duration = 3500) {
    const container = createToastContainer();

    const toast = document.createElement("div");
    const bgMap = {
      success: '#34C759',
      error: '#FF3B30',
      warning: '#FF9500',
      info: '#4F8CFF'
    };
    const iconMap = {
      success: '✓',
      error: '✕',
      warning: '⚠️',
      info: 'ℹ️'
    };

    const bg = bgMap[type] || bgMap.info;
    const icon = iconMap[type] || iconMap.info;

    toast.style.cssText = `
      background: ${bg};
      color: #FFFFFF;
      padding: 12px 18px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 14px;
      line-height: 1.4;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
      pointer-events: auto;
      opacity: 0;
      transform: translateY(-12px) scale(0.96);
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex;
      align-items: center;
      gap: 10px;
      word-break: break-word;
    `;

    toast.innerHTML = `
      <span style="font-size:16px; flex-shrink:0;">${icon}</span>
      <span style="flex:1;">${message}</span>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0) scale(1)";
    });

    const timer = setTimeout(() => {
      dismissToast(toast);
    }, duration);

    toast.addEventListener('click', () => {
      clearTimeout(timer);
      dismissToast(toast);
    });
  }

  function dismissToast(toast) {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-12px) scale(0.96)";
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 250);
  }

  window.showToast = showToast;
})(window);
