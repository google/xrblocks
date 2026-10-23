import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';

import {FacesOptions} from '../faces/FacesOptions';
import {HumansOptions} from '../humans/HumansOptions';
import {SegmentationOptions} from '../segmentation/SegmentationOptions';
import {MEDIAPIPE_MODULE_URL} from './MediaPipeVisionWorker';

const packageJson = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../package.json'), 'utf8')
) as {devDependencies: Record<string, string>};
const version = packageJson.devDependencies['@mediapipe/tasks-vision'].replace(
  /^[\^~]/,
  ''
);

describe('MediaPipe CDN URLs', () => {
  it('pin the tasks-vision version the SDK is built against', () => {
    const urls = [
      MEDIAPIPE_MODULE_URL,
      new FacesOptions().backendConfig.mediapipe.wasmFilesUrl,
      new HumansOptions().backendConfig.mediapipe.wasmFilesUrl,
      new SegmentationOptions().backendConfig.mediapipe.wasmFilesUrl,
    ];
    for (const url of urls) {
      expect(url).toContain(`/@mediapipe/tasks-vision@${version}/`);
    }
  });
});
