export async function withRetry<T>(operation:()=>Promise<T>, options:{maxAttempts?:number;baseDelayMs?:number;maxDelayMs?:number;shouldRetry?:(error:unknown)=>boolean}={}):Promise<T>{
 const max=options.maxAttempts??4, base=options.baseDelayMs??500, cap=options.maxDelayMs??10000, should=options.shouldRetry??(()=>true); let last:unknown;
 for(let attempt=1;attempt<=max;attempt++){try{return await operation();}catch(error){last=error;if(attempt===max||!should(error))break;const delay=Math.min(cap,base*2**(attempt-1)+Math.floor(Math.random()*250));await new Promise(r=>setTimeout(r,delay));}}
 throw last instanceof Error?last:new Error('Provider operation failed');
}
