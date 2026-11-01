/**
 * Unlockable cosmetics. Everything is cosmetic only — nothing affects dice,
 * AI strength or match outcomes (not pay-to-win). Prices are in-game currency
 * earned by playing; `level` gates use XP level.
 */
const C = (coins) => ({ coins });
const D = (diamonds) => ({ diamonds });

export const CATEGORIES = [
  { id: 'skin', name: 'Goti Skins', tab: 'Skins' },
  { id: 'goti_hat', name: 'Hats & Crowns', tab: 'Skins' },
  { id: 'goti_frame', name: 'Goti Frames', tab: 'Skins' },
  { id: 'goti_trail', name: 'Trails', tab: 'Effects' },
  { id: 'victory', name: 'Victory Effects', tab: 'Effects' },
  { id: 'dice', name: 'Dice Designs', tab: 'Effects' },
  { id: 'board_ludo', name: 'Ludo Boards', tab: 'Themes' },
  { id: 'board_chess', name: 'Chess Boards', tab: 'Themes' },
  { id: 'chess_pieces', name: 'Chess Piece Sets', tab: 'Themes' },
  { id: 'sound_pack', name: 'Meme Sound Packs', tab: 'Sounds' },
  { id: 'profile_frame', name: 'Profile Frames', tab: 'Frames' },
  { id: 'avatar', name: 'Characters', tab: 'Characters' },
];

