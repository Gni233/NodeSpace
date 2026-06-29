/**
 * Android WebView 不支持 window.prompt，用 DOM 弹窗兜底
 * 在 Capacitor/WebView 环境会自动使用自定义弹窗，桌面端仍然用原生 prompt
 */

import { Z_MODAL, Z_MODAL_BACKDROP } from './layout-constants';

const V = (name: string, fallback: string) => `var(${name},${fallback})`;

export function safePrompt(msg: string, defaultValue?: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      if (typeof prompt !== 'undefined') {
        const r = prompt(msg, defaultValue || '');
        resolve(r);
        return;
      }
    } catch {}

    const overlay = document.createElement('div');
    overlay.style.cssText =
      `position:fixed;inset:0;z-index:${Z_MODAL};` +
      'background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;' +
      'opacity:0;transition:opacity 0.2s ease;';
    const box = document.createElement('div');
    box.style.cssText =
      `background:${V('--fg-surface', '#2d2d2d')};padding:16px;` +
      `border-radius:${V('--fg-radius-lg', '10px')};min-width:260px;` +
      `color:${V('--fg-text', '#ccc')};` +
      `box-shadow:${V('--fg-shadow-lg', '0 8px 32px rgba(0,0,0,0.5)')};` +
      'opacity:0;transform:scale(0.95);transition:opacity 0.2s ease,transform 0.2s ease;';
    const label = document.createElement('div');
    label.textContent = msg;
    label.style.cssText = `margin-bottom:10px;font-size:${V('--fg-font-lg', '0.92em')};`;
    const input = document.createElement('input');
    input.value = defaultValue || '';
    input.style.cssText =
      `width:100%;padding:6px 8px;` +
      `border:1px solid ${V('--fg-input-border', '#555')};` +
      `border-radius:${V('--fg-radius-md', '6px')};` +
      `background:${V('--fg-input-bg', '#1e1e22')};` +
      `color:${V('--fg-input-text', '#ddd')};` +
      'margin-bottom:10px;box-sizing:border-box;';
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
    const okBtn = document.createElement('button');
    okBtn.textContent = '确定';
    okBtn.style.cssText =
      `padding:4px 16px;border:none;` +
      `border-radius:${V('--fg-radius-md', '6px')};` +
      `background:${V('--fg-accent', '#4a6cf7')};` +
      `color:${V('--fg-accent-text', '#fff')};cursor:pointer;`;
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText =
      `padding:4px 16px;` +
      `border:1px solid ${V('--fg-border', '#555')};` +
      `border-radius:${V('--fg-radius-md', '6px')};` +
      `background:transparent;color:${V('--fg-text', '#ccc')};cursor:pointer;`;
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(okBtn);
    box.appendChild(label);
    box.appendChild(input);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => { overlay.style.opacity = '1'; box.style.opacity = '1'; box.style.transform = 'scale(1)'; });
    const cleanup = (val: string | null) => {
      overlay.style.opacity = '0';
      box.style.opacity = '0';
      box.style.transform = 'scale(0.95)';
      setTimeout(() => { overlay.remove(); resolve(val); }, 200);
    };
    okBtn.onclick = () => { cleanup(input.value || null); };
    cancelBtn.onclick = () => { cleanup(null); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { cleanup(input.value || null); } });
    input.focus();
  });
}
