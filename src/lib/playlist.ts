import type { Btn, Playlist } from '../types';
import { fetchAudio, signedUrls } from './supabase';
import * as engine from './engine';

// 재생목록 재생기. 단말 음원은 일반 오디오(<audio>)로 재생해야 화면이 꺼져도 이어진다.
// 유튜브 곡은 단일재생과 같은 유튜브 플레이어를 쓴다(백그라운드 재생 불가).
export interface PlView { playlistId: string | null; key: string | null; playing: boolean; loading: boolean }

type Listener = (v: PlView) => void;
let view: PlView = { playlistId: null, key: null, playing: false, loading: false };
const listeners = new Set<Listener>();
const emit = (patch: Partial<PlView>) => { view = { ...view, ...patch }; listeners.forEach((l) => l(view)); };
export const isActive = () => !!view.playlistId;
export const subscribe = (l: Listener) => { listeners.add(l); l(view); return () => { listeners.delete(l); }; };

type Data = { playlists: Playlist[]; findBtn: (id: string) => Btn | null };
let getData: () => Data = () => ({ playlists: [], findBtn: () => null });
export function connect(f: () => Data) { getData = f; }

engine.setOnSingleStart(() => { if (view.playlistId) stop(); });

let audio: HTMLAudioElement | null = null;
let unlocked = false;
let token = 0;
let cur: Btn | null = null;
let kind: 'file' | 'youtube' | null = null;
let history: string[] = [];
let queue: string[] = []; // 랜덤 재생에서 이번 바퀴에 아직 안 나온 곡
let endedFor = -1;
let fadeTimer = 0;
const urls = new Map<string, string>();
const signed = new Map<string, { url: string; at: number }>();

// 재생목록을 열 때 음원 임시 주소를 미리 받아 둔다
export async function prepare(p: Playlist) {
  const paths = p.items
    .map((e) => getData().findBtn(e.btnId))
    .flatMap((b) => (b?.source.kind === 'file' ? [b.source.path] : []))
    .filter((path) => !urls.has(path) && !(signed.get(path) && Date.now() - signed.get(path)!.at < 5 * 3600e3));
  const got = await signedUrls([...new Set(paths)]);
  for (const [path, url] of Object.entries(got)) signed.set(path, { url, at: Date.now() });
}
function readyUrl(path: string): string | null {
  const s = signed.get(path);
  return urls.get(path) ?? (s && Date.now() - s.at < 5.5 * 3600e3 ? s.url : null);
}

const pl = () => getData().playlists.find((p) => p.id === view.playlistId) ?? null;
const keysOf = (p: Playlist) => p.items.map((e) => e.key);
const btnOf = (p: Playlist, key: string) => {
  const e = p.items.find((x) => x.key === key);
  return e ? getData().findBtn(e.btnId) : null;
};
function shuffled<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

// 아주 짧은 무음. 누른 순간 한 번 재생해 두면 이후 곡 전환에 사용자 동작이 필요 없다(아이폰)
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

function media() {
  if (!audio) {
    audio = new Audio();
    audio.preload = 'auto';
    audio.addEventListener('timeupdate', tick);
    audio.addEventListener('ended', () => { if (kind === 'file' && unlocked && audio!.src !== SILENT) trackEnded(); });
  }
  return audio;
}
function unlock() {
  const a = media();
  if (unlocked) return;
  unlocked = true;
  a.src = SILENT;
  a.play().catch(() => {});
}

async function urlFor(path: string) {
  let u = urls.get(path);
  if (!u) { u = URL.createObjectURL(new Blob([await fetchAudio(path)])); urls.set(path, u); }
  return u;
}

// 구간 끝 확인과 페이드(아이폰은 볼륨을 바꿀 수 없어 페이드가 적용되지 않음)
function tick() {
  const a = audio;
  if (kind !== 'file' || !cur || !a || a.paused) return;
  const t = a.currentTime;
  const from = cur.clip.on ? cur.clip.start : 0;
  const end = cur.clip.on && cur.clip.end > from ? Math.min(cur.clip.end, a.duration || Infinity) : a.duration;
  let k = 1;
  if (cur.fadeIn.on && cur.fadeIn.sec > 0) k = Math.min(k, Math.max(0, (t - from) / cur.fadeIn.sec));
  if (cur.fadeOut.on && cur.fadeOut.sec > 0 && end > 0) k = Math.min(k, Math.max(0, (end - t) / cur.fadeOut.sec));
  a.volume = Math.max(0, Math.min(1, k));
  if (cur.clip.on && end > 0 && t >= end) trackEnded();
}

