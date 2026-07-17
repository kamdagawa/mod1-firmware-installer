const els = {
  firmwareName: document.querySelector('#firmware-name'),
  firmwareVersion: document.querySelector('#firmware-version'),
  firmwareTarget: document.querySelector('#firmware-target'),
  firmwareBuild: document.querySelector('#firmware-build'),
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
  errorPanel: document.querySelector('#error-panel'),
  steps: [...document.querySelectorAll('.step')],
};

let selectedPort = null;
let isRunning = false;

function setError(message = '') {
  els.errorPanel.hidden = !message;
  els.errorPanel.textContent = message;
}

function markStep(stepNumber, ready) {
  const step = els.steps.find((item) => Number(item.dataset.step) === stepNumber);
  step?.classList.toggle('is-ready', ready);
}

function updateControls() {
  const hasSerial = 'serial' in navigator;
  const safetyConfirmed = els.safetyCheck.checked;

  els.connectButton.disabled = !hasSerial || !safetyConfirmed || isRunning;
  els.installButton.disabled = !hasSerial || !safetyConfirmed || !selectedPort || isRunning;

  markStep(1, safetyConfirmed);
  markStep(2, Boolean(selectedPort));
  markStep(3, Boolean(selectedPort) && safetyConfirmed);
}

async function loadManifest() {
  try {
    const response = await fetch('firmware/manifest.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const manifest = await response.json();

    els.firmwareName.textContent = manifest.name;
    els.firmwareVersion.textContent = manifest.version;
    els.firmwareTarget.textContent = manifest.target;
    els.firmwareBuild.textContent = manifest.build;
  } catch (error) {
    els.firmwareName.textContent = 'MOD1 Demo Firmware';
    els.firmwareVersion.textContent = '0.1.0-mock';
    els.firmwareTarget.textContent = 'Arduino Nano / ATmega328P';
    els.firmwareBuild.textContent = 'Mock';
    console.warn('manifest.jsonを読み込めませんでした。', error);
  }
}

function detectBrowserSupport() {
  const supported = 'serial' in navigator;
  els.browserBadge.textContent = supported ? 'Web Serial対応' : '非対応ブラウザー';
  els.browserBadge.classList.add(supported ? 'badge-ok' : 'badge-ng');

  if (!supported) {
    setError('このブラウザーはWeb Serialに対応していません。パソコン版Google ChromeまたはMicrosoft Edgeで開いてください。');
  }
  updateControls();
}

function formatUsbId(value) {
  return Number.isInteger(value)
    ? `0x${value.toString(16).padStart(4, '0').toUpperCase()}`
    : '取得できません';
}

async function selectSerialPort() {
  setError();
  els.resultPanel.hidden = true;

  try {
    // 正式版では、実機のUSB VID/PIDが確定したらfiltersを設定します。
    // 例: { filters: [{ usbVendorId: 0x1A86, usbProductId: 0x7523 }] }
    selectedPort = await navigator.serial.requestPort();
    const info = selectedPort.getInfo();

    els.deviceDetails.textContent = `VID ${formatUsbId(info.usbVendorId)} / PID ${formatUsbId(info.usbProductId)}`;
    els.deviceCard.hidden = false;
  } catch (error) {
    selectedPort = null;
    els.deviceCard.hidden = true;

    if (error.name !== 'NotFoundError') {
      setError(`USBデバイスを選択できませんでした：${error.message}`);
    }
  } finally {
    updateControls();
  }
}

const mockStages = [
  { progress: 5, label: '接続情報を確認中…', log: '[check] serial port selected' },
  { progress: 16, label: 'ファームウェア情報を確認中…', log: '[check] manifest: MOD1 Demo Firmware 0.1.0-mock' },
  { progress: 27, label: 'Arduino Nanoをリセット中…', log: '[mock] toggling reset sequence' },
  { progress: 39, label: 'ブートローダーへ接続中…', log: '[mock] stk500 handshake' },
  { progress: 55, label: 'ファームウェアを書き込み中…', log: '[mock] writing flash pages 1/3' },
  { progress: 72, label: 'ファームウェアを書き込み中…', log: '[mock] writing flash pages 2/3' },
  { progress: 87, label: '書き込み内容を検証中…', log: '[mock] verifying flash contents' },
  { progress: 100, label: '完了', log: '[done] mock installation completed' },
];

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function runMockInstall() {
  if (!selectedPort || isRunning) return;

  isRunning = true;
  setError();
  els.resultPanel.hidden = true;
  els.progressPanel.hidden = false;
  els.logOutput.textContent = '';
  updateControls();

  try {
    for (const stage of mockStages) {
      els.progressLabel.textContent = stage.label;
      els.progressPercent.textContent = `${stage.progress}%`;
      els.progressBar.style.width = `${stage.progress}%`;
      els.logOutput.textContent += `${stage.log}\n`;
      els.logOutput.scrollTop = els.logOutput.scrollHeight;
      await sleep(520);
    }

    els.resultPanel.hidden = false;
    els.resultPanel.focus();
  } catch (error) {
    setError(`モック処理中にエラーが発生しました：${error.message}`);
  } finally {
    isRunning = false;
    updateControls();
  }
}

els.safetyCheck.addEventListener('change', updateControls);
els.connectButton.addEventListener('click', selectSerialPort);
els.installButton.addEventListener('click', runMockInstall);

navigator.serial?.addEventListener('disconnect', (event) => {
  if (event.target === selectedPort) {
    selectedPort = null;
    els.deviceCard.hidden = true;
    setError('USBデバイスが切断されました。もう一度接続してください。');
    updateControls();
  }
});

await loadManifest();
detectBrowserSupport();
