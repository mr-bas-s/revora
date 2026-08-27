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
    browserDetails: byId("browser-details"), lastUpdate: byId("last-update")
  };

  const state = { watchId: null, lastTimestamp: null, lastSpeedMps: null, intervals: [], updateCount: 0 };
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

  function updateAcceleration(speedMps, elapsedSeconds) {
    if (state.lastSpeedMps == null || speedMps == null || elapsedSeconds <= 0) {
      ui.accelerationLabel.textContent = "Insufficient data";
      ui.accelerationValue.textContent = "— m/s²";
      return;
    }
    const acceleration = (speedMps - state.lastSpeedMps) / elapsedSeconds;
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
      ui.speed.textContent = Math.max(0, speed * 3.6).toFixed(1);
      ui.speedStatus.textContent = "Live";
      updateAcceleration(speed, validElapsed ? elapsedMs / 1000 : 0);
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

  async function testAudio() {
    if (!AudioContextClass) {
      setValue(ui.audioApi, "Unsupported", "fail");
      ui.audioButtonHint.textContent = "Web Audio is unavailable";
      return;
    }
    try {
      const context = new AudioContextClass();
      await context.resume();
      const gain = context.createGain();
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(220, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(440, context.currentTime + 0.45);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.22, context.currentTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.65);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.7);
      oscillator.addEventListener("ended", () => context.close());
      setValue(ui.audioApi, "Working", "pass");
      ui.audioButtonHint.textContent = "Tone played successfully";
    } catch (error) {
      setValue(ui.audioApi, "Blocked", "fail");
      ui.audioButtonHint.textContent = `Audio failed: ${error.name || "unknown error"}`;
    }
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
  ui.audioButton.addEventListener("click", testAudio);
  inspectApis();
})();
