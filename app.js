"use strict";
(() => {
if (top !== self) { document.body.textContent = ""; return; } // never run inside someone else's page

const $ = id => document.getElementById(id), root = document.documentElement;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (a, b, x) => (x = clamp((x - a) / (b - a), 0, 1), x * x * (3 - 2 * x));
const now = () => performance.now() / 1000, sleep = s => new Promise(r => setTimeout(r, s * 1000));
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const BEAT = 60 / 86, END = 66, LOOP = 80 * BEAT, PAD = .3, SA = 329.63, STEMS = ["amb", "mel", "per"], FILM_BYTES = 12740231;

root.classList.add("js"); document.body.classList.add("locked"); history.scrollRestoration = "manual";
$("enter").hidden = false; $("rest").inert = true; $("fonts").media = "all"; // fonts must never hold up the page

/* ---- film: one video, or 14 stills if it cannot load ---- */
const cv = $("cv"), [imgA, imgB] = $("vs").children;
let loaded = 0, film = false, cannotPlay = false, shown = -1;
const fail = () => { film = false; cv.style.opacity = 0; };
const filmReady = (async () => {
  try {
    if (navigator.connection?.saveData) return;
    const parts = [];
    let got = 0;
    for (let n = 1; n < 3; n++) { // the film comes in two halves
      const r = await fetch(`film-${n}.bin`);
      if (!r.ok) return;
      for (let c, rd = r.body.getReader(); !(c = await rd.read()).done;) { parts.push(c.value); loaded = Math.min(.99, (got += c.value.length) / FILM_BYTES); }
    }
    if (got !== FILM_BYTES) return;
    cv.src = URL.createObjectURL(new Blob(parts, { type: "video/mp4" }));
    cv.load();
    await Promise.race([new Promise((ok, no) => { cv.onloadeddata = ok; cv.onerror = no; }), sleep(6)]);
    film = cv.readyState > 1; cv.onerror = fail;
  } catch { fail(); }
})().then(() => loaded = 1);

function play() { // some phones (Low Power Mode) refuse playback: then each frame is sought instead
  cv.play().catch(e => { if (e.name === "NotAllowedError") cannotPlay = true; });
}
function draw(x, running) {
  if (film) {
    cv.style.opacity = 1;
    const t = Math.min(x * BEAT, (cv.duration || 1e9) - .03), d = t - cv.currentTime;
    if (running && !cannotPlay) {
      if (cv.paused) play();
      if (Math.abs(d) > .6) cv.currentTime = t + .04;
      else cv.playbackRate = Math.abs(d) > .05 ? clamp(1 + d * 1.6, .8, 1.25) : 1 + d * .6;
    } else {
      if (!cv.paused) cv.pause();
      if (!cv.seeking && Math.abs(d) > .012) cv.currentTime = t;
    }
    return;
  }
  const p = clamp(x / END * 13, 0, 12.999), i = p | 0, f = ease(0, 1, p - i);
  if (i !== shown) { shown = i; imgA.src = `img/s${i}.jpg`; imgB.src = `img/s${i + 1}.jpg`; }
  imgB.style.opacity = f; imgA.style.transform = `scale(${1 + .14 * f})`; imgB.style.transform = `scale(${1 + .08 * f})`;
}

/* ---- music: three layers locked together; the film follows their clock ---- */
let ac, master, t0 = 0, started = false, muted = false, wall = false, tap = 0;
const gain = {}, buf = {}, raw = STEMS.map(n => fetch(`audio/${n}.m4a`).then(r => r.ok ? r.arrayBuffer() : null).catch(() => null));
function wake() {
  if (!ac) {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = .9;
    const c = ac.createDynamicsCompressor(); c.threshold.value = -10; c.ratio.value = 4;
    master.connect(c); c.connect(ac.destination);
  }
  return ac.resume();
}
const decode = () => Promise.all(STEMS.map(async (n, i) => {
  const a = await raw[i];
  if (a?.byteLength && !buf[n]) buf[n] = await ac.decodeAudioData(a).catch(() => undefined);
}));
function music(at) { // start at any beat, so late music still joins in time
  const names = STEMS.filter(n => buf[n]);
  if (started || !names.length) return;
  const t = ac.currentTime + .06;
  for (const n of names) {
    const s = ac.createBufferSource(), g = gain[n] = ac.createGain();
    s.buffer = buf[n]; s.loop = true; s.loopStart = PAD; s.loopEnd = PAD + LOOP; g.gain.value = 0;
    s.connect(g); g.connect(master); s.start(t, PAD + at * BEAT % LOOP);
  }
  t0 = t - at * BEAT; started = true; $("music").classList.add("on");
}
const songBeat = () => Math.max(0, (ac.currentTime - t0) / BEAT);
const clock = () => started && !wall ? songBeat() : (now() - tap) / BEAT;
function bell(f, v, onBeat) {
  if (!ac) return;
  const t = onBeat && started ? t0 + Math.ceil(songBeat() + .02) * BEAT : ac.currentTime;
  for (const [r, a, d] of [[.5, .35, 5], [1, 1, 4.2], [1.19, .3, 3], [2.02, .42, 2.4], [2.74, .28, 1.6], [4.1, .12, .9]]) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = f * r; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a * v, t + .005); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + d + .1);
  }
}
function mix() {
  if (!started) return;
  const fin = $("fin").getBoundingClientRect().top < innerHeight * .6, gufa = X > 47.4 && X < 55.6;
  const mel = fin ? .7 : auto || X >= 55.6 ? 1 : gufa ? .8 : .38 + .5 * ease(0, 20, X);
  const per = fin ? .35 : auto || X >= 55.6 ? 1 : gufa ? 0 : .85 * ease(15.5, 26, X);
  [1, mel, per].forEach((v, i) => gain[STEMS[i]]?.gain.setTargetAtTime(v, ac.currentTime, .35));
}
$("music").onclick = () => {
  try {
    wake();
    if (!started) { decode().then(() => music(X)); return; }
    muted = !muted; master.gain.value = muted ? 0 : .9; $("music").classList.toggle("on", !muted);
  } catch { $("music").hidden = true; }
};
document.addEventListener("visibilitychange", () => ac && (document.hidden ? ac.suspend() : ac.resume()));

