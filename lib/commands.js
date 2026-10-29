'use strict';

const Table = require('cli-table3');
const { parseLenientPayload } = require('./format');

class CommandEngine {
  constructor(client, options = {}) {
    this.client = client;
    this.ackTimeout = options.ackTimeout || 5000;
    this.activeFilter = options.filter ? this._compileFilter(options.filter) : null;
    this.filterPattern = options.filter || null;
  }

  /**
   * Parse a raw input line into command and raw arguments
   * @param {string} line
   * @returns {{ command: string, rawArgs: string }}
   */
  parseInput(line) {
    if (!line || typeof line !== 'string') {
      return { command: '', rawArgs: '' };
    }

    const trimmed = line.trim();
    if (!trimmed) {
      return { command: '', rawArgs: '' };
    }

    const firstSpace = trimmed.indexOf(' ');
    if (firstSpace === -1) {
      return { command: trimmed.toLowerCase(), rawArgs: '' };
    }

    const command = trimmed.slice(0, firstSpace).toLowerCase();
    const rawArgs = trimmed.slice(firstSpace + 1).trim();

    return { command, rawArgs };
  }

  /**
   * Execute a command string
   * @param {string} input
   * @returns {Promise<{ type: string, message?: string, data?: any, exit?: boolean, clear?: boolean }>}
   */
  async execute(input) {
    const { command, rawArgs } = this.parseInput(input);

    if (!command) {
      return { type: 'noop' };
    }

    switch (command) {
      case 'emit':
      case 'send':
        return this._handleEmit(rawArgs, false);

      case 'ack':
        return this._handleEmit(rawArgs, true);

      case 'filter':
        return this._handleFilter(rawArgs);

      case 'clear':
      case 'cls':
        return { type: 'clear', clear: true };

      case 'stats':
      case 'info':
        return this._handleStats();

      case 'help':
      case '?':
        return this._handleHelp();

      case 'exit':
      case 'quit':
      case ':q':
        return { type: 'exit', exit: true, message: 'Exiting...' };

      default:
        return {
          type: 'error',
          message: `Unknown command '${command}'. Type 'help' for available commands.`
        };
    }
  }

  async _handleEmit(rawArgs, waitForAck = false) {
    if (!rawArgs) {
      return {
        type: 'error',
        message: waitForAck
          ? 'Usage: ack <event> [payload]'
          : 'Usage: emit <event> [payload]'
      };
    }

    if (!this.client.isConnected()) {
      return {
        type: 'error',
        message: 'Cannot send: not connected to server'
      };
    }

    // Split event name from payload
    const spaceIndex = rawArgs.indexOf(' ');
    let eventName;
    let payload;

    if (spaceIndex === -1) {
      eventName = rawArgs;
      payload = undefined;
    } else {
      eventName = rawArgs.slice(0, spaceIndex);
      const payloadStr = rawArgs.slice(spaceIndex + 1);
      payload = parseLenientPayload(payloadStr);
    }

    try {
      if (waitForAck) {
        const response = await this.client.send(eventName, payload, {
          ack: true,
          timeout: this.ackTimeout
        });
        return {
          type: 'ack_success',
          event: eventName,
          payload,
          response,
          message: `ACK received for '${eventName}'`
        };
      } else {
        await this.client.send(eventName, payload, { ack: false });
        return {
          type: 'emit_success',
          event: eventName,
          payload,
          message: `Emitted '${eventName}'`
        };
      }
    } catch (err) {
      return {
        type: 'error',
        message: `Error sending '${eventName}': ${err.message}`
      };
    }
  }

  _handleFilter(rawArgs) {
    if (!rawArgs || rawArgs.trim() === '') {
      this.activeFilter = null;
      this.filterPattern = null;
      return {
        type: 'system',
        message: 'Event filter cleared. Showing all events.'
      };
    }

    const pattern = rawArgs.trim();
    try {
      this.activeFilter = this._compileFilter(pattern);
      this.filterPattern = pattern;
      return {
        type: 'system',
        message: `Filter set to: ${pattern}`
      };
    } catch (err) {
      return {
        type: 'error',
        message: `Invalid filter pattern: ${err.message}`
      };
    }
  }

  _compileFilter(pattern) {
    if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
      const lastSlash = pattern.lastIndexOf('/');
      const regexStr = pattern.slice(1, lastSlash);
      const flags = pattern.slice(lastSlash + 1);
      return new RegExp(regexStr, flags);
    }
    return new RegExp(pattern, 'i');
  }

  /**
   * Check if an event matches current filter
   * @param {string} eventName
   * @returns {boolean}
   */
  matchesFilter(eventName) {
    if (!this.activeFilter) return true;
    return this.activeFilter.test(eventName);
  }

  _handleStats() {
    const info = this.client.getConnectionInfo();

    const table = new Table({
      head: ['Metric', 'Value'],
      colWidths: [20, 45],
      style: { head: ['cyan'] }
    });

    table.push(
      ['Target URL', info.url],
      ['Namespace', info.namespace],
      ['Protocol Ver', `Socket.IO v${info.protocolVersion}`],
      ['Socket ID', info.sid || 'N/A'],
      ['Status', info.connected ? 'Connected' : 'Disconnected'],
      ['Transport', info.transport],
      ['Uptime', `${info.uptime}s`],
      ['Packets In', String(info.stats.packetsIn)],
      ['Packets Out', String(info.stats.packetsOut)],
      ['ACKs Received', String(info.stats.acks)]
    );

    const eventRows = Object.entries(info.stats.eventCounts);
    let eventSummary = '(None yet)';
    if (eventRows.length > 0) {
      eventSummary = eventRows.map(([k, v]) => `${k}: ${v}`).join(', ');
    }
    table.push(['Event Counts', eventSummary]);

    return {
      type: 'info',
      data: info,
      message: table.toString()
    };
  }

  _handleHelp() {
    const helpLines = [
      'Commands:',
      '  emit <event> [json|string] - Send an event (supports JSON5 unquoted keys)',
      '  ack <event> [json|string]  - Send an event and wait for ACK callback',
      '  filter [pattern]           - Filter displayed events by regex/string (empty to clear)',
      '  stats / info               - Show connection details & statistics table',
      '  clear                      - Clear the message screen',
      '  help / ?                   - Show this help message',
      '  exit / quit / :q           - Disconnect and exit',
      '',
      'Examples:',
      '  emit chatMessage "Hello World"',
      '  emit joinRoom { room: "general", user: "alice" }',
      '  ack customEvent { query: "status", timeout: 1000 }',
      '  filter chat',
      '  filter /^user:/'
    ];

    return {
      type: 'help',
      lines: helpLines,
      message: helpLines.join('\n')
    };
  }
}

module.exports = CommandEngine;
