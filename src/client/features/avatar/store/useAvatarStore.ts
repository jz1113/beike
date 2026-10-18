import { create } from 'zustand';
import { isAvatarDriverModel } from '@shared/domain/models/avatarDrivers';
import { resolveModalityModelRoute } from '@shared/domain/models/modalityStorage';
import type {
  AvatarCharacter,
  AvatarVoice,
  AvatarFont,
  AvatarVideoTask,
  RenderAvatarVideoPayload,
} from '@shared/contracts';
import {
  fetchAvatarCharacters,
  fetchAvatarVoices,
  fetchAvatarFonts,
  fetchAvatarTasks,
  fetchAvatarTask,
  renderAvatarVideo,
  deleteAvatarCharacter,
  deleteAvatarVoice,
  deleteAvatarTask,
} from '../api/avatarApi';

export type AvatarStudioTab = 'studio' | 'characters' | 'voices' | 'creations';

const avatarPollTokens = new Map<string, number>();

interface AvatarStudioState {
  // Navigation
  activeTab: AvatarStudioTab;
  setActiveTab: (tab: AvatarStudioTab) => void;

  // Assets
  characters: AvatarCharacter[];
  voices: AvatarVoice[];
  fonts: AvatarFont[];
  tasks: AvatarVideoTask[];
  isLoadingAssets: boolean;

  // Selected Assets
  selectedCharacterId: string;
  selectedVoiceId: string;
  selectedVoiceModel: string;
  selectedVideoModel: string;
  driveMode: 'photo' | 'video';
  setSelectedCharacterId: (id: string) => void;
  setSelectedVoiceId: (id: string) => void;
  setSelectedVoiceModel: (model: string) => void;
  setSelectedVideoModel: (model: string) => void;
  setDriveMode: (mode: 'photo' | 'video') => void;

  // Studio Configuration
  title: string;
  scriptContent: string;
  layout: 1 | 2; // 1: 16:9, 2: 9:16
  resolution: 1 | 2 | 3 | 4 | 5;
  frameRate: 1 | 2 | 3 | 4;
  exportFormat: 'mp4' | 'mov';
  avatarPosition: { x: number; y: number };
  avatarScale: number;
  voiceSpeed: number;
  voiceVolume: number;
  bgType: 'color' | 'image' | 'video';
  bgColor: string;
  bgMediaUrl: string;
  subtitleEnabled: boolean;
  fontId: string;
  fontSize: number;
  fontColor: string;
  fontPosition: string;

  // Actions
  setTitle: (t: string) => void;
  setScriptContent: (s: string) => void;
  setLayout: (l: 1 | 2) => void;
  setResolution: (r: 1 | 2 | 3 | 4 | 5) => void;
  setFrameRate: (f: 1 | 2 | 3 | 4) => void;
  setAvatarPosition: (pos: { x: number; y: number }) => void;
  setAvatarScale: (scale: number) => void;
  setVoiceSpeed: (speed: number) => void;
  setVoiceVolume: (vol: number) => void;
  setBgType: (type: 'color' | 'image' | 'video') => void;
  setBgColor: (c: string) => void;
  setBgMediaUrl: (url: string) => void;
  setSubtitleEnabled: (e: boolean) => void;
  setFontId: (id: string) => void;
  setFontSize: (size: number) => void;
  setFontColor: (color: string) => void;

  // Generation & Pipeline
  isSubmitting: boolean;
  activeTaskId: string | null;
  loadAllAssets: () => Promise<void>;
  submitRender: () => Promise<AvatarVideoTask | null>;
  pollActiveTask: (taskId: string) => Promise<AvatarVideoTask | null>;
  removeCharacter: (id: string) => Promise<void>;
  removeVoice: (id: string) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
}

