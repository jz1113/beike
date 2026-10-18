CREATE TABLE IF NOT EXISTS "AvatarCharacter" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL DEFAULT 'legacy',
  "name" TEXT NOT NULL,
  "type" INTEGER NOT NULL DEFAULT 1,
  "status" INTEGER NOT NULL DEFAULT 1,
  "statusMsg" TEXT NOT NULL DEFAULT '',
  "videoUrl" TEXT NOT NULL,
  "coverUrl" TEXT NOT NULL,
  "coverWidth" INTEGER NOT NULL DEFAULT 1080,
  "coverHeight" INTEGER NOT NULL DEFAULT 1920,
  "audioPromptUrl" TEXT NOT NULL DEFAULT '',
  "welcomeVideoUrl" TEXT NOT NULL DEFAULT '',
  "humanId" TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AvatarCharacter_workspaceId_idx" ON "AvatarCharacter"("workspaceId");
CREATE INDEX IF NOT EXISTS "AvatarCharacter_type_idx" ON "AvatarCharacter"("type");

CREATE TABLE IF NOT EXISTS "AvatarVoice" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL DEFAULT 'legacy',
  "name" TEXT NOT NULL,
  "type" INTEGER NOT NULL DEFAULT 1,
  "status" INTEGER NOT NULL DEFAULT 1,
  "statusMsg" TEXT NOT NULL DEFAULT '',
  "audioUrl" TEXT NOT NULL,
  "promptNpyUrl" TEXT NOT NULL DEFAULT '',
  "promptText" TEXT NOT NULL DEFAULT '',
  "sampleAudioUrl" TEXT NOT NULL DEFAULT '',
  "voiceId" TEXT NOT NULL DEFAULT '',
  "gender" TEXT NOT NULL DEFAULT 'female',
  "tags" TEXT NOT NULL DEFAULT '[]',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AvatarVoice_workspaceId_idx" ON "AvatarVoice"("workspaceId");

CREATE TABLE IF NOT EXISTS "AvatarVideoTask" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL DEFAULT 'legacy',
  "title" TEXT NOT NULL,
  "scriptContent" TEXT NOT NULL,
  "layout" INTEGER NOT NULL DEFAULT 2,
  "resolution" INTEGER NOT NULL DEFAULT 3,
  "frameRate" INTEGER NOT NULL DEFAULT 2,
  "exportFormat" TEXT NOT NULL DEFAULT 'mp4',
  "avatarId" TEXT NOT NULL,
  "avatarPosition" TEXT NOT NULL DEFAULT '0,0',
  "avatarScale" REAL NOT NULL DEFAULT 1.0,
  "voiceId" TEXT NOT NULL,
  "voiceSpeed" REAL NOT NULL DEFAULT 1.0,
  "voiceVolume" REAL NOT NULL DEFAULT 1.0,
  "bgType" TEXT NOT NULL DEFAULT 'color',
  "bgColor" TEXT NOT NULL DEFAULT '#000000',
  "bgMediaUrl" TEXT NOT NULL DEFAULT '',
  "subtitleEnabled" BOOLEAN NOT NULL DEFAULT 1,
  "fontId" TEXT NOT NULL DEFAULT 'font_ali_yuanti',
  "fontSize" INTEGER NOT NULL DEFAULT 24,
  "fontColor" TEXT NOT NULL DEFAULT '#FFFFFF',
  "fontPosition" TEXT NOT NULL DEFAULT 'bottom',
  "status" INTEGER NOT NULL DEFAULT 0,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "currentStage" TEXT NOT NULL DEFAULT '排队中',
  "statusMsg" TEXT NOT NULL DEFAULT '',
  "videoUrl" TEXT NOT NULL DEFAULT '',
  "coverUrl" TEXT NOT NULL DEFAULT '',
  "duration" REAL NOT NULL DEFAULT 0,
  "error" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" DATETIME
);
CREATE INDEX IF NOT EXISTS "AvatarVideoTask_workspaceId_idx" ON "AvatarVideoTask"("workspaceId");
CREATE INDEX IF NOT EXISTS "AvatarVideoTask_status_idx" ON "AvatarVideoTask"("status");
CREATE INDEX IF NOT EXISTS "AvatarVideoTask_createdAt_idx" ON "AvatarVideoTask"("createdAt");

CREATE TABLE IF NOT EXISTS "AvatarFont" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "nickname" TEXT NOT NULL,
  "fontUrl" TEXT NOT NULL,
  "previewUrl" TEXT NOT NULL DEFAULT ''
);

