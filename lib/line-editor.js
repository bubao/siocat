'use strict';

const blessed = require('blessed');
const { escapeBlessed, tokenizeCommand, renderTokensWithCursor } = require('./format');

class LineEditorClass extends blessed.box {
  constructor(options = {}) {
    const opts = {
      tags: true,
      clickable: true,
      mouse: true,
      keys: true,
      input: true,
      keyable: true,
      ...options
    };

    super(opts);

    this.prompt = options.prompt || '';
    this.value = options.value || '';
    this.cursor = this.value.length;
    this.history = options.history || [];
    this.historyIndex = -1;
    this.tempValue = '';
    this.isFocused = false;
    this.highlight = options.highlight !== false;

    this._setupEvents();
    this.updateDisplay();
  }

  _setupEvents() {
    this.on('focus', () => {
      this.isFocused = true;
      if (this.screen && this.screen.program) {
        this.screen.program.showCursor();
      }
      this.updateDisplay();
    });

    this.on('blur', () => {
      this.isFocused = false;
      this.updateDisplay();
    });

    // Mouse click to position cursor
    this.on('click', (data) => {
      this.focus();
      if (!data) return;

      const innerLeft = (this.aleft || 0) + (this.itop || 1) + (this.prompt ? this.prompt.length : 0);
      const clickedCol = data.x - innerLeft;
      const targetCursor = Math.max(0, Math.min(this.value.length, clickedCol));
      this.cursor = targetCursor;
      this.updateDisplay();
    });

    this.on('keypress', (ch, key) => {
      const isFocused = this.screen ? this.screen.focused === this : this.isFocused;
      if (!isFocused) return;
      this._handleKey(ch, key);
    });
  }

  _handleKey(ch, key) {
    if (!key) {
      if (ch && !/^[\x00-\x1f\x7f]$/.test(ch)) {
        this._insertText(ch);
      }
      return;
    }

    // Tab key is reserved for panel focus cycling across Blessed widgets
    if (key.name === 'tab') {
      return;
    }

    // 1. Navigation
    if (key.name === 'left' || (key.ctrl && key.name === 'b')) {
      this.cursor = Math.max(0, this.cursor - 1);
      this.updateDisplay();
      return;
    }

    if (key.name === 'right' || (key.ctrl && key.name === 'f')) {
      this.cursor = Math.min(this.value.length, this.cursor + 1);
      this.updateDisplay();
      return;
    }

    if (key.name === 'home' || (key.ctrl && key.name === 'a')) {
      this.cursor = 0;
      this.updateDisplay();
      return;
    }

    if (key.name === 'end' || (key.ctrl && key.name === 'e')) {
      this.cursor = this.value.length;
      this.updateDisplay();
      return;
    }

    // 2. Deletion
    if (key.name === 'backspace') {
      if (this.cursor > 0) {
        this.value = this.value.slice(0, this.cursor - 1) + this.value.slice(this.cursor);
        this.cursor--;
        this.updateDisplay();
      }
      return;
    }

    if (key.name === 'delete' || (key.ctrl && key.name === 'd')) {
      if (this.cursor < this.value.length) {
        this.value = this.value.slice(0, this.cursor) + this.value.slice(this.cursor + 1);
        this.updateDisplay();
      }
      return;
    }

    if (key.ctrl && key.name === 'u') {
      // Clear from start to cursor
      this.value = this.value.slice(this.cursor);
      this.cursor = 0;
      this.updateDisplay();
      return;
    }

    if (key.ctrl && key.name === 'k') {
      // Clear from cursor to end
      this.value = this.value.slice(0, this.cursor);
      this.updateDisplay();
      return;
    }

    if (key.ctrl && key.name === 'w') {
      // Delete previous word
      const before = this.value.slice(0, this.cursor);
      const after = this.value.slice(this.cursor);
      const trimmed = before.trimEnd();
      const lastSpace = trimmed.lastIndexOf(' ');
      const newBefore = lastSpace === -1 ? '' : trimmed.slice(0, lastSpace + 1);
      this.value = newBefore + after;
      this.cursor = newBefore.length;
      this.updateDisplay();
      return;
    }

    // 3. History
    if (key.name === 'up') {
      if (this.history.length === 0) return;
      if (this.historyIndex === -1) {
        this.tempValue = this.value;
        this.historyIndex = this.history.length - 1;
      } else if (this.historyIndex > 0) {
        this.historyIndex--;
      }
      this.setValue(this.history[this.historyIndex] || '');
      return;
    }

    if (key.name === 'down') {
      if (this.historyIndex === -1) return;
      if (this.historyIndex < this.history.length - 1) {
        this.historyIndex++;
        this.setValue(this.history[this.historyIndex] || '');
      } else {
        this.historyIndex = -1;
        this.setValue(this.tempValue || '');
      }
      return;
    }

    // 4. Submit
    if (key.name === 'enter' || key.name === 'return') {
      const submitted = this.value;
      if (submitted && submitted.trim()) {
        this.history.push(submitted);
      }
      this.historyIndex = -1;
      this.tempValue = '';
      this.emit('submit', submitted);
      return;
    }

    // 5. Cancel / Escape
    if (key.name === 'escape') {
      this.emit('cancel');
      return;
    }

    // 6. Normal character input
    let charToInsert = ch;
    if (!charToInsert && key && !key.ctrl && !key.meta && key.sequence && key.sequence.length > 0) {
      charToInsert = key.sequence;
    }

    if (charToInsert && !/^[\x00-\x1f\x7f]$/.test(charToInsert)) {
      this._insertText(charToInsert);
    }
  }

  _insertText(text) {
    this.value = this.value.slice(0, this.cursor) + text + this.value.slice(this.cursor);
    this.cursor += text.length;
    this.updateDisplay();
  }

  setValue(val = '') {
    this.value = String(val);
    this.cursor = this.value.length;
    this.updateDisplay();
  }

  getValue() {
    return this.value;
  }

  clearValue() {
    this.value = '';
    this.cursor = 0;
    this.updateDisplay();
  }

  updateDisplay() {
    const p = this.prompt || '';
    const isFocused = this.screen ? this.screen.focused === this : this.isFocused;

    let body = '';
    if (this.highlight) {
      const tokens = tokenizeCommand(this.value);
      body = renderTokensWithCursor(tokens, this.cursor, isFocused);
    } else {
      if (!isFocused) {
        body = escapeBlessed(this.value);
      } else {
        const before = escapeBlessed(this.value.slice(0, this.cursor));
        let at = ' ';
        let after = '';
        if (this.cursor < this.value.length) {
          at = escapeBlessed(this.value[this.cursor]);
          after = escapeBlessed(this.value.slice(this.cursor + 1));
        }
        body = `${before}{bold}{white-bg}{black-fg}${at}{/}${after}`;
      }
    }

    this.setContent(`${p}${body}`);

    if (this.screen) {
      this.screen.render();
    }
  }
}

function LineEditor(options) {
  return new LineEditorClass(options);
}
LineEditor.prototype = LineEditorClass.prototype;

module.exports = LineEditor;
