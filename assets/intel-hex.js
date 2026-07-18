/**
 * Intel HEX parser for AVR application images.
 * Supports data, EOF, extended segment address and extended linear address records.
 */
export function parseIntelHex(text, { maxFlashBytes = 30720, pageSize = 128 } = {}) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new Error('HEXファイルが空です。');
  }
  if (!Number.isInteger(maxFlashBytes) || maxFlashBytes <= 0) {
    throw new Error('maxFlashBytesの設定が不正です。');
  }
  if (!Number.isInteger(pageSize) || pageSize <= 0 || pageSize % 2 !== 0) {
    throw new Error('pageSizeの設定が不正です。');
  }

  const memory = new Map();
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  let baseAddress = 0;
  let eofSeen = false;
  let dataRecordCount = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const raw = lines[lineIndex].trim();
    if (!raw) continue;
    if (eofSeen) {
      throw new Error(`HEX ${lineIndex + 1}行目: EOFレコード後にデータがあります。`);
    }
    if (!raw.startsWith(':')) {
      throw new Error(`HEX ${lineIndex + 1}行目: ':'で始まっていません。`);
    }

    const hex = raw.slice(1);
    if (hex.length < 10 || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
      throw new Error(`HEX ${lineIndex + 1}行目: レコード形式が不正です。`);
    }

    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }

    const byteCount = bytes[0];
    if (bytes.length !== byteCount + 5) {
      throw new Error(`HEX ${lineIndex + 1}行目: データ長が一致しません。`);
    }

    let checksum = 0;
    for (const value of bytes) checksum = (checksum + value) & 0xff;
    if (checksum !== 0) {
      throw new Error(`HEX ${lineIndex + 1}行目: チェックサムが一致しません。`);
    }

    const offset = (bytes[1] << 8) | bytes[2];
    const recordType = bytes[3];
    const data = bytes.slice(4, 4 + byteCount);

    switch (recordType) {
      case 0x00: {
        dataRecordCount += 1;
        const absoluteStart = baseAddress + offset;
        for (let i = 0; i < data.length; i += 1) {
          const address = absoluteStart + i;
          if (address >= maxFlashBytes) {
            throw new Error(
              `HEX ${lineIndex + 1}行目: アドレス0x${address.toString(16).toUpperCase()}が` +
              `アプリ領域上限0x${(maxFlashBytes - 1).toString(16).toUpperCase()}を超えています。`
            );
          }
          const previous = memory.get(address);
          if (previous !== undefined && previous !== data[i]) {
            throw new Error(`HEX ${lineIndex + 1}行目: アドレス0x${address.toString(16)}が重複しています。`);
          }
          memory.set(address, data[i]);
        }
        break;
      }
      case 0x01:
        if (byteCount !== 0) throw new Error(`HEX ${lineIndex + 1}行目: EOFレコードが不正です。`);
        eofSeen = true;
        break;
      case 0x02:
        if (byteCount !== 2) throw new Error(`HEX ${lineIndex + 1}行目: 拡張セグメントレコードが不正です。`);
        baseAddress = (((data[0] << 8) | data[1]) << 4) >>> 0;
        break;
      case 0x04:
        if (byteCount !== 2) throw new Error(`HEX ${lineIndex + 1}行目: 拡張リニアレコードが不正です。`);
        baseAddress = (((data[0] << 8) | data[1]) << 16) >>> 0;
        break;
      case 0x03:
      case 0x05:
        // Start-address records do not affect AVR flash programming.
        break;
      default:
        throw new Error(`HEX ${lineIndex + 1}行目: 未対応のレコード種別0x${recordType.toString(16)}です。`);
    }
  }

  if (!eofSeen) throw new Error('HEXファイルにEOFレコードがありません。');
  if (dataRecordCount === 0 || memory.size === 0) throw new Error('HEXファイルに書き込みデータがありません。');

  const addresses = [...memory.keys()];
  const minAddress = Math.min(...addresses);
  const maxAddress = Math.max(...addresses);
  const imageLength = Math.ceil((maxAddress + 1) / pageSize) * pageSize;
  const data = new Uint8Array(imageLength);
  data.fill(0xff);
  for (const [address, value] of memory) data[address] = value;

  const pages = [];
  for (let address = 0; address < imageLength; address += pageSize) {
    const bytes = data.slice(address, address + pageSize);
    // All pages through the final used page are written. This clears stale bytes in gaps.
    pages.push({ address, bytes });
  }

  return {
    data,
    pages,
    pageSize,
    minAddress,
    maxAddress,
    imageLength,
    bytesUsed: memory.size,
  };
}

export function formatHexSummary(image) {
  return `${image.bytesUsed.toLocaleString()} bytes / ${image.pages.length} pages / ` +
    `0x${image.minAddress.toString(16).toUpperCase()}–0x${image.maxAddress.toString(16).toUpperCase()}`;
}
