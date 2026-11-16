import './workbench-gallery.css';
import type { WorkbenchCover } from './workbench-cover';
import { bindContextMenuTrigger } from './context-menu-trigger';
import type { WorkbenchSpace, WorkbenchSpaceMenu } from './workbench-home';

export interface WorkbenchCoverAnchor {
  rect: DOMRectReadOnly;
  artwork: HTMLElement;
  cover?: WorkbenchCover;
}

export interface WorkbenchCoverPalette {
  background: string;
  ink: string;
  accent: string;
  edge: string;
  levels: readonly string[];
}

export type WorkbenchGalleryEntry = WorkbenchSpace & { back?: true };

const PREVIEW_LIMIT = 28;
const PREVIEW_GUTTER = 160;
const RECENT_LOCATION_LIMIT = 3;
const RECENT_CARD_BUDGET = 1600;
const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12h14m-5-5 5 5-5 5"/></svg>';
const emptyMark = '<svg viewBox="0 0 100 100" class="ns-home-cover-mark" focusable="false"><circle cx="50" cy="50" r="6" fill="currentColor"/><circle cx="50" cy="50" r="15" fill="none" stroke="currentColor" opacity=".25"/></svg>';
const locationMarks = {
  library: 'M10 12h5v28h-5zM16 16h6v24h-6zM24 10l6-1 5 30-6 1zM8 41h31',
  folder: 'M9 17v-4a3 3 0 0 1 3-3h9l5 5h11a3 3 0 0 1 3 3v17a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3V17h31',
  resource: 'M16 9h11l8 8v22H16a3 3 0 0 1-3-3V12a3 3 0 0 1 3-3zM27 9v9h8M19 24h10m-10 5h10',
  back: 'M34 24H14m7-7-7 7 7 7',
};

interface CardView {
  item: HTMLElement;
  button: HTMLButtonElement;
  title: HTMLElement;
  badge: HTMLElement;
  visual: HTMLElement;
  detail: HTMLElement;
}

interface Card {
  space: WorkbenchGalleryEntry;
  index: number;
  cover?: WorkbenchCover;
  palette?: WorkbenchCoverPalette;
  view?: CardView;
}

function createGalleryPage(rows = 3) {
  const list = document.createElement('div');
  list.className = 'ns-home-exhibits';
  list.setAttribute('role', 'list');
  return { list, cards: new Map<string, Card>(), painted: new Set<Card>(), order: [] as Card[], currentId: undefined as string | undefined, rows };
}

