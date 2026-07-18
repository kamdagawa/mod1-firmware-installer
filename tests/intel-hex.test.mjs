import assert from 'node:assert/strict';
import { parseIntelHex } from '../assets/intel-hex.js';

const valid = [
  ':100000000C945C000C946E000C946E000C946E00CA',
  ':00000001FF',
].join('\n');
const image = parseIntelHex(valid, { maxFlashBytes: 30720, pageSize: 128 });
assert.equal(image.bytesUsed, 16);
assert.equal(image.imageLength, 128);
assert.equal(image.data[0], 0x0c);
assert.equal(image.data[15], 0x00);
assert.equal(image.data[16], 0xff);

assert.throws(() => parseIntelHex(':0100000000FE\n:00000001FF'), /チェックサム/);
assert.throws(() => parseIntelHex(':020000040001F9\n:0100000000FF\n:00000001FF', { maxFlashBytes: 30720 }), /上限/);
assert.throws(() => parseIntelHex(':0100000000FF'), /EOF/);

console.log('intel-hex tests: OK');
