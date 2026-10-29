'use strict';

const {
  formatTimestamp,
  formatBlessedData,
  formatChalkData,
  escapeBlessed,
  parseLenientPayload,
  tokenizeCommand,
  renderTokensWithCursor,
  highlightBlessedCommand
} = require('../lib/format');

describe('Format Utilities', () => {
  test('formatTimestamp returns HH:mm:ss.SSS format', () => {
    const fixedDate = new Date(2025, 0, 1, 14, 25, 30, 450);
    const result = formatTimestamp(fixedDate);
    expect(result).toBe('14:25:30.450');
  });

  test('escapeBlessed escapes { and } characters', () => {
    expect(escapeBlessed('foo {bar} baz')).toBe('foo {open}bar{close} baz');
  });

  test('parseLenientPayload parses standard JSON', () => {
    const res = parseLenientPayload('{"name": "Alice", "age": 30}');
    expect(res).toEqual({ name: 'Alice', age: 30 });
  });

  test('parseLenientPayload parses JSON5 unquoted keys and single quotes', () => {
    const res = parseLenientPayload("{ name: 'Bob', active: true, count: 42 }");
    expect(res).toEqual({ name: 'Bob', active: true, count: 42 });
  });

  test('parseLenientPayload parses numbers and booleans', () => {
    expect(parseLenientPayload('12345')).toBe(12345);
    expect(parseLenientPayload('true')).toBe(true);
    expect(parseLenientPayload('false')).toBe(false);
  });

  test('parseLenientPayload handles plain strings gracefully', () => {
    expect(parseLenientPayload('Hello world')).toBe('Hello world');
    expect(parseLenientPayload('"Quoted String"')).toBe('Quoted String');
    expect(parseLenientPayload("'Single Quoted'")).toBe('Single Quoted');
  });

  test('formatBlessedData formats various data types', () => {
    expect(formatBlessedData(null)).toContain('null');
    expect(formatBlessedData(true)).toContain('true');
    expect(formatBlessedData(100)).toContain('100');
    expect(formatBlessedData('hello')).toContain('hello');
    expect(formatBlessedData({ a: 1 })).toContain('"a":1');
  });

  test('parseLenientPayload handles binary buffer prefixes hex: and base64:', () => {
    const hexBuf = parseLenientPayload('hex:68656c6c6f');
    expect(Buffer.isBuffer(hexBuf)).toBe(true);
    expect(hexBuf.toString('utf8')).toBe('hello');

    const b64Buf = parseLenientPayload('base64:aGVsbG8=');
    expect(Buffer.isBuffer(b64Buf)).toBe(true);
    expect(b64Buf.toString('utf8')).toBe('hello');
  });

  test('formatBlessedData and formatChalkData format Buffer correctly', () => {
    const buf = Buffer.from('binary-test');
    expect(formatBlessedData(buf)).toContain('<Buffer');
    expect(formatChalkData(buf)).toContain('<Buffer');
  });

  test('tokenizeCommand tokenizes known commands and arguments', () => {
    const tokens = tokenizeCommand('emit chatMessage { text: "hello", count: 42, active: true }');
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens[0]).toEqual({ text: 'emit', color: 'bold}{cyan-fg' });
    expect(tokens[2]).toEqual({ text: 'chatMessage', color: 'bold}{yellow-fg' });
  });

  test('tokenizeCommand distinguishes known commands vs prefixes vs unknown', () => {
    const known = tokenizeCommand('ack');
    expect(known[0].color).toBe('bold}{cyan-fg');

    const prefix = tokenizeCommand('em');
    expect(prefix[0].color).toBe('cyan-fg');

    const unknown = tokenizeCommand('unknownCmd');
    expect(unknown[0].color).toBe('bold}{red-fg');
  });

  test('renderTokensWithCursor renders block cursor at correct position with escaping', () => {
    const tokens = tokenizeCommand('emit chat { id: 1 }');
    const renderedStart = renderTokensWithCursor(tokens, 0, true);
    expect(renderedStart).toContain('{bold}{white-bg}{black-fg}e{/}');

    const renderedEnd = renderTokensWithCursor(tokens, 19, true);
    expect(renderedEnd).toContain('{bold}{white-bg}{black-fg} {/}');

    // Escapes { and } inside rendered tokens
    expect(renderedEnd).toContain('{open}');
    expect(renderedEnd).toContain('{close}');
  });

  test('highlightBlessedCommand formats commands with colors', () => {
    const highlighted = highlightBlessedCommand('stats');
    expect(highlighted).toBe('{bold}{cyan-fg}stats{/}');
  });
});
