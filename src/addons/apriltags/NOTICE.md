# AprilTag detector notices

The `wasm/apriltag_wasm.{js,wasm}` files are generated from the
[AprilTag reference implementation](https://github.com/AprilRobotics/apriltag)
(BSD-2-Clause) plus the small `native/apriltag25h9.c` wrapper in this folder.

`scripts/build-apriltag-wasm.mjs` pins the exact source revision used for the
generated artifact: `b7c0ebe9aa20f82ec7a828579004f9e706bfecd9`. The initial
addon supports the `tag25h9` family only.
