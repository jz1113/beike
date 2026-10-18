export interface AvatarCharacter {
  id: string;
  workspaceId: string;
  name: string;
  type: number; // 0: 系统预设, 1: 自定义克隆
  status: number; // 0: 训练中, 1: 可用, 2: 失败
  statusMsg: string;
  videoUrl: string;
  coverUrl: string;
  coverWidth: number;
  coverHeight: number;
  audioPromptUrl?: string;
  welcomeVideoUrl?: string;
  humanId?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AvatarVoice {
  id: string;
  workspaceId: string;
  name: string;
  type: number; // 0: 系统预设, 1: 自定义克隆
  status: number; // 0: 训练中, 1: 可用, 2: 失败
  statusMsg: string;
  audioUrl: string;
  promptNpyUrl?: string;
  promptText?: string;
  sampleAudioUrl?: string;
  voiceId?: string;
  gender: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AvatarFont {
  id: string;
  name: string;
  nickname: string;
  fontUrl: string;
  previewUrl?: string;
}

export interface AvatarVideoTask {
  id: string;
  workspaceId: string;
  title: string;
  scriptContent: string;
  layout: 1 | 2; // 1: 横屏(16:9), 2: 竖屏(9:16)
  resolution: 1 | 2 | 3 | 4 | 5; // 1: 480p, 2: 720p, 3: 1080p, 4: 2k, 5: 4k
  frameRate: 1 | 2 | 3 | 4; // 1: 25fps, 2: 30fps, 3: 50fps, 4: 60fps
  exportFormat: 'mp4' | 'mov';
  avatarId: string;
  avatarPosition: string; // "x,y"
  avatarScale: number;
  voiceId: string;
  voiceSpeed: number;
  voiceVolume: number;
  bgType: 'color' | 'image' | 'video';
  bgColor: string;
  bgMediaUrl?: string;
  subtitleEnabled: boolean;
  fontId: string;
  fontSize: number;
  fontColor: string;
  fontPosition: string;
  status: number; // 0: 生成中, 1: 已完成, 2: 失败
  progress: number; // 0-100
  currentStage: string;
  statusMsg: string;
  videoUrl?: string;
  coverUrl?: string;
  duration?: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
}

export interface RenderAvatarVideoPayload {
  title: string;
  scriptContent: string;
  layout: 1 | 2;
  resolution: 1 | 2 | 3 | 4 | 5;
  frameRate: 1 | 2 | 3 | 4;
  exportFormat: 'mp4' | 'mov';
  avatarId: string;
  avatarPosition: string;
  avatarScale: number;
  voiceId: string;
  voiceSpeed: number;
  voiceVolume: number;
  bgType: 'color' | 'image' | 'video';
  bgColor: string;
  bgMediaUrl?: string;
  subtitleEnabled: boolean;
  fontId: string;
  fontSize: number;
  fontColor: string;
  fontPosition: string;
  voiceModel?: string;
  videoModel?: string;
  customBaseUrl?: string;
  customApiKey?: string;
  voiceBaseUrl?: string;
  voiceApiKey?: string;
  driverBaseUrl?: string;
  driverApiKey?: string;
  driveMode?: 'photo' | 'video';
}

export interface CreateAvatarCharacterPayload {
  name: string;
  videoUrl: string;
  coverUrl?: string;
  mediaKind?: 'image' | 'video';
  description?: string;
}

export interface CreateAvatarVoicePayload {
  name: string;
  audioUrl: string;
  promptText: string;
  gender: string;
  tags: string[];
  provider?: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
}
