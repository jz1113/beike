/** 画布引用标记按混合列表编号；生成接口按媒体类型分别编号。 */
const referenceTokens = /@(图片|视频|音频|img)?(\d+)/gi;
const explicitKind = (label:string|undefined) => label?.toLowerCase()==='img' || label==='图片' ? 'image'
  : label==='视频' ? 'video' : label==='音频' ? 'audio' : undefined;

export function assertStudioReferenceNumbers(prompt:string, refs:ReadonlyArray<{type:'image'|'video'}>):void {
  for(const match of prompt.matchAll(referenceTokens)) {
    const ref=refs[Number(match[2])-1],kind=explicitKind(match[1]);
    if(!ref || kind && ref.type!==kind)
      throw new Error(`提示词引用 ${match[0]} 的素材已移除或类型不匹配，请重新引用后提交`);
  }
}

export function normalizeStudioReferenceNumbers(prompt:string, refs:ReadonlyArray<{type:'image'|'video'}>):string {
  return prompt.replace(referenceTokens, (token, label:string|undefined, number:string) => {
    const position=Number(number)-1,ref=refs[position],kind=explicitKind(label);
    if (!ref || kind && ref.type!==kind) return token;
    const index=refs.slice(0,position+1).filter(item=>item.type===ref.type).length;
    return `@${ref.type==='image'?'图片':'视频'}${index}`;
  });
}

/** Connected text is embedded with the same numbered source header as the editor. */
export function assertStudioTextReferences(prompt:string):void {
  const headers=[...prompt.matchAll(/【@文本(\d+) · [^】]*】/g)];
  const available=new Set(headers.filter((match,index)=>
    prompt.slice(match.index!+match[0].length,headers[index+1]?.index).trim()).map(match=>Number(match[1])));
  for(const match of prompt.matchAll(/@文本(\d+)/g)) {
    if(!available.has(Number(match[1])))throw new Error(`提示词引用 ${match[0]} 的文本未连接或内容为空，请重新引用后提交`);
  }
}
