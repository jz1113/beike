// 收到贝壳云图工作区发送的项目数据后，再加载画布。
window.addEventListener('message', function initialize(event) {
  if (event.source !== parent || event.origin !== window.parent.location.origin || event.data?.kind !== 'studio:init') return;
  window.removeEventListener('message', initialize);
  const { projectId, scene } = event.data;
  const preferences = new Set(event.data.preferenceKeys);
  const preferencePrefix = event.data.preferencePrefix;
  window.addEventListener('storage', change => {
    if (!change.key?.startsWith(preferencePrefix)) return;
    const key = change.key.slice(preferencePrefix.length);
    if (preferences.has(key)) window.dispatchEvent(new StorageEvent('storage', {key,newValue:change.newValue}));
  });
  window.addEventListener('message', message => {
    if (message.origin === event.origin && message.source === parent && message.data?.kind === 'studio:focus') {
      window.dispatchEvent(new CustomEvent('jiubanbn-agent-action',{detail:{action:'select_node',payload:{nodeId:message.data.nodeId}}}));
    }
  });
  const prefix = 'beike.studio.' + projectId + '.';
  // 画布读取宿主提供的模型目录。旧画布保存的渠道和密钥不参与路由，也不删除。
  const modelStorage = /^(?:lingoart|qiaodoumayi)_(?:api_(?:configs|providers)|global_(?:key|base_url)|saved_api_keys|jimeng_super_resolution_(?:api_key|url))/;
  for (const storageName of ['localStorage', 'sessionStorage']) {
    const storage = window[storageName];
    const fullKey = key => (preferences.has(key) ? preferencePrefix : prefix) + key;
    const keys = () => Object.keys(storage).filter(key => key.startsWith(prefix));
    const scoped = {
      get length() { return keys().length; },
      key(index) { return keys()[index]?.slice(prefix.length) ?? null; },
      getItem(key) { if (modelStorage.test(key)) return null; return storage.getItem(fullKey(key)) ?? storage.getItem(prefix + key); },
      setItem(key, value) { if (modelStorage.test(key)) return; storage.setItem(fullKey(key), value); },
      removeItem(key) { if (modelStorage.test(key)) return; storage.removeItem(fullKey(key)); storage.removeItem(prefix + key); },
      clear() { keys().forEach(key => storage.removeItem(key)); },
    };
    Object.defineProperty(window, storageName, { value: new Proxy(scoped, {
      get(target, key) { return key in target ? target[key] : typeof key === 'string' ? target.getItem(key) : undefined; },
      set(target, key, value) { target.setItem(key, value); return true; },
    }) });
  }
  for (const method of ['open', 'deleteDatabase']) {
    const original = indexedDB[method].bind(indexedDB);
    indexedDB[method] = (name, ...args) => original(prefix + name, ...args);
  }
  let channels = event.data.channels || [];
  const chatBase = event.origin + '/canvas-studio/model-gateway';
  const mergeConfigs = () => channels.map(channel => ({
    id:channel.id, modelName:channel.id, provider:channel.name, enabled:true,
    type:{image:'Image', video:'Video', chat:'Chat', voice:'Speech'}[channel.kind],
    key:'', url:channel.kind === 'chat' ? chatBase : '', localNoAuth:true,
  }));
  const kindFor = {'gen-image':'image','gen-video':'video','text-node':'chat','gen-speech':'voice'};
  function modelFor(type, previous) {
    const options = channels.filter(ch => ch.kind === kindFor[type]);
    const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g,'');
    const match = options.find(ch => ch.id === previous)
      || options.find(ch => previous && [ch.route,ch.modelId,ch.name].some(id => norm(id) === norm(previous)));
    return (match || options.find(ch => ch.preferred) || options[0])?.id || '';
  }
  function normalize(node) {
    if (!kindFor[node.type]) return node;
    const field = node.type === 'text-node' ? 'textNodeChatModel' : 'model';
    const model = modelFor(node.type, node.settings?.[field]);
    if (!node.isGenerating && /请先配置\s*API\s*Key/i.test(node.errorMsg || node.settings?.error || '')) {
      return {...node,errorMsg:undefined,settings:{...node.settings,[field]:model,error:undefined}};
    }
    return model === node.settings?.[field] ? node : {...node,settings:{...node.settings,[field]:model}};
  }
  window.addEventListener('message', message => {
    if (message.source === parent && message.origin === event.origin && message.data?.kind === 'studio:models') {
      channels = message.data.channels;
      window.dispatchEvent(new Event('beike-studio-models'));
    }
  });
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function(input, init) {
    const url = new URL(typeof input === 'string' ? input : input.url || input, document.baseURI);
    if (!url.href.startsWith(chatBase + '/')) {
      // 媒体下载等浏览器操作照常使用网络，模型请求不能绕过宿主直连旧供应商。
      const method = init?.method || input?.method || 'GET';
      if (url.origin !== event.origin && /POST|PUT/i.test(method)
        && /\/(?:v\d+(?:beta)?\/|chat\/completions|generateContent|images\/generations|api\/generate\/)/i.test(url.pathname)) {
        throw Error('贝壳云图后台尚未接入此模型操作');
      }
      return nativeFetch(input,init);
    }
    if (!url.pathname.endsWith('/chat/completions')) throw Error('贝壳云图后台不支持此模型请求');
    const request = new Request(input,init);
    return window.beikeCanvasChat(await request.json(),request.signal);
  };
  async function stableReference(item, loadAsset) {
    const {url, type, assetId} = item;
    if (typeof url !== 'string') throw Error('参考素材缺少地址');
    if (/^(https?:\/\/|\/storage\/)/i.test(url) || url.startsWith('data:' + type + '/')) return {type, url};
    const localId = assetId || (url.startsWith('local-asset://') ? url.slice('local-asset://'.length) : null);
    let blob = localId && await loadAsset(url, localId);
    if (!blob && url.startsWith('blob:')) {
      const response = await fetch(url);
      if (response.ok) blob = await response.blob();
    }
    if (!blob?.size || !blob.type.startsWith(type + '/')) throw Error('参考素材已失效或类型不匹配，请重新导入');
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(Error('无法读取参考素材'));
      reader.readAsDataURL(blob);
    });
    return {type, url:data};
  }
  const pendingNodes = new Map();
  window.beikeStudio = {
    mergeConfigs, modelFor, normalize, chatBase,
    libraryMessage(kind, data={}) { parent.postMessage({kind, projectId, ...data},event.origin); },
    async collectMedia(entries, getBlob) {
      const items=[];
      for (const entry of entries) {
        const kind=entry.type;
        const name=entry.name || entry.node?.nodeName || '画布素材';
        if (/^(https?:\/\/|\/api\/sales\/bgm\/|\/storage\/)/i.test(entry.url || '')) items.push({kind,name,url:entry.url});
        else {
          const file=await getBlob(entry);
          if (!file?.size) throw Error('素材已失效，请重新导入');
          items.push({kind,name,file});
        }
      }
      this.libraryMessage('studio:library-save',{items});
    },
    listenLibrary(insert,feedback) {
      const type='application/x-beike-library-media';
      function receive(e) {
        if (e.origin!==event.origin || e.source!==parent) return;
        if (e.data?.kind==='studio:library-feedback') { feedback(e.data.message,e.data.error); return; }
        if (e.data?.projectId!==projectId) return;
        if (e.data.kind==='studio:library-ping') parent.postMessage({kind:'studio:library-ready',projectId},event.origin);
        if (e.data.kind==='studio:library-insert') insert(e.data.item,undefined,e.data.requestId);
      }
      function drag(e) {
        if (!e.dataTransfer?.types.includes(type)) return;
        e.preventDefault();e.stopImmediatePropagation();
        if (e.type==='dragover') {e.dataTransfer.dropEffect='copy';return;}
        try {insert(JSON.parse(e.dataTransfer.getData(type)),{x:e.clientX,y:e.clientY});}
        catch {feedback('无法读取拖入的素材',true);}
      }
      window.addEventListener('message',receive);
      window.addEventListener('dragover',drag,true);
      window.addEventListener('drop',drag,true);
      parent.postMessage({kind:'studio:library-ready',projectId},event.origin);
      return ()=>{window.removeEventListener('message',receive);window.removeEventListener('dragover',drag,true);window.removeEventListener('drop',drag,true);};
    },
    async generate(node, graph, loadAsset, setGeneratingVisual) {
      if (pendingNodes.has(node.id) || (node.isGenerating && node.beikeTaskId)) return;
      const taskId = 'studio-' + crypto.randomUUID();
      pendingNodes.set(node.id, taskId);
      const settings = normalize(node).settings || {};
      graph.updateNode(node.id, {settings,beikeTaskId:taskId,isGenerating:true,errorMsg:''});
      try {
        if (node.type !== 'gen-speech' && !settings.model) throw Error('贝壳云图暂无可用的'+(node.type === 'gen-video' ? '视频' : '图片')+'模型');
        const links = graph.connections.filter(edge => edge.to === node.id);
        const texts = links.map(edge => graph.nodesMap.get(edge.from)).filter(item => item?.type === 'text-node');
        const prompt = [...texts.map(item => item.content || item.settings?.text || item.prompt),node.prompt].filter(Boolean).join('\n');
        if (node.type === 'gen-speech') {
          if (!prompt.trim()) throw Error('请填写朗读文字或连接文字节点');
          const url = await window.beikeCanvasSpeech(settings.model,prompt,settings.voice || settings.voiceId,taskId);
          graph.updateNode(node.id,{content:url,settings:{...settings,audioUrl:url},beikeTaskId:undefined,isGenerating:false,errorMsg:''});
          pendingNodes.delete(node.id);
          setGeneratingVisual(node.id, false);
          return;
        }
        const inputs = graph.getConnectedInputItems(node.id);
        if (inputs.some(item => item.type !== 'image' && (node.type !== 'gen-video' || item.type !== 'video'))) {
          throw Error(node.type === 'gen-video' ? '此画布生成入口支持图片和视频参考，请移除其他素材。' : '图片生成需要图片参考，请移除其他类型的素材。');
        }
        const refs = await Promise.all(inputs.map(item => stableReference(item, loadAsset)));
        parent.postMessage({kind:'studio:generate', projectId, request:{
          taskId,model:settings.model,prompt,refs,imageQuality:settings.gptImageQuality,ratio:settings.ratio,resolution:settings.resolution,duration:parseFloat(settings.duration) || undefined,
        }},event.origin);
      } catch(error) { pendingNodes.delete(node.id); setGeneratingVisual(node.id, false); graph.updateNode(node.id,{beikeTaskId:undefined,isGenerating:false,errorMsg:error.message}); }
    },
    listen(setNodes, getNodes, setGeneratingVisual, recordVersion) {
      const receive = message => {
        if (message.source !== parent || message.origin !== event.origin) return;
        if (message.data?.kind === 'studio:parameters') {
          const {taskId,settings} = message.data;
          setNodes(nodes => nodes.map(node => node.beikeTaskId === taskId ? {...node,settings:{...node.settings,...settings}} : node));
          return;
        }
        if (message.data?.kind !== 'studio:result') return;
        const {taskId,error} = message.data;
        const rawUrl = message.data.url;
        const url = rawUrl?.startsWith("/") ? new URL(rawUrl,event.origin).href : rawUrl;
        const target = getNodes().find(node => node.beikeTaskId === taskId);
        const nodeId = target?.id ?? [...pendingNodes].find(([, id]) => id === taskId)?.[0];
        if (nodeId && (!pendingNodes.has(nodeId) || pendingNodes.get(nodeId) === taskId)) {
          pendingNodes.delete(nodeId);
          setGeneratingVisual(nodeId, false);
        }
        setNodes(nodes => nodes.map(node => {
          if (node.beikeTaskId !== taskId || !node.isGenerating) return node;
          const settings = {...node.settings, isGenerating:false, progress:url ? 100 : 0, error};
          const update = {beikeTaskId:undefined, isGenerating:false, errorMsg:error, settings};
          if (!url) return {...node, ...update};
          if (node.type === 'gen-video') return recordVersion(node, {...node, ...update, content:url, videoUrl:url, previewType:'video',
            settings:{...settings, generatedImages:[]}});
          const images = [{id:taskId, fullUrl:url, thumbUrl:url, createdAt:Date.now()}];
          return recordVersion(node, {...node, ...update, content:url, imageUrl:url, previewType:'image', generatedImages:images,
            settings:{...settings, generatedImages:images, selectedImageIndex:0}});

        }));
      };
      window.addEventListener('message',receive);
      return () => window.removeEventListener('message',receive);
    },
    load: () => scene && {...scene,nodes:scene.nodes.map(node => normalize(node.type === 'gen-speech' && node.isGenerating
      ? {...node,isGenerating:false,beikeTaskId:undefined,errorMsg:'上次语音请求尚未回写，请先查看贝壳云图生成历史。'} : node))},
    save: scene => parent.postMessage({kind:'studio:save', projectId, scene}, event.origin),
  };
  import('./assets/index-CnvXMEQ8.js').catch(error => {
    document.getElementById('root').textContent = '画布加载失败：' + error.message;
  });
});
parent.postMessage({kind:'studio:ready'}, window.parent.location.origin);
