import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isCompatibleBrowser, suggestOutName, ensureTrailingNewline } from '../../src/helper.js';
import { suggestZipName } from '../../src/helper.js';

describe('isCompatibleBrowser', () => {
  let originalTextEncoder, originalTextDecoder, originalDocument, originalUint8Array, originalArrayBuffer, originalBlob, originalURL, originalFile, originalPromise;

  beforeEach(() => {
    // Save originals
    originalTextEncoder = global.TextEncoder;
    originalTextDecoder = global.TextDecoder;
    originalDocument = global.document;
    originalUint8Array = global.Uint8Array;
    originalArrayBuffer = global.ArrayBuffer;
    originalBlob = global.Blob;
    originalURL = global.URL;
    originalFile = global.File;
    originalPromise = global.Promise;

    // Mock browser features
    global.TextEncoder = function () { };
    global.TextDecoder = function () { };
    global.document = {
      createElement: (tag) => ({ noModule: true, ondrop: true }),
    };
    global.Uint8Array = function () { };
    global.ArrayBuffer = function () { };
    global.Blob = function () { };
    global.URL = { createObjectURL: () => { } };
    global.File = function () { };
    global.Promise = Promise;
  });

  afterEach(() => {
    // Restore originals
    global.TextEncoder = originalTextEncoder;
    global.TextDecoder = originalTextDecoder;
    global.document = originalDocument;
    global.Uint8Array = originalUint8Array;
    global.ArrayBuffer = originalArrayBuffer;
    global.Blob = originalBlob;
    global.URL = originalURL;
    global.File = originalFile;
    global.Promise = originalPromise;
  });

  it('returns true when all features are present', () => {
    expect(isCompatibleBrowser()).toBe(true);
  });

  it('returns false when a feature is missing', () => {
    delete global.TextEncoder;
    expect(isCompatibleBrowser()).toBe(false);
  });
});

describe('suggestOutName', () => {
  it('adds suffix before extension', () => {
    expect(suggestOutName('file.epk', 'fixed')).toBe('file_fixed.epk');
  });
  it('throws if no extension is present', () => {
    expect(() => suggestOutName('file', 'fixed')).toThrow('Input filename must have an extension');
  });
});

describe('ensureTrailingNewline', () => {
  it('adds newline if missing', () => {
    expect(ensureTrailingNewline('abc')).toBe('abc\n');
  });
  it('does not change text with trailing newline', () => {
    expect(ensureTrailingNewline('abc\n')).toBe('abc\n');
  });
});

describe('suggestZipName', () => {
  it('returns timestamped name in UTC format', () => {
    // Use a fixed timestamp: 2020-01-02T03:04:05Z
    const ts = Date.UTC(2020, 0, 2, 3, 4, 5);
    const name = suggestZipName(ts, 'epks');
    expect(name).toBe('epks_2020-01-02_03-04-05.zip');
  });
});
