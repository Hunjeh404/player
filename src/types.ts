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

export interface Folder {
  id: string;
  kind: 'folder';
  name: string;
  children: Btn[];
}

export type Item = Btn | Folder;

export interface Look {
  themeId: string | null;
  bg: string;
  button: string;
  border: string;
  shape: Shape;
  cols: number;
}

export interface AppState {
  look: Look;
  buttons: Item[]; // 버튼과 폴더(폴더 안에는 버튼만)
}
