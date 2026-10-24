import { useEffect, useState } from 'react';
import { IconPlayerPlayFilled, IconPlayerPauseFilled, IconPlayerSkipForwardFilled, IconBrandYoutube, IconMusic, IconLoader2 } from '@tabler/icons-react';
import type { Btn } from './types';
import * as engine from './lib/engine';
import * as player from './lib/playlist';

// 탭 바 바로 위 재생바: 곡 이름, 재생/일시정지, 다음 곡(재생목록), 위 경계의 진행 막대
export default function MiniPlayer({ ev, pv, findBtn, raised }: {
  ev: engine.EngineView; pv: player.PlView; findBtn: (id: string) => Btn | null; raised: boolean;
}) {
  const [, setTick] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const active = !!pv.playlistId || !!ev.id;

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [active]);

  if (!active) return null;
  const isList = !!pv.playlistId;
  const info = isList ? player.now() : engine.now();
  const btn = info?.btn ?? (ev.id ? findBtn(ev.id) : null);
  if (!btn) return null;
  const sub = isList ? (info as ReturnType<typeof player.now>)?.playlistName ?? '' : '단일재생';
  const loading = isList ? pv.loading : ev.status === 'loading';
  const paused = isList ? !pv.playing : ev.paused;
  const start = info?.start ?? 0;
  const end = info && info.end > start ? info.end : start + 1;
  const pos = drag ?? Math.max(start, Math.min(end, info?.pos ?? start));

  const toggle = () => {
    if (isList) { if (paused) player.resume(); else player.pause(); }
    else if (paused) engine.resume(); else engine.pause();
  };
  const commit = () => {
    if (drag === null) return;
    if (isList) player.seek(drag); else engine.seek(drag);
    setDrag(null);
  };

  return (
    <div className={`mini-player ${raised ? 'raised' : ''}`}>
      <input className="mp-progress" type="range" aria-label="재생 위치" min={start} max={end} step={0.1} value={pos}
        disabled={!info || info.end <= start}
        style={{ '--p': `${((pos - start) / (end - start)) * 100}%` } as React.CSSProperties}
        onChange={(e) => setDrag(+e.target.value)}
        onPointerUp={commit} onTouchEnd={commit} onKeyUp={commit} onBlur={commit} />
      <div className="mp-row">
        <span className="mp-kind">{loading ? <IconLoader2 className="spin" size={20} /> : btn.source.kind === 'youtube' ? <IconBrandYoutube size={20} /> : <IconMusic size={20} />}</span>
        <span className="mp-text">
          <span className="mp-title">{btn.name}</span>
          <span className="mp-sub">{sub}</span>
        </span>
        <button className="mp-btn" aria-label={paused ? '재생' : '일시정지'} onClick={toggle} disabled={loading}>
          {paused ? <IconPlayerPlayFilled size={26} /> : <IconPlayerPauseFilled size={26} />}
        </button>
        {isList && <button className="mp-btn" aria-label="다음 곡" onClick={player.next}><IconPlayerSkipForwardFilled size={24} /></button>}
      </div>
    </div>
  );
}
