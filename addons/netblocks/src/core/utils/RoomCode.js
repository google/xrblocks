const ALPHABET = 'BCDFGHJKLMNPQRSTVWXYZ';
const CODE_LEN = 4;
/** Normalize the short room identifiers used by the netblocks samples. */
function normalizeRoomCode(value) {
    const cleaned = value.toUpperCase().replace(/[^A-Z]/g, '');
    return cleaned.length === CODE_LEN ? cleaned : null;
}
/** Generate a convenient meeting code, not a password or guaranteed unique ID. */
function generateRoomCode() {
    let code = '';
    for (let i = 0; i < CODE_LEN; i++) {
        code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    return code;
}

export { generateRoomCode, normalizeRoomCode };
