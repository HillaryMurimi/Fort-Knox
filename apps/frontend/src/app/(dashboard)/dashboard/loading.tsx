export default function Loading(){
    return (
    <div className="animate-pulse space-y-4"><div className="h-8 bg-[#e5e7eb] rounded-xl w-48"/><div className="grid grid-cols-5 gap-3">{Array.from({length:5}).map((_,i)=><div className="h-32 bg-card border rounded-2xl" key={i}/>)}</div></div>
    )
}
