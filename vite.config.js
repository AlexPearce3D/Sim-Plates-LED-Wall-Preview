import { createReadStream, existsSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { defineConfig, loadEnv } from 'vite';

function getFirstVideoPath(mode) {
  const env = loadEnv(mode, process.cwd(), '');
  return env.FIRST_360_MOV_PATH;
}

function streamVideo(request, response, firstVideoPath) {
  if (!firstVideoPath || !existsSync(firstVideoPath)) {
    response.writeHead(404);
    response.end();
    return;
  }

  const { size } = statSync(firstVideoPath);
  const range = request.headers.range;
  const headers = {
    'Accept-Ranges': 'bytes',
    'Content-Type': 'video/quicktime',
    'Content-Disposition': `inline; filename="${basename(firstVideoPath)}"`,
  };

  if (!range) {
    response.writeHead(200, {
      ...headers,
      'Content-Length': size,
    });
    createReadStream(firstVideoPath).pipe(response);
    return;
  }

  const [startText, endText] = range.replace(/bytes=/, '').split('-');
  const start = Number.parseInt(startText, 10);
  const end = endText ? Number.parseInt(endText, 10) : size - 1;

  response.writeHead(206, {
    ...headers,
    'Content-Length': end - start + 1,
    'Content-Range': `bytes ${start}-${end}/${size}`,
  });
  createReadStream(firstVideoPath, { start, end }).pipe(response);
}

function mediaMiddleware(firstVideoPath) {
  return (server) => {
    server.middlewares.use('/media/first-360.mov', (request, response) => {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405);
        response.end();
        return;
      }

      if (request.method === 'HEAD') {
        if (!firstVideoPath || !existsSync(firstVideoPath)) {
          response.writeHead(404);
          response.end();
          return;
        }

        const { size } = statSync(firstVideoPath);
        response.writeHead(200, {
          'Accept-Ranges': 'bytes',
          'Content-Length': size,
          'Content-Type': 'video/quicktime',
        });
        response.end();
        return;
      }

      streamVideo(request, response, firstVideoPath);
    });
  };
}

export default defineConfig(({ mode }) => {
  const firstVideoPath = getFirstVideoPath(mode);

  return {
    base: process.env.VITE_BASE_PATH ?? '/',
    build: {
      chunkSizeWarningLimit: 650,
      rollupOptions: {
        output: {
          manualChunks: {
            three: ['three'],
            icons: ['lucide'],
          },
        },
      },
    },
    plugins: [
      {
        name: 'first-360-video',
        configureServer: mediaMiddleware(firstVideoPath),
        configurePreviewServer: mediaMiddleware(firstVideoPath),
      },
    ],
  };
});
