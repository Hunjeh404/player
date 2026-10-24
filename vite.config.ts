import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 빌드마다 새 버전 번호. 앱이 로그인할 때 version.json과 비교해 자동 업데이트한다.
const version = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

export default defineConfig({
  base: '/player/',
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    react(),
    {
      name: 'version-json',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version }) });
      },
    },
  ],
  build: { target: 'es2020' },
});
