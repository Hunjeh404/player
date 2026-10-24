import type { Btn } from '../types';
import { fetchAudio } from './supabase';

// 한 번에 하나만 재생. 단말 음원은 Web Audio(정확한 구간·페이드), 유튜브는 IFrame 플레이어.
export type Status = 'loading' | 'playing';
export interface EngineView { id: string | null; status: Status | null; ytVisible: boolean; error: string | null }

type Listener = (v: EngineView) => void;
let view: EngineView = { id: null, status: null, ytVisible: false, error: null };
const listeners = new Set<Listener>();
const emit = (patch: Partial<EngineView>) => { view = { ...view, ...patch }; listeners.forEach((l) => l(view)); };
export const subscribe = (l: Listener) => { listeners.add(l); l(view); return () => { listeners.delete(l); }; };

let token = 0; // 누를 때마다 증가. 늦게 끝난 로딩이 새 재생을 덮지 않도록
let stopCurrent: ((fade: boolean) => void) | null = null;

// 단일재생을 시작할 때 재생목록을 멈추게 하는 연결
let onSingleStart: (() => void) | null = null;
export function setOnSingleStart(f: () => void) { onSingleStart = f; }

export function toggle(btn: Btn) {
  if (view.id === btn.id) { stop(true); return; }
  onSingleStart?.();
  stop(false);
  const my = ++token;
  emit({ id: btn.id, status: 'loading', error: null, ...(btn.source.kind === 'file' ? { ytVisible: false } : {}) });
  const run = btn.source.kind === 'file' ? playFile(btn, my) : playYouTube(btn, my);
  run.catch((e) => {
    console.error(e);
    if (my === token) emit({ id: null, status: null, ytVisible: false, error: '재생하지 못했습니다' });
  });
}

export function stop(fade: boolean) {
  token++;
  const s = stopCurrent; stopCurrent = null;
  s?.(fade);
  emit({ id: null, status: null });
}

export function clearError() { emit({ error: null }); }
export function showError(msg: string) { emit({ error: msg }); }

// 재생목록에서 유튜브 곡 재생(끝나면 onEnd)
export function playForPlaylist(btn: Btn, onEnd: () => void, onError: () => void) {
  stop(false);
  const my = ++token;
  emit({ id: btn.id, status: 'loading', error: null });
  playYouTube(btn, my, onEnd).catch((e) => {
    console.error(e);
    if (my === token) { emit({ id: null, status: null, ytVisible: false }); onError(); }
  });
}
let ytPlayer: any = null;
export function ytPause() { ytPlayer?.pauseVideo(); }
export function ytResume() { ytPlayer?.playVideo(); }

// ---------- 단말 음원 ----------
let ctx: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>();

function audioCtx() {
  // 아이폰 무음 스위치가 켜져 있어도 소리가 나게(iOS 17 이상 Safari)
  const session = (navigator as any).audioSession;
  if (session && session.type !== 'playback') session.type = 'playback';
  if (!ctx) ctx = new AudioContext();
  if (ctx.state !== 'running') ctx.resume();
  return ctx;
}

async function playFile(btn: Btn, my: number) {
  if (btn.source.kind !== 'file') return;
  const c = audioCtx(); // 누른 순간(사용자 동작 안)에 열어야 소리가 남
  const path = btn.source.path;
  let buf = buffers.get(path);
  if (!buf) {
    const raw = await fetchAudio(path);
    buf = await c.decodeAudioData(raw);
    buffers.set(path, buf);
  }
  if (my !== token) return;

  const dur = buf.duration;
  const from = btn.clip.on ? Math.min(btn.clip.start, dur) : 0;
  const to = btn.clip.on && btn.clip.end > from ? Math.min(btn.clip.end, dur) : dur;
  const len = Math.max(0.05, to - from);
  const fi = btn.fadeIn.on ? Math.min(btn.fadeIn.sec, len) : 0;
  const fo = btn.fadeOut.on ? Math.min(btn.fadeOut.sec, len) : 0;

  const src = c.createBufferSource();
  src.buffer = buf;
  const gain = c.createGain();
  src.connect(gain).connect(c.destination);
  const t0 = c.currentTime + 0.03;
  const g = gain.gain;
  if (fi > 0) { g.setValueAtTime(0, t0); g.linearRampToValueAtTime(1, t0 + fi); } else g.setValueAtTime(1, t0);
  if (fo > 0) { g.setValueAtTime(1, Math.max(t0 + fi, t0 + len - fo)); g.linearRampToValueAtTime(0, t0 + len); }
  src.start(t0, from, len);

  const mine = my;
  src.onended = () => { if (mine === token) { stopCurrent = null; emit({ id: null, status: null }); } };
  stopCurrent = (fade) => {
    const now = c.currentTime;
    const sec = fade && btn.fadeOut.on ? btn.fadeOut.sec : 0;
    g.cancelScheduledValues(now);
    if (sec > 0) { g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + sec); src.stop(now + sec); }
    else src.stop();
  };
  emit({ status: 'playing' });
}

