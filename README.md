# MOD1 Firmware Installer —実機書き込み版

HAGIWO MOD1で使用されるArduino Nano（ATmega328P）へ、Chrome/EdgeのWeb Serial APIからIntel HEXを書き込む静的Webサイトです。

## 実装済み

- Web SerialによるUSBシリアルポート選択
- Intel HEXの構文・チェックサム・アドレス範囲検査
- 任意のSHA-256照合
- STK500v1ブートローダーへの直接書き込み
- 115200 / 57600 baudの自動試行
- ATmega328P署名（1E 95 0F）の確認
- 128 byteページ単位のFlash書き込み
- 全ページの読み戻し検証
- Web上の固定HEXとSDカード内HEXの両方に対応

## 最初に行う設定

1. `firmware/` に実際の `.hex` を置く
2. `firmware/manifest.json` の `hexFile`、名前、バージョン、ビルド日を変更
3. 任意でSHA-256とUSB VID/PIDを設定
4. GitHubへアップロードしてPagesを再デプロイ

詳細は `docs/DEPLOY_AND_TEST_JA.md` を参照してください。

## 重要

実機書き込みはハードウェア、USBシリアル変換チップ、ブートローダーの状態に依存します。最初は交換可能なNanoまたは復旧手段を用意し、必ず少数の実機で検証してください。
