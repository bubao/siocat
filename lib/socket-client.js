'use strict';

const EventEmitter = require('events');

class SioCatClient extends EventEmitter {
  constructor(urlOrOptions = {}, maybeOptions = {}) {
    super();

    let options = {};
    if (typeof urlOrOptions === 'string') {
      options = { url: urlOrOptions, ...maybeOptions };
    } else {
      options = urlOrOptions || {};
    }

    this.url = options.url || 'http://localhost:3000';
    this.namespace = options.namespace || '/';
    this.protocolVersion = options.protocolVersion || options.protocol;
    this.headers = options.headers || {};
    this.auth = options.auth || null;
    this.query = options.query || {};
    this.path = options.path || '/socket.io';
    this.transports = options.transports || ['websocket', 'polling'];
    this.reconnection = options.reconnection !== false;
    this.reconnectionAttempts = options.reconnectionAttempts || 5;
    this.timeout = options.timeout || 20000;

    this.socket = null;
    this.connected = false;
    this.connectTime = null;
    this.sid = null;
    this.activeTransport = null;

    // Track statistics
    this.stats = {
      packetsIn: 0,
      packetsOut: 0,
      acks: 0,
      eventCounts: {}
    };

    // Store custom listeners if added
    this.customListeners = new Map();
  }

  /**
   * Resolve and load the socket.io-client library
   */
  _loadIoClient() {
    let version = this.protocolVersion;
    if (!version) {
      version = 4;
    }

    switch (version) {
      case 2:
        return { io: require('socket.io-client-2'), version: 2 };
      case 3:
        return { io: require('socket.io-client-3'), version: 3 };
      case 4:
        return { io: require('socket.io-client-4'), version: 4 };
      default:
        this.emit('system', `Unsupported protocol version ${version}. Falling back to v4.`);
        return { io: require('socket.io-client-4'), version: 4 };
    }
  }

  /**
   * Connect to the Socket.IO server
   * @returns {Promise<{sid: string, transport: string, namespace: string, url: string}>}
   */
  connect() {
    return new Promise((resolve, reject) => {
      if (this.socket && this.connected) {
        return resolve(this.getConnectionInfo());
      }

      // Construct normalized full URL
      const basePath = this.url.endsWith('/') ? this.url.slice(0, -1) : this.url;
      const ns = this.namespace.startsWith('/') ? this.namespace : '/' + this.namespace;
      const fullPath = basePath + (ns === '/' ? '' : ns);

      let ioModule;
      try {
        ioModule = this._loadIoClient();
      } catch (err) {
        this.emit('error', err);
        return reject(err);
      }

      const { io, version } = ioModule;
      this.resolvedVersion = version;

      // Build options based on version
      const socketOpts = {
        path: this.path,
        transports: this.transports,
        reconnection: this.reconnection,
        reconnectionAttempts: this.reconnectionAttempts,
        timeout: this.timeout,
        query: this.query
      };

      if (version >= 3) {
        if (Object.keys(this.headers).length > 0) {
          socketOpts.extraHeaders = this.headers;
        }
        if (this.auth) {
          socketOpts.auth = this.auth;
        }
      } else {
        // Version 2 options
        socketOpts.transportOptions = {
          polling: {
            extraHeaders: this.headers
          }
        };
      }

      try {
        this.socket = io(fullPath, socketOpts);
      } catch (err) {
        this.emit('error', err);
        return reject(err);
      }

      let isInitialConnect = true;

      // 1. Connection lifecycle handlers
      this.socket.on('connect', () => {
        this.connected = true;
        this.connectTime = Date.now();
        this.sid = this.socket.id || '(unknown)';

        // Try to get active transport
        try {
          if (this.socket.io && this.socket.io.engine && this.socket.io.engine.transport) {
            this.activeTransport = this.socket.io.engine.transport.name;
          }
        } catch {
          this.activeTransport = 'unknown';
        }

        const info = this.getConnectionInfo();
        this.emit('connect', info);

        if (isInitialConnect) {
          isInitialConnect = false;
          resolve(info);
        }
      });

      this.socket.on('disconnect', (reason) => {
        this.connected = false;
        this.emit('disconnect', reason);
      });

      this.socket.on('connect_error', (error) => {
        this.emit('connect_error', error);
        if (isInitialConnect) {
          isInitialConnect = false;
          reject(error);
        }
      });

      if (this.socket.io) {
        this.socket.io.on('reconnect_attempt', (attempt) => {
          this.emit('reconnect_attempt', attempt);
        });

        this.socket.io.on('reconnect', (attempt) => {
          this.emit('reconnect', attempt);
        });

        this.socket.io.on('reconnect_error', (error) => {
          this.emit('reconnect_error', error);
        });

        this.socket.io.on('reconnect_failed', () => {
          this.emit('reconnect_failed');
        });

        // Transport upgrade detection
        if (this.socket.io.engine) {
          this.socket.io.engine.on('upgrade', (transport) => {
            this.activeTransport = transport.name;
            this.emit('system', `Transport upgraded to ${transport.name}`);
          });

          // Latency measurement via ping/pong if available
          let pingStart = 0;
          this.socket.io.engine.on('ping', () => {
            pingStart = Date.now();
          });
          this.socket.io.engine.on('pong', () => {
            if (pingStart > 0) {
              const latency = Date.now() - pingStart;
              this.emit('ping', latency);
            }
          });
        }
      }

      // 2. Wildcard Event Capture
      this._setupWildcard(this.socket, version);
    });
  }

