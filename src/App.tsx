import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Session } from '@supabase/supabase-js';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDraggable, type DragEndEvent, type DragMoveEvent, type DragStartEvent } from '@dnd-kit/core';
import { IconPlus, IconSettings, IconTrash, IconBrandYoutube, IconMusic, IconLoader2, IconPlayerStopFilled, IconBrandGoogle } from '@tabler/icons-react';
import type { AppState, Btn, Folder, Item, Look } from './types';
import { ROOT, isFolder, findItem, locate, listOf, insert, remove, replace, applyDrop, dissolve, type Drop } from './lib/tree';
import { supabase, loadState, saveState, removeAudio } from './lib/supabase';
import { subscribe, toggle, stop, setYouTubeHost, prepareYouTube, clearError, type EngineView } from './lib/engine';
import { textOn } from './lib/themes';
import { checkUpdate } from './lib/update';
import Editor from './Editor';
import Settings from './Settings';

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => { if (session) checkUpdate(); }, [session?.user.id]);

  if (session === undefined) return <div className="center">불러오는 중…</div>;
  if (!session) return <Login />;
  return <Main session={session} />;
}

function Login() {
  const [err, setErr] = useState('');
  const go = async () => {
    const redirectTo = location.origin + import.meta.env.BASE_URL;
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) setErr('로그인하지 못했습니다');
  };
  return (
    <div className="login">
      <IconMusic size={56} stroke={1.5} />
      <h1>음원재생기</h1>
      <button className="google" onClick={go}><IconBrandGoogle size={20} />구글로 로그인</button>
      {err && <p className="err">{err}</p>}
    </div>
  );
}


type EditorTarget = { btn: Btn | null; scope: string };

