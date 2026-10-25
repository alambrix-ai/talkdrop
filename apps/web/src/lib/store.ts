import { create } from 'zustand';
import type { MatchFound, Me } from '@talkdrop/shared';

interface AppState {
  me: Me | null;
  setMe: (me: Me | null) => void;
  match: MatchFound | null;
  setMatch: (match: MatchFound | null) => void;
  toast: string | null;
  setToast: (msg: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  me: null,
  setMe: (me) => set({ me }),
  match: null,
  setMatch: (match) => set({ match }),
  toast: null,
  setToast: (toast) => set({ toast }),
}));
