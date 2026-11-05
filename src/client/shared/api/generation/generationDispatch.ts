const dispatched=new Set<string>();
const preparationStops=new Set<(taskId:string)=>void>();

export function claimGenerationDispatch(taskId:string):boolean {
  if(dispatched.has(taskId))return false;
  dispatched.add(taskId);return true;
}
export const finishGenerationDispatch=(taskId:string)=>{dispatched.delete(taskId);};
export const isGenerationDispatching=(taskId:string)=>dispatched.has(taskId);
export function subscribeGenerationPreparationStop(stop:(taskId:string)=>void) {
  preparationStops.add(stop);return ()=>{preparationStops.delete(stop);};
}
export function stopGenerationPreparation(taskId:string) {
  for(const stop of preparationStops)stop(taskId);
}
