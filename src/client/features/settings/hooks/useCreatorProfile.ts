import { useCallback, useEffect, useState } from 'react';

export const CREATOR_PROFILE_KEY = 'beike_creator_profile';
export const CREATOR_PROFILE_EVENT = 'beike-creator-profile';

export type CreatorProfile = {
  name: string;
  signature: string;
  avatar?: string;
};

export const DEFAULT_CREATOR_PROFILE: CreatorProfile = {
  name: '创作者',
  signature: '把灵感，变成看得见的作品。',
};

export function readCreatorProfile(): CreatorProfile {
  if (typeof window === 'undefined') return DEFAULT_CREATOR_PROFILE;
  try {
    const parsed = JSON.parse(localStorage.getItem(CREATOR_PROFILE_KEY) || '');
    if (!parsed || typeof parsed !== 'object') return DEFAULT_CREATOR_PROFILE;
    const name = typeof parsed.name === 'string' ? parsed.name.trim().slice(0, 24) : '';
    const signature = typeof parsed.signature === 'string' ? parsed.signature.trim().slice(0, 48) : '';
    return {
      name: name || DEFAULT_CREATOR_PROFILE.name,
      signature: signature || DEFAULT_CREATOR_PROFILE.signature,
      avatar: typeof parsed.avatar === 'string' ? parsed.avatar : undefined,
    };
  } catch {
    return DEFAULT_CREATOR_PROFILE;
  }
}

export function writeCreatorProfile(profile: CreatorProfile) {
  const next: CreatorProfile = {
    name: profile.name.trim().slice(0, 24) || DEFAULT_CREATOR_PROFILE.name,
    signature: profile.signature.trim().slice(0, 48) || DEFAULT_CREATOR_PROFILE.signature,
    avatar: profile.avatar,
  };
  localStorage.setItem(CREATOR_PROFILE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(CREATOR_PROFILE_EVENT));
  return next;
}

export function useCreatorProfile() {
  const [profile, setProfile] = useState<CreatorProfile>(readCreatorProfile);

  useEffect(() => {
    const sync = () => setProfile(readCreatorProfile());
    window.addEventListener(CREATOR_PROFILE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CREATOR_PROFILE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const saveProfile = useCallback((next: CreatorProfile) => {
    setProfile(writeCreatorProfile(next));
  }, []);

  return { profile, saveProfile };
}
