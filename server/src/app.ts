import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './db.ts';
import { config } from './config.ts';
import { createRouter, errorHandler } from './routes.ts';

export function createApp(db: Db): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '20mb' }));

  // API first, so /api/* never hits the static fallback.
  app.use(createRouter(db));

  // Serve the built React client (after `npm run build`) when present.
  const indexFile = path.join(config.clientDist, 'index.html');
  if (fs.existsSync(indexFile)) {
    app.use(express.static(config.clientDist));
    app.get('*', (_req, res) => {
      res.sendFile(indexFile);
    });
  } else {
    app.get('/', (_req, res) => {
      res
        .status(200)
        .type('text/plain')
        .send(
          'PanCafe API is running. Start the web client in development with `npm run dev` (Vite on :5173) ' +
            'or build it with `npm run build` to serve it from this process.'
        );
    });
  }

  app.use(errorHandler);
  return app;
}
