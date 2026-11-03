import { defineConfig } from 'vitest/config';
import { localCottageAsset } from './scripts/local_cottage_asset.ts';

export default defineConfig({
  plugins: [localCottageAsset()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: { include: ['tests/unit/**/*.test.ts'] },
});
