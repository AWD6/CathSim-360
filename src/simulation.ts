export function bagStatus(height:number){return height-.36<=0?'ถุงแตะพื้น: ยกขึ้นให้พ้นพื้น':height+.36>=1.6?'ถุงสูงเกินระดับกระเพาะปัสสาวะ: ค่อย ๆ ลดระดับลง':'ถุงต่ำกว่ากระเพาะปัสสาวะ และไม่แตะพื้น';}
export function drainTick(fill:number,valve:boolean,container:boolean,dt:number){return valve&&container?Math.max(0,fill-Math.max(0,dt)*.085):fill;}
