# MOD1 Firmware Installer — UI Mock

HAGIWO MOD1向けWebファームウェア・インストーラーのUIモックです。

## 現在できること

- GitHub Pagesで静的サイトとして公開
- Web Serial対応ブラウザーの判定
- ユーザー操作によるUSBシリアルポート選択
- USB VID/PIDの表示
- 安全確認チェック
- モック進捗・ログ・完了画面の表示
- スマートフォン向けレイアウト

## 現在できないこと

- HEXファイルの読み込み
- Arduino Nanoへの書き込み
- AVRDUDE / WebAssemblyの実行
- 書き込み後のFlash検証

実機を書き換えないため、UI確認用として安全に使用できます。

## ローカル確認

単にindex.htmlを開くだけでも外観は確認できます。
Web Serialを試す場合は、localhostで配信します。

```bash
python3 -m http.server 8000
```

その後、ChromeまたはEdgeで次を開きます。

```text
http://localhost:8000/
```

## GitHub Pagesへの公開

`docs/GITHUB_PAGES_SETUP_JA.md` を参照してください。
