import { unzip, type Unzipped } from 'fflate';

const AUDIO = /\.(mp3|m4a|wav|aac|ogg|oga|flac|opus)$/i;
const MIME: Record<string, string> = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', flac: 'audio/flac', opus: 'audio/ogg',
};

// 압축파일 안 이름 복원: UTF-8 표시가 없는 이름은 fflate가 latin1로 읽으므로
// 바이트로 되돌려 UTF-8(맥) → EUC-KR(윈도우) 순으로 다시 읽는다
function fixName(raw: string): string {
  if (!/[\u0080-ÿ]/.test(raw) || /[^\u0000-ÿ]/.test(raw)) return raw.normalize('NFC');
  const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).normalize('NFC'); } catch { /* UTF-8 아님 */ }
  try { return new TextDecoder('euc-kr').decode(bytes).normalize('NFC'); } catch { return raw; }
}

export interface ZipAudio { name: string; file: File }

// 압축파일 안 음원만 이름 순으로. 하위 폴더는 무시하고 한 곳에 모은다
export async function readZipAudio(zip: File): Promise<{ folderName: string; items: ZipAudio[] }> {
  const buf = new Uint8Array(await zip.arrayBuffer());
  const files = await new Promise<Unzipped>((res, rej) =>
    unzip(buf, { filter: (f) => AUDIO.test(f.name) && !/(^|\/)(__MACOSX\/|\._)/.test(f.name) }, (e, d) => (e ? rej(e) : res(d))));
  const items = Object.entries(files)
    .map(([path, data]) => {
      const base = fixName(path).split('/').pop()!;
      const ext = base.split('.').pop()!.toLowerCase();
      return { name: base.replace(/\.[^.]+$/, ''), file: new File([data], base, { type: MIME[ext] ?? 'audio/mpeg' }) };
    })
    .filter((x) => x.file.size > 0)
    .sort((a, b) => a.file.name.localeCompare(b.file.name, 'ko', { numeric: true }));
  return { folderName: zip.name.replace(/\.zip$/i, '').normalize('NFC') || '폴더', items };
}
