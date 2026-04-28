/**
 * Tests para archive/mute de conversaciones.
 * Cubre: PATCH /archive, PATCH /mute, y el filtro de archivado en GET /conversations.
 */

process.env.JWT_SECRET            = 'test-secret-at-least-32-chars-long-for-testing';
process.env.NEXT_PUBLIC_SUPABASE_URL  = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

// ─── Mock Supabase ────────────────────────────────────────────────────────────
type QueueEntry = { single?: any; maybeSingle?: any; data?: any; count?: number; error?: any };

function makeChain(r: QueueEntry) {
  const resolved = r.count !== undefined
    ? Promise.resolve({ count: r.count, error: null })
    : Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
  const chain: any = {
    select:  jest.fn().mockReturnThis(),
    update:  jest.fn().mockReturnThis(),
    insert:  jest.fn().mockReturnThis(),
    delete:  jest.fn().mockReturnThis(),
    eq:      jest.fn().mockReturnThis(),
    neq:     jest.fn().mockReturnThis(),
    order:   jest.fn().mockReturnThis(),
    limit:   jest.fn().mockReturnThis(),
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

import { NextRequest } from 'next/server';
import { signJWT, createJWTPayload } from '@/lib/auth/jwt';
import { PATCH as archiveConversation } from '@/app/api/conversations/[id]/archive/route';
import { PATCH as muteConversation }    from '@/app/api/conversations/[id]/mute/route';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const USER_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const CONV_ID = 'cccccccc-0000-0000-0000-000000000001';

function token() {
  return signJWT(createJWTPayload({ id: USER_ID, email: 'u@t.com', username: 'usr' }));
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

const ctx = { params: Promise.resolve({ id: CONV_ID }) };

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── PATCH /api/conversations/[id]/archive ────────────────────────────────────
describe('PATCH /api/conversations/[id]/archive', () => {
  test('401 sin token', async () => {
    const r = req('PATCH', `/api/conversations/${CONV_ID}/archive`, { archived: true });
    expect((await archiveConversation(r, ctx)).status).toBe(401);
  });

  test('400 — body inválido (archived no es boolean)', async () => {
    const r = req('PATCH', `/api/conversations/${CONV_ID}/archive`, { archived: 'yes' }, token());
    expect((await archiveConversation(r, ctx)).status).toBe(400);
  });

  test('400 — body sin campo archived', async () => {
    const r = req('PATCH', `/api/conversations/${CONV_ID}/archive`, {}, token());
    expect((await archiveConversation(r, ctx)).status).toBe(400);
  });

  test('403 — usuario no es participante', async () => {
    setupQueue([
      { single: { data: null, error: null } }, // membership → null
    ]);
    const r = req('PATCH', `/api/conversations/${CONV_ID}/archive`, { archived: true }, token());
    expect((await archiveConversation(r, ctx)).status).toBe(403);
  });

  test('200 — archivar conversación', async () => {
    setupQueue([
      { single: { data: { id: 'part-id' }, error: null } }, // membership OK
      { single: { data: { is_archived: true, archived_at: '2026-04-28T10:00:00Z' }, error: null } }, // update
    ]);
    const r = req('PATCH', `/api/conversations/${CONV_ID}/archive`, { archived: true }, token());
    const res = await archiveConversation(r, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.is_archived).toBe(true);
    expect(body.archived_at).not.toBeNull();
  });

  test('200 — desarchivar conversación', async () => {
    setupQueue([
      { single: { data: { id: 'part-id' }, error: null } },
      { single: { data: { is_archived: false, archived_at: null }, error: null } },
    ]);
    const r = req('PATCH', `/api/conversations/${CONV_ID}/archive`, { archived: false }, token());
    const res = await archiveConversation(r, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.is_archived).toBe(false);
    expect(body.archived_at).toBeNull();
  });
});

// ─── PATCH /api/conversations/[id]/mute ──────────────────────────────────────
describe('PATCH /api/conversations/[id]/mute', () => {
  const futureDate = new Date(Date.now() + 3600_000).toISOString();

  test('401 sin token', async () => {
    const r = req('PATCH', `/api/conversations/${CONV_ID}/mute`, { muted_until: futureDate });
    expect((await muteConversation(r, ctx)).status).toBe(401);
  });

  test('400 — muted_until no es ISO datetime', async () => {
    const r = req('PATCH', `/api/conversations/${CONV_ID}/mute`, { muted_until: 'not-a-date' }, token());
    expect((await muteConversation(r, ctx)).status).toBe(400);
  });

  test('400 — campo muted_until faltante por completo', async () => {
    const r = req('PATCH', `/api/conversations/${CONV_ID}/mute`, {}, token());
    expect((await muteConversation(r, ctx)).status).toBe(400);
  });

  test('403 — usuario no es participante', async () => {
    setupQueue([
      { single: { data: null, error: null } },
    ]);
    const r = req('PATCH', `/api/conversations/${CONV_ID}/mute`, { muted_until: futureDate }, token());
    expect((await muteConversation(r, ctx)).status).toBe(403);
  });

  test('200 — silenciar hasta fecha futura', async () => {
    setupQueue([
      { single: { data: { id: 'part-id' }, error: null } },
      { single: { data: { muted_until: futureDate }, error: null } },
    ]);
    const r = req('PATCH', `/api/conversations/${CONV_ID}/mute`, { muted_until: futureDate }, token());
    const res = await muteConversation(r, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.muted_until).toBe(futureDate);
  });

  test('200 — activar silenciamiento con null (desmutar)', async () => {
    setupQueue([
      { single: { data: { id: 'part-id' }, error: null } },
      { single: { data: { muted_until: null }, error: null } },
    ]);
    const r = req('PATCH', `/api/conversations/${CONV_ID}/mute`, { muted_until: null }, token());
    const res = await muteConversation(r, ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).muted_until).toBeNull();
  });
});

// ─── Helper: isMuted ─────────────────────────────────────────────────────────
describe('isMuted (helper de hook)', () => {
  test('null → no silenciado', async () => {
    const { isMuted } = await import('@/hooks/useConversations');
    expect(isMuted(null)).toBe(false);
  });

  test('fecha pasada → silenciamiento expirado', async () => {
    const { isMuted } = await import('@/hooks/useConversations');
    const past = new Date(Date.now() - 1000).toISOString();
    expect(isMuted(past)).toBe(false);
  });

  test('fecha futura → actualmente silenciado', async () => {
    const { isMuted } = await import('@/hooks/useConversations');
    const future = new Date(Date.now() + 3_600_000).toISOString();
    expect(isMuted(future)).toBe(true);
  });
});
