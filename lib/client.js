const chalk = require('chalk');

class SioCatClient {
  constructor(options) {
    this.url = options.url;
    this.namespace = options.namespace || '/';
    this.protocolVersion = options.protocolVersion;
    this.headers = options.headers || {};
    this.socket = null;
    this.eventHandlers = {};
  }

  connect() {
    return new Promise((resolve, reject) => {
      // Correctly construct the full path
      const basePath = this.url.endsWith('/') ? this.url.slice(0, -1) : this.url;
      const namespace = this.namespace.startsWith('/') ? this.namespace : '/' + this.namespace;
      const fullPath = basePath + (this.namespace === '/' ? '' : namespace);
      
      // Dynamically require the correct socket.io client version
      let io;
      try {
        if (this.protocolVersion) {
          switch (this.protocolVersion) {
            case 2:
              io = require('socket.io-client-2');
              break;
            case 3:
              io = require('socket.io-client-3');
              break;
            case 4:
              io = require('socket.io-client-4');
              break;
            default:
              console.warn(chalk.yellow(`Unsupported protocol version: ${this.protocolVersion}. Using default client.`));
              io = require('socket.io-client-4');
          }
        } else {
          // Default to latest version
          io = require('socket.io-client-4');
        }
      } catch (err) {
        console.error(chalk.red(`Failed to load socket.io client: ${err.message}`));
        return reject(err);
      }

      // Configure connection options based on protocol version
      const opts = {
        transports: ['websocket', 'polling'],
        transportOptions: {
          polling: {
            extraHeaders: this.headers
          }
        }
      };

      this.socket = io(fullPath, opts);

      this.socket.on('connect', () => {
        console.log(chalk.green(`Connected to ${fullPath}`));
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error(chalk.red(`Connection error: ${error.message}`));
        reject(error);
      });

      this.socket.on('disconnect', (reason) => {
        console.log(chalk.yellow(`Disconnected: ${reason}`));
      });
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }

  sendEvent(event, data, ackCallback) {
    if (!this.socket) {
      throw new Error('Not connected to server');
    }

    if (typeof ackCallback === 'function') {
      this.socket.emit(event, data, ackCallback);
    } else {
      this.socket.emit(event, data);
    }
  }

  onEvent(event, handler) {
    if (!this.socket) {
      throw new Error('Not connected to server');
    }

    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }

    this.eventHandlers[event].push({ handler, originalHandler: handler });
    this.socket.on(event, handler);
  }

  offEvent(event, handler) {
    if (!this.socket) {
      throw new Error('Not connected to server');
    }

    if (handler) {
      // Find and remove the specific handler
      if (this.eventHandlers[event]) {
        const index = this.eventHandlers[event].findIndex(item => item.originalHandler === handler);
        if (index > -1) {
          const storedHandler = this.eventHandlers[event][index].handler;
          this.socket.off(event, storedHandler);
          this.eventHandlers[event].splice(index, 1);
          
          // Clean up empty array
          if (this.eventHandlers[event].length === 0) {
            delete this.eventHandlers[event];
          }
        }
      }
    } else {
      // Remove all handlers for this event
      this.socket.off(event);
      delete this.eventHandlers[event];
    }
  }

  isConnected() {
    return this.socket && this.socket.connected;
  }
  
  // 获取原始socket对象，用于高级操作
  getSocket() {
    return this.socket;
  }
}

module.exports = SioCatClient;