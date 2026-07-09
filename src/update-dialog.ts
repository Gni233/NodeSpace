/**
 * 更新对话框 - 玻璃风格弹窗
 */
import { UpdateInfo, getCurrentVersion } from './update-checker';
import { Z_MODAL } from './layout-constants';

const V = (name: string, fallback: string) => `var(${name},${fallback})`;

export function showUpdateDialog(info: UpdateInfo, onUpdate: () => void): void {
  const existing = document.querySelector('.fg-update-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'fg-update-overlay';
  overlay.style.cssText =
    `position:fixed;inset:0;z-index:${Z_MODAL};background:rgba(0,0,0,0.65);` +
    'display:flex;align-items:center;justify-content:center;' +
    'backdrop-filter:blur(var(--fg-glass-blur-sm,4px));' +
    'opacity:0;transition:opacity 0.2s ease;';

  const panel = document.createElement('div');
  panel.style.cssText =
    `background:${V('--fg-surface-elevated', 'rgba(40,42,48,0.92)')};` +
    `backdrop-filter:blur(var(--fg-glass-blur-lg,16px));-webkit-backdrop-filter:blur(var(--fg-glass-blur-lg,16px));` +
    `border:1px solid ${V('--fg-glass-border', 'rgba(255,255,255,0.1)')};` +
    `border-radius:${V('--fg-radius-lg', '14px')};padding:20px 24px;` +
    `min-width:360px;max-width:440px;color:${V('--fg-text', '#d0d0d0')};` +
    `box-shadow:${V('--fg-shadow-lg', '0 12px 48px rgba(0,0,0,0.5)')};` +
    'opacity:0;transform:scale(0.95);transition:opacity 0.2s ease,transform 0.2s ease;';

  // 标题
  const title = document.createElement('div');
  title.style.cssText =
    `font-size:${V('--fg-font-xl', '1.15em')};font-weight:bold;margin-bottom:12px;` +
    `color:${V('--fg-text', '#fff')};display:flex;align-items:center;gap:8px;`;
  title.innerHTML = '&#x1F389; 发现新版本';

  // 版本对比
  const verRow = document.createElement('div');
  verRow.style.cssText = `display:flex;align-items:center;gap:12px;margin-bottom:14px;font-size:${V('--fg-font-lg', '0.92em')};`;
  verRow.innerHTML = `
    <span style="background:${V('--fg-button-bg', 'rgba(255,255,255,0.08)')};padding:3px 10px;border-radius:${V('--fg-radius-sm', '6px')};">${getCurrentVersion()}</span>
    <span style="color:${V('--fg-text-muted', '#888')};">→</span>
    <span style="background:rgba(74,108,247,0.25);color:#8aafff;padding:3px 10px;border-radius:${V('--fg-radius-sm', '6px')};font-weight:bold;">${info.version}</span>
  `;

  // 更新内容
  const bodyWrap = document.createElement('div');
  bodyWrap.style.cssText =
    'max-height:160px;overflow-y:auto;margin-bottom:16px;font-size:' + V('--fg-font-sm', '0.8em') + ';line-height:1.5;' +
    `color:${V('--fg-text-muted', '#999')};white-space:pre-wrap;` +
    `border-left:2px solid ${V('--fg-border-light', 'rgba(255,255,255,0.08)')};padding-left:12px;`;
  bodyWrap.textContent = (info.body || '（无更新说明）').slice(0, 1000);

  // 按钮区
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';

  const laterBtn = document.createElement('button');
  laterBtn.textContent = '稍后';
  laterBtn.style.cssText =
    'padding:6px 18px;' +
    `border:1px solid ${V('--fg-border-light', 'rgba(255,255,255,0.15)')};` +
    `border-radius:${V('--fg-radius-md', '10px')};` +
    `background:transparent;color:${V('--fg-text-muted', '#aaa')};cursor:pointer;font-size:${V('--fg-font-md', '0.85em')};`;
  const closeAnimated = () => {
    overlay.style.opacity = '0';
    panel.style.opacity = '0';
    panel.style.transform = 'scale(0.95)';
    setTimeout(() => overlay.remove(), 200);
  };
  laterBtn.onclick = () => closeAnimated();

  const updateBtn = document.createElement('button');
  updateBtn.textContent = '立即更新';
  updateBtn.style.cssText =
    `padding:6px 18px;border:none;border-radius:${V('--fg-radius-md', '10px')};` +
    `background:${V('--fg-accent', '#4a6cf7')};color:${V('--fg-accent-text', '#fff')};cursor:pointer;font-size:${V('--fg-font-md', '0.85em')};font-weight:bold;`;
  updateBtn.onclick = () => { onUpdate(); closeAnimated(); };

  btnRow.appendChild(laterBtn);
  btnRow.appendChild(updateBtn);

  panel.appendChild(title);
  panel.appendChild(verRow);
  panel.appendChild(bodyWrap);
  panel.appendChild(btnRow);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => { overlay.style.opacity = '1'; panel.style.opacity = '1'; panel.style.transform = 'scale(1)'; });

  // 点击遮罩关闭
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeAnimated();
  });
}
