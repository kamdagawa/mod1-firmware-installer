import { parseIntelHex, formatHexSummary } from './intel-hex.js';
import { flashArduinoNano } from './stk500v1.js';

const els = {
  firmwareName: document.querySelector('#firmware-name'),
  firmwareVersion: document.querySelector('#firmware-version'),
  firmwareTarget: document.querySelector('#firmware-target'),
  firmwareBuild: document.querySelector('#firmware-build'),
  firmwareSource: document.querySelector('#firmware-source'),
  firmwareDetails: document.querySelector('#firmware-details'),
  firmwareFile: document.querySelector('#firmware-file'),
  browserBadge: document.querySelector('#browser-badge'),
  safetyCheck: document.querySelector('#safety-check'),
  connectButton: document.querySelector('#connect-button'),
  installButton: document.querySelector('#install-button'),
  deviceCard: document.querySelector('#device-card'),
  deviceDetails: document.querySelector('#device-details'),
  progressPanel: document.querySelector('#progress-panel'),
  progressLabel: document.querySelector('#progress-label'),
  progressPercent: document.querySelector('#progress-percent'),
  progressBar: document.querySelector('#progress-bar'),
  logOutput: document.querySelector('#log-output'),
  resultPanel: document.querySelector('#result-panel'),
  resultDetails: document.querySelector('#result-details'),
  errorPanel: document.querySelector('#error-panel'),
  steps: [...document.querySelectorAll('.step')],
};

let manifest = null;
let selectedPort = null;
let firmwareImage = null;
let firmwareBytes = null;
let firmwareLabel = '';
let isRunning = false;

function setError(message = '') {
  els.errorPanel.hidden = !message;
  els.errorPanel.textContent = message;
}

function setFirmwareState(label, details = '') {
  els.firmwareSource.textContent = label;
  els.firmwareDetails.textContent = details;
}

function appendLog(message, level = 'info') {
  const prefix = level === 'warn' ? '[warn]' : level === 'error' ? '[error]' : '[info]';
  els.logOutput.textContent += `${prefix} ${message}\n`;
  els.logOutput.scrollTop = els.logOutput.scrollHeight;
}

function markStep(stepNumber, ready) {
  const step = els.steps.find((item) => Number(item.dataset.step) === stepNumber);
  step?.classList.toggle('is-ready', ready);
}

function updateControls() {
  const hasSerial = 'serial' in navigator;
  const safetyConfirmed = els.safetyCheck.checked;
  els.connectButton.disabled = !hasSerial || !safetyConfirmed || isRunning;
  els.installButton.disabled = !hasSerial || !safetyConfirmed || !selectedPort || !firmwareImage || isRunning;
  els.firmwareFile.disabled = isRunning;

  markStep(1, safetyConfirmed);
  markStep(2, Boolean(selectedPort));
  markStep(3, Boolean(selectedPort) && Boolean(firmwareImage) && safetyConfirmed);
}

function normalizeManifest(raw) {
  const upload = raw.upload || {};
  return {
    name: raw.name || 'MOD1 Firmware',
    version: raw.version || '未設定',
    target: raw.target || 'HAGIWO MOD1 / Arduino Nano',
    build: raw.build || '未設定',
    hexFile: raw.hexFile || null,
    sha256: String(raw.sha256 || '').trim().toLowerCase(),
    usbFilters: Array.isArray(raw.usbFilters) ? raw.usbFilters : [],
    upload: {
      baudRates: upload.baudRates || [115200, 57600],
      pageSize: upload.pageSize || 128,
      maxFlashBytes: upload.maxFlashBytes || 30720,
      expectedSignature: upload.expectedSignature || '1e950f',
      verify: upload.verify !== false,
      commandTimeoutMs: upload.commandTimeoutMs || 1800,
      syncAttempts: upload.syncAttempts || 8,
      resetAssertMs: upload.resetAssertMs || 80,
      resetReleaseMs: upload.resetReleaseMs || 80,
      bootWaitMs: upload.bootWaitMs || 260,
      pageWriteDelayMs: upload.pageWriteDelayMs || 8,
    },
  };
}

async function sha256Hex(bytes) {
  if (!crypto?.subtle) return null;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function prepareFirmware(arrayBuffer, label, expectedHash = '') {
  const bytes = new Uint8Array(arrayBuffer);
  const actualHash = await sha256Hex(bytes);
  if (expectedHash && actualHash && actualHash !== expectedHash) {
    throw new Error(`ファームウェアのSHA-256が一致しません。期待 ${expectedHash} / 実際 ${actualHash}`);
  }

  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const image = parseIntelHex(text, {
    maxFlashBytes: manifest.upload.maxFlashBytes,
    pageSize: manifest.upload.pageSize,
  });

  firmwareImage = image;
  firmwareBytes = bytes;
  firmwareLabel = label;
  const hashText = actualHash ? ` / SHA-256 ${actualHash.slice(0, 12)}…` : '';
  setFirmwareState(label, `${formatHexSummary(image)}${hashText}`);
  setError();
  updateControls();
}

async function loadHostedFirmware() {
  if (!manifest.hexFile) {
    setFirmwareState('未設定', 'SDカード内のHEXを下のファイル欄から選択してください。');
    return;
  }

  const url = new URL(manifest.hexFile, new URL('firmware/', window.location.href));
  setFirmwareState('読み込み中…', url.pathname.split('/').pop());
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await prepareFirmware(await response.arrayBuffer(), `Web: ${url.pathname.split('/').pop()}`, manifest.sha256);
  } catch (error) {
    firmwareImage = null;
    firmwareBytes = null;
    setFirmwareState('Web版を読み込めません', 'SDカード内のHEXを選択して続行できます。');
    setError(`Web上のHEXを読み込めませんでした：${error.message}`);
  }
}

