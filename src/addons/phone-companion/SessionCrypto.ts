const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeBytes(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function decodeBytes(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encoding.');
  return Uint8Array.from(
    atob(value.replace(/-/g, '+').replace(/_/g, '/')),
    (c) => c.charCodeAt(0)
  );
}

export function randomSecret(): string {
  return encodeBytes(crypto.getRandomValues(new Uint8Array(32)));
}

/** Commit before seeing the other side's key; no adaptive SAS key grinding. */
export async function keyCommitment(publicKey: string): Promise<string> {
  const bytes = decodeBytes(publicKey);
  if (encodeBytes(bytes) !== publicKey)
    throw new Error('Non-canonical public key.');
  return encodeBytes(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  );
}

export async function createEphemeralKey(): Promise<{
  privateKey: CryptoKey;
  publicKey: string;
}> {
  const pair = await crypto.subtle.generateKey(
    {name: 'ECDH', namedCurve: 'P-256'},
    false,
    ['deriveBits']
  );
  return {
    privateKey: pair.privateKey,
    publicKey: encodeBytes(
      new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
    ),
  };
}

export async function credentialProof(
  secret: string,
  transcript: string
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    {name: 'HMAC', hash: 'SHA-256'},
    false,
    ['sign']
  );
  return encodeBytes(
    new Uint8Array(
      await crypto.subtle.sign('HMAC', key, encoder.encode(transcript))
    )
  );
}

export async function verifyCredential(
  secret: string,
  transcript: string,
  proof: string
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    {name: 'HMAC', hash: 'SHA-256'},
    false,
    ['verify']
  );
  return crypto.subtle.verify(
    'HMAC',
    key,
    decodeBytes(proof),
    encoder.encode(transcript)
  );
}

/** Direction-separated, non-extractable keys derived from an ephemeral ECDH exchange. */
export class SessionCrypto {
  private constructor(
    readonly id: string,
    readonly comparison: string,
    private readonly auth: CryptoKey,
    private readonly hostToPhone: CryptoKey,
    private readonly phoneToHost: CryptoKey,
    private readonly root: CryptoKey
  ) {}

  static async derive(
    privateKey: CryptoKey,
    publicKey: string,
    transcript: string
  ): Promise<SessionCrypto> {
    const remoteBytes = decodeBytes(publicKey);
    if (encodeBytes(remoteBytes) !== publicKey)
      throw new Error('Non-canonical public key.');
    const remote = await crypto.subtle.importKey(
      'raw',
      remoteBytes,
      {name: 'ECDH', namedCurve: 'P-256'},
      false,
      []
    );
    const shared = await crypto.subtle.deriveBits(
      {name: 'ECDH', public: remote},
      privateKey,
      256
    );
    const salt = await crypto.subtle.digest(
      'SHA-256',
      encoder.encode(transcript)
    );
    const key = await crypto.subtle.importKey('raw', shared, 'HKDF', false, [
      'deriveKey',
      'deriveBits',
    ]);
    const params = (label: string) => ({
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: encoder.encode(`xrblocks-phone-v2/${label}`),
    });
    const [auth, hostToPhone, phoneToHost, check] = await Promise.all([
      crypto.subtle.deriveKey(
        params('resume'),
        key,
        {name: 'HMAC', hash: 'SHA-256', length: 256},
        false,
        ['sign', 'verify']
      ),
      crypto.subtle.deriveKey(
        params('host-to-phone'),
        key,
        {name: 'AES-GCM', length: 256},
        false,
        ['encrypt', 'decrypt']
      ),
      crypto.subtle.deriveKey(
        params('phone-to-host'),
        key,
        {name: 'AES-GCM', length: 256},
        false,
        ['encrypt', 'decrypt']
      ),
      crypto.subtle.deriveBits(params('comparison'), key, 32),
    ]);
    const comparison = String(
      new DataView(check).getUint32(0) % 1000000
    ).padStart(6, '0');
    return new SessionCrypto(
      encodeBytes(new Uint8Array(salt).slice(0, 16)),
      comparison,
      auth,
      hostToPhone,
      phoneToHost,
      key
    );
  }

  /** Active session keys are domain-separated only after the host accepts. */
  async establish(approval: string): Promise<SessionCrypto> {
    const salt = await crypto.subtle.digest(
      'SHA-256',
      encoder.encode(JSON.stringify(['approved', this.id, approval]))
    );
    const params = (label: string) => ({
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: encoder.encode(`xrblocks-phone-v2/${label}`),
    });
    const [auth, hostToPhone, phoneToHost] = await Promise.all([
      crypto.subtle.deriveKey(
        params('resume'),
        this.root,
        {name: 'HMAC', hash: 'SHA-256', length: 256},
        false,
        ['sign', 'verify']
      ),
      crypto.subtle.deriveKey(
        params('host-to-phone'),
        this.root,
        {name: 'AES-GCM', length: 256},
        false,
        ['encrypt', 'decrypt']
      ),
      crypto.subtle.deriveKey(
        params('phone-to-host'),
        this.root,
        {name: 'AES-GCM', length: 256},
        false,
        ['encrypt', 'decrypt']
      ),
    ]);
    return new SessionCrypto(
      encodeBytes(new Uint8Array(salt).slice(0, 16)),
      this.comparison,
      auth,
      hostToPhone,
      phoneToHost,
      this.root
    );
  }

  async prove(value: string): Promise<string> {
    return encodeBytes(
      new Uint8Array(
        await crypto.subtle.sign('HMAC', this.auth, encoder.encode(value))
      )
    );
  }

  async verify(value: string, proof: string): Promise<boolean> {
    return crypto.subtle.verify(
      'HMAC',
      this.auth,
      decodeBytes(proof),
      encoder.encode(value)
    );
  }

  async encrypt(
    role: 'host' | 'phone',
    header: string,
    message: unknown
  ): Promise<{iv: string; body: string}> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const body = await crypto.subtle.encrypt(
      {name: 'AES-GCM', iv, additionalData: encoder.encode(header)},
      role === 'host' ? this.hostToPhone : this.phoneToHost,
      encoder.encode(JSON.stringify(message))
    );
    return {iv: encodeBytes(iv), body: encodeBytes(new Uint8Array(body))};
  }

  async decrypt(
    sender: 'host' | 'phone',
    header: string,
    iv: string,
    body: string
  ): Promise<unknown> {
    const plain = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: decodeBytes(iv),
        additionalData: encoder.encode(header),
      },
      sender === 'host' ? this.hostToPhone : this.phoneToHost,
      decodeBytes(body)
    );
    return JSON.parse(decoder.decode(plain));
  }
}
