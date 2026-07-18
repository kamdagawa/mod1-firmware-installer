# 実機書き込み版の設定・公開・試験手順

## 1. HEXを配置する

Arduino IDEで「コンパイルしたバイナリを出力」して得たIntel HEXを、`firmware/` にコピーします。

例:

```text
firmware/mod1-my-firmware-v1.0.0.hex
```

`with_bootloader.hex`ではなく、通常のスケッチHEXを使用してください。

## 2. manifest.jsonを変更する

```json
{
  "name": "My MOD1 Firmware",
  "version": "1.0.0",
  "target": "HAGIWO MOD1 / Arduino Nano / ATmega328P",
  "build": "2026-07-18",
  "hexFile": "mod1-my-firmware-v1.0.0.hex",
  "sha256": "",
  "usbFilters": [],
  "upload": {
    "baudRates": [115200, 57600],
    "pageSize": 128,
    "maxFlashBytes": 30720,
    "expectedSignature": "1e950f",
    "verify": true
  }
}
```

### ブートローダー速度が固定されている場合

旧ブートローダーなら:

```json
"baudRates": [57600]
```

新ブートローダーなら:

```json
"baudRates": [115200]
```

不明な場合は `[115200, 57600]` のままで構いません。

## 3. SHA-256を設定する

macOS:

```bash
shasum -a 256 firmware/mod1-my-firmware-v1.0.0.hex
```

表示された64文字を`sha256`へ貼ります。未設定でも書き込めますが、Web配布では設定を推奨します。

## 4. VID/PIDを固定する（任意）

モックで表示されたVID/PIDが、例として`0x1A86 / 0x7523`なら:

```json
"usbFilters": [
  { "usbVendorId": 6790, "usbProductId": 29987 }
]
```

JSONでは10進数で記述します。固定しない場合は空配列のままです。

## 5. GitHubへ反映する

リポジトリ直下の次の項目を置き換えます。

```text
index.html
assets/
firmware/
docs/
README.md
.nojekyll
```

GitHub Pagesは`main`ブランチの`/ (root)`から公開します。

## 6. 最初の実機試験

1. 現在の正常なHEXと復旧手順を保存する
2. 交換可能なArduino NanoまたはISPライターを用意する
3. Eurorack電源を外す
4. Chrome/Edgeでページを開く
5. Nanoを選択する
6. まず既知の小さなテストHEXで書き込む
7. 完了表示と読み戻し検証を確認する
8. USBを外してからEurorack電源を入れる
9. 全入出力、ノブ、LEDなどを確認する

## 7. エラー別確認

### ブートローダーと同期できない

- USBデータケーブルを変更
- USBハブを外す
- `baudRates`の順序を入れ替える
- NanoのRESETボタンを押して直後に再試行
- 別のChrome/Edge環境で確認

### 対象MCUが一致しない

ATmega328P以外、または通信が崩れている可能性があります。`expectedSignature`を無効化せず、実機を確認してください。

### 検証に失敗する

- 電源・USB接続を確認
- 別のNanoで再試験
- HEXが30,720 bytes以内か確認
- ブートローダー領域やFlash不良を確認

## 8. SDカードからの利用

Web版HEXを置かなくても、`hexFile: null`のままページを公開できます。利用者は「SDカード内のHEXを使用する場合」から配布HEXを選び、そのまま書き込めます。

初心者向けの正式運用では、Web上にも同一HEXを置き、ファイル選択は復旧用として残す構成を推奨します。
