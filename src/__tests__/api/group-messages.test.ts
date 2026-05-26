/**
 * Tests para las API routes de mensajes de grupo.
 * Cubre: autorización, validación del body, cifrado at-rest y respuestas.
 */

process.env.JWT_SECRET             = 'test-secret-at-least-32-chars-long-for-testing';
process.env.NEXT_PUBLIC_SUPABASE_URL   = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY  = 'test-service-role-key';
process.env.ENCRYPTION_MASTER_KEY      = 'ab'.repeat(32); // 64 hex chars válidos

// ─── Mock crypto/message-crypto ───────────────────────────────────────────────
jest.mock('@/lib/crypto/message-crypto', () => ({
  encryptMessageAtRest: jest.fn().mockReturnValue({
    iv: 'server-iv',
    ciphertext: 'server-ct',
    mac: 'server-mac',
  }),
  decryptMessageAtRest: jest.fn().mockReturnValue(
    '{"ciphertext":"e2e-ct","iv":"e2e-iv","mac":"e2e-mac"}'
  ),
  getServerMasterKey: jest.fn().mockReturnValue(new Uint8Array(32)),
}));

// ─── Mock Supabase ────────────────────────────────────────────────────────────
type QueueEntry = { single?: any; maybeSingle?: any; data?: any; count?: number; error?: any };

function makeChain(r: QueueEntry) {
  const resolved = r.count !== undefined
    ? Promise.resolve({ count: r.count, error: null })
    : Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
  const chain: any = {
    select:      jest.fn().mockReturnThis(),
    insert:      jest.fn().mockReturnThis(),
    update:      jest.fn().mockReturnThis(),
    delete:      jest.fn().mockReturnThis(),
    eq:          jest.fn().mockReturnThis(),
    order:       jest.fn().mockReturnThis(),
    limit:       jest.fn().mockReturnThis(),
    single:      jest.fn().mockResolvedValue(r.single ?? { data: null, error: r.error ?? null }),
    maybeSingle: jest.fn().mockResolvedValue(r.maybeSingle ?? { data: null, error: r.error ?? null }),
    then:        (f: any, rej: any) => resolved.then(f, rej),
    catch:       (f: any) => resolved.catch(f),
  };
  return chain;
}

const mockFrom = jest.fn();
jest.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => ({ from: mockFrom }),
}));

import { NextRequest } from 'next/server';
import { signJWT, createJWTPayload } from '@/lib/auth/jwt';
import { GET as getMessages, POST as sendMessage } from '@/app/api/groups/[id]/messages/route';
import { GET as getSingle } from '@/app/api/groups/[id]/messages/single/route';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const USER_ID  = 'aaaaaaaa-0000-0000-0000-000000000001';
const GROUP_ID = 'gggggggg-0000-0000-0000-000000000001';
const MSG_ID   = 'mmmmmmmm-0000-0000-0000-000000000001';

function token(userId = USER_ID) {
  return signJWT(createJWTPayload({ id: userId, email: 'u@t.com', username: 'usr' }));
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

const ctx = { params: Promise.resolve({ id: GROUP_ID }) };

beforeEach(() => {
  // clearAllMocks preserva las implementaciones del mock de message-crypto
  // (resetAllMocks las borraría). No hay riesgo de contaminación de cola
  // porque este archivo solo usa setupQueue (no mockImplementationOnce).
  jest.clearAllMocks();
});

// ─── POST /api/groups/[id]/messages ──────────────────────────────────────────
describe('POST /api/groups/[id]/messages', () => {
  const validBody = {
    e2eEncrypted: { ciphertext: 'ct-hex', iv: 'iv-hex', mac: 'mac-hex' },
  };

  test('401 sin token', async () => {
    const r = req('POST', `/api/groups/${GROUP_ID}/messages`, validBody);
    expect((await sendMessage(r, ctx)).status).toBe(401);
  });

  test('403 — usuario no es miembro', async () => {
    setupQueue([
      { single: { data: null, error: null } }, // membership → null
    ]);
    const r = req('POST', `/api/groups/${GROUP_ID}/messages`, validBody, token());
    expect((await sendMessage(r, ctx)).status).toBe(403);
  });

  test('400 — body sin e2eEncrypted', async () => {
    setupQueue([
      { single: { data: { role: 'member' }, error: null } }, // membership OK
    ]);
    const r = req('POST', `/api/groups/${GROUP_ID}/messages`, { other: 'data' }, token());
    expect((await sendMessage(r, ctx)).status).toBe(400);
  });

  test('400 — e2eEncrypted incompleto (falta mac)', async () => {
    setupQueue([
      { single: { data: { role: 'member' }, error: null } },
    ]);
    const r = req('POST', `/api/groups/${GROUP_ID}/messages`,
      { e2eEncrypted: { ciphertext: 'ct', iv: 'iv' } }, token());
    expect((await sendMessage(r, ctx)).status).toBe(400);
  });

  test('201 — mensaje enviado correctamente', async () => {
    setupQueue([
      { single: { data: { role: 'member' }, error: null } },          // membership
      { single: { data: { id: MSG_ID, created_at: '2026-01-01' }, error: null } }, // insert
    ]);
    const r = req('POST', `/api/groups/${GROUP_ID}/messages`, validBody, token());
    const res = await sendMessage(r, ctx);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.message.id).toBe(MSG_ID);
  });

  test('201 — message_type válido (voice)', async () => {
    setupQueue([
      { single: { data: { role: 'admin' }, error: null } },
      { single: { data: { id: MSG_ID, created_at: '2026-01-01' }, error: null } },
    ]);
    const r = req('POST', `/api/groups/${GROUP_ID}/messages`,
      { ...validBody, message_type: 'voice' }, token());
    expect((await sendMessage(r, ctx)).status).toBe(201);
  });

  test('400 — message_type inválido', async () => {
    setupQueue([
      { single: { data: { role: 'member' }, error: null } },
    ]);
    const r = req('POST', `/api/groups/${GROUP_ID}/messages`,
      { ...validBody, message_type: 'invalid' }, token());
    expect((await sendMessage(r, ctx)).status).toBe(400);
  });
});

