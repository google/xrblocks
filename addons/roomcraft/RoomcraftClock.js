import { peerId, sequence, record } from './RoomcraftNetProtocol.js';

const PREFIX = 'roomcraft:clock-';
const SAMPLE_TIMEOUT_MS = 8000;
const REFRESH_MS = 5000;
const SAMPLE_WINDOW_MS = 30_000;
function finiteTime(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new Error('Motion clock timestamps must be finite and non-negative.');
    }
    return value;
}
function readMotionClock(value) {
    const data = record(value);
    const elapsed = finiteTime(data.elapsed);
    if (elapsed > Number.MAX_SAFE_INTEGER / 1000) {
        throw new Error('Motion clock elapsed time is too large.');
    }
    return {
        epoch: peerId(data.epoch),
        authority: peerId(data.authority),
        term: sequence(data.term),
        elapsed,
    };
}
/** A scene timeline estimated from monotonic round trips, never wall clocks. */
class RoomcraftClock {
    constructor(session, options) {
        this.session = session;
        this.options = options;
        this.cleanups = [];
        this.term = 0;
        this.synced = true;
        this.failed = false;
        this.bestAt = 0;
        this.sampleCount = 0;
        this.serial = 0;
        this.started = false;
        this.disposed = false;
        this.read = () => {
            return finiteTime((this.now() + this.offsetMs) / 1000);
        };
        this.now = options.now ?? (() => performance.now());
        this.epoch = peerId(options.epoch);
        this.authority = peerId(options.authority ?? session.localPeerId);
        this.synced = this.authority === session.localPeerId;
        this.term = sequence(options.term ?? 0);
        this.offsetMs = finiteTime(options.initialTime ?? 0) * 1000 - this.now();
        if (!Number.isFinite(this.offsetMs))
            throw new Error('Motion clock time is too large.');
    }
    get pending() {
        return (!this.disposed &&
            !this.synced &&
            !this.failed &&
            this.authority !== this.session.localPeerId);
    }
    get state() {
        return {
            authority: this.authority,
            synchronized: this.synced,
            ...(this.bestRtt === undefined ? {} : { uncertaintyMs: this.bestRtt / 2 }),
        };
    }
    snapshot() {
        return {
            epoch: this.epoch,
            authority: this.authority,
            term: this.term,
            elapsed: this.read(),
        };
    }
    start() {
        if (this.disposed)
            throw new Error('Motion clock has been disposed.');
        if (this.started)
            return;
        this.started = true;
        this.on('request', (value, from, receivedAt) => {
            const data = record(value);
            const id = sequence(data.id);
            const requestedEpoch = peerId(data.epoch);
            const requestedTerm = sequence(data.term);
            if (requestedEpoch !== this.epoch)
                return;
            if (this.authority !== this.session.localPeerId) {
                this.send('state', { ...this.snapshot(), replyTo: id }, from);
                return;
            }
            if (requestedTerm > this.term) {
                this.term = requestedTerm;
                this.send('state', this.snapshot());
            }
            if (requestedTerm !== this.term) {
                this.send('state', { ...this.snapshot(), replyTo: id }, from);
                return;
            }
            const sentAt = this.now();
            this.send('reply', {
                id,
                epoch: this.epoch,
                term: this.term,
                receivedAt,
                sentAt,
                elapsed: (sentAt + this.offsetMs) / 1000,
            }, from);
        });
        this.on('reply', (value, from, receivedAt) => this.receiveReply(value, from, receivedAt));
        this.on('state', (value, from, receivedAt) => {
            const data = record(value);
            const state = readMotionClock(data);
            if (state.epoch !== this.epoch)
                return;
            const request = this.request;
            const redirected = !!request && from === request.authority && data.replyTo === request.id;
            if (data.replyTo !== undefined && !redirected)
                return;
            if (from !== state.authority && !redirected)
                throw new Error('Motion clock authority must announce its own state.');
            if (redirected && state.authority !== from) {
                this.adopt({ ...state, term: Math.max(state.term, this.term) }, receivedAt, true);
                return;
            }
            if (!this.isNewerAuthority(state)) {
                if (this.authority === this.session.localPeerId &&
                    from !== this.authority) {
                    this.send('state', this.snapshot(), from);
                }
                return;
            }
            this.adopt(state, receivedAt);
        });
        const leave = (event) => {
            const id = event.detail.user.peerId;
            if (id === this.authority)
                this.guard(() => this.elect());
        };
        this.session.addEventListener('user-leave', leave);
        this.cleanups.push(() => this.session.removeEventListener('user-leave', leave));
    }
    /** Reconcile elections independently of scene edits, but never switch epochs. */
    reconcile(snapshot, receivedAt) {
        if (snapshot.epoch === this.epoch)
            this.adopt(snapshot, receivedAt);
    }
    /** Switch epochs only with an accepted scene revision; include queue time. */
    adopt(snapshot, receivedAt, redirected = false) {
        if (this.disposed)
            return;
        const state = readMotionClock(snapshot);
        const changedEpoch = state.epoch !== this.epoch;
        if (!changedEpoch && !redirected && !this.isNewerAuthority(state)) {
            if (state.term !== this.term || state.authority !== this.authority)
                return;
            if (!this.synced && !this.request)
                this.resync();
            return;
        }
        const now = this.now();
        const age = Math.max(0, now - finiteTime(receivedAt));
        const offsetMs = finiteTime(state.elapsed * 1000 + age) - now;
        this.cancelSamples();
        this.epoch = state.epoch;
        this.authority = state.authority;
        this.term = state.term;
        // The snapshot seeds a useful pose; a measured round trip corrects transit delay.
        this.offsetMs = offsetMs;
        this.bestRtt = undefined;
        this.failed = false;
        this.synced = this.authority === this.session.localPeerId;
        if (!this.synced && !this.session.users.has(this.authority))
            this.elect();
        else
            this.resync();
        this.options.onChange();
    }
    resync() {
        if (this.disposed || !this.started)
            return;
        if (this.authority === this.session.localPeerId) {
            this.synced = true;
            this.failed = false;
            return;
        }
        this.cancelSamples();
        this.failed = false;
        this.sampleCount = 0;
        this.bestRtt = undefined;
        this.guard(() => this.probe());
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.cancelSamples();
        this.cleanups.splice(0).forEach((cleanup) => cleanup());
    }
    isNewerAuthority(state) {
        return (state.term > this.term ||
            (state.term === this.term && state.authority < this.authority));
    }
    elect() {
        this.cancelSamples();
        this.authority = [
            this.session.localPeerId,
            ...this.session.users.keys(),
        ].sort()[0];
        this.term = sequence(this.term + 1);
        this.bestRtt = undefined;
        this.failed = false;
        this.synced = this.authority === this.session.localPeerId;
        if (this.synced)
            this.send('state', this.snapshot());
        else
            this.probe();
        this.options.onChange();
    }
    probe() {
        if (this.disposed || this.authority === this.session.localPeerId)
            return;
        if (!this.session.users.has(this.authority)) {
            this.elect();
            return;
        }
        const request = {
            id: ++this.serial,
            sentAt: this.now(),
            epoch: this.epoch,
            authority: this.authority,
            term: this.term,
        };
        this.request = request;
        this.timeout = setTimeout(() => {
            if (this.request !== request || this.disposed)
                return;
            this.request = undefined;
            this.synced = false;
            this.failed = true;
            this.options.onError(new Error('Shared motion clock did not respond. Timing is unverified; retry sync.'));
            this.schedule(REFRESH_MS);
        }, SAMPLE_TIMEOUT_MS);
        this.send('request', { id: request.id, epoch: request.epoch, term: request.term }, request.authority);
        this.options.onChange();
    }
    receiveReply(value, from, receivedAt) {
        const data = record(value);
        const request = this.request;
        if (!request ||
            from !== request.authority ||
            data.id !== request.id ||
            data.epoch !== request.epoch ||
            data.term !== request.term)
            return;
        const remoteReceived = finiteTime(data.receivedAt);
        const remoteSent = finiteTime(data.sentAt);
        const elapsed = finiteTime(data.elapsed);
        const processing = remoteSent - remoteReceived;
        const duration = receivedAt - request.sentAt;
        if (processing < 0 || duration < 0 || processing > duration + 1) {
            throw new Error('Invalid shared motion round-trip timestamps.');
        }
        const rtt = Math.max(0, duration - processing);
        clearTimeout(this.timeout);
        this.request = undefined;
        if (this.bestRtt === undefined ||
            rtt <= this.bestRtt ||
            receivedAt - this.bestAt > SAMPLE_WINDOW_MS) {
            this.offsetMs = finiteTime(elapsed * 1000 + rtt / 2) - receivedAt;
            this.bestRtt = rtt;
            this.bestAt = receivedAt;
        }
        this.synced = true;
        this.failed = false;
        this.sampleCount++;
        this.options.onChange();
        this.schedule(this.sampleCount < 3 ? 150 : REFRESH_MS);
    }
    schedule(delay) {
        clearTimeout(this.refresh);
        this.refresh = setTimeout(() => this.guard(() => this.probe()), delay);
    }
    cancelSamples() {
        clearTimeout(this.timeout);
        clearTimeout(this.refresh);
        this.request = undefined;
    }
    on(topic, handler) {
        this.cleanups.push(this.session.events.on(PREFIX + topic, (data, from) => {
            if (this.disposed || from === this.session.localPeerId)
                return;
            const receivedAt = this.now();
            this.guard(() => handler(data, from, receivedAt));
        }));
    }
    send(topic, data, to) {
        if (!this.session.isOpen)
            throw new Error('The shared motion session is closed.');
        if (to)
            this.session.events.emitTo(to, PREFIX + topic, data);
        else
            this.session.events.emit(PREFIX + topic, data);
    }
    guard(action) {
        try {
            action();
        }
        catch (cause) {
            this.options.onError(cause instanceof Error ? cause : new Error(String(cause)));
        }
    }
}

export { RoomcraftClock, readMotionClock };
