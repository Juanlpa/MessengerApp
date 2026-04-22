/**
 * Tests JWT propio con HMAC-SHA256
 */

// Configurar JWT_SECRET antes de importar
process.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters-long-for-testing';

import { signJWT, verifyJWT, createJWTPayload } from '../jwt';

describe('JWT (HMAC-SHA256 propio)', () => {
  const testUser = { id: 'user-123', email: 'test@test.com', username: 'testuser' };

  test('sign and verify roundtrip', () => {
    const payload = createJWTPayload(testUser);
    const token = signJWT(payload);
    const decoded = verifyJWT(token);

    expect(decoded.sub).toBe('user-123');
    expect(decoded.email).toBe('test@test.com');
    expect(decoded.username).toBe('testuser');
  });

  test('token has 3 parts separated by dots', () => {
    const payload = createJWTPayload(testUser);
    const token = signJWT(payload);
    expect(token.split('.').length).toBe(3);
  });

  test('tampered payload → signature fails', () => {
    const payload = createJWTPayload(testUser);
    const token = signJWT(payload);
    const parts = token.split('.');
    // Tamper: change payload
    const fakePayload = btoa(JSON.stringify({ ...payload, sub: 'admin' }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const tamperedToken = `${parts[0]}.${fakePayload}.${parts[2]}`;

    expect(() => verifyJWT(tamperedToken)).toThrow('Invalid JWT signature');
  });

  test('expired token → rejected', () => {
    const expiredPayload = {
      ...createJWTPayload(testUser),
      exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
    };
    const token = signJWT(expiredPayload);

    expect(() => verifyJWT(token)).toThrow('JWT expired');
  });

  test('invalid format → rejected', () => {
    expect(() => verifyJWT('not-a-jwt')).toThrow('Invalid JWT format');
    expect(() => verifyJWT('a.b')).toThrow('Invalid JWT format');
  });

  test('wrong signature → rejected', () => {
    const payload = createJWTPayload(testUser);
    const token = signJWT(payload);
    const parts = token.split('.');
    const wrongSig = parts[2].split('').reverse().join('');
    const badToken = `${parts[0]}.${parts[1]}.${wrongSig}`;

    expect(() => verifyJWT(badToken)).toThrow();
  });
});