export const ITEMS = [
  // Goti skins (face + base style)
  { id: 'skin_classic', cat: 'skin', name: 'Classic Goti', icon: '●', face: '', cost: null },
  { id: 'skin_smile', cat: 'skin', name: 'Smiley', icon: '😄', face: '😄', cost: null },
  { id: 'skin_thug', cat: 'skin', name: 'Thug Life', icon: '😎', face: '😎', cost: C(300) },
  { id: 'skin_doge', cat: 'skin', name: 'Doge', icon: '🐶', face: '🐶', cost: C(300) },
  { id: 'skin_cat', cat: 'skin', name: 'Billi Boss', icon: '😼', face: '😼', cost: C(300) },
  { id: 'skin_panda', cat: 'skin', name: 'Panda', icon: '🐼', face: '🐼', cost: C(400) },
  { id: 'skin_tiger', cat: 'skin', name: 'Sher Khan', icon: '🐯', face: '🐯', cost: C(500) },
  { id: 'skin_skull', cat: 'skin', name: 'Danger Skull', icon: '💀', face: '💀', cost: C(500) },
  { id: 'skin_alien', cat: 'skin', name: 'Neon Alien', icon: '👽', face: '👽', cost: C(600) },
  { id: 'skin_ninja', cat: 'skin', name: 'Neon Ninja', icon: '🥷', face: '🥷', cost: D(15) },
  { id: 'skin_robot', cat: 'skin', name: 'Robo Bhai', icon: '🤖', face: '🤖', cost: D(15) },
  { id: 'skin_lol', cat: 'skin', name: 'Hasna Mana Hai', icon: '😂', face: '😂', cost: C(250) },
  { id: 'skin_cry', cat: 'skin', name: 'Rona Mat', icon: '😭', face: '😭', cost: C(250) },
  { id: 'skin_flag', cat: 'skin', name: 'Tiranga', icon: '🇮🇳', face: '🇮🇳', cost: C(200), tricolor: true },
  { id: 'skin_character', cat: 'skin', name: 'My Character', icon: '🧑‍🎨', face: '', cost: null, character: true },

  { id: 'hat_none', cat: 'goti_hat', name: 'No Hat', icon: '∅', cost: null },
  { id: 'hat_crown', cat: 'goti_hat', name: 'King Crown', icon: '👑', cost: C(800) },
  { id: 'hat_cap', cat: 'goti_hat', name: 'Cool Cap', icon: '🧢', cost: C(250) },
  { id: 'hat_party', cat: 'goti_hat', name: 'Party Hat', icon: '🥳', cost: C(200) },
  { id: 'hat_tophat', cat: 'goti_hat', name: 'Top Hat', icon: '🎩', cost: C(400) },
  { id: 'hat_halo', cat: 'goti_hat', name: 'Sanskari Halo', icon: '😇', cost: D(10) },

  { id: 'frame_none', cat: 'goti_frame', name: 'Plain', icon: '○', cost: null },
  { id: 'frame_neon', cat: 'goti_frame', name: 'Neon Ring', icon: '◎', cost: null },
  { id: 'frame_gold', cat: 'goti_frame', name: 'Gold Ring', icon: '🟡', cost: C(500) },
  { id: 'frame_double', cat: 'goti_frame', name: 'Double Ring', icon: '⦿', cost: C(350) },
  { id: 'frame_fire', cat: 'goti_frame', name: 'Fire Ring', icon: '🔥', cost: D(12) },

  { id: 'trail_none', cat: 'goti_trail', name: 'No Trail', icon: '∅', cost: null },
  { id: 'trail_sparkle', cat: 'goti_trail', name: 'Sparkles', icon: '✨', cost: C(300) },
  { id: 'trail_fire', cat: 'goti_trail', name: 'Aag', icon: '🔥', cost: C(500) },
  { id: 'trail_hearts', cat: 'goti_trail', name: 'Pyaar', icon: '💖', cost: C(400) },
  { id: 'trail_stars', cat: 'goti_trail', name: 'Stars', icon: '⭐', cost: D(8) },

  { id: 'victory_confetti', cat: 'victory', name: 'Confetti', icon: '🎉', cost: null },
  { id: 'victory_fireworks', cat: 'victory', name: 'Diwali Fireworks', icon: '🎆', cost: C(700) },
  { id: 'victory_gold', cat: 'victory', name: 'Gold Rain', icon: '💰', cost: D(20) },
  { id: 'victory_emoji', cat: 'victory', name: 'Emoji Storm', icon: '🤣', cost: C(500) },

  { id: 'dice_classic', cat: 'dice', name: 'Classic Dice', icon: '🎲', cost: null },
  { id: 'dice_neon', cat: 'dice', name: 'Neon Cube', icon: '💠', cost: C(400) },
  { id: 'dice_gold', cat: 'dice', name: 'Gold Dice', icon: '🟨', cost: C(900) },
  { id: 'dice_fire', cat: 'dice', name: 'Fire Dice', icon: '🟥', cost: D(10) },

  { id: 'ludo_neon', cat: 'board_ludo', name: 'Neon Night', icon: '🌃', cost: null },
  { id: 'ludo_royal', cat: 'board_ludo', name: 'Royal Gold', icon: '🏰', cost: C(800) },
  { id: 'ludo_cyber', cat: 'board_ludo', name: 'Cyber Pink', icon: '🌸', cost: C(800) },
  { id: 'ludo_classic', cat: 'board_ludo', name: 'Desi Classic', icon: '🎯', cost: C(300) },

  { id: 'chess_neon', cat: 'board_chess', name: 'Neon Purple', icon: '🟪', cost: null },
  { id: 'chess_ice', cat: 'board_chess', name: 'Ice Blue', icon: '🧊', cost: C(600) },
  { id: 'chess_royal', cat: 'board_chess', name: 'Royal Gold', icon: '🏆', cost: C(900) },
  { id: 'chess_wood', cat: 'board_chess', name: 'Neon Wood', icon: '🪵', cost: C(500) },

  { id: 'pieces_neon', cat: 'chess_pieces', name: 'Neon Set', icon: '♛', cost: null },
  { id: 'pieces_warrior', cat: 'chess_pieces', name: 'Warrior Set', icon: '⚔️', cost: C(1000) },
  { id: 'pieces_gold', cat: 'chess_pieces', name: 'Golden Set', icon: '👑', cost: D(25) },

  { id: 'pack_desi', cat: 'sound_pack', name: 'Desi Meme Pack', icon: '🔊', cost: null },
  { id: 'pack_arcade', cat: 'sound_pack', name: 'Retro Arcade', icon: '👾', cost: C(400) },
  { id: 'pack_filmy', cat: 'sound_pack', name: 'Filmy Drama', icon: '🎬', cost: C(600) },

  { id: 'pframe_basic', cat: 'profile_frame', name: 'Basic', icon: '⭕', cost: null },
  { id: 'pframe_neon', cat: 'profile_frame', name: 'Neon Glow', icon: '💜', cost: C(300) },
  { id: 'pframe_crown', cat: 'profile_frame', name: 'Crown Frame', icon: '👑', cost: C(900), level: 3 },
  { id: 'pframe_fire', cat: 'profile_frame', name: 'Fire Frame', icon: '🔥', cost: D(15), level: 5 },

  { id: 'av_cool', cat: 'avatar', name: 'Cool Dude', icon: '😎', cost: null },
  { id: 'av_panda', cat: 'avatar', name: 'Panda', icon: '🐼', cost: null },
  { id: 'av_cat', cat: 'avatar', name: 'Billi', icon: '🐱', cost: null },
  { id: 'av_doge', cat: 'avatar', name: 'Doge', icon: '🐕', cost: C(200) },
  { id: 'av_skull', cat: 'avatar', name: 'Skull', icon: '💀', cost: C(200) },
  { id: 'av_alien', cat: 'avatar', name: 'Alien', icon: '👾', cost: C(300) },
  { id: 'av_king', cat: 'avatar', name: 'Raja', icon: '🤴', cost: C(500) },
  { id: 'av_queen', cat: 'avatar', name: 'Rani', icon: '👸', cost: C(500) },
  { id: 'av_monkey', cat: 'avatar', name: 'Bandar', icon: '🙈', cost: C(250) },
  { id: 'av_lion', cat: 'avatar', name: 'Sher', icon: '🦁', cost: D(10) },
  { id: 'av_unicorn', cat: 'avatar', name: 'Unicorn', icon: '🦄', cost: D(10) },
  { id: 'av_ghost', cat: 'avatar', name: 'Bhoot', icon: '👻', cost: C(300) },
];

