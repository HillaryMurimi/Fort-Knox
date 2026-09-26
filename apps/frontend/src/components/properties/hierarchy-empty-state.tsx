import {Plus} from 'lucide-react'; 
import {EmptyState} from '@/components/ui'; 

export function HierarchyEmptyState({title,description,onAdd,icon:Icon}:{title:string;description:string;onAdd?:()=>void;icon:React.ElementType}){return <div><EmptyState icon={Icon} title={title} description={description}/>{onAdd&&<div className="flex justify-center -mt-16 relative pb-8"><button onClick={onAdd} className="btn-primary"><Plus size={15}/> Add</button></div>}</div>
}
