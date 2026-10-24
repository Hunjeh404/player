import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Session } from '@supabase/supabase-js';
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent, type DragMoveEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconPlus, IconSettings, IconTrash, IconBrandYoutube, IconMusic, IconLoader2, IconPlayerStopFilled, IconBrandGoogle } from '@tabler/icons-react';
import type { AppState, Btn, Look } from './types';
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

function Main({ session }: { session: Session }) {
  const uid = session.user.id;
  const [state, setState] = useState<AppState | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [saveErr, setSaveErr] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editorFor, setEditorFor] = useState<Btn | 'new' | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Btn | null>(null);
  const [dragging, setDragging] = useState(false);
  const [overTrash, setOverTrash] = useState(false);
  const trashRef = useRef<HTMLDivElement>(null);
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
    if (state?.buttons.some((b) => b.source.kind === 'youtube')) prepareYouTube().catch(() => {});
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
  const setLook = (l: Look) => setState({ ...state, look: l });
  const setButtons = (b: Btn[]) => setState((s) => (s ? { ...s, buttons: b } : s));

  const enterEdit = () => { stop(false); setEditing(true); navigator.vibrate?.(30); };

  // 손가락이 휴지통 위에 있는지(화면 좌표로 직접 판정)
  const pointerOnTrash = (e: DragMoveEvent | DragEndEvent) => {
    const a = e.activatorEvent as PointerEvent;
    const r = trashRef.current?.getBoundingClientRect();
    if (!r || a?.clientX === undefined) return false;
    const x = a.clientX + e.delta.x, y = a.clientY + e.delta.y;
    return x >= r.left - 12 && x <= r.right + 12 && y >= r.top - 12 && y <= r.bottom + 12;
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(false);
    setOverTrash(false);
    const { active, over } = e;
    if (pointerOnTrash(e)) { setConfirmDel(state.buttons.find((b) => b.id === active.id) ?? null); return; }
    if (!over) return;
    if (active.id !== over.id) {
      const from = state.buttons.findIndex((b) => b.id === active.id);
      const to = state.buttons.findIndex((b) => b.id === over.id);
      if (from >= 0 && to >= 0) setButtons(arrayMove(state.buttons, from, to));
    }
  };

  const doDelete = (b: Btn) => {
    if (ev.id === b.id) stop(false);
    setButtons(state.buttons.filter((x) => x.id !== b.id));
    if (b.source.kind === 'file') removeAudio(b.source.path);
    setConfirmDel(null);
  };

  const onSaved = (b: Btn, oldPath: string | null) => {
    const exists = state.buttons.some((x) => x.id === b.id);
    setButtons(exists ? state.buttons.map((x) => (x.id === b.id ? b : x)) : [...state.buttons, b]);
    if (oldPath && (b.source.kind !== 'file' || b.source.path !== oldPath)) removeAudio(oldPath);
    setEditorFor(null);
  };

  const vars = {
    '--bg': look.bg, '--fg': textOn(look.bg), '--btn': look.button, '--btn-fg': textOn(look.button), '--border': look.border,
    '--cols': look.cols, '--radius': look.shape === 'circle' ? '50%' : look.shape === 'rounded' ? '22%' : '6px',
  } as CSSProperties;

  return (
    <div className="app" style={vars}>
      <header>
        <h1>{editing ? '편집' : '음원재생기'}</h1>
        {editing
          ? <button className="done" onClick={() => setEditing(false)}>완료</button>
          : <button className="icon" aria-label="설정" onClick={() => setSettingsOpen(true)}><IconSettings size={26} /></button>}
      </header>
      {editing && <p className="hint">버튼을 눌러 설정 변경, 끌어서 순서 이동, 휴지통에 놓아 삭제</p>}

      <DndContext sensors={sensors} collisionDetection={closestCenter}
        onDragStart={() => setDragging(true)} onDragMove={(e) => setOverTrash(pointerOnTrash(e))}
        onDragCancel={() => { setDragging(false); setOverTrash(false); }} onDragEnd={onDragEnd}>
        <SortableContext items={state.buttons.map((b) => b.id)} strategy={rectSortingStrategy}>
          <div className={`grid ${editing ? 'editing' : ''} ${look.cols >= 4 ? 'dense' : ''}`}>
            {state.buttons.map((b) => (
              <SoundButton key={b.id} btn={b} editing={editing}
                status={ev.id === b.id ? ev.status : null}
                onTap={() => (editing ? setEditorFor(b) : toggle(b))}
                onLong={enterEdit} />
            ))}
            {!editing && (
              <button className="sbtn add" aria-label="추가" onClick={() => setEditorFor('new')}><IconPlus size={40} /></button>
            )}
          </div>
        </SortableContext>
        {editing && (
          <div ref={trashRef} className={`trash ${dragging ? 'show' : ''} ${overTrash ? 'over' : ''}`}><IconTrash size={30} /></div>
        )}
      </DndContext>

      <div className={`yt ${ev.ytVisible ? 'show' : ''}`}>
        <div className="yt-frame" ref={ytRef} />
        <button className="yt-stop" aria-label="정지" onClick={() => stop(true)}><IconPlayerStopFilled size={22} /></button>
      </div>

      {(ev.error || saveErr) && (
        <div className="toast" onClick={() => { clearError(); setSaveErr(false); }}>{ev.error ?? '서버에 저장하지 못했습니다'}</div>
      )}

      {editorFor && <Editor uid={uid} initial={editorFor === 'new' ? null : editorFor} onCancel={() => setEditorFor(null)} onSaved={onSaved} />}
      {settingsOpen && <Settings look={look} email={session.user.email ?? ''} onChange={setLook} onClose={() => setSettingsOpen(false)} />}
      {confirmDel && (
        <div className="modal-back" onClick={() => setConfirmDel(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <p>‘{confirmDel.name}’ 버튼을 삭제할까요?</p>
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

function SoundButton({ btn, editing, status, onTap, onLong }: {
  btn: Btn; editing: boolean; status: EngineView['status']; onTap: () => void; onLong: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: btn.id, disabled: !editing });
  const timer = useRef(0);
  const fired = useRef(false);
  const startPt = useRef({ x: 0, y: 0 });

  // 편집 모드가 아닐 때: 짧게 누르면 재생/정지, 꾹 누르면 편집 모드
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

  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined };
  return (
    <button
      ref={setNodeRef} style={style}
      className={`sbtn ${status ?? ''} ${isDragging ? 'dragging' : ''}`}
      {...(editing ? { ...attributes, ...listeners } : press)}
      onClick={() => { if (fired.current) { fired.current = false; return; } onTap(); }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="kind">{btn.source.kind === 'youtube' ? <IconBrandYoutube size={16} /> : <IconMusic size={16} />}</span>
      {status === 'loading' && <IconLoader2 className="spin" size={22} />}
      <span className="name">{btn.name}</span>
    </button>
  );
}