/* ---- marigold petals, cut from the photograph ---- */
const pc = $("petals"), px = pc.getContext("2d"), petals = [], DP = Math.min(devicePixelRatio, 2);
let fall = [], lastDrop = 0;
for (const src of ["img/mg1.jpg", "img/mg2.jpg"]) {
  const m = new Image();
  m.onload = () => {
    for (let k = 0; k < 4; k++) {
      const c = document.createElement("canvas"), x = c.getContext("2d"), q = x.createLinearGradient(0, 0, 48, 64);
      c.width = 48; c.height = 64;
      x.beginPath(); x.moveTo(24, 63); x.bezierCurveTo(-4, 40, 2, 6, 18, 3); x.quadraticCurveTo(24, 9, 31, 2); x.bezierCurveTo(48, 10, 50, 42, 24, 63); x.clip();
      x.drawImage(m, 40 + k * 22, 50 + k * 20, 70, 94, 0, 0, 48, 64);
      q.addColorStop(0, "rgba(255,225,130,.28)"); q.addColorStop(1, "rgba(80,10,0,.5)"); x.fillStyle = q; x.fillRect(0, 0, 48, 64);
      petals.push(c);
    }
  };
  m.src = src;
}
function shower(n, top) {
  if (still || document.hidden || !petals.length) return;
  const idle = !fall.length, R = Math.random;
  for (; n-- && fall.length < 140;) {
    const z = .45 + 1.1 * R(), q = R(), e = .34 * Math.pow(q < .5 ? q * 2 : 2 - q * 2, 1.5);
    fall.push({ x: innerWidth * (q < .5 ? e : 1 - e), y: -30 - R() * top, z, v: (.8 + .9 * R()) * z, p: R() * 6.3, r: R() * 6.3, w: (R() - .5) * .05, m: petals[R() * petals.length | 0] });
  }
  if (idle) { lastDrop = performance.now(); requestAnimationFrame(drop); }
}
function drop(ms) {
  const dt = clamp((ms - lastDrop) / 16.7, 0, 3), w = innerWidth, h = innerHeight;
  lastDrop = ms;
  if (pc.width !== Math.round(w * DP) || pc.height !== Math.round(h * DP)) { pc.width = Math.round(w * DP); pc.height = Math.round(h * DP); }
  px.setTransform(DP, 0, 0, DP, 0, 0); px.clearRect(0, 0, w, h);
  for (const f of fall) {
    f.y += f.v * dt * 1.5; f.p += .026 * dt; f.x += Math.sin(f.p) * f.z * .8 * dt; f.r += f.w * dt;
    px.save(); px.translate(f.x, f.y); px.rotate(f.r); px.scale(.3 + .7 * Math.abs(Math.cos(f.p * 1.3)), 1);
    px.globalAlpha = (f.z < .75 ? .6 : .95) * (w > 700 || Math.abs(f.x / w - .5) > .36 ? 1 : .28); // faint over the words
    px.drawImage(f.m, -8 * f.z, -11 * f.z, 16 * f.z, 22 * f.z); px.restore();
  }
  fall = fall.filter(f => f.y < h + 40);
  if (fall.length) requestAnimationFrame(drop); else px.clearRect(0, 0, w, h);
}

