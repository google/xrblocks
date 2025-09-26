import * as THREE from 'three';

import {KeyEvent, Script, SelectEvent} from '../Script';

type MaybeScript = THREE.Object3D&{isXRScript?: boolean};

export class ScriptsManager {
  /** The set of all currently initialized scripts. */
  scripts = new Set<Script>();

  callSelectStartBound = this.callSelectStart.bind(this);
  callSelectEndBound = this.callSelectEnd.bind(this);
  callSelectBound = this.callSelect.bind(this);
  callSqueezeStartBound = this.callSqueezeStart.bind(this);
  callSqueezeEndBound = this.callSqueezeEnd.bind(this);
  callSqueezeBound = this.callSqueeze.bind(this);
  callKeyDownBound = this.callKeyDown.bind(this);
  callKeyUpBound = this.callKeyUp.bind(this);

  /** The set of scripts currently being initialized. */
  private initializingScripts = new Set<Script>();

  constructor(private initScriptFunction: (script: Script) => Promise<void>) {}

  /**
   * Initializes a script and adds it to the set of scripts which will receive
   * callbacks. This will be called automatically by Core when a script is found
   * in the scene but can also be called manually.
   * @param script - The script to initialize
   * @returns A promise which resolves when the script is initialized.
   */
  async initScript(script: Script) {
    if (this.scripts.has(script) || this.initializingScripts.has(script)) {
      return;
    }
    this.initializingScripts.add(script);
    await this.initScriptFunction(script);
    this.scripts.add(script);
    this.initializingScripts.delete(script);
  }

  /**
   * Uninitializes a script calling dispose and removes it from the set of
   * scripts which will receive callbacks.
   * @param script - The script to uninitialize.
   */
  uninitScript(script: Script) {
    if (!this.scripts.has(script)) {
      return;
    }
    script.dispose();
    this.scripts.delete(script);
    this.initializingScripts.delete(script);
  }

  /**
   * Finds all scripts in the scene and initializes them or uninitailizes them.
   * Returns a promise which resolves when all new scripts are finished
   * initalizing.
   * @param scene - The main scene which is used to find scripts.
   */
  async syncScriptsWithScene(scene: THREE.Scene) {
    const seenScripts = new Set<Script>();
    const promises: Promise<void>[] = [];
    scene.traverse((obj) => {
      if ((obj as MaybeScript).isXRScript) {
        const script = obj as Script;
        promises.push(this.initScript(script));
        seenScripts.add(script);
      }
    });
    await Promise.allSettled(promises);
    // Delete missing scripts.
    for (const script of this.scripts) {
      if (!seenScripts.has(script)) {
        this.uninitScript(script);
      }
    }
  }

  callSelectStart(event: SelectEvent) {
    for (const script of this.scripts) {
      script.onSelectStart(event);
    }
  }

  callSelectEnd(event: SelectEvent) {
    for (const script of this.scripts) {
      script.onSelectEnd(event);
    }
  }

  callSelect(event: SelectEvent) {
    for (const script of this.scripts) {
      script.onSelect(event);
    }
  }

  callSqueezeStart(event: SelectEvent) {
    for (const script of this.scripts) {
      script.onSqueezeStart(event);
    }
  }

  callSqueezeEnd(event: SelectEvent) {
    for (const script of this.scripts) {
      script.onSqueezeEnd(event);
    }
  }

  callSqueeze(event: SelectEvent) {
    for (const script of this.scripts) {
      script.onSqueeze(event);
    }
  }

  callKeyDown(event: KeyEvent) {
    for (const script of this.scripts) {
      script.onKeyDown(event);
    }
  }

  callKeyUp(event: KeyEvent) {
    for (const script of this.scripts) {
      script.onKeyUp(event);
    }
  }

  onXRSessionStarted(session: XRSession) {
    for (const script of this.scripts) {
      script.onXRSessionStarted(session);
    }
  }

  onXRSessionEnded() {
    for (const script of this.scripts) {
      script.onXRSessionEnded();
    }
  }

  onSimulatorStarted() {
    for (const script of this.scripts) {
      script.onSimulatorStarted();
    }
  }
}
