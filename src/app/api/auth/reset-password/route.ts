import crypto from 'crypto';

import {
NextRequest,
NextResponse
}
from 'next/server';

import {
getSupabaseAdmin
}
from '@/lib/supabase/admin';

import {
sendResetEmail
}
from '@/lib/email/sendResetEmail';

export async function POST(
request:NextRequest
){

try{

const {email}=
await request.json();

if(!email){

return NextResponse.json(
{
error:'Email requerido'
},
{
status:400
}
);

}

const supabase=
getSupabaseAdmin();

const {data:user}=
await supabase

.from('users')

.select(
'id,email'
)

.eq(
'email',
email.toLowerCase()
)

.single();

if(!user){

return NextResponse.json({

message:
'Si existe, se envió correo'

});

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

await supabase

.from(
'password_reset_tokens'
)

.insert({

user_id:
user.id,

token_hash:
tokenHash,

expires_at:
new Date(
Date.now()+
30*60*1000
),

used:false

});

const resetLink=

`http://localhost:3000/auth/reset-password?token=${token}`;

await sendResetEmail(
email,
resetLink
);

return NextResponse.json({

message:
'Correo enviado'

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
);

}

}