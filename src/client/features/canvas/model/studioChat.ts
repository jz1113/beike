import { apiFetch } from '@client/shared/api/apiClient';
import { getGatewayClientHeaders, getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { recordChatTokens } from '@client/shared/utils/modelUsage';
import { studioChannels } from './studioGeneration';

/** 由宿主提交，画布只能选择模型和消息，不能指定上游地址或凭据。 */
export async function canvasChatRequest(payload: Record<string, unknown>, signal: AbortSignal) {
  const channel = studioChannels().find(ch => ch.kind === 'chat' && ch.id === payload.model);
  if (!channel) throw new Error('所选文本模型已不可用，请重新选择贝壳云图模型');
  const {messages, tools, tool_choice, temperature, max_tokens, response_format, reasoning_effort} = payload;
  const res = await apiFetch('/api/generate/canvas-text', {method:'POST',signal,
    headers:{'Content-Type':'application/json'}, body:JSON.stringify({model:channel.route,
      messages, tools, tool_choice, temperature, max_tokens, response_format, reasoning_effort, ...getMultimodalClientOverrides(channel.route)})});
  const data = await res.json();
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : '贝壳云图文本模型请求失败');
  recordChatTokens({modelId:channel.route,type:'chat',usage:data.usage});
  if (!payload.stream) return Response.json(data);
  const choices = data.choices.map((choice: {message: {tool_calls?: Array<Record<string,unknown>>};finish_reason:string}, index:number) => ({
    index, finish_reason:choice.finish_reason, delta:{...choice.message, ...(choice.message.tool_calls ? {
      tool_calls:choice.message.tool_calls.map((call,i) => ({...call,index:i}))} : {})},
  }));
  return new Response('data: '+JSON.stringify({...data,choices})+'\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
}

export async function canvasSpeechRequest(model:string, prompt:string, voice:string | undefined, clientTaskId:string) {
  const channel = studioChannels().find(ch => ch.kind === 'voice' && ch.id === model);
  if (!channel) throw new Error('贝壳云图暂无可用的语音模型');
  const res = await apiFetch('/api/generate/audio', {method:'POST',headers:{'Content-Type':'application/json',...getGatewayClientHeaders(channel.route)},
    body:JSON.stringify({model:channel.modelId,prompt,voice,clientTaskId})});
  const data = await res.json();
  if (!res.ok || !data.success || !data.audioUrl) throw new Error(data.error || '贝壳云图语音生成失败');
  return String(data.audioUrl);
}
