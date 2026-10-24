import type { Btn, Folder, Item } from '../types';

export const ROOT = 'root';
export const isFolder = (x: Item): x is Folder => (x as Folder).kind === 'folder';

export function listOf(items: Item[], scope: string): Item[] {
  if (scope === ROOT) return items;
  const f = items.find((x) => x.id === scope);
  return f && isFolder(f) ? f.children : [];
}

export function locate(items: Item[], id: string): { scope: string; index: number } | null {
  const i = items.findIndex((x) => x.id === id);
  if (i >= 0) return { scope: ROOT, index: i };
  for (const f of items) {
    if (!isFolder(f)) continue;
    const j = f.children.findIndex((x) => x.id === id);
    if (j >= 0) return { scope: f.id, index: j };
  }
  return null;
}

export function findItem(items: Item[], id: string): Item | null {
  const l = locate(items, id);
  return l ? listOf(items, l.scope)[l.index] : null;
}

function setList(items: Item[], scope: string, list: Item[]): Item[] {
  if (scope === ROOT) return list;
  return items.map((x) => (x.id === scope && isFolder(x) ? { ...x, children: list as Btn[] } : x));
}

export function remove(items: Item[], id: string): Item[] {
  const l = locate(items, id);
  if (!l) return items;
  const list = [...listOf(items, l.scope)];
  list.splice(l.index, 1);
  return setList(items, l.scope, list);
}

export function insert(items: Item[], scope: string, index: number, item: Item): Item[] {
  const list = [...listOf(items, scope)];
  list.splice(Math.max(0, Math.min(index, list.length)), 0, item);
  return setList(items, scope, list);
}

export function replace(items: Item[], item: Item): Item[] {
  const l = locate(items, item.id);
  if (!l) return items;
  const list = [...listOf(items, l.scope)];
  list[l.index] = item;
  return setList(items, l.scope, list);
}

export type Drop =
  | { type: 'trash' }
  | { type: 'item'; scope: string; id: string; zone: 'before' | 'after' | 'merge' }
  | { type: 'end'; scope: string };

// 끌어 놓은 결과를 목록에 반영. 바뀌지 않으면 null
export function applyDrop(items: Item[], activeId: string, drop: Drop): Item[] | null {
  const active = findItem(items, activeId);
  if (!active || drop.type === 'trash') return null;
  if (isFolder(active) && drop.scope !== ROOT) return null; // 폴더 안에 폴더 금지

  if (drop.type === 'end') {
    const without = remove(items, activeId);
    return insert(without, drop.scope, listOf(without, drop.scope).length, active);
  }
  if (drop.id === activeId) return null;
  const target = findItem(items, drop.id);
  if (!target) return null;

  if (drop.zone === 'merge' && !isFolder(active)) {
    if (isFolder(target)) {
      const without = remove(items, activeId);
      const t = findItem(without, target.id) as Folder;
      return replace(without, { ...t, children: [...t.children, active] });
    }
    if (drop.scope !== ROOT) return null; // 폴더 안에서는 새 폴더를 만들지 않음
    const without = remove(items, activeId);
    const folder: Folder = { id: crypto.randomUUID(), kind: 'folder', name: '폴더', children: [target as Btn, active] };
    return swapIn(without, target.id, folder);
  }
  const without = remove(items, activeId);
  const l = locate(without, drop.id);
  if (!l) return null;
  return insert(without, l.scope, l.index + (drop.zone === 'after' ? 1 : 0), active);
}

function swapIn(items: Item[], targetId: string, folder: Folder): Item[] {
  const l = locate(items, targetId)!;
  const list = [...listOf(items, l.scope)];
  list[l.index] = folder;
  return setList(items, l.scope, list);
}

// 폴더 삭제: 안의 버튼을 폴더 자리에 풀어 놓음
export function dissolve(items: Item[], folderId: string): Item[] {
  const i = items.findIndex((x) => x.id === folderId);
  const f = items[i];
  if (i < 0 || !isFolder(f)) return items;
  return [...items.slice(0, i), ...f.children, ...items.slice(i + 1)];
}
