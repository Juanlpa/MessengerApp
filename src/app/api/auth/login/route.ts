/**
 * POST /api/auth/login
 *
 * Recibe:
 * { email, passwordHash }
 */

import { NextRequest, NextResponse } from 'next/server';

import { getSupabaseAdmin } from '@/lib/supabase/admin';

import {
signJWT,
createJWTPayload
} from '@/lib/auth/jwt';

import {
constantTimeEqual,
fromHex
} from '@/lib/crypto/utils';

import {
checkRateLimit,
saveAttempt
} from '@/lib/auth/rateLimit';

import {
logSecurityEvent
} from '../../../../lib/auth/securityLogs';

import {
createSession
} from '../../../../lib/auth/sessionManager';


interface UserRow{

id:string;

email:string;

username:string;

password_hash:string;

dh_public_key:string;

}


export async function POST(
request:NextRequest
){

try{

const ip=
request.headers.get(
'x-forwarded-for'
)||'unknown';


const userAgent=
request.headers.get(
'user-agent'
)||'unknown';



const allowed=
await checkRateLimit(
ip
);


if(!allowed){

await logSecurityEvent(

'RATE_LIMIT_BLOCK',

null,

{
ip,
userAgent
}

);

return NextResponse.json(
{
error:
'Too many attempts'
},
{
status:429
}
);

}



const body=
await request.json();

const {

email,

passwordHash

}=body;


if(
!email||
!passwordHash
){

return NextResponse.json(
{
error:
'Email and passwordHash required'
},
{
status:400
}
);

}


const supabase=
getSupabaseAdmin();


const {data}=
await supabase

.from('users')

.select(
'id,email,username,password_hash,dh_public_key'
)

.eq(
'email',
email.toLowerCase()
)

.single();


const user=
data as UserRow|null;


if(!user){

await saveAttempt(
email,
ip,
false
);

await logSecurityEvent(

'LOGIN_FAILED',

null,

{
ip,
email
}

);

return NextResponse.json(
{
error:
'Invalid credentials'
},
{
status:401
}
);

}


const storedHash=
fromHex(
user.password_hash
);

const providedHash=
fromHex(
passwordHash
);


if(
!constantTimeEqual(
storedHash,
providedHash
)
){

await saveAttempt(
email,
ip,
false
);

await logSecurityEvent(

'LOGIN_FAILED',

user.id,

{
ip
}

);

return NextResponse.json(
{
error:
'Invalid credentials'
},
{
status:401
}
);

}


const payload=
createJWTPayload({

id:user.id,

email:user.email,

username:user.username

});


const token=
signJWT(
payload
);


await saveAttempt(
email,
ip,
true
);


await createSession(

user.id,

token,

userAgent,

ip

);


await logSecurityEvent(

'LOGIN_SUCCESS',

user.id,

{
ip,
userAgent
}

);


return NextResponse.json({

token,

user:{

id:user.id,

email:user.email,

username:user.username

}

});


}
catch(err){

console.error(
'Login error:',
err
);

return NextResponse.json(
{
error:
'Internal server error'
},
{
status:500
}
);

}

}