'use strict';

const chalk = require('chalk');
const JSON5 = require('json5');

function padZero(num, size = 2) {
  let s = String(num);
  while (s.length < size) s = '0' + s;
  return s;
}

/**
 * Format timestamp as HH:mm:ss.SSS
 * @param {Date|number} [date=new Date()]
 * @returns {string}
 */
function formatTimestamp(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const hours = padZero(d.getHours());
  const minutes = padZero(d.getMinutes());
  const seconds = padZero(d.getSeconds());
  const millis = padZero(d.getMilliseconds(), 3);
  return `${hours}:${minutes}:${seconds}.${millis}`;
}

/**
 * Escape blessed open/close tags
 * @param {string} str
 * @returns {string}
 */
function escapeBlessed(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[{}]/g, (ch) => (ch === '{' ? '{open}' : '{close}'));
}

/**
 * Pretty format data for Blessed tags
 * @param {any} value
 * @returns {string}
 */
function formatBlessedData(value) {
  if (value === undefined) return '{gray-fg}undefined{/}';
  if (value === null) return '{blue-fg}null{/}';

  if (typeof value === 'boolean') {
    return `{yellow-fg}${value}{/}`;
  }
  if (typeof value === 'number') {
    return `{magenta-fg}${value}{/}`;
  }
  if (typeof value === 'string') {
    return `{green-fg}"${escapeBlessed(value)}"{/}`;
  }

  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const hex = buf.toString('hex').slice(0, 32);
    return `{magenta-fg}<Buffer ${hex}${buf.length > 16 ? '...' : ''} (${buf.length} bytes)>{/}`;
  }

  try {
    const raw = JSON.stringify(value);
    return escapeBlessed(raw);
  } catch {
    return escapeBlessed(String(value));
  }
}

/**
 * Pretty format data for CLI / Chalk
 * @param {any} value
 * @returns {string}
 */
