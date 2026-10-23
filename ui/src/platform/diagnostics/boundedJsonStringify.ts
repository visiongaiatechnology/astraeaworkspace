// STATUS: PLATIN — serializes JSON-shaped values while enforcing a UTF-8 output budget.

export type BoundedJsonSerializationFailureCode =
  | 'INVALID_LIMIT'
  | 'SIZE_LIMIT'
  | 'DEPTH_LIMIT'
  | 'NODE_LIMIT'
  | 'CYCLE'
  | 'ACCESSOR'
  | 'UNSUPPORTED_VALUE';

export class BoundedJsonSerializationError extends Error {
  constructor(readonly code: BoundedJsonSerializationFailureCode) {
    super(`Bounded JSON serialization rejected: ${code}`);
    this.name = 'BoundedJsonSerializationError';
  }
}

export interface BoundedJsonSerializationLimits {
  maxDepth?: number;
  maxNodes?: number;
}

const encoder = new TextEncoder();
const maxDepth = 128;
const maxNodes = 250_000;
const absoluteMaxNodes = 4_000_000;
const fragmentCodeUnits = 1_024;

export function stringifyJsonWithinUtf8ByteLimit(
  value: unknown,
  maxBytes: number,
  indent: 0 | 2 = 0,
  limits: BoundedJsonSerializationLimits = {},
): string {
  const depthLimit = limits.maxDepth ?? maxDepth;
  const nodeLimit = limits.maxNodes ?? maxNodes;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || (indent !== 0 && indent !== 2) ||
    !Number.isSafeInteger(depthLimit) || depthLimit < 1 || depthLimit > maxDepth ||
    !Number.isSafeInteger(nodeLimit) || nodeLimit < 1 || nodeLimit > absoluteMaxNodes) {
    throw new BoundedJsonSerializationError('INVALID_LIMIT');
  }

  const chunks: string[] = [];
  const activeObjects = new WeakSet<object>();
  let pending = '';
  let measuredBytes = 0;
  let visitedNodes = 0;

  const flush = (): void => {
    if (pending.length === 0) return;
    const chunkBytes = encoder.encode(pending).byteLength;
    if (measuredBytes + chunkBytes > maxBytes) {
      throw new BoundedJsonSerializationError('SIZE_LIMIT');
    }
    measuredBytes += chunkBytes;
    chunks.push(pending);
    pending = '';
  };

  const write = (fragment: string): void => {
    if (fragment.length === 0) return;
    pending += fragment;
    if (pending.length >= fragmentCodeUnits) flush();
  };

  const countNode = (): void => {
    visitedNodes += 1;
    if (visitedNodes > nodeLimit) throw new BoundedJsonSerializationError('NODE_LIMIT');
  };

  const writeIndent = (depth: number): void => {
    if (indent === 0) return;
    write('\n');
    write(' '.repeat(depth * indent));
  };

  const writeString = (text: string): void => {
    write('"');
    let runStart = 0;
    let index = 0;

    while (index < text.length) {
      const code = text.charCodeAt(index);
      let escaped: string | null = null;

      if (code === 0x22) escaped = '\\"';
      else if (code === 0x5c) escaped = '\\\\';
      else if (code === 0x08) escaped = '\\b';
      else if (code === 0x09) escaped = '\\t';
      else if (code === 0x0a) escaped = '\\n';
      else if (code === 0x0c) escaped = '\\f';
      else if (code === 0x0d) escaped = '\\r';
      else if (code < 0x20) escaped = `\\u${code.toString(16).padStart(4, '0')}`;
      else if (code >= 0xd800 && code <= 0xdbff) {
        const next = text.charCodeAt(index + 1);
        if (!(next >= 0xdc00 && next <= 0xdfff)) escaped = `\\u${code.toString(16).padStart(4, '0')}`;
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        const previous = text.charCodeAt(index - 1);
        if (!(previous >= 0xd800 && previous <= 0xdbff)) escaped = `\\u${code.toString(16).padStart(4, '0')}`;
      }

      if (escaped !== null) {
        if (index > runStart) write(text.slice(runStart, index));
        write(escaped);
        index += 1;
        runStart = index;
        continue;
      }

      if (index - runStart >= fragmentCodeUnits) {
        let end = index;
        const previous = text.charCodeAt(index - 1);
        if (code >= 0xdc00 && code <= 0xdfff && previous >= 0xd800 && previous <= 0xdbff) end += 1;
        write(text.slice(runStart, end));
        runStart = end;
        index = end;
        continue;
      }

      index += 1;
    }

    if (runStart < text.length) write(text.slice(runStart));
    write('"');
  };

  const writeValue = (current: unknown, depth: number, inArray: boolean): void => {
    if (depth > depthLimit) throw new BoundedJsonSerializationError('DEPTH_LIMIT');

    if (current === null) {
      write('null');
      return;
    }

    switch (typeof current) {
      case 'string':
        writeString(current);
        return;
      case 'boolean':
        write(current ? 'true' : 'false');
        return;
      case 'number':
        write(Number.isFinite(current) ? String(current) : 'null');
        return;
      case 'undefined':
      case 'function':
      case 'symbol':
        if (inArray) write('null');
        else throw new BoundedJsonSerializationError('UNSUPPORTED_VALUE');
        return;
      case 'bigint':
        throw new BoundedJsonSerializationError('UNSUPPORTED_VALUE');
      case 'object':
        break;
      default:
        throw new BoundedJsonSerializationError('UNSUPPORTED_VALUE');
    }

    const objectValue = current as object;
    if (activeObjects.has(objectValue)) throw new BoundedJsonSerializationError('CYCLE');

    if (Array.isArray(objectValue)) {
      if (Object.getPrototypeOf(objectValue) !== Array.prototype) {
        throw new BoundedJsonSerializationError('UNSUPPORTED_VALUE');
      }
      activeObjects.add(objectValue);
      try {
        write('[');
        for (let index = 0; index < objectValue.length; index += 1) {
          if (index > 0) write(',');
          if (indent > 0) writeIndent(depth + 1);
          countNode();
          const descriptor = Object.getOwnPropertyDescriptor(objectValue, String(index));
          if (!descriptor) {
            write('null');
          } else if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
            throw new BoundedJsonSerializationError('ACCESSOR');
          } else {
            writeValue(descriptor.value as unknown, depth + 1, true);
          }
        }
        if (objectValue.length > 0 && indent > 0) writeIndent(depth);
        write(']');
      } finally {
        activeObjects.delete(objectValue);
      }
      return;
    }

    const prototype = Object.getPrototypeOf(objectValue);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new BoundedJsonSerializationError('UNSUPPORTED_VALUE');
    }

    activeObjects.add(objectValue);
    try {
      write('{');
      let writtenProperties = 0;
      for (const key of Object.keys(objectValue)) {
        countNode();
        const descriptor = Object.getOwnPropertyDescriptor(objectValue, key);
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
          throw new BoundedJsonSerializationError('ACCESSOR');
        }
        const propertyValue = descriptor.value as unknown;
        if (key === 'toJSON' && typeof propertyValue === 'function') {
          throw new BoundedJsonSerializationError('UNSUPPORTED_VALUE');
        }
        if (propertyValue === undefined || typeof propertyValue === 'function' || typeof propertyValue === 'symbol') continue;

        if (writtenProperties > 0) write(',');
        if (indent > 0) writeIndent(depth + 1);
        writeString(key);
        write(indent > 0 ? ': ' : ':');
        writeValue(propertyValue, depth + 1, false);
        writtenProperties += 1;
      }
      if (writtenProperties > 0 && indent > 0) writeIndent(depth);
      write('}');
    } finally {
      activeObjects.delete(objectValue);
    }
  };

  countNode();
  writeValue(value, 0, false);
  flush();
  return chunks.join('');
}
