"use client"
import { io } from "socket.io-client"

// Connect over websocket directly rather than starting on HTTP polling and
// upgrading
const socketOptions = { transports: ["websocket"] }

class SocketConnection {
  socket
  telemetrySocket
  socketEndpoint = import.meta.env.VITE_BACKEND_URL

  constructor() {
    this.socket = io(this.socketEndpoint, socketOptions)
    this.telemetrySocket = io(this.socketEndpoint + "/telemetry", socketOptions)
  }
}

let socketConnection = undefined

class SocketFactory {
  static create() {
    if (!socketConnection) {
      socketConnection = new SocketConnection()
    }
    return socketConnection
  }
}
export default SocketFactory
