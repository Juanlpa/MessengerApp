import crypto from 'crypto';

import {
  NextRequest,
  NextResponse
} from 'next/server';

import {
  getSupabaseAdmin
} from '@/lib/supabase/admin';

import {
  checkRateLimit,
  saveAttempt
} from '../../../../lib/auth/rateLimit';

import {
  logSecurityEvent
} from '../../../../lib/auth/securityLogs';


export async function POST(
  request: NextRequest
){

try{

const ip=
request.headers.get(
'x-forwarded-for'
)||'unknown';


const allowed=
await checkRateLimit(ip);

if(!allowed){

return NextResponse.json(
{
error:
'Too many attempts'
},
{
status:429
}
)

}

const body=
await request.json();

const {email}=body;


const supabase=
getSupabaseAdmin();

const {data:user}=
await supabase

.from('users')

.select('id')

.eq(
'email',
email
)

.single();


if(!user){

await saveAttempt(
email,
ip,
false
);

return NextResponse.json(
{
error:
'User not found'
},
{
status:404
}
)

}


const token=
crypto
.randomBytes(32)
.toString('hex');


const tokenHash=
crypto
.createHash('sha256')
.update(token)
.digest('hex');


const expiresAt=
new Date(
Date.now()+1800000
);


await supabase

.from(
'password_reset_tokens'
)

.insert({

user_id:user.id,

token_hash:
tokenHash,

expires_at:
expiresAt

});


await logSecurityEvent(

'PASSWORD_RESET_REQUEST',

user.id,

{
ip
}

);


return NextResponse.json({

message:
'Token generated',

token

});

}
catch(err){

console.error(err);

return NextResponse.json(
{
error:
'Internal error'
},
{
status:500
}
)

}

}