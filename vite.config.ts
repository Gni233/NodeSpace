import { defineConfig, Plugin } from 'vite';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { resolveGraphDirectory } = require('./electron/graph-folder.cjs');

// 读取 Electron 配置文件中的数据目录（与 MCP server 逻辑一致）
function getElectronConfigDir(): string | null {
  try {
    const platform = os.platform();
    const candidates: string[] = [];
    if (platform === 'win32') {
      const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      candidates.push(path.join(appdata, 'nodespace', 'config.json'));
      candidates.push(path.join(appdata, 'NodeSpace', 'config.json'));
    } else if (platform === 'darwin') {
      candidates.push(path.join(os.homedir(), 'Library', 'Application Support', 'nodespace', 'config.json'));
      candidates.push(path.join(os.homedir(), 'Library', 'Application Support', 'NodeSpace', 'config.json'));
    } else {
      candidates.push(path.join(os.homedir(), '.config', 'nodespace', 'config.json'));
      candidates.push(path.join(os.homedir(), '.config', 'NodeSpace', 'config.json'));
    }
    for (const cp of candidates) {
      if (fs.existsSync(cp)) {
        const config = JSON.parse(fs.readFileSync(cp, 'utf-8'));
        if (config.folderPath && fs.existsSync(config.folderPath)) {
          return resolveGraphDirectory(config.folderPath, config.graphFolderRelative).graphRootPath;
        }
      }
    }
  } catch {}
  return null;
}

function nodespaceFileWatchPlugin(): Plugin {
  return {
    name: 'nodespace-file-watch',
    configureServer(server) {
      const dataDir = process.env.NODESPACE_DATA_DIR
        || getElectronConfigDir()
        || path.join(os.homedir(), 'Documents', 'NodeSpace');
      console.log(`[nodespace] Data dir: ${dataDir}`);
      fs.mkdirSync(dataDir, { recursive: true });
      const graphRoot = fs.realpathSync(dataDir);

      // 1) API 端点：从磁盘读取图数据（让 Vite 模式也能读取 MCP Server 写入的文件）
      server.middlewares.use('/api/graph/', (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        let name: string;
        try {
          const route = (req.url ?? '').split('?')[0];
          name = decodeURIComponent(route.replace(/^\//, '')).replace(/\.json$/, '');
        } catch {
          res.statusCode = 400;
          return res.end('{"error":"Invalid graph name"}');
        }
        if (!name || /[\\/:\u0000]/.test(name)) {
          res.statusCode = 403;
          return res.end('{"error":"Access denied"}');
        }

        try {
          const resolved = fs.realpathSync(path.join(graphRoot, name + '.json'));
          const relative = path.relative(graphRoot, resolved);
          if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
            res.statusCode = 403;
            return res.end('{"error":"Access denied"}');
          }
          if (fs.statSync(resolved).isFile()) return res.end(fs.readFileSync(resolved, 'utf-8'));
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code !== 'ENOENT' && code !== 'ENOTDIR') {
            res.statusCode = code === 'EACCES' || code === 'EPERM' ? 403 : 500;
            return res.end('{"error":"Unable to read graph"}');
          }
        }
        res.statusCode = 404;
        return res.end('{"nodes":[],"edges":[],"groups":[]}');
      });

      // 2) 文件监听 → HMR 推送到浏览器
      const pending = new Map<string, NodeJS.Timeout>();
      try {
        const watcher = fs.watch(graphRoot, (_event, filename) => {
          if (!filename || typeof filename !== 'string') return;
          if (!filename.endsWith('.json')) return;
          const name = filename.replace(/\.json$/, '');
          if (pending.has(name)) clearTimeout(pending.get(name)!);
          pending.set(name, setTimeout(() => {
            pending.delete(name);
            server.ws.send({
              type: 'custom',
              event: 'graph-external-change',
              data: { graph: name },
            });
          }, 500));
        });
        watcher.unref();
        server.httpServer?.once('close', () => {
          watcher.close();
          for (const timer of pending.values()) clearTimeout(timer);
        });
      } catch {
        // fs.watch 可能在某些环境下不可用（如 WSL），静默降级
        console.warn('[nodespace] fs.watch unavailable, external change detection disabled');
      }
    },
  };
}

export default defineConfig({
  base: './',
  server: {
    port: 5174,
    open: false,
  },
  plugins: [nodespaceFileWatchPlugin()],
});
