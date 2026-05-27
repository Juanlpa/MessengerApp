'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import Link from 'next/link';
import { usePresence } from '@/hooks/usePresence';
import { OnlineIndicator } from '@/components/chat/OnlineIndicator';
import { useRouter } from 'next/navigation';

interface Conversation {
  id: string;
  otherUser: {
    id: string;
    username: string;
  };
  encryptedSharedKey: {
    ciphertext: string;
    iv: string;
    mac: string;
  };
  lastMessageAt: string | null;
}

export default function ChatPage() {

  const router = useRouter();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');

  const [searchResults, setSearchResults] =
    useState<
      Array<{
        id:string;
        username:string;
        dh_public_key:string
      }>
    >([]);

  const [creating,setCreating]=useState(false);

  const { user, token } = useAuthStore();

  const { isUserOnline } =
    usePresence(
      user?.id || '',
      user?.username || ''
    );

  const loadConversations =
    useCallback(async()=>{

      if(!token) return;

      const res =
        await fetch(
          `/api/conversations?t=${Date.now()}`,
          {
            cache:'no-store',
            headers:{
              Authorization:`Bearer ${token}`
            }
          }
        );

      if(res.ok){

        const data =
          await res.json();

        setConversations(
          data.conversations
        );
      }

    },[token]);


  useEffect(()=>{

      loadConversations();

  },[loadConversations]);


  const searchUsers=async()=>{

      if(
        !token ||
        searchQuery.length<2
      ) return;


      const res=
      await fetch(
      `/api/users/search?q=${encodeURIComponent(searchQuery)}`,
      {
      headers:{
      Authorization:`Bearer ${token}`
      }
      });

      if(res.ok){

      const data=
      await res.json();

      setSearchResults(
      data.users
      );

      }

  };


const createConversation=async(otherUser:any)=>{

if(!token||!user)return;

setCreating(true);

try{

const {
generateDHKeyPair
}=await import('@/lib/crypto/dh');

const {
deriveSharedKey,
encryptSharedKeyForStorage
}=await import('@/lib/crypto/key-exchange');

const {
pbkdf2
}=await import('@/lib/crypto/pbkdf2');


const myKeyPair=
generateDHKeyPair();


const sharedKey=
deriveSharedKey(
myKeyPair.privateKey,
otherUser.dh_public_key
);


const myStorageKey=
pbkdf2(
user.id,
'storage-salt',
1000,
32
);

const otherStorageKey=
pbkdf2(
otherUser.id,
'storage-salt',
1000,
32
);


const myEncrypted=
encryptSharedKeyForStorage(
sharedKey,
myStorageKey
);

const otherEncrypted=
encryptSharedKeyForStorage(
sharedKey,
otherStorageKey
);


const res=
await fetch(
'/api/conversations',
{
method:'POST',
headers:{
'Content-Type':'application/json',
Authorization:`Bearer ${token}`
},
body:JSON.stringify({

otherUserId:
otherUser.id,

myEncryptedSharedKey:
myEncrypted,

otherEncryptedSharedKey:
otherEncrypted

})
}
);

if(res.ok){

const data=
await res.json();

setShowNewChat(false);

setSearchQuery('');

setSearchResults([]);

await loadConversations();

window.location.href=
`/chat/${data.conversationId}`;

}

}catch(err){

console.error(err);

}finally{

setCreating(false);

}

};


return(

<div className="flex w-full">

<div className="w-[360px] bg-white border-r border-[#e4e6eb] flex flex-col">

<div className="p-4 pt-5 pb-2">

<div className="flex items-center justify-between mb-4">

<h1 className="text-2xl font-bold">
Chats
</h1>


<div className="flex items-center gap-2 relative">

<button
onClick={()=>
setShowProfileMenu(
!showProfileMenu
)}
className="w-10 h-10 rounded-full bg-[#0084ff] text-white font-bold"
>
{user?.username?.charAt(0).toUpperCase()}
</button>


{showProfileMenu&&(

<div className="absolute right-0 top-12 bg-white rounded-xl border shadow-lg w-56 z-50">

<div className="p-4 border-b">

<p className="font-bold">
{user?.username}
</p>

<p className="text-sm text-gray-500">
{user?.email}
</p>

</div>


<button
onClick={()=>
router.push(
'/profile/change-password'
)}
className="w-full px-4 py-3 text-left hover:bg-gray-100"
>
🔒 Cambiar contraseña
</button>


<button
onClick={()=>{

useAuthStore
.getState()
.logout();

router.push(
'/auth/login'
);

}}
className="w-full px-4 py-3 text-left text-red-500 hover:bg-red-50"
>
Cerrar sesión
</button>

</div>

)}

<button
onClick={()=>
setShowNewChat(true)
}
className="p-2 rounded-full bg-[#f0f2f5]"
>

<svg
width="18"
height="18"
viewBox="0 0 24 24"
fill="none"
stroke="currentColor"
strokeWidth="2"
>
<path d="M12 5v14M5 12h14"/>
</svg>

</button>

</div>

</div>


<div className="relative mb-2">

<input
type="text"
placeholder="Buscar en Messenger"
className="w-full bg-[#f0f2f5] rounded-full py-2 px-4"
/>

</div>

</div>


<div className="flex-1 overflow-y-auto px-2">

{conversations.length===0?(

<div className="p-8 text-center">

No tienes conversaciones aún

</div>

):(

conversations.map(conv=>(

<Link
key={conv.id}
href={`/chat/${conv.id}`}
className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#f0f2f5]"
>

<div className="relative">

<div className="w-12 h-12 rounded-full bg-blue-500 text-white flex items-center justify-center">

{conv.otherUser.username[0]?.toUpperCase()}

</div>

<OnlineIndicator
isOnline={
isUserOnline(
conv.otherUser.id
)
}
size="md"
/>

</div>

<div>

<p>
{conv.otherUser.username}
</p>

</div>

</Link>

))

)}

</div>

</div>

</div>

);

}