(function () {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const ui = {
    overall: byId("overall-status"), gpsButton: byId("gps-button"), audioButton: byId("audio-button"),
    audioButtonHint: byId("audio-button-hint"), speed: byId("speed"), speedStatus: byId("speed-status"),
    latitude: byId("latitude"), longitude: byId("longitude"), accuracy: byId("accuracy"),
    heading: byId("heading"), positionStatus: byId("position-status"), interval: byId("interval"),
    averageInterval: byId("average-interval"), frequency: byId("frequency"), updateCount: byId("update-count"),
    updateStatus: byId("update-status"), accelerationArrow: byId("acceleration-arrow"),
    accelerationLabel: byId("acceleration-label"), accelerationValue: byId("acceleration-value"),
    secureContext: byId("secure-context"), geolocationApi: byId("geolocation-api"),
    locationPermission: byId("location-permission"), audioApi: byId("audio-api"), apiSummary: byId("api-summary"),
    browserDetails: byId("browser-details"), lastUpdate: byId("last-update"),
    engineRpm: byId("engine-rpm"), engineLight: byId("engine-light"), engineGear: byId("engine-gear")
  };

  const state = {
    watchId: null,
    lastTimestamp: null,
    lastSpeedMps: null,
    currentSpeedKph: 0,
    currentAcceleration: 0,
    intervals: [],
    updateCount: 0,
    engine: null
  };
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  function setValue(element, value, tone) {
    element.textContent = value;
    element.classList.remove("value-pass", "value-warn", "value-fail");
    if (tone) element.classList.add(`value-${tone}`);
  }

  function setOverall(label, mode) {
    ui.overall.className = `status-pill status-${mode}`;
    ui.overall.lastElementChild.textContent = label;
  }

  function formatHeading(value) {
    if (value == null || !Number.isFinite(value)) return "Unavailable";
    const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return `${Math.round(value)}° ${directions[Math.round(value / 45) % 8]}`;
  }

  function drivetrainForSpeed(speedKph) {
    const ranges = [
      [0, 22],
      [22, 42],
      [42, 68],
      [68, 98],
      [98, 135],
      [135, 190]
    ];
    if (speedKph < 1.5) return { gear: 1, rpm: 720 };
    let gearIndex = ranges.findIndex((range) => speedKph < range[1]);
    if (gearIndex === -1) gearIndex = ranges.length - 1;
    const [minimum, maximum] = ranges[gearIndex];
    const progress = Math.min(Math.max((speedKph - minimum) / (maximum - minimum), 0), 1);
    const baseRpm = gearIndex === 0 ? 850 : 1250;
    const rpmRange = gearIndex === 0 ? 3850 : 3350;
    return { gear: gearIndex + 1, rpm: Math.round(baseRpm + Math.pow(progress, 0.68) * rpmRange) };
  }

  function updateEngine(speedKph) {
    const drivetrain = drivetrainForSpeed(speedKph);
    const { rpm, gear } = drivetrain;
    const normalizedSpeed = Math.min(Math.max(speedKph, 0) / 180, 1);
    const throttle = Math.min(Math.max(state.currentAcceleration / 2.5, 0), 1);
    ui.engineRpm.textContent = String(rpm);
    ui.engineGear.textContent = `Gear ${gear}`;

    if (!state.engine) return;
    const now = state.engine.context.currentTime;
    const firingFrequency = (rpm / 60) * 4;
    state.engine.exhaustA.frequency.setTargetAtTime(firingFrequency, now, 0.2);
    state.engine.exhaustB.frequency.setTargetAtTime(firingFrequency * 0.997, now, 0.22);
    state.engine.rumble.frequency.setTargetAtTime(firingFrequency * 0.5, now, 0.38);
    state.engine.body.frequency.setTargetAtTime(Math.max(38, firingFrequency * 0.75), now, 0.3);
    state.engine.pulse.frequency.setTargetAtTime(firingFrequency * 0.5, now, 0.2);
    state.engine.filter.frequency.setTargetAtTime(560 + normalizedSpeed * 1850 + throttle * 450, now, 0.28);
    state.engine.noiseFilter.frequency.setTargetAtTime(330 + normalizedSpeed * 1450 + throttle * 300, now, 0.3);
    state.engine.noiseGain.gain.setTargetAtTime(0.042 + normalizedSpeed * 0.05 + throttle * 0.025, now, 0.25);

    const targetGain = 0.42 + normalizedSpeed * 0.08 + throttle * 0.05;
    if (state.engine.gear !== gear) {
      state.engine.master.gain.cancelScheduledValues(now);
      state.engine.master.gain.setValueAtTime(Math.max(state.engine.master.gain.value, 0.0001), now);
      state.engine.master.gain.linearRampToValueAtTime(0.16, now + 0.07);
      state.engine.master.gain.exponentialRampToValueAtTime(targetGain, now + 0.3);
      state.engine.gear = gear;
    } else {
      state.engine.master.gain.setTargetAtTime(targetGain, now, 0.32);
    }
    ui.audioButtonHint.textContent = `${rpm} RPM • Gear ${gear} • ${speedKph.toFixed(1)} km/u`;
  }

  function updateAcceleration(speedMps, elapsedSeconds) {
    if (state.lastSpeedMps == null || speedMps == null || elapsedSeconds <= 0) {
      ui.accelerationLabel.textContent = "Insufficient data";
      ui.accelerationValue.textContent = "— m/s²";
      return;
    }
    const acceleration = (speedMps - state.lastSpeedMps) / elapsedSeconds;
    state.currentAcceleration = acceleration;
    ui.accelerationValue.textContent = `${acceleration >= 0 ? "+" : ""}${acceleration.toFixed(2)} m/s²`;
    ui.accelerationArrow.className = "acceleration-arrow";
    if (acceleration > 0.15) {
      ui.accelerationLabel.textContent = "Accelerating";
      ui.accelerationArrow.textContent = "➜";
      ui.accelerationArrow.classList.add("acceleration-positive");
    } else if (acceleration < -0.15) {
      ui.accelerationLabel.textContent = "Decelerating";
      ui.accelerationArrow.textContent = "➜";
      ui.accelerationArrow.classList.add("acceleration-negative");
    } else {
      ui.accelerationLabel.textContent = "Steady";
      ui.accelerationArrow.textContent = "●";
    }
  }

  function handlePosition(position) {
    const { latitude, longitude, accuracy, speed, heading } = position.coords;
    const timestamp = position.timestamp || Date.now();
    const elapsedMs = state.lastTimestamp == null ? null : timestamp - state.lastTimestamp;
    const validElapsed = elapsedMs != null && elapsedMs > 0;

    state.updateCount += 1;
    ui.updateCount.textContent = String(state.updateCount);
    ui.latitude.textContent = latitude.toFixed(6);
    ui.longitude.textContent = longitude.toFixed(6);
    ui.accuracy.textContent = `${Math.round(accuracy)} m`;
    ui.heading.textContent = formatHeading(heading);
    ui.positionStatus.textContent = "Live";
    ui.updateStatus.textContent = "Receiving";

    if (speed != null && Number.isFinite(speed)) {
      const speedKph = Math.max(0, speed * 3.6);
      state.currentSpeedKph = state.updateCount <= 1 ? speedKph : state.currentSpeedKph * 0.62 + speedKph * 0.38;
      ui.speed.textContent = speedKph.toFixed(1);
      ui.speedStatus.textContent = "Live";
      updateAcceleration(speed, validElapsed ? elapsedMs / 1000 : 0);
      updateEngine(state.currentSpeedKph);
    } else {
      ui.speed.textContent = "—";
      ui.speedStatus.textContent = "Not supplied";
      ui.accelerationLabel.textContent = "Speed unavailable";
    }

    if (validElapsed) {
      state.intervals.push(elapsedMs);
      if (state.intervals.length > 20) state.intervals.shift();
      const averageMs = state.intervals.reduce((sum, item) => sum + item, 0) / state.intervals.length;
      ui.interval.textContent = `${(elapsedMs / 1000).toFixed(2)} s`;
      ui.averageInterval.textContent = `${(averageMs / 1000).toFixed(2)} s`;
      ui.frequency.textContent = `${(1000 / averageMs).toFixed(2)} Hz`;
    }

    state.lastTimestamp = timestamp;
    if (speed != null && Number.isFinite(speed)) state.lastSpeedMps = speed;
    ui.lastUpdate.textContent = `Last GPS update ${new Date(timestamp).toLocaleTimeString()}`;
    setOverall("GPS active", "active");
  }

  function handlePositionError(error) {
    const messages = {
      1: "Location permission denied",
      2: "Position unavailable",
      3: "GPS request timed out"
    };
    const message = messages[error.code] || "GPS error";
    ui.positionStatus.textContent = message;
    ui.updateStatus.textContent = "Stopped";
    setOverall(message, "error");
    if (error.code === 1) setValue(ui.locationPermission, "Denied", "fail");
  }

  function startGps() {
    if (!("geolocation" in navigator)) {
      setOverall("Geolocation unsupported", "error");
      return;
    }
    if (state.watchId !== null) {
      navigator.geolocation.clearWatch(state.watchId);
      state.watchId = null;
      ui.gpsButton.querySelector(".button-label").textContent = "Start GPS test";
      setOverall("GPS stopped", "idle");
      return;
    }
    setOverall("Requesting location…", "idle");
    ui.positionStatus.textContent = "Requesting";
    state.watchId = navigator.geolocation.watchPosition(handlePosition, handlePositionError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000
    });
    ui.gpsButton.querySelector(".button-label").textContent = "Stop GPS test";
  }

  function buildNoiseSource(context) {
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const samples = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < samples.length; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.86 + white * 0.14;
      samples[index] = previous;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  function makeDriveCurve(amount) {
    const samples = 2048;
    const curve = new Float32Array(samples);
    const degrees = Math.PI / 180;
    for (let index = 0; index < samples; index += 1) {
      const input = (index * 2) / samples - 1;
      curve[index] = ((3 + amount) * input * 20 * degrees) / (Math.PI + amount * Math.abs(input));
    }
    return curve;
  }

  async function startEngine() {
    if (!AudioContextClass) {
      setValue(ui.audioApi, "Unsupported", "fail");
      ui.audioButtonHint.textContent = "Web Audio is unavailable";
      return;
    }
    try {
      const context = new AudioContextClass();
      await context.resume();
      const master = context.createGain();
      const compressor = context.createDynamicsCompressor();
      const filter = context.createBiquadFilter();
      const exhaustGain = context.createGain();
      const exhaustBGain = context.createGain();
      const rumbleGain = context.createGain();
      const bodyGain = context.createGain();
      const noiseGain = context.createGain();
      const noiseFilter = context.createBiquadFilter();
      const drive = context.createWaveShaper();
      const exhaustA = context.createOscillator();
      const exhaustB = context.createOscillator();
      const rumble = context.createOscillator();
      const body = context.createOscillator();
      const pulse = context.createOscillator();
      const pulseDepth = context.createGain();
      const noise = buildNoiseSource(context);

      const leftBank = new Float32Array([0, 1, 0.72, 0.48, 0.34, 0.23, 0.16, 0.11, 0.07]);
      const rightBank = new Float32Array([0, 1, 0.52, 0.61, 0.25, 0.29, 0.12, 0.15, 0.06]);
      exhaustA.setPeriodicWave(context.createPeriodicWave(new Float32Array(leftBank.length), leftBank));
      exhaustB.setPeriodicWave(context.createPeriodicWave(new Float32Array(rightBank.length), rightBank));
      rumble.type = "triangle";
      body.type = "sine";
      pulse.type = "square";
      filter.type = "lowpass";
      filter.Q.value = 1.35;
      noiseFilter.type = "bandpass";
      noiseFilter.Q.value = 0.85;
      drive.curve = makeDriveCurve(32);
      drive.oversample = "2x";
      exhaustGain.gain.value = 0.24;
      exhaustBGain.gain.value = 0.17;
      rumbleGain.gain.value = 0.24;
      bodyGain.gain.value = 0.1;
      noiseGain.gain.value = 0.042;
      pulseDepth.gain.value = 0.026;
      master.gain.value = 0.0001;
      compressor.threshold.value = -22;
      compressor.knee.value = 10;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.16;

      exhaustA.connect(exhaustGain).connect(drive);
      exhaustB.connect(exhaustBGain).connect(drive);
      rumble.connect(rumbleGain).connect(drive);
      body.connect(bodyGain).connect(drive);
      drive.connect(filter);
      noise.connect(noiseFilter).connect(noiseGain).connect(filter);
      pulse.connect(pulseDepth).connect(noiseGain.gain);
      filter.connect(compressor).connect(master).connect(context.destination);
      exhaustA.start();
      exhaustB.start();
      rumble.start();
      body.start();
      pulse.start();
      noise.start();

      const startingGear = drivetrainForSpeed(state.currentSpeedKph).gear;
      state.engine = { context, master, filter, exhaustA, exhaustB, rumble, body, pulse, noise, noiseFilter, noiseGain, gear: startingGear };
      updateEngine(state.currentSpeedKph);
      master.gain.setValueAtTime(0.0001, context.currentTime);
      master.gain.exponentialRampToValueAtTime(0.42, context.currentTime + 0.85);
      ui.audioButton.querySelector(".button-label").textContent = "Stop American V8";
      ui.audioButton.classList.add("engine-running");
      ui.engineLight.classList.add("running");
      setValue(ui.audioApi, "V8 running", "pass");
    } catch (error) {
      setValue(ui.audioApi, "Blocked", "fail");
      ui.audioButtonHint.textContent = `Audio failed: ${error.name || "unknown error"}`;
    }
  }

  function stopEngine() {
    if (!state.engine) return;
    const engine = state.engine;
    state.engine = null;
    const now = engine.context.currentTime;
    engine.master.gain.cancelScheduledValues(now);
    engine.master.gain.setTargetAtTime(0.0001, now, 0.08);
    window.setTimeout(() => {
      [engine.exhaustA, engine.exhaustB, engine.rumble, engine.body, engine.pulse, engine.noise].forEach((source) => {
        try { source.stop(); } catch (_) { /* already stopped */ }
      });
      engine.context.close();
    }, 450);
    ui.audioButton.querySelector(".button-label").textContent = "Start American V8";
    ui.audioButtonHint.textContent = "Live GPS speed controls the RPM";
    ui.audioButton.classList.remove("engine-running");
    ui.engineLight.classList.remove("running");
    setValue(ui.audioApi, "Available", "pass");
  }

  function toggleEngine() {
    if (state.engine) {
      stopEngine();
      return;
    }
    if (state.watchId === null) startGps();
    startEngine();
  }

  async function inspectApis() {
    let supported = 0;
    setValue(ui.secureContext, window.isSecureContext ? "Yes" : "No", window.isSecureContext ? "pass" : "fail");
    setValue(ui.geolocationApi, "geolocation" in navigator ? "Available" : "Unavailable", "geolocation" in navigator ? "pass" : "fail");
    setValue(ui.audioApi, AudioContextClass ? "Available" : "Unavailable", AudioContextClass ? "pass" : "fail");
    if (window.isSecureContext) supported += 1;
    if ("geolocation" in navigator) supported += 1;
    if (AudioContextClass) supported += 1;

    if (navigator.permissions && navigator.permissions.query) {
      try {
        const permission = await navigator.permissions.query({ name: "geolocation" });
        const paintPermission = () => setValue(ui.locationPermission, permission.state, permission.state === "denied" ? "fail" : permission.state === "granted" ? "pass" : "warn");
        paintPermission();
        permission.addEventListener("change", paintPermission);
      } catch (_) {
        setValue(ui.locationPermission, "Query unavailable", "warn");
      }
    } else {
      setValue(ui.locationPermission, "API unavailable", "warn");
    }
    ui.apiSummary.textContent = `${supported}/3 core checks pass`;
    ui.browserDetails.textContent = `${navigator.userAgent}\nPlatform: ${navigator.platform || "Unknown"}\nLanguage: ${navigator.language || "Unknown"}\nScreen: ${screen.width} × ${screen.height} @ ${window.devicePixelRatio || 1}x`;
  }

  ui.gpsButton.addEventListener("click", startGps);
  ui.audioButton.addEventListener("click", toggleEngine);
  inspectApis();
})();
