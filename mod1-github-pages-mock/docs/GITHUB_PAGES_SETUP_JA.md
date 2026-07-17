# GitHub Pagesへの公開手順

## 1. リポジトリを作成

GitHub右上の「+」から「New repository」を選択します。
例としてリポジトリ名を `mod1-firmware-installer` にします。

公開サイトとして使う場合はPublicを選択します。

## 2. ファイルをアップロード

このZIPを展開し、中身をリポジトリ直下へアップロードします。
`index.html` がリポジトリ直下に見える状態にしてください。

## 3. GitHub Pagesを有効化

リポジトリの次の画面を開きます。

Settings → Pages

「Build and deployment」のSourceで `Deploy from a branch` を選択します。
Branchを `main`、フォルダーを `/(root)` にしてSaveします。

## 4. 公開URLを確認

数分後、Pages画面に公開URLが表示されます。
一般的には次の形式です。

https://YOUR-GITHUB-NAME.github.io/mod1-firmware-installer/

## 5. モックを確認

パソコン版Google ChromeまたはMicrosoft Edgeで開きます。

- 「Eurorack電源を外しました」をチェック
- 「USBデバイスを選択」を押す
- Arduino Nanoのシリアルポートを選択
- 「モック書き込みを開始」を押す

モック書き込みは進捗表示だけで、実機の内容を変更しません。

## 6. 更新方法

GitHub上でファイルを編集または再アップロードし、mainブランチへ反映すると、
GitHub Pages側も更新されます。