export const ITEM = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
export const byCat = (cat) => ITEMS.filter((i) => i.cat === cat);

export const DEFAULT_EQUIPPED = {
  skin: 'skin_classic', goti_hat: 'hat_none', goti_frame: 'frame_neon', goti_trail: 'trail_none',
  victory: 'victory_confetti', dice: 'dice_classic', board_ludo: 'ludo_neon', board_chess: 'chess_neon',
  chess_pieces: 'pieces_neon', sound_pack: 'pack_desi', profile_frame: 'pframe_basic', avatar: 'av_cool',
};

export const GOTI_COLORS = {
  red: '#FF3B5C', green: '#2EF2A0', yellow: '#FFC94A', blue: '#00D9FF',
};
export const CUSTOM_COLORS = ['#9B4DFF', '#FF38B8', '#00D9FF', '#FFC94A', '#2EF2A0', '#FF3B5C', '#FF8A00', '#FFFFFF', '#7CFF3B', '#3B6BFF'];

export const DAILY_REWARDS = [
  { coins: 100 }, { coins: 150 }, { coins: 200 }, { coins: 250, diamonds: 2 },
  { coins: 300 }, { coins: 400 }, { coins: 500, diamonds: 10 },
];

export const ACHIEVEMENTS = [
  { id: 'first_win', name: 'Pehli Jeet', desc: 'Win your first match', icon: '🏆', reward: { coins: 200 } },
  { id: 'ludo_wins_10', name: 'Ludo Ustaad', desc: 'Win 10 Ludo matches', icon: '🎲', reward: { coins: 500, diamonds: 5 } },
  { id: 'captures_25', name: 'Katega Sabka', desc: 'Capture 25 tokens', icon: '⚔️', reward: { coins: 400 } },
  { id: 'chess_win', name: 'Shatranj Ke Khiladi', desc: 'Win a chess match', icon: '♛', reward: { coins: 250 } },
  { id: 'beat_hard', name: 'Computer Ko Haraya', desc: 'Beat Hard AI in any game', icon: '🤖', reward: { diamonds: 10 } },
  { id: 'collector_5', name: 'Shauqeen', desc: 'Own 5 shop items', icon: '🛍️', reward: { coins: 300 } },
  { id: 'creator', name: 'Creator Bhai', desc: 'Create a custom character', icon: '🎨', reward: { coins: 300 } },
  { id: 'streak_7', name: 'Roz Ka Player', desc: '7-day login streak', icon: '📅', reward: { diamonds: 15 } },
  { id: 'level_5', name: 'Rising Star', desc: 'Reach level 5', icon: '⭐', reward: { diamonds: 10 } },
  { id: 'champion', name: 'Tournament Champion', desc: 'Win a Tournament Stadium cup', icon: '🥇', reward: { coins: 1000, diamonds: 20 } },
  { id: 'snake_master', name: 'Naagin Master', desc: 'Score 30 in one Snake run', icon: '🐍', reward: { coins: 400, diamonds: 5 } },
  { id: 'social', name: 'Yaaron Ka Yaar', desc: 'Play an online match with a friend', icon: '🤝', reward: { coins: 300 } },
];

