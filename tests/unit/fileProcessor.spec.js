import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleFiles } from '../../src/fileProcessor.js';

function makeFile(name, size = 10) {
  // Minimal File-like object for tests
  return new File([new Uint8Array(size)], name, { type: 'application/octet-stream' });
}

describe('handleFiles', () => {
  let fixOne, combineMulti, autoDownload, singleOutNamer;

  beforeEach(() => {
    fixOne = vi.fn();
    combineMulti = vi.fn(() => Promise.resolve());
    autoDownload = vi.fn(() => Promise.resolve());
    singleOutNamer = vi.fn((name) => name);
  });

  it('downloads single fixed file when changed', async () => {
    const file = makeFile('a.epk');
    const blob = new Blob(['ok']);
    fixOne.mockResolvedValue({ name: 'a_fixed.epk', blob, changed: true });

    await handleFiles([file], { fixOne, combineMulti, autoDownload, singleOutNamer });

    expect(fixOne).toHaveBeenCalledTimes(1);
    expect(autoDownload).toHaveBeenCalledWith(blob, 'a_fixed.epk');
  });

  it('does not download single file when unchanged', async () => {
    const file = makeFile('b.epk');
    fixOne.mockResolvedValue({ name: 'b.epk', blob: file, changed: false });

    await handleFiles([file], { fixOne, combineMulti, autoDownload, singleOutNamer });

    expect(fixOne).toHaveBeenCalledTimes(1);
    expect(autoDownload).not.toHaveBeenCalled();
  });

  it('zips multiple files and downloads zip', async () => {
    const f1 = makeFile('one.epk');
    const f2 = makeFile('two.epk');
    const b1 = new Blob(['1']);
    const b2 = new Blob(['2']);
    fixOne.mockResolvedValueOnce({ name: 'one_fixed.epk', blob: b1, changed: true });
    fixOne.mockResolvedValueOnce({ name: 'two_fixed.epk', blob: b2, changed: true });
    const zip = new Blob(['zip']);

    await handleFiles([f1, f2], { fixOne, combineMulti, autoDownload, singleOutNamer });

    expect(combineMulti).toHaveBeenCalledTimes(1);
  });
});