function stopMedia() {
  clearInterval(fadeTimer);
  if (kind === 'file' && audio) audio.pause();
  if (kind === 'youtube') engine.stop(false);
  kind = null;
}

export function playFrom(playlistId: string, key?: string) {
  const p = getData().playlists.find((x) => x.id === playlistId);
  if (!p || !p.items.length) return;
  const session = (navigator as any).audioSession; // 아이폰: 백그라운드·무음 모드에서도 재생
  if (session && session.type !== 'playback') session.type = 'playback';
  engine.stop(false); // 단일재생 정지
  const keys = keysOf(p);
  const k = key ?? (p.shuffle ? keys[Math.floor(Math.random() * keys.length)] : keys[0]);
  history = [];
  queue = p.shuffle ? shuffled(keys.filter((x) => x !== k)) : [];
  emit({ playlistId });
  start(k);
}

async function start(key: string) {
  const my = ++token;
  const p = pl();
  if (!p) return stop();
  const btn = btnOf(p, key);
  if (!btn) return stop();
  stopMedia();
  cur = btn;
  emit({ key, loading: true, playing: true });
  setMeta(btn, p);

  if (btn.source.kind === 'youtube') {
    kind = 'youtube';
    engine.playForPlaylist(btn, () => { if (my === token) trackEnded(); }, () => {
      if (my === token) { stop(); engine.showError('유튜브 곡을 재생하지 못했습니다'); }
    });
    emit({ loading: false });
    return;
  }

  kind = 'file';
  const a = media();
  const from = btn.clip.on ? btn.clip.start : 0;
  const direct = readyUrl(btn.source.path);
  if (direct) {
    // 주소가 준비돼 있으면 기다리지 않고 바로 재생(누른 동작 안에서 시작해야 아이폰이 백그라운드에서 멈추지 않음)
    unlocked = true;
    a.src = from > 0 ? `${direct}#t=${from}` : direct;
    a.volume = btn.fadeIn.on ? 0 : 1;
    a.onloadedmetadata = () => { if (my === token && Math.abs(a.currentTime - from) > 0.3) a.currentTime = from; };
    a.onerror = null;
    a.play().then(() => {
      if (my !== token) { a.pause(); return; }
      endedFor = -1;
      clearInterval(fadeTimer);
      fadeTimer = window.setInterval(tick, 100);
      emit({ loading: false, playing: true });
      prefetchNext();
    }).catch((e) => {
      console.error(e);
      if (my === token) { stop(); engine.showError('재생하지 못했습니다'); }
    });
    return;
  }
  unlock();
  try {
    const url = await urlFor(btn.source.path);
    if (my !== token) return;
    a.src = url;
    await new Promise<void>((res, rej) => {
      a.onloadedmetadata = () => res();
      a.onerror = () => rej(new Error('load'));
    });
    if (my !== token) return;
    a.currentTime = btn.clip.on ? btn.clip.start : 0;
    a.volume = btn.fadeIn.on ? 0 : 1;
    await a.play();
    if (my !== token) { a.pause(); return; }
    endedFor = -1;
    clearInterval(fadeTimer);
    fadeTimer = window.setInterval(tick, 100); // 화면 켜져 있을 때 부드러운 페이드
    emit({ loading: false, playing: true });
    prefetchNext();
  } catch (e) {
    console.error(e);
    if (my === token) { stop(); engine.showError('재생하지 못했습니다'); }
  }
}

function trackEnded() {
  if (endedFor === token) return; // 한 곡에 한 번만
  endedFor = token;
  const p = pl();
  if (!p || !view.key) return stop();
  if (p.repeat === 'one') { start(view.key); return; }
  goNext(true);
}