export const MISSION_POOL = [
  { id: 'play_ludo', name: 'Play 2 Ludo matches', target: 2, reward: { coins: 150 } },
  { id: 'play_chess', name: 'Play a Chess match', target: 1, reward: { coins: 150 } },
  { id: 'win_any', name: 'Win any match', target: 1, reward: { coins: 200 } },
  { id: 'captures', name: 'Capture 3 tokens', target: 3, reward: { coins: 150 } },
  { id: 'sixes', name: 'Roll 5 sixes', target: 5, reward: { coins: 100 } },
  { id: 'reactions', name: 'Send 3 meme reactions', target: 3, reward: { coins: 100 } },
  { id: 'chess_captures', name: 'Capture 5 chess pieces', target: 5, reward: { coins: 150 } },
  { id: 'snake_play', name: 'Play 2 Snake games', target: 2, reward: { coins: 120 } },
  { id: 'snake_food', name: 'Eat 25 snacks in Snake', target: 25, reward: { coins: 150 } },
];

/** Map locations; `level` = player level required to unlock. */
export const MAP_LOCATIONS = [
  { id: 'plaza', name: 'City Plaza', sub: 'Ludo Arena', icon: '🎲', route: 'ludo-setup', level: 1, x: 30, y: 58 },
  { id: 'kingdom', name: 'Chess Kingdom', sub: 'Chess Arena', icon: '♚', route: 'chess-setup', level: 1, x: 72, y: 30 },
  { id: 'meme', name: 'Meme Park', sub: 'Meme Events', icon: '😂', route: 'sound-studio', level: 1, x: 22, y: 26 },
  { id: 'studio', name: 'Character Studio', sub: 'Customise', icon: '🎨', route: 'character-studio', level: 1, x: 52, y: 44 },
  { id: 'island', name: 'Reward Island', sub: 'Daily Rewards', icon: '🎁', route: 'rewards', level: 1, x: 78, y: 78 },
  { id: 'snake', name: 'Snake Gali', sub: 'Neon Snake', icon: '🐍', route: 'snake', level: 1, x: 84, y: 54 },
  { id: 'stadium', name: 'Tournament Stadium', sub: 'Competitive Cups', icon: '🏟️', route: 'tournament', level: 3, x: 56, y: 82 },
];
