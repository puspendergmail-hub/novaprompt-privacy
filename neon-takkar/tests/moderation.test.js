import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanText, cleanName, isClean } from '../www/js/engine/moderation.js';

test('filters abuse incl. leetspeak and Hinglish', () => {
  assert.equal(cleanText('you are a b1tch'), 'you are a *****');
  assert.equal(cleanText('chutiya hai kya'), '******* hai kya');
  assert.ok(isClean('Kya baat hai bhai! GG'));
  assert.equal(cleanText('class pass'), 'class pass'); // no false positive on substrings of short words
});

test('removes links and phone numbers', () => {
  assert.equal(cleanText('call me 98765 43210'), 'call me [number removed]');
  assert.equal(cleanText('see www.spam.com now'), 'see [link removed] now');
});

test('names are sanitised', () => {
  assert.equal(cleanName('<b>Rohan_007</b>'), 'bRohan_007b');
  assert.equal(cleanName('x'), 'Player');
});
