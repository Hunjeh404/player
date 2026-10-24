export type Shape = 'circle' | 'rounded' | 'square';

export type Source =
  | { kind: 'file'; path: string; fileName: string }
  | { kind: 'youtube'; url: string; videoId: string };

export interface Btn {
  id: string;
  name: string;
  source: Source;
  clip: { on: boolean; start: number; end: number };
  fadeIn: { on: boolean; sec: number };
  fadeOut: { on: boolean; sec: number };
}

export interface Look {
  themeId: string | null;
  bg: string;
  button: string;
  border: string;
  shape: Shape;
}

export interface AppState {
  look: Look;
  buttons: Btn[];
}
