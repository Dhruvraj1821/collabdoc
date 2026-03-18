import { AuthenticatedWebSocket } from './wsServer.js';
import { ClientMessage } from './messageTypes.js';

// Placeholder — fully implemented in Step 16
export async function handleMessage(
  ws: AuthenticatedWebSocket,
  message: ClientMessage
): Promise<void> {
  console.log('handleMessage not yet implemented', message.type);
}

export async function handleDisconnect(
  ws: AuthenticatedWebSocket
): Promise<void> {
  console.log('handleDisconnect not yet implemented', ws.username);
}