export const useAvatarStore = create<AvatarStudioState>((set, get) => ({
  activeTab: 'studio',
  setActiveTab: (tab) => set({ activeTab: tab }),

  characters: [],
  voices: [],
  fonts: [],
  tasks: [],
  isLoadingAssets: false,

  selectedCharacterId: '',
  selectedVoiceId: '',
  selectedVoiceModel: '',
  selectedVideoModel: '',
  driveMode: 'photo',
  setSelectedCharacterId: (id) => set({ selectedCharacterId: id }),
  setSelectedVoiceId: (id) => set({ selectedVoiceId: id }),
  setSelectedVoiceModel: (selectedVoiceModel) => set({ selectedVoiceModel }),
  setSelectedVideoModel: (selectedVideoModel) => set({ selectedVideoModel }),
  setDriveMode: (driveMode) => set({ driveMode }),

  title: '爆款带货数字人口播',
  scriptContent: '家人们大家好！今天给大家测评的是这款全网爆款多功能神器。无论是外观质感还是实用性能都极其出众，真正的一站式解决所有痛点，建议直接闭眼入！',
  layout: 2, // 默认 9:16 竖屏
  resolution: 3, // 1080P
  frameRate: 2, // 30fps
  exportFormat: 'mp4',
  avatarPosition: { x: 0, y: 0 },
  avatarScale: 1.0,
  voiceSpeed: 1.0,
  voiceVolume: 1.0,
  bgType: 'color',
  bgColor: '#000000',
  bgMediaUrl: '',
  subtitleEnabled: true,
  fontId: 'font_ali_yuanti',
  fontSize: 28,
  fontColor: '#FFFFFF',
  fontPosition: 'bottom',

  setTitle: (title) => set({ title }),
  setScriptContent: (scriptContent) => set({ scriptContent }),
  setLayout: (layout) => set({ layout }),
  setResolution: (resolution) => set({ resolution }),
  setFrameRate: (frameRate) => set({ frameRate }),
  setAvatarPosition: (avatarPosition) => set({ avatarPosition }),
  setAvatarScale: (avatarScale) => set({ avatarScale }),
  setVoiceSpeed: (voiceSpeed) => set({ voiceSpeed }),
  setVoiceVolume: (voiceVolume) => set({ voiceVolume }),
  setBgType: (bgType) => set({ bgType }),
  setBgColor: (bgColor) => set({ bgColor }),
  setBgMediaUrl: (bgMediaUrl) => set({ bgMediaUrl }),
  setSubtitleEnabled: (subtitleEnabled) => set({ subtitleEnabled }),
  setFontId: (fontId) => set({ fontId }),
  setFontSize: (fontSize) => set({ fontSize }),
  setFontColor: (fontColor) => set({ fontColor }),

  isSubmitting: false,
  activeTaskId: null,

  loadAllAssets: async () => {
    set({ isLoadingAssets: true });
    try {
      const [characters, voices, fonts, tasks] = await Promise.all([
        fetchAvatarCharacters().catch(() => []),
        fetchAvatarVoices().catch(() => []),
        fetchAvatarFonts().catch(() => []),
        fetchAvatarTasks().catch(() => []),
      ]);

      const updates: Partial<AvatarStudioState> = {
        characters,
        voices,
        fonts,
        tasks,
      };

      if (!get().selectedCharacterId && characters.length > 0) {
        updates.selectedCharacterId = characters[0].id;
      }
      if (!get().selectedVoiceId && voices.length > 0) {
        updates.selectedVoiceId = voices[0].id;
      }
      if (fonts.length > 0 && !get().fontId) {
        updates.fontId = fonts[0].id;
      }

      set(updates);
    } finally {
      set({ isLoadingAssets: false });
    }
  },

  submitRender: async () => {
    const s = get();
    if (!s.title || !s.scriptContent || !s.selectedCharacterId || !s.selectedVoiceId) {
      return null;
    }
    set({ isSubmitting: true });
    try {
      if (s.selectedVideoModel && !isAvatarDriverModel(resolveModalityModelRoute('avatar', s.selectedVideoModel).modelId || s.selectedVideoModel)) {
        return null;
      }
      const voiceRoute = resolveModalityModelRoute('voice', s.selectedVoiceModel);
      const videoRoute = resolveModalityModelRoute('avatar', s.selectedVideoModel);
      const payload: RenderAvatarVideoPayload = {
        title: s.title,
        scriptContent: s.scriptContent,
        layout: s.layout,
        resolution: s.resolution,
        frameRate: s.frameRate,
        exportFormat: s.exportFormat,
        avatarId: s.selectedCharacterId,
        avatarPosition: `${s.avatarPosition.x},${s.avatarPosition.y}`,
        avatarScale: s.avatarScale,
        voiceId: s.selectedVoiceId,
        voiceSpeed: s.voiceSpeed,
        voiceVolume: s.voiceVolume,
        bgType: s.bgType,
        bgColor: s.bgColor,
        bgMediaUrl: s.bgMediaUrl,
        subtitleEnabled: s.subtitleEnabled,
        fontId: s.fontId,
        fontSize: s.fontSize,
        fontColor: s.fontColor,
        fontPosition: s.fontPosition,
        voiceModel: s.selectedVoiceModel ? voiceRoute.modelId || undefined : undefined,
        videoModel: s.selectedVideoModel ? videoRoute.modelId || undefined : undefined,
        voiceBaseUrl: voiceRoute.baseUrl || undefined,
        voiceApiKey: voiceRoute.apiKey || undefined,
        driverBaseUrl: videoRoute.baseUrl || undefined,
        driverApiKey: videoRoute.apiKey || undefined,
        driveMode: s.driveMode,
      };

      const task = await renderAvatarVideo(payload);
      if (!task?.id) return null;
      set({
        activeTaskId: task.id,
        tasks: [task, ...get().tasks],
      });
      return task;
    } catch {
      return null;
    } finally {
      set({ isSubmitting: false });
    }
  },

  pollActiveTask: async (taskId: string) => {
    const token = (avatarPollTokens.get(taskId) || 0) + 1;
    avatarPollTokens.set(taskId, token);
    try {
      const task = await fetchAvatarTask(taskId);
      if (avatarPollTokens.get(taskId) !== token) return task;
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === taskId ? task : t)),
      }));
      return task;
    } catch {
      return null;
    }
  },

  removeCharacter: async (id: string) => {
    await deleteAvatarCharacter(id);
    set((state) => ({
      characters: state.characters.filter((c) => c.id !== id),
      selectedCharacterId: state.selectedCharacterId === id ? '' : state.selectedCharacterId,
    }));
  },

  removeVoice: async (id: string) => {
    await deleteAvatarVoice(id);
    set((state) => ({
      voices: state.voices.filter((v) => v.id !== id),
      selectedVoiceId: state.selectedVoiceId === id ? '' : state.selectedVoiceId,
    }));
  },

  removeTask: async (id: string) => {
    await deleteAvatarTask(id);
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
      activeTaskId: state.activeTaskId === id ? null : state.activeTaskId,
    }));
  },
}));
