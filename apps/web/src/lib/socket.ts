import { io, Socket } from 'socket.io-client';
import { getAccessToken } from './api';

const RT_URL = import.meta.env.VITE_RT_URL ?? 'http://localhost:4000/rt';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(RT_URL, {
      autoConnect: false,
      auth: (cb) => cb({ token: getAccessToken() }),
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) {
    s.auth = { token: getAccessToken() };
    s.connect();
  }
  return s;
}

export function disconnectSocket() {
  socket?.disconnect();
}
