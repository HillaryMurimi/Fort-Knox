export async function requestJson<T>(url:string, options:RequestInit & {timeoutMs?:number} = {}):Promise<T>{
  const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),options.timeoutMs??15000);
  try { const {timeoutMs:_,...init}=options; const res=await fetch(url,{...init,signal:controller.signal,headers:{'content-type':'application/json',...(init.headers??{})}}); const text=await res.text(); let body:unknown=undefined; try{body=text?JSON.parse(text):undefined;}catch{body=text;} if(!res.ok) throw new Error(`HTTP_${res.status}:${typeof body==='string'?body:JSON.stringify(body)}`); return body as T; } finally { clearTimeout(timeout); }
}

export async function requestForm<T>(url:string, body:URLSearchParams, headers:Record<string,string>={}, timeoutMs=15000):Promise<T>{
  const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),timeoutMs); try{const res=await fetch(url,{method:'POST',body,signal:controller.signal,headers:{'content-type':'application/x-www-form-urlencoded',...headers}});const text=await res.text();let parsed:unknown;try{parsed=text?JSON.parse(text):undefined;}catch{parsed=text;}if(!res.ok)throw new Error(`HTTP_${res.status}:${typeof parsed==='string'?parsed:JSON.stringify(parsed)}`);return parsed as T;}finally{clearTimeout(timeout);}
}
