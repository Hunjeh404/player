import { useState } from 'react';
import type { Look, Shape } from './types';
import { THEMES, hexToRgb, rgbToHex } from './lib/themes';
import { supabase } from './lib/supabase';

interface Props { look: Look; email: string; onChange: (l: Look) => void; onClose: () => void }

const SHAPES: { id: Shape; name: string }[] = [
  { id: 'circle', name: '원형' }, { id: 'rounded', name: '둥근 사각' }, { id: 'square', name: '사각' },
];
type ColorKey = 'bg' | 'button' | 'border';
const COLORS: { key: ColorKey; name: string }[] = [
  { key: 'bg', name: '배경색' }, { key: 'button', name: '버튼색' }, { key: 'border', name: '버튼 테두리색' },
];

export default function Settings({ look, email, onChange, onClose }: Props) {
  const [open, setOpen] = useState<ColorKey | null>(null);

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>설정</h2>

        <h3>테마</h3>
        <div className="themes">
          {THEMES.map((t) => (
            <button key={t.id} className={`theme ${look.themeId === t.id ? 'on' : ''}`}
              onClick={() => onChange({ ...look, themeId: t.id, bg: t.bg, button: t.button, border: t.border })}>
              <span className="swatch" style={{ background: t.bg }}>
                <span style={{ background: t.button, borderColor: t.border }} />
              </span>
              <span className="tname">{t.name}</span>
            </button>
          ))}
        </div>

        <h3>개별 색상</h3>
        {COLORS.map(({ key, name }) => (
          <div key={key} className="color-row">
            <button className="color-head" onClick={() => setOpen(open === key ? null : key)}>
              <span className="chip" style={{ background: look[key] }} />
              <span>{name}</span>
              <span className="rgbtext">{hexToRgb(look[key]).join(', ')}</span>
            </button>
            {open === key && (
              <Rgb value={look[key]} onChange={(hex) => onChange({ ...look, themeId: null, [key]: hex })} />
            )}
          </div>
        ))}

        <h3>버튼 모양</h3>
        <div className="seg">
          {SHAPES.map((s) => (
            <button key={s.id} className={look.shape === s.id ? 'on' : ''} onClick={() => onChange({ ...look, shape: s.id })}>{s.name}</button>
          ))}
        </div>

        <h3>계정</h3>
        <div className="field">
          <span className="filename">{email}</span>
          <button onClick={() => supabase.auth.signOut()}>로그아웃</button>
        </div>

        <div className="row-end"><button className="primary" onClick={onClose}>닫기</button></div>
      </div>
    </div>
  );
}

function Rgb({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const rgb = hexToRgb(value);
  const set = (i: number, v: number) => { const n = [...rgb] as [number, number, number]; n[i] = Number.isFinite(v) ? v : 0; onChange(rgbToHex(...n)); };
  return (
    <div className="rgb">
      {['R', 'G', 'B'].map((label, i) => (
        <div key={label} className="rgb-line">
          <span>{label}</span>
          <input type="range" min={0} max={255} value={rgb[i]} onChange={(e) => set(i, +e.target.value)} />
          <input type="number" min={0} max={255} inputMode="numeric" value={rgb[i]} onChange={(e) => set(i, Math.min(255, Math.max(0, +e.target.value)))} />
        </div>
      ))}
    </div>
  );
}
