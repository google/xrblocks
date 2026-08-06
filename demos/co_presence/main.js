import {BroadcastChannelTransport, enableNet, WebRTCTransport} from 'netblocks';
import * as THREE from 'three';
import * as xb from 'xrblocks';

const ROOM_ALPHABET = 'BCDFGHJKLMNPQRSTVWXYZ';
const ROOM_LENGTH = 4;

function getRoomCode() {
  const value = new URLSearchParams(location.search).get('room');
  const code = value?.toUpperCase().replace(/[^A-Z]/g, '') ?? '';
  return code.length === ROOM_LENGTH ? code : null;
}

function generateRoomCode() {
  let code = '';
  for (let index = 0; index < ROOM_LENGTH; index++) {
    code += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  }
  return code;
}

function navigateToRoom(code) {
  const url = new URL(location.href);
  if (code) url.searchParams.set('room', code);
  else url.searchParams.delete('room');
  location.href = url.toString();
}

class CoPresence extends xb.Script {
  constructor() {
    super();
    this.roomCode = getRoomCode();
    this.displayName = `Visitor ${Math.floor(100 + Math.random() * 900)}`;
    this.lastPeerCount = -1;
  }

  async init() {
    this.buildScene();
    this.buildControls();
    this.net = enableNet();

    const transport = this.roomCode
      ? new WebRTCTransport()
      : new BroadcastChannelTransport();
    const roomId = this.roomCode
      ? `xrblocks-co-presence-${this.roomCode}`
      : 'xrblocks-co-presence-local';

    this.status.text = 'Connecting…';
    try {
      this.session = await this.net.joinRoom(roomId, {
        transport,
        displayName: this.displayName,
        presenceHz: 60,
      });
      this.session.addEventListener('user-join', () => this.refreshStatus());
      this.session.addEventListener('user-leave', () => this.refreshStatus());
      this.refreshStatus();
    } catch (error) {
      console.error('[demos/co_presence]', error);
      this.status.text = `Connection failed: ${error.message}`;
      this.status.style.color = '#ff9a9a';
    }
  }

  buildScene() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x35445c, 2));
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.6, 48),
      new THREE.MeshBasicMaterial({
        color: 0x1b2633,
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.002;
    floor.ignoreReticleRaycast = true;
    this.add(floor);
  }

  buildControls() {
    const modeText = this.roomCode
      ? `Shared room ${this.roomCode}`
      : 'Local room · open this page in another tab';
    this.status = new xb.UIText({
      text: 'Preparing room…',
      style: {fontSize: 18, color: '#64e6ba', textAlign: 'center'},
    });

    const buttons = this.roomCode
      ? [
          new xb.UIButton({
            label: 'Copy room code',
            icon: 'content_copy',
            onClick: () => this.copyRoomCode(),
            style: this.buttonStyle('#285e4c'),
          }),
          new xb.UIButton({
            label: 'Leave room',
            icon: 'logout',
            onClick: () => navigateToRoom(null),
            style: this.buttonStyle('#343d4b'),
          }),
        ]
      : [
          new xb.UIButton({
            label: 'Start shared room',
            icon: 'group_add',
            onClick: () => navigateToRoom(generateRoomCode()),
            style: this.buttonStyle('#285e4c'),
          }),
          new xb.UIButton({
            label: 'Join with code',
            icon: 'login',
            onClick: () => this.promptForRoom(),
            style: this.buttonStyle('#343d4b'),
          }),
        ];

    const card = new xb.UICard({
      size: {width: 0.62, height: 0.4},
      manipulation: true,
      edge: {scale: true},
      style: {
        padding: 24,
        gap: 14,
        flexDirection: 'column',
        backgroundColor: '#121821',
        borderColor: '#354253',
        borderWidth: 1,
        borderRadius: 24,
      },
      children: [
        new xb.UIText({
          text: 'Co-presence',
          style: {
            fontSize: 28,
            fontWeight: 'bold',
            color: '#f2f5fb',
            textAlign: 'center',
          },
        }),
        new xb.UIText({
          text: modeText,
          style: {
            fontSize: 15,
            lineHeight: 1.35,
            color: '#aeb8ca',
            textAlign: 'center',
          },
        }),
        this.status,
        new xb.UIPanel({
          style: {width: '100%', flexDirection: 'row', gap: 10},
          children: buttons,
        }),
      ],
    });
    card.position.set(0, 1.45, -1.1);
    this.add(card);
  }

  buttonStyle(backgroundColor) {
    return {
      flexGrow: 1,
      height: 54,
      padding: 10,
      backgroundColor,
      color: '#ffffff',
      borderRadius: 14,
      fontSize: 16,
      ':hover': {backgroundColor: '#425165'},
      ':active': {backgroundColor: '#1f493b'},
    };
  }

  promptForRoom() {
    const value = window.prompt('Enter the four-letter room code');
    const code = value?.toUpperCase().replace(/[^A-Z]/g, '') ?? '';
    if (code.length === ROOM_LENGTH) navigateToRoom(code);
    else if (value !== null) this.status.text = 'Room codes use four letters';
  }

  async copyRoomCode() {
    if (!this.roomCode) return;
    try {
      await navigator.clipboard.writeText(this.roomCode);
      this.status.text = `Copied room ${this.roomCode}`;
    } catch {
      this.status.text = `Room code: ${this.roomCode}`;
    }
  }

  update() {
    const peerCount = this.session?.users.size ?? 0;
    if (peerCount !== this.lastPeerCount) this.refreshStatus();
  }

  refreshStatus() {
    if (!this.session) return;
    this.lastPeerCount = this.session.users.size;
    const peers = this.lastPeerCount === 1 ? 'peer' : 'peers';
    this.status.text = `${this.displayName} · ${this.lastPeerCount} remote ${peers}`;
  }

  dispose() {
    this.net?.dispose();
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  xb.add(new CoPresence());
  const options = new xb.Options();
  options.enableReticles();
  options.setAppTitle('Co-presence');
  options.setAppDescription(
    'Join a room and see remote head and hand poses as lightweight avatars.'
  );
  await xb.init(options);
});
