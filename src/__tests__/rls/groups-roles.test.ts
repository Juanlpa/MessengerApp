/**
 * Tests de aislamiento de roles para grupos.
 *
 * Verifica que las API routes impiden:
 *   - acceso de no miembros a mensajes y clave de grupo
 *   - operaciones de administrador por miembros con rol 'member'
 *
 * Nota de diseño de seguridad:
 *   Las rutas de admin retornan 404 para no-miembros (no revela si el grupo existe).
 *   Las rutas de mensajes/clave retornan 403 (membresía requerida explícitamente).
 */

process.env.JWT_SECRET            = 'test-secret-at-least-32-chars-long-for-testing';
process.env.NEXT_PUBLIC_SUPABASE_URL  = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.ENCRYPTION_MASTER_KEY    = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// ─── Mock Supabase ────────────────────────────────────────────────────────────
type QueueEntry = { single?: any; maybeSingle?: any; data?: any; count?: number; error?: any };

function makeChain(r: QueueEntry) {
  const resolved = r.count !== undefined
    ? Promise.resolve({ count: r.count, error: null })
    : Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
  const chain: any = {
    select:      jest.fn().mockReturnThis(),
    update:      jest.fn().mockReturnThis(),
    insert:      jest.fn().mockReturnThis(),
    delete:      jest.fn().mockReturnThis(),
    eq:          jest.fn().mockReturnThis(),
    neq:         jest.fn().mockReturnThis(),
    or:          jest.fn().mockReturnThis(),
    in:          jest.fn().mockReturnThis(),
    order:       jest.fn().mockReturnThis(),
    limit:       jest.fn().mockReturnThis(),
    single:      jest.fn().mockResolvedValue(r.single ?? { data: null, error: r.error ?? null }),
    maybeSingle: jest.fn().mockResolvedValue(r.maybeSingle ?? { data: null, error: r.error ?? null }),
    then:  (f: any, rej: any) => resolved.then(f, rej),
    catch: (f: any) => resolved.catch(f),
  };
  return chain;
}

const mockFrom = jest.fn();
jest.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => ({ from: mockFrom }),
}));

jest.mock('@/lib/crypto/message-crypto', () => ({
  encryptMessageAtRest: jest.fn().mockReturnValue({ iv: 'iv', ciphertext: 'ct', mac: 'mac' }),
  decryptMessageAtRest: jest.fn().mockReturnValue('{"ciphertext":"e2e","iv":"iv","mac":"mac"}'),
  getServerMasterKey:   jest.fn().mockReturnValue(new Uint8Array(32)),
}));

jest.mock('@/lib/groups/key-rotation', () => ({
  rotateOnMemberLeave:   jest.fn().mockResolvedValue(undefined),
  rotateOnMemberJoin:    jest.fn().mockResolvedValue(undefined),
  createInitialGroupKey: jest.fn().mockResolvedValue(1),
  getActiveGroupKey:     jest.fn().mockResolvedValue({ keyHex: 'a'.repeat(64), keyVersion: 1 }),
}));

import { NextRequest } from 'next/server';
import { signJWT, createJWTPayload } from '@/lib/auth/jwt';
import { GET as getGroupMessages, POST as postGroupMessage } from '@/app/api/groups/[id]/messages/route';
import { PATCH as updateGroup } from '@/app/api/groups/[id]/route';
import { POST as addMember } from '@/app/api/groups/[id]/members/route';
import { DELETE as removeMember } from '@/app/api/groups/[id]/members/[userId]/route';
import { PATCH as changeRole } from '@/app/api/groups/[id]/members/[userId]/role/route';
import { GET as getGroupKey } from '@/app/api/groups/[id]/key/route';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const USER_A   = 'aaaaaaaa-0000-0000-0000-000000000001'; // admin del grupo
const USER_B   = 'bbbbbbbb-0000-0000-0000-000000000002'; // miembro regular
const USER_C   = 'cccccccc-0000-0000-0000-000000000003'; // no miembro (intruso)
const GROUP_ID = 'gggggggg-0000-0000-0000-000000000001';
const TARGET   = 'dddddddd-0000-0000-0000-000000000004';