-- 官方免版税字体
INSERT OR IGNORE INTO "AvatarFont" ("id", "name", "nickname", "fontUrl", "previewUrl") VALUES
  ('font_ali_yuanti', 'Alimama FangYuanTi VF', '方圆体', '/storage/fonts/aliyuanti.ttf', ''),
  ('font_ali_daoliti', 'Alimama DaoLiTi', '刀隶体', '/storage/fonts/aliliti.ttf', ''),
  ('font_feibo', 'Feibo Zhengdian', '正点体', '/storage/fonts/feibozhengdian.otf', ''),
  ('font_guangliang', 'Guangliang Ganbei', '干杯体', '/storage/fonts/guangliang.ttf', ''),
  ('font_lixiangti', 'Lixiangti', '自由理想体', '/storage/fonts/lixiangti.ttf', '');

-- 官方预置高保真形象 (来自原版开源项目精选及高质量主播模板)
INSERT OR IGNORE INTO "AvatarCharacter" ("id", "workspaceId", "name", "type", "status", "statusMsg", "videoUrl", "coverUrl", "coverWidth", "coverHeight", "audioPromptUrl", "welcomeVideoUrl", "humanId", "description") VALUES
  ('avatar_preset_01', 'legacy', '车模·若曦', 0, 1, '就绪', '/storage/avatars/preset_01.mp4', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80', 1080, 1920, '', '/storage/avatars/welcome_01.mp4', 'preset_human_01', '高颜值时尚车模与带货口播数字人，发音自然生动'),
  ('avatar_preset_02', 'legacy', '气质·子轩', 0, 1, '就绪', '/storage/avatars/preset_02.mp4', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80', 1080, 1920, '', '/storage/avatars/welcome_02.mp4', 'preset_human_02', '沉稳专业商务主播，适合高端数码、地产与科技宣讲'),
  ('avatar_preset_03', 'legacy', '温婉·知夏', 0, 1, '就绪', '/storage/avatars/preset_03.mp4', 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80', 1080, 1920, '', '/storage/avatars/welcome_03.mp4', 'preset_human_03', '亲切可信生活家居与美妆达人，表情细腻微动态丰富'),
  ('avatar_preset_04', 'legacy', '知性·静怡', 0, 1, '就绪', '/storage/avatars/preset_04.mp4', 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=800&q=80', 1080, 1920, '', '/storage/avatars/welcome_04.mp4', 'preset_human_04', '知性知心知识博主，适用于课程讲解与深度测评'),
  ('avatar_preset_05', 'legacy', '阳光·博文', 0, 1, '就绪', '/storage/avatars/preset_05.mp4', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80', 1080, 1920, '', '/storage/avatars/welcome_05.mp4', 'preset_human_05', '活力潮流青年主播，带货爆发力强，节奏感极佳');

-- 官方预置精品音色 (对应 Fish-Speech 预置与常用营销风格)
INSERT OR IGNORE INTO "AvatarVoice" ("id", "workspaceId", "name", "type", "status", "statusMsg", "audioUrl", "promptNpyUrl", "promptText", "sampleAudioUrl", "voiceId", "gender", "tags") VALUES
  ('voice_preset_01', 'legacy', '稳重男声', 0, 1, '可用', '/storage/voices/voice_01.wav', '', '大家好，欢迎来到我的直播间，今天为大家带来的是全网首发超高性价比精选。', '/storage/voices/sample_01.mp3', 'preset_voice_01', 'male', '["沉稳", "专业", "科技"]'),
  ('voice_preset_02', 'legacy', '成熟男神', 0, 1, '可用', '/storage/voices/voice_02.wav', '', '真正的品质往往藏在细节之中，今天我将通过三个维度为您深度解读。', '/storage/voices/sample_02.mp3', 'preset_voice_02', 'male', '["磁性", "商务", "述评"]'),
  ('voice_preset_03', 'legacy', '知性女声', 0, 1, '可用', '/storage/voices/voice_03.wav', '', '生活中所有的美好，都值得被用心对待。接下来让我们一起看看它的表现。', '/storage/voices/sample_03.mp3', 'preset_voice_03', 'female', '["温润", "知性", "生活"]'),
  ('voice_preset_04', 'legacy', '开朗女主播', 0, 1, '可用', '/storage/voices/voice_04.wav', '', '哇塞家人们！这款产品真的绝了，限时特惠赶紧锁定关注！', '/storage/voices/sample_04.mp3', 'preset_voice_04', 'female', '["热情", "带货", "种草"]'),
  ('voice_preset_05', 'legacy', '温柔小暖', 0, 1, '可用', '/storage/voices/voice_05.wav', '', '微风拂过耳畔，让每一次相聚都充满期待与治愈。', '/storage/voices/sample_05.mp3', 'preset_voice_05', 'female', '["轻柔", "治愈", "故事"]');
