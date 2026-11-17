import { backUrl, cardNames, faceUrl, getSpread, getTheme, type Point, type SpreadId, type ThemeId } from '../domain/catalog';
import { changeSpread, drawCard, editCard, newReading, shuffleRemaining, type Reading } from '../domain/reading';
import { fitViewport, toWorld, zoomAt, type Viewport } from './geometry';
import { loadReading, saveReading } from '../storage/session';
import { buildReadingPrompt } from '../domain/prompt';

const element = <T extends HTMLElement = HTMLElement>(id: string) => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: ${id}`);
  return node as T;
};
const button = (id: string) => element<HTMLButtonElement>(id);
const dialog = (id: string) => element<HTMLDialogElement>(id);

export async function startTable() {
  const table = element('table');
  const world = element('world');
  const placed = element('placed-cards');
  const slots = element('slots');
  const pile = element('deck-pile');
  let reading: Reading;
  let ready = false;
  let busy = false;
  let persistent = true;
  let selectedId: string | null = null;
  let targetSlot: string | null = null;
  let pending = false;
  let moving = false;
  let snap = false;
  let animations = true;
  let nextReversals = true;
  let history: Reading[] = [];
  let viewport: Viewport = { scale: 1, x: 0, y: 0, fit: true };
  let screenshotMode = false;
  let savedView: { viewport: Viewport; width: number; height: number } | null = null;
  let pendingSpread: SpreadId = 'timeline';
  let viewerId: string | null = null;
  let toastTimer: ReturnType<typeof setTimeout>;
  let saveQueue = Promise.resolve();
  const lockKey = 'arcana-editor-v1';
  const owner = globalThis.crypto?.randomUUID?.() ?? `tab-${Date.now()}-${performance.now()}`;
  let readonly = false;
  let locking = true;
  let disposed = false;

  const notify = (message: string, duration = 3000) => {
    clearTimeout(toastTimer);
    element('toast').textContent = message;
    element('toast').hidden = false;
    toastTimer = setTimeout(() => { element('toast').hidden = true; }, duration);
  };
  const closeMenus = () => document.querySelectorAll<HTMLElement>('[popover]:popover-open').forEach(menu => menu.hidePopover());
  const open = (id: string) => {
    closeMenus();
    cancelGesture();
    pending = false;
    moving = false;
    renderState();
    dialog(id).showModal();
  };
  const close = (id: string) => dialog(id).close();
  const localPoint = (x: number, y: number): Point => {
    const rect = table.getBoundingClientRect();
    return { x: x - rect.left, y: y - rect.top };
  };
  const worldPoint = (x: number, y: number) => {
    const point = toWorld(localPoint(x, y), viewport);
    return snap ? { x: Math.round(point.x / 20) * 20, y: Math.round(point.y / 20) * 20 } : point;
  };
  function updateView() {
    world.style.transform = `translate(${viewport.x}px,${viewport.y}px) scale(${viewport.scale})`;
    element('zoom-value').textContent = `${Math.round(viewport.scale * 100)}%`;
  }
  function fit() {
    if (!ready) return;
    viewport = fitViewport(
      screenshotMode ? reading.placed : [...getSpread(reading.spread).slots, ...reading.placed],
      table.clientWidth, table.clientHeight, screenshotMode ? Infinity : 1.55,
    );
    updateView();
  }
  function setZoom(factor: number) {
    viewport = zoomAt(viewport, factor, { x: table.clientWidth / 2, y: table.clientHeight / 2 });
    updateView();
  }

  function getLock(): { owner: string; time: number } | null {
    try {
      const value = JSON.parse(localStorage.getItem(lockKey) || 'null');
      return value && typeof value.owner === 'string' && typeof value.time === 'number' ? value : null;
    } catch { locking = false; return null; }
  }
  function claimLock() {
    try { localStorage.setItem(lockKey, JSON.stringify({ owner, time: Date.now() })); } catch { locking = false; }
    readonly = false;
    element('tab-notice').hidden = true;
  }
  function refreshLock() {
    if (!locking) return;
    const lock = getLock();
    if (lock && lock.owner !== owner && Date.now() - lock.time < 15000) {
      readonly = true;
    } else if (!readonly) claimLock();
    element('tab-notice').hidden = !readonly;
    renderState();
  }
  function canEdit() {
    if (!ready || busy) return false;
    if (locking) {
      const lock = getLock();
      if (lock && lock.owner !== owner) readonly = true;
    }
    if (readonly) { notify('另一個分頁正在編輯，請先按「在這裡接續」。'); return false; }
    return true;
  }
  function persist() {
    if (!persistent || readonly) return;
    const snapshot = structuredClone(reading);
    element('save-status').textContent = '正在保存';
    saveQueue = saveQueue.then(async () => {
      if (locking && getLock()?.owner !== owner) return;
      await saveReading(snapshot);
      if (!readonly) element('save-status').textContent = '已自動保存於此裝置';
    }).catch(() => {
      persistent = false;
      element('save-status').textContent = '僅此分頁可用';
      notify('無法保存，這局仍可繼續操作；請保持分頁開啟。', 6000);
    });
  }
  function commit(next: Reading, record = true) {
    if (!canEdit() || next === reading) return;
    if (record) { history.push(structuredClone(reading)); if (history.length > 40) history.shift(); }
    reading = next;
    pending = false;
    moving = false;
    render();
    persist();
  }
  function renderState() {
    if (!ready) return;
    const current = reading.placed.find(card => card.id === selectedId);
    const full = reading.spread !== 'free' && getSpread(reading.spread).slots.every(slot => reading.placed.some(card => card.slotId === slot.id));
    const noDraw = busy || readonly || reading.remaining.length === 0 || full;
    button('copy-prompt').disabled = busy;
    button('fullscreen').disabled = busy;
    button('deck-pile').disabled = noDraw;
    button('shuffle').disabled = busy || readonly || reading.remaining.length < 2;
    button('undo').disabled = busy || readonly || !history.length;
    button('undo').classList.toggle('is-unavailable', !history.length);
    button('reset').disabled = busy || readonly;
    element('draw-label').textContent = pending || moving ? '選擇位置' : full ? '已放滿' : reading.remaining.length === 0 ? '已抽完' : '抽牌';
    element('remaining-count').textContent = String(reading.remaining.length);
    pile.setAttribute('aria-label', `從牌堆抽一張牌，剩餘 ${reading.remaining.length} 張`);
    element('card-context').hidden = !current;
    if (current) {
      element('selected-name').textContent = current.revealed ? `${cardNames.get(current.id)} · ${current.reversed ? '逆位' : '正位'}` : `第 ${reading.placed.indexOf(current) + 1} 張 · 未揭牌`;
      button('flip-card').querySelector('span')!.textContent = current.revealed ? '蓋牌' : '揭牌';
      for (const id of ['flip-card', 'move-card', 'rotate-card', 'raise-card']) button(id).disabled = readonly || busy;
    }
    table.classList.toggle('is-placing', pending || moving);
    element('placement-cursor').hidden = !pending;
    element('reversal-note').textContent = reading.placed.length ? '下一局生效' : '每張牌各有 50% 機會逆位';
    element('save-status-details').textContent = persistent ? '牌桌自動保存在此瀏覽器' : '僅此分頁可用';
  }
  function render() {
    const active = document.activeElement as HTMLElement | null;
    const focusCard = active?.dataset.cardId;
    const focusSlot = active?.dataset.slotId;
    element('spread-name').textContent = getSpread(reading.spread).name;
    element<HTMLImageElement>('theme-mini').src = backUrl(reading.theme);
    button('spread-picker').title = `${getSpread(reading.spread).name} · ${getTheme(reading.theme).name}`;
    document.querySelectorAll<HTMLImageElement>('.stack-card').forEach(img => { img.src = backUrl(reading.theme); });
    document.querySelectorAll<HTMLElement>('[data-spread]').forEach(node => node.classList.toggle('is-active', node.dataset.spread === reading.spread));
    document.querySelectorAll<HTMLElement>('[data-theme]').forEach(node => node.classList.toggle('is-active', node.dataset.theme === reading.theme));
    slots.replaceChildren();
    for (const slot of getSpread(reading.spread).slots) {
      if (reading.placed.some(card => card.slotId === slot.id)) continue;
      const node = document.createElement('button');
      node.className = `slot${targetSlot === slot.id ? ' is-target' : ''}`;
      node.dataset.slotId = slot.id;
      node.title = [slot.label, slot.description].filter(Boolean).join('：');
      node.setAttribute('aria-label', `牌位 ${slot.id}，${slot.label}，選擇放牌位置`);
      node.style.transform = `translate(${slot.x}px,${slot.y}px) rotate(${slot.angle}deg)`;
      node.style.zIndex = slot.id;
      for (const [name, text] of [['slot-corner',''],['slot-index',slot.id.padStart(2, '0')],['slot-label',slot.label]]) {
        const span = document.createElement('span'); span.className = name!; span.textContent = text!; node.append(span);
      }
      slots.append(node);
    }
    placed.replaceChildren();
    for (const [index, card] of reading.placed.entries()) {
      const node = document.createElement('button');
      node.className = `placed-card${card.id === selectedId ? ' is-selected' : ''}`;
      node.dataset.cardId = card.id;
      const slot = getSpread(reading.spread).slots.find(slot => slot.id === card.slotId);
      if (slot) node.title = [`${slot.id} ${slot.label}`, slot.description].filter(Boolean).join('：');
      node.setAttribute('aria-label', card.revealed ? `${cardNames.get(card.id)}，${card.reversed ? '逆位' : '正位'}，第 ${index + 1} 張` : `第 ${index + 1} 張，未揭牌`);
      node.setAttribute('aria-pressed', String(card.id === selectedId));
      node.style.transform = `translate(${card.x}px,${card.y}px) rotate(${card.angle}deg)`;
      // Cards always sit above empty slots, including Celtic cross slot #2.
      node.style.zIndex = String(card.z + 20);
      const img = document.createElement('img');
      img.src = card.revealed ? faceUrl(reading.theme, card.id) : backUrl(reading.theme);
      img.alt = '';
      img.draggable = false;
      if (card.revealed && card.reversed) img.style.transform = 'rotate(180deg)';
      img.addEventListener('error', () => {
        img.hidden = true;
        const error = document.createElement('span');
        error.className = 'card-image-error';
        error.textContent = `${card.revealed ? cardNames.get(card.id) : '牌背'}・圖片無法載入，請選取後查看並重試`;
        node.append(error);
      }, { once: true });
      node.append(img);
      if (card.revealed) {
        const direction = document.createElement('span'); direction.className = 'card-direction'; direction.textContent = card.reversed ? '逆位' : '正位'; node.append(direction);
      }
      placed.append(node);
    }
    if (!reading.placed.some(card => card.id === selectedId)) selectedId = null;
    renderState();
    if (focusCard) placed.querySelector<HTMLElement>(`[data-card-id="${focusCard}"]`)?.focus({ preventScroll: true });
    else if (focusSlot) slots.querySelector<HTMLElement>(`[data-slot-id="${focusSlot}"]`)?.focus({ preventScroll: true });
    if (viewport.fit) fit();
  }
  function selectCard(id: string) {
    selectedId = id; targetSlot = null; moving = false; pending = false;
    render();
  }
  function doDraw(point?: Point, slot?: string) {
    if (!canEdit()) return;
    if (reading.spread === 'free' && !point) {
      pending = !pending; moving = false; renderState();
      element('placement-cursor').hidden = true;
      return;
    }
    const next = drawCard(reading, reading.spread === 'free' ? point : slot || targetSlot || undefined);
    if (next === reading) return;
    selectedId = next.placed.at(-1)!.id;
    targetSlot = null;
    commit(next);
    const arriving = placed.querySelector<HTMLElement>(`[data-card-id="${selectedId}"]`);
    if (arriving && animations) {
      const source = pile.querySelector('.stack-top')!.getBoundingClientRect();
      const destination = arriving.getBoundingClientRect();
      const flight = document.createElement('img');
      flight.src = backUrl(reading.theme);
      flight.className = 'flying-card';
      Object.assign(flight.style, { left: `${destination.left}px`, top: `${destination.top}px`, width: `${destination.width}px`, height: `${destination.height}px` });
      document.body.append(flight);
      arriving.style.visibility = 'hidden';
      busy = true; renderState();
      const animation = flight.animate([
        { transform: `translate(${source.left-destination.left}px,${source.top-destination.top}px) scale(${source.width/destination.width},${source.height/destination.height}) rotate(-5deg)` },
        { transform: 'translate(0,0) scale(1) rotate(0deg)' }
      ], { duration: 850, easing: 'cubic-bezier(.22,.7,.24,1)', fill: 'forwards' });
      animation.finished.finally(() => { flight.remove(); arriving.style.visibility = ''; busy = false; renderState(); });
    }
  }
  function undo() {
    if (!canEdit() || !history.length) return;
    const previous = history.pop()!;
    selectedId = null; targetSlot = null;
    commit(previous, false);
  }
  function restart(spread = reading.spread) {
    if (!canEdit()) return;
    try {
      selectedId = null; targetSlot = null;
      commit(newReading(spread, reading.theme, nextReversals));
      viewport.fit = true; fit();
    } catch (error) { notify(String(error), 6000); }
  }
  function chooseSpread(id: SpreadId) {
    if (!canEdit()) return;
    close('library-dialog');
    if (reading.spread === id) return;
    if (reading.placed.length && id !== 'free') { pendingSpread = id; open('switch-dialog'); return; }
    selectedId = null; targetSlot = null;
    commit(changeSpread(reading, id));
    viewport.fit = true; fit();
  }

  // Dialogs use native modal focus management; Esc/backdrop close cancels transient actions.
  document.querySelectorAll<HTMLElement>('[data-open]').forEach(node => node.addEventListener('click', () => open(node.dataset.open!)));
  document.querySelectorAll<HTMLElement>('[data-dismiss-menu]').forEach(node => node.addEventListener('click', closeMenus));
  document.querySelectorAll<HTMLElement>('[data-close]').forEach(node => node.addEventListener('click', () => node.closest('dialog')!.close()));
  document.querySelectorAll<HTMLDialogElement>('dialog').forEach(node => {
    node.addEventListener('click', event => { if (event.target === node) { const rect = node.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) node.close(); } });
  });
  dialog('restore-dialog').addEventListener('cancel', event => event.preventDefault());
  document.querySelectorAll<HTMLElement>('[data-spread]').forEach(node => node.addEventListener('click', () => chooseSpread(node.dataset.spread as SpreadId)));
  function selectLibraryTab(name: 'spread' | 'theme') {
    for (const tab of ['spread', 'theme']) {
      const selected = tab === name;
      button(`${tab}-tab`).setAttribute('aria-selected', String(selected));
      button(`${tab}-tab`).tabIndex = selected ? 0 : -1;
      element(`${tab}-panel`).hidden = !selected;
    }
  }
  for (const tab of ['spread', 'theme'] as const) {
    button(`${tab}-tab`).addEventListener('click', () => selectLibraryTab(tab));
    button(`${tab}-tab`).addEventListener('keydown', event => {
      if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 'spread' : event.key === 'End' ? 'theme' : tab === 'spread' ? 'theme' : 'spread';
        selectLibraryTab(next); button(`${next}-tab`).focus();
      }
    });
  }
  button('switch-keep').addEventListener('click', () => {
    selectedId = null; targetSlot = null;
    commit(changeSpread(reading, pendingSpread));
    close('switch-dialog'); viewport.fit = true; fit();
  });
  button('switch-fresh').addEventListener('click', () => { close('switch-dialog'); restart(pendingSpread); });

  async function changeTheme(id: ThemeId) {
    if (!canEdit() || reading.theme === id) { close('library-dialog'); return; }
    const load = (url: string) => new Promise<void>((resolve, reject) => {
      const img = new Image(); img.onload = () => resolve(); img.onerror = () => reject(new Error('無法載入牌面')); img.src = url;
    });
    busy = true; renderState();
    try {
      await Promise.all([load(backUrl(id)), ...reading.placed.filter(card => card.revealed).map(card => load(faceUrl(id, card.id)))]);
      busy = false;
      commit({ ...reading, theme: id });
      close('library-dialog');
    } catch { busy = false; notify('這副牌面暫時載入失敗，已保留原外觀，請重試。', 5000); renderState(); }
  }
  document.querySelectorAll<HTMLElement>('[data-theme]').forEach(node => node.addEventListener('click', () => changeTheme(node.dataset.theme as ThemeId)));
  button('shuffle').addEventListener('click', () => {
    if (!canEdit()) return;
    try {
      const next = shuffleRemaining(reading);
      commit(next);
      busy = true; pending = false; renderState();
      const finish = () => { busy = false; pile.classList.remove('is-shuffling'); renderState(); };
      if (animations) {
        const stack = pile.querySelector<HTMLElement>('.stack')!;
        const originals = [...stack.querySelectorAll<HTMLImageElement>('.stack-card')];
        // Animate in the same coordinate system and return to the exact resting poses.
        const resting = originals.map(card => getComputedStyle(card).transform);
        const layer = document.createElement('div'); layer.className = 'shuffle-layer';
        Object.assign(layer.style, { position: 'absolute', overflow: 'visible' });
        stack.append(layer);
        pile.classList.add('is-shuffling');
        const motions: Animation[] = [];
        for (let i = 0; i < 9; i++) {
          const card = document.createElement('img'); card.src = backUrl(reading.theme); card.className = 'shuffle-card';
          Object.assign(card.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', transformOrigin: 'center' }); layer.append(card);
          const group = i < 3 ? 0 : i < 6 ? 1 : 2;
          const pose = resting[group]!;
          const direction = (i - 4) / 4;
          const retained = i === 0 || i === 4 || i === 8;
          motions.push(card.animate([
            { transform: pose, opacity: 1 },
            { transform: `translate(${direction * Math.min(innerWidth*.32,190)}px,${-45-Math.abs(direction)*25}px) rotate(${direction*38}deg)`, offset: .48, opacity: 1 },
            { transform: pose, offset: .92, opacity: retained ? 1 : 0 },
            { transform: pose, opacity: retained ? 1 : 0 }
          ], { duration: 1800, delay: i*22, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' }));
        }
        for (let i = 0; i < 34; i++) {
          const particle = document.createElement('i'); particle.className = 'shuffle-particle';
          Object.assign(particle.style,{position:'absolute',left:'50%',top:'50%'}); layer.append(particle);
          const angle = i * 2.39996;
          const distance = 50 + i%7*17;
          motions.push(particle.animate([{transform:'translate(0,0) scale(0)',opacity:0},{opacity:.85,offset:.25},{transform:`translate(${Math.cos(angle)*distance}px,${Math.sin(angle)*distance-45}px) scale(.2)`,opacity:0}],{duration:1400,delay:150+i*12,easing:'ease-out',fill:'both'}));
        }
        Promise.allSettled(motions.map(motion => motion.finished)).then(() => {
          // Restore the originals and remove their identical copies in one frame.
          layer.remove(); finish();
        });
      } else setTimeout(finish, 60);
    } catch (error) { notify(String(error), 6000); }
  });
  button('undo').addEventListener('click', undo);
  button('reset').addEventListener('click', () => { if (canEdit()) reading.placed.length ? open('reset-dialog') : restart(); });
  button('confirm-reset').addEventListener('click', () => { close('reset-dialog'); restart(); });
  element<HTMLInputElement>('reversals').addEventListener('change', event => {
    nextReversals = (event.target as HTMLInputElement).checked;
    if (!reading.placed.length) { try { commit(newReading(reading.spread, reading.theme, nextReversals)); } catch (error) { notify(String(error)); } }
    savePreferences();
  });
  element<HTMLInputElement>('animations').addEventListener('change', event => { animations = (event.target as HTMLInputElement).checked; savePreferences(); });
  element<HTMLInputElement>('snap').addEventListener('change', event => { snap = (event.target as HTMLInputElement).checked; savePreferences(); });
  function savePreferences() { try { localStorage.setItem('arcana-preferences', JSON.stringify({ snap, animations, reversals: nextReversals })); } catch { /* Session still works without preferences. */ } }
  button('fit-button').addEventListener('click', fit);
  button('copy-prompt').addEventListener('click', async () => {
    if (!ready || busy) return;
    const prompt = buildReadingPrompt(reading);
    closeMenus();
    try {
      await navigator.clipboard.writeText(prompt);
      notify('已複製解讀 Prompt，可直接貼上使用。');
    } catch {
      // Support browsers or local HTTP previews without Clipboard API access.
      const field = document.createElement('textarea');
      field.value = prompt;
      field.setAttribute('aria-label', '解讀 Prompt');
      field.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.append(field);
      const previous = document.activeElement as HTMLElement | null;
      field.select();
      try {
        if (!document.execCommand('copy')) throw new Error('Copy unavailable');
        notify('已複製解讀 Prompt，可直接貼上使用。');
      } catch {
        notify('無法存取剪貼簿，請允許瀏覽器複製權限後重試。', 6000);
      } finally {
        field.remove();
        previous?.focus({ preventScroll: true });
      }
    }
  });
  button('zoom-in').addEventListener('click', () => setZoom(1.2));
  button('zoom-out').addEventListener('click', () => setZoom(1 / 1.2));
  document.querySelectorAll<HTMLElement>('[data-pan]').forEach(node => node.addEventListener('click', () => {
    const vectors: Record<string, Point> = { left: { x: 70, y: 0 }, right: { x: -70, y: 0 }, up: { x: 0, y: 70 }, down: { x: 0, y: -70 } };
    const vector = vectors[node.dataset.pan!]!;
    viewport.x += vector.x; viewport.y += vector.y; viewport.fit = false; updateView();
  }));
  function setScreenshotMode(active: boolean) {
    if (screenshotMode === active) return;
    if (active) {
      savedView = { viewport: { ...viewport }, width: table.clientWidth, height: table.clientHeight };
      closeMenus();
      cancelGesture();
      pending = false;
      moving = false;
      renderState();
      clearTimeout(toastTimer);
      element('toast').hidden = true;
    }
    screenshotMode = active;
    document.body.classList.toggle('screenshot-mode', active);
    table.inert = active;
    button('exit-fullscreen').hidden = !active;
    if (active) {
      fit();
      button('exit-fullscreen').focus({ preventScroll: true });
    } else {
      if (savedView) {
        viewport = { ...savedView.viewport };
        if (viewport.fit) fit();
        else {
          viewport.x += (table.clientWidth - savedView.width) / 2;
          viewport.y += (table.clientHeight - savedView.height) / 2;
          updateView();
        }
        savedView = null;
      }
      // The mode switch already accounts for this resize.
      previousSize = { width: table.clientWidth, height: table.clientHeight };
      document.querySelector<HTMLButtonElement>('[popovertarget="table-menu"]')?.focus({ preventScroll: true });
    }
  }
  async function exitScreenshotMode() {
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); }
      catch { /* Keep the on-screen exit available if the browser refuses. */ return; }
    }
    setScreenshotMode(false);
  }
  button('fullscreen').addEventListener('click', async () => {
    if (!ready || busy || screenshotMode) return;
    setScreenshotMode(true);
    if (document.fullscreenEnabled && !document.fullscreenElement) {
      try { await document.documentElement.requestFullscreen(); }
      catch { /* Unsupported or denied: keep the viewport-filling screenshot mode. */ }
    }
  });
  button('exit-fullscreen').addEventListener('click', exitScreenshotMode);
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && screenshotMode) setScreenshotMode(false);
  });

  button('flip-card').addEventListener('click', () => {
    const card = reading.placed.find(card => card.id === selectedId);
    if (card) commit(editCard(reading, card.id, { revealed: !card.revealed }));
  });
  button('rotate-card').addEventListener('click', () => {
    const card = reading.placed.find(card => card.id === selectedId);
    if (card) commit(editCard(reading, card.id, { angle: (card.angle + 15) % 360 }));
  });
  button('raise-card').addEventListener('click', () => { if (selectedId) commit(editCard(reading, selectedId, { z: Math.max(...reading.placed.map(card => card.z)) + 1 })); });
  button('cycle-card').addEventListener('click', () => {
    const index = reading.placed.findIndex(card => card.id === selectedId);
    const next = reading.placed[(index + 1) % reading.placed.length];
    if (next) selectCard(next.id);
  });
  button('move-card').addEventListener('click', () => {
    if (!canEdit() || !selectedId) return;
    if (reading.spread !== 'free') commit(changeSpread(reading, 'free'));
    moving = true; pending = false; renderState();
  });
  function showViewer(id: string) {
    viewerId = id;
    const card = reading.placed.find(card => card.id === id);
    if (!card) return;
    const img = element<HTMLImageElement>('viewer-image');
    img.hidden = false; button('retry-image').hidden = true;
    img.src = card.revealed ? faceUrl(reading.theme, id) : backUrl(reading.theme);
    img.alt = card.revealed ? `${cardNames.get(id)}，${card.reversed ? '逆位' : '正位'}` : '未揭牌';
    img.style.transform = card.revealed && card.reversed ? 'rotate(180deg)' : '';
    element('viewer-name').textContent = card.revealed ? cardNames.get(id)! : '未揭牌';
    const label = getSpread(reading.spread).slots.find(slot => slot.id === card.slotId)?.label;
    element('viewer-position').textContent = [label, card.revealed ? card.reversed ? '逆位' : '正位' : '選取牌後可翻面'].filter(Boolean).join(' · ');
    const revealed = reading.placed.filter(card => card.revealed);
    for (const name of ['previous-card','next-card']) button(name).disabled = !card.revealed || revealed.length < 2;
    if (!dialog('viewer-dialog').open) open('viewer-dialog');
  }
  element<HTMLImageElement>('viewer-image').addEventListener('error', () => { element('viewer-image').hidden = true; button('retry-image').hidden = false; notify('圖片未能載入，抽牌結果已保留。'); });
  button('retry-image').addEventListener('click', () => { if (viewerId) showViewer(viewerId); });
  button('view-card').addEventListener('click', () => { if (selectedId) showViewer(selectedId); });
  for (const [id, delta] of [['previous-card', -1], ['next-card', 1]] as const) button(id).addEventListener('click', () => {
    const revealed = reading.placed.filter(card => card.revealed);
    const index = revealed.findIndex(card => card.id === viewerId);
    const next = revealed[(index + delta + revealed.length) % revealed.length];
    if (next) showViewer(next.id);
  });

  // A single pointer state machine handles cards, empty-table panning, and pinch zoom.
  type Gesture = { kind: 'card' | 'pan' | 'pile'; id?: string; start: Point; last: Point; original: Point; moved: boolean; view: Viewport };
  let gesture: Gesture | null = null;
  const pointers = new Map<number, Point>();
  let pinch: { distance: number; center: Point; view: Viewport } | null = null;
  let ignoreClickUntil = 0;
  let spaceDown = false;
  function cancelGesture() {
    const active = gesture;
    gesture = null; pointers.clear(); pinch = null;
    table.classList.remove('is-panning');
    element('placement-cursor').hidden = true;
    if (active?.kind === 'card' && active.id) {
      const card = reading?.placed.find(card => card.id === active.id);
      const node = placed.querySelector<HTMLElement>(`[data-card-id="${active.id}"]`);
      if (card && node) { node.style.transform = `translate(${card.x}px,${card.y}px) rotate(${card.angle}deg)`; node.classList.remove('is-dragging'); }
    }
  }
  function startPointer(event: PointerEvent, source: 'table' | 'pile') {
    if (!ready || busy || event.button !== 0 || document.querySelector('dialog[open]')) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const points = [...pointers.values()];
      const activePointers = [...pointers];
      cancelGesture();
      for (const [key, value] of activePointers) pointers.set(key, value);
      pinch = { distance: Math.hypot(points[0]!.x - points[1]!.x, points[0]!.y - points[1]!.y), center: localPoint((points[0]!.x + points[1]!.x) / 2, (points[0]!.y + points[1]!.y) / 2), view: { ...viewport } };
      ignoreClickUntil = performance.now() + 500;
      return;
    }
    if (pointers.size > 2) return;
    const hit = (event.target as HTMLElement).closest<HTMLElement>('[data-card-id]');
    const card = hit && reading.placed.find(card => card.id === hit.dataset.cardId);
    if (source === 'pile' && !canEdit()) return;
    const kind = source === 'pile' ? 'pile' : card && !spaceDown ? 'card' : 'pan';
    gesture = { kind, id: card?.id, start: { x: event.clientX, y: event.clientY }, last: { x: event.clientX, y: event.clientY }, original: card ? { x: card.x, y: card.y } : { x: 0, y: 0 }, moved: false, view: { ...viewport } };
    // Capture on the original button so a normal tap keeps its click target.
    const captureTarget = (event.target as HTMLElement).closest('button') ?? event.currentTarget as HTMLElement;
    captureTarget.setPointerCapture(event.pointerId);
  }
  function movePointer(event: PointerEvent) {
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch && pointers.size >= 2) {
      const points = [...pointers.values()];
      const distance = Math.hypot(points[0]!.x - points[1]!.x, points[0]!.y - points[1]!.y);
      const center = localPoint((points[0]!.x + points[1]!.x) / 2, (points[0]!.y + points[1]!.y) / 2);
      viewport = zoomAt(pinch.view, distance / Math.max(1, pinch.distance), pinch.center);
      viewport.x += center.x - pinch.center.x; viewport.y += center.y - pinch.center.y;
      updateView(); return;
    }
    if (!gesture) {
      if (pending) { const point = localPoint(event.clientX, event.clientY); const cursor = element('placement-cursor'); cursor.hidden = false; cursor.style.left = `${point.x}px`; cursor.style.top = `${point.y}px`; }
      return;
    }
    const delta = { x: event.clientX - gesture.start.x, y: event.clientY - gesture.start.y };
    if (!gesture.moved && Math.hypot(delta.x, delta.y) < 7) return;
    gesture.moved = true;
    gesture.last = { x: event.clientX, y: event.clientY };
    if (gesture.kind === 'card') {
      if (reading.spread !== 'free' || readonly) return;
      const card = reading.placed.find(card => card.id === gesture!.id)!;
      const node = placed.querySelector<HTMLElement>(`[data-card-id="${card.id}"]`)!;
      let x = gesture.original.x + delta.x / viewport.scale, y = gesture.original.y + delta.y / viewport.scale;
      if (snap) { x = Math.round(x / 20) * 20; y = Math.round(y / 20) * 20; }
      node.style.transform = `translate(${x}px,${y}px) rotate(${card.angle}deg)`;
      node.classList.add('is-dragging');
    } else if (gesture.kind === 'pan') {
      viewport = { ...viewport, x: gesture.view.x + delta.x, y: gesture.view.y + delta.y, fit: false };
      table.classList.add('is-panning'); updateView();
    } else {
      const point = localPoint(event.clientX, event.clientY);
      const cursor = element('placement-cursor'); cursor.hidden = false; cursor.style.left = `${point.x}px`; cursor.style.top = `${point.y}px`;
    }
  }
  function finishPointer(event: PointerEvent) {
    pointers.delete(event.pointerId);
    if (pinch) { if (pointers.size < 2) { cancelGesture(); ignoreClickUntil = performance.now() + 400; } return; }
    const current = gesture;
    gesture = null;
    table.classList.remove('is-panning'); element('placement-cursor').hidden = true;
    if (!current?.moved) return;
    ignoreClickUntil = performance.now() + 400;
    if (current.kind === 'card' && reading.spread === 'free' && !readonly) {
      const delta = { x: (event.clientX - current.start.x) / viewport.scale, y: (event.clientY - current.start.y) / viewport.scale };
      const x = current.original.x + delta.x, y = current.original.y + delta.y;
      selectedId = current.id!;
      // Keep the camera still on a drag; fit is an explicit follow-up action.
      viewport.fit = false;
      commit(editCard(reading, current.id!, snap ? { x: Math.round(x / 20) * 20, y: Math.round(y / 20) * 20 } : { x, y }));
    } else if (current.kind === 'pile') {
      const rect = table.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
      if (reading.spread === 'free') { viewport.fit = false; doDraw(worldPoint(event.clientX, event.clientY)); }
      else {
        const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-slot-id]');
        if (hit?.dataset.slotId) doDraw(undefined, hit.dataset.slotId);
        else notify('請放到空的牌位。');
      }
    } else if (current.kind === 'card' && reading.spread !== 'free') notify('切換自由擺牌後，即可拖動牌的位置。');
  }
  for (const [node, source] of [[table, 'table'], [pile, 'pile']] as const) {
    node.addEventListener('pointerdown', event => startPointer(event, source));
    node.addEventListener('pointermove', movePointer);
    node.addEventListener('pointerup', finishPointer);
    node.addEventListener('pointercancel', () => { cancelGesture(); ignoreClickUntil = performance.now() + 400; });
    node.addEventListener('lostpointercapture', () => { if (gesture) cancelGesture(); });
  }
  pile.addEventListener('click', event => { if (performance.now() >= ignoreClickUntil || event.detail === 0) doDraw(); });
  table.addEventListener('click', event => {
    if (!ready || busy || (performance.now() < ignoreClickUntil && event.detail !== 0)) return;
    const hit = (event.target as HTMLElement).closest<HTMLElement>('[data-card-id], [data-slot-id]');
    if (pending) { viewport.fit = false; doDraw(worldPoint(event.clientX, event.clientY)); return; }
    if (moving && selectedId) { viewport.fit = false; commit(editCard(reading, selectedId, worldPoint(event.clientX, event.clientY))); return; }
    if (hit?.dataset.cardId) {
      selectCard(hit.dataset.cardId);
      const card = reading.placed.find(card => card.id === selectedId);
      if (card && !card.revealed && !readonly) commit(editCard(reading, card.id, { revealed: true }));
      return;
    }
    if (hit?.dataset.slotId) { targetSlot = hit.dataset.slotId; selectedId = null; render(); return; }
    selectedId = null; targetSlot = null; render();
  });
  table.addEventListener('wheel', event => {
    if (event.ctrlKey || event.metaKey) return; // Preserve browser zoom.
    event.preventDefault();
    viewport = zoomAt(viewport, Math.exp(-event.deltaY * 0.001), localPoint(event.clientX, event.clientY)); updateView();
  }, { passive: false });
  document.addEventListener('keydown', event => {
    if (screenshotMode) {
      if (event.key === 'Escape') { event.preventDefault(); void exitScreenshotMode(); }
      return;
    }
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.code === 'Space' && event.target === table) { spaceDown = true; event.preventDefault(); }
    if (event.key === 'Escape') { cancelGesture(); pending = false; moving = false; renderState(); }
    if (document.querySelector('dialog[open]') || !ready) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); return; }
    const arrows: Record<string, Point> = { ArrowLeft: { x: -10, y: 0 }, ArrowRight: { x: 10, y: 0 }, ArrowUp: { x: 0, y: -10 }, ArrowDown: { x: 0, y: 10 } };
    if (selectedId && reading.spread === 'free' && arrows[event.key] && !event.ctrlKey && !event.metaKey && canEdit()) {
      event.preventDefault();
      const card = reading.placed.find(card => card.id === selectedId)!;
      const delta = arrows[event.key]!;
      viewport.fit = false;
      commit(editCard(reading, selectedId, { x: card.x + delta.x * (event.shiftKey ? 5 : 1), y: card.y + delta.y * (event.shiftKey ? 5 : 1) }));
    }
    if ((pending || moving) && event.key === 'Enter' && event.target === table) {
      event.preventDefault();
      const point = toWorld({ x: table.clientWidth / 2, y: table.clientHeight / 2 }, viewport);
      if (moving && selectedId) commit(editCard(reading, selectedId, point)); else doDraw(point);
    }
  });
  document.addEventListener('keyup', event => { if (event.code === 'Space') spaceDown = false; });
  window.addEventListener('blur', () => { cancelGesture(); spaceDown = false; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelGesture(); else refreshLock(); });
  let previousSize = { width: 0, height: 0 };
  new ResizeObserver(() => {
    if (ready) {
      if (viewport.fit) fit();
      else { viewport.x += (table.clientWidth - previousSize.width) / 2; viewport.y += (table.clientHeight - previousSize.height) / 2; updateView(); }
    }
    previousSize = { width: table.clientWidth, height: table.clientHeight };
  }).observe(table);

  window.addEventListener('storage', event => { if (event.key === lockKey) refreshLock(); });
  const heartbeat = setInterval(() => { if (!disposed && !document.hidden) refreshLock(); }, 5000);
  window.addEventListener('pagehide', () => {
    disposed = true; clearInterval(heartbeat);
    if (locking && getLock()?.owner === owner) { try { localStorage.removeItem(lockKey); } catch { /* no storage */ } }
  });
  button('takeover').addEventListener('click', async () => {
    try {
      const latest = await loadReading();
      if (latest) reading = latest;
      claimLock(); history = []; selectedId = null; render();
      element('save-status').textContent = persistent ? '已接續這張牌桌' : '僅此分頁可用';
    } catch { notify('暫時無法讀取最新牌桌，請重試。'); }
  });

  async function initialize(ephemeral = false) {
    try {
      try {
        const preferences = JSON.parse(localStorage.getItem('arcana-preferences') || '{}');
        snap = preferences.snap === true;
        animations = preferences.animations !== false;
        nextReversals = preferences.reversals !== false;
      } catch { /* Use defaults. */ }
      const saved = ephemeral ? null : await loadReading();
      reading = saved ?? newReading('timeline', 'rider-waite', nextReversals);
      if (saved) nextReversals = saved.reversals;
      persistent = !ephemeral;
      ready = true;
      element<HTMLInputElement>('snap').checked = snap;
      element<HTMLInputElement>('animations').checked = animations;
      element<HTMLInputElement>('reversals').checked = nextReversals;
      const lock = getLock();
      if (lock && lock.owner !== owner && Date.now() - lock.time < 15000) readonly = true;
      else claimLock();
      render(); fit();
      element('tab-notice').hidden = !readonly;
      element('save-status').textContent = ephemeral ? '僅此分頁可用' : readonly ? '另一個分頁正在編輯' : saved ? '已接續上次牌桌' : '已自動保存於此裝置';
      if (!saved && !ephemeral) persist();
      if (dialog('restore-dialog').open) close('restore-dialog');
    } catch (error) {
      element('restore-message').textContent = `${error instanceof Error ? error.message : '無法使用本機儲存'} 可重試讀取，或開啟不覆寫舊存檔的暫存牌桌。`;
      if (!dialog('restore-dialog').open) dialog('restore-dialog').showModal();
    }
  }
  button('restore-retry').addEventListener('click', () => initialize());
  button('restore-new').addEventListener('click', () => initialize(true));
  await initialize();
}
