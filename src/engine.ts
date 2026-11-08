export type Mission = 'position' | 'drain';
export type Mode = 'learn' | 'practice' | 'challenge';
export type Action = {type:'select-bag'} | {type:'height'; value:number} | {type:'container'} | {type:'tap'} | {type:'tick'; dt:number} | {type:'reset'};
export type State = {height:number; selected:boolean; container:boolean; tap:boolean; fluid:number; collected:number; actions:string[]};
export const initialState = ():State => ({height:1.05,selected:false,container:false,tap:false,fluid:0.8,collected:0,actions:[]});
export function transition(state:State, action:Action):State {
  const record=(s:Partial<State>, event:string) => ({...state,...s,actions:[...state.actions,event].slice(-500)});
  switch(action.type){
    case 'reset': return initialState();
    case 'select-bag': return record({selected:true},'เลือกถุงในฉาก');
    case 'height': return record({height:Math.min(1.8,Math.max(0.45,Number.isFinite(action.value)?action.value:state.height))},'ปรับตำแหน่งถุง');
    case 'container': return record({container:!state.container},'ย้ายภาชนะจำลอง');
    case 'tap': return record({tap:!state.tap},'สลับวาล์วจำลอง');
    case 'tick': {
      if(!state.tap || state.fluid<=0 || !Number.isFinite(action.dt) || action.dt<=0)return state;
      const amount=Math.min(state.fluid,Math.min(action.dt,0.25)*0.13);
      return {...state,fluid:Math.max(0,state.fluid-amount),collected:state.collected+(state.container?amount:0)};
    }
  }
}
export function coverage(state:State,mission:Mission){
  const required=mission==='position'?['เลือกถุงในฉาก','ปรับตำแหน่งถุง']:['ย้ายภาชนะจำลอง','สลับวาล์วจำลอง'];
  return Math.round(required.filter(a=>state.actions.includes(a)).length/required.length*100);
}
export type Report={id:string; mission:Mission; mode:Mode; coverage:number; interactions:number; createdAt:string; clinicalScore:null; sourceStatus:'awaiting-source'};
export const reportKey='cathsim-360:anonymous:v1';
export function readReports():Report[]{try{const v=JSON.parse(localStorage.getItem(reportKey)||'[]');return Array.isArray(v)?v.filter(r=>r && typeof r.id==='string' && ['position','drain'].includes(r.mission) && typeof r.coverage==='number' && r.clinicalScore===null).slice(-100):[];}catch{return [];}}
