import { createClient } from '@supabase/supabase-js';
import type { AppState } from '../types';
import { DEFAULT_LOOK } from './themes';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_KEY as string;

export const supabase = createClient(url, key, {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const BUCKET = 'player-audio';

export async function loadState(uid: string): Promise<AppState> {
  const { data, error } = await supabase.from('player_state').select('data').eq('user_id', uid).maybeSingle();
  if (error) throw error;
  const d = data?.data as Partial<AppState> | undefined;
  return { look: { ...DEFAULT_LOOK, ...(d?.look ?? {}) }, buttons: d?.buttons ?? [] };
}

export async function saveState(uid: string, state: AppState) {
  const { error } = await supabase.from('player_state').upsert({ user_id: uid, data: state, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function uploadAudio(uid: string, file: File): Promise<string> {
  const ext = (file.name.split('.').pop() || 'audio').toLowerCase().replace(/[^a-z0-9]/g, '') || 'audio';
  const path = `${uid}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'audio/mpeg' });
  if (error) throw error;
  return path;
}

export async function removeAudio(path: string) {
  await supabase.storage.from(BUCKET).remove([path]);
  try { (await caches.open('player-audio')).delete(cacheKey(path)); } catch { /* 캐시 없음 */ }
}

const cacheKey = (path: string) => `${location.origin}/__audio/${path}`;

// 한 번 받은 음원은 기기에 저장해 두고 다음부터 바로 재생
export async function fetchAudio(path: string): Promise<ArrayBuffer> {
  let cache: Cache | null = null;
  try { cache = await caches.open('player-audio'); } catch { /* 캐시 사용 불가 */ }
  const hit = await cache?.match(cacheKey(path));
  if (hit) return hit.arrayBuffer();
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw error ?? new Error('download failed');
  const buf = await data.arrayBuffer();
  cache?.put(cacheKey(path), new Response(buf.slice(0))).catch(() => {});
  return buf;
}
