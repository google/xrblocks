import * as THREE from 'three';

/**
 * InterpolatedPose: a tiny double-buffer that smooths incoming remote pose
 * snapshots by lerp/slerp between the previous and the latest sample.
 *
 * Network packets arrive at ~20Hz but we render at 60–120Hz; without
 * smoothing, remote avatars judder. We keep the last two snapshots and
 * blend between them based on (now - oldTs) / (newTs - oldTs), clamped to
 * [0, 1+overshoot] so a brief packet loss extrapolates instead of
 * snapping back.
 */
const MAX_EXTRAPOLATION = 0.25; // up to 25% past the latest sample
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
class InterpolatedPose {
    constructor() {
        this._scratch = {
            head: { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() },
            hands: [
                {
                    present: false,
                    position: new THREE.Vector3(),
                    quaternion: new THREE.Quaternion(),
                },
                {
                    present: false,
                    position: new THREE.Vector3(),
                    quaternion: new THREE.Quaternion(),
                },
            ],
        };
    }
    /** Push a freshly-received snapshot. */
    push(snapshot, ts) {
        // Drop snapshots that arrived out of order so a delayed older frame
        // can't lerp the avatar backwards. Ordered datachannels make this
        // unlikely today, but unordered transports (or clock skew on a peer
        // hop) would otherwise produce visible jitter.
        if (this._next && ts < this._next.ts)
            return;
        this._prev = this._next ?? { ts, snapshot };
        this._next = { ts, snapshot };
    }
    /** Has any snapshot ever been received. */
    get hasData() {
        return !!this._next;
    }
    /** ms of the most recent snapshot. */
    get latestTs() {
        return this._next?.ts ?? 0;
    }
    /**
     * Sample the smoothed pose at `now`. The returned object is reused across
     * calls — clone it if you need to retain it.
     */
    sample(now) {
        if (!this._next)
            return this._scratch;
        if (!this._prev || this._prev === this._next) {
            copySnapshot(this._next.snapshot, this._scratch);
            return this._scratch;
        }
        const span = Math.max(this._next.ts - this._prev.ts, 1);
        let t = (now - this._prev.ts) / span;
        if (t < 0)
            t = 0;
        if (t > 1 + MAX_EXTRAPOLATION)
            t = 1 + MAX_EXTRAPOLATION;
        // Head
        _pos.lerpVectors(this._prev.snapshot.head.position, this._next.snapshot.head.position, t);
        _quat
            .copy(this._prev.snapshot.head.quaternion)
            .slerp(this._next.snapshot.head.quaternion, t);
        this._scratch.head.position.copy(_pos);
        this._scratch.head.quaternion.copy(_quat);
        // Hands
        for (let h = 0; h < 2; h++) {
            const a = this._prev.snapshot.hands[h];
            const b = this._next.snapshot.hands[h];
            const dst = this._scratch.hands[h];
            dst.present = b.present;
            if (!b.present)
                continue;
            if (a.present) {
                dst.position.lerpVectors(a.position, b.position, t);
                dst.quaternion.copy(a.quaternion).slerp(b.quaternion, t);
                if (a.joints && b.joints) {
                    if (!dst.joints)
                        dst.joints = b.joints.map((v) => v.clone());
                    for (let j = 0; j < b.joints.length; j++) {
                        dst.joints[j].lerpVectors(a.joints[j], b.joints[j], t);
                    }
                }
                else {
                    dst.joints = b.joints?.map((v) => v.clone());
                }
            }
            else {
                dst.position.copy(b.position);
                dst.quaternion.copy(b.quaternion);
                dst.joints = b.joints?.map((v) => v.clone());
            }
        }
        return this._scratch;
    }
}
function copyHand(src, dst) {
    dst.present = src.present;
    dst.position.copy(src.position);
    dst.quaternion.copy(src.quaternion);
    if (src.joints) {
        if (!dst.joints || dst.joints.length !== src.joints.length) {
            dst.joints = src.joints.map((v) => v.clone());
        }
        else {
            for (let i = 0; i < src.joints.length; i++)
                dst.joints[i].copy(src.joints[i]);
        }
    }
    else {
        dst.joints = undefined;
    }
}
function copySnapshot(src, dst) {
    dst.head.position.copy(src.head.position);
    dst.head.quaternion.copy(src.head.quaternion);
    copyHand(src.hands[0], dst.hands[0]);
    copyHand(src.hands[1], dst.hands[1]);
}

export { InterpolatedPose };
