import { getSupabaseAdmin }
from '@/lib/supabase/admin';


export async function createSession(

  userId:string,
  token:string,
  userAgent:string,
  ip:string

){

try{

const supabase=
getSupabaseAdmin();

await supabase

.from(
'active_sessions'
)

.insert({

user_id:userId,

jwt_token:token,

user_agent:userAgent,

ip_address:ip,

last_active:new Date()

});

}
catch(error){

console.error(
'Create session error:',
error
);

}

}



export async function revokeOtherSessions(

userId:string,
currentToken:string

){

try{

const supabase=
getSupabaseAdmin();

await supabase

.from(
'active_sessions'
)

.delete()

.eq(
'user_id',
userId
)

.neq(
'jwt_token',
currentToken
);

}
catch(error){

console.error(
'Revoke session error:',
error
);

}

}



export async function getActiveSessions(

userId:string

){

try{

const supabase=
getSupabaseAdmin();

const {

data,

error

}=await supabase

.from(
'active_sessions'
)

.select('*')

.eq(
'user_id',
userId
)

.order(
'last_active',
{
ascending:false
}
);


if(error){

console.error(
error
);

return [];

}


return data || [];

}
catch(error){

console.error(
'Get sessions error:',
error
);

return [];

}

}