function formatChalkData(value) {
  if (value === undefined) return chalk.gray('undefined');
  if (value === null) return chalk.blue('null');

  if (typeof value === 'boolean') {
    return chalk.yellow(String(value));
  }
  if (typeof value === 'number') {
    return chalk.magenta(String(value));
  }
  if (typeof value === 'string') {
    return chalk.green(JSON.stringify(value));
  }

  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const hex = buf.toString('hex').slice(0, 32);
    return chalk.magenta(`<Buffer ${hex}${buf.length > 16 ? '...' : ''} (${buf.length} bytes)>`);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Lenient parsing of JSON/JSON5 or raw string
 * @param {string} input
 * @returns {any}
 */
function parseLenientPayload(input) {
  if (!input || typeof input !== 'string') return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  // Support binary buffer prefixes: hex: or base64:
  if (trimmed.startsWith('hex:')) {
    return Buffer.from(trimmed.slice(4).trim(), 'hex');
  }
  if (trimmed.startsWith('base64:')) {
    return Buffer.from(trimmed.slice(7).trim(), 'base64');
  }

  try {
    return JSON5.parse(trimmed);
  } catch {
    // If JSON5 fails, return trimmed raw string without outer quotes
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  }
}

/**
 * Badge definitions for Blessed
 */
const BLESSED_BADGES = {
  IN: '{bold}{cyan-fg}▼ IN {/}',
  OUT: '{bold}{green-fg}▲ OUT{/}',
  ACK: '{bold}{blue-fg}✓ ACK{/}',
  SYS: '{bold}{yellow-fg}* SYS{/}',
  ERR: '{bold}{red-fg}✖ ERR{/}',
  INFO: '{bold}{white-fg}ℹ INFO{/}'
};

/**
 * Badge definitions for Chalk
 */
const CHALK_BADGES = {
  IN: chalk.cyan.bold('▼ IN '),
  OUT: chalk.green.bold('▲ OUT'),
  ACK: chalk.blue.bold('✓ ACK'),
  SYS: chalk.yellow.bold('* SYS'),
  ERR: chalk.red.bold('✖ ERR'),
  INFO: chalk.white.bold('ℹ INFO')
};

const KNOWN_COMMANDS = ['emit', 'send', 'ack', 'filter', 'stats', 'info', 'clear', 'cls', 'help', 'exit', 'quit', ':q'];

/**
 * Tokenize input command string into syntax-highlighted tokens
 * @param {string} input
 * @returns {Array<{text: string, color: string|null}>}
 */
function tokenizeCommand(input) {
  if (!input) return [];

  const tokens = [];
  let remaining = input;

  // 1. Command token
  const cmdMatch = remaining.match(/^(\s*)(\S+)/);
  if (cmdMatch) {
    const [full, leading, cmd] = cmdMatch;
    if (leading) {
      tokens.push({ text: leading, color: null });
    }
    const lowerCmd = cmd.toLowerCase();
    const isKnown = KNOWN_COMMANDS.includes(lowerCmd);
    const isPrefix = KNOWN_COMMANDS.some((c) => c.startsWith(lowerCmd));

    let cmdColor = 'white-fg';
    if (isKnown) {
      cmdColor = 'bold}{cyan-fg';
    } else if (isPrefix) {
      cmdColor = 'cyan-fg';
    } else {
      cmdColor = 'bold}{red-fg';
    }

    tokens.push({ text: cmd, color: cmdColor });
    remaining = remaining.slice(full.length);

    // 2. Argument token depending on command
    if (['emit', 'send', 'ack'].includes(lowerCmd)) {
      const evtMatch = remaining.match(/^(\s+)(\S+)/);
      if (evtMatch) {
        const [evtFull, sp, evt] = evtMatch;
        tokens.push({ text: sp, color: null });
        tokens.push({ text: evt, color: 'bold}{yellow-fg' });
        remaining = remaining.slice(evtFull.length);
      }
    } else if (lowerCmd === 'filter') {
      const filterMatch = remaining.match(/^(\s+)(\S+)/);
      if (filterMatch) {
        const [fFull, sp, fPattern] = filterMatch;
        tokens.push({ text: sp, color: null });
        tokens.push({ text: fPattern, color: 'bold}{magenta-fg' });
        remaining = remaining.slice(fFull.length);
      }
    }
  }

  // 3. Payload tokens for the remainder
  if (remaining) {
    const payloadRegex = /(\"[^\"]*\"|'[^']*')|(hex:\S+|base64:\S+)|([a-zA-Z_$][a-zA-Z0-9_$]*)(?=\s*:)|(\b-?\d+(?:\.\d+)?\b)|(\btrue\b|\bfalse\b)|(\bnull\b|\bundefined\b)|([{}[\],:])|(\s+)|([^\"'\s{}[\],:]+)/g;
    let match;
    while ((match = payloadRegex.exec(remaining)) !== null) {
      const [m, strVal, binVal, keyVal, numVal, boolVal, nullVal, punct, spaceVal, otherVal] = match;
      let color = null;
      if (strVal) color = 'green-fg';
      else if (binVal) color = 'bold}{magenta-fg';
      else if (keyVal) color = 'bold}{blue-fg';
      else if (numVal) color = 'magenta-fg';
      else if (boolVal) color = 'blue-fg';
      else if (nullVal) color = 'red-fg';
      else if (punct) color = 'gray-fg';
      else if (otherVal) color = 'white-fg';
      tokens.push({ text: m, color });
    }
  }

  return tokens;
}

/**
 * Render syntax-highlighted tokens with Blessed escaping and block cursor
 * @param {Array<{text: string, color: string|null}>} tokens
 * @param {number} cursor
 * @param {boolean} isFocused
 * @returns {string}
 */
function renderTokensWithCursor(tokens, cursor, isFocused) {
  let currentIndex = 0;
  let out = '';
  let cursorRendered = false;

  for (const token of tokens) {
    const tokenStart = currentIndex;
    const tokenEnd = currentIndex + token.text.length;

    if (isFocused && !cursorRendered && cursor >= tokenStart && cursor < tokenEnd) {
      const relCursor = cursor - tokenStart;
      const before = escapeBlessed(token.text.slice(0, relCursor));
      const atChar = escapeBlessed(token.text[relCursor]);
      const after = escapeBlessed(token.text.slice(relCursor + 1));

      if (token.color) {
        if (before) out += '{' + token.color + '}' + before + '{/}';
      } else {
        out += before;
      }

      out += '{bold}{white-bg}{black-fg}' + (atChar === ' ' ? ' ' : atChar) + '{/}';

      if (token.color) {
        if (after) out += '{' + token.color + '}' + after + '{/}';
      } else {
        out += after;
      }
      cursorRendered = true;
    } else {
      const escaped = escapeBlessed(token.text);
      if (token.color) {
        out += '{' + token.color + '}' + escaped + '{/}';
      } else {
        out += escaped;
      }
    }
    currentIndex = tokenEnd;
  }

  if (isFocused && !cursorRendered) {
    out += '{bold}{white-bg}{black-fg} {/}';
  }

  return out;
}

/**
 * Highlight command text for Blessed display without cursor
 * @param {string} input
 * @returns {string}
 */
function highlightBlessedCommand(input) {
  const tokens = tokenizeCommand(input);
  return tokens
    .map((tok) => {
      const escaped = escapeBlessed(tok.text);
      return tok.color ? '{' + tok.color + '}' + escaped + '{/}' : escaped;
    })
    .join('');
}

module.exports = {
  formatTimestamp,
  formatBlessedData,
  formatChalkData,
  escapeBlessed,
  parseLenientPayload,
  BLESSED_BADGES,
  CHALK_BADGES,
  KNOWN_COMMANDS,
  tokenizeCommand,
  renderTokensWithCursor,
  highlightBlessedCommand
};