/* ---- the journey ---- */
const Y = $("yatra"), len = () => Y.offsetHeight - innerHeight;
const words = [...document.querySelectorAll(".w")].map(e => ({ e, a: +e.dataset.a, b: +e.dataset.b }));
let open = false, auto = false, X = 0, was = -1, seen = 0, seenAt = 0, bar = -1;
const gate = () => auto && bell(SA * 2, .075, true);
const CUES = [[27.7, gate], [33.7, gate], [37.7, gate], [41.7, gate], [47.6, () => bell(SA, .2, true)], [51.7, () => auto && bell(SA, .16, true)],
  [56.3, () => { bell(SA, .22, true); bell(SA * 2, .1, true); shower(46, innerHeight * .6); }]];

for (const t of ["wheel", "touchstart", "keydown", "mousedown"])
  addEventListener(t, e => { if (open && !e.target.closest?.("#music,#offer")) auto = false; }, { passive: true });

function loop() {
  requestAnimationFrame(loop);
  const t = now();
  if (auto) {
    let x = clock();
    if (x !== seen) { seen = x; seenAt = t; } else if (t - seenAt > 1.5) { wall = true; tap = t - X * BEAT; } // the sound clock stopped: carry on without it
    scrollTo(0, len() * clamp(x / END, 0, 1));
    if (x > END) auto = false;
  }
  const to = clamp((scrollY - Y.offsetTop) / len(), 0, 1) * END;
  X = auto || still || was < 0 || Math.abs(to - X) < .002 ? to : X + (to - X) * .14;
  const near = scrollY < Y.offsetTop + Y.offsetHeight;
  if (near) draw(X, auto && X < END - .05); else if (!cv.paused) cv.pause();
  if (open && X !== was) {
    for (const w of words) {
      w.e.style.opacity = ease(w.a, w.a + 1.3, X) * (1 - ease(w.b - 1.1, w.b, X));
      w.e.style.transform = `translateY(${(1 - ease(w.a, w.a + 1.8, X)) * 16 - ease(w.b - 1.1, w.b, X) * 10}px)`;
    }
    for (const [b, go] of CUES) if (was < b && X >= b && X - was < 3) go();
    if (scrollY > 40) $("cue").style.opacity = 0;
  }
  was = X;
  $("offer").hidden = !open || X < 59 || !near;
  if (started && X > 58 && scrollY < len() + innerHeight * .4) { const b = Math.floor(songBeat() / 4); if (b !== bar) { bar = b; shower(5, 60); } }
}
requestAnimationFrame(loop);
setInterval(mix, 150);

$("enter").onclick = async () => {
  if ($("enter").disabled) return;
  $("enter").disabled = true;
  let sound;
  try { wake(); sound = decode(); bell(SA, .14); } catch { } // no sound on this device: the film still plays
  if (film) play();
  const say = () => $("enter").textContent = loaded < 1 ? `Opening… ${Math.round(loaded * 100)}%` : "Jai Mata Di";
  say(); const tick = setInterval(say, 120);
  await Promise.race([filmReady, sleep(25)]);
  await Promise.race([sound, sleep(6)]);
  clearInterval(tick);
  scrollTo(0, 0); $("cover").classList.add("gone"); document.body.classList.remove("locked"); $("rest").inert = false; $("music").hidden = false;
  open = true; tap = seenAt = now(); auto = !still;
  if (auto) $("cue").textContent = "Scroll to walk at your own pace";
  if (sound) { music(0); if (!started) sound.then(() => music(auto ? clock() : X)); }
};
$("offer").onclick = () => { shower(45, innerHeight * .6); bell(SA * 2, .12, true); };

/* ---- details ---- */
const two = n => String(n).padStart(2, "0"), START = Date.UTC(2026, 11, 19, 13, 30);
(function count() {
  const s = Math.floor((START - Date.now()) / 1000);
  if (s <= 0) { $("opens").textContent = "Jai Mata Di"; $("count").hidden = true; return; }
  [s / 86400, s / 3600 % 24, s / 60 % 60, s % 60].forEach((v, i) => $("count").children[i].firstChild.textContent = two(v | 0));
  setTimeout(count, 1000);
})();
if (!still && window.IntersectionObserver) {
  root.classList.add("rvon");
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("on"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -6% 0px" });
  document.querySelectorAll(".rv").forEach(e => io.observe(e));
}
})();
