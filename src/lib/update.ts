// 로그인할 때 서버의 version.json과 비교해 새 버전이면 받아서 다시 연다
export async function checkUpdate() {
  if (import.meta.env.DEV) return;
  try {
    const base = import.meta.env.BASE_URL;
    const r = await fetch(`${base}version.json?t=${Date.now()}`, { cache: 'no-store' });
    const { version } = await r.json();
    if (!version || version === __APP_VERSION__) return;
    if (sessionStorage.getItem('player-upd') === version) return; // 반복 새로고침 방지
    sessionStorage.setItem('player-upd', version);
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update().catch(() => {});
    location.replace(`${base}?v=${version}`);
  } catch { /* 오프라인 등 */ }
}
