let emptyMarkIndex = 0;
const emptyCanvasNetworkMark = (patternId: string) => `<svg class="fg-canvas-empty-mark" viewBox="0 0 420 340" fill="none" aria-hidden="true" focusable="false">
  <defs>
    <pattern id="${patternId}" width="21" height="21" patternUnits="userSpaceOnUse">
      <circle cx=".9" cy=".9" r=".9" fill="currentColor" opacity=".19"/>
    </pattern>
  </defs>
  <path d="M28 30h364v280H28z" fill="url(#${patternId})"/>
  <path d="M28 53V30h23m318 0h23v23m0 234v23h-23m-318 0H28v-23" stroke="currentColor" opacity=".27"/>
  <path d="M28 178h364m-174-148v280" stroke="currentColor" opacity=".18" stroke-dasharray="2 6"/>
  <ellipse cx="215" cy="171" rx="151" ry="82" transform="rotate(-25 215 171)" stroke="currentColor" opacity=".15"/>
  <ellipse cx="214" cy="171" rx="133" ry="96" transform="rotate(28 214 171)" stroke="currentColor" opacity=".15"/>
  <path d="M87 133c35 8 96 4 131 45m0 0c35-25 31-82 70-101m-70 101c37 30 84 31 127 21m-127-21c-25 38-68 39-93 72m93-72c12 38 44 50 55 90M87 133l59-43m-.5 0 72.5 88m70-101 57 122m-220 51-38-117m258 66-72 69"
    stroke="currentColor" stroke-width="1.1" opacity=".42"/>
  <path d="M75 133h-20m233-68V49m69 150h16m-100 81v12m-127-216V62m-31 198-11 11" stroke="currentColor" opacity=".32"/>
  <g fill="var(--fg-surface)">
    <circle cx="87" cy="133" r="7" stroke="currentColor"/><circle cx="146" cy="90" r="5" stroke="currentColor"/>
    <circle cx="288" cy="77" r="8" stroke="currentColor"/><circle cx="345" cy="199" r="6" stroke="currentColor"/>
    <circle cx="125" cy="250" r="7" stroke="currentColor"/><circle cx="273" cy="268" r="5" stroke="currentColor"/>
  </g>
  <g fill="currentColor"><circle cx="87" cy="133" r="2.5"/><circle cx="288" cy="77" r="3"/>
  <circle cx="345" cy="199" r="2"/><circle cx="125" cy="250" r="2.5"/></g>
  <circle cx="218" cy="178" r="35" fill="currentColor" opacity=".08"/>
  <circle cx="218" cy="178" r="25" stroke="currentColor" opacity=".5"/>
  <circle cx="218" cy="178" r="16" fill="currentColor"/>
  <path d="M218 169v18m-9-9h18" stroke="var(--fg-accent-text, white)" stroke-width="1.4"/>
</svg>`;

/** A screen-space invitation that stays readable independently of canvas zoom. */
export function createCanvasEmptyState(parent: HTMLElement, onCreate: () => void, onWorkbench: () => void) {
  const surface = document.createElement('div');
  surface.className = 'fg-canvas-empty';
  surface.hidden = true;
  surface.innerHTML = `
    <div class="fg-canvas-empty-content">
      ${emptyCanvasNetworkMark(`ns-empty-paper-grid-${++emptyMarkIndex}`)}
      <h2 class="fg-canvas-empty-title">从一个想法开始</h2>
      <p class="fg-canvas-empty-description">写下一句话，让它成为网络的起点。</p>
      <div class="fg-canvas-empty-actions">
        <button class="fg-canvas-empty-create" type="button">记录第一个想法 <kbd>N</kbd></button>
        <button class="fg-canvas-empty-workbench" type="button" aria-haspopup="dialog">返回主界面</button>
      </div>
    </div>`;
  const title = surface.querySelector<HTMLElement>('.fg-canvas-empty-title')!;
  const description = surface.querySelector<HTMLElement>('.fg-canvas-empty-description')!;
  const button = surface.querySelector<HTMLButtonElement>('.fg-canvas-empty-create')!;
  button.addEventListener('click', onCreate);
  surface.querySelector<HTMLButtonElement>('.fg-canvas-empty-workbench')!.addEventListener('click', onWorkbench);
  parent.appendChild(surface);
  let lastReadOnly = false;
  return {
    update(visible: boolean, readOnly: boolean) {
      surface.hidden = !visible;
      if (readOnly === lastReadOnly) return;
      lastReadOnly = readOnly;
      title.textContent = readOnly ? '这里还没有内容' : '从一个想法开始';
      description.textContent = readOnly
        ? '这个视图暂时没有可显示的节点。'
        : '写下一句话，让它成为网络的起点。';
      button.hidden = readOnly;
    },
  };
}
