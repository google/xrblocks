import * as THREE from 'three';
import { BroadcastChannelTransport } from 'netblocks';
import { NetSample } from '../../Sample.js';
import 'xrblocks';
import 'xrblocks/addons/simulator/SimulatorAddons.js';
import '../../roomCode.js';

const PARTICLES_PER_BURST = 24;
const BURST_LIFETIME_MS = 1200;
class EventsSample extends NetSample {
    constructor() {
        super(...arguments);
        this._bursts = [];
    }
    getJoinOptions() {
        return {
            roomId: 'netblocks-sample-events',
            options: {
                transport: new BroadcastChannelTransport(),
                displayName: `User-${Math.floor(Math.random() * 1000)}`,
            },
        };
    }
    onSession(session) {
        session.events.on('emoji-burst', (payload) => {
            this._spawnBurst(payload);
        });
        // Click anywhere to broadcast.
        window.addEventListener('pointerdown', () => {
            const payload = {
                x: (Math.random() - 0.5) * 1.5,
                y: 1.2 + (Math.random() - 0.5) * 0.4,
                z: -1,
                hue: Math.random(),
            };
            session.events.emit('emoji-burst', payload);
            this._spawnBurst(payload); // local echo
        });
    }
    _spawnBurst(p) {
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
        this._bursts.push({ points, velocities, bornAt: performance.now() });
    }
    update(time, frame) {
        super.update(time, frame);
        const now = performance.now();
        const dt = 1 / 60;
        for (let i = this._bursts.length - 1; i >= 0; i--) {
            const b = this._bursts[i];
            const age = now - b.bornAt;
            if (age > BURST_LIFETIME_MS) {
                this.remove(b.points);
                b.points.geometry.dispose();
                b.points.material.dispose();
                this._bursts.splice(i, 1);
                continue;
            }
            const pos = b.points.geometry.getAttribute('position');
            for (let j = 0; j < pos.count; j++) {
                pos.setXYZ(j, pos.getX(j) + b.velocities[j * 3] * dt, pos.getY(j) + b.velocities[j * 3 + 1] * dt - 0.6 * dt, pos.getZ(j) + b.velocities[j * 3 + 2] * dt);
                b.velocities[j * 3 + 1] -= 1.5 * dt; // gravity
            }
            pos.needsUpdate = true;
            b.points.material.opacity =
                1 - age / BURST_LIFETIME_MS;
        }
    }
}
NetSample.run(EventsSample);
