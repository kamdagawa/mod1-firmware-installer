このフォルダーに実際のIntel HEXファイルを置き、manifest.jsonのhexFileを設定してください。

例:
  firmware/
    mod1-my-firmware-v1.0.0.hex
    manifest.json

manifest.json:
  "hexFile": "mod1-my-firmware-v1.0.0.hex"

sha256は任意ですが、配布時は設定を推奨します。
macOS:
  shasum -a 256 firmware/mod1-my-firmware-v1.0.0.hex

Linux:
  sha256sum firmware/mod1-my-firmware-v1.0.0.hex

hexFileがnullのままでも、ページ上でSDカード内のHEXを選択すれば実機へ書き込めます。
