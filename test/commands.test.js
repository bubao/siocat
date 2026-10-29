'use strict';

const CommandEngine = require('../lib/commands');

describe('CommandEngine', () => {
  let mockClient;
  let engine;

  beforeEach(() => {
    mockClient = {
      isConnected: jest.fn().mockReturnValue(true),
      send: jest.fn().mockResolvedValue('ok'),
      getConnectionInfo: jest.fn().mockReturnValue({
        url: 'http://localhost:3000',
        namespace: '/',
        protocolVersion: 4,
        sid: 'test-sid-123',
        connected: true,
        transport: 'websocket',
        uptime: 10,
        stats: { packetsIn: 5, packetsOut: 2, acks: 1, eventCounts: { testEvent: 3 } }
      })
    };
    engine = new CommandEngine(mockClient, { ackTimeout: 1000 });
  });

  test('parseInput splits command and args', () => {
    const res = engine.parseInput('emit chatMessage "hello"');
    expect(res.command).toBe('emit');
    expect(res.rawArgs).toBe('chatMessage "hello"');
  });

  test('execute emit sends event via client', async () => {
    const res = await engine.execute('emit chatMessage { text: "hi" }');
    expect(res.type).toBe('emit_success');
    expect(res.event).toBe('chatMessage');
    expect(res.payload).toEqual({ text: 'hi' });
    expect(mockClient.send).toHaveBeenCalledWith('chatMessage', { text: 'hi' }, { ack: false });
  });

  test('execute ack sends event with ack=true', async () => {
    mockClient.send.mockResolvedValue({ status: 'confirmed' });
    const res = await engine.execute('ack verifyData { id: 100 }');
    expect(res.type).toBe('ack_success');
    expect(res.response).toEqual({ status: 'confirmed' });
    expect(mockClient.send).toHaveBeenCalledWith(
      'verifyData',
      { id: 100 },
      { ack: true, timeout: 1000 }
    );
  });

  test('execute filter sets active filter', async () => {
    const res = await engine.execute('filter chat');
    expect(res.type).toBe('system');
    expect(engine.matchesFilter('chatMessage')).toBe(true);
    expect(engine.matchesFilter('userJoined')).toBe(false);

    // Clear filter
    const clearRes = await engine.execute('filter');
    expect(clearRes.type).toBe('system');
    expect(engine.matchesFilter('userJoined')).toBe(true);
  });

  test('execute stats returns formatted table and data', async () => {
    const res = await engine.execute('stats');
    expect(res.type).toBe('info');
    expect(res.data.sid).toBe('test-sid-123');
    expect(res.message).toContain('Target URL');
  });

  test('execute help returns help information', async () => {
    const res = await engine.execute('help');
    expect(res.type).toBe('help');
    expect(res.lines.length).toBeGreaterThan(0);
  });

  test('execute exit returns exit signal', async () => {
    const res = await engine.execute('exit');
    expect(res.exit).toBe(true);
  });

  test('execute unknown command returns error message', async () => {
    const res = await engine.execute('foobar');
    expect(res.type).toBe('error');
    expect(res.message).toContain("Unknown command 'foobar'");
  });

  test('execute emit fails gracefully when disconnected', async () => {
    mockClient.isConnected.mockReturnValue(false);
    const res = await engine.execute('emit test');
    expect(res.type).toBe('error');
    expect(res.message).toContain('not connected');
  });
});
