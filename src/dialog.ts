/**
 * NodeSpace 统一输入对话框。所有平台都使用同一套 DOM 界面，避免桌面端
 * 原生 prompt 与应用内部工作台在视觉和键盘行为上割裂。
 */

import {Z_MODAL, Z_MODAL_BACKDROP, V } from "./layout-constants";

export function safePrompt(msg: string, defaultValue?: string): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'fg-modal-backdrop';
    overlay.style.cssText =
      `position:fixed;inset:0;z-index:${Z_MODAL};` +
      'background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;' +
      'opacity:0;transition:opacity 0.2s ease;';
    const box = document.createElement('div');
    box.className = 'fg-modal fg-prompt-dialog';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.style.cssText =
      `background:${V('--fg-surface', '#2d2d2d')};padding:16px;` +
      `border-radius:${V('--fg-radius-lg', '14px')};min-width:260px;` +
      `color:${V('--fg-text', '#ccc')};` +
      `box-shadow:${V('--fg-shadow-lg', '0 8px 32px rgba(0,0,0,0.5)')};` +
      'opacity:0;transform:scale(0.95);transition:opacity 0.2s ease,transform 0.2s ease;';
    const label = document.createElement('div');
    label.className = 'fg-modal-title';
    label.textContent = msg;
    label.style.cssText = `margin-bottom:10px;font-size:${V('--fg-font-lg', '0.92em')};`;
    const input = document.createElement('input');
    input.className = 'fg-modal-input';
    input.setAttribute('aria-label', msg);
    input.value = defaultValue || '';
    input.style.cssText =
      `width:100%;padding:6px 8px;` +
      `border:1px solid ${V('--fg-input-border', '#555')};` +
      `border-radius:${V('--fg-radius-md', '10px')};` +
      `background:${V('--fg-input-bg', '#1e1e22')};` +
      `color:${V('--fg-input-text', '#ddd')};` +
      'margin-bottom:10px;box-sizing:border-box;';
    const btnRow = document.createElement('div');
    btnRow.className = 'fg-modal-actions';
    btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
    const okBtn = document.createElement('button');
    okBtn.className = 'fg-modal-button fg-modal-button-primary';
    okBtn.textContent = '确定';
    okBtn.style.cssText =
      `padding:4px 16px;border:none;` +
      `border-radius:${V('--fg-radius-md', '10px')};` +
      `background:${V('--fg-accent', '#4a6cf7')};` +
      `color:${V('--fg-accent-text', '#fff')};cursor:pointer;`;
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'fg-modal-button fg-modal-button-secondary';
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText =
      `padding:4px 16px;` +
      `border:1px solid ${V('--fg-border', '#555')};` +
      `border-radius:${V('--fg-radius-md', '10px')};` +
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
      document.removeEventListener('keydown', onKey);
      overlay.style.opacity = '0';
      box.style.opacity = '0';
      box.style.transform = 'scale(0.95)';
      setTimeout(() => { overlay.remove(); resolve(val); }, 200);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cleanup(null); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(null); });
    okBtn.onclick = () => { cleanup(input.value || null); };
    cancelBtn.onclick = () => { cleanup(null); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { cleanup(input.value || null); } });
    input.focus();
  });
}

/** textarea 版 safePrompt，用于多行文档内容输入 */
export function safeTextareaPrompt(msg: string, defaultValue?: string): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'fg-modal-backdrop';
    overlay.style.cssText =
      `position:fixed;inset:0;z-index:${Z_MODAL};` +
      'background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;' +
      'opacity:0;transition:opacity 0.2s ease;';
    const box = document.createElement('div');
    box.className = 'fg-modal fg-prompt-dialog fg-prompt-dialog-wide';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.style.cssText =
      `background:${V('--fg-surface', '#2d2d2d')};padding:16px;` +
      `border-radius:${V('--fg-radius-lg', '14px')};min-width:360px;max-width:600px;` +
      `color:${V('--fg-text', '#ccc')};` +
      `box-shadow:${V('--fg-shadow-lg', '0 8px 32px rgba(0,0,0,0.5)')};` +
      'opacity:0;transform:scale(0.95);transition:opacity 0.2s ease,transform 0.2s ease;';
    const label = document.createElement('div');
    label.className = 'fg-modal-title';
    label.textContent = msg;
    label.style.cssText = `margin-bottom:10px;font-size:${V('--fg-font-lg', '0.92em')};`;
    const textarea = document.createElement('textarea');
    textarea.className = 'fg-modal-input fg-modal-textarea';
    textarea.setAttribute('aria-label', msg);
    textarea.value = defaultValue || '';
    textarea.rows = 8;
    textarea.style.cssText =
      `width:100%;padding:6px 8px;resize:vertical;` +
      `border:1px solid ${V('--fg-input-border', '#555')};` +
      `border-radius:${V('--fg-radius-md', '10px')};` +
      `background:${V('--fg-input-bg', '#1e1e22')};` +
      `color:${V('--fg-input-text', '#ddd')};` +
      `font-family:monospace;font-size:${V('--fg-font-md', '0.85em')};` +
      'margin-bottom:10px;box-sizing:border-box;';
    const btnRow = document.createElement('div');
    btnRow.className = 'fg-modal-actions';
    btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
    const okBtn = document.createElement('button');
    okBtn.className = 'fg-modal-button fg-modal-button-primary';
    okBtn.textContent = '确定';
    okBtn.style.cssText =
      `padding:4px 16px;border:none;` +
      `border-radius:${V('--fg-radius-md', '10px')};` +
      `background:${V('--fg-accent', '#4a6cf7')};` +
      `color:${V('--fg-accent-text', '#fff')};cursor:pointer;`;
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'fg-modal-button fg-modal-button-secondary';
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText =
      `padding:4px 16px;` +
      `border:1px solid ${V('--fg-border', '#555')};` +
      `border-radius:${V('--fg-radius-md', '10px')};` +
      `background:transparent;color:${V('--fg-text', '#ccc')};cursor:pointer;`;
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(okBtn);
    box.appendChild(label);
    box.appendChild(textarea);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => { overlay.style.opacity = '1'; box.style.opacity = '1'; box.style.transform = 'scale(1)'; });
    const cleanup = (val: string | null) => {
      document.removeEventListener('keydown', onKey);
      overlay.style.opacity = '0';
      box.style.opacity = '0';
      box.style.transform = 'scale(0.95)';
      setTimeout(() => { overlay.remove(); resolve(val); }, 200);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cleanup(null); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(null); });
    okBtn.onclick = () => { cleanup(textarea.value || null); };
    cancelBtn.onclick = () => { cleanup(null); };
    textarea.focus();
  });
}