function Main({ session }: { session: Session }) {
  const uid = session.user.id;
  const [state, setState] = useState<AppState | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [saveErr, setSaveErr] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editorFor, setEditorFor] = useState<EditorTarget | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Item | null>(null);
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [folderAway, setFolderAway] = useState(false); // 폴더 밖으로 끌고 나가면 폴더 창을 잠시 감춤
  const panelRef = useRef<HTMLDivElement>(null);
  const [ev, setEv] = useState<EngineView>({ id: null, status: null, ytVisible: false, error: null });
  const loaded = useRef(false);
  const ytRef = useRef<HTMLDivElement>(null);

  useEffect(() => subscribe(setEv), []);
  useEffect(() => { setYouTubeHost(ytRef.current); }, []);

  useEffect(() => {
    loadState(uid).then((s) => { setState(s); loaded.current = true; }).catch(() => setLoadErr(true));
  }, [uid]);

  // 유튜브 버튼이 있으면 플레이어를 미리 준비(누르는 순간 바로 재생되도록)
  useEffect(() => {
    const all = (state?.buttons ?? []).flatMap((x) => (isFolder(x) ? x.children : [x]));
    if (all.some((b) => b.source.kind === 'youtube')) prepareYouTube().catch(() => {});
  }, [state?.buttons]);

  // 바뀔 때마다 서버에 저장(0.6초 모아서)
  useEffect(() => {
    if (!state || !loaded.current) return;
    const t = setTimeout(() => saveState(uid, state).then(() => setSaveErr(false)).catch(() => setSaveErr(true)), 600);
    return () => clearTimeout(t);
  }, [state, uid]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  if (loadErr) return <div className="center">설정을 불러오지 못했습니다. 다시 열어 주세요.</div>;
  if (!state) return <div className="center">불러오는 중…</div>;

  const look = state.look;
  const items = state.buttons;
  const setLook = (l: Look) => setState({ ...state, look: l });
  const setItems = (f: (items: Item[]) => Item[]) => setState((s) => (s ? { ...s, buttons: f(s.buttons) } : s));
  const folder = openFolder ? (findItem(items, openFolder) as Folder | null) : null;

  const enterEdit = () => { stop(false); setEditing(true); navigator.vibrate?.(30); };

  // 손가락 아래에 무엇이 있는지로 놓을 곳을 정한다
  const pointer = (e: DragMoveEvent | DragEndEvent) => {
    const a = e.activatorEvent as PointerEvent;
    return { x: a.clientX + e.delta.x, y: a.clientY + e.delta.y };
  };
  const dropAt = (x: number, y: number, active: Item): Drop | null => {
    for (const el of document.elementsFromPoint(x, y)) {
      if (!(el instanceof HTMLElement) || el.closest('.drag-overlay')) continue;
      if (el.closest('[data-trash]')) return { type: 'trash' };
      const tile = el.closest<HTMLElement>('[data-drop-id]');
      if (tile && tile.dataset.dropId !== active.id) {
        const scope = tile.dataset.scope!;
        const target = findItem(items, tile.dataset.dropId!);
        if (!target) return null;
        const r = tile.getBoundingClientRect();
        const vertical = scope === ROOT && look.cols === 1;
        const f = vertical ? (y - r.top) / r.height : (x - r.left) / r.width;
        const canMerge = !isFolder(active) && (isFolder(target) || scope === ROOT);
        const zone = canMerge && f > 0.25 && f < 0.75 ? 'merge' : f < 0.5 ? 'before' : 'after';
        return { type: 'item', scope, id: target.id, zone };
      }
      if (tile) return null;
      const list = el.closest<HTMLElement>('[data-drop-list]');
      if (list) return { type: 'end', scope: list.dataset.dropList! };
    }
    // 폴더에서 꺼낸 버튼을 빈 곳에 놓으면 맨 뒤로
    return locate(items, active.id)?.scope !== ROOT ? { type: 'end', scope: ROOT } : null;
  };

  const onDragStart = (e: DragStartEvent) => { setActiveId(String(e.active.id)); setFolderAway(false); };
  const onDragMove = (e: DragMoveEvent) => {
    const active = findItem(items, String(e.active.id));
    if (!active) return;
    const { x, y } = pointer(e);
    if (folder && !folderAway) {
      const r = panelRef.current?.getBoundingClientRect();
      if (r && (x < r.left || x > r.right || y < r.top || y > r.bottom)) setFolderAway(true);
    }
    const d = dropAt(x, y, active);
    if (JSON.stringify(d) !== JSON.stringify(drop)) setDrop(d);
  };
  const endDrag = () => {
    setActiveId(null); setDrop(null);
    if (folderAway) { setOpenFolder(null); setFolderAway(false); }
  };
  const onDragEnd = (e: DragEndEvent) => {
    const id = String(e.active.id);
    const active = findItem(items, id);
    const d = active ? dropAt(pointer(e).x, pointer(e).y, active) : null;
    endDrag();
    if (!active || !d) return;
    if (d.type === 'trash') { setConfirmDel(active); return; }
    const next = applyDrop(items, id, d);
    if (next) setItems(() => next);
  };

  const doDelete = (it: Item) => {
    if (isFolder(it)) setItems((list) => dissolve(list, it.id));
    else {
      if (ev.id === it.id) stop(false);
      setItems((list) => remove(list, it.id));
      if (it.source.kind === 'file') removeAudio(it.source.path);
    }
    setConfirmDel(null);
  };

  const onSaved = (b: Btn, oldPath: string | null) => {
    const scope = editorFor!.scope;
    setItems((list) => (locate(list, b.id) ? replace(list, b) : insert(list, scope, listOf(list, scope).length, b)));
    if (oldPath && (b.source.kind !== 'file' || b.source.path !== oldPath)) removeAudio(oldPath);
    setEditorFor(null);
  };

  const renameFolder = (f: Folder, name: string) => setItems((list) => replace(list, { ...f, name: name.trim() || '폴더' }));

  const vars = {
    '--bg': look.bg, '--fg': textOn(look.bg), '--btn': look.button, '--btn-fg': textOn(look.button), '--border': look.border,
    '--cols': look.cols, '--radius': look.shape === 'circle' ? '50%' : look.shape === 'rounded' ? '22%' : '6px',
  } as CSSProperties;

  const tile = (it: Item, scope: string) => {
    const mark = drop?.type === 'item' && drop.id === it.id ? drop.zone : null;
    const common = { key: it.id, scope, editing, mark, dragging: activeId === it.id, onLong: enterEdit };
    if (isFolder(it)) {
      const playing = it.children.some((c) => c.id === ev.id);
      return <FolderTile {...common} folder={it} playing={playing} onTap={() => setOpenFolder(it.id)} />;
    }
    return <SoundButton {...common} btn={it} status={ev.id === it.id ? ev.status : null}
      onTap={() => (editing ? setEditorFor({ btn: it, scope }) : toggle(it))} />;
  };
  const activeItem = activeId ? findItem(items, activeId) : null;
  const endMark = (scope: string) => (drop?.type === 'end' && drop.scope === scope ? 'drop-end' : '');

  return (
    <div className="app" style={vars}>
      <header>
        <h1>{editing ? '편집' : '음원재생기'}</h1>
        {editing
          ? <button className="done" onClick={() => setEditing(false)}>완료</button>
          : <button className="icon" aria-label="설정" onClick={() => setSettingsOpen(true)}><IconSettings size={26} /></button>}
      </header>
      {editing && <p className="hint">버튼을 눌러 설정 변경, 끌어서 순서 이동, 다른 버튼 가운데에 놓으면 폴더, 휴지통에 놓아 삭제</p>}

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragMove={onDragMove} onDragCancel={endDrag} onDragEnd={onDragEnd}>
        <div className={`grid ${editing ? 'editing' : ''} ${look.cols >= 4 ? 'dense' : ''} ${look.cols === 1 ? 'one' : ''} ${endMark(ROOT)}`} data-drop-list={ROOT}>
          {items.map((it) => tile(it, ROOT))}
          {!editing && (
            <button className="sbtn add" aria-label="추가" onClick={() => setEditorFor({ btn: null, scope: ROOT })}><IconPlus size={40} /></button>
          )}
        </div>

        {folder && (
          <div className={`modal-back folder-back ${folderAway ? 'away' : ''}`} onClick={() => !activeId && setOpenFolder(null)}>
            <div className={`folder-panel ${endMark(folder.id)}`} ref={panelRef} data-drop-list={folder.id} onClick={(e) => e.stopPropagation()}>
              <div className="folder-head">
                <FolderName folder={folder} onRename={renameFolder} />
                {editing && <button className="done" onClick={() => setEditing(false)}>완료</button>}
              </div>
              <div className={`grid folder-grid ${editing ? 'editing' : ''}`}>
                {folder.children.map((b) => tile(b, folder.id))}
                {!editing && (
                  <button className="sbtn add" aria-label="추가" onClick={() => setEditorFor({ btn: null, scope: folder.id })}><IconPlus size={36} /></button>
                )}
              </div>
            </div>
          </div>
        )}

        {editing && (
          <div data-trash className={`trash ${activeId ? 'show' : ''} ${drop?.type === 'trash' ? 'over' : ''}`}><IconTrash size={30} /></div>
        )}

        <DragOverlay dropAnimation={null} className="drag-overlay">
          {activeItem && (
            <div className={`sbtn overlay ${isFolder(activeItem) ? 'folder' : ''} ${look.cols >= 4 && !openFolder ? 'dense' : ''}`}>
              {isFolder(activeItem) ? <FolderFace folder={activeItem} /> : <ButtonFace btn={activeItem} status={null} />}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <div className={`yt ${ev.ytVisible ? 'show' : ''}`}>
        <div className="yt-frame" ref={ytRef} />
        <button className="yt-stop" aria-label="정지" onClick={() => stop(true)}><IconPlayerStopFilled size={22} /></button>
      </div>

      {(ev.error || saveErr) && (
        <div className="toast" onClick={() => { clearError(); setSaveErr(false); }}>{ev.error ?? '서버에 저장하지 못했습니다'}</div>
      )}

      {editorFor && <Editor uid={uid} initial={editorFor.btn} onCancel={() => setEditorFor(null)} onSaved={onSaved} />}
      {settingsOpen && <Settings look={look} email={session.user.email ?? ''} onChange={setLook} onClose={() => setSettingsOpen(false)} />}
      {confirmDel && (
        <div className="modal-back" onClick={() => setConfirmDel(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <p>{isFolder(confirmDel)
              ? `‘${confirmDel.name}’ 폴더를 삭제할까요? 안의 버튼은 밖으로 나옵니다.`
              : `‘${confirmDel.name}’ 버튼을 삭제할까요?`}</p>
            <div className="row-end">
              <button onClick={() => setConfirmDel(null)}>취소</button>
              <button className="danger" onClick={() => doDelete(confirmDel)}>삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FolderName({ folder, onRename }: { folder: Folder; onRename: (f: Folder, name: string) => void }) {
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(folder.name);
  if (!edit) return <button className="folder-name" onClick={() => { setVal(folder.name); setEdit(true); }}>{folder.name}</button>;
  const done = () => { onRename(folder, val); setEdit(false); };
  return <input className="folder-name-input" autoFocus value={val} onChange={(e) => setVal(e.target.value)}
    onBlur={done} onKeyDown={(e) => e.key === 'Enter' && done()} />;
}

// 짧게 누르면 onTap, 꾹 누르면 편집 모드. 편집 모드에서는 끌기
function useTile(id: string, editing: boolean, onTap: () => void, onLong: () => void) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id, disabled: !editing });
  const timer = useRef(0);
  const fired = useRef(false);
  const startPt = useRef({ x: 0, y: 0 });
  const press = editing ? {} : {
    onPointerDown: (e: React.PointerEvent) => {
      fired.current = false;
      startPt.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => { fired.current = true; onLong(); }, 550);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (Math.hypot(e.clientX - startPt.current.x, e.clientY - startPt.current.y) > 10) clearTimeout(timer.current);
    },
    onPointerUp: () => clearTimeout(timer.current),
    onPointerCancel: () => clearTimeout(timer.current),
  };
  return {
    ref: setNodeRef,
    ...(editing ? { ...attributes, ...listeners } : press),
    onClick: () => { if (fired.current) { fired.current = false; return; } onTap(); },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}

interface TileProps { scope: string; editing: boolean; mark: string | null; dragging: boolean; onTap: () => void; onLong: () => void }

function SoundButton({ btn, status, scope, editing, mark, dragging, onTap, onLong }: TileProps & { btn: Btn; status: EngineView['status'] }) {
  const props = useTile(btn.id, editing, onTap, onLong);
  return (
    <button {...props} data-drop-id={btn.id} data-scope={scope}
      className={`sbtn ${status ?? ''} ${dragging ? 'dragging' : ''} ${mark ? 'drop-' + mark : ''}`}>
      <ButtonFace btn={btn} status={status} />
    </button>
  );
}

function ButtonFace({ btn, status }: { btn: Btn; status: EngineView['status'] }) {
  return (
    <>
      <span className="kind">{btn.source.kind === 'youtube' ? <IconBrandYoutube size={16} /> : <IconMusic size={16} />}</span>
      {status === 'loading' && <IconLoader2 className="spin" size={22} />}
      <span className="name">{btn.name}</span>
    </>
  );
}

function FolderTile({ folder, playing, scope, editing, mark, dragging, onTap, onLong }: TileProps & { folder: Folder; playing: boolean }) {
  const props = useTile(folder.id, editing, onTap, onLong);
  return (
    <button {...props} data-drop-id={folder.id} data-scope={scope}
      className={`sbtn folder ${playing ? 'playing' : ''} ${dragging ? 'dragging' : ''} ${mark ? 'drop-' + mark : ''}`}>
      <FolderFace folder={folder} />
    </button>
  );
}

function FolderFace({ folder }: { folder: Folder }) {
  return (
    <>
      <span className="mini">
        {folder.children.slice(0, 4).map((c) => <span key={c.id}>{c.name.slice(0, 2)}</span>)}
      </span>
      <span className="fname">{folder.name}</span>
    </>
  );
}
