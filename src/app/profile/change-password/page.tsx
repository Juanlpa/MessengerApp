'use client';

import { useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';

export default function ChangePasswordPage() {

  const token = useAuthStore(
    state => state.token
  );

  const [currentPassword,setCurrentPassword]=useState('');
  const [newPassword,setNewPassword]=useState('');
  const [message,setMessage]=useState('');
  const [loading,setLoading]=useState(false);

  async function handleSubmit(
    e:React.FormEvent
  ){

    e.preventDefault();

    setLoading(true);

    try{

      const res=
      await fetch(
      '/api/auth/change-password',
      {
        method:'PATCH',
        headers:{
          'Content-Type':'application/json',
          Authorization:`Bearer ${token}`
        },
        body:JSON.stringify({
          currentPassword,
          newPassword
        })
      });

      const data=
      await res.json();

      setMessage(
        data.message ||
        data.error
      );

      if(res.ok){

        setCurrentPassword('');
        setNewPassword('');

      }

    }catch{

      setMessage(
      'Error al cambiar contraseña'
      );

    }

    setLoading(false);

  }

  return(

<div className="min-h-screen bg-[#f0f2f5] flex justify-center items-center">

<form
onSubmit={handleSubmit}
className="bg-white w-[420px] p-8 rounded-xl shadow"
>

<h1 className="text-2xl font-bold mb-6 text-center">

Cambiar contraseña

</h1>


<input
type="password"
placeholder="Contraseña actual"
value={currentPassword}
onChange={(e)=>
setCurrentPassword(
e.target.value
)}
className="w-full border p-3 rounded mb-4"
/>


<input
type="password"
placeholder="Nueva contraseña"
value={newPassword}
onChange={(e)=>
setNewPassword(
e.target.value
)}
className="w-full border p-3 rounded mb-4"
/>


<button
disabled={loading}
className="w-full bg-[#0084ff] text-white p-3 rounded"
>

{loading
?'Actualizando...'
:'Cambiar contraseña'}

</button>


{message && (

<p className="text-center mt-4">

{message}

</p>

)}

</form>

</div>

);

}