export function createWorkbenchGallery(
  open: (space: WorkbenchGalleryEntry, anchor?: WorkbenchCoverAnchor) => void,
  onVisibleSpaces: (spaces: readonly WorkbenchSpace[]) => void,
  showSpaceMenu: WorkbenchSpaceMenu,
) {
  const element = document.createElement('section');
  element.className = 'ns-gallery';
  element.tabIndex = 0;
  element.setAttribute('aria-label', '浏览空间');
  element.innerHTML = '<div class="ns-gallery-viewport" tabindex="-1" hidden>' +
    '<div class="ns-gallery-track"></div></div>' +
    '<p class="ns-gallery-empty"><span class="ns-gallery-empty-pointer">右键新建空间或记录想法</span>' +
    '<span class="ns-gallery-empty-touch">长按空白处新建空间或记录想法</span></p>';

  const viewport = element.querySelector<HTMLDivElement>('.ns-gallery-viewport')!;
  const track = element.querySelector<HTMLDivElement>('.ns-gallery-track')!;
  const empty = element.querySelector<HTMLElement>('.ns-gallery-empty')!;
  let page = createGalleryPage();
  track.append(page.list);
  const recentPages = new Map<string | undefined, ReturnType<typeof createGalleryPage>>();
  const columnCards = new WeakMap<HTMLElement, Card[]>();
  const scrollPositions = new Map<string | undefined, number>();
  let location: string | undefined;
  let position = 0;
  let visibleKey = '';
  let frame = 0;

  function renderBadge(card: Card, view: CardView): void {
    view.badge.hidden = Boolean(card.space.back);
    view.badge.textContent = String(card.index + 1).padStart(2, '0');
    if (card.space.id === page.currentId) view.button.setAttribute('aria-current', 'true');
    else view.button.removeAttribute('aria-current');
  }

  function renderCard(card: Card, view: CardView): void {
    const { space, cover, palette } = card;
    view.button.dataset.entryKind = space.back ? 'back' : space.kind || 'space';
    view.title.textContent = space.title;
    view.title.title = space.title;
    renderBadge(card, view);
    const count = cover ? cover.nodeCount ? `${cover.nodeCount.toLocaleString()} 节点` : '空白画布' : '';
    const detail = [count, space.detail].filter(Boolean).join(' · ');
    view.detail.textContent = detail;
    view.detail.hidden = !detail;
    if (palette) {
      view.button.style.setProperty('--ns-cover-surface', palette.background);
      view.button.style.setProperty('--ns-cover-ink', palette.ink);
      view.button.style.setProperty('--ns-cover-accent', palette.accent);
      view.button.style.setProperty('--ns-cover-edge', palette.edge);
      palette.levels.forEach((color, index) => view.button.style.setProperty(`--ns-wall-h${index + 1}`, color));
    }
  }

  function paintCover(card: Card, view: CardView): void {
    const { cover, space } = card;
    if (!cover?.points.length) {
      const mark = space.back ? locationMarks.back : space.kind && locationMarks[space.kind];
      view.visual.innerHTML = mark
        ? `<svg viewBox="0 0 48 48" class="ns-home-location-mark" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="${mark}"/></svg>`
        : emptyMark;
      return;
    }
    const links = cover.links.map(({ x1, y1, x2, y2 }) => `M${x1 * 100} ${y1 * 100}L${x2 * 100} ${y2 * 100}`).join(' ');
    const points = cover.points.map(({ x, y, level }) =>
      `<circle cx="${x * 100}" cy="${y * 100}" r="${level <= 2 ? 2.35 : 1.5}" fill="var(--ns-wall-h${level},currentColor)"/>`).join('');
    view.visual.innerHTML = `<svg class="ns-home-cover-map" viewBox="0 0 100 100" focusable="false"><path d="${links}" fill="none"/><g>${points}</g></svg>`;
  }

  function createCard(card: Card): HTMLElement {
    const item = document.createElement('div');
    item.className = 'ns-home-exhibit';
    item.setAttribute('role', 'listitem');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.spaceId = card.space.id;
    button.innerHTML = '<div class="ns-home-cover"><div class="ns-home-cover-visual" aria-hidden="true"></div>' +
      '<span class="ns-home-cover-badge" aria-hidden="true"></span></div><div class="ns-home-plaque">' +
      '<div><span class="ns-home-space-title"></span><small class="ns-home-space-detail" hidden></small></div>' + arrow + '</div>';
    const view = {
      item,
      button,
      title: button.querySelector<HTMLElement>('.ns-home-space-title')!,
      badge: button.querySelector<HTMLElement>('.ns-home-cover-badge')!,
      visual: button.querySelector<HTMLElement>('.ns-home-cover-visual')!,
      detail: button.querySelector<HTMLElement>('.ns-home-space-detail')!,
    };
    card.view = view;
    renderCard(card, view);
    const activate = () => open(card.space, {
      rect: view.visual.getBoundingClientRect(),
      artwork: view.visual,
      cover: card.cover,
    });
    button.addEventListener('click', activate);
    bindContextMenuTrigger(button, (x, y) => showSpaceMenu(x, y, button, card.space, activate), { touch: true });
    item.append(button);
    return item;
  }

  function render(): void {
    const { list, order, rows } = page;
    let index = 0;
    for (let offset = 0; offset < order.length; index++) {
      const group = order.slice(offset, offset + rows);
      const existing = list.children.item(index) as HTMLElement | null;
      const column = existing ?? document.createElement('div');
      if (!existing) {
        column.className = 'ns-gallery-column';
        column.setAttribute('role', 'presentation');
        list.append(column);
      }
      const largerRow = index % rows;
      const tracks = Array.from({ length: rows }, (_, row) => row === largerRow ? 'minmax(0, 1.45fr)' : 'minmax(0, 1fr)');
      column.style.setProperty('--ns-gallery-row-tracks', tracks.join(' '));
      columnCards.set(column, group);
      group.forEach((card, cell) => {
        const item = card.view?.item ?? createCard(card);
        const replaced = column.children.item(cell);
        if (replaced !== item) column.insertBefore(item, replaced);
      });
      while (column.childElementCount > group.length) column.lastElementChild!.remove();
      offset += group.length;
    }
    while (list.childElementCount > index) list.lastElementChild!.remove();
    empty.hidden = order.length > 0;
    viewport.hidden = order.length === 0;
  }

  function rememberPosition(): void {
    if (viewport.clientWidth) position = viewport.scrollLeft;
  }

  function firstColumnAfter(x: number): number {
    const columns = page.list.children;
    let low = 0;
    let high = columns.length;
    while (low < high) {
      const index = (low + high) >>> 1;
      if (columns[index].getBoundingClientRect().right <= x) low = index + 1;
      else high = index;
    }
    return low;
  }

  function syncDensity(): void {
    const { clientWidth: width, clientHeight: height } = viewport;
    if (!width || !height) return;
    let nextRows = 3;
    if (height < 510 || width < 540 && height < 670) nextRows = 2;
    else if (width >= 1000 && height >= 705) nextRows = 4;
    if (nextRows === page.rows) return;

    const { list } = page;
    const left = viewport.getBoundingClientRect().left;
    const first = list.children.item(firstColumnAfter(left)) as HTMLElement | null;
    const anchor = position > 0 && first ? columnCards.get(first)?.[0]?.view?.item : undefined;
    const offset = anchor ? anchor.getBoundingClientRect().left - left : 0;
    const focused = document.activeElement;
    const restoreFocus = focused instanceof HTMLElement && list.contains(focused);
    page.rows = nextRows;
    render();
    if (anchor) viewport.scrollLeft += anchor.getBoundingClientRect().left - left - offset;
    if (restoreFocus && focused.isConnected) focused.focus({ preventScroll: true });
    rememberPosition();
  }

  function refreshPreviews(force = false): void {
    const frameRect = viewport.getBoundingClientRect();
    if (frameRect.width === 0) return;
    const left = frameRect.left - PREVIEW_GUTTER;
    const right = frameRect.right + PREVIEW_GUTTER;
    const middle = (frameRect.left + frameRect.right) / 2;
    const candidates: { card: Card; distance: number }[] = [];
    const { list, painted } = page;
    const columns = list.children;
    for (let index = firstColumnAfter(left); index < columns.length; index++) {
      const column = columns[index] as HTMLElement;
      const rect = column.getBoundingClientRect();
      if (rect.left > right) break;
      const distance = Math.abs((rect.left + rect.right) / 2 - middle);
      for (const card of columnCards.get(column) ?? []) candidates.push({ card, distance });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    const near = candidates.slice(0, PREVIEW_LIMIT).map(({ card }) => card);
    const nearSet = new Set(near);
    for (const card of painted) {
      if (nearSet.has(card)) continue;
      card.view?.visual.replaceChildren();
      painted.delete(card);
    }
    for (const card of near) {
      if (painted.has(card) || !card.view) continue;
      paintCover(card, card.view);
      painted.add(card);
    }
    const visible = near.map(card => card.space).filter(space => !space.back && space.kind !== 'library' && space.kind !== 'folder');
    const key = JSON.stringify(visible.map(space => space.id).sort());
    if (force || key !== visibleKey) {
      visibleKey = key;
      onVisibleSpaces(visible);
    }
  }

  function queueRefresh(): void {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      syncDensity();
      refreshPreviews();
    });
  }

  viewport.addEventListener('scroll', () => {
    rememberPosition();
    queueRefresh();
  }, { passive: true });
  new ResizeObserver(queueRefresh).observe(viewport);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let glide = 0;
  function stopGlide(): void {
    if (glide) cancelAnimationFrame(glide);
    glide = 0;
  }
  function glideFrom(velocity: number): void {
    if (reducedMotion.matches || Math.abs(velocity) < .1) return;
    let lastFrame = performance.now();
    const move = (time: number) => {
      glide = 0;
      if (!viewport.clientWidth || reducedMotion.matches) return;
      const duration = Math.min(32, time - lastFrame);
      lastFrame = time;
      const end = viewport.scrollWidth - viewport.clientWidth;
      viewport.scrollLeft = Math.min(end, Math.max(0, viewport.scrollLeft + velocity * duration));
      rememberPosition();
      velocity *= Math.exp(-duration / 135);
      if (viewport.scrollLeft > 0 && viewport.scrollLeft < end && Math.abs(velocity) >= .045) {
        glide = requestAnimationFrame(move);
      }
    };
    glide = requestAnimationFrame(move);
  }
  viewport.addEventListener('wheel', event => {
    stopGlide();
    if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY) || viewport.scrollWidth <= viewport.clientWidth) return;
    event.preventDefault();
    const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? viewport.clientWidth : event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 17 : 1;
    viewport.scrollLeft += event.deltaY * multiplier;
  }, { passive: false });

  let drag: { id: number; x: number; moved: boolean; time: number; velocity: number } | null = null;
  let suppressClick = false;
  viewport.addEventListener('pointerdown', event => {
    stopGlide();
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    suppressClick = false;
    if (viewport.scrollWidth > viewport.clientWidth) {
      drag = { id: event.pointerId, x: event.clientX, moved: false, time: performance.now(), velocity: 0 };
    }
  });
  viewport.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    const delta = event.clientX - drag.x;
    if (!drag.moved) {
      if (Math.abs(delta) < 6) return;
      drag.moved = true;
      viewport.setPointerCapture(event.pointerId);
      viewport.focus({ preventScroll: true });
      viewport.classList.add('is-dragging');
    }
    const now = performance.now();
    const speed = -(delta / Math.max(8, now - drag.time));
    drag.velocity = Math.max(-2.4, Math.min(2.4, drag.velocity * .35 + speed * .65));
    drag.time = now;
    drag.x = event.clientX;
    viewport.scrollLeft -= delta;
    rememberPosition();
  });
  function finishDrag(event: PointerEvent): void {
    if (!drag || drag.id !== event.pointerId) return;
    suppressClick = drag.moved;
    if (event.type === 'pointerup' && drag.moved && performance.now() - drag.time < 75) glideFrom(drag.velocity);
    drag = null;
    viewport.classList.remove('is-dragging');
  }
  viewport.addEventListener('pointerup', finishDrag);
  viewport.addEventListener('pointercancel', finishDrag);
  viewport.addEventListener('lostpointercapture', finishDrag);
  viewport.addEventListener('pointerleave', () => { if (drag && !drag.moved) drag = null; });
  viewport.addEventListener('click', event => {
    if (!suppressClick || event.detail === 0) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  element.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || viewport.scrollWidth <= viewport.clientWidth) return;
    const behavior = reducedMotion.matches ? 'instant' : 'smooth';
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      stopGlide();
      event.preventDefault();
      viewport.focus({ preventScroll: true });
      viewport.scrollBy({ left: viewport.clientWidth * (event.key === 'ArrowLeft' ? -.55 : .55), behavior });
    } else if (event.key === 'Home' || event.key === 'End') {
      stopGlide();
      event.preventDefault();
      viewport.focus({ preventScroll: true });
      viewport.scrollTo({ left: event.key === 'Home' ? 0 : viewport.scrollWidth - viewport.clientWidth, behavior });
    }
  });

  return {
    element,
    update(nextSpaces: readonly WorkbenchGalleryEntry[], nextCurrent?: string, nextLocation?: string) {
      const locationChanged = nextLocation !== location;
      if (locationChanged) {
        rememberPosition();
        scrollPositions.set(location, position);
        stopGlide();
        if (drag) {
          const { id } = drag;
          drag = null;
          if (viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
          viewport.classList.remove('is-dragging');
        }
        suppressClick = false;
        if (frame) { cancelAnimationFrame(frame); frame = 0; }
        const nextPage = recentPages.get(nextLocation) ?? createGalleryPage(page.rows);
        recentPages.delete(nextLocation);
        recentPages.set(location, page);
        let storedCards = 0;
        for (const stored of recentPages.values()) storedCards += stored.cards.size;
        for (const [key, stored] of recentPages) {
          if (recentPages.size <= RECENT_LOCATION_LIMIT && (storedCards <= RECENT_CARD_BUDGET || recentPages.size === 1)) break;
          storedCards -= stored.cards.size;
          recentPages.delete(key);
        }
        page = nextPage;
        track.replaceChildren(page.list);
        location = nextLocation;
        position = scrollPositions.get(location) ?? 0;
        visibleKey = '';
      }
      const seen = new Set<string>();
      const next = nextSpaces.filter(space => {
        if (seen.has(space.id)) return false;
        seen.add(space.id);
        return true;
      });
      const { cards, painted } = page;
      const orderChanged = next.length !== page.order.length || next.some((space, index) => page.order[index].space.id !== space.id);
      const previousCurrent = page.currentId;
      page.currentId = nextCurrent;
      const metadataChanged = new Set<Card>();
      const firstIndex = next[0]?.back ? -1 : 0;
      const updated = next.map((space, row) => {
        const index = firstIndex + row;
        const old = cards.get(space.id);
        if (!old) {
          const card = { space, index };
          cards.set(space.id, card);
          return card;
        }
        if (old.index !== index || old.space.title !== space.title || old.space.detail !== space.detail
          || old.space.kind !== space.kind || old.space.back !== space.back) {
          metadataChanged.add(old);
        }
        old.space = space;
        old.index = index;
        return old;
      });
      page.order = updated;
      if (orderChanged) {
        for (const [id, card] of cards) {
          if (seen.has(id)) continue;
          painted.delete(card);
          cards.delete(id);
        }
        visibleKey = '';
        render();
      } else if (locationChanged) {
        empty.hidden = updated.length > 0;
        viewport.hidden = updated.length === 0;
      }
      for (const card of metadataChanged) if (card.view) {
        renderCard(card, card.view);
        if (painted.has(card)) paintCover(card, card.view);
      }
      if (previousCurrent !== nextCurrent) {
        for (const id of [previousCurrent, nextCurrent]) {
          const card = id === undefined ? undefined : cards.get(id);
          if (card?.view && !metadataChanged.has(card)) renderBadge(card, card.view);
        }
      }
      return locationChanged || orderChanged || metadataChanged.size > 0;
    },
    focusCard(id?: string): boolean {
      const button = id === undefined ? undefined : page.cards.get(id)?.view?.button;
      button?.focus({ preventScroll: true });
      return Boolean(button);
    },
    refreshCovers() {
      if (viewport.clientWidth) {
        viewport.scrollLeft = position;
        rememberPosition();
        syncDensity();
        refreshPreviews(true);
      } else if (!page.order.length) onVisibleSpaces([]);
    },
    setCover(id: string, cover: WorkbenchCover, palette: WorkbenchCoverPalette) {
      const card = page.cards.get(id);
      if (!card || (card.cover === cover && card.palette === palette)) return;
      card.cover = cover;
      card.palette = palette;
      if (card.view) {
        if (page.painted.has(card)) paintCover(card, card.view);
        renderCard(card, card.view);
      }
    },
  };
}
