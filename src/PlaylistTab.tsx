import { useEffect, useState } from 'react';
import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  IconPlus, IconChevronLeft, IconTrash, IconPlayerPlayFilled, IconPlayerPauseFilled, IconPlayerSkipForwardFilled,
  IconPlayerSkipBackFilled, IconRepeat, IconRepeatOnce, IconRepeatOff, IconArrowsShuffle, IconGripVertical, IconX,
  IconBrandYoutube, IconMusic, IconFolder, IconAlertTriangle, IconPlaylist,
} from '@tabler/icons-react';
import type { Btn, Item, Playlist, Repeat } from './types';
import { isFolder } from './lib/tree';
import * as player from './lib/playlist';

interface Props {
  items: Item[];
  playlists: Playlist[];
  findBtn: (id: string) => Btn | null;
  onChange: (f: (list: Playlist[]) => Playlist[]) => void;
}

export default function PlaylistTab({ items, playlists, findBtn, onChange }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [pv, setPv] = useState<player.PlView>({ playlistId: null, key: null, playing: false, loading: false });
  useEffect(() => player.subscribe(setPv), []);

  const open = playlists.find((p) => p.id === openId) ?? null;
  const update = (p: Playlist) => onChange((list) => list.map((x) => (x.id === p.id ? p : x)));

  const create = () => {
    let n = playlists.length + 1;
    while (playlists.some((p) => p.name === `재생목록 ${n}`)) n++;
    const p: Playlist = { id: crypto.randomUUID(), name: `재생목록 ${n}`, items: [], repeat: 'off', shuffle: false };
    onChange((list) => [...list, p]);
    setOpenId(p.id);
  };

  if (open) {
    return <Detail p={open} items={items} findBtn={findBtn} pv={pv} onBack={() => setOpenId(null)} onUpdate={update}
      onDelete={() => { if (pv.playlistId === open.id) player.stop(); onChange((list) => list.filter((x) => x.id !== open.id)); setOpenId(null); }} />;
  }

  return (
    <div className="pl-home">
      {playlists.length === 0 && <p className="pl-empty">재생목록이 없습니다</p>}
      {playlists.map((p) => (
        <button key={p.id} className={`pl-card ${pv.playlistId === p.id ? 'on' : ''}`} onClick={() => setOpenId(p.id)}>
          <IconPlaylist size={26} />
          <span className="pl-card-name">{p.name}</span>
          <span className="pl-card-count">{p.items.length}곡</span>
        </button>
      ))}
      <button className="pl-new" onClick={create}><IconPlus size={22} />새 재생목록</button>
    </div>
  );
}