function peekNext(p: Playlist, curKey: string): { key: string | null; refill: string[] | null } {
  const keys = keysOf(p);
  if (!p.shuffle) {
    const i = keys.indexOf(curKey);
    if (i >= 0 && i + 1 < keys.length) return { key: keys[i + 1], refill: null };
    return { key: p.repeat === 'all' && keys.length ? keys[0] : null, refill: null };
  }
  const q = queue.filter((k) => keys.includes(k));
  if (q.length) return { key: q[0], refill: q };
  if (p.repeat !== 'all') return { key: null, refill: null };
  const fresh = shuffled(keys.filter((k) => k !== curKey));
  if (!fresh.length) return { key: keys.length ? curKey : null, refill: [] };
  return { key: fresh[0], refill: fresh };
}

function goNext(auto: boolean) {
  const p = pl();
  if (!p || !view.key) return;
  const { key, refill } = peekNext(p, view.key);
  if (!key) { if (auto) stop(); else stop(); return; }
  if (refill) queue = refill.slice(1);
  history.push(view.key);
  start(key);
}

export function next() { goNext(false); }

// 재생바용
export function now(): (engine.Now & { playlistName: string }) | null {
  const p = pl();
  if (!p || !cur) return null;
  if (kind === 'file' && audio) {
    const from = cur.clip.on ? cur.clip.start : 0;
    const d = audio.duration || 0;
    const end = cur.clip.on && cur.clip.end > from ? Math.min(cur.clip.end, d || Infinity) : d;
    return { btn: cur, pos: audio.currentTime, start: from, end, paused: !view.playing, playlistName: p.name };
  }
  if (kind === 'youtube') return { btn: cur, ...engine.ytPos(), paused: !view.playing, playlistName: p.name };
  return { btn: cur, pos: 0, start: 0, end: 0, paused: !view.playing, playlistName: p.name };
}

export function seek(t: number) {
  if (kind === 'file' && audio) audio.currentTime = t;
  else if (kind === 'youtube') engine.ytSeek(t);
}

export function prev() {
  const p = pl();
  if (!p || !view.key) return;
  if (kind === 'file' && audio && cur) {
    const from = cur.clip.on ? cur.clip.start : 0;
    if (audio.currentTime - from > 3) { audio.currentTime = from; return; }
  }
  const h = history.pop();
  if (h && p.items.some((e) => e.key === h)) { if (p.shuffle) queue.unshift(view.key); start(h); return; }
  const keys = keysOf(p);
  const i = keys.indexOf(view.key);
  start(i > 0 ? keys[i - 1] : view.key);
}

export function pause() {
  if (kind === 'file') audio?.pause();
  if (kind === 'youtube') engine.ytPause();
  emit({ playing: false });
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
}

export function resume() {
  if (!view.key) return;
  if (kind === 'file') audio?.play().catch(() => {});
  else if (kind === 'youtube') engine.ytResume();
  else { start(view.key); return; }
  emit({ playing: true });
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
}

export function stop() {
  token++;
  stopMedia();
  cur = null;
  emit({ playlistId: null, key: null, playing: false, loading: false });
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
}

// 랜덤을 켜면 남은 곡을 새로 섞는다
export function reshuffle() {
  const p = pl();
  if (p && view.key) queue = shuffled(keysOf(p).filter((k) => k !== view.key));
}

async function prefetchNext() {
  const p = pl();
  if (!p || !view.key) return;
  const k = peekNext(p, view.key).key;
  const b = k ? btnOf(p, k) : null;
  if (b?.source.kind === 'file') urlFor(b.source.path).catch(() => {});
}

// 잠금화면·이어폰 조작
function setMeta(btn: Btn, p: Playlist) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({ title: btn.name, artist: p.name, album: '음원재생기' });
  navigator.mediaSession.playbackState = 'playing';
}
if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  const set = (a: MediaSessionAction, f: () => void) => { try { ms.setActionHandler(a, f); } catch { /* 지원 안 함 */ } };
  set('play', () => resume());
  set('pause', () => pause());
  set('nexttrack', () => next());
  set('previoustrack', () => prev());
}
