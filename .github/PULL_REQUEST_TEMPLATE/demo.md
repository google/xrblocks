# Pull Request Template for New Demos and Samples

## Description

<!-- Brief description of the demo or sample, what features it demonstrates, and its path (e.g., `demos/my_demo/` or `samples/my_sample/`) -->

## Media / Screen Recordings & Screenshots

- **Simulator Recording**: <!-- Attach video/GIF showing demo/sample running in desktop simulator -->
- **Device Recording**: <!-- Attach video/GIF showing demo/sample running on physical hardware (e.g., Android XR) -->

## Testing Checklist

- [ ] **Tested in simulator**: Verified functionality using the desktop simulator.
- [ ] **Tested on device**: Verified functionality on physical hardware.

## Asset Requirements

- [ ] **Large Assets ($\ge$ 1MB)**: Assets 1MB or larger are **not** committed directly to this repository, but submitted via a separate PR to [xrblocks/proprietary-assets](https://github.com/xrblocks/proprietary-assets) and referenced via jsdelivr CDN link.

## SDK Changes (If Applicable)

If this PR includes changes to `src/` or introduces new external libraries:

- [ ] **Dynamic Dependencies**: I attest that all new dependencies are dynamically loaded at runtime.

## Security & API Keys

- [ ] **No Hardcoded Keys**: Confirmed no API keys, secrets, or credential tokens are committed in code.

## Documentation

- [ ] **README**: Included a `README.md` inside the demo/sample directory explaining how to run and interact with it.

## General Checks

- [ ] Ran `npm run lint` and fixed all warnings.
- [ ] Ran `npm run format`.
- [ ] Ran `npm test` and all tests pass.
- [ ] Third-party code/assets are properly licensed and attributed.
