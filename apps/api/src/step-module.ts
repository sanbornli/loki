// Validates the pinned WebAssembly step module for a `"server"`-authority
// game (see packages/protocol StepModuleDescriptorSchema). This is the
// upload-boundary check: a module that imports anything, or does not export
// exactly one function named `step`, is rejected before it is ever stored or
// handed to a worker. The worker fleet later fetches accepted modules by
// their sha256 (see StepModuleStore), so a room can never run bytes that did
// not pass this check.
import { createHash } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";

export const MAX_STEP_MODULE_BYTES = 5 * 1024 * 1024;

export interface WasmModuleShape {
  /** Number of entries in the import section (0 if there is none). */
  importCount: number;
  /** Names of every function-kind export, in declaration order. */
  functionExportNames: string[];
}

const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d];
const WASM_VERSION = [0x01, 0x00, 0x00, 0x00];

// Section ids from the WebAssembly binary format (release 1.0).
const SECTION_IMPORT = 2;
const SECTION_EXPORT = 7;

// Export kind byte: 0 = function, 1 = table, 2 = memory, 3 = global.
const EXPORT_KIND_FUNCTION = 0;

class ByteReader {
  readonly #bytes: Uint8Array;
  #offset: number;

  constructor(bytes: Uint8Array, offset = 0) {
    this.#bytes = bytes;
    this.#offset = offset;
  }

  get offset(): number {
    return this.#offset;
  }

  get remaining(): number {
    return this.#bytes.byteLength - this.#offset;
  }

  byte(): number {
    if (this.#offset >= this.#bytes.byteLength) {
      throw new Error("step module ended unexpectedly");
    }
    const value = this.#bytes[this.#offset]!;
    this.#offset += 1;
    return value;
  }

  bytes(length: number): Uint8Array {
    if (length < 0 || this.#offset + length > this.#bytes.byteLength) {
      throw new Error("step module ended unexpectedly");
    }
    const slice = this.#bytes.subarray(this.#offset, this.#offset + length);
    this.#offset += length;
    return slice;
  }

  skip(length: number): void {
    this.bytes(length);
  }

  /** Reads an unsigned LEB128 varuint32; WebAssembly never encodes one in more than 5 bytes. */
  u32Leb(): number {
    let result = 0;
    let shift = 0;
    for (let index = 0; index < 5; index += 1) {
      const byte = this.byte();
      result |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return result >>> 0;
      shift += 7;
    }
    throw new Error("malformed step module (varuint32 too long)");
  }

  utf8(length: number): string {
    return new TextDecoder().decode(this.bytes(length));
  }
}

/**
 * Walks a WebAssembly module's section headers just far enough to count
 * imports and collect function export names. It never fully decodes
 * function bodies, types, or instructions; every section is skipped to its
 * declared length once the (at most) two sections above are read.
 */
export function parseStepModule(bytes: Uint8Array): WasmModuleShape {
  if (bytes.byteLength < 8) throw new Error("not a WebAssembly module");
  for (let index = 0; index < 4; index += 1) {
    if (bytes[index] !== WASM_MAGIC[index]) {
      throw new Error("missing WebAssembly magic bytes");
    }
  }
  for (let index = 0; index < 4; index += 1) {
    if (bytes[4 + index] !== WASM_VERSION[index]) {
      throw new Error("unsupported WebAssembly binary version");
    }
  }
  const reader = new ByteReader(bytes, 8);
  let importCount = 0;
  const functionExportNames: string[] = [];
  while (reader.remaining > 0) {
    const sectionId = reader.byte();
    const sectionSize = reader.u32Leb();
    const sectionStart = reader.offset;
    if (sectionId === SECTION_IMPORT) {
      importCount = reader.u32Leb();
    } else if (sectionId === SECTION_EXPORT) {
      const count = reader.u32Leb();
      for (let index = 0; index < count; index += 1) {
        const nameLength = reader.u32Leb();
        const name = reader.utf8(nameLength);
        const kind = reader.byte();
        reader.u32Leb(); // export index; the descriptor is enough without it.
        if (kind === EXPORT_KIND_FUNCTION) functionExportNames.push(name);
      }
    }
    const consumed = reader.offset - sectionStart;
    const left = sectionSize - consumed;
    if (left < 0) throw new Error(`malformed WebAssembly section ${sectionId}`);
    if (left > 0) reader.skip(left);
  }
  return { importCount, functionExportNames };
}

/**
 * The upload-boundary check itself: throws with a specific, operator-facing
 * reason for every way a server-authority module can be rejected. A module
 * that passes this never needs another import/export check downstream; the
 * validator is the boundary, not the agent's prompt.
 */
export function validateStepModuleBytes(bytes: Uint8Array): void {
  if (bytes.byteLength === 0) throw new Error("step module is empty");
  if (bytes.byteLength > MAX_STEP_MODULE_BYTES) {
    throw new Error(
      `step module exceeds the ${MAX_STEP_MODULE_BYTES}-byte prototype limit`,
    );
  }
  const shape = parseStepModule(bytes);
  if (shape.importCount > 0) {
    throw new Error(
      `step module imports ${shape.importCount} host value(s); server-authority modules may import nothing (no WASI, clocks, randomness, or host functions)`,
    );
  }
  if (shape.functionExportNames.length !== 1 || shape.functionExportNames[0] !== "step") {
    throw new Error(
      'step module must export exactly one function, "step", and nothing else',
    );
  }
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Content-addressed storage for accepted step modules, shared across deployments. The simulation worker fetches module bytes by this same sha256 (see infra/worker), so a room stays on the exact build that passed validateStepModuleBytes. */
export interface StepModuleStore {
  putIfAbsent(sha256: string, bytes: Uint8Array): Promise<void>;
  get(sha256: string): Promise<Uint8Array | undefined>;
}

export class MemoryStepModuleStore implements StepModuleStore {
  readonly #modules = new Map<string, Uint8Array>();

  async putIfAbsent(sha256: string, bytes: Uint8Array): Promise<void> {
    if (!this.#modules.has(sha256)) {
      this.#modules.set(sha256, bytes.slice());
    }
  }

  async get(sha256: string): Promise<Uint8Array | undefined> {
    return this.#modules.get(sha256)?.slice();
  }
}

/**
 * Content-addressed step modules on local disk. A second process (or a
 * restarted API) reading the same directory sees modules written by the
 * first. Production uses R2StepModuleStore; this is the same contract for
 * a single machine.
 */
export class FileStepModuleStore implements StepModuleStore {
  constructor(readonly directory: string) {}

  async putIfAbsent(sha256: string, bytes: Uint8Array): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const file = path.join(this.directory, sha256);
    try {
      const handle = await open(file, "wx");
      try {
        await handle.write(bytes);
      } finally {
        await handle.close();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return;
      throw error;
    }
  }

  async get(sha256: string): Promise<Uint8Array | undefined> {
    try {
      return await readFile(path.join(this.directory, sha256));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }
}
