// @vitest-environment node
import {describe, expect, it} from 'vitest';
import {
  createEphemeralKey,
  SessionCrypto,
  credentialProof,
} from './SessionCrypto';

describe('Companion session crypto', () => {
  it('derives matching private session keys, binds direction and headers, and cannot resume with the pairing code', async () => {
    const hostKey = await createEphemeralKey();
    const phoneKey = await createEphemeralKey();
    expect(hostKey.privateKey.extractable).toBe(false);
    const transcript = JSON.stringify([
      'host',
      'phone',
      hostKey.publicKey,
      phoneKey.publicKey,
    ]);
    const hostCandidate = await SessionCrypto.derive(
      hostKey.privateKey,
      phoneKey.publicKey,
      transcript
    );
    const phoneCandidate = await SessionCrypto.derive(
      phoneKey.privateKey,
      hostKey.publicKey,
      transcript
    );
    const host = await hostCandidate.establish('approval-nonce');
    const phone = await phoneCandidate.establish('approval-nonce');
    expect(host.id).toBe(phone.id);
    expect(host.comparison).toBe(phone.comparison);
    const message = {type: 'edit', value: 'private text'};
    const encrypted = await phone.encrypt(
      'phone',
      'epoch/phone/reliable/1',
      message
    );
    expect(
      await host.decrypt(
        'phone',
        'epoch/phone/reliable/1',
        encrypted.iv,
        encrypted.body
      )
    ).toEqual(message);
    await expect(
      host.decrypt(
        'host',
        'epoch/phone/reliable/1',
        encrypted.iv,
        encrypted.body
      )
    ).rejects.toThrow();
    await expect(
      host.decrypt(
        'phone',
        'epoch/phone/reliable/2',
        encrypted.iv,
        encrypted.body
      )
    ).rejects.toThrow();
    await expect(
      hostCandidate.decrypt(
        'phone',
        'epoch/phone/reliable/1',
        encrypted.iv,
        encrypted.body
      )
    ).rejects.toThrow();
    expect(
      await host.verify(
        'resume-challenge',
        await phone.prove('resume-challenge')
      )
    ).toBe(true);
    expect(
      await host.verify(
        'different-challenge',
        await phone.prove('resume-challenge')
      )
    ).toBe(false);
    expect(
      await host.verify(
        'resume-challenge',
        await credentialProof('K7Q2', 'resume-challenge')
      )
    ).toBe(false);
    const attackerKey = await createEphemeralKey();
    const attacker = await SessionCrypto.derive(
      attackerKey.privateKey,
      hostKey.publicKey,
      transcript
    );
    await expect(
      attacker.decrypt(
        'phone',
        'epoch/phone/reliable/1',
        encrypted.iv,
        encrypted.body
      )
    ).rejects.toThrow();
  });
});
