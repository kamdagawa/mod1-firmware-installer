const STK = Object.freeze({
  GET_SYNC: 0x30,
  GET_PARAMETER: 0x41,
  SET_DEVICE: 0x42,
  SET_DEVICE_EXT: 0x45,
  ENTER_PROGMODE: 0x50,
  LEAVE_PROGMODE: 0x51,
  CHIP_ERASE: 0x52,
  LOAD_ADDRESS: 0x55,
  PROG_PAGE: 0x64,
  READ_PAGE: 0x74,
  READ_SIGN: 0x75,
  CRC_EOP: 0x20,
  INSYNC: 0x14,
  OK: 0x10,
  FAILED: 0x11,
  UNKNOWN: 0x12,
  NODEVICE: 0x13,
  NOSYNC: 0x15,
});

const DEFAULT_CONFIG = Object.freeze({
  baudRates: [115200, 57600],
  pageSize: 128,
  expectedSignature: '1e950f',
  commandTimeoutMs: 1800,
  syncAttempts: 8,
  resetAssertMs: 80,
  resetReleaseMs: 80,
  bootWaitMs: 260,
  pageWriteDelayMs: 8,
  verify: true,
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeSignature(value) {
  return String(value || '').replace(/[^0-9a-f]/gi, '').toLowerCase();
}

function bytesToHex(bytes) {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

class SerialByteStream {
  constructor(port, log) {
    this.port = port;
    this.log = log;
    this.reader = null;
    this.writer = null;
    this.readLoopPromise = null;
    this.queue = [];
    this.waiters = new Set();
    this.closed = true;
    this.readError = null;
  }

  async open(baudRate) {
    await this.port.open({
      baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      bufferSize: 4096,
      flowControl: 'none',
    });
    this.closed = false;
    this.reader = this.port.readable.getReader();
    this.writer = this.port.writable.getWriter();
    this.readLoopPromise = this.#readLoop();
  }

  async #readLoop() {
    try {
      while (!this.closed) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value?.length) {
          for (const byte of value) this.queue.push(byte);
          this.#wakeWaiters();
        }
      }
    } catch (error) {
      if (!this.closed) {
        this.readError = error;
        this.#wakeWaiters();
      }
    }
  }

  #wakeWaiters() {
    for (const waiter of this.waiters) waiter();
    this.waiters.clear();
  }

  async #waitForData(timeoutMs) {
    if (this.queue.length || this.readError) return;
    await new Promise((resolve, reject) => {
      let timer;
      const done = () => {
        clearTimeout(timer);
        this.waiters.delete(done);
        resolve();
      };
      timer = setTimeout(() => {
        this.waiters.delete(done);
        reject(new Error('シリアル応答がタイムアウトしました。'));
      }, timeoutMs);
      this.waiters.add(done);
    });
    if (this.readError) throw this.readError;
  }

  discardInput() {
    this.queue.length = 0;
  }

  async write(bytes) {
    if (!this.writer) throw new Error('シリアルポートが開いていません。');
    const payload = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
    await this.writer.write(payload);
  }

  async readByte(timeoutMs) {
    if (!this.queue.length) await this.#waitForData(timeoutMs);
    if (!this.queue.length) throw new Error('シリアル応答を受信できませんでした。');
    return this.queue.shift();
  }

  async readExact(length, timeoutMs) {
    const output = new Uint8Array(length);
    const deadline = performance.now() + timeoutMs;
    for (let i = 0; i < length; i += 1) {
      const remaining = Math.max(1, deadline - performance.now());
      output[i] = await this.readByte(remaining);
    }
    return output;
  }

  async pulseReset(config) {
    // Arduino auto-reset uses the asserted DTR edge through a capacitor.
    try {
      await this.port.setSignals({ dataTerminalReady: false, requestToSend: false });
      await sleep(config.resetReleaseMs);
      await this.port.setSignals({ dataTerminalReady: true, requestToSend: false });
      await sleep(config.resetAssertMs);
      await this.port.setSignals({ dataTerminalReady: false, requestToSend: false });
    } catch (error) {
      this.log(`DTRリセット制御を使用できませんでした: ${error.message}`, 'warn');
    }
    this.discardInput();
    await sleep(config.bootWaitMs);
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.#wakeWaiters();

    try { await this.reader?.cancel(); } catch {}
    try { await this.readLoopPromise; } catch {}
    try { this.reader?.releaseLock(); } catch {}
    try { this.writer?.releaseLock(); } catch {}
    this.reader = null;
    this.writer = null;

    try { await this.port.close(); } catch {}
    this.queue.length = 0;
  }
}

