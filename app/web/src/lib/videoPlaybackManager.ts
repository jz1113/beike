/**
 * 🌟 全局视频硬件解码调度管理器 (Living Video Playback Manager)
 * 解决用户痛点：展示真实动态循环播放的视频，同时限制全站并发硬解通道（Max 3~4），
 * 彻底防止多视频同时解码造成的 GPU 负载过高、掉帧与卡顿。
 */

type PlaybackCallback = (shouldPlay: boolean) => void;

interface VideoPlayerRegistration {
  id: string;
  element: HTMLElement;
  callback: PlaybackCallback;
  visibleRatio: number;
  lastVisibleAt: number;
  isPlaying: boolean;
}

class VideoPlaybackManager {
  private players = new Map<string, VideoPlayerRegistration>();
  private maxConcurrent = 3; // 最多同时硬解播放 3 个视频，保证 60fps 丝滑与硬解通道安全
  private observer: IntersectionObserver | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'IntersectionObserver' in window) {
      this.observer = new IntersectionObserver(this.handleIntersection, {
        threshold: [0, 0.25, 0.5, 0.75, 1.0],
        rootMargin: '100px 0px 100px 0px',
      });
    }
  }

  private handleIntersection = (entries: IntersectionObserverEntry[]) => {
    let changed = false;
    for (const entry of entries) {
      const id = (entry.target as HTMLElement).dataset.vpmId;
      if (!id) continue;
      const player = this.players.get(id);
      if (!player) continue;

      const prevRatio = player.visibleRatio;
      player.visibleRatio = entry.isIntersecting ? entry.intersectionRatio : 0;
      if (entry.isIntersecting) {
        player.lastVisibleAt = Date.now();
      }
      if (Math.abs(player.visibleRatio - prevRatio) > 0.05 || (player.visibleRatio > 0) !== (prevRatio > 0)) {
        changed = true;
      }
    }

    if (changed) {
      this.rebalance();
    }
  };

  /** 注册视频播放器 */
  public register(
    id: string,
    element: HTMLElement,
    callback: PlaybackCallback,
  ): () => void {
    element.dataset.vpmId = id;
    const player: VideoPlayerRegistration = {
      id,
      element,
      callback,
      visibleRatio: 0,
      lastVisibleAt: 0,
      isPlaying: false,
    };
    this.players.set(id, player);

    if (this.observer) {
      this.observer.observe(element);
    }

    return () => {
      if (this.observer) {
        this.observer.unobserve(element);
      }
      if (player.isPlaying) {
        player.callback(false);
      }
      this.players.delete(id);
      this.rebalance();
    };
  }

  /** 动态调配播放权：给最居中/可见比例最高的 top-N 个视频发放播放权 */
  private rebalance() {
    const candidates = Array.from(this.players.values()).filter((p) => p.visibleRatio > 0.15);

    // 按可见面积排序，优先播放视口最核心的视频
    candidates.sort((a, b) => {
      if (Math.abs(b.visibleRatio - a.visibleRatio) > 0.1) {
        return b.visibleRatio - a.visibleRatio;
      }
      return b.lastVisibleAt - a.lastVisibleAt;
    });

    const activeSet = new Set(candidates.slice(0, this.maxConcurrent).map((p) => p.id));

    this.players.forEach((player) => {
      const shouldPlay = activeSet.has(player.id);
      if (player.isPlaying !== shouldPlay) {
        player.isPlaying = shouldPlay;
        try {
          player.callback(shouldPlay);
        } catch {
          /* ignore error */
        }
      }
    });
  }

  /** 安全播放辅助函数（吞并 AbortError） */
  public static async safePlay(video: HTMLVideoElement): Promise<boolean> {
    try {
      video.muted = true;
      const p = video.play();
      if (p !== undefined) {
        await p;
      }
      return true;
    } catch {
      return false;
    }
  }

  /** 安全暂停辅助函数 */
  public static safePause(video: HTMLVideoElement): void {
    try {
      video.pause();
    } catch {
      /* ignore */
    }
  }

  /** 安全播放辅助函数（支持实例调用） */
  public async safePlay(video: HTMLVideoElement): Promise<boolean> {
    return VideoPlaybackManager.safePlay(video);
  }

  /** 安全暂停辅助函数（支持实例调用） */
  public safePause(video: HTMLVideoElement): void {
    VideoPlaybackManager.safePause(video);
  }
}

export const videoPlaybackManager = new VideoPlaybackManager();
