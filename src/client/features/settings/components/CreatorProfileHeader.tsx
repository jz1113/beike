import { useRef, useState } from 'react';
import { Camera, Download, Lock, Pencil, RefreshCw, Sparkles, Wallet } from 'lucide-react';
import { DEFAULT_CREATOR_PROFILE, useCreatorProfile } from '../hooks/useCreatorProfile';

async function readAvatar(file: File) {
  const bitmap = await createImageBitmap(file);
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('avatar');
  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.82);
}

export function CreatorProfileHeader({
  imageCount,
  videoCount,
  canExport,
  canClear,
  onExport,
  onRefresh,
  onClear,
  gatewayLabel,
  gatewayHasWarning,
  gatewayOpen,
  onToggleGateway,
}: {
  imageCount: number;
  videoCount: number;
  canExport: boolean;
  canClear: boolean;
  onExport: () => void;
  onRefresh: () => void;
  onClear: () => void;
  gatewayLabel?: string;
  gatewayHasWarning?: boolean;
  gatewayOpen?: boolean;
  onToggleGateway?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { profile, saveProfile } = useCreatorProfile();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(profile.name);
  const [draftSignature, setDraftSignature] = useState(profile.signature);
  const badge = imageCount + videoCount > 0
    ? `已留下 ${imageCount.toLocaleString()} 张图片、${videoCount.toLocaleString()} 支视频`
    : '灵感，从第一件作品开始';

  return (
    <section className="settings-creator-hero">
      <div className="settings-creator-top">
        <span className="settings-creator-local"><Lock className="h-3.5 w-3.5" />仅本地</span>
        <div className="settings-creator-actions">
          {onToggleGateway && (
            <button type="button" aria-expanded={gatewayOpen} onClick={onToggleGateway}>
              <Wallet className="h-3.5 w-3.5 text-emerald-600" />
              <span>{gatewayLabel || '算力账户'}</span>
              {gatewayHasWarning && <i className="settings-creator-dot" aria-hidden="true" />}
            </button>
          )}
          <button type="button" aria-expanded={editing} onClick={() => { setDraftName(profile.name); setDraftSignature(profile.signature); setEditing(value => !value); }}>
            <Pencil className="h-3.5 w-3.5" />编辑资料
          </button>
          {canExport && <button type="button" onClick={onExport}><Download className="h-3.5 w-3.5" />导出记录</button>}
          <button type="button" onClick={onRefresh} aria-label="刷新统计数据"><RefreshCw className="h-3.5 w-3.5" /></button>
          {canClear && <button type="button" onClick={onClear}>清空数据</button>}
        </div>
      </div>
      <div className="settings-creator-card">
        <button type="button" className="settings-creator-avatar" aria-label="更换头像" onClick={() => fileRef.current?.click()}>
          {profile.avatar ? <img src={profile.avatar} alt="" /> : <span>{profile.name.slice(0, 1)}</span>}
          <span className="settings-creator-camera"><Camera className="h-3 w-3" /></span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="上传头像"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            void readAvatar(file).then(avatar => saveProfile({ ...profile, avatar })).catch(() => undefined);
          }}
        />
        <h2>{profile.name}</h2>
        <p>{profile.signature}</p>
        <span className="settings-creator-pill"><Sparkles className="h-3.5 w-3.5" />{badge}</span>
      </div>
      {editing && (
        <form
          className="settings-creator-edit"
          onSubmit={(event) => {
            event.preventDefault();
            saveProfile({ ...profile, name: draftName.trim() || DEFAULT_CREATOR_PROFILE.name, signature: draftSignature.trim() || DEFAULT_CREATOR_PROFILE.signature });
            setEditing(false);
          }}
        >
          <label>昵称<input value={draftName} maxLength={24} onChange={event => setDraftName(event.target.value)} /></label>
          <label>签名<input value={draftSignature} maxLength={48} onChange={event => setDraftSignature(event.target.value)} /></label>
          <div>
            <button type="button" onClick={() => setEditing(false)}>取消</button>
            <button type="submit">保存</button>
          </div>
        </form>
      )}
    </section>
  );
}