class Stk500v1Programmer {
  constructor(stream, config, callbacks) {
    this.stream = stream;
    this.config = config;
    this.onLog = callbacks.onLog;
    this.onProgress = callbacks.onProgress;
  }

  log(message, level = 'info') {
    this.onLog?.(message, level);
  }

  async command(payload, dataLength = 0, timeoutMs = this.config.commandTimeoutMs) {
    const packet = new Uint8Array(payload.length + 1);
    packet.set(payload, 0);
    packet[packet.length - 1] = STK.CRC_EOP;
    await this.stream.write(packet);

    let first;
    for (let skipped = 0; skipped < 64; skipped += 1) {
      first = await this.stream.readByte(timeoutMs);
      if (first === STK.INSYNC) break;
    }
    if (first !== STK.INSYNC) {
      throw new Error(`ブートローダー同期応答が不正です (0x${first?.toString(16) ?? '--'})。`);
    }

    const data = dataLength ? await this.stream.readExact(dataLength, timeoutMs) : new Uint8Array();
    const status = await this.stream.readByte(timeoutMs);
    if (status !== STK.OK) {
      throw new Error(`ブートローダーがエラーを返しました (0x${status.toString(16).padStart(2, '0')})。`);
    }
    return data;
  }

  async sync() {
    let lastError;
    for (let attempt = 1; attempt <= this.config.syncAttempts; attempt += 1) {
      try {
        this.stream.discardInput();
        await this.command([STK.GET_SYNC], 0, Math.min(this.config.commandTimeoutMs, 700));
        this.log(`ブートローダーと同期しました (${attempt}回目)。`);
        return;
      } catch (error) {
        lastError = error;
        await sleep(80);
      }
    }
    throw new Error(`ブートローダーと同期できませんでした: ${lastError?.message || '応答なし'}`);
  }

  async setDevice() {
    const pageSize = this.config.pageSize;
    const flashSize = 32768;
    // ATmega328P parameters used by STK500v1-compatible Arduino bootloaders.
    await this.command([
      STK.SET_DEVICE,
      0x86, 0x00, 0x00, 0x01, 0x01, 0x01, 0x01, 0x03,
      0xff, 0xff, 0xff, 0xff,
      (pageSize >> 8) & 0xff, pageSize & 0xff,
      0x04, 0x00,
      (flashSize >>> 24) & 0xff,
      (flashSize >>> 16) & 0xff,
      (flashSize >>> 8) & 0xff,
      flashSize & 0xff,
    ]);
    // Classic Arduino bootloaders accept/ignore the extended device parameters.
    await this.command([STK.SET_DEVICE_EXT, 0x05, 0x04, 0xd7, 0xc2, 0x00]);
  }

  async readSignature() {
    const signature = await this.command([STK.READ_SIGN], 3);
    const actual = bytesToHex(signature);
    const expected = normalizeSignature(this.config.expectedSignature);
    this.log(`MCU signature: ${actual}`);
    if (expected && actual !== expected) {
      throw new Error(`対象MCUが一致しません。期待値 ${expected} / 実機 ${actual}`);
    }
    return actual;
  }

