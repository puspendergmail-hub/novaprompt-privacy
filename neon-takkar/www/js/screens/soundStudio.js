/** Meme Sound Studio — preview sounds, assign them to game events, upload your own. */
import { store } from '../core/store.js';
import { commonActions } from '../core/router.js';
import { bindActions, toast, confirmBox, modal, esc, $ } from '../core/dom.js';
import { topbar } from '../core/ui.js';
import { SOUNDS, SOUND_CATEGORIES, EVENTS, playSound, soundFor, applyVolumes, forgetDecoded } from '../core/audio.js';
import { idbSet, idbDel } from '../core/idb.js';
import { cleanName } from '../engine/moderation.js';
import { DIALOGUES, DIALOGUE_CATEGORIES, previewLine } from '../core/dialogues.js';

const MAX_BYTES = 1.5 * 1024 * 1024;
const MAX_SECONDS = 8;
const MAX_CUSTOM = 10;

function soundLabel(id) {
  if (!id) return '—';
  if (id.startsWith('custom:')) return '🎙️ ' + (store.get().sounds.custom.find((c) => 'custom:' + c.id === id)?.name || 'Custom');
  return `${SOUNDS[id]?.emoji || ''} ${SOUNDS[id]?.name || id}`;
}

export default {
  nav: null,
  render(root, params) {
    let cat = params.cat || 'funny';
    let tab = 'sounds';
    let pickingFor = null;

    const draw = () => {
      const s = store.get();
      const list = cat === 'custom'
        ? s.sounds.custom.map((c) => ({ id: 'custom:' + c.id, name: c.name, emoji: '🎙️', custom: c }))
        : Object.entries(SOUNDS).filter(([, v]) => v.cat === cat).map(([id, v]) => ({ id, ...v }));
      root.innerHTML = `${topbar('😆 MEME STUDIO')}
        <div class="tabs">
          <button class="tab ${tab === 'sounds' ? 'active' : ''}" data-action="tab" data-v="sounds">Sounds</button>
          <button class="tab ${tab === 'dialogues' ? 'active' : ''}" data-action="tab" data-v="dialogues">🎬 Dialogues</button>
          <button class="tab ${tab === 'events' ? 'active' : ''}" data-action="tab" data-v="events">Assign to Events</button>
          <button class="tab ${tab === 'volume' ? 'active' : ''}" data-action="tab" data-v="volume">Volume</button>
        </div>
        ${pickingFor ? `<div class="glass card row between" style="border-color:var(--gold)"><div>Choose a sound for <b>${esc(EVENTS.find((e) => e.id === pickingFor).name)}</b></div><button class="btn sm ghost" data-action="cancelPick">Cancel</button></div>` : ''}
        ${tab === 'sounds' ? `
          <div class="tabs">${SOUND_CATEGORIES.map((c) => `<button class="tab ${cat === c.id ? 'active' : ''}" data-action="cat" data-v="${c.id}">${c.name}</button>`).join('')}</div>
          <div class="wave">${Array.from({ length: 36 }, (_, i) => `<i style="height:${8 + Math.abs(Math.sin(i * 0.7)) * 22}px;animation-delay:${i * 0.04}s"></i>`).join('')}</div>
          ${list.length ? list.map((x) => `<div class="sound-row">
            <button class="play-btn" data-action="play" data-id="${esc(x.id)}" aria-label="Play">▶</button>
            <div class="grow"><b>${esc(x.name)}</b> ${x.emoji || ''}</div>
            ${pickingFor ? `<button class="btn sm green" data-action="assign" data-id="${esc(x.id)}">Use</button>` : `<button class="btn sm ghost" data-action="useIn" data-id="${esc(x.id)}">Use in Game</button>`}
            ${x.custom ? `<button class="btn sm danger" data-action="delCustom" data-id="${esc(x.custom.id)}">🗑</button>` : ''}
          </div>`).join('') : '<div class="empty glass">No custom sounds yet.</div>'}
          ${cat === 'custom' ? `<div class="glass card" style="margin-top:10px">
            <p class="small">Upload your own short sound (max ${MAX_SECONDS}s, 1.5 MB). Only upload audio you recorded yourself or have the rights to use.</p>
            <label class="row small"><input type="checkbox" id="own"> I own this audio or have permission to use it.</label>
            <label class="btn primary block" style="margin-top:8px">⬆ Upload Sound<input type="file" accept="audio/*" id="upload" hidden></label>
          </div>` : ''}
          <p class="small muted center">All built-in sounds are synthesised on your device (original, royalty-free).</p>
        ` : ''}
        ${tab === 'events' ? `
          ${EVENTS.map((e) => `<div class="sound-row">
            <button class="play-btn" data-action="play" data-id="${esc(soundFor(e.id))}">▶</button>
            <div class="grow"><b>${esc(e.name)}</b><div class="small muted">${esc(soundLabel(soundFor(e.id)))}</div></div>
            <button class="btn sm primary" data-action="pickFor" data-ev="${e.id}">Change</button>
          </div>`).join('')}
          <button class="btn ghost block" data-action="restore" style="margin-top:8px">↺ Restore Default Sounds</button>
        ` : ''}
        ${tab === 'dialogues' ? `
          <div class="glass card row between"><div><b>🎬 Filmy dialogues</b><div class="small muted">Funny lines on game start, wins, losses, shop & map — with voice</div></div>
            <label class="switch"><input type="checkbox" data-set="dialogues" ${s.settings.dialogues !== false ? 'checked' : ''}><i></i></label></div>
          ${DIALOGUE_CATEGORIES.map((c) => `<div class="section-title">${c.icon} ${esc(c.name)}</div>
            ${DIALOGUES[c.id].map((d, i) => `<div class="sound-row"><button class="play-btn" data-action="line" data-cat="${c.id}" data-i="${i}" aria-label="Play">▶</button><div class="grow small" style="font-style:italic">"${esc(d.text)}"</div></div>`).join('')}`).join('')}
          <p class="small muted center">Original lines written for NEON TAKKAR. Voice uses your phone's Hindi text-to-speech (install "Google Text-to-Speech" Hindi voice for best results).</p>
        ` : ''}
        ${tab === 'volume' ? `<div class="glass card">
          <div class="row between"><b>🔊 Sound effects</b><label class="switch"><input type="checkbox" data-set="sfx" ${s.settings.sfx ? 'checked' : ''}><i></i></label></div>
          <label class="field"><span>Effects volume</span><input type="range" min="0" max="1" step="0.05" data-vol="sfxVol" value="${s.settings.sfxVol}"></label>
          <div class="row between"><b>🎵 Music</b><label class="switch"><input type="checkbox" data-set="music" ${s.settings.music ? 'checked' : ''}><i></i></label></div>
          <label class="field"><span>Music volume</span><input type="range" min="0" max="1" step="0.05" data-vol="musicVol" value="${s.settings.musicVol}"></label>
          <div class="row between"><b>🗣️ Voice catch-phrases</b><label class="switch"><input type="checkbox" data-set="speech" ${s.settings.speech ? 'checked' : ''}><i></i></label></div>
          <p class="small muted">Voice lines use your phone's text-to-speech (Hindi voice when installed).</p>
          <button class="btn danger block" data-action="muteAll">🔇 Mute everything</button>
        </div>` : ''}`;
      root.querySelectorAll('[data-set]').forEach((i) => i.addEventListener('change', () => { store.update((st) => { st.settings[i.dataset.set] = i.checked; }); applyVolumes(); }));
      root.querySelectorAll('[data-vol]').forEach((i) => i.addEventListener('input', () => { store.update((st) => { st.settings[i.dataset.vol] = Number(i.value); }); applyVolumes(); }));
      root.querySelectorAll('[data-vol="sfxVol"]').forEach((i) => i.addEventListener('change', () => playSound('pop')));
      const up = $('#upload', root);
      if (up) {
        up.addEventListener('click', (e) => { if (!$('#own', root).checked) { e.preventDefault(); toast('Please confirm you own this audio', 'error'); } });
        up.addEventListener('change', () => up.files[0] && upload(up.files[0]));
      }
    };

    async function upload(file) {
      if (!file.type.startsWith('audio/')) return toast('Please choose an audio file', 'error');
      if (file.size > MAX_BYTES) return toast('File too large (max 1.5 MB)', 'error');
      if (store.get().sounds.custom.length >= MAX_CUSTOM) return toast(`Max ${MAX_CUSTOM} custom sounds`, 'error');
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        const ctx = new AC();
        const buf = await ctx.decodeAudioData(await file.arrayBuffer());
        ctx.close();
        if (buf.duration > MAX_SECONDS + 0.5) return toast(`Too long — keep it under ${MAX_SECONDS} seconds`, 'error');
      } catch { return toast('Could not read that audio file', 'error'); }
      const id = 'a' + Date.now().toString(36);
      await idbSet('audio:' + id, file);
      const name = cleanName(file.name.replace(/\.[^.]+$/, '').slice(0, 20)) || 'My Sound';
      store.update((s) => { s.sounds.custom.push({ id, name }); });
      toast('Sound added! Assign it to an event.', 'success');
      draw();
    }

    draw();
    return bindActions(root, {
      ...commonActions,
      tab: (b) => { tab = b.dataset.v; draw(); },
      cat: (b) => { cat = b.dataset.v; draw(); },
      play: (b) => playSound(b.dataset.id),
      line: (b) => previewLine(b.dataset.cat, Number(b.dataset.i)),
      pickFor: (b) => { pickingFor = b.dataset.ev; tab = 'sounds'; draw(); },
      cancelPick: () => { pickingFor = null; draw(); },
      useIn: async (b) => {
        const ev = await modal({ title: 'Use in game for…', body: `<p class="center">${esc(soundLabel(b.dataset.id))}</p>`, buttons: EVENTS.slice(0, 8).map((e) => ({ label: e.name, value: e.id })).concat([{ label: 'Cancel', value: null }]) });
        if (!ev) return;
        store.update((s) => { s.sounds.assign[ev] = b.dataset.id; });
        toast(`✔ Assigned to "${EVENTS.find((e) => e.id === ev).name}"`, 'success');
        draw();
      },
      assign: (b) => {
        const ev = pickingFor;
        store.update((s) => { s.sounds.assign[ev] = b.dataset.id; });
        pickingFor = null; tab = 'events';
        toast('✔ Sound assigned', 'success');
        playSound(b.dataset.id);
        draw();
      },
      restore: async () => {
        if (!(await confirmBox('Restore defaults?', 'All event sounds will go back to the default meme pack.'))) return;
        store.update((s) => { s.sounds.assign = {}; });
        draw();
      },
      delCustom: async (b) => {
        if (!(await confirmBox('Delete sound?', 'This custom sound will be removed.', 'Delete'))) return;
        const id = b.dataset.id;
        await idbDel('audio:' + id).catch(() => {});
        forgetDecoded('custom:' + id);
        store.update((s) => {
          s.sounds.custom = s.sounds.custom.filter((c) => c.id !== id);
          for (const [k, v] of Object.entries(s.sounds.assign)) if (v === 'custom:' + id) delete s.sounds.assign[k];
        });
        draw();
      },
      muteAll: () => { store.update((s) => { s.settings.sfx = false; s.settings.music = false; }); applyVolumes(); draw(); },
    });
  },
};
