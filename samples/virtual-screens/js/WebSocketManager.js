/**
 * Manages the WebSocket connection, including connection logic, message
 * queueing, and handling both JSON-RPC and binary messages.
 */
export class WebSocketManager {
  /**
   * @param {number} port The port for the WebSocket server.
   */
  constructor(port) {
    this.port = port;
    this.ws = null;
    this.requestHandler = null;
    this.binaryHandler = null;
    this.messageQueue = [];
    this.pendingRequests = new Map();
    this.onConnectionError = null;
    this.hasConnectedSuccessfully = false;
    this.shouldReconnect = true;
    this.connect();
  }

  setRequestHandler(handler) {
    this.requestHandler = handler;
  }

  setBinaryHandler(handler) {
    this.binaryHandler = handler;
  }

  /**
   * Establishes a WebSocket connection and sets up event handlers.
   */
  connect() {
    this.ws = new WebSocket(`ws://localhost:${this.port}`);
    // This is required to receive binary data as an ArrayBuffer.
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      console.log('WebSocketManager connected.');
      this.hasConnectedSuccessfully = true;
      this._flushMessageQueue();
    };

    this.ws.onmessage = (event) => {
      // Route message based on its type (binary or text).
      if (event.data instanceof ArrayBuffer) {
        if (this.binaryHandler) {
          this.binaryHandler(event.data);
        }
      } else {
        this._handleTextMessage(event.data);
      }
    };

    this.ws.onclose = () => {
      if (!this.hasConnectedSuccessfully && this.onConnectionError) {
        // Only trigger the error if we've never connected successfully.
        this.onConnectionError();
      }
      if (this.shouldReconnect) {
        console.log('WebSocketManager disconnected. Reconnecting...');
        setTimeout(() => this.connect(), 2000);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocketManager error:', error);
      // The onclose event will be fired next, which handles the error logic.
      this.ws.close();
    };
  }

  /**
   * Stops the WebSocket connection and prevents it from reconnecting.
   */
  stopReconnecting() {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close();
    }
  }

  /**
   * Processes an incoming JSON-RPC message.
   * @param {string} message The raw message string from the server.
   * @private
   */
  _handleTextMessage(message) {
    try {
      const data = JSON.parse(message);

      // Check if this message is a response to a client-side request.
      if (this.pendingRequests.has(data.id)) {
        const promise = this.pendingRequests.get(data.id);
        if (data.error) {
          promise.reject(new Error(data.error));
        } else {
          promise.resolve(data.result);
        }
        this.pendingRequests.delete(data.id);
        return;
      }

      // Otherwise, assume it is a request from the server to this client.
      if (data.params && data.params.target && this.requestHandler) {
        this.requestHandler(data);
      }
    } catch (error) {
      console.error('Error handling server message:', error);
    }
  }

  /**
   * Sends a JSON message, queueing it if the connection is not yet open.
   * @param {object} message The message object to send.
   */
  send(message) {
    const serializedMessage = JSON.stringify(message);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(serializedMessage);
    } else {
      this.messageQueue.push(serializedMessage);
    }
  }

  /**
   * Sends binary data directly over the WebSocket.
   * @param {ArrayBuffer} data The binary data to send.
   */
  sendBinary(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else {
      // In a real-time stream, frames are dropped if the connection is down.
      console.warn('WebSocket not open. Dropping binary data packet.');
    }
  }

  /**
   * Sends any queued text messages.
   * @private
   */
  _flushMessageQueue() {
    while (this.messageQueue.length > 0) {
      this.ws.send(this.messageQueue.shift());
    }
  }

  /**
   * Sends a JSON-RPC request to the server.
   * @param {string} target The name of the registered manager on the server.
   * @param {string} func The name of the function to call.
   * @param {Array<any>} args The parameters to pass to the function.
   * @returns {Promise<any>} A promise that resolves with the server's response.
   */
  request(target, func, args = []) {
    return new Promise((resolve, reject) => {
      const id = `${Date.now()}-${Math.random()}`;
      this.pendingRequests.set(id, {resolve, reject});
      this.send({id, params: {target, func, args}});
    });
  }
}
