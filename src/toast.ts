import { Z_TOAST, Z_MODAL_BACKDROP, TOAST_MAX_COUNT } from './layout-constants';
import { EASING, DURATION } from './utils/easing';

const V = (name: string, fallback: string) => `var(${name},${fallback})`;

const COLORS: Record<string, string> = {
  info: V('--fg-accent', '#5B8FF9'),
  success: V('--fg-success', '#4CAF50'),
  error: V('--fg-danger', '#e03030'),
  warning: V('--fg-warning', '#FF9800'),
};

let toastsContainer: HTMLElement | null = null;

function ensureContainer() {
  if (!toastsContainer) {
    toastsContainer = document.createElement('div');
    toastsContainer.style.cssText =
      `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:${Z_TOAST};` +
      'display:flex;flex-direction:column-reverse;gap:8px;pointer-events:none;';
    document.body.appendChild(toastsContainer);
  }
  return toastsContainer;
}

/** Animate a single toast: slide up from below into its stack position */
function animateIn(el: HTMLElement, offsetIndex: number): void {
  // 每条 toast 从下方 slide-in，依次堆叠
  el.style.opacity = '0';
  el.style.transform = `translateY(${24 + offsetIndex * 10}px) scale(0.92)`;
  el.style.transition = `opacity ${DURATION.normal}ms ${easingCSS('easeOut')}, transform ${DURATION.entrance}ms ${easingCSS('elasticOut')}`;

  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translateY(0) scale(1)';
  });
}

/** CSS easing shorthand */
function easingCSS(name: string): string {
  const map: Record<string, string> = {
    easeOut: 'cubic-bezier(0.33, 1, 0.68, 1)',
    elasticOut: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    backOut: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  };
  return map[name] || 'ease';
}

export function showToast(msg: string, type: 'info' | 'success' | 'error' | 'warning' = 'info', duration = 2500): void {
  const container = ensureContainer();
  const toast = document.createElement('div');
  const color = COLORS[type] || COLORS.info;
  toast.textContent = msg;
  toast.style.cssText =
    `padding:7px 16px;border-radius:${V('--fg-radius-md', '8px')};` +
    `font-size:${V('--fg-font-md', '0.85em')};color:${V('--fg-text', '#fff')};` +
    `background:${V('--fg-surface-elevated', 'rgba(40,42,48,0.92)')};` +
    `border-left:3px solid ${color};` +
    `border:1px solid ${V('--fg-glass-border', 'rgba(255,255,255,0.1)')};` +
    `box-shadow:${V('--fg-shadow-md', '0 4px 16px rgba(0,0,0,0.4)')};` +
    'backdrop-filter:blur(var(--fg-glass-blur-md,10px));-webkit-backdrop-filter:blur(var(--fg-glass-blur-md,10px));' +
    'opacity:0;transform:translateY(10px);pointer-events:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:80vw;' +
    'will-change:opacity,transform;';

  container.appendChild(toast);

  // Limit max toasts
  while (container.children.length > TOAST_MAX_COUNT) {
    const oldest = container.children[0];
    if (oldest instanceof HTMLElement) {
      oldest.style.opacity = '0';
      oldest.style.transform = 'translateY(-10px) scale(0.95)';
    }
    setTimeout(() => oldest?.remove(), DURATION.normal);
  }

  // Animate in with queue position
  const offsetIndex = container.children.length - 1;
  animateIn(toast, offsetIndex);

  // Auto dismiss
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px) scale(0.95)';
    toast.style.transition = `opacity ${DURATION.fast}ms ease, transform ${DURATION.fast}ms ease`;
    setTimeout(() => toast.remove(), DURATION.fast);
  }, duration);
}

export function confirmAction(msg: string): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      `position:fixed;inset:0;z-index:${Z_MODAL_BACKDROP};background:rgba(0,0,0,0.5);` +
      'display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.2s ease;';
    const dialog = document.createElement('div');
    dialog.style.cssText =
      `background:${V('--fg-surface-elevated', 'rgba(40,42,48,0.92)')};` +
      `backdrop-filter:blur(var(--fg-glass-blur-lg,14px));-webkit-backdrop-filter:blur(var(--fg-glass-blur-lg,14px));` +
      `border:1px solid ${V('--fg-glass-border', 'rgba(255,255,255,0.1)')};` +
      `border-radius:${V('--fg-radius-lg', '12px')};padding:16px 20px;` +
      `min-width:260px;max-width:380px;color:${V('--fg-text', '#d0d0d0')};` +
      `box-shadow:${V('--fg-shadow-lg', '0 8px 32px rgba(0,0,0,0.5)')};`;
    const label = document.createElement('div');
    label.textContent = msg;
    label.style.cssText = `margin-bottom:14px;font-size:${V('--fg-font-lg', '0.92em')};line-height:1.4;`;
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText =
      'padding:5px 14px;' +
      `border:1px solid ${V('--fg-border-light', 'rgba(255,255,255,0.15)')};` +
      `border-radius:${V('--fg-radius-md', '6px')};` +
      `background:transparent;color:${V('--fg-text', '#ccc')};cursor:pointer;font-size:${V('--fg-font-md', '0.85em')};`;
    const okBtn = document.createElement('button');
    okBtn.textContent = '确定';
    okBtn.style.cssText =
      'padding:5px 14px;border:none;' +
      `border-radius:${V('--fg-radius-md', '6px')};` +
      `background:${V('--fg-accent', '#5B8FF9')};color:${V('--fg-accent-text', '#fff')};cursor:pointer;font-size:${V('--fg-font-md', '0.85em')};`;
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(okBtn);
    dialog.appendChild(label);
    dialog.appendChild(btnRow);
    dialog.style.opacity = '0';
    dialog.style.transform = 'scale(0.95)';
    dialog.style.transition = 'opacity 0.2s ease,transform 0.2s ease';
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => { overlay.style.opacity = '1'; dialog.style.opacity = '1'; dialog.style.transform = 'scale(1)'; });
    const cleanup = (val: boolean) => {
      overlay.style.opacity = '0';
      dialog.style.opacity = '0';
      dialog.style.transform = 'scale(0.95)';
      setTimeout(() => { overlay.remove(); resolve(val); }, 200);
    };
    okBtn.onclick = () => cleanup(true);
    cancelBtn.onclick = () => cleanup(false);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
  });
}
