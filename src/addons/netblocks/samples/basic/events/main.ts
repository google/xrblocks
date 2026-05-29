import * as THREE from 'three';
import {BroadcastChannelTransport} from 'netblocks';
import {NetSample} from '../../Sample';

/**
 * EventsSample.
 *
 * Click the page (or pinch in XR) to "fire" an emoji burst — a short
 * particle puff that everyone in the room sees. The burst is broadcast as
 * a single `emoji-burst` RPC carrying just an origin + a color seed; all
 * peers (including the sender) materialize the same burst from that
 * payload. This is the canonical netblocks pattern for chat, reactions,
 * cursor pings, etc.
 */
interface BurstPayload {
  x: number;
  y: number;
  z: number;
  hue: number;
}

const PARTICLES_PER_BURST = 24;
const BURST_LIFETIME_MS = 1200;

class EventsSample extends NetSample {
  private _bursts: Array<{
    points: THREE.Points;
    velocities: Float32Array;
    bornAt: number;
  }> = [];

  protected getJoinOptions() {
    return {
      roomId: 'netblocks-sample-events',
      options: {
        transport: new BroadcastChannelTransport(),
        displayName: `User-${Math.floor(Math.random() * 1000)}`,
      },
    };
  }

  protected onSession(session: NonNullable<this['net']['session']>) {
    session.events.on<BurstPayload>('emoji-burst', (payload) => {
      this._spawnBurst(payload);
    });

    // Click anywhere to broadcast.
    window.addEventListener('pointerdown', () => {
      const payload: BurstPayload = {
        x: (Math.random() - 0.5) * 1.5,
        y: 1.2 + (Math.random() - 0.5) * 0.4,
        z: -1,
        hue: Math.random(),
      };
      session.events.emit('emoji-burst', payload);
      this._spawnBurst(payload); // local echo
    });
  }

  private _spawnBurst(p: BurstPayload) {
    const positions = new Float32Array(PARTICLES_PER_BURST * 3);
    const velocities = new Float32Array(PARTICLES_PER_BURST * 3);
    for (let i = 0; i < PARTICLES_PER_BURST; i++) {
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 0.4 + Math.random() * 0.4;
      velocities[i * 3] = speed * Math.sin(phi) * Math.cos(theta);
      velocities[i * 3 + 1] = speed * Math.cos(phi) + 0.4;
      velocities[i * 3 + 2] = speed * Math.sin(phi) * Math.sin(theta);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const color = new THREE.Color().setHSL(p.hue, 0.85, 0.6);
    const mat = new THREE.PointsMaterial({
      color,
      size: 0.04,
      transparent: true,
    });
    const points = new THREE.Points(geom, mat);
    this.add(points);
    this._bursts.push({points, velocities, bornAt: performance.now()});
  }

  update(time?: number, frame?: XRFrame) {
    super.update(time, frame);
    const now = performance.now();
    const dt = 1 / 60;
    for (let i = this._bursts.length - 1; i >= 0; i--) {
      const b = this._bursts[i];
      const age = now - b.bornAt;
      if (age > BURST_LIFETIME_MS) {
        this.remove(b.points);
        b.points.geometry.dispose();
        (b.points.material as THREE.Material).dispose();
        this._bursts.splice(i, 1);
        continue;
      }
      const pos = b.points.geometry.getAttribute(
        'position'
      ) as THREE.BufferAttribute;
      for (let j = 0; j < pos.count; j++) {
        pos.setXYZ(
          j,
          pos.getX(j) + b.velocities[j * 3] * dt,
          pos.getY(j) + b.velocities[j * 3 + 1] * dt - 0.6 * dt,
          pos.getZ(j) + b.velocities[j * 3 + 2] * dt
        );
        b.velocities[j * 3 + 1] -= 1.5 * dt; // gravity
      }
      pos.needsUpdate = true;
      (b.points.material as THREE.PointsMaterial).opacity =
        1 - age / BURST_LIFETIME_MS;
    }
  }
}

NetSample.run(EventsSample);
