// Astraea PDF Studio compatibility bootstrap for the vendored PDF.js 6.3.289 worker.
// The upstream worker remains byte-identical; only missing modern JS convenience APIs are supplied.

if (typeof Math.sumPrecise !== 'function') {
  Math.sumPrecise = (values) => {
    let sum = 0;
    let compensation = 0;
    for (const value of values) {
      const adjusted = Number(value) - compensation;
      const next = sum + adjusted;
      compensation = (next - sum) - adjusted;
      sum = next;
    }
    return sum;
  };
}

if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}

if (typeof Promise.try !== 'function') {
  Promise.try = (callback, ...args) => Promise.resolve().then(() => callback(...args));
}

if (typeof Uint8Array.prototype.toHex !== 'function') {
  Object.defineProperty(Uint8Array.prototype, 'toHex', {
    configurable: true,
    writable: true,
    value() {
      let result = '';
      for (let index = 0; index < this.length; index += 1) result += this[index].toString(16).padStart(2, '0');
      return result;
    },
  });
}

if (typeof Uint8Array.fromBase64 !== 'function') {
  Object.defineProperty(Uint8Array, 'fromBase64', {
    configurable: true,
    writable: true,
    value(input) {
      if (typeof input !== 'string') throw new TypeError('Uint8Array.fromBase64 requires a string');
      const normalized = input.replace(/[\t\n\f\r ]+/g, '');
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 === 1) {
        throw new SyntaxError('Invalid base64 input');
      }
      const decoded = atob(normalized);
      const bytes = new Uint8Array(decoded.length);
      for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
      return bytes;
    },
  });
}


if (typeof Map.prototype.getOrInsertComputed !== 'function') {
  Object.defineProperty(Map.prototype, 'getOrInsertComputed', {
    configurable: true,
    writable: true,
    value(key, callback) {
      if (this.has(key)) return this.get(key);
      const value = callback(key);
      this.set(key, value);
      return value;
    },
  });
}

if (typeof ArrayBuffer.prototype.transferToFixedLength !== 'function') {
  Object.defineProperty(ArrayBuffer.prototype, 'transferToFixedLength', {
    configurable: true,
    writable: true,
    value(newLength = this.byteLength) {
      if (!Number.isInteger(newLength) || newLength < 0) throw new RangeError('Invalid ArrayBuffer length');
      const target = new ArrayBuffer(newLength);
      const copyLength = Math.min(this.byteLength, newLength);
      new Uint8Array(target, 0, copyLength).set(new Uint8Array(this, 0, copyLength));
      return target;
    },
  });
}

const { WorkerMessageHandler } = await import('./pdf.worker.min.mjs');
export { WorkerMessageHandler };
