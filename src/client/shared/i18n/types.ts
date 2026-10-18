export type SupportedLocale = 'zh-CN' | 'en-US' | 'ja-JP' | 'ko-KR';

export interface LocaleMeta {
  id: SupportedLocale;
  label: string;
  nativeLabel: string;
}

export const SUPPORTED_LOCALES: LocaleMeta[] = [
  { id: 'zh-CN', label: '中文', nativeLabel: '中文' },
  { id: 'en-US', label: 'English', nativeLabel: 'English' },
  { id: 'ja-JP', label: '日本語', nativeLabel: '日本語' },
  { id: 'ko-KR', label: '한국어', nativeLabel: '한국어' },
];

export interface TranslationSchema {
  common: {
    confirm: string;
    cancel: string;
    save: string;
    delete: string;
    close: string;
    back: string;
    search: string;
    loading: string;
    retry: string;
    refresh: string;
    success: string;
    failed: string;
    copied: string;
    edit: string;
    add: string;
  };
  settings: {
    title: string;
    interfaceLanguage: string;
    interfaceLanguageDesc: string;
    unmodifiedNotice: string;
    globalSettings: string;
    nav: {
      profile: string;
      api: string;
      chat: string;
      image: string;
      video: string;
      three_d: string;
      music: string;
      voice: string;
      avatar: string;
      storage: string;
      appearance: string;
      language: string;
      canvas: string;
      pet: string;
    };
  };
  sidebar: {
    create: string;
    skills: string;
    assets: string;
    settings: string;
    expand: string;
    collapse: string;
    skillsComingSoon: string;
    history: {
      chats: string;
      recent: string;
      defaultTitle: string;
      noHistory: string;
      newChat: string;
      pin: string;
      rename: string;
      delete: string;
    };
  };
  promptBar: {
    agent: string;
    agentTips: string[];
    manualBadge: string;
    refMedia: string;
    refMediaVideo: string;
    depthImage: string;
    depthVideo: string;
    videoMultiFrame: string;
    videoFirstLastFrame: string;
    imageDefault: string;
    imageDock: string;
    optimize: string;
    preferences: string;
    canvasLink: string;
    canvasLinkTitle: string;
    send: string;
    generate: string;
    generating: string;
    modes: {
      image: string;
      video: string;
      agent: string;
      depth: string;
    };
  };
  canvas: {
    connections: string;
    board: string;
    nodes: string;
    actions: string;
    minimap: string;
    doubleClickToCreate: string;
    untitledProject: string;
    projectCreated: string;
    emptyProject: string;
    layers: string;
    zoomIn: string;
    zoomOut: string;
    resetZoom: string;
  };
  assets: {
    all: string;
    image: string;
    video: string;
    audio: string;
    document: string;
    canvas: string;
    import: string;
    export: string;
    newFolder: string;
    searchPlaceholder: string;
    noAssets: string;
    materialLibrary: string;
    assetLibrary: string;
    aiGenerated: string;
    myUploads: string;
    flatView: string;
    projectView: string;
    noMatchingMaterials: string;
    batchAction: string;
    selectAll: string;
    deselectAll: string;
    exitBatch: string;
    selectedCount: string;
    batchDownload: string;
    batchDelete: string;
    sort: string;
    sortNewest: string;
    sortOldest: string;
    sortName: string;
    timeline: {
      today: string;
      yesterday: string;
      earlier: string;
    };
    categories: {
      character: string;
      product: string;
      voice: string;
      file: string;
      addCharacter: string;
      addProduct: string;
      addVoice: string;
      addFile: string;
    };
  };
  generate: {
    queued: string;
    generating: string;
    completed: string;
    failed: string;
    retry: string;
  };
}
