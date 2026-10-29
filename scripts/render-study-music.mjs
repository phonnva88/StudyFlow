// Original ambient compositions synthesized from sine waves, with no samples.
// This source and its generated audio are dedicated to the public domain (CC0).
import { mkdir, writeFile } from 'node:fs/promises';
const rate = 22050, seconds = 45, count = rate * seconds;
const pieces = {
  'quiet-orbit': [[48, 55, 60, 64], [45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59]],
  'soft-morning': [[50, 57, 62, 65], [46, 53, 58, 62], [48, 55, 60, 64], [45, 52, 57, 60]],
};
await mkdir('public/music', { recursive: true });
for (const [name, chords] of Object.entries(pieces)) {
  const buffer = Buffer.alloc(44 + count * 2);
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28); buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) {
    const t = i / rate;
    let value = 0;
    for (let chord = 0; chord < 4; chord++) {
      const start = chord * 10, age = t - start;
      if (age < 0 || age > 15) continue;
      const envelope = Math.sin(Math.PI * age / 15) ** 2;
      for (const note of chords[chord]) {
        const frequency = 440 * 2 ** ((note - 69) / 12);
        value += Math.sin(2 * Math.PI * frequency * t) * envelope * 0.035;
        value += Math.sin(2 * Math.PI * frequency * 2 * t) * envelope * 0.008;
      }
    }
    const fade = Math.min(1, t / 2, (seconds - t) / 3);
    buffer.writeInt16LE(Math.round(value * fade * 32767), 44 + i * 2);
  }
  await writeFile(`public/music/${name}.wav`, buffer);
}
