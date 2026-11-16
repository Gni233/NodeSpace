import { Z_WINDOW_CONTROLS } from './layout-constants';

interface DesktopWindow {
  minimizeWindow(): void;
  maximizeWindow(): void;
  closeWindow(): void;
  isMaximized(): Promise<boolean>;
  onMaximizeChange(listener: (maximized: boolean) => void): void;
  dragWindow?(phase: 'start' | 'move' | 'end'): void;
}

const minimizeIcon = 'M3 8.5h10';
const maximizeIcon = 'M3.5 3.5h9v9h-9z';
const restoreIcon = 'M5.5 4.5v-2h8v8h-2m-9-5h8v8h-8z';
const closeIcon = 'm3.5 3.5 9 9m0-9-9 9';

export function createWindowControls(api: DesktopWindow): HTMLElement {
  const controls = document.createElement('div');
  controls.className = 'fg-window-controls';
  controls.style.zIndex = String(Z_WINDOW_CONTROLS);
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', '窗口控制');

  const setIcon = (button: HTMLButtonElement, label: string, path: string) => {
    button.setAttribute('aria-label', label);
    button.title = api.dragWindow ? `${label} · 拖动可移动窗口` : label;
    button.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="${path}"/></svg>`;
  };
  const addButton = (label: string, path: string, action: () => void) => {
    const button = document.createElement('button');
    button.type = 'button';
    setIcon(button, label, path);
    let press: { id: number; x: number; y: number; dragged: boolean } | null = null;
    let ignoreClick = false;
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !event.isPrimary || !api.dragWindow) return;
      ignoreClick = false;
      press = { id: event.pointerId, x: event.screenX, y: event.screenY, dragged: false };
      button.setPointerCapture(event.pointerId);
      api.dragWindow('start');
    });
    button.addEventListener('pointermove', event => {
      if (!press || press.id !== event.pointerId) return;
      if (!press.dragged && Math.hypot(event.screenX - press.x, event.screenY - press.y) < 6) return;
      press.dragged = true;
      api.dragWindow?.('move');
    });
    const finishDrag = (event: PointerEvent) => {
      if (!press || press.id !== event.pointerId) return;
      ignoreClick = press.dragged;
      press = null;
      api.dragWindow?.('end');
    };
    button.addEventListener('pointerup', finishDrag);
    button.addEventListener('pointercancel', finishDrag);
    button.addEventListener('lostpointercapture', finishDrag);
    button.addEventListener('click', event => {
      if (ignoreClick && event.detail !== 0) {
        event.preventDefault();
        ignoreClick = false;
        return;
      }
      action();
    });
    controls.append(button);
    return button;
  };

  addButton('最小化', minimizeIcon, () => api.minimizeWindow());
  const maximize = addButton('最大化', maximizeIcon, () => api.maximizeWindow());
  addButton('关闭窗口', closeIcon, () => api.closeWindow()).classList.add('fg-window-close');

  const updateMaximized = (value: boolean) => setIcon(maximize, value ? '还原窗口' : '最大化', value ? restoreIcon : maximizeIcon);
  let receivedChange = false;
  api.onMaximizeChange(value => { receivedChange = true; updateMaximized(value); });
  void api.isMaximized().then(value => { if (!receivedChange) updateMaximized(value); }).catch(() => {});
  return controls;
}
