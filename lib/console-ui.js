'use strict';

const readline = require('readline');
const chalk = require('chalk');
const { formatTimestamp, formatChalkJson, CHALK_BADGES } = require('./format');

class SioCatConsoleUI {
  constructor(client, commandEngine) {
    this.client = client;
    this.commandEngine = commandEngine;
    this.rl = null;
    this._closing = false;
  }

  start() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.cyan.bold('siocat> '),
      completer: (line) => {
        const completions = ['emit ', 'ack ', 'filter ', 'stats', 'clear', 'help', 'exit'];
        const hits = completions.filter((c) => c.startsWith(line.trim()));
        return [hits.length ? hits : completions, line];
      }
    });

    this._setupClientEvents();
    this._setupReadline();

    console.log(chalk.bold.blue('=== siocat (CLI Mode) ==='));
    console.log(chalk.gray(`Target: ${this.client.url} (${this.client.namespace})`));
    console.log(chalk.gray(`Type 'help' for available commands, or Ctrl+C to exit.\n`));
  }

  _setupClientEvents() {
    this.client.on('connect', (info) => {
      this._print(
        `${formatTimestamp()} ${CHALK_BADGES.SYS} Connected to ${chalk.green(info.url)} ` +
        `[SID: ${chalk.yellow(info.sid)}] [v${info.protocolVersion}] [${info.transport}]`
      );
    });

    this.client.on('disconnect', (reason) => {
      this._print(`${formatTimestamp()} ${CHALK_BADGES.SYS} Disconnected: ${chalk.yellow(reason)}`);
    });

    this.client.on('connect_error', (err) => {
      this._print(`${formatTimestamp()} ${CHALK_BADGES.ERR} Connection error: ${chalk.red(err.message)}`);
    });

    this.client.on('system', (msg) => {
      this._print(`${formatTimestamp()} ${CHALK_BADGES.SYS} ${chalk.gray(msg)}`);
    });

    this.client.on('event:in', ({ event, args, timestamp }) => {
      if (!this.commandEngine.matchesFilter(event)) return;

      const payloadStr = args.length === 1 ? formatChalkJson(args[0]) : formatChalkJson(args);
      this._print(
        `${formatTimestamp(timestamp)} ${CHALK_BADGES.IN} ${chalk.magenta.bold(`[${event}]`)} ${payloadStr}`
      );
    });

    this.client.on('event:out', ({ event, args, timestamp }) => {
      if (!this.commandEngine.matchesFilter(event)) return;

      const payloadStr = args.length === 1 ? formatChalkJson(args[0]) : formatChalkJson(args);
      this._print(
        `${formatTimestamp(timestamp)} ${CHALK_BADGES.OUT} ${chalk.green.bold(`[${event}]`)} ${payloadStr}`
      );
    });

    this.client.on('event:ack', ({ event, response, latency, timestamp }) => {
      this._print(
        `${formatTimestamp(timestamp)} ${CHALK_BADGES.ACK} ${chalk.blue.bold(`[${event}]`)} ` +
        `(${latency}ms) ${formatChalkJson(response)}`
      );
    });

    this.client.on('ping', (latency) => {
      // Optional ping display (can be quiet or verbose)
    });
  }

  _print(msg) {
    if (this._closing) return;
    if (this.rl) {
      // Save line & clear current prompt line before printing
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      console.log(msg);
      this.rl.prompt(true);
    } else {
      console.log(msg);
    }
  }

  _setupReadline() {
    this.rl.prompt();

    this.rl.on('line', async (line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        this.rl.prompt();
        return;
      }

      const result = await this.commandEngine.execute(trimmed);

      if (result.clear) {
        console.clear();
      } else if (result.exit) {
        this.close();
        return;
      } else if (result.type === 'error') {
        console.log(`${CHALK_BADGES.ERR} ${chalk.red(result.message)}`);
      } else if (result.type === 'help') {
        console.log('\n' + result.lines.map(l => chalk.cyan(l)).join('\n') + '\n');
      } else if (result.message && !['emit_success'].includes(result.type)) {
        console.log(`${CHALK_BADGES.SYS} ${result.message}`);
      }

      if (!this._closing) {
        this.rl.prompt();
      }
    });

    this.rl.on('close', () => {
      this.close();
    });
  }

  close() {
    if (this._closing) return;
    this._closing = true;
    console.log(chalk.gray('\nDisconnecting and exiting...'));
    this.client.disconnect();
    if (this.rl) {
      this.rl.close();
    }
    process.exit(0);
  }
}

module.exports = SioCatConsoleUI;
module.exports.SioCatConsoleUI = SioCatConsoleUI;
module.exports.SioCatCLI = SioCatConsoleUI;
