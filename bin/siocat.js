#!/usr/bin/env node
'use strict';

const { Command } = require('commander');
const chalk = require('chalk');
const JSON5 = require('json5');
const SioCatClient = require('../lib/socket-client');
const CommandEngine = require('../lib/commands');
const SioCatTUI = require('../lib/tui');
const SioCatConsoleUI = require('../lib/console-ui');

const program = new Command();

program
  .name('siocat')
  .description('A human-friendly TUI & CLI client for Socket.IO with multi-protocol support')
  .version('1.0.0')
  .argument('<url>', 'Socket.IO server URL (e.g. http://localhost:3000)')
  .option('-n, --namespace <namespace>', 'Socket.IO namespace', '/')
  .option('-p, --protocol <version>', 'Socket.IO client/protocol version (2, 3, or 4)', (val) => parseInt(val, 10))
  .option('-H, --header <header:value>', 'Set HTTP header (can be repeated)', (val, prev = {}) => {
    const colonIdx = val.indexOf(':');
    if (colonIdx > -1) {
      const header = val.slice(0, colonIdx).trim();
      const value = val.slice(colonIdx + 1).trim();
      if (header) prev[header] = value;
    }
    return prev;
  })
  .option('-o, --origin <origin>', 'Set Origin header')
  .option('-a, --auth <json>', 'Authentication payload (JSON or JSON5)', (val) => {
    try {
      return JSON5.parse(val);
    } catch {
      return { token: val };
    }
  })
  .option('-q, --query <key=value>', 'Add query string parameter', (val, prev = {}) => {
    const eqIdx = val.indexOf('=');
    if (eqIdx > -1) {
      const k = val.slice(0, eqIdx).trim();
      const v = val.slice(eqIdx + 1).trim();
      if (k) prev[k] = v;
    }
    return prev;
  })
  .option('--path <path>', 'Socket.IO route path', '/socket.io')
  .option('--transports <transports>', 'Comma-separated transport list (e.g. websocket,polling)', (val) => {
    return val.split(',').map(s => s.trim()).filter(Boolean);
  })
  .option('--ack-timeout <ms>', 'ACK callback response timeout in ms', (val) => parseInt(val, 10), 5000)
  .option('--filter <pattern>', 'Filter displayed events by regex or substring')
  .option('--no-tui', 'Disable TUI mode and use simple console/CLI interface')
  .action(async (url, options) => {
    try {
      // Validate URL format
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        console.error(chalk.red('Error: URL must start with http:// or https://'));
        process.exit(1);
      }

      // Setup headers
      const headers = options.header || {};
      if (options.origin) {
        headers.Origin = options.origin;
      }

      // Initialize Client
      const client = new SioCatClient({
        url,
        namespace: options.namespace || '/',
        protocolVersion: options.protocol,
        headers,
        auth: options.auth || null,
        query: options.query || {},
        path: options.path || '/socket.io',
        transports: options.transports || ['websocket', 'polling']
      });

      // Initialize Command Engine
      const commandEngine = new CommandEngine(client, {
        ackTimeout: options.ackTimeout,
        filter: options.filter
      });

      const useTui = options.tui !== false;

      if (useTui) {
        // TUI Mode
        const tui = new SioCatTUI(client, commandEngine);
        tui.init();

        // Connect
        client.connect().catch((err) => {
          tui.logFeedMessage(`{red-fg}Initial connection failed: ${err.message}{/}`);
        });
      } else {
        // Simple Readline Console Mode
        const consoleUI = new SioCatConsoleUI(client, commandEngine);
        consoleUI.start();

        // Connect
        client.connect().catch((err) => {
          console.error(chalk.red(`Initial connection failed: ${err.message}`));
        });
      }
    } catch (err) {
      console.error(chalk.red(`Fatal error: ${err.message}`));
      process.exit(1);
    }
  });

program.parse(process.argv);
