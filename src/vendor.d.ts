// The cr-sqlite Emscripten factory ships no types; declare the minimal shape.
declare module "@vlcn.io/wa-sqlite/dist/crsqlite.mjs" {
  const factory: (config?: {
    wasmBinary?: ArrayBuffer | Uint8Array;
    locateFile?: (file: string) => string;
  }) => Promise<unknown>;
  export default factory;
}
