import crypto from 'crypto';

import {
  NextRequest,
  NextResponse
} from 'next/server';

import {
  getSupabaseAdmin
} from '@/lib/supabase/admin';

export async function POST(
request:NextRequest
){

try{

const body=
await request.json();

const {
token,
password
}=body;


if(
!token||
!password
){

return NextResponse.json(
{
error:'Missing fields'
},
{
status:400
}
);

}


const supabase=
getSupabaseAdmin();


// hash token
const tokenHash=
crypto
.createHash('sha256')
.update(token)
.digest('hex');


const {
data
}
=
await supabase

.from(
'password_reset_tokens'
)

.select('*')

.eq(
'token_hash',
tokenHash
)

.eq(
'used',
false
);


const resetToken=
data?.[0];


if(
!resetToken
){

return NextResponse.json(
{
error:'Token inválido'
},
{
status:401
}
);

}


// verificar expiración
if(
new Date(
resetToken.expires_at
)
<
new Date()
){

return NextResponse.json(
{
error:'Token expirado'
},
{
status:401
}
);

}


// salt nuevo
const salt=
crypto
.randomBytes(16)
.toString('hex');


// PBKDF2
const derivedKey=
crypto
.pbkdf2Sync(
password,
Buffer.from(salt,'hex'),
100000,
32,
'sha256'
);


// SHA256 del resultado
const passwordHash=
crypto
.createHash(
'sha256'
)
.update(
derivedKey
)
.digest(
'hex'
);


// actualizar usuario
await supabase

.from(
'users'
)

.update({

password_hash:
passwordHash,

salt:
salt

})

.eq(
'id',
resetToken.user_id);


// marcar usado
await supabase

.from(
'password_reset_tokens'
)

.update({

used:true

})

.eq(
'id',
resetToken.id);


return NextResponse.json({

message:
'Password updated'

});

}
catch(err){

console.error(err);

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