// ---------- 유튜브 ----------
declare global { interface Window { YT: any; onYouTubeIframeAPIReady?: () => void } }

export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\.|^m\.|^music\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1, 12) || null;
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const v = u.searchParams.get('v');
      if (v) return v.slice(0, 11);
      const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([\w-]{11})/);
      if (m) return m[2];
    }
  } catch { /* 주소 아님 */ }
  return null;
}

let ytReady: Promise<any> | null = null;
let ytHost: HTMLElement | null = null;
export function setYouTubeHost(el: HTMLElement | null) { ytHost = el; }

export function prepareYouTube(): Promise<any> {
  if (ytReady) return ytReady;
  ytReady = new Promise((resolve, reject) => {
    const make = () => {
      if (!ytHost) { reject(new Error('no host')); return; }
      const div = document.createElement('div');
      ytHost.appendChild(div);
      const p = new window.YT.Player(div, {
        width: '100%', height: '100%',
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
        events: { onReady: () => { ytPlayer = p; resolve(p); }, onStateChange: (e: any) => ytStateHandler?.(e.data) },
      });
    };
    if (window.YT?.Player) make();
    else {
      window.onYouTubeIframeAPIReady = make;
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => reject(new Error('youtube api'));
      document.head.appendChild(s);
    }
  });
  ytReady.catch(() => { ytReady = null; });
  return ytReady;
}

let ytStateHandler: ((s: number) => void) | null = null;
let ytSession = 0; // 새 유튜브 재생이 시작되면 이전 재생의 타이머는 손을 뗀다
let ytTimer = 0;

async function playYouTube(btn: Btn, my: number, onEnd?: () => void) {
  if (btn.source.kind !== 'youtube') return;
  emit({ ytVisible: true });
  const p = await prepareYouTube();
  if (my !== token) return;
  clearInterval(ytTimer);
  const session = ++ytSession;

  const from = btn.clip.on ? btn.clip.start : 0;
  const hasEnd = btn.clip.on && btn.clip.end > from;
  p.setVolume(btn.fadeIn.on ? 0 : 100);
  p.unMute();
  p.loadVideoById({ videoId: btn.source.videoId, startSeconds: from, ...(hasEnd ? { endSeconds: btn.clip.end } : {}) });

  let fading = false;
  const finish = () => {
    clearInterval(ytTimer);
    ytStateHandler = null;
    if (my === token) { stopCurrent = null; emit({ id: null, status: null, ytVisible: false }); onEnd?.(); }
  };
  ytStateHandler = (s) => {
    if (s === 1 && my === token) emit({ status: 'playing' });
    if (s === 0) finish(); // 끝
  };
  // 페이드인·페이드아웃 볼륨 조절
  ytTimer = window.setInterval(() => {
    if (fading || p.getPlayerState?.() !== 1) return;
    const t = p.getCurrentTime();
    const end = hasEnd ? btn.clip.end : p.getDuration();
    let k = 1;
    if (btn.fadeIn.on && btn.fadeIn.sec > 0) k = Math.min(k, Math.max(0, (t - from) / btn.fadeIn.sec));
    if (btn.fadeOut.on && btn.fadeOut.sec > 0 && end > 0) k = Math.min(k, Math.max(0, (end - t) / btn.fadeOut.sec));
    p.setVolume(Math.round(k * 100));
  }, 100);

  stopCurrent = (fade) => {
    const sec = fade && btn.fadeOut.on ? btn.fadeOut.sec : 0;
    ytStateHandler = null;
    const done = () => {
      clearInterval(ytTimer);
      if (session !== ytSession) return;
      p.stopVideo();
      emit({ ytVisible: false });
    };
    if (sec <= 0) { done(); return; }
    fading = true;
    const v0 = p.getVolume();
    const s0 = performance.now();
    clearInterval(ytTimer);
    ytTimer = window.setInterval(() => {
      const k = 1 - (performance.now() - s0) / (sec * 1000);
      if (k <= 0) done(); else p.setVolume(Math.round(v0 * k));
    }, 50);
  };
}
