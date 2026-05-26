import { getSupabaseAdmin }
from '@/lib/supabase/admin';

import {
logSecurityEvent
} from './securityLogs';


export async function revokeJWT(

token:string,
userId:string

){

try{

const supabase=
getSupabaseAdmin();

await supabase

.from(
'revoked_tokens'
)

.insert({

token,

user_id:userId,

revoked_at:new Date()

});


await logSecurityEvent(

'JWT_REVOKED',

userId,

{}

);

}
catch(error){

console.error(
'JWT revoke error:',
error
);

}

}



export async function isRevoked(

token:string

){

try{

const supabase=
getSupabaseAdmin();

const {
data
}=await supabase

.from(
'revoked_tokens'
)

.select('id')

.eq(
'token',
token
)

.single();


return !!data;

}
catch{

return false;

}

}