// ─── GET /api/groups/[id]/messages ───────────────────────────────────────────
describe('GET /api/groups/[id]/messages', () => {
  test('401 sin token', async () => {
    const r = req('GET', `/api/groups/${GROUP_ID}/messages`);
    expect((await getMessages(r, ctx)).status).toBe(401);
  });

  test('403 — usuario no es miembro', async () => {
    setupQueue([
      { single: { data: null, error: null } },
    ]);
    const r = req('GET', `/api/groups/${GROUP_ID}/messages`, undefined, token());
    expect((await getMessages(r, ctx)).status).toBe(403);
  });

  test('200 — devuelve mensajes con e2e descifrado de at-rest', async () => {
    setupQueue([
      { single: { data: { role: 'member' }, error: null } }, // membership
      {
        data: [
          {
            id: MSG_ID,
            sender_id: USER_ID,
            server_ciphertext: 'server-ct',
            server_iv:         'server-iv',
            server_mac_tag:    'server-mac',
            created_at:        '2026-01-01T00:00:00Z',
          },
        ],
      }, // messages list (direct await)
    ]);
    const r = req('GET', `/api/groups/${GROUP_ID}/messages`, undefined, token());
    const res = await getMessages(r, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].e2e.ciphertext).toBe('e2e-ct');
    expect(body.messages[0].senderId).toBe(USER_ID);
  });

  test('200 — lista vacía si no hay mensajes', async () => {
    setupQueue([
      { single: { data: { role: 'admin' }, error: null } },
      { data: [] },
    ]);
    const r = req('GET', `/api/groups/${GROUP_ID}/messages`, undefined, token());
    const res = await getMessages(r, ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).messages).toHaveLength(0);
  });
});

// ─── GET /api/groups/[id]/messages/single ────────────────────────────────────
describe('GET /api/groups/[id]/messages/single', () => {
  const singleCtx = { params: Promise.resolve({ id: GROUP_ID }) };

  function singleReq(tok?: string) {
    return req('GET', `/api/groups/${GROUP_ID}/messages/single?messageId=${MSG_ID}`,
      undefined, tok);
  }

  test('401 sin token', async () => {
    const r = singleReq();
    expect((await getSingle(r, singleCtx)).status).toBe(401);
  });

  test('400 sin messageId', async () => {
    const r = req('GET', `/api/groups/${GROUP_ID}/messages/single`, undefined, token());
    expect((await getSingle(r, singleCtx)).status).toBe(400);
  });

  test('403 — no es miembro', async () => {
    setupQueue([{ single: { data: null, error: null } }]);
    expect((await getSingle(singleReq(token()), singleCtx)).status).toBe(403);
  });

  test('404 — mensaje no existe', async () => {
    setupQueue([
      { single: { data: { role: 'member' }, error: null } }, // membership
      { single: { data: null, error: null } },                 // message not found
    ]);
    expect((await getSingle(singleReq(token()), singleCtx)).status).toBe(404);
  });

  test('200 — devuelve el mensaje descifrado de at-rest', async () => {
    setupQueue([
      { single: { data: { role: 'member' }, error: null } },
      { single: { data: { id: MSG_ID, sender_id: USER_ID, server_ciphertext: 'sc', server_iv: 'si', server_mac_tag: 'sm', created_at: '2026-01-01T00:00:00Z' }, error: null } },
    ]);
    const res = await getSingle(singleReq(token()), singleCtx);
    expect(res.status).toBe(200);
    const { message } = await res.json();
    expect(message.id).toBe(MSG_ID);
    expect(message.e2e.ciphertext).toBe('e2e-ct');
  });
});
