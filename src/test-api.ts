import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { signJWT } from './lib/auth/jwt';

async function testApi() {
  const token = signJWT({
    sub: '827b99c6-8a77-4247-bfbe-fdda4c9735b0', // user 1
    email: 'test@example.com',
    username: 'test',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600
  });

  const res = await fetch('http://localhost:3000/api/conversations', {
    headers: { Authorization: `Bearer ${token}` }
  });

  const data = await res.json();
  console.log('GET /api/conversations response:', JSON.stringify(data, null, 2));
}

testApi().catch(console.error);
