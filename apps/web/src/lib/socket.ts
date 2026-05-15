'use client';

import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) {
    return socket;
  }
  const url = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3000';
  socket = io(url, {
    path: '/ws',
    withCredentials: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5_000,
  });
  return socket;
}
