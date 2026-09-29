import {Handedness, Script, User, WebXRHandPoseEstimator} from 'xrblocks';
import {
  captureHand,
  type HandFrame,
  type HandLabel,
} from 'xrblocks/addons/interactive-ml/index.js';

/** Samples tracked joints without taking ownership of the user's hands. */
export class HandInput extends Script {
  static dependencies = {user: User};
  private user?: User;
  private estimator?: WebXRHandPoseEstimator;
  private lastSample = -Infinity;

  constructor(
    private readonly onFrame: (
      hand: HandLabel,
      frame: HandFrame | null
    ) => void,
    private readonly onError: (error: unknown) => void
  ) {
    super();
  }

  init({user}: {user: User}) {
    this.user = user;
    this.estimator = new WebXRHandPoseEstimator(user);
  }

  update() {
    const now = performance.now();
    if (now - this.lastSample < 40) return;
    this.lastSample = now;
    try {
      for (const [hand, index] of [
        ['left', Handedness.LEFT],
        ['right', Handedness.RIGHT],
      ] as const) {
        const tracked = this.user?.hands?.hands[index];
        const context =
          tracked?.visible && tracked.joints?.wrist?.visible
            ? this.estimator?.getHandContext(index)
            : null;
        this.onFrame(hand, context ? captureHand(context, now) : null);
      }
    } catch (error) {
      this.onError(error);
    }
  }
}
