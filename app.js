(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const ui = {
    overall: $("overall-status"), browserChip: $("browser-chip"), audioChip: $("audio-chip"), gpsChip: $("gps-chip"),
    speed: $("speed"), speedNeedle: $("speed-needle"), speedGauge: document.querySelector(".gauge-speed"), speedPod: $("speed-pod"), speedSource: $("speed-source"), speedStatus: $("speed-status"),
    rpm: $("engine-rpm"), rpmNeedle: $("rpm-needle"), rpmGauge: document.querySelector(".gauge-rpm"), rpmPod: $("rpm-pod"), gear: $("engine-gear"), shiftState: $("shift-state"),
    engineLight: $("engine-light"), engineState: $("engine-state-label"), profileLabel: $("profile-label"), shiftLights: $("shift-lights"),
    revButton: $("rev-button"), revLevel: $("rev-level"), audioButton: $("audio-button"), audioHint: $("audio-button-hint"),
    gpsButton: $("gps-button"), testButton: $("test-button"), manualPanel: $("manual-panel"), manualSpeed: $("manual-speed"), manualSpeedValue: $("manual-speed-value"),
    locationHelp: $("location-help"), locationHelpText: $("location-help-text"), reloadButton: $("reload-button"),
    profileGrid: $("profile-grid"), soundCount: $("sound-count"), masterVolume: $("master-volume"), masterVolumeValue: $("master-volume-value"),
    bassShelf: $("bass-shelf"), bassShelfValue: $("bass-shelf-value"), speedSmoothing: $("speed-smoothing"), speedSmoothingValue: $("speed-smoothing-value"),
    needleSpeed: $("needle-speed"), needleSpeedValue: $("needle-speed-value"), accelSensitivity: $("accel-sensitivity"), accelSensitivityValue: $("accel-sensitivity-value"),
    shiftRpm: $("shift-rpm"), shiftRpmValue: $("shift-rpm-value"), idleRpm: $("idle-rpm"), idleRpmValue: $("idle-rpm-value"), resetButton: $("reset-button"),
    telemetryCanvas: $("telemetry-canvas"), telemetrySource: $("telemetry-source"), rawSpeed: $("raw-speed"), smoothSpeed: $("smooth-speed"),
    frequency: $("frequency"), fixAge: $("fix-age"), accuracy: $("accuracy"), loadValue: $("load-value"), loadLabel: $("load-label"),
    positionStatus: $("position-status"), coordinates: $("coordinates"), updateStatus: $("update-status"), updateCount: $("update-count"), interval: $("interval"),
    accelerationLabel: $("acceleration-label"), accelerationValue: $("acceleration-value"), secureContext: $("secure-context"), geolocationApi: $("geolocation-api"),
    locationPermission: $("location-permission"), audioApi: $("audio-api"), apiSummary: $("api-summary"), browserDetails: $("browser-details"),
    eventLog: $("event-log"), clearLog: $("clear-log"), lastUpdate: $("last-update")
  };

  const profiles = [
    { id: "american-v8", name: "American V8", detail: "cross-plane · deep rumble", cylinders: 8, maxRpm: 6200, idle: 780, filter: 560, span: 2200, rough: .34, noise: .055, sub: .30, body: .13, drive: 34, detune: 8, whine: .15 },
    { id: "euro-v8", name: "Euro V8", detail: "tight · modern · sharp", cylinders: 8, maxRpm: 7200, idle: 850, filter: 720, span: 3000, rough: .18, noise: .045, sub: .20, body: .11, drive: 25, detune: 4, whine: .22 },
    { id: "v10", name: "High-rev V10", detail: "exotic · rising scream", cylinders: 10, maxRpm: 8500, idle: 950, filter: 900, span: 4300, rough: .12, noise: .040, sub: .12, body: .08, drive: 19, detune: 3, whine: .38 },
    { id: "v12", name: "Grand V12", detail: "smooth · layered thunder", cylinders: 12, maxRpm: 7600, idle: 820, filter: 680, span: 3500, rough: .08, noise: .035, sub: .20, body: .10, drive: 21, detune: 2, whine: .26 },
    { id: "rally-i4", name: "Rally Turbo I4", detail: "boost · crackle · urgent", cylinders: 4, maxRpm: 7200, idle: 1050, filter: 830, span: 3400, rough: .28, noise: .10, sub: .14, body: .09, drive: 39, detune: 10, whine: .48 },
    { id: "boxer-6", name: "Air-cooled Flat-6", detail: "mechanical · classic", cylinders: 6, maxRpm: 7800, idle: 900, filter: 760, span: 3600, rough: .25, noise: .075, sub: .15, body: .08, drive: 28, detune: 12, whine: .30 },
    { id: "diesel", name: "Turbo Diesel", detail: "low-rev · torque · clatter", cylinders: 4, maxRpm: 4700, idle: 720, filter: 390, span: 1500, rough: .48, noise: .12, sub: .34, body: .16, drive: 45, detune: 15, whine: .18 },
    { id: "future", name: "Future Turbine", detail: "electric spool · harmonic", cylinders: 16, maxRpm: 9000, idle: 1000, filter: 1050, span: 5200, rough: .03, noise: .07, sub: .08, body: .05, drive: 12, detune: 1, whine: .85 }
  ];

  const defaults = { profile: "american-v8", volume: 55, bass: 4, smoothing: 650, needle: 180, sensitivity: 25, shiftRpm: 4800, idleRpm: 800 };
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem("revora-tuning") || "{}"); } catch (_) { saved = {}; }
  const settings = Object.assign({}, defaults, saved);
  const state = {
    watchId: null, source: "gps", rawGpsSpeed: 0, rawSpeed: 0, smoothedSpeed: 0, displayedSpeed: 0,
    acceleration: 0, load: 0, gear: 1, rpm: settings.idleRpm, displayedRpm: settings.idleRpm,
    shift: null, engine: null, currentProfile: profiles.find((profile) => profile.id === settings.profile) || profiles[0],
    revHeld: false, revAmount: 0, revStartedAt: 0, blipUntil: 0,
    lastFrame: null, lastDriveSpeed: 0, history: [], lastHistoryAt: 0,
    lastGpsAt: null, lastGpsTimestamp: null, gpsIntervals: [], updateCount: 0, lastSpeedMps: null
  };
  const gearRatios = [3.62, 2.19, 1.41, 1.00, .83, .72];
  const finalDrive = 3.31;
  const tireCircumference = 2.12;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  function profile() { return state.currentProfile; }
  function formatTime() { return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
  function log(message) {
    const item = document.createElement("li");
    const time = document.createElement("time");
    time.textContent = formatTime();
    item.append(time, document.createTextNode(message));
    ui.eventLog.prepend(item);
    while (ui.eventLog.children.length > 12) ui.eventLog.lastElementChild.remove();
  }
  function setValue(element, value, tone) {
    element.textContent = value;
    element.classList.remove("value-pass", "value-warn", "value-fail");
    if (tone) element.classList.add(`value-${tone}`);
  }
  function setOverall(label, mode) {
    ui.overall.className = `status-pill status-${mode}`;
    ui.overall.lastElementChild.textContent = label;
  }
  function saveSettings() {
    try { localStorage.setItem("revora-tuning", JSON.stringify(settings)); } catch (_) { /* storage may be disabled */ }
  }
  function rpmForSpeed(speedKph, gear) {
    if (speedKph < 1) return Number(settings.idleRpm);
    const wheelRpm = (speedKph / 3.6) / tireCircumference * 60;
    return wheelRpm * gearRatios[gear - 1] * finalDrive;
  }
  function currentShiftRpm() { return Math.min(Number(settings.shiftRpm), profile().maxRpm - 450); }

  function beginShift(nextGear, fromRpm) {
    if (state.shift || nextGear === state.gear || nextGear < 1 || nextGear > gearRatios.length) return;
    const now = performance.now();
    const toRpm = clamp(rpmForSpeed(state.smoothedSpeed, nextGear), Number(settings.idleRpm), profile().maxRpm);
    state.shift = { from: state.gear, to: nextGear, fromRpm, toRpm, started: now, duration: nextGear > state.gear ? 430 : 320 };
    ui.shiftState.textContent = nextGear > state.gear ? "UPSHIFT" : "DOWNSHIFT";
    ui.engineState.textContent = `Shifting ${state.gear} → ${nextGear}`;
    if (state.engine) {
      const audio = state.engine;
      const at = audio.context.currentTime;
      audio.shiftGain.gain.cancelScheduledValues(at);
      audio.shiftGain.gain.setValueAtTime(Math.max(audio.shiftGain.gain.value, .01), at);
      audio.shiftGain.gain.linearRampToValueAtTime(.24, at + .075);
      audio.shiftGain.gain.exponentialRampToValueAtTime(1, at + state.shift.duration / 1000);
    }
  }

  function updateGearbox(now) {
    const idle = Number(settings.idleRpm);
    if (state.shift) {
      const progress = clamp((now - state.shift.started) / state.shift.duration, 0, 1);
      const cut = Math.sin(progress * Math.PI);
      state.rpm = state.shift.fromRpm + (state.shift.toRpm - state.shift.fromRpm) * progress - cut * 180;
      if (progress >= 1) {
        const previous = state.shift.from;
        state.gear = state.shift.to;
        state.shift = null;
        ui.shiftState.textContent = "6-SPEED AUTO";
        ui.engineState.textContent = state.engine ? `${profile().name} running` : "Standby";
        log(`Shift ${previous} → ${state.gear}`);
      }
      return;
    }
    const naturalRpm = rpmForSpeed(state.smoothedSpeed, state.gear);
    if (naturalRpm >= currentShiftRpm() && state.gear < 6) {
      beginShift(state.gear + 1, naturalRpm);
      return;
    }
    if (naturalRpm < idle + 450 && state.gear > 1) {
      const lowerRpm = rpmForSpeed(state.smoothedSpeed, state.gear - 1);
      if (lowerRpm < currentShiftRpm() * .88) beginShift(state.gear - 1, Math.max(naturalRpm, idle));
      return;
    }
    state.rpm = clamp(naturalRpm, idle, profile().maxRpm);
  }

  function updateManualRev(now, dt) {
    const rise = dt / .82;
    const fall = dt / .95;
    if (state.revHeld) state.revAmount = clamp(state.revAmount + rise, 0, 1);
    else if (now < state.blipUntil) state.revAmount = Math.max(state.revAmount, .45 * ((state.blipUntil - now) / 520));
    else state.revAmount = clamp(state.revAmount - fall, 0, 1);
    ui.revLevel.style.transform = `scaleX(${state.revAmount})`;
    if (state.revHeld || state.revAmount > .002) {
      state.rpm = Math.round(Number(settings.idleRpm) + Math.pow(state.revAmount, .66) * (Math.min(currentShiftRpm() + 500, profile().maxRpm) - Number(settings.idleRpm)));
      ui.gear.textContent = "N";
      ui.engineState.textContent = state.revHeld ? "Manual throttle" : "Throttle blip";
      return true;
    }
    return false;
  }

  function updateShiftLights() {
    const ratio = clamp((state.displayedRpm - Number(settings.idleRpm)) / Math.max(currentShiftRpm() - Number(settings.idleRpm), 1), 0, 1);
    const count = Math.round(ratio * 8);
    Array.from(ui.shiftLights.children).forEach((light, index) => {
      light.classList.toggle("on", index < count);
      light.classList.toggle("hot", index >= 6 && index < count);
    });
  }

  function updateGaugeEffects() {
    const speedRatio = clamp(state.displayedSpeed / 220, 0, 1);
    const rpmRatio = clamp(state.displayedRpm / Math.max(currentShiftRpm(), 1), 0, 1.12);
    const rpmProgress = clamp(rpmRatio, 0, 1);
    const rpmHue = rpmProgress < .7 ? 195 + rpmProgress * 115 : 275 + ((rpmProgress - .7) / .3) * 100;
    ui.speedGauge.style.setProperty("--gauge-progress", `${speedRatio * 260}deg`);
    ui.speedGauge.style.setProperty("--gauge-glow", String(.12 + speedRatio * .5));
    ui.speedGauge.style.setProperty("--gauge-color", `hsl(${195 + speedRatio * 45} 100% 58%)`);
    ui.speedGauge.style.setProperty("--gauge-color-2", `hsl(${250 + speedRatio * 35} 95% 58%)`);
    ui.rpmGauge.style.setProperty("--gauge-progress", `${rpmProgress * 260}deg`);
    ui.rpmGauge.style.setProperty("--gauge-glow", String(.14 + rpmProgress * .58));
    ui.rpmGauge.style.setProperty("--gauge-color", `hsl(${rpmHue} 100% 58%)`);
    ui.rpmGauge.style.setProperty("--gauge-color-2", rpmProgress > .82 ? "#ff315f" : "#7b42ff");
    ui.speedPod.style.setProperty("--pod-intensity", String(.1 + speedRatio * .35));
    ui.rpmPod.style.setProperty("--pod-intensity", String(.1 + rpmProgress * .42));
    [
      { pod: ui.speedPod, ratio: speedRatio },
      { pod: ui.rpmPod, ratio: rpmProgress }
    ].forEach((meter) => {
      const lit = Math.ceil(meter.ratio * 7);
      Array.from(meter.pod.querySelectorAll(".pod-leds i")).forEach((light, index) => {
        light.classList.toggle("on", index < lit);
        light.classList.toggle("hot", meter.ratio > .82 && index >= 5 && index < lit);
      });
    });
  }

  function applyProfileToAudio() {
    if (!state.engine) return;
    const audio = state.engine;
    const p = profile();
    const real = new Float32Array(10);
    const imagA = new Float32Array(10);
    const imagB = new Float32Array(10);
    for (let index = 1; index < 10; index += 1) {
      const decay = 1 / Math.pow(index, 1.02 + p.rough);
      imagA[index] = decay * (index % 2 ? 1 : .58 + p.rough);
      imagB[index] = decay * (index % 3 ? .72 : 1) * (1 - p.rough * .2);
    }
    audio.bankA.setPeriodicWave(audio.context.createPeriodicWave(real, imagA));
    audio.bankB.setPeriodicWave(audio.context.createPeriodicWave(real, imagB));
    audio.bankBGain.gain.value = .13 + p.rough * .18;
    audio.bankAGain.gain.value = .20 + p.rough * .16;
    audio.subGain.gain.value = p.sub;
    audio.bodyGain.gain.value = p.body;
    audio.noiseGain.gain.value = p.noise;
    audio.drive.curve = makeDriveCurve(p.drive);
  }

  function updateAudio() {
    if (!state.engine) return;
    const audio = state.engine;
    const p = profile();
    const now = audio.context.currentTime;
    const firingHz = Math.max(18, (state.rpm / 60) * (p.cylinders / 2));
    const normalizedRpm = clamp(state.rpm / p.maxRpm, 0, 1);
    audio.bankA.frequency.setTargetAtTime(firingHz, now, .035);
    audio.bankB.frequency.setTargetAtTime(firingHz * (1 + p.detune / 2500), now, .04);
    audio.sub.frequency.setTargetAtTime(Math.max(22, firingHz * .5), now, .055);
    audio.body.frequency.setTargetAtTime(Math.max(28, firingHz * .25), now, .07);
    audio.whine.frequency.setTargetAtTime(55 + state.rpm / 60 * (3 + p.whine * 8), now, .055);
    audio.whineGain.gain.setTargetAtTime(.008 + p.whine * normalizedRpm * .10, now, .08);
    audio.filter.frequency.setTargetAtTime(p.filter + normalizedRpm * p.span + state.load * 650, now, .06);
    audio.noiseFilter.frequency.setTargetAtTime(280 + normalizedRpm * 1900, now, .08);
    audio.noiseGain.gain.setTargetAtTime(p.noise * (.65 + normalizedRpm * .55 + state.load * .4), now, .07);
    audio.master.gain.setTargetAtTime((Number(settings.volume) / 100) * (.72 + state.load * .22), now, .08);
    audio.bass.gain.setTargetAtTime(Number(settings.bass), now, .08);
  }

  function updateDashboard(now, dt) {
    const speedAlpha = 1 - Math.exp(-dt / Math.max(Number(settings.smoothing) / 1000, .05));
    state.smoothedSpeed += (state.rawSpeed - state.smoothedSpeed) * speedAlpha;
    if (state.smoothedSpeed < .03) state.smoothedSpeed = 0;
    state.acceleration = ((state.smoothedSpeed - state.lastDriveSpeed) / 3.6) / Math.max(dt, .001);
    state.lastDriveSpeed = state.smoothedSpeed;
    state.load = clamp(state.acceleration / (Number(settings.sensitivity) / 10), 0, 1);

    const revOverride = updateManualRev(now, dt);
    if (!revOverride) updateGearbox(now);
    const needleAlpha = 1 - Math.exp(-dt / Math.max(Number(settings.needle) / 1000, .03));
    state.displayedSpeed += (state.smoothedSpeed - state.displayedSpeed) * needleAlpha;
    state.displayedRpm += (state.rpm - state.displayedRpm) * needleAlpha;

    ui.speed.textContent = state.displayedSpeed.toFixed(1);
    ui.rpm.textContent = String(Math.round(state.displayedRpm));
    if (!revOverride) ui.gear.textContent = String(state.gear);
    ui.speedNeedle.style.transform = `translateY(-50%) rotate(${140 + clamp(state.displayedSpeed, 0, 220) / 220 * 260}deg)`;
    ui.rpmNeedle.style.transform = `translateY(-50%) rotate(${140 + clamp(state.displayedRpm, 0, 7000) / 7000 * 260}deg)`;
    ui.rawSpeed.textContent = `${state.rawSpeed.toFixed(1)} km/u`;
    ui.smoothSpeed.textContent = `${state.smoothedSpeed.toFixed(1)} km/u`;
    ui.loadValue.textContent = `${Math.round(state.load * 100)}%`;
    ui.loadLabel.textContent = `Load ${Math.round(state.load * 100)}%`;
    ui.accelerationValue.textContent = `${state.acceleration >= 0 ? "+" : ""}${state.acceleration.toFixed(2)} m/s²`;
    ui.accelerationLabel.textContent = state.acceleration > .15 ? "Accelerating" : state.acceleration < -.15 ? "Decelerating" : "Steady";
    ui.audioHint.textContent = revOverride ? `${Math.round(state.rpm)} RPM · Neutral` : `${Math.round(state.rpm)} RPM · Gear ${state.gear} · ${state.smoothedSpeed.toFixed(1)} km/u`;
    if (state.lastGpsAt) ui.fixAge.textContent = `${((Date.now() - state.lastGpsAt) / 1000).toFixed(1)} s`;
    updateShiftLights();
    updateGaugeEffects();
    updateAudio();
  }

  function drawTelemetry(now) {
    if (now - state.lastHistoryAt < 100) return;
    state.lastHistoryAt = now;
    state.history.push({ speed: state.smoothedSpeed, rpm: state.rpm, load: state.load });
    if (state.history.length > 120) state.history.shift();
    const canvas = ui.telemetryCanvas;
    const context = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);
    const series = [
      { key: "speed", max: 220, color: "#49e7ff" },
      { key: "rpm", max: 7000, color: "#ff703d" },
      { key: "load", max: 1, color: "#4de7a9" }
    ];
    series.forEach((item) => {
      context.beginPath();
      context.strokeStyle = item.color;
      context.lineWidth = 2.5;
      state.history.forEach((point, index) => {
        const x = state.history.length <= 1 ? 0 : index / (state.history.length - 1) * width;
        const y = height - clamp(point[item.key] / item.max, 0, 1) * (height - 12) - 6;
        if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
      });
      context.stroke();
    });
  }

  function driveLoop(timestamp) {
    const dt = state.lastFrame === null ? .016 : clamp((timestamp - state.lastFrame) / 1000, .001, .06);
    state.lastFrame = timestamp;
    state.rawSpeed = state.source === "test" ? Number(ui.manualSpeed.value) : state.rawGpsSpeed;
    updateDashboard(timestamp, dt);
    drawTelemetry(timestamp);
    requestAnimationFrame(driveLoop);
  }

  function buildNoiseSource(context) {
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < data.length; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * .84 + white * .16;
      data[index] = previous;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }
  function makeDriveCurve(amount) {
    const curve = new Float32Array(2048);
    for (let index = 0; index < curve.length; index += 1) {
      const input = index * 2 / curve.length - 1;
      curve[index] = Math.tanh(input * (1 + amount / 12));
    }
    return curve;
  }

  async function startEngine() {
    if (state.engine || !AudioContextClass) return;
    try {
      const context = new AudioContextClass();
      await context.resume();
      const bankA = context.createOscillator();
      const bankB = context.createOscillator();
      const sub = context.createOscillator();
      const body = context.createOscillator();
      const whine = context.createOscillator();
      const noise = buildNoiseSource(context);
      const bankAGain = context.createGain();
      const bankBGain = context.createGain();
      const subGain = context.createGain();
      const bodyGain = context.createGain();
      const whineGain = context.createGain();
      const noiseGain = context.createGain();
      const noiseFilter = context.createBiquadFilter();
      const drive = context.createWaveShaper();
      const filter = context.createBiquadFilter();
      const bass = context.createBiquadFilter();
      const shiftGain = context.createGain();
      const compressor = context.createDynamicsCompressor();
      const master = context.createGain();
      sub.type = "triangle"; body.type = "sine"; whine.type = "sawtooth";
      noiseFilter.type = "bandpass"; noiseFilter.Q.value = .8;
      filter.type = "lowpass"; filter.Q.value = 1.15;
      bass.type = "lowshelf"; bass.frequency.value = 120; bass.gain.value = Number(settings.bass);
      drive.oversample = "2x"; shiftGain.gain.value = 1; master.gain.value = .0001;
      compressor.threshold.value = -23; compressor.knee.value = 10; compressor.ratio.value = 7; compressor.attack.value = .004; compressor.release.value = .18;
      bankA.connect(bankAGain).connect(drive); bankB.connect(bankBGain).connect(drive); sub.connect(subGain).connect(drive); body.connect(bodyGain).connect(drive);
      whine.connect(whineGain).connect(filter); drive.connect(filter); noise.connect(noiseFilter).connect(noiseGain).connect(filter);
      filter.connect(bass).connect(shiftGain).connect(compressor).connect(master).connect(context.destination);
      [bankA, bankB, sub, body, whine, noise].forEach((source) => source.start());
      state.engine = { context, bankA, bankB, sub, body, whine, noise, bankAGain, bankBGain, subGain, bodyGain, whineGain, noiseGain, noiseFilter, drive, filter, bass, shiftGain, compressor, master };
      applyProfileToAudio();
      updateAudio();
      master.gain.setValueAtTime(.0001, context.currentTime);
      master.gain.exponentialRampToValueAtTime(Math.max(Number(settings.volume) / 100, .001), context.currentTime + .55);
      ui.audioButton.querySelector(".button-label").textContent = "Stop engine";
      ui.audioButton.classList.add("engine-running"); ui.engineLight.classList.add("running");
      ui.engineState.textContent = `${profile().name} running`;
      ui.audioChip.textContent = "Audio running"; ui.audioChip.className = "live";
      setValue(ui.audioApi, `Running @ ${context.sampleRate} Hz`, "pass");
      setOverall("Engine running", "active");
      log(`${profile().name} engine started @ ${context.sampleRate} Hz`);
    } catch (error) {
      setValue(ui.audioApi, "Blocked", "fail");
      ui.audioChip.textContent = "Audio blocked"; ui.audioChip.className = "warn";
      setOverall("Audio could not start", "error");
      log(`Audio error: ${error.name || "unknown"}`);
    }
  }
  function stopEngine() {
    if (!state.engine) return;
    endManualRev();
    const audio = state.engine;
    state.engine = null;
    const now = audio.context.currentTime;
    audio.master.gain.cancelScheduledValues(now);
    audio.master.gain.setTargetAtTime(.0001, now, .06);
    setTimeout(() => {
      [audio.bankA,audio.bankB,audio.sub,audio.body,audio.whine,audio.noise].forEach((source) => { try { source.stop(); } catch (_) { /* stopped */ } });
      audio.context.close();
    }, 420);
    ui.audioButton.querySelector(".button-label").textContent = "Start engine";
    ui.audioButton.classList.remove("engine-running"); ui.engineLight.classList.remove("running");
    ui.engineState.textContent = "Standby"; ui.audioChip.textContent = "Audio idle"; ui.audioChip.className = "";
    setValue(ui.audioApi, "Available", "pass"); setOverall(state.watchId !== null ? "GPS active" : "Ready", state.watchId !== null ? "active" : "idle");
    log("Engine stopped");
  }
  function toggleEngine() {
    if (state.engine) stopEngine(); else {
      startEngine();
      if (state.source === "gps" && state.watchId === null) startGps();
    }
  }

  function beginManualRev(event) {
    if (event) event.preventDefault();
    if (state.revHeld) return;
    state.revHeld = true; state.revStartedAt = performance.now(); state.blipUntil = 0;
    ui.revButton.classList.add("active"); ui.revButton.setAttribute("aria-pressed", "true");
    if (event && event.pointerId != null && ui.revButton.setPointerCapture) { try { ui.revButton.setPointerCapture(event.pointerId); } catch (_) { /* released */ } }
    if (!state.engine) startEngine();
  }
  function endManualRev(event) {
    if (event) event.preventDefault();
    if (state.revHeld && performance.now() - state.revStartedAt < 230) {
      state.revAmount = Math.max(state.revAmount, .45); state.blipUntil = performance.now() + 520;
    }
    state.revHeld = false; ui.revButton.classList.remove("active"); ui.revButton.setAttribute("aria-pressed", "false");
  }

  function toggleTestMode() {
    const enabled = state.source !== "test";
    state.source = enabled ? "test" : "gps";
    ui.manualPanel.hidden = !enabled;
    ui.testButton.classList.toggle("active", enabled);
    ui.speedSource.textContent = enabled ? "Manual speed" : "GPS speed";
    ui.speedStatus.textContent = enabled ? "Test" : state.updateCount ? "Live" : "Waiting";
    ui.telemetrySource.textContent = enabled ? "TEST SLIDER" : "GPS";
    log(`Test mode ${enabled ? "enabled" : "disabled"}`);
  }

  function showLocationHelp() {
    const appleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const securePage = window.isSecureContext && (location.protocol === "https:" || ["localhost","127.0.0.1"].includes(location.hostname));
    if (!securePage) ui.locationHelpText.textContent = "Location needs the secure URL: https://mr-bas-s.github.io/revora/ — downloaded file:// pages cannot use GPS.";
    else if (appleMobile) ui.locationHelpText.textContent = "In Safari open Page Menu → More → Website Settings → Location → Allow, then reload.";
    else ui.locationHelpText.textContent = "Open this browser's site settings, allow Location for mr-bas-s.github.io, then reload.";
    ui.locationHelp.hidden = false;
  }
  function handlePosition(position) {
    const coords = position.coords;
    const timestamp = position.timestamp || Date.now();
    const elapsed = state.lastGpsTimestamp === null ? null : timestamp - state.lastGpsTimestamp;
    state.updateCount += 1; state.lastGpsAt = Date.now(); state.lastGpsTimestamp = timestamp;
    state.rawGpsSpeed = coords.speed != null && Number.isFinite(coords.speed) ? Math.max(0, coords.speed * 3.6) : state.rawGpsSpeed;
    ui.updateCount.textContent = String(state.updateCount); ui.positionStatus.textContent = "Live"; ui.updateStatus.textContent = "Receiving";
    ui.coordinates.textContent = `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`; ui.accuracy.textContent = `${Math.round(coords.accuracy)} m`;
    ui.speedStatus.textContent = state.source === "test" ? "Test" : "Live"; ui.lastUpdate.textContent = `Last GPS update ${new Date(timestamp).toLocaleTimeString()}`;
    ui.locationHelp.hidden = true; ui.gpsChip.textContent = "GPS live"; ui.gpsChip.className = "live";
    setValue(ui.locationPermission, "Granted", "pass"); setOverall("GPS active", "active");
    if (elapsed && elapsed > 0) {
      state.gpsIntervals.push(elapsed); if (state.gpsIntervals.length > 20) state.gpsIntervals.shift();
      const average = state.gpsIntervals.reduce((sum, value) => sum + value, 0) / state.gpsIntervals.length;
      ui.interval.textContent = `${(elapsed / 1000).toFixed(2)} s`; ui.frequency.textContent = `${(1000 / average).toFixed(2)} Hz`;
    }
  }
  function handlePositionError(error) {
    const message = ({ 1: "Location permission denied", 2: "Position unavailable", 3: "GPS request timed out" })[error.code] || "GPS error";
    ui.positionStatus.textContent = message; ui.updateStatus.textContent = "Stopped"; ui.gpsChip.textContent = `GPS error ${error.code || ""}`; ui.gpsChip.className = "warn";
    setOverall(message, "error"); log(message);
    if (error.code === 1) {
      setValue(ui.locationPermission, "Denied", "fail");
      if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
      state.watchId = null; ui.gpsButton.querySelector(".button-label").textContent = "Start GPS"; showLocationHelp();
    }
  }
  function startGps() {
    if (!("geolocation" in navigator)) { setOverall("Geolocation unsupported", "error"); return; }
    const securePage = window.isSecureContext && (location.protocol === "https:" || ["localhost","127.0.0.1"].includes(location.hostname));
    if (!securePage) { setOverall("Secure URL required", "error"); showLocationHelp(); return; }
    if (state.watchId !== null) {
      navigator.geolocation.clearWatch(state.watchId); state.watchId = null;
      ui.gpsButton.querySelector(".button-label").textContent = "Start GPS"; ui.gpsChip.textContent = "GPS idle"; ui.gpsChip.className = "";
      setOverall(state.engine ? "Engine running" : "GPS stopped", state.engine ? "active" : "idle"); log("GPS watch stopped"); return;
    }
    ui.locationHelp.hidden = true; ui.positionStatus.textContent = "Requesting"; ui.gpsButton.querySelector(".button-label").textContent = "Stop GPS";
    ui.gpsChip.textContent = "GPS requesting"; ui.gpsChip.className = "warn"; setOverall("Requesting location…", "idle");
    state.watchId = navigator.geolocation.watchPosition(handlePosition, handlePositionError, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
    log("GPS watch started");
  }

  function selectProfile(id) {
    const selected = profiles.find((item) => item.id === id);
    if (!selected) return;
    state.currentProfile = selected; settings.profile = selected.id;
    ui.profileLabel.textContent = selected.name.toUpperCase();
    Array.from(ui.profileGrid.children).forEach((button) => button.classList.toggle("active", button.dataset.profile === id));
    if (Number(settings.idleRpm) < selected.idle - 150) { settings.idleRpm = selected.idle; ui.idleRpm.value = String(selected.idle); }
    if (Number(settings.shiftRpm) > selected.maxRpm - 300) { settings.shiftRpm = selected.maxRpm - 500; ui.shiftRpm.value = String(settings.shiftRpm); }
    syncControlLabels(); saveSettings(); applyProfileToAudio();
    if (state.engine) ui.engineState.textContent = `${selected.name} running`;
    log(`Sound profile: ${selected.name}`);
  }
  function renderProfiles() {
    profiles.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button"; button.className = "profile-button"; button.dataset.profile = item.id;
      const name = document.createElement("strong"); name.textContent = item.name;
      const detail = document.createElement("span"); detail.textContent = item.detail;
      button.append(name, detail); button.addEventListener("click", () => selectProfile(item.id)); ui.profileGrid.appendChild(button);
    });
    ui.soundCount.textContent = `${profiles.length} sounds`;
    selectProfile(state.currentProfile.id);
  }
  function syncControlLabels() {
    ui.masterVolume.value = String(settings.volume); ui.masterVolumeValue.textContent = `${settings.volume}%`;
    ui.bassShelf.value = String(settings.bass); ui.bassShelfValue.textContent = `${Number(settings.bass) >= 0 ? "+" : ""}${settings.bass} dB`;
    ui.speedSmoothing.value = String(settings.smoothing); ui.speedSmoothingValue.textContent = `${settings.smoothing} ms`;
    ui.needleSpeed.value = String(settings.needle); ui.needleSpeedValue.textContent = `${settings.needle} ms`;
    ui.accelSensitivity.value = String(settings.sensitivity); ui.accelSensitivityValue.textContent = `${(settings.sensitivity / 10).toFixed(1)} m/s²`;
    ui.shiftRpm.value = String(settings.shiftRpm); ui.shiftRpmValue.textContent = String(settings.shiftRpm);
    ui.idleRpm.value = String(settings.idleRpm); ui.idleRpmValue.textContent = String(settings.idleRpm);
    ui.speedNeedle.style.transitionDuration = `${settings.needle}ms`; ui.rpmNeedle.style.transitionDuration = `${settings.needle}ms`;
  }
  function bindRange(input, key, format, callback) {
    input.addEventListener("input", () => {
      settings[key] = Number(input.value); format(); saveSettings(); if (callback) callback();
    });
  }
  function resetTuning() {
    Object.assign(settings, defaults); state.currentProfile = profiles[0]; state.gear = 1; state.shift = null;
    syncControlLabels(); selectProfile(defaults.profile); saveSettings(); log("Tuning reset to Revora defaults");
  }

  async function inspectApis() {
    let supported = 0;
    setValue(ui.secureContext, window.isSecureContext ? "Yes" : "No", window.isSecureContext ? "pass" : "fail");
    setValue(ui.geolocationApi, "geolocation" in navigator ? "Available" : "Unavailable", "geolocation" in navigator ? "pass" : "fail");
    setValue(ui.audioApi, AudioContextClass ? "Available" : "Unavailable", AudioContextClass ? "pass" : "fail");
    if (window.isSecureContext) supported += 1; if ("geolocation" in navigator) supported += 1; if (AudioContextClass) supported += 1;
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const permission = await navigator.permissions.query({ name: "geolocation" });
        const paint = () => { setValue(ui.locationPermission, permission.state, permission.state === "denied" ? "fail" : permission.state === "granted" ? "pass" : "warn"); if (permission.state === "denied") showLocationHelp(); };
        paint(); permission.addEventListener("change", paint);
      } catch (_) { setValue(ui.locationPermission, "Query unavailable", "warn"); }
    } else setValue(ui.locationPermission, "API unavailable", "warn");
    ui.apiSummary.textContent = `${supported}/3 core checks pass`;
    ui.browserDetails.textContent = `${navigator.userAgent}\nPlatform: ${navigator.platform || "Unknown"}\nScreen: ${screen.width} × ${screen.height} @ ${window.devicePixelRatio || 1}x`;
  }

  ui.audioButton.addEventListener("click", toggleEngine); ui.gpsButton.addEventListener("click", startGps); ui.testButton.addEventListener("click", toggleTestMode);
  ui.revButton.addEventListener("pointerdown", beginManualRev); ui.revButton.addEventListener("pointerup", endManualRev); ui.revButton.addEventListener("pointercancel", endManualRev); ui.revButton.addEventListener("contextmenu", (event) => event.preventDefault());
  ui.revButton.addEventListener("keydown", (event) => { if ((event.key === " " || event.key === "Enter") && !event.repeat) beginManualRev(event); });
  ui.revButton.addEventListener("keyup", (event) => { if (event.key === " " || event.key === "Enter") endManualRev(event); });
  ui.manualSpeed.addEventListener("input", () => { ui.manualSpeedValue.textContent = `${ui.manualSpeed.value} km/u`; });
  bindRange(ui.masterVolume, "volume", () => { ui.masterVolumeValue.textContent = `${settings.volume}%`; }, updateAudio);
  bindRange(ui.bassShelf, "bass", () => { ui.bassShelfValue.textContent = `${settings.bass >= 0 ? "+" : ""}${settings.bass} dB`; }, updateAudio);
  bindRange(ui.speedSmoothing, "smoothing", () => { ui.speedSmoothingValue.textContent = `${settings.smoothing} ms`; });
  bindRange(ui.needleSpeed, "needle", () => { ui.needleSpeedValue.textContent = `${settings.needle} ms`; ui.speedNeedle.style.transitionDuration = `${settings.needle}ms`; ui.rpmNeedle.style.transitionDuration = `${settings.needle}ms`; });
  bindRange(ui.accelSensitivity, "sensitivity", () => { ui.accelSensitivityValue.textContent = `${(settings.sensitivity / 10).toFixed(1)} m/s²`; });
  bindRange(ui.shiftRpm, "shiftRpm", () => { ui.shiftRpmValue.textContent = String(settings.shiftRpm); });
  bindRange(ui.idleRpm, "idleRpm", () => { ui.idleRpmValue.textContent = String(settings.idleRpm); });
  ui.resetButton.addEventListener("click", resetTuning); ui.reloadButton.addEventListener("click", () => location.reload()); ui.clearLog.addEventListener("click", () => { ui.eventLog.textContent = ""; });
  document.addEventListener("visibilitychange", () => { if (document.hidden) endManualRev(); });

  syncControlLabels(); renderProfiles(); inspectApis();
  log("Revora HUD ready. Start the engine or use REV.");
  requestAnimationFrame(driveLoop);
})();
