function record(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Roomcraft network data must be an object.');
    }
    return value;
}
function peerId(value, allowEmpty = false) {
    if (typeof value !== 'string' ||
        (!allowEmpty && !value) ||
        value.length > 128) {
        throw new Error('Invalid Roomcraft network peer ID.');
    }
    return value;
}
function sequence(value) {
    if (typeof value !== 'number' ||
        !Number.isSafeInteger(value) ||
        value < 0 ||
        value >= Number.MAX_SAFE_INTEGER) {
        throw new Error('Invalid Roomcraft network sequence.');
    }
    return value;
}
function revision(value) {
    const data = record(value);
    return { counter: sequence(data.counter), peerId: peerId(data.peerId) };
}
function compareRevision(a, b) {
    return (a.counter - b.counter ||
        (a.peerId === b.peerId ? 0 : a.peerId > b.peerId ? 1 : -1));
}
function transform(value) {
    if (!Array.isArray(value) ||
        value.length !== 10 ||
        !value.every((entry) => typeof entry === 'number' && Number.isFinite(entry)) ||
        value.slice(7).some((entry) => entry <= 0) ||
        Math.abs(Math.hypot(...value.slice(3, 7)) - 1) > 0.001) {
        throw new Error('Invalid Roomcraft network transform.');
    }
    return [...value];
}
function objectStates(value, ids) {
    if (!Array.isArray(value) || value.length !== ids.length) {
        throw new Error('Roomcraft snapshot must describe every object transform.');
    }
    const remaining = new Set(ids);
    return value.map((entry) => {
        const data = record(entry);
        if (typeof data.id !== 'string' || !remaining.delete(data.id)) {
            throw new Error('Invalid or duplicate Roomcraft snapshot object ID.');
        }
        const ownerId = peerId(data.ownerId, true);
        const claim = data.claim === undefined ? undefined : revision(data.claim);
        if (claim && (claim.counter < 1 || (ownerId && ownerId !== claim.peerId))) {
            throw new Error('Invalid Roomcraft object claim revision.');
        }
        return {
            id: data.id,
            ownerId,
            xform: transform(data.xform),
            ...(claim ? { claim } : {}),
        };
    });
}

export { compareRevision, objectStates, peerId, record, revision, sequence, transform };
