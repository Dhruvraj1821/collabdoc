import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ClientMessageSchema } from './messageTypes.js';

export interface AuthenticatedWebSocket extends WebSocket {
  userId: string;
  username: string;
  color: string;
  isAlive: boolean;
  opCount: number;
  opCountResetTimer?: ReturnType<typeof setTimeout>;
}

function assignColor(userId: string): string {
  const colors = [
    '#ef4444', '#f97316', '#eab308', '#22c55e',
    '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6',
  ];
  const sum = userId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return colors[sum % colors.length];
}

export function safeSend(ws: WebSocket, message: object): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

export function createWebSocketServer(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      safeSend(ws, { type: 'error', message: 'Missing token', fatal: true });
      ws.close();
      return;
    }

    let decoded: { userId: string; username: string };
    try {
      decoded = jwt.verify(token, env.JWT_SECRET) as {
        userId: string;
        username: string;
      };
    } catch {
      safeSend(ws, { type: 'error', message: 'Invalid token', fatal: true });
      ws.close();
      return;
    }

    const authWs = ws as AuthenticatedWebSocket;
    authWs.userId = decoded.userId;
    authWs.username = decoded.username;
    authWs.color = assignColor(decoded.userId);
    authWs.isAlive = true;
    authWs.opCount = 0;

    console.log(`WebSocket connected: ${decoded.username}`);

    ws.on('message', (data) => {
      let parsed: ReturnType<typeof ClientMessageSchema.safeParse>;

      try {
        const json = JSON.parse(data.toString());
        parsed = ClientMessageSchema.safeParse(json);
      } catch {
        safeSend(ws, {
          type: 'error',
          message: 'Invalid JSON',
          fatal: false,
        });
        return;
      }

      if (!parsed.success) {
        safeSend(ws, {
          type: 'error',
          message: 'Invalid message format',
          fatal: false,
        });
        return;
      }

      authWs.opCount++;
      if (!authWs.opCountResetTimer) {
        authWs.opCountResetTimer = setTimeout(() => {
          authWs.opCount = 0;
          authWs.opCountResetTimer = undefined;
        }, 1000);
      }

      if (authWs.opCount > 50) {
        safeSend(ws, {
          type: 'error',
          message: 'Rate limit exceeded — slow down',
          fatal: true,
        });
        ws.close();
        return;
      }

      import('./wsHandler.js').then(({ handleMessage }) => {
        handleMessage(authWs, parsed.data!);
      });
    });

    ws.on('close', () => {
      console.log(`WebSocket disconnected: ${authWs.username}`);
      import('./wsHandler.js').then(({ handleDisconnect }) => {
        handleDisconnect(authWs);
      });
    });

    ws.on('pong', () => {
      authWs.isAlive = true;
    });
  });

  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      const authWs = ws as AuthenticatedWebSocket;
      if (!authWs.isAlive) {
        authWs.terminate();
        return;
      }
      authWs.isAlive = false;
      authWs.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(heartbeat));

  return wss;
}