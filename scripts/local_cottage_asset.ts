import { createReadStream, readFileSync, statSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

/** One explicit local read-only asset alias. No binary copy or general directory exposure. */
export function localCottageAsset(): Plugin {
  const install = (root: string, use: (handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void): void => {
    const config = JSON.parse(readFileSync(resolve(root, 'art-source/tripo/cottage-candidate-01.json'), 'utf8')) as { sourceFile: string; localUrl: string };
    const directory = resolve(root, 'art-source/tripo/inbox'), file = resolve(root, config.sourceFile), within = relative(directory, file);
    if (within.startsWith('..') || isAbsolute(within) || !file.endsWith('.glb')) throw new Error('Cottage source must stay in the agreed local inbox');
    use((req, res, next) => {
      if (req.url?.split('?')[0] !== config.localUrl) return next();
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.end('Read-only local asset'); return; }
      try {
        const stat = statSync(file);
        if (!stat.isFile()) throw new Error('Not a file');
        res.setHeader('Content-Type', 'model/gltf-binary'); res.setHeader('Content-Length', stat.size); res.setHeader('Cache-Control', 'no-store');
        if (req.method === 'HEAD') { res.end(); return; }
        const stream = createReadStream(file);
        stream.on('error', () => { if (!res.headersSent) res.statusCode = 500; res.end(); });
        res.on('close', () => stream.destroy()); stream.pipe(res);
      } catch { res.statusCode = 404; res.end(`Missing local cottage: ${config.sourceFile}`); }
    });
  };
  return { name: 'local-cottage-read-only', configureServer(server) { install(server.config.root, (handler) => server.middlewares.use(handler)); }, configurePreviewServer(server) { install(server.config.root, (handler) => server.middlewares.use(handler)); } };
}
