'use strict';

const http = require('http');
const { Server } = require('socket.io');
const SioCatClient = require('../lib/socket-client');

describe('SioCatClient Integration', () => {
  let server;
  let ioServer;
  let port;
  let serverUrl;
  let serverSocket;

  beforeAll((done) => {
    server = http.createServer();
    ioServer = new Server(server, {
      cors: { origin: '*' }
    });

    ioServer.on('connection', (sock) => {
      serverSocket = sock;

      // Echo back chat messages
      sock.on('echo', (data) => {
        sock.emit('echoResponse', data);
      });

      // Handle ACK custom event
      sock.on('withAck', (data, cb) => {
        if (typeof cb === 'function') {
          cb({ received: data, time: Date.now() });
        }
      });
    });

    server.listen(0, () => {
      port = server.address().port;
      serverUrl = `http://localhost:${port}`;
      done();
    });
  });

  afterAll((done) => {
    ioServer.close(() => {
      done();
    });
  });

  test('connects successfully and returns connection info', async () => {
    const client = new SioCatClient({ url: serverUrl, protocolVersion: 4 });

    const info = await client.connect();
    expect(client.isConnected()).toBe(true);
    expect(info.url).toBe(serverUrl);
    expect(info.sid).toBeDefined();

    client.disconnect();
    expect(client.isConnected()).toBe(false);
  });

  test('captures incoming events automatically via wildcard (onAny)', (done) => {
    const client = new SioCatClient({ url: serverUrl, protocolVersion: 4 });

    client.connect().then(() => {
      client.on('event:in', ({ event, args }) => {
        if (event === 'serverBroadcast') {
          expect(args[0]).toEqual({ message: 'wildcard test' });
          client.disconnect();
          done();
        }
      });

      // Server emits arbitrary event
      serverSocket.emit('serverBroadcast', { message: 'wildcard test' });
    });
  });

  test('captures outgoing events and handles ACK response', async () => {
    const client = new SioCatClient({ url: serverUrl, protocolVersion: 4 });
    await client.connect();

    const ackPromise = new Promise((resolve) => {
      client.on('event:ack', ({ event, response, latency }) => {
        if (event === 'withAck') {
          expect(response.received).toEqual({ test: 123 });
          expect(latency).toBeGreaterThanOrEqual(0);
          resolve();
        }
      });
    });

    const response = await client.send('withAck', { test: 123 }, { ack: true, timeout: 2000 });
    expect(response.received).toEqual({ test: 123 });

    await ackPromise;
    client.disconnect();
  });

  test('handles ACK timeout properly', async () => {
    const client = new SioCatClient({ url: serverUrl, protocolVersion: 4 });
    await client.connect();

    // Send event that server will NOT acknowledge
    await expect(
      client.send('unhandledEvent', { dummy: true }, { ack: true, timeout: 100 })
    ).rejects.toThrow('ACK timed out');

    client.disconnect();
  });

  test('loads protocol versions v2, v3, and v4 clients correctly', () => {
    const client2 = new SioCatClient({ url: serverUrl, protocolVersion: 2 });
    const mod2 = client2._loadIoClient();
    expect(mod2.version).toBe(2);
    expect(typeof mod2.io).toBe('function');

    const client3 = new SioCatClient({ url: serverUrl, protocolVersion: 3 });
    const mod3 = client3._loadIoClient();
    expect(mod3.version).toBe(3);
    expect(typeof mod3.io).toBe('function');

    const client4 = new SioCatClient({ url: serverUrl, protocolVersion: 4 });
    const mod4 = client4._loadIoClient();
    expect(mod4.version).toBe(4);
    expect(typeof mod4.io).toBe('function');
  });
});
