// Chime for notifications that arrive while the app is open (push
// notifications on a closed app use the phone's own sound; see public/sw.js).
// Made with Web Audio, so there's no sound file to load.

// Need attention straight away: a 5-second alarm at full volume (keep in step with public/sw.js)
export const URGENT_NOTIFICATION_TYPES = new Set([
  'new_order', // vendor
  'order_nearby', // rider
  'incoming_order', // rider: someone is about to order and no rider is online
  'assigned_by_admin', // rider
  'payout_request', // admin
  'verification_request', // admin
  'rider_arrived', // customer: the rider is at the door
  'support_message', // everyone: a support chat message
]);

let ctx: AudioContext | null = null;
// When the alarm that's playing ends, so alarms don't pile up on each other
let alarmUntil = 0;

const audioContext = () => {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
};

// Browsers only allow sound after the person has tapped or typed on the page:
// wake the audio up on the first interaction so later chimes can play
export const unlockNotificationSound = () => {
  const wake = () => {
    void audioContext()?.resume();
    window.removeEventListener('pointerdown', wake);
    window.removeEventListener('keydown', wake);
  };
  window.addEventListener('pointerdown', wake);
  window.addEventListener('keydown', wake);
  return wake;
};

// One note: a quick fade in, held at full volume, then a quick fade out
const tone = (ac: AudioContext, freq: number, start: number, length: number, volume: number, wave: OscillatorType = 'sine') => {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = wave;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.01);
  gain.gain.setValueAtTime(volume, start + length - 0.02);
  gain.gain.linearRampToValueAtTime(0, start + length);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + length + 0.05);
};

// Alarm clock: 5 bursts of 4 fast beeps (high, low, high, low), one burst a second
const ALARM_BURSTS = 5;
const ALARM_BEEPS = [1319, 988, 1319, 988]; // E6, B5
const BEEP = 0.1; // seconds on
const BEEP_GAP = 0.05; // seconds off
const ALARM_LENGTH = ALARM_BURSTS; // seconds

const playAlarm = (ac: AudioContext, t: number) => {
  for (let burst = 0; burst < ALARM_BURSTS; burst++) {
    ALARM_BEEPS.forEach((freq, i) => {
      tone(ac, freq, t + burst + i * (BEEP + BEEP_GAP), BEEP, 1, 'square');
    });
  }
  // Buzz along with each burst (Android; iPhones don't allow web vibration)
  const burst = ALARM_BEEPS.flatMap(() => [BEEP * 1000, BEEP_GAP * 1000]);
  const rest = 1000 - burst.reduce((a, b) => a + b, 0);
  navigator.vibrate?.(Array.from({ length: ALARM_BURSTS }, () => [...burst.slice(0, -1), BEEP_GAP * 1000 + rest]).flat());
};

export const playNotificationSound = (type?: string) => {
  try {
    const ac = audioContext();
    if (!ac || ac.state !== 'running') return; // not unlocked yet: stay quiet rather than error
    // An alarm is already going: it covers this one too
    if (ac.currentTime < alarmUntil) return;
    const t = ac.currentTime + 0.01;
    if (type && URGENT_NOTIFICATION_TYPES.has(type)) {
      alarmUntil = t + ALARM_LENGTH;
      playAlarm(ac, t);
    } else {
      // Three rising notes
      tone(ac, 880, t, 0.14, 0.6); // A5
      tone(ac, 1109, t + 0.14, 0.14, 0.6); // C#6
      tone(ac, 1319, t + 0.28, 0.3, 0.6); // E6
      navigator.vibrate?.(150);
    }
  } catch {
    // Sound is a nice-to-have; never let it break notifications
  }
};
