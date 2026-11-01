/** Minimal i18n: English + Hinglish/Hindi labels for primary UI. */
import { store } from './store.js';

const T = {
  en: {
    home: 'Home', rank: 'Rank', chat: 'Friends', profile: 'Profile', more: 'Map',
    playNow: 'Play Now', playFriends: 'Play with Friends', gotiStudio: 'Custom Goti Studio',
    memeStudio: 'Meme Studio', shop: 'Shop & Rewards', charStudio: 'Character Studio',
    daily: 'Daily Login Reward', claim: 'Claim', claimed: 'Claimed', settings: 'Settings',
    worldMap: 'World Map', leaderboard: 'Leaderboard', tagline: 'Play • Laugh • Compete • Win',
  },
  hi: {
    home: 'होम', rank: 'रैंक', chat: 'दोस्त', profile: 'प्रोफ़ाइल', more: 'नक्शा',
    playNow: 'अभी खेलो', playFriends: 'दोस्तों के साथ खेलो', gotiStudio: 'गोटी स्टूडियो',
    memeStudio: 'मीम स्टूडियो', shop: 'शॉप और इनाम', charStudio: 'कैरेक्टर स्टूडियो',
    daily: 'डेली लॉगिन इनाम', claim: 'लो', claimed: 'मिल गया', settings: 'सेटिंग्स',
    worldMap: 'वर्ल्ड मैप', leaderboard: 'लीडरबोर्ड', tagline: 'खेलो • हंसो • लड़ो • जीतो',
  },
};
export const LANGS = [{ id: 'en', name: 'English' }, { id: 'hi', name: 'हिंदी (Hindi)' }];
export const t = (k) => (T[store.get().settings.lang] || T.en)[k] || T.en[k] || k;
