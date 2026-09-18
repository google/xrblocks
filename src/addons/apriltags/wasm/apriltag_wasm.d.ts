interface AprilTagWasmModule {
  HEAPU8: Uint8Array;
  HEAPF64: Float64Array;
  _atag_init(): number;
  _atag_destroy(): void;
  _atag_set_image_size(width: number, height: number): number;
  _atag_set_quad_decimate(value: number): void;
  _atag_detect(
    fx: number,
    fy: number,
    cx: number,
    cy: number,
    tagSizeMeters: number
  ): number;
  _atag_result_stride(): number;
  _atag_results_ptr(): number;
}

declare function createAprilTagWasm(options?: {
  locateFile?: (file: string) => string;
  print?: (text: string) => void;
  printErr?: (text: string) => void;
}): Promise<AprilTagWasmModule>;

export default createAprilTagWasm;
