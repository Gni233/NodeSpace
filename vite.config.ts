import { defineConfig, Plugin } from 'vite';
import fs from 'fs';
import path from 'path';
import os from 'os';

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
          const graphRoot = path.join(config.folderPath, 'Graph233');
          return fs.existsSync(graphRoot) && fs.statSync(graphRoot).isDirectory() ? graphRoot : config.folderPath;
        }
      }
    }
  } catch {}
  return null;
}

const DATA_DIR = process.env.NODESPACE_DATA_DIR
  || getElectronConfigDir()
  || path.join(os.homedir(), 'Documents', 'NodeSpace');

console.log(`[nodespace] Data dir: ${DATA_DIR}`);

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function nodespaceFileWatchPlugin(): Plugin {
  return {
    name: 'nodespace-file-watch',
    configureServer(server) {
      // 1) API 端点：从磁盘读取图数据（让 Vite 模式也能读取 MCP Server 写入的文件）
      server.middlewares.use('/api/graph/', (req, res) => {
        const raw = decodeURIComponent(req.url!.replace(/^\/api\/graph\//, ''));
        const name = raw.replace(/\.json$/, '');
        const fp = path.join(DATA_DIR, name + '.json');
        // 安全检查：防止路径遍历
        const resolved = path.resolve(fp);
        if (!resolved.startsWith(path.resolve(DATA_DIR))) {
          res.statusCode = 403;
          res.end('{"error":"Access denied"}');
          return;
        }
        if (fs.existsSync(resolved)) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(fs.readFileSync(resolved, 'utf-8'));
        } else {
          res.statusCode = 404;
          res.end('{"nodes":[],"edges":[],"groups":[]}');
        }
      });

      // 2) 文件监听 → HMR 推送到浏览器
      const pending = new Map<string, NodeJS.Timeout>();
      try {
        fs.watch(DATA_DIR, (_event, filename) => {
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