  /**
   * Set up wildcard interception for all incoming and outgoing events
   */
  _setupWildcard(socket, version) {
    if (version >= 3) {
      // v3 and v4 native wildcard support
      if (typeof socket.onAny === 'function') {
        socket.onAny((event, ...args) => {
          this._recordInEvent(event, args);
        });
      }

      if (typeof socket.onAnyOutgoing === 'function') {
        socket.onAnyOutgoing((event, ...args) => {
          // If the last argument is an ack callback function, ignore it in displayed data
          const displayArgs = args.filter(a => typeof a !== 'function');
          this._recordOutEvent(event, displayArgs);
        });
      }
    } else {
      // v2 wildcard hook via onevent
      if (typeof socket.onevent === 'function') {
        const origOnevent = socket.onevent.bind(socket);
        socket.onevent = (packet) => {
          const data = packet.data || [];
          const event = data[0];
          const args = data.slice(1);
          if (event) {
            this._recordInEvent(event, args);
          }
          origOnevent(packet);
        };
      }

      // Hook emit for outgoing events
      const origEmit = socket.emit.bind(socket);
      socket.emit = (event, ...args) => {
        const displayArgs = args.filter(a => typeof a !== 'function');
        this._recordOutEvent(event, displayArgs);
        return origEmit(event, ...args);
      };
    }
  }

  _recordInEvent(event, args) {
    // Ignore internal socket.io events from being duplicated as packets
    if (['connect', 'disconnect', 'connect_error', 'error'].includes(event)) {
      return;
    }

    this.stats.packetsIn++;
    this.stats.eventCounts[event] = (this.stats.eventCounts[event] || 0) + 1;

    this.emit('event:in', {
      event,
      args,
      timestamp: Date.now()
    });
  }

  _recordOutEvent(event, args) {
    this.stats.packetsOut++;
    this.stats.eventCounts[event] = (this.stats.eventCounts[event] || 0) + 1;

    this.emit('event:out', {
      event,
      args,
      timestamp: Date.now()
    });
  }

  /**
   * Send an event with optional arguments and optional ACK
   * @param {string} event
   * @param {any} [data]
   * @param {object} [options]
   * @param {boolean} [options.ack=false]
   * @param {number} [options.timeout=5000]
   * @returns {Promise<any>}
   */
  send(event, data, options = {}) {
    if (!this.socket || !this.connected) {
      return Promise.reject(new Error('Not connected to server'));
    }

    const { ack = false, timeout = 5000 } = options;

    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      if (!ack) {
        if (data !== undefined) {
          this.socket.emit(event, data);
        } else {
          this.socket.emit(event);
        }
        return resolve();
      }

      // Handle ACK with timeout
      let timer = null;
      let hasHandled = false;

      const ackCallback = (...responseArgs) => {
        if (hasHandled) return;
        hasHandled = true;
        if (timer) clearTimeout(timer);

        const latency = Date.now() - startTime;
        this.stats.acks++;

        const response = responseArgs.length <= 1 ? responseArgs[0] : responseArgs;

        this.emit('event:ack', {
          event,
          response,
          latency,
          timestamp: Date.now()
        });

        resolve(response);
      };

      timer = setTimeout(() => {
        if (hasHandled) return;
        hasHandled = true;
        const err = new Error(`ACK timed out after ${timeout}ms for event: ${event}`);
        this.emit('event:ack_timeout', { event, timeout });
        reject(err);
      }, timeout);

      if (data !== undefined) {
        this.socket.emit(event, data, ackCallback);
      } else {
        this.socket.emit(event, ackCallback);
      }
    });
  }

  /**
   * Register a custom event listener on the raw socket
   */
  onEvent(event, handler) {
    if (!this.socket) {
      throw new Error('Socket not initialized');
    }
    this.socket.on(event, handler);
  }

  /**
   * Remove a custom event listener
   */
  offEvent(event, handler) {
    if (!this.socket) return;
    if (handler) {
      this.socket.off(event, handler);
    } else {
      this.socket.off(event);
    }
  }

  /**
   * Disconnect from server and cleanup
   */
  disconnect() {
    if (this.socket) {
      try {
        this.socket.disconnect();
      } catch {
        // ignore errors on close
      }
      this.connected = false;
      this.socket = null;
    }
  }

  /**
   * Get current connection metadata
   */
  getConnectionInfo() {
    return {
      url: this.url,
      namespace: this.namespace,
      protocolVersion: this.resolvedVersion || this.protocolVersion || 4,
      sid: this.socket ? this.socket.id || this.sid : null,
      connected: this.connected,
      transport: this.activeTransport || 'unknown',
      uptime: this.connectTime ? Math.floor((Date.now() - this.connectTime) / 1000) : 0,
      stats: { ...this.stats }
    };
  }

  isConnected() {
    return this.connected && this.socket && this.socket.connected;
  }

  getSocket() {
    return this.socket;
  }
}

module.exports = SioCatClient;