async function loadManifest() {
  try {
    const response = await fetch('firmware/manifest.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    manifest = normalizeManifest(await response.json());
  } catch (error) {
    manifest = normalizeManifest({});
    setError(`manifest.jsonを読み込めませんでした：${error.message}`);
  }

  els.firmwareName.textContent = manifest.name;
  els.firmwareVersion.textContent = manifest.version;
  els.firmwareTarget.textContent = manifest.target;
  els.firmwareBuild.textContent = manifest.build;
  await loadHostedFirmware();
}

function detectBrowserSupport() {
  const supported = 'serial' in navigator && window.isSecureContext;
  els.browserBadge.textContent = supported ? 'Web Serial対応' : '非対応環境';
  els.browserBadge.classList.add(supported ? 'badge-ok' : 'badge-ng');
  if (!supported) {
    setError('HTTPS上のパソコン版Google ChromeまたはMicrosoft Edgeで開いてください。');
  }
  updateControls();
}

function formatUsbId(value) {
  return Number.isInteger(value) ? `0x${value.toString(16).padStart(4, '0').toUpperCase()}` : '取得できません';
}

function requestPortFilters() {
  return manifest.usbFilters
    .filter((item) => Number.isInteger(item.usbVendorId))
    .map((item) => {
      const filter = { usbVendorId: item.usbVendorId };
      if (Number.isInteger(item.usbProductId)) filter.usbProductId = item.usbProductId;
      return filter;
    });
}

async function selectSerialPort() {
  setError();
  els.resultPanel.hidden = true;
  try {
    const filters = requestPortFilters();
    selectedPort = await navigator.serial.requestPort(filters.length ? { filters } : undefined);
    const info = selectedPort.getInfo();
    els.deviceDetails.textContent = `VID ${formatUsbId(info.usbVendorId)} / PID ${formatUsbId(info.usbProductId)}`;
    els.deviceCard.hidden = false;
  } catch (error) {
    selectedPort = null;
    els.deviceCard.hidden = true;
    if (error.name !== 'NotFoundError') setError(`USBデバイスを選択できませんでした：${error.message}`);
  } finally {
    updateControls();
  }
}

function progressFor(event) {
  if (event.phase === 'connect') return { percent: 8, label: `${event.baudRate.toLocaleString()} baudでブートローダーへ接続中…` };
  if (event.phase === 'write') {
    const ratio = event.completed / event.total;
    return { percent: Math.round(15 + ratio * 58), label: `書き込み中… ${event.completed}/${event.total}ページ` };
  }
  if (event.phase === 'verify') {
    const ratio = event.completed / event.total;
    return { percent: Math.round(74 + ratio * 24), label: `検証中… ${event.completed}/${event.total}ページ` };
  }
  return { percent: 100, label: '書き込みと検証が完了しました' };
}

function updateProgress(event) {
  const state = progressFor(event);
  els.progressLabel.textContent = state.label;
  els.progressPercent.textContent = `${state.percent}%`;
  els.progressBar.style.width = `${state.percent}%`;
}

async function installFirmware() {
  if (!selectedPort || !firmwareImage || isRunning) return;

  isRunning = true;
  setError();
  els.resultPanel.hidden = true;
  els.progressPanel.hidden = false;
  els.logOutput.textContent = '';
  els.progressLabel.textContent = '準備中…';
  els.progressPercent.textContent = '1%';
  els.progressBar.style.width = '1%';
  updateControls();

  appendLog(`Firmware: ${firmwareLabel}`);
  appendLog(`Image: ${formatHexSummary(firmwareImage)}`);
  appendLog('書き込み中はUSBケーブルを抜かないでください。');

  try {
    const result = await flashArduinoNano({
      port: selectedPort,
      image: firmwareImage,
      config: manifest.upload,
      onLog: appendLog,
      onProgress: updateProgress,
    });
    els.resultDetails.textContent = `${result.baudRate.toLocaleString()} baudで書き込み・読み戻し検証が完了しました。USBを外してからEurorack電源を入れてください。`;
    els.resultPanel.hidden = false;
    els.resultPanel.focus();
  } catch (error) {
    appendLog(error.stack || error.message, 'error');
    setError(`書き込みに失敗しました：${error.message}`);
  } finally {
    isRunning = false;
    updateControls();
  }
}

els.safetyCheck.addEventListener('change', updateControls);
els.connectButton.addEventListener('click', selectSerialPort);
els.installButton.addEventListener('click', installFirmware);
els.firmwareFile.addEventListener('change', async () => {
  const [file] = els.firmwareFile.files;
  if (!file) return;
  try {
    await prepareFirmware(await file.arrayBuffer(), `SD/PC: ${file.name}`);
  } catch (error) {
    firmwareImage = null;
    firmwareBytes = null;
    setFirmwareState('HEXが不正です', file.name);
    setError(`選択したHEXを使用できません：${error.message}`);
    updateControls();
  }
});

navigator.serial?.addEventListener('disconnect', (event) => {
  if (event.target === selectedPort) {
    selectedPort = null;
    els.deviceCard.hidden = true;
    setError('USBデバイスが切断されました。もう一度選択してください。');
    updateControls();
  }
});

await loadManifest();
detectBrowserSupport();
