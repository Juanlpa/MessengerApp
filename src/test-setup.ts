import '@testing-library/jest-dom';

// Variables de entorno dummy para el entorno de tests.
// El cliente Supabase (src/lib/supabase/client.ts) lanza al importarse si faltan;
// algunos tests importan hooks que lo arrastran. No son credenciales reales:
// solo permiten que createClient() se inicialice sin tocar la red.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key';
