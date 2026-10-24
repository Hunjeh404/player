import { useRef, useState } from 'react';
import type { Btn, Source } from './types';
import { uploadAudio } from './lib/supabase';
import { parseYouTubeId } from './lib/engine';
import { parseTime, formatTime } from './lib/time';

interface Props { uid: string; initial: Btn | null; onCancel: () => void; onSaved: (b: Btn, oldPath: string | null) => void }

export default function Editor({ uid, initial, onCancel, onSaved }: Props) {
  const [kind, setKind] = useState<Source['kind']>(initial?.source.kind ?? 'file');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState(initial?.source.kind === 'youtube' ? initial.source.url : '');
  const [name, setName] = useState(initial?.name ?? '');
  const [clipOn, setClipOn] = useState(initial?.clip.on ?? false);
  const [start, setStart] = useState(initial?.clip.on ? formatTime(initial.clip.start) : '');
  const [end, setEnd] = useState(initial?.clip.on ? formatTime(initial.clip.end) : '');
  const [fiOn, setFiOn] = useState(initial?.fadeIn.on ?? false);
  const [fi, setFi] = useState(String(initial?.fadeIn.sec ?? 2));
  const [foOn, setFoOn] = useState(initial?.fadeOut.on ?? false);
  const [fo, setFo] = useState(String(initial?.fadeOut.sec ?? 2));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const oldFile = initial?.source.kind === 'file' ? initial.source : null;
  const fileLabel = file?.name ?? oldFile?.fileName ?? '선택한 파일 없음';

  const save = async () => {
    setErr('');
    if (!name.trim()) return setErr('이름을 입력해 주세요');
    let videoId = '';
    if (kind === 'youtube') {
      videoId = parseYouTubeId(url) ?? '';
      if (!videoId) return setErr('유튜브 주소를 확인해 주세요');
    } else if (!file && !oldFile) return setErr('음원 파일을 선택해 주세요');
    if (file && file.size > 50 * 1024 * 1024) return setErr('파일은 50MB까지 올릴 수 있습니다');

    const s = clipOn ? parseTime(start) : 0;
    const e = clipOn ? parseTime(end) : 0;
    if (clipOn && (s === null || e === null)) return setErr('재생 구간은 83 또는 1:23처럼 입력해 주세요');
    if (clipOn && e! <= s!) return setErr('끝 시간이 시작 시간보다 커야 합니다');
    const fiSec = parseFloat(fi), foSec = parseFloat(fo);
    if (fiOn && !(fiSec > 0)) return setErr('페이드인 시간을 확인해 주세요');
    if (foOn && !(foSec > 0)) return setErr('페이드아웃 시간을 확인해 주세요');

    setBusy(true);
    try {
      let source: Source;
      if (kind === 'youtube') source = { kind: 'youtube', url: url.trim(), videoId };
      else if (file) source = { kind: 'file', path: await uploadAudio(uid, file), fileName: file.name };
      else source = oldFile!;
      onSaved({
        id: initial?.id ?? crypto.randomUUID(),
        name: name.trim(),
        source,
        clip: { on: clipOn, start: clipOn ? s! : 0, end: clipOn ? e! : 0 },
        fadeIn: { on: fiOn, sec: fiOn ? fiSec : initial?.fadeIn.sec ?? 2 },
        fadeOut: { on: foOn, sec: foOn ? foSec : initial?.fadeOut.sec ?? 2 },
      }, oldFile?.path ?? null);
    } catch (x) {
      console.error(x);
      setErr('파일을 올리지 못했습니다');
      setBusy(false);
    }
  };

  return (
    <div className="modal-back">
      <div className="sheet">
        <h2>{initial ? '버튼 수정' : '버튼 추가'}</h2>

        <div className="seg">
          <button className={kind === 'file' ? 'on' : ''} onClick={() => setKind('file')}>단말 음원</button>
          <button className={kind === 'youtube' ? 'on' : ''} onClick={() => setKind('youtube')}>유튜브</button>
        </div>

        {kind === 'file' ? (
          <div className="field">
            <button className="pick" onClick={() => fileInput.current?.click()}>음원 선택</button>
            <span className="filename">{fileLabel}</span>
            <input ref={fileInput} type="file" accept="audio/*" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        ) : (
          <label className="field col">
            <span>유튜브 주소</span>
            <input type="url" inputMode="url" placeholder="https://youtu.be/..." value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
        )}

        <label className="field col">
          <span>이름</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="check"><input type="checkbox" checked={clipOn} onChange={(e) => setClipOn(e.target.checked)} />재생 구간</label>
        {clipOn && (
          <div className="field sub">
            <input className="time" inputMode="decimal" placeholder="시작 0:10" value={start} onChange={(e) => setStart(e.target.value)} />
            <span>부터</span>
            <input className="time" inputMode="decimal" placeholder="끝 1:30" value={end} onChange={(e) => setEnd(e.target.value)} />
            <span>까지</span>
          </div>
        )}

        <label className="check"><input type="checkbox" checked={fiOn} onChange={(e) => setFiOn(e.target.checked)} />페이드인</label>
        {fiOn && (
          <div className="field sub"><input className="time" inputMode="decimal" value={fi} onChange={(e) => setFi(e.target.value)} /><span>초</span></div>
        )}

        <label className="check"><input type="checkbox" checked={foOn} onChange={(e) => setFoOn(e.target.checked)} />페이드아웃</label>
        {foOn && (
          <div className="field sub"><input className="time" inputMode="decimal" value={fo} onChange={(e) => setFo(e.target.value)} /><span>초</span></div>
        )}

        {err && <p className="err">{err}</p>}
        <div className="row-end">
          <button onClick={onCancel} disabled={busy}>취소</button>
          <button className="primary" onClick={save} disabled={busy}>{busy ? '올리는 중…' : '저장'}</button>
        </div>
      </div>
    </div>
  );
}
