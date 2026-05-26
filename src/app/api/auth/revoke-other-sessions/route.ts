import {
NextRequest,
NextResponse
} from 'next/server';

import {
revokeOtherSessions
} from '../../../../lib/auth/sessionManager';

import {
logSecurityEvent
} from '../../../../lib/auth/securityLogs';


export async function POST(
request:NextRequest
){

try{

const token=
request.headers.get(
'authorization'
)?.replace(
'Bearer ',
''
);


if(!token){

return NextResponse.json(
{
error:
'Unauthorized'
},
{
status:401
}
);

}


const userId=
request.headers.get(
'x-user-id'
);


if(!userId){

return NextResponse.json(
{
error:
'User not found'
},
{
status:401
}
);

}


await revokeOtherSessions(

userId,

token

);


await logSecurityEvent(

'OTHER_SESSIONS_REVOKED',

userId,

{}

);


return NextResponse.json({

success:true

});

}
catch(error){

console.error(
error
);

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