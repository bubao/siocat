'use strict';

const blessed = require('blessed');
const contrib = require('blessed-contrib');
const LineEditor = require('./line-editor');
const {
  formatTimestamp,
  formatBlessedData,
  escapeBlessed,
  parseLenientPayload,
  BLESSED_BADGES
} = require('./format');

class SioCatTUI {
  constructor(client, commandEngine) {
    this.client = client;
    this.commandEngine = commandEngine;

    this.screen = null;
    this.grid = null;

    // UI Widgets
    this.headerBox = null;
    this.logWidget = null;
    this.inspectorBox = null;
    this.eventStatsList = null;
    this.shortcutsBox = null;
    this.commandMenu = null;
    this.inputEditor = null;

    // Modals
    this.helpModal = null;
    this.filterModal = null;
    this.emitModal = null;
    this.ackModal = null;

    // State
    this.isDestroyed = false;
    this.focusCycle = [];
    this.focusIndex = 0;
  }

  init() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'siocat - Socket.IO Client',
      dockBorders: true,
      fullUnicode: true,
      cursor: {
        artificial: true,
        shape: 'line',
        blink: true
      }
    });

    this.grid = new contrib.grid({
      rows: 12,
      cols: 12,
      screen: this.screen
    });

    this._createHeader();
    this._createLogFeed();
    this._createInspector();
    this._createEventStats();
    this._createShortcutsGuide();
    this._createBottomPanels();

    // Modals
    this._createHelpModal();
    this._createFilterModal();
    this._createEmitModal();
    this._createAckModal();

    this._setupKeybindings();
    this._setupClientEvents();

    // Setup focus cycle
    this.focusCycle = [this.commandMenu, this.inputEditor, this.logWidget, this.eventStatsList];
    this.focusIndex = 1; // start at command input
    this._setFocus(this.inputEditor);

    this.screen.render();
  }

  _createHeader() {
    // Top Row 0: cols 0-12, height: 1 row (seamless with rest of grid)
    this.headerBox = this.grid.set(0, 0, 1, 12, blessed.box, {
      tags: true,
      style: {
        bg: '#1e1e2e',
        fg: 'white',
        border: { fg: '#45475a' }
      }
    });

    this._updateHeader();
  }

  _updateHeader() {
    if (!this.headerBox || this.isDestroyed) return;

    const info = this.client.getConnectionInfo();
    const isConn = info.connected;

    const brandBadge = '{bold}{black-fg}{cyan-bg} ⚡ SIOCAT {/}';
    const statusBadge = isConn
      ? '{bold}{black-fg}{green-bg} CONNECTED {/}'
      : '{bold}{black-fg}{red-bg} DISCONNECTED {/}';

    const protoBadge = `{cyan-fg}[v${info.protocolVersion || 4}]{/}`;
    const transportBadge = `{magenta-fg}[${info.transport || 'none'}]{/}`;
    const nsBadge = `{yellow-fg}[ns: ${info.namespace}]{/}`;
    const sidText = info.sid ? `{gray-fg}SID:{/} {white-fg}${info.sid}{/}` : '';
    const statsText = `{gray-fg}In:{/} {cyan-fg}${info.stats.packetsIn}{/} {gray-fg}Out:{/} {green-fg}${info.stats.packetsOut}{/} {gray-fg}Ack:{/} {blue-fg}${info.stats.acks}{/}`;

    const line1 = ` ${brandBadge} ${statusBadge} ${protoBadge} ${transportBadge} ${nsBadge}  {gray-fg}Target:{/} {bold}${info.url}{/}`;
    const line2 = `   ${statsText}  |  ${sidText}`;

    this.headerBox.setContent(`${line1}\n${line2}`);
    this.screen.render();
  }

  _createLogFeed() {
    // Left: cols 0-8, rows 1-9 (height: 8 rows)
    this.logWidget = this.grid.set(1, 0, 8, 8, blessed.log, {
      fg: 'white',
      selectedFg: 'green',
      label: ' Live Event Feed ',
      wrap: true,
      scrollback: 1000,
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: ' ',
        inverse: true
      },
      style: {
        border: { fg: '#89b4fa' },
        focus: { border: { fg: '#fab387' } }
      },
      tags: true,
      mouse: true,
      keys: true,
      vi: true
    });
  }

  _createInspector() {
    // Right Top: cols 8-12, rows 1-4 (height: 3 rows)
    this.inspectorBox = this.grid.set(1, 8, 3, 4, blessed.box, {
      label: ' Session Info ',
      tags: true,
      style: {
        border: { fg: '#a6e3a1' },
        fg: 'white'
      }
    });

    this._updateInspector();
  }

  _updateInspector() {
    if (!this.inspectorBox || this.isDestroyed) return;

    const info = this.client.getConnectionInfo();
    const content = [
      `{gray-fg}URL:{/} ${info.url}`,
      `{gray-fg}Namespace:{/} ${info.namespace}`,
      `{gray-fg}Protocol:{/} Socket.IO v${info.protocolVersion}`,
      `{gray-fg}Transport:{/} ${info.transport}`,
      `{gray-fg}Uptime:{/} ${info.uptime}s`
    ].join('\n');

    this.inspectorBox.setContent(content);
  }

  _createEventStats() {
    // Right Middle: cols 8-12, rows 4-7 (height: 3 rows)
    // Made interactive! Users can select an event from this list to emit it!
    this.eventStatsList = this.grid.set(4, 8, 3, 4, blessed.list, {
      label: ' Discovered Events (Enter: Quick Emit) ',
      tags: true,
      mouse: true,
      keys: true,
      style: {
        border: { fg: '#f9e2af' },
        focus: { border: { fg: '#fab387' } },
        selected: { bg: '#313244', fg: 'yellow', bold: true }
      }
    });

    this.eventStatsList.on('select', (item) => {
      if (!item) return;
      const text = item.getText ? item.getText() : item.content || '';
      const match = text.match(/^([^\s:(]+)/);
      if (match && match[1]) {
        this.openEmitModal(match[1]);
      }
    });

    this._updateEventStats();
  }

  _updateEventStats() {
    if (!this.eventStatsList || this.isDestroyed) return;

    const counts = this.client.stats.eventCounts;
    const entries = Object.entries(counts);

    if (entries.length === 0) {
      this.eventStatsList.setItems(['(No events recorded yet)']);
      return;
    }

    // Sort by highest count
    entries.sort((a, b) => b[1] - a[1]);

    const items = entries.slice(0, 10).map(([name, count]) => {
      return `${escapeBlessed(name)} (${count})`;
    });

    this.eventStatsList.setItems(items);
  }

  _createShortcutsGuide() {
    // Right Bottom: cols 8-12, rows 7-9 (height: 2 rows)
    this.shortcutsBox = this.grid.set(7, 8, 2, 4, blessed.box, {
      label: ' Shortcuts ',
      tags: true,
      style: {
        border: { fg: '#6c7086' },
        fg: 'white'
      }
    });

    const shortcuts = [
      '{yellow-fg}Tab{/}: Switch focus (Menu/Input/Feed)',
      '{yellow-fg}1..7{/}: Quick command menu action',
      '{yellow-fg}←/→{/}: Free cursor edit   {yellow-fg}^L{/}: Clear',
      '{yellow-fg}F1/?{/}: Help modal       {yellow-fg}^C{/}: Exit'
    ].join('\n');

    this.shortcutsBox.setContent(shortcuts);
  }

  _createBottomPanels() {
    // 1. Command Selection Menu (cols 0-4, rows 9-12)
    this.commandMenu = this.grid.set(9, 0, 3, 4, blessed.list, {
      label: ' [1-7] Command Menu (Enter: Run) ',
      tags: true,
      mouse: true,
      keys: true,
      items: [
        '⚡ [1] Emit Event...',
        '✓ [2] Emit with ACK...',
        '🔍 [3] Filter Stream...',
        '📊 [4] Session Stats',
        '🧹 [5] Clear Feed',
        '❓ [6] Help & Docs',
        '🚪 [7] Disconnect & Exit'
      ],
      style: {
        border: { fg: '#cba6f7' },
        focus: { border: { fg: '#fab387' } },
        selected: { bg: '#45475a', fg: '#cba6f7', bold: true }
      }
    });

    this.commandMenu.on('select', (item, index) => {
      this._handleMenuAction(index);
    });

    // 2. Interactive LineEditor Command Prompt (cols 4-12, rows 9-12)
    this.inputEditor = this.grid.set(9, 4, 3, 8, LineEditor, {
      label: ' Command Prompt ',
      prompt: '{bold}{cyan-fg}siocat>{/} ',
      style: {
        border: { fg: '#fab387' },
        focus: { border: { fg: '#fab387' } },
        fg: 'white'
      }
    });

    this.inputEditor.on('submit', (val) => {
      this._handleCommandSubmit(val);
    });

    this.inputEditor.on('cancel', () => {
      this._setFocus(this.commandMenu);
    });
  }

  _setFocus(target) {
    if (!target) return;
    this.focusCycle.forEach((w) => {
      if (w && w.style && w.style.border) {
        w.style.border.fg = w === target ? '#fab387' : '#585b70';
      }
    });
    this.focusIndex = this.focusCycle.indexOf(target);
    target.focus();
    this.screen.render();
  }

  _cycleFocus() {
    this.focusIndex = (this.focusIndex + 1) % this.focusCycle.length;
    const target = this.focusCycle[this.focusIndex];
    this._setFocus(target);
  }

  _handleMenuAction(index) {
    switch (index) {
      case 0: // Emit
        this.openEmitModal();
        break;
      case 1: // Emit with ACK
        this.openAckModal();
        break;
      case 2: // Filter
        this.showFilterModal();
        break;
      case 3: // Stats
        this._showStatsPopup();
        break;
      case 4: // Clear
        this._clearFeed();
        break;
      case 5: // Help
        this.showHelp();
        break;
      case 6: // Exit
        this.destroy();
        process.exit(0);
        break;
    }
  }

  _showStatsPopup() {
    const res = this.commandEngine._handleStats();
    this.logFeedMessage(`${BLESSED_BADGES.INFO} Session Statistics:\n` + escapeBlessed(res.message));
  }

  _createEmitModal() {
    this.emitModal = blessed.box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '60%',
      height: 12,
      hidden: true,
      shadow: true,
      border: { type: 'line' },
      style: {
        border: { fg: '#cba6f7' },
        bg: '#181825',
        fg: 'white'
      },
      label: ' ⚡ Emit Event (Tab: next field, Enter: Send, Esc: Cancel) '
    });

    // Event name editor
    this.emitEventInput = new LineEditor({
      parent: this.emitModal,
      top: 1,
      left: 2,
      width: '94%',
      height: 3,
      label: ' Event Name ',
      prompt: '{yellow-fg}Event: {/}',
      border: { type: 'line' },
      style: {
        border: { fg: '#89b4fa' },
        focus: { border: { fg: '#fab387' } }
      }
    });

    // Payload editor
    this.emitDataInput = new LineEditor({
      parent: this.emitModal,
      top: 4,
      left: 2,
      width: '94%',
      height: 3,
      label: ' Payload (JSON5 or String) ',
      prompt: '{green-fg}Data:  {/}',
      value: '{}',
      border: { type: 'line' },
      style: {
        border: { fg: '#89b4fa' },
        focus: { border: { fg: '#fab387' } }
      }
    });

    // Buttons
    this.emitSendBtn = blessed.button({
      parent: this.emitModal,
      top: 7,
      left: 4,
      width: 16,
      height: 3,
      content: '  [ Send ]  ',
      style: {
        bg: '#a6e3a1',
        fg: '#11111b',
        bold: true,
        focus: { bg: '#fab387' }
      },
      mouse: true
    });

    this.emitCancelBtn = blessed.button({
      parent: this.emitModal,
      top: 7,
      left: 24,
      width: 16,
      height: 3,
      content: '  [ Cancel ] ',
      style: {
        bg: '#45475a',
        fg: 'white',
        focus: { bg: '#fab387' }
      },
      mouse: true
    });

    // Event handlers for emit modal
    const doSend = async () => {
      const eventName = this.emitEventInput.getValue().trim();
      if (!eventName) {
        this.logFeedMessage(`${BLESSED_BADGES.ERR} Event name cannot be empty`);
        return;
      }

      const rawData = this.emitDataInput.getValue().trim();
      const payload = parseLenientPayload(rawData);

      try {
        await this.client.send(eventName, payload, { ack: false });
        this.logFeedMessage(`${BLESSED_BADGES.OUT} Emitted {bold}${escapeBlessed(eventName)}{/}`);
      } catch (err) {
        this.logFeedMessage(`${BLESSED_BADGES.ERR} Failed to emit: ${escapeBlessed(err.message)}`);
      }

      this.closeEmitModal();
    };

    this.emitSendBtn.on('press', doSend);
    this.emitCancelBtn.on('press', () => this.closeEmitModal());

    this.emitEventInput.on('submit', () => this.emitDataInput.focus());
    this.emitDataInput.on('submit', doSend);

    this.emitEventInput.on('cancel', () => this.closeEmitModal());
    this.emitDataInput.on('cancel', () => this.closeEmitModal());

    // Tab inside emit modal
    this.emitModal.key(['tab'], () => {
      if (this.emitEventInput.isFocused) {
        this.emitDataInput.focus();
      } else if (this.emitDataInput.isFocused) {
        this.emitSendBtn.focus();
      } else if (this.screen.focused === this.emitSendBtn) {
        this.emitCancelBtn.focus();
      } else {
        this.emitEventInput.focus();
      }
      this.screen.render();
    });

    this.emitModal.key(['escape'], () => this.closeEmitModal());
  }

  openEmitModal(prefilledEvent = '') {
    this.emitModal.show();
    this.emitEventInput.setValue(prefilledEvent);
    this.emitDataInput.setValue('{}');
    if (prefilledEvent) {
      this.emitDataInput.focus();
    } else {
      this.emitEventInput.focus();
    }
    this.screen.render();
  }

  closeEmitModal() {
    this.emitModal.hide();
    this.inputEditor.focus();
    this.screen.render();
  }

  _createAckModal() {
    this.ackModal = blessed.box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '60%',
      height: 12,
      hidden: true,
      shadow: true,
      border: { type: 'line' },
      style: {
        border: { fg: '#89b4fa' },
        bg: '#181825',
        fg: 'white'
      },
      label: ' ✓ Emit with ACK (Tab: next field, Enter: Send, Esc: Cancel) '
    });

    this.ackEventInput = new LineEditor({
      parent: this.ackModal,
      top: 1,
      left: 2,
      width: '94%',
      height: 3,
      label: ' Event Name ',
      prompt: '{yellow-fg}Event: {/}',
      border: { type: 'line' },
      style: {
        border: { fg: '#89b4fa' },
        focus: { border: { fg: '#fab387' } }
      }
    });

    this.ackDataInput = new LineEditor({
      parent: this.ackModal,
      top: 4,
      left: 2,
      width: '94%',
      height: 3,
      label: ' Payload (JSON5 or String) ',
      prompt: '{green-fg}Data:  {/}',
      value: '{}',
      border: { type: 'line' },
      style: {
        border: { fg: '#89b4fa' },
        focus: { border: { fg: '#fab387' } }
      }
    });

    this.ackSendBtn = blessed.button({
      parent: this.ackModal,
      top: 7,
      left: 4,
      width: 18,
      height: 3,
      content: '  [ Send (ACK) ]  ',
      style: {
        bg: '#89b4fa',
        fg: '#11111b',
        bold: true,
        focus: { bg: '#fab387' }
      },
      mouse: true
    });

    this.ackCancelBtn = blessed.button({
      parent: this.ackModal,
      top: 7,
      left: 26,
      width: 16,
      height: 3,
      content: '  [ Cancel ] ',
      style: {
        bg: '#45475a',
        fg: 'white',
        focus: { bg: '#fab387' }
      },
      mouse: true
    });

    const doAckSend = async () => {
      const eventName = this.ackEventInput.getValue().trim();
      if (!eventName) {
        this.logFeedMessage(`${BLESSED_BADGES.ERR} Event name cannot be empty`);
        return;
      }

      const rawData = this.ackDataInput.getValue().trim();
      const payload = parseLenientPayload(rawData);

      this.closeAckModal();
      this.logFeedMessage(`${BLESSED_BADGES.SYS} Waiting for ACK on '${escapeBlessed(eventName)}'...`);

      try {
        const response = await this.client.send(eventName, payload, {
          ack: true,
          timeout: this.commandEngine.ackTimeout || 5000
        });
        this.logFeedMessage(
          `${BLESSED_BADGES.ACK} {bold}${escapeBlessed(eventName)}{/} ACK Response: ${formatBlessedData(response)}`
        );
      } catch (err) {
        this.logFeedMessage(`${BLESSED_BADGES.ERR} ACK Error: ${escapeBlessed(err.message)}`);
      }
    };

    this.ackSendBtn.on('press', doAckSend);
    this.ackCancelBtn.on('press', () => this.closeAckModal());

    this.ackEventInput.on('submit', () => this.ackDataInput.focus());
    this.ackDataInput.on('submit', doAckSend);

    this.ackEventInput.on('cancel', () => this.closeAckModal());
    this.ackDataInput.on('cancel', () => this.closeAckModal());

    this.ackModal.key(['tab'], () => {
      if (this.ackEventInput.isFocused) {
        this.ackDataInput.focus();
      } else if (this.ackDataInput.isFocused) {
        this.ackSendBtn.focus();
      } else if (this.screen.focused === this.ackSendBtn) {
        this.ackCancelBtn.focus();
      } else {
        this.ackEventInput.focus();
      }
      this.screen.render();
    });

    this.ackModal.key(['escape'], () => this.closeAckModal());
  }

  openAckModal(prefilledEvent = '') {
    this.ackModal.show();
    this.ackEventInput.setValue(prefilledEvent);
    this.ackDataInput.setValue('{}');
    if (prefilledEvent) {
      this.ackDataInput.focus();
    } else {
      this.ackEventInput.focus();
    }
    this.screen.render();
  }

  closeAckModal() {
    this.ackModal.hide();
    this.inputEditor.focus();
    this.screen.render();
  }

  _createFilterModal() {
    this.filterModal = blessed.box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '55%',
      height: 7,
      hidden: true,
      shadow: true,
      border: { type: 'line' },
      style: {
        border: { fg: '#f9e2af' },
        bg: '#181825',
        fg: 'white'
      },
      label: ' Event Filter (Enter: Apply, Empty: Clear, Esc: Cancel) '
    });

    this.filterEditor = new LineEditor({
      parent: this.filterModal,
      top: 1,
      left: 2,
      width: '90%',
      height: 3,
      prompt: '{yellow-fg}Filter: {/}',
      border: { type: 'line' },
      style: {
        border: { fg: '#a6e3a1' },
        focus: { border: { fg: '#fab387' } },
        fg: 'white'
      }
    });

    this.filterEditor.on('submit', (val) => {
      this._applyFilter(val);
      this.filterModal.hide();
      this.inputEditor.focus();
      this.screen.render();
    });

    this.filterEditor.on('cancel', () => {
      this.filterModal.hide();
      this.inputEditor.focus();
      this.screen.render();
    });
  }

  showFilterModal() {
    this.filterModal.show();
    this.filterEditor.setValue(this.commandEngine.filterPattern || '');
    this.filterEditor.focus();
    this.screen.render();
  }

  _applyFilter(pattern) {
    const res = this.commandEngine._handleFilter(pattern);
    this.logFeedMessage(`${BLESSED_BADGES.SYS} ${res.message}`);
    this._updateFeedTitle();
  }

  _updateFeedTitle() {
    if (this.commandEngine.filterPattern) {
      this.logWidget.setLabel(` Live Event Feed [Filter: ${this.commandEngine.filterPattern}] `);
    } else {
      this.logWidget.setLabel(' Live Event Feed ');
    }
  }

  _createHelpModal() {
    this.helpModal = blessed.box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '75%',
      height: '75%',
      hidden: true,
      shadow: true,
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: '#89b4fa' },
        bg: '#181825',
        fg: 'white'
      },
      label: ' siocat Help & Command Reference (Press Esc to close) ',
      scrollable: true,
      keys: true,
      mouse: true,
      scrollbar: { ch: ' ', inverse: true }
    });

    const helpContent = [
      '{bold}{cyan-fg}COMMAND PROMPT SYNTAX & USAGE:{/}',
      '  {yellow-fg}emit <event> [payload]{/}       Send event with data payload (JSON5, string, number, boolean)',
      '                                  Examples:',
      '                                    {green-fg}emit chatMessage { room: "general", text: "hello" }{/}',
      '                                    {green-fg}emit joinRoom "lobby"{/}',
      '                                    {green-fg}emit sendRaw hex:deadbeef0102{/}',
      '  {yellow-fg}ack <event> [payload]{/}        Send event and wait for server acknowledgement (with timeout)',
      '                                  Example:',
      '                                    {green-fg}ack queryOrder { id: 1001 }{/}',
      '  {yellow-fg}filter <pattern>{/}             Filter live feed by regex or keyword (run with no pattern to clear)',
      '                                  Example:',
      '                                    {green-fg}filter ^chat:{/}',
      '  {yellow-fg}stats{/}                        Display full session statistics table',
      '  {yellow-fg}clear{/}                        Clear current message feed',
      '  {yellow-fg}help / ?{/}                     Open this help dialog',
      '  {yellow-fg}exit / quit / :q{/}             Disconnect and exit siocat',
      '',
      '{bold}{cyan-fg}PAYLOAD SYNTAX (Lenient JSON5 & Binary):{/}',
      '  • Unquoted keys:   { cyan-fg}{ id: 101, status: "ok" }{/}',
      '  • Single quotes:   { cyan-fg}{ name: \'alice\' }{/}',
      '  • Hex binary:      { magenta-fg}hex:48656c6c6f21{/} (auto-converted to Buffer)',
      '  • Base64 binary:   { magenta-fg}base64:SGVsbG8={/}  (auto-converted to Buffer)',
      '  • Primitives:      { blue-fg}true{/}, {blue-fg}false{/}, {red-fg}null{/}, {magenta-fg}42{/}, {magenta-fg}3.14{/}',
      '',
      '{bold}{cyan-fg}COMMAND MENU & DIALOGS (Press 1..7 or click):{/}',
      '  {yellow-fg}[1]{/}  Emit Event...             Open interactive emit modal',
      '  {yellow-fg}[2]{/}  Emit with ACK...          Open ACK modal with response inspector',
      '  {yellow-fg}[3]{/}  Filter Stream...          Set stream filter pattern',
      '  {yellow-fg}[4]{/}  Session Stats             Display stats table in feed',
      '  {yellow-fg}[5]{/}  Clear Feed                Clear live feed',
      '  {yellow-fg}[6]{/}  Help & Docs               Open this help reference',
      '  {yellow-fg}[7]{/}  Disconnect & Exit         Exit application',
      '',
      '{bold}{cyan-fg}LINE EDITOR SHORTCUTS (Cursor navigation in input):{/}',
      '  {magenta-fg}← / →{/}                      Move cursor left / right',
      '  {magenta-fg}Home / End{/}                 Jump to beginning / end of line',
      '  {magenta-fg}Ctrl+A / Ctrl+E{/}            Jump to beginning / end of line',
      '  {magenta-fg}Backspace / Delete{/}         Delete character before / at cursor',
      '  {magenta-fg}Ctrl+U / Ctrl+K{/}            Delete to start / end of line',
      '  {magenta-fg}Ctrl+W{/}                     Delete previous word',
      '  {magenta-fg}↑ / ↓{/}                      Navigate command history',
      '  {magenta-fg}Mouse Click{/}                Position cursor directly under mouse',
      '',
      '{bold}{cyan-fg}GLOBAL NAVIGATION:{/}',
      '  {green-fg}Tab{/}                          Cycle focus: [Menu] ➔ [Prompt] ➔ [Feed] ➔ [Events]',
      '  {green-fg}Esc{/}                          Switch focus to Command Menu / close modal',
      '  {green-fg}Enter{/}                        Submit input command / activate selected item',
      '  {green-fg}1 .. 7{/}                       Directly trigger Command Menu item',
      '  {green-fg}F1 / ?{/}                       Toggle Help dialog',
      '  {green-fg}F2{/}                           Open Filter dialog',
      '  {green-fg}Ctrl+L{/}                       Clear feed',
      '  {green-fg}Ctrl+C{/}                       Exit immediately'
    ].join('\n');

    this.helpModal.setContent(helpContent);

    this.helpModal.key(['escape', 'enter', 'f1', 'q', 'C-c'], () => {
      this.hideHelp();
    });
  }

  showHelp() {
    this.helpModal.show();
    this.helpModal.focus();
    this.screen.render();
  }

  hideHelp() {
    this.helpModal.hide();
    this.inputEditor.focus();
    this.screen.render();
  }

  _setupKeybindings() {
    // Global Ctrl+C exit
    this.screen.key(['C-c'], () => {
      this.destroy();
      process.exit(0);
    });

    // Global F1: Help
    this.screen.key(['f1'], () => {
      if (this.helpModal.visible) {
        this.hideHelp();
      } else {
        this.showHelp();
      }
    });

    // Global F2: Filter
    this.screen.key(['f2'], () => {
      this.showFilterModal();
    });

    // Global Ctrl+L: Clear
    this.screen.key(['C-l'], () => {
      this._clearFeed();
    });

    // Quick number keys 1-7 when not focused in input editor or modals
    this.screen.key(['1', '2', '3', '4', '5', '6', '7'], (ch) => {
      if (
        this.inputEditor.isFocused ||
        this.helpModal.visible ||
        this.filterModal.visible ||
        this.emitModal.visible ||
        this.ackModal.visible
      ) {
        return;
      }
      const num = parseInt(ch, 10);
      if (num >= 1 && num <= 7) {
        this._handleMenuAction(num - 1);
      }
    });

    // Tab key cycles through focusable widgets
    this.screen.key(['tab'], () => {
      if (
        this.helpModal.visible ||
        this.filterModal.visible ||
        this.emitModal.visible ||
        this.ackModal.visible
      ) {
        return;
      }

      this._cycleFocus();
    });
  }

  _setupClientEvents() {
    this.client.on('connect', (info) => {
      this._updateHeader();
      this._updateInspector();
      this.logFeedMessage(
        `${BLESSED_BADGES.SYS} Connected to {bold}${info.url}{/} [SID: {yellow-fg}${info.sid}{/}]`
      );
    });

    this.client.on('disconnect', (reason) => {
      this._updateHeader();
      this._updateInspector();
      this.logFeedMessage(`${BLESSED_BADGES.SYS} Disconnected: {yellow-fg}${escapeBlessed(reason)}{/}`);
    });

    this.client.on('connect_error', (err) => {
      this._updateHeader();
      this.logFeedMessage(`${BLESSED_BADGES.ERR} Connection error: {red-fg}${escapeBlessed(err.message)}{/}`);
    });

    this.client.on('system', (msg) => {
      this.logFeedMessage(`${BLESSED_BADGES.SYS} ${escapeBlessed(msg)}`);
    });

    this.client.on('event:in', ({ event, args, timestamp }) => {
      this._updateHeader();
      this._updateEventStats();

      if (!this.commandEngine.matchesFilter(event)) return;

      const payloadStr = args.length === 1 ? formatBlessedData(args[0]) : formatBlessedData(args);
      const timeStr = `{gray-fg}${formatTimestamp(timestamp)}{/}`;
      const eventBadge = `{bold}{magenta-fg}[${escapeBlessed(event)}]{/}`;

      this.logFeedMessage(`${timeStr} ${BLESSED_BADGES.IN} ${eventBadge} ${payloadStr}`);
    });

    this.client.on('event:out', ({ event, args, timestamp }) => {
      this._updateHeader();
      this._updateEventStats();

      if (!this.commandEngine.matchesFilter(event)) return;

      const payloadStr = args.length === 1 ? formatBlessedData(args[0]) : formatBlessedData(args);
      const timeStr = `{gray-fg}${formatTimestamp(timestamp)}{/}`;
      const eventBadge = `{bold}{green-fg}[${escapeBlessed(event)}]{/}`;

      this.logFeedMessage(`${timeStr} ${BLESSED_BADGES.OUT} ${eventBadge} ${payloadStr}`);
    });

    this.client.on('event:ack', ({ event, response, latency, timestamp }) => {
      this._updateHeader();

      const timeStr = `{gray-fg}${formatTimestamp(timestamp)}{/}`;
      const eventBadge = `{bold}{blue-fg}[${escapeBlessed(event)}]{/}`;
      const respStr = formatBlessedData(response);

      this.logFeedMessage(
        `${timeStr} ${BLESSED_BADGES.ACK} ${eventBadge} ({cyan-fg}${latency}ms{/}) ${respStr}`
      );
    });
  }

  logFeedMessage(msg) {
    if (!this.logWidget || this.isDestroyed) return;
    this.logWidget.log(msg);
    this.screen.render();
  }

  _clearFeed() {
    if (this.logWidget) {
      this.logWidget.setContent('');
      this.screen.render();
    }
  }

  async _handleCommandSubmit(value) {
    if (!value || value.trim() === '') {
      this.inputEditor.clearValue();
      this.inputEditor.focus();
      return;
    }

    const trimmed = value.trim();
    this.inputEditor.clearValue();

    // Check for help shortcut
    if (trimmed === 'help' || trimmed === '?') {
      this.showHelp();
      return;
    }

    // Execute command through engine
    const result = await this.commandEngine.execute(trimmed);

    if (result.exit) {
      this.destroy();
      process.exit(0);
      return;
    }

    if (result.clear) {
      this._clearFeed();
    } else if (result.type === 'error') {
      this.logFeedMessage(`${BLESSED_BADGES.ERR} {red-fg}${escapeBlessed(result.message)}{/}`);
    } else if (result.type === 'info') {
      this.logFeedMessage(`${BLESSED_BADGES.INFO} Session Statistics:`);
      this.logFeedMessage(escapeBlessed(result.message));
    } else if (result.message && !['emit_success'].includes(result.type)) {
      this.logFeedMessage(`${BLESSED_BADGES.SYS} ${escapeBlessed(result.message)}`);
    }

    this._updateFeedTitle();
    this.inputEditor.focus();
    this.screen.render();
  }

  destroy() {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    try {
      if (this.screen) {
        this.screen.destroy();
      }
    } catch {
      // ignore destruction errors
    }

    if (this.client) {
      this.client.disconnect();
    }
  }
}

module.exports = SioCatTUI;