function Detail({ p, items, findBtn, pv, onBack, onUpdate, onDelete }: {
  p: Playlist; items: Item[]; findBtn: (id: string) => Btn | null; pv: player.PlView;
  onBack: () => void; onUpdate: (p: Playlist) => void; onDelete: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(p.name);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
  );

  const active = pv.playlistId === p.id;
  const hasYouTube = p.items.some((e) => findBtn(e.btnId)?.source.kind === 'youtube');
  const nextRepeat: Record<Repeat, Repeat> = { off: 'all', all: 'one', one: 'off' };

  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    if (!over || a.id === over.id) return;
    const from = p.items.findIndex((e) => e.key === a.id);
    const to = p.items.findIndex((e) => e.key === over.id);
    if (from >= 0 && to >= 0) onUpdate({ ...p, items: arrayMove(p.items, from, to) });
  };
  const removeEntry = (key: string) => {
    if (active && pv.key === key) player.next();
    onUpdate({ ...p, items: p.items.filter((e) => e.key !== key) });
  };
  const playPause = () => {
    if (!active) player.playFrom(p.id);
    else if (pv.playing) player.pause();
    else player.resume();
  };
  const toggleShuffle = () => {
    onUpdate({ ...p, shuffle: !p.shuffle });
    if (!p.shuffle) setTimeout(player.reshuffle, 0);
  };
  const commitName = () => { onUpdate({ ...p, name: name.trim() || p.name }); setRenaming(false); };

  return (
    <div className="pl-detail">
      <div className="pl-top">
        <button className="icon" aria-label="뒤로" onClick={onBack}><IconChevronLeft size={28} /></button>
        {renaming
          ? <input className="folder-name-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={(e) => e.key === 'Enter' && commitName()} />
          : <button className="folder-name" onClick={() => { setName(p.name); setRenaming(true); }}>{p.name}</button>}
        <button className="icon" aria-label="재생목록 삭제" onClick={() => setConfirmDel(true)}><IconTrash size={24} /></button>
      </div>

      <div className="pl-controls">
        <button className={`icon toggle ${p.shuffle ? 'on' : ''}`} aria-label="랜덤" onClick={toggleShuffle}><IconArrowsShuffle size={24} /></button>
        <button className="icon" aria-label="이전 곡" disabled={!active} onClick={player.prev}><IconPlayerSkipBackFilled size={26} /></button>
        <button className="pl-play" aria-label={active && pv.playing ? '일시정지' : '재생'} disabled={!p.items.length} onClick={playPause}>
          {active && pv.playing ? <IconPlayerPauseFilled size={30} /> : <IconPlayerPlayFilled size={30} />}
        </button>
        <button className="icon" aria-label="다음 곡" disabled={!active} onClick={player.next}><IconPlayerSkipForwardFilled size={26} /></button>
        <button className={`icon toggle ${p.repeat !== 'off' ? 'on' : ''}`} aria-label="반복" onClick={() => onUpdate({ ...p, repeat: nextRepeat[p.repeat] })}>
          {p.repeat === 'one' ? <IconRepeatOnce size={24} /> : p.repeat === 'all' ? <IconRepeat size={24} /> : <IconRepeatOff size={24} />}
        </button>
      </div>
      <p className="pl-mode">{p.repeat === 'all' ? '전체 반복' : p.repeat === 'one' ? '한 곡 반복' : '반복 안 함'} · 랜덤 {p.shuffle ? '켬' : '끔'}</p>

      {hasYouTube && (
        <p className="pl-warn"><IconAlertTriangle size={18} />유튜브 곡은 화면이 꺼지거나 다른 앱으로 가면 재생되지 않습니다</p>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={p.items.map((e) => e.key)} strategy={verticalListSortingStrategy}>
          <ul className="pl-list">
            {p.items.map((e, i) => {
              const b = findBtn(e.btnId);
              if (!b) return null;
              return <Row key={e.key} id={e.key} index={i + 1} btn={b} current={active && pv.key === e.key}
                onPlay={() => player.playFrom(p.id, e.key)} onRemove={() => removeEntry(e.key)} />;
            })}
          </ul>
        </SortableContext>
      </DndContext>

      <button className="pl-new" onClick={() => setAdding(true)}><IconPlus size={22} />곡 추가</button>

      {adding && <AddSheet items={items} onCancel={() => setAdding(false)} onAdd={(ids) => {
        onUpdate({ ...p, items: [...p.items, ...ids.map((btnId) => ({ key: crypto.randomUUID(), btnId }))] });
        setAdding(false);
      }} />}
      {confirmDel && (
        <div className="modal-back" onClick={() => setConfirmDel(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <p>‘{p.name}’ 재생목록을 삭제할까요? 버튼과 음원은 지워지지 않습니다.</p>
            <div className="row-end">
              <button onClick={() => setConfirmDel(false)}>취소</button>
              <button className="danger" onClick={onDelete}>삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ id, index, btn, current, onPlay, onRemove }: {
  id: string; index: number; btn: Btn; current: boolean; onPlay: () => void; onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 5 : undefined }}
      className={`pl-row ${current ? 'current' : ''} ${isDragging ? 'dragging' : ''}`}>
      <button className="pl-grip" ref={setActivatorNodeRef} aria-label="순서 이동" {...attributes} {...listeners}><IconGripVertical size={20} /></button>
      <button className="pl-row-main" onClick={onPlay}>
        <span className="pl-idx">{index}</span>
        <span className="pl-row-name">{btn.name}</span>
        {btn.source.kind === 'youtube' ? <IconBrandYoutube size={16} /> : <IconMusic size={16} />}
      </button>
      <button className="pl-x" aria-label="빼기" onClick={onRemove}><IconX size={20} /></button>
    </li>
  );
}

// 폴더를 고르면 그 순간 폴더 안 곡이 순서대로 들어간다
function AddSheet({ items, onCancel, onAdd }: { items: Item[]; onCancel: () => void; onAdd: (ids: string[]) => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const toggle = (ids: string[], on: boolean) => {
    const s = new Set(sel);
    ids.forEach((id) => (on ? s.add(id) : s.delete(id)));
    setSel(s);
  };
  const order = items.flatMap((x) => (isFolder(x) ? x.children.map((c) => c.id) : [x.id]));
  const picked = order.filter((id) => sel.has(id));

  return (
    <div className="modal-back" onClick={onCancel}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>곡 추가</h2>
        {items.length === 0 && <p className="filename">단일재생 탭에서 버튼을 먼저 만들어 주세요</p>}
        <div className="pick-list">
          {items.map((x) => {
            if (!isFolder(x)) {
              return (
                <label key={x.id} className="check pick">
                  <input type="checkbox" checked={sel.has(x.id)} onChange={(e) => toggle([x.id], e.target.checked)} />
                  {x.source.kind === 'youtube' ? <IconBrandYoutube size={16} /> : <IconMusic size={16} />}
                  <span className="pick-name">{x.name}</span>
                </label>
              );
            }
            const ids = x.children.map((c) => c.id);
            const all = ids.length > 0 && ids.every((id) => sel.has(id));
            return (
              <div key={x.id}>
                <label className="check pick folder-pick">
                  <input type="checkbox" checked={all} disabled={!ids.length} onChange={(e) => toggle(ids, e.target.checked)} />
                  <IconFolder size={18} />
                  <span className="pick-name">{x.name} 폴더 전체 ({ids.length}곡)</span>
                </label>
                {x.children.map((c) => (
                  <label key={c.id} className="check pick sub-pick">
                    <input type="checkbox" checked={sel.has(c.id)} onChange={(e) => toggle([c.id], e.target.checked)} />
                    {c.source.kind === 'youtube' ? <IconBrandYoutube size={16} /> : <IconMusic size={16} />}
                    <span className="pick-name">{c.name}</span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>
        <div className="row-end">
          <button onClick={onCancel}>취소</button>
          <button className="primary" disabled={!picked.length} onClick={() => onAdd(picked)}>추가{picked.length ? ` (${picked.length})` : ''}</button>
        </div>
      </div>
    </div>
  );
}