  async loadAddress(byteAddress) {
    if (byteAddress % 2 !== 0) throw new Error('書き込みアドレスがワード境界ではありません。');
    const wordAddress = byteAddress >>> 1;
    await this.command([STK.LOAD_ADDRESS, wordAddress & 0xff, (wordAddress >> 8) & 0xff]);
  }

  async programPage(page) {
    await this.loadAddress(page.address);
    const length = page.bytes.length;
    const payload = new Uint8Array(4 + length);
    payload[0] = STK.PROG_PAGE;
    payload[1] = (length >> 8) & 0xff;
    payload[2] = length & 0xff;
    payload[3] = 0x46; // 'F' = flash
    payload.set(page.bytes, 4);
    await this.command(payload);
    await sleep(this.config.pageWriteDelayMs);
  }

  async readPage(page) {
    await this.loadAddress(page.address);
    const length = page.bytes.length;
    return this.command([STK.READ_PAGE, (length >> 8) & 0xff, length & 0xff, 0x46], length);
  }

  async flash(image) {
    await this.sync();
    // Multiple syncs mirror the conservative behavior of established uploaders.
    await this.command([STK.GET_SYNC]);
    await this.readSignature();
    await this.setDevice();
    await this.command([STK.ENTER_PROGMODE]);
    await this.command([STK.CHIP_ERASE]);

    const total = image.pages.length;
    this.log(`${total}ページを書き込みます。`);
    for (let index = 0; index < total; index += 1) {
      await this.programPage(image.pages[index]);
      this.onProgress?.({ phase: 'write', completed: index + 1, total });
    }

    if (this.config.verify !== false) {
      this.log('書き込み内容を読み戻して検証します。');
      for (let index = 0; index < total; index += 1) {
        const page = image.pages[index];
        const actual = await this.readPage(page);
        for (let i = 0; i < page.bytes.length; i += 1) {
          if (actual[i] !== page.bytes[i]) {
            const address = page.address + i;
            throw new Error(
              `検証に失敗しました。アドレス0x${address.toString(16).toUpperCase()} ` +
              `(期待 0x${page.bytes[i].toString(16).padStart(2, '0')} / ` +
              `実機 0x${actual[i].toString(16).padStart(2, '0')})`
            );
          }
        }
        this.onProgress?.({ phase: 'verify', completed: index + 1, total });
      }
    }

    await this.command([STK.LEAVE_PROGMODE]);
  }
}

export async function flashArduinoNano({ port, image, config = {}, onLog, onProgress }) {
  const merged = { ...DEFAULT_CONFIG, ...config };
  merged.baudRates = Array.isArray(merged.baudRates) && merged.baudRates.length
    ? merged.baudRates.map(Number).filter((value) => Number.isFinite(value) && value > 0)
    : [...DEFAULT_CONFIG.baudRates];

  let lastError;
  for (let index = 0; index < merged.baudRates.length; index += 1) {
    const baudRate = merged.baudRates[index];
    const stream = new SerialByteStream(port, onLog || (() => {}));
    onLog?.(`${baudRate.toLocaleString()} baudで接続を試します。`);

    try {
      onProgress?.({ phase: 'connect', completed: index, total: merged.baudRates.length, baudRate });
      await stream.open(baudRate);
      await stream.pulseReset(merged);
      const programmer = new Stk500v1Programmer(stream, merged, { onLog, onProgress });
      await programmer.flash(image);
      onProgress?.({ phase: 'done', completed: 1, total: 1, baudRate });
      await stream.close();
      return { baudRate };
    } catch (error) {
      lastError = error;
      onLog?.(`${baudRate.toLocaleString()} baudでは接続できませんでした: ${error.message}`, 'warn');
      await stream.close();
      if (index < merged.baudRates.length - 1) await sleep(220);
    }
  }

  throw new Error(`すべての通信設定で書き込みに失敗しました。${lastError ? ` 最終エラー: ${lastError.message}` : ''}`);
}
