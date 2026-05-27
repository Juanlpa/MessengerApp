'use client';

import { useState } from 'react';

export default function ForgotPasswordPage(){

const[email,setEmail]=
useState('');

const[msg,setMsg]=
useState('');

const[loading,setLoading]=
useState(false);

const handleSend=
async()=>{

if(!email){

setMsg(
'Ingrese un correo'
);

return;

}

setLoading(true);

try{

const res=
await fetch(
'/api/auth/reset-password',
{
method:'POST',

headers:{
'Content-Type':
'application/json'
},

body:JSON.stringify({
email
})
}
);

const data=
await res.json();

setMsg(
data.message||
data.error
);

}
catch{

setMsg(
'Error'
);

}

setLoading(false);

};

return(

<div className="max-w-md mx-auto mt-20 p-5 border rounded">

<h1 className="text-2xl mb-5">

Recuperar contraseña

</h1>

<input

type="email"

placeholder=
"Correo"

value={email}

onChange={(e)=>
setEmail(
e.target.value
)
}

className=
"border p-2 w-full"

/>

<button

onClick={handleSend}

disabled={loading}

className=
"bg-blue-500 text-white p-2 mt-4 w-full"

>

{
loading
?
'Enviando...'
:
'Enviar enlace'
}

</button>

{
msg&&
<p className="mt-4">
{msg}
</p>
}

</div>

)

}