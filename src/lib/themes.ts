import type { Look } from '../types';

// 팬톤 '올해의 색' 계열을 참고한 근사색 테마(공식 색이 아님)
export interface Theme { id: string; name: string; bg: string; button: string; border: string }

export const THEMES: Theme[] = [
  { id: 'cloud', name: '구름 흰색', bg: '#F0EEE9', button: '#FFFFFF', border: '#B9B3A8' },
  { id: 'mocha', name: '모카', bg: '#3B2C25', button: '#A47864', border: '#E3CBB8' },
  { id: 'peach', name: '복숭아', bg: '#FFF1E8', button: '#FFBE98', border: '#D9825B' },
  { id: 'magenta', name: '마젠타', bg: '#2A0E17', button: '#BB2649', border: '#F2A1B3' },
  { id: 'peri', name: '페리윙클', bg: '#E8E8F6', button: '#6667AB', border: '#3E3F7A' },
  { id: 'sun', name: '햇살과 회색', bg: '#939597', button: '#F5DF4D', border: '#4A4B4D' },
  { id: 'blue', name: '깊은 파랑', bg: '#0A2A47', button: '#0F4C81', border: '#9CC3E6' },
  { id: 'coral', name: '산호', bg: '#FFF3F1', button: '#FF6F61', border: '#B8443A' },
  { id: 'violet', name: '보라', bg: '#221B33', button: '#5F4B8B', border: '#C7B8E8' },
  { id: 'green', name: '새싹', bg: '#F1F6EA', button: '#88B04B', border: '#4F6B25' },
  { id: 'rose', name: '장미와 하늘', bg: '#92A8D1', button: '#F7CAC9', border: '#5A6F99' },
  { id: 'wine', name: '와인', bg: '#2B1516', button: '#955251', border: '#E0B3AF' },
];

export const DEFAULT_LOOK: Look = { themeId: 'blue', bg: '#0A2A47', button: '#0F4C81', border: '#9CC3E6', shape: 'rounded' };

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}
// 배경 밝기에 따라 글자색(검정/흰색)
export function textOn(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#1A1A1A' : '#FFFFFF';
}
