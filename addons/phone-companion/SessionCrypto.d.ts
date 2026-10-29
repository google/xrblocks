//#region src/addons/phone-companion/SessionCrypto.d.ts
export declare function encodeBytes(bytes: Uint8Array): string;
export declare function decodeBytes(value: string): Uint8Array<ArrayBuffer>;
export declare function randomSecret(): string;
/** Commit before seeing the other side's key; no adaptive SAS key grinding. */
export declare function keyCommitment(publicKey: string): Promise<string>;
export declare function createEphemeralKey(): Promise<{
  privateKey: CryptoKey;
  publicKey: string;
}>;
export declare function credentialProof(secret: string, transcript: string): Promise<string>;
export declare function verifyCredential(secret: string, transcript: string, proof: string): Promise<boolean>;
/** Direction-separated, non-extractable keys derived from an ephemeral ECDH exchange. */
export declare class SessionCrypto {
  readonly id: string;
  readonly comparison: string;
  private readonly auth;
  private readonly hostToPhone;
  private readonly phoneToHost;
  private readonly root;
  private constructor();
  static derive(privateKey: CryptoKey, publicKey: string, transcript: string): Promise<SessionCrypto>;
  /** Active session keys are domain-separated only after the host accepts. */
  establish(approval: string): Promise<SessionCrypto>;
  prove(value: string): Promise<string>;
  verify(value: string, proof: string): Promise<boolean>;
  encrypt(role: 'host' | 'phone', header: string, message: unknown): Promise<{
    iv: string;
    body: string;
  }>;
  decrypt(sender: 'host' | 'phone', header: string, iv: string, body: string): Promise<unknown>;
}
//#endregion