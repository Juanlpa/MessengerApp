'use client';

import { useState } from 'react';

export default function SettingsPage(){

const [loading,setLoading]
=
useState(false);


async function
closeOthers(){

try{

setLoading(true);

await fetch(
'/api/auth/revoke-other-sessions',
{
method:'POST'
}
);

alert(
'Otras sesiones cerradas'
);

}
catch{

alert(
'Error'
);

}
finally{

setLoading(false);

}

}


return(

<div className="p-5">

<h1
className="text-xl font-bold"
>

Dispositivos conectados

</h1>


<button

onClick={
closeOthers
}

disabled={
loading
}

className="
mt-4
p-2
border
rounded
"

>

{

loading

?

'Cerrando...'

:

'Cerrar sesión en otros dispositivos'

}

</button>

</div>

)

}