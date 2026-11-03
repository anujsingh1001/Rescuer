import { io } from 'socket.io-client';
export function connectSocket(token) {
  const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', { autoConnect: true });
  socket.on('connect', () => socket.emit('authenticate', { token }));
  return socket;
}
