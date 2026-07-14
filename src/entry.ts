export * from './xrblocks';

import * as sdk from './xrblocks';
import {registerDebugGlobals} from './debug/DebugGlobals';

declare global {
  interface Window {
    xb?: typeof sdk;
    xbReady?: Promise<void>;
  }
}

registerDebugGlobals(sdk);