function token(userId: string, username: string) {
  return signJWT(createJWTPayload({ id: userId, email: `${username}@test.com`, username }));
}

function req(method: string, url: string, body?: unknown, tok?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (tok) headers['Authorization'] = `Bearer ${tok}`;
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function setupQueue(responses: QueueEntry[]) {
  let i = 0;
  mockFrom.mockImplementation(() => makeChain(responses[i++] ?? {}));
}

const ctxGroup  = { params: Promise.resolve({ id: GROUP_ID }) };
const ctxMember = { params: Promise.resolve({ id: GROUP_ID, userId: TARGET }) };

// membership stubs reutilizables
const noMember = { single: { data: null, error: null } };
const asMember = { single: { data: { id: 'p-b', role: 'member' }, error: null } };
const asAdmin  = { single: { data: { id: 'p-a', role: 'admin'  }, error: null } };

beforeEach(() => jest.clearAllMocks());

// ─── Sin autenticación ────────────────────────────────────────────────────────
describe('Sin token → 401 en todos los endpoints de grupo', () => {
  test('GET messages', async () => {
    expect((await getGroupMessages(req('GET', `/api/groups/${GROUP_ID}/messages`), ctxGroup)).status).toBe(401);
  });
  test('POST message', async () => {
    expect((await postGroupMessage(req('POST', `/api/groups/${GROUP_ID}/messages`, {}), ctxGroup)).status).toBe(401);
  });
  test('GET group key', async () => {
    expect((await getGroupKey(req('GET', `/api/groups/${GROUP_ID}/key`), ctxGroup)).status).toBe(401);
  });
  test('PATCH group name', async () => {
    expect((await updateGroup(req('PATCH', `/api/groups/${GROUP_ID}`, { name: 'x' }), ctxGroup)).status).toBe(401);
  });
  test('POST add member', async () => {
    expect((await addMember(req('POST', `/api/groups/${GROUP_ID}/members`, {}), ctxGroup)).status).toBe(401);
  });
  test('DELETE member', async () => {
    expect((await removeMember(req('DELETE', `/api/groups/${GROUP_ID}/members/${TARGET}`), ctxMember)).status).toBe(401);
  });
  test('PATCH role', async () => {
    expect((await changeRole(req('PATCH', `/api/groups/${GROUP_ID}/members/${TARGET}/role`, { role: 'admin' }), ctxMember)).status).toBe(401);
  });
});

// ─── No miembro (USER_C) ─────────────────────────────────────────────────────
// Las rutas de mensajes/clave devuelven 403; las de admin devuelven 404
// (el grupo es "invisible" para quienes no pertenecen a él).
describe('No miembro no puede acceder al grupo', () => {
  const tok = token(USER_C, 'userc');

  test('GET messages → 403', async () => {
    setupQueue([noMember]);
    expect((await getGroupMessages(req('GET', `/api/groups/${GROUP_ID}/messages`, undefined, tok), ctxGroup)).status).toBe(403);
  });

  test('POST message → 403', async () => {
    setupQueue([noMember]);
    expect((await postGroupMessage(
      req('POST', `/api/groups/${GROUP_ID}/messages`, { e2eEncrypted: { ciphertext: 'ct', iv: 'iv', mac: 'mac' } }, tok),
      ctxGroup
    )).status).toBe(403);
  });

  test('GET group key → 403', async () => {
    setupQueue([noMember]);
    expect((await getGroupKey(req('GET', `/api/groups/${GROUP_ID}/key`, undefined, tok), ctxGroup)).status).toBe(403);
  });

  // Las siguientes rutas de admin retornan 404 para no-miembros (security by obscurity)
  test('PATCH group name → 404', async () => {
    setupQueue([noMember]);
    expect((await updateGroup(req('PATCH', `/api/groups/${GROUP_ID}`, { name: 'Hack' }, tok), ctxGroup)).status).toBe(404);
  });

  test('POST add member → 404', async () => {
    setupQueue([noMember]);
    expect((await addMember(
      req('POST', `/api/groups/${GROUP_ID}/members`, { user_id: TARGET }, tok),
      ctxGroup
    )).status).toBe(404);
  });

  test('DELETE member → 404', async () => {
    setupQueue([noMember]);
    expect((await removeMember(req('DELETE', `/api/groups/${GROUP_ID}/members/${TARGET}`, undefined, tok), ctxMember)).status).toBe(404);
  });

  test('PATCH role → 404', async () => {
    setupQueue([noMember]);
    expect((await changeRole(
      req('PATCH', `/api/groups/${GROUP_ID}/members/${TARGET}/role`, { role: 'admin' }, tok),
      ctxMember
    )).status).toBe(404);
  });
});

// ─── Miembro regular (USER_B, role='member') no puede hacer ops de admin ──────
describe('Miembro regular no puede ejecutar operaciones de admin', () => {
  const tok = token(USER_B, 'userb');

  test('PATCH group name → 403', async () => {
    setupQueue([asMember]);
    expect((await updateGroup(req('PATCH', `/api/groups/${GROUP_ID}`, { name: 'Hack' }, tok), ctxGroup)).status).toBe(403);
  });

  test('POST add member → 403', async () => {
    setupQueue([asMember]);
    expect((await addMember(
      req('POST', `/api/groups/${GROUP_ID}/members`, { user_id: TARGET }, tok),
      ctxGroup
    )).status).toBe(403);
  });

  test('DELETE otro miembro → 403', async () => {
    setupQueue([asMember]);
    expect((await removeMember(req('DELETE', `/api/groups/${GROUP_ID}/members/${TARGET}`, undefined, tok), ctxMember)).status).toBe(403);
  });

  test('PATCH role → 403', async () => {
    setupQueue([asMember]);
    expect((await changeRole(
      req('PATCH', `/api/groups/${GROUP_ID}/members/${TARGET}/role`, { role: 'admin' }, tok),
      ctxMember
    )).status).toBe(403);
  });
});

// ─── Miembro regular SÍ puede leer mensajes y clave ──────────────────────────
describe('Miembro regular puede acceder a mensajes y clave del grupo', () => {
  const tok = token(USER_B, 'userb');

  test('GET messages → 200', async () => {
    setupQueue([asMember, { data: [], error: null }]);
    expect((await getGroupMessages(req('GET', `/api/groups/${GROUP_ID}/messages`, undefined, tok), ctxGroup)).status).toBe(200);
  });

  test('GET group key → 200 con key y key_version', async () => {
    setupQueue([asMember]);
    const res = await getGroupKey(req('GET', `/api/groups/${GROUP_ID}/key`, undefined, tok), ctxGroup);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('key');
    expect(body).toHaveProperty('key_version');
  });
});

// ─── Admin (USER_A) puede ejecutar operaciones de administrador ───────────────
describe('Admin puede ejecutar operaciones de admin', () => {
  const tok = token(USER_A, 'usera');

  test('PATCH group name → 200', async () => {
    setupQueue([
      asAdmin,
      { single: { data: { id: GROUP_ID, name: 'Nuevo Nombre' }, error: null } },
    ]);
    expect((await updateGroup(req('PATCH', `/api/groups/${GROUP_ID}`, { name: 'Nuevo Nombre' }, tok), ctxGroup)).status).toBe(200);
  });

  test('DELETE member → 200', async () => {
    setupQueue([
      asAdmin,                                                                         // requesterMembership
      { single: { data: { role: 'member', joined_at: new Date().toISOString() }, error: null } }, // targetMembership
      { data: null, error: null },                                                     // delete
    ]);
    expect((await removeMember(req('DELETE', `/api/groups/${GROUP_ID}/members/${TARGET}`, undefined, tok), ctxMember)).status).toBe(200);
  });
});
