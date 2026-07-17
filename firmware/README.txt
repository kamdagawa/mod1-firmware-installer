このフォルダーは正式版でHEXファイルとmanifest.jsonを置く場所です。

モック版には実機へ書き込めるHEXを含めていません。
正式版では、例として次のような構成にします。

  firmware/
    mod1-your-firmware-v1.0.0.hex
    manifest.json

manifest.jsonにはファームウェア名、バージョン、対象MCU、HEXのパス、
SHA-256などを記録します。
