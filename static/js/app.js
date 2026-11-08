/**
 * SentinelVision AI - Real-Time Face & Eye Monitoring Client Script
 * Handles WebSocket telemetry, Web Audio API synthesis, UI animations, and REST controls.
 */

class SentinelVisionApp {
    constructor() {
        this.ws = null;
        this.reconnectTimer = null;
        this.audioCtx = null;
        this.isAudioSynthActive = false;
        this.synthOscillator = null;
        this.synthGain = null;
        this.synthLfo = null;
        this.audioMuted = false;

        this.isMonitoring = false;
        this.uptimeSeconds = 0;
        this.uptimeTimer = null;

        this.initDOMElements();
        this.initEventListeners();
        this.initAudioContext();
        this.connectWebSocket();
        this.fetchSettings();
        this.fetchHistory();

        // Periodically refresh history
        setInterval(() => this.fetchHistory(), 3000);

        // Auto-connect to camera once DOM is settled
        setTimeout(() => {
            if (!currentCameraStream && !isCameraStarting) {
                this.startCameraDirectly();
            }
        }, 300);
    }

    initDOMElements() {
        // Controls
        this.btnStart = document.getElementById('btnStartMonitoring');
        this.btnStop = document.getElementById('btnStopMonitoring');
        this.btnTestAlarm = document.getElementById('btnTestAlarm');
        this.btnMuteToggle = document.getElementById('btnMuteToggle');
        this.muteIcon = document.getElementById('muteIcon');
        this.btnOpenSettings = document.getElementById('btnOpenSettings');
        this.btnCloseSettings = document.getElementById('btnCloseSettings');
        this.btnSaveSettings = document.getElementById('btnSaveSettings');
        this.btnResetSettings = document.getElementById('btnResetSettings');
        this.btnExportCsv = document.getElementById('btnExportCsv');
        this.btnClearHistory = document.getElementById('btnClearHistory');
        this.btnDismissAlert = document.getElementById('btnDismissAlert');
        this.cameraSelect = document.getElementById('cameraSelect');

        // Camera Setup Elements
        this.cameraSetupOverlay = document.getElementById('cameraSetupOverlay');
        this.cameraSetupDropdown = document.getElementById('cameraSetupDropdown');
        this.btnConnectCamera = document.getElementById('btnConnectCamera');
        this.btnSwitchCamGuide = document.getElementById('btnSwitchCamGuide');
        this.localWebcamVideo = document.getElementById('localWebcamVideo');
        this.hudCanvas = document.getElementById('hudCanvas');

        // Status Elements
        this.globalStatusPill = document.getElementById('globalStatusPill');
        this.globalStatusText = document.getElementById('globalStatusText');
        this.sessionTimer = document.getElementById('sessionTimer');
        this.engineStateLabel = document.getElementById('engineStateLabel');
        this.fpsBadge = document.getElementById('fpsBadge');
        this.webcamStream = document.getElementById('webcamStream');
        this.hudFaceTag = document.getElementById('hudFaceTag');

        // Cards & Gauges
        this.eyeStatusVal = document.getElementById('eyeStatusVal');
        this.eyeDurationTag = document.getElementById('eyeDurationTag');
        this.earValueText = document.getElementById('earValueText');
        this.earGaugeFill = document.getElementById('earGaugeFill');
        this.earThresholdMarker = document.getElementById('earThresholdMarker');

        this.faceStatusVal = document.getElementById('faceStatusVal');
        this.faceDurationTag = document.getElementById('faceDurationTag');
        this.faceStateBadge = document.getElementById('faceStateBadge');

        this.alarmStatusVal = document.getElementById('alarmStatusVal');
        this.audioStatusTag = document.getElementById('audioStatusTag');
        this.alarmStateBadge = document.getElementById('alarmStateBadge');

        // Overlays
        this.alarmStrobe = document.getElementById('alarmStrobe');
        this.criticalAlertBanner = document.getElementById('criticalAlertBanner');
        this.alertTitle = document.getElementById('alertTitle');
        this.alertMessage = document.getElementById('alertMessage');

        // KPIs
        this.kpiBlinkCount = document.getElementById('kpiBlinkCount');
        this.kpiEyeClosedIncidents = document.getElementById('kpiEyeClosedIncidents');
        this.kpiFaceCoveredIncidents = document.getElementById('kpiFaceCoveredIncidents');
        this.kpiPersonAbsentIncidents = document.getElementById('kpiPersonAbsentIncidents');
        this.incidentCounterBadge = document.getElementById('incidentCounterBadge');

        // Table
        this.historyTableBody = document.getElementById('historyTableBody');

        // Modal
        this.settingsModal = document.getElementById('settingsModal');
        this.cfgEarThreshold = document.getElementById('cfgEarThreshold');
        this.valEarThreshold = document.getElementById('valEarThreshold');
        this.cfgEyeClosedDuration = document.getElementById('cfgEyeClosedDuration');
        this.valEyeClosedDuration = document.getElementById('valEyeClosedDuration');
        this.cfgFaceHiddenDuration = document.getElementById('cfgFaceHiddenDuration');
        this.valFaceHiddenDuration = document.getElementById('valFaceHiddenDuration');
        this.cfgPersonAbsentDuration = document.getElementById('cfgPersonAbsentDuration');
        this.valPersonAbsentDuration = document.getElementById('valPersonAbsentDuration');
        this.cfgAlarmVolume = document.getElementById('cfgAlarmVolume');
        this.valAlarmVolume = document.getElementById('valAlarmVolume');
        this.cfgAlarmEnabled = document.getElementById('cfgAlarmEnabled');
        this.cfgAutoSilence = document.getElementById('cfgAutoSilence');
    }

    initEventListeners() {
        this.btnStart.addEventListener('click', async () => {
            if (!currentCameraStream) {
                await this.startCameraDirectly();
            }
            this.startMonitoring();
        });
        this.btnStop.addEventListener('click', () => this.stopMonitoring());
        this.btnTestAlarm.addEventListener('click', () => this.testAlarm());
        this.btnMuteToggle.addEventListener('click', () => this.toggleMute());
        this.btnOpenSettings.addEventListener('click', () => this.openSettings());
        this.btnCloseSettings.addEventListener('click', () => this.closeSettings());
        this.btnSaveSettings.addEventListener('click', () => this.saveSettings());
        this.btnResetSettings.addEventListener('click', () => this.resetSettings());
        this.btnExportCsv.addEventListener('click', () => this.exportCsv());
        this.btnClearHistory.addEventListener('click', () => this.clearHistory());
        this.btnDismissAlert.addEventListener('click', () => this.dismissAlertBanner());

        // Camera Connect Button in Overlay
        if (this.btnConnectCamera) {
            this.btnConnectCamera.addEventListener('click', () => {
                const devId = (this.cameraSetupDropdown && this.cameraSetupDropdown.value) || 
                              (this.cameraSelect && this.cameraSelect.value) || 'default';
                this.startCameraDirectly(devId);
            });
        }

        // Click on video container to start camera if not running
        const videoCont = document.getElementById('videoContainer');
        if (videoCont) {
            videoCont.addEventListener('click', (e) => {
                if (e.target.tagName !== 'SELECT' && e.target.tagName !== 'BUTTON' && !currentCameraStream) {
                    this.startCameraDirectly();
                }
            });
        }

        // Change Camera Button / Overlay Toggle
        if (this.btnSwitchCamGuide) {
            this.btnSwitchCamGuide.addEventListener('click', () => {
                if (this.cameraSetupOverlay) {
                    this.cameraSetupOverlay.classList.toggle('hidden');
                }
            });
        }

        // Camera dropdown change handlers
        if (this.cameraSelect) {
            this.cameraSelect.addEventListener('change', () => {
                const devId = this.cameraSelect.value;
                if (this.cameraSetupDropdown) this.cameraSetupDropdown.value = devId;
                this.startCameraDirectly(devId);
            });
        }
        if (this.cameraSetupDropdown) {
            this.cameraSetupDropdown.addEventListener('change', () => {
                const devId = this.cameraSetupDropdown.value;
                if (this.cameraSelect) this.cameraSelect.value = devId;
                this.startCameraDirectly(devId);
            });
        }

        // Range input live updates
        this.cfgEarThreshold.addEventListener('input', (e) => this.valEarThreshold.textContent = parseFloat(e.target.value).toFixed(2));
        this.cfgEyeClosedDuration.addEventListener('input', (e) => this.valEyeClosedDuration.textContent = parseFloat(e.target.value).toFixed(1) + 's');
        this.cfgFaceHiddenDuration.addEventListener('input', (e) => this.valFaceHiddenDuration.textContent = parseFloat(e.target.value).toFixed(1) + 's');
        this.cfgPersonAbsentDuration.addEventListener('input', (e) => this.valPersonAbsentDuration.textContent = parseFloat(e.target.value).toFixed(1) + 's');
        this.cfgAlarmVolume.addEventListener('input', (e) => this.valAlarmVolume.textContent = e.target.value + '%');

        // Space shortcut to toggle monitoring
        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
            if (e.code === 'Space') {
                e.preventDefault();
                if (this.isMonitoring) this.stopMonitoring();
                else this.startMonitoring();
            }
        });

        // User interaction unlocks Web Audio API
        document.addEventListener('click', () => {
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }
        }, { once: true });
    }

    initAudioContext() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioCtx = new AudioContext();
        } catch (e) {
            console.warn("[Audio] Web Audio API not supported in this browser:", e);
        }
    }

    async startCameraDirectly(preferredDeviceId = null) {
        if (isCameraStarting) return;
        if (currentCameraStream && currentCameraStream.active && !preferredDeviceId) {
            return;
        }
        isCameraStarting = true;

        console.log("[Camera] Direct camera startup triggered. Target:", preferredDeviceId);
        const video = this.localWebcamVideo || document.getElementById('localWebcamVideo');
        const canvas = this.hudCanvas || document.getElementById('hudCanvas');
        const overlay = this.cameraSetupOverlay || document.getElementById('cameraSetupOverlay');
        const img = this.webcamStream || document.getElementById('webcamStream');
        const setupTitle = document.getElementById('cameraSetupTitle');
        const setupDesc = document.getElementById('cameraSetupDesc');

        if (!video || !canvas) {
            isCameraStarting = false;
            return;
        }

        if (img) img.classList.add('hidden');
        video.classList.remove('hidden');
        canvas.classList.remove('hidden');

        if (currentCameraStream) {
            try {
                currentCameraStream.getTracks().forEach(t => t.stop());
            } catch (e) {}
            currentCameraStream = null;
        }

        if (setupTitle) setupTitle.textContent = "Connecting Camera...";
        if (setupDesc) setupDesc.textContent = "Searching for Iriun Webcam feed...";

        let stream = null;
        try {
            // First try with specific deviceId if selected
            let targetId = preferredDeviceId;
            if (!targetId || targetId === 'default') {
                if (this.cameraSelect && this.cameraSelect.value !== 'default') {
                    targetId = this.cameraSelect.value;
                }
            }

            const videoConstraint = (targetId && targetId !== 'default')
                ? { deviceId: { ideal: targetId }, width: { ideal: 1280 }, height: { ideal: 720 } }
                : { width: { ideal: 1280 }, height: { ideal: 720 } };

            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraint });
            } catch (e1) {
                console.warn("[Camera] Constraint request failed, fallback to video: true", e1);
                stream = await navigator.mediaDevices.getUserMedia({ video: true });
            }

            // Populate device dropdowns
            try {
                const devs = await navigator.mediaDevices.enumerateDevices();
                const vDevs = devs.filter(d => d.kind === 'videoinput');
                this.populateCameraDropdowns(vDevs);
            } catch (e2) {
                console.warn("[Camera] Device enumeration notice:", e2);
            }

            currentCameraStream = stream;
            video.muted = true;
            video.playsInline = true;
            video.setAttribute('muted', '');
            video.setAttribute('playsinline', '');
            video.srcObject = stream;

            video.onloadedmetadata = () => {
                video.play().catch(() => {});
                if (overlay) overlay.classList.add('hidden');
            };
            try {
                await video.play();
            } catch (playErr) {
                console.warn("[Camera] Play awaited error, waiting for metadata:", playErr);
            }

            if (overlay) overlay.classList.add('hidden');
            console.log("[Camera] Video playback active!");

            startClientVisionPipeline(video, canvas);
        } catch (err) {
            console.error("[Camera] Camera access error:", err);
            if (overlay) overlay.classList.remove('hidden');
            if (setupTitle) {
                setupTitle.textContent = (err.name === 'NotAllowedError') 
                    ? "Camera Permission Denied" 
                    : "Unable to Access Camera";
            }
            if (setupDesc) {
                setupDesc.textContent = (err.name === 'NotAllowedError')
                    ? "Please click the Camera / Lock icon in your address bar and set permission to 'Allow'."
                    : "Confirm your phone is connected inside the Iriun PC app, then click Connect.";
            }
        } finally {
            isCameraStarting = false;
        }
    }

    populateCameraDropdowns(videoDevices) {
        const updateDrop = (selectEl) => {
            if (!selectEl) return;
            const currentVal = selectEl.value;
            selectEl.innerHTML = '';
            if (!videoDevices || videoDevices.length === 0) {
                const opt = document.createElement('option');
                opt.value = 'default';
                opt.textContent = 'Default Camera';
                selectEl.appendChild(opt);
                return;
            }
            let iriunId = null;
            videoDevices.forEach((dev, idx) => {
                const opt = document.createElement('option');
                opt.value = dev.deviceId;
                opt.textContent = dev.label || `Camera ${idx + 1}`;
                if (opt.textContent.toLowerCase().includes('iriun')) {
                    iriunId = dev.deviceId;
                }
                selectEl.appendChild(opt);
            });
            if (iriunId) {
                selectEl.value = iriunId;
            } else if (currentVal && selectEl.querySelector(`option[value="${currentVal}"]`)) {
                selectEl.value = currentVal;
            }
        };
        updateDrop(this.cameraSelect);
        updateDrop(this.cameraSetupDropdown || document.getElementById('cameraSetupDropdown'));
    }

    /* Web Audio API Siren Synthesizer */
    startWebAudioSiren() {
        if (!this.audioCtx || this.isAudioSynthActive || this.audioMuted) return;

        try {
            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }

            this.isAudioSynthActive = true;
            const now = this.audioCtx.currentTime;

            // Main Carrier Oscillator
            this.synthOscillator = this.audioCtx.createOscillator();
            this.synthOscillator.type = 'sawtooth';
            this.synthOscillator.frequency.setValueAtTime(800, now);

            // Modulation LFO for Siren Sweep (from 700Hz to 1400Hz)
            this.synthLfo = this.audioCtx.createOscillator();
            this.synthLfo.frequency.setValueAtTime(3.5, now); // 3.5 sweeps per second

            const lfoGain = this.audioCtx.createGain();
            lfoGain.gain.setValueAtTime(450, now);

            this.synthLfo.connect(lfoGain);
            lfoGain.connect(this.synthOscillator.frequency);

            // Master Gain & Volume
            this.synthGain = this.audioCtx.createGain();
            const vol = (parseInt(this.cfgAlarmVolume.value) || 85) / 100 * 0.35;
            this.synthGain.gain.setValueAtTime(vol, now);

            this.synthOscillator.connect(this.synthGain);
            this.synthGain.connect(this.audioCtx.destination);

            this.synthLfo.start();
            this.synthOscillator.start();
        } catch (e) {
            console.warn("[Audio] Error starting Web Audio siren:", e);
        }
    }

    stopWebAudioSiren() {
        if (!this.isAudioSynthActive) return;

        try {
            if (this.synthOscillator) {
                this.synthOscillator.stop();
                this.synthOscillator.disconnect();
            }
            if (this.synthLfo) {
                this.synthLfo.stop();
                this.synthLfo.disconnect();
            }
            if (this.synthGain) {
                this.synthGain.disconnect();
            }
        } catch (e) {
            // Ignore stop errors
        } finally {
            this.isAudioSynthActive = false;
            this.synthOscillator = null;
            this.synthLfo = null;
            this.synthGain = null;
        }
    }

    playShortBeep(freq = 1100, duration = 0.2) {
        if (!this.audioCtx || this.audioMuted) return;
        try {
            if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

            gain.gain.setValueAtTime(0.25, this.audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);

            osc.connect(gain);
            gain.connect(this.audioCtx.destination);

            osc.start();
            osc.stop(this.audioCtx.currentTime + duration);
        } catch (e) {}
    }

    /* WebSocket Telemetry Connection with HTTP Polling Fallback */
    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        try {
            this.ws = new WebSocket(wsUrl);
            this.ws.onopen = () => {
                console.log("[WebSocket] Telemetry pipeline connected.");
                if (this.pollingTimer) {
                    clearInterval(this.pollingTimer);
                    this.pollingTimer = null;
                }
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleTelemetry(data);
                } catch (err) {
                    console.error("[WebSocket] Parse error:", err);
                }
            };

            this.ws.onclose = () => {
                this.startHttpPolling();
            };

            this.ws.onerror = () => {
                this.startHttpPolling();
            };
        } catch (e) {
            this.startHttpPolling();
        }
    }

    startHttpPolling() {
        if (this.pollingTimer) return;
        this.pollingTimer = setInterval(async () => {
            try {
                const res = await fetch('/api/status');
                if (res.ok) {
                    const data = await res.json();
                    this.backendOnline = true;
                    this.handleTelemetry(data);
                } else {
                    this.backendOnline = false;
                }
            } catch (e) {
                this.backendOnline = false;
            }
        }, 80);
    }

    handleTelemetry(t) {
        // 1. Update Global State & Buttons
        this.isMonitoring = t.is_monitoring;
        if (t.is_monitoring) {
            this.btnStart.disabled = true;
            this.btnStop.disabled = false;
            this.engineStateLabel.textContent = "ACTIVE";
            this.engineStateLabel.className = "state-active";

            this.globalStatusPill.querySelector('.status-dot').className = 
                t.alarm_state === "ACTIVE_ALARM" ? "status-dot alert" : "status-dot active";
            this.globalStatusText.textContent = 
                t.alarm_state === "ACTIVE_ALARM" ? "THREAT DETECTED" : "MONITORING ACTIVE";
        } else {
            this.btnStart.disabled = false;
            this.btnStop.disabled = true;
            this.engineStateLabel.textContent = "STANDBY";
            this.engineStateLabel.className = "state-inactive";

            this.globalStatusPill.querySelector('.status-dot').className = "status-dot standby";
            this.globalStatusText.textContent = "SYSTEM STANDBY";
        }

        // 2. FPS & Clock
        this.fpsBadge.innerHTML = `<i class="fa-solid fa-gauge-high"></i> ${t.fps.toFixed(1)} FPS`;
        this.updateSessionClock(t.session_uptime);

        // 3. Eye Status Card & EAR Gauge
        this.eyeStatusVal.textContent = t.eye_status;
        this.eyeStatusVal.className = "status-main-val " + (t.eye_status === "OPEN" ? "status-val-open" : "status-val-closed");
        this.eyeDurationTag.textContent = t.eyes_closed_timer > 0 ? `Closed: ${t.eyes_closed_timer.toFixed(1)}s / ${(t.eye_closed_limit || 1.0).toFixed(1)}s` : `Duration: 0.0s`;

        this.earValueText.textContent = t.current_ear.toFixed(3);
        const earPct = Math.min(100, Math.max(0, (t.current_ear / 0.45) * 100));
        this.earGaugeFill.style.width = `${earPct}%`;

        // Position threshold pin
        const threshPct = Math.min(100, Math.max(0, (t.ear_threshold / 0.45) * 100));
        this.earThresholdMarker.style.left = `${threshPct}%`;

        // 4. Face/Eye Status Card
        this.faceStatusVal.textContent = t.face_status;
        if (t.face_status === "DETECTED") {
            this.faceStatusVal.className = "status-main-val status-val-detected";
            this.faceStateBadge.innerHTML = `<i class="fa-solid fa-eye"></i> Eyes Visible`;
            this.faceDurationTag.textContent = `Duration: 0.0s`;
            this.hudFaceTag.textContent = t.eye_status === "CLOSED" ? "CRITICAL: EYES CLOSED" : "EYES TRACKED & OPEN";
            this.hudFaceTag.style.borderColor = t.eye_status === "CLOSED" ? "var(--color-crimson)" : "var(--color-emerald)";
            this.hudFaceTag.style.color = t.eye_status === "CLOSED" ? "var(--color-crimson)" : "var(--color-emerald)";
        } else if (t.face_status === "HIDDEN") {
            this.faceStatusVal.className = "status-main-val status-val-hidden";
            this.faceStateBadge.innerHTML = `<i class="fa-solid fa-hand"></i> Obstructed`;
            this.faceDurationTag.textContent = `Hidden: ${t.face_hidden_timer.toFixed(1)}s / ${(t.face_hidden_limit || 1.0).toFixed(1)}s`;
            this.hudFaceTag.textContent = "EYES OBSTRUCTED / COVERED";
            this.hudFaceTag.style.borderColor = "var(--color-amber)";
            this.hudFaceTag.style.color = "var(--color-amber)";
        } else {
            this.faceStatusVal.className = "status-main-val status-val-absent";
            this.faceStateBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Absent`;
            this.faceDurationTag.textContent = `Absent: ${t.person_absent_timer.toFixed(1)}s / ${(t.person_absent_limit || 1.0).toFixed(1)}s`;
            this.hudFaceTag.textContent = "NO EYES DETECTED";
            this.hudFaceTag.style.borderColor = "var(--color-crimson)";
            this.hudFaceTag.style.color = "var(--color-crimson)";
        }

        // 5. Alarm System Card & Warning Strobe
        const isAlarming = (t.alarm_state === "ACTIVE_ALARM");
        this.alarmStatusVal.textContent = isAlarming ? "ALERTING" : "NORMAL";
        this.alarmStatusVal.className = "status-main-val " + (isAlarming ? "status-val-alarm" : "status-val-normal");

        if (isAlarming) {
            this.alarmStrobe.classList.remove('hidden');
            this.criticalAlertBanner.classList.remove('hidden');
            this.alertTitle.textContent = "CRITICAL DETECTION ALERT";
            this.alertMessage.textContent = t.warning_message || "Abnormal face/eye condition active.";
            this.alarmStateBadge.innerHTML = `<i class="fa-solid fa-bell"></i> SIREN ACTIVE`;
            this.alarmStateBadge.style.color = "var(--color-crimson)";

            // Trigger Browser Web Audio Siren (Layer 2 Audio)
            this.startWebAudioSiren();
        } else {
            this.alarmStrobe.classList.add('hidden');
            this.criticalAlertBanner.classList.add('hidden');
            this.alarmStateBadge.innerHTML = `<i class="fa-solid fa-lock"></i> No Threats`;
            this.alarmStateBadge.style.color = "var(--text-secondary)";

            this.stopWebAudioSiren();
        }

        // 6. KPIs
        this.kpiBlinkCount.textContent = t.blink_count;
        this.kpiEyeClosedIncidents.textContent = t.eye_closed_incidents;
        this.kpiFaceCoveredIncidents.textContent = t.face_covered_incidents;
        this.kpiPersonAbsentIncidents.textContent = t.person_absent_incidents;
        this.incidentCounterBadge.textContent = `${t.total_incidents} Total`;
    }

    updateSessionClock(seconds) {
        const sec = Math.floor(seconds || 0);
        const hrs = String(Math.floor(sec / 3600)).padStart(2, '0');
        const mins = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
        const s = String(sec % 60).padStart(2, '0');
        this.sessionTimer.textContent = `${hrs}:${mins}:${s}`;
    }

    /* REST API Calls with Standalone Web App Fallback */
    async startMonitoring() {
        this.isMonitoring = true;
        this.btnStart.disabled = true;
        this.btnStop.disabled = false;
        this.playShortBeep(880, 0.15);
        if (this.uptimeTimer) clearInterval(this.uptimeTimer);
        this.uptimeSeconds = 0;
        this.uptimeTimer = setInterval(() => { this.uptimeSeconds++; }, 1000);

        try {
            await fetch('/api/monitor/start', { method: 'POST' });
        } catch (e) {}
    }

    async stopMonitoring() {
        this.isMonitoring = false;
        this.btnStart.disabled = false;
        this.btnStop.disabled = true;
        this.stopWebAudioSiren();
        this.playShortBeep(440, 0.15);
        if (this.uptimeTimer) { clearInterval(this.uptimeTimer); this.uptimeTimer = null; }

        try {
            await fetch('/api/monitor/stop', { method: 'POST' });
        } catch (e) {}
    }

    async testAlarm() {
        this.playShortBeep(1200, 0.3);
        try {
            await fetch('/api/alarm/test', { method: 'POST' });
        } catch (e) {}
    }

    async toggleMute() {
        this.audioMuted = !this.audioMuted;
        if (this.audioMuted) {
            this.muteIcon.className = "fa-solid fa-volume-xmark";
            this.btnMuteToggle.style.color = "var(--color-crimson)";
            this.stopWebAudioSiren();
        } else {
            this.muteIcon.className = "fa-solid fa-volume-high";
            this.btnMuteToggle.style.color = "var(--text-primary)";
        }
        try {
            await fetch('/api/alarm/mute_toggle', { method: 'POST' });
        } catch (e) {}
    }

    dismissAlertBanner() {
        this.criticalAlertBanner.classList.add('hidden');
    }

    async fetchHistory() {
        try {
            const res = await fetch('/api/history?limit=40');
            const data = await res.json();
            this.renderHistoryTable(data.incidents || []);
        } catch (e) {}
    }

    renderHistoryTable(incidents) {
        if (!incidents || incidents.length === 0) {
            this.historyTableBody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="6">
                        <div class="empty-state">
                            <i class="fa-regular fa-circle-check"></i>
                            <p>No abnormal detection incidents recorded yet. System monitoring normal.</p>
                        </div>
                    </td>
                </tr>`;
            return;
        }

        let html = "";
        for (const r of incidents) {
            const badgeClass = r.severity === 'Critical' ? 'badge-critical' : 'badge-high';
            html += `
                <tr>
                    <td><strong>#${r.id}</strong></td>
                    <td>${r.timestamp}</td>
                    <td><strong>${r.type}</strong></td>
                    <td><span class="${badgeClass}">${r.severity}</span></td>
                    <td>${r.duration.toFixed(1)}s</td>
                    <td>${r.details}</td>
                </tr>`;
        }
        this.historyTableBody.innerHTML = html;
    }

    async clearHistory() {
        if (!confirm("Are you sure you want to clear the detection history log?")) return;
        try {
            await fetch('/api/history/clear', { method: 'POST' });
            this.fetchHistory();
        } catch (e) {}
    }

    exportCsv() {
        window.location.href = '/api/history/export_csv';
    }

    /* Settings Modal */
    async fetchSettings() {
        try {
            const res = await fetch('/api/settings');
            const cfg = await res.json();

            this.cfgEarThreshold.value = cfg.ear_threshold;
            this.valEarThreshold.textContent = cfg.ear_threshold.toFixed(2);

            this.cfgEyeClosedDuration.value = cfg.eye_closed_time_sec;
            this.valEyeClosedDuration.textContent = cfg.eye_closed_time_sec.toFixed(1) + 's';

            this.cfgFaceHiddenDuration.value = cfg.face_hidden_time_sec;
            this.valFaceHiddenDuration.textContent = cfg.face_hidden_time_sec.toFixed(1) + 's';

            this.cfgPersonAbsentDuration.value = cfg.person_absent_time_sec;
            this.valPersonAbsentDuration.textContent = cfg.person_absent_time_sec.toFixed(1) + 's';

            this.cfgAlarmVolume.value = Math.round(cfg.alarm_volume * 100);
            this.valAlarmVolume.textContent = Math.round(cfg.alarm_volume * 100) + '%';

            this.cfgAlarmEnabled.checked = cfg.alarm_enabled;
            this.cfgAutoSilence.checked = cfg.auto_silence_on_recovery;
        } catch (e) {}
    }

    openSettings() {
        this.fetchSettings();
        this.settingsModal.classList.remove('hidden');
    }

    closeSettings() {
        this.settingsModal.classList.add('hidden');
    }

    async saveSettings() {
        const payload = {
            ear_threshold: parseFloat(this.cfgEarThreshold.value),
            eye_closed_time_sec: parseFloat(this.cfgEyeClosedDuration.value),
            face_hidden_time_sec: parseFloat(this.cfgFaceHiddenDuration.value),
            person_absent_time_sec: parseFloat(this.cfgPersonAbsentDuration.value),
            alarm_volume: parseFloat(this.cfgAlarmVolume.value) / 100.0,
            alarm_enabled: this.cfgAlarmEnabled.checked,
            auto_silence_on_recovery: this.cfgAutoSilence.checked
        };

        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                this.closeSettings();
                this.playShortBeep(1000, 0.15);
            }
        } catch (e) {
            alert("Error saving settings.");
        }
    }

    resetSettings() {
        this.cfgEarThreshold.value = 0.22;
        this.valEarThreshold.textContent = "0.22";
        this.cfgEyeClosedDuration.value = 1.0;
        this.valEyeClosedDuration.textContent = "1.0s";
        this.cfgFaceHiddenDuration.value = 1.0;
        this.valFaceHiddenDuration.textContent = "1.0s";
        this.cfgPersonAbsentDuration.value = 1.0;
        this.valPersonAbsentDuration.textContent = "1.0s";
        this.cfgAlarmVolume.value = 85;
        this.valAlarmVolume.textContent = "85%";
        this.cfgAlarmEnabled.checked = true;
        this.cfgAutoSilence.checked = true;
    }
}

// Global stream error handler - switches to HTML5 direct webcam capture for C++ Engine
let directCameraActive = false;
let currentCameraStream = null;
let userManuallyOpenedOverlay = false;
let isCameraStarting = false;

window.switchDirectCamera = function(deviceId) {
    if (window.app && window.app.startCameraDirectly) {
        window.app.startCameraDirectly(deviceId);
    }
};

function handleStreamError(img) {
    if (img) img.classList.add('hidden');
    const video = document.getElementById('localWebcamVideo');
    const canvas = document.getElementById('hudCanvas');
    if (video) video.classList.remove('hidden');
    if (canvas) canvas.classList.remove('hidden');

    if (!isCameraStarting && !currentCameraStream) {
        if (window.app && window.app.startCameraDirectly) {
            window.app.startCameraDirectly();
        } else {
            setTimeout(() => {
                if (!isCameraStarting && !currentCameraStream && window.app && window.app.startCameraDirectly) {
                    window.app.startCameraDirectly();
                }
            }, 150);
        }
    }
}

// Client-side Vision Analytics & Dual-Engine (MediaPipe FaceMesh + High-Speed Optical Face & Eye Tracker)
let clientVisionPipelineRunning = false;

function startClientVisionPipeline(video, canvas) {
    if (clientVisionPipelineRunning) return;
    clientVisionPipelineRunning = true;
    const ctx = canvas.getContext('2d');
    let lastTime = performance.now();
    let frameCounter = 0;
    let fps = 30.0;
    let localEar = 0.32;
    let lastFaceSeenTick = 0;
    let consecutiveFaceFrames = 0;

    // High-Performance Offscreen Analysis Buffer (320x180, hardware CPU-read optimized)
    const offW = 320;
    const offH = 180;
    const offCanvas = document.createElement('canvas');
    offCanvas.width = offW;
    offCanvas.height = offH;
    const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });

    let lastAnalysisTick = 0;
    let lastMpSentTick = 0;
    let faceDetected = false;
    let faceCovered = false;
    let computedEAR = 0.32;
    let eyePoints = [];
    let isIlluminated = true;

    // MediaPipe FaceMesh state
    let mpFaceMesh = null;
    let lastMpLandmarks = null;
    let lastMpSuccessTick = 0;
    let isMpBusy = false;

    // Initialize MediaPipe FaceMesh if CDN loaded
    if (window.FaceMesh) {
        try {
            mpFaceMesh = new window.FaceMesh({
                locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
            });
            mpFaceMesh.setOptions({
                maxNumFaces: 1,
                refineLandmarks: true,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });
            mpFaceMesh.onResults((results) => {
                if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
                    lastMpLandmarks = results.multiFaceLandmarks[0];
                    lastMpSuccessTick = performance.now();
                } else {
                    lastMpLandmarks = null;
                }
            });
            console.log("[VisionEngine] Neural FaceMesh engine active.");
        } catch (e) {
            console.warn("[VisionEngine] FaceMesh init error:", e);
        }
    }

    let lastTelemetryPostTick = 0;

    function processFrame() {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
            // 1. Only reallocate canvas when video resolution actually changes (avoids frame stutter)
            if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
            }
            const w = canvas.width;
            const h = canvas.height;

            // 2. Hardware-accelerated GPU render (Mirrored, 60 FPS buttery smooth)
            ctx.save();
            ctx.scale(-1, 1);
            ctx.drawImage(video, -w, 0, w, h);
            ctx.restore();

            frameCounter++;
            const now = performance.now();
            if (now - lastTime >= 500) {
                fps = (frameCounter * 1000) / (now - lastTime);
                frameCounter = 0;
                lastTime = now;
            }

            // 3. High-Speed Decoupled Vision Analysis (runs at ~28 FPS in lightweight 320x180 buffer)
            if (now - lastAnalysisTick >= 35) {
                lastAnalysisTick = now;

                // Downsample frame to offscreen buffer
                offCtx.drawImage(video, 0, 0, offW, offH);

                // Throttle MediaPipe neural calls to ~15 FPS to keep CPU cool
                if (mpFaceMesh && !isMpBusy && video.readyState >= 2 && (now - lastMpSentTick >= 65)) {
                    isMpBusy = true;
                    lastMpSentTick = now;
                    mpFaceMesh.send({ image: video })
                        .catch(() => {})
                        .finally(() => { isMpBusy = false; });
                }

                // -------------------------------------------------------------
                // TIER 1: MediaPipe 3D Neural FaceMesh
                // -------------------------------------------------------------
                const isMpActive = (now - lastMpSuccessTick < 400 && lastMpLandmarks !== null);
                if (isMpActive) {
                    const lm = lastMpLandmarks;
                    // Mirroring x so reticle matches mirrored video
                    const p = (idx) => ({ x: (1.0 - lm[idx].x) * w, y: lm[idx].y * h });
                    const dist = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);

                    const lA = dist(p(160), p(144));
                    const lB = dist(p(158), p(153));
                    const lC = dist(p(33), p(133));
                    const leftEAR = (lA + lB) / (2.0 * Math.max(1.0, lC));

                    const rA = dist(p(385), p(380));
                    const rB = dist(p(387), p(373));
                    const rC = dist(p(362), p(263));
                    const rightEAR = (rA + rB) / (2.0 * Math.max(1.0, rC));

                    computedEAR = (leftEAR + rightEAR) / 2.0;
                    eyePoints = [p(159), p(386)];
                    faceDetected = true;
                    faceCovered = false;
                } else {
                    // -------------------------------------------------------------
                    // TIER 2: Ultra-Fast Optical Face & Eye Analyzer on 320x180 buffer
                    // -------------------------------------------------------------
                    const imgData = offCtx.getImageData(0, 0, offW, offH);
                    const data = imgData.data;

                    let skinPixelCount = 0;
                    let totalSampled = 0;
                    let sumLum = 0;
                    let skinMinX = offW, skinMaxX = 0;
                    let skinMinY = offH, skinMaxY = 0;

                    const step = 2;
                    const roiX = Math.floor(offW * 0.12);
                    const roiY = Math.floor(offH * 0.08);
                    const roiW = Math.floor(offW * 0.76);
                    const roiH = Math.floor(offH * 0.82);

                    for (let y = roiY; y < roiY + roiH; y += step) {
                        for (let x = roiX; x < roiX + roiW; x += step) {
                            const idx = (y * offW + x) * 4;
                            const r = data[idx];
                            const g = data[idx + 1];
                            const b = data[idx + 2];
                            const lum = (r * 0.299 + g * 0.587 + b * 0.114);
                            sumLum += lum;
                            totalSampled++;

                            // Broadened skin chrominance filter tolerant to lighting & skin variations
                            if (r > 30 && g > 18 && b > 10 && (r >= b - 20) && (r - g) > -25 && (r - g) < 95) {
                                skinPixelCount++;
                                if (x < skinMinX) skinMinX = x;
                                if (x > skinMaxX) skinMaxX = x;
                                if (y < skinMinY) skinMinY = y;
                                if (y > skinMaxY) skinMaxY = y;
                            }
                        }
                    }

                    const avgLum = totalSampled > 0 ? (sumLum / totalSampled) : 0;
                    const skinRatio = totalSampled > 0 ? (skinPixelCount / totalSampled) : 0;
                    isIlluminated = (avgLum >= 6.0);
                    const isPersonInFrame = isIlluminated && (skinRatio > 0.03 || (avgLum > 18 && skinPixelCount > 15));

                    if (isPersonInFrame) {
                        let headX, headY, headW, headH;
                        if (skinPixelCount > 30 && (skinMaxX - skinMinX) > offW * 0.12 && (skinMaxY - skinMinY) > offH * 0.12) {
                            headX = Math.max(0, skinMinX - 8);
                            headY = Math.max(0, skinMinY - 8);
                            headW = Math.min(offW - headX, (skinMaxX - skinMinX) + 16);
                            headH = Math.min(offH - headY, (skinMaxY - skinMinY) + 16);
                        } else {
                            headX = Math.floor(offW * 0.22);
                            headY = Math.floor(offH * 0.12);
                            headW = Math.floor(offW * 0.56);
                            headH = Math.floor(offH * 0.65);
                        }

                        const eyeBandY = Math.floor(headY + headH * 0.22);
                        const eyeBandH = Math.floor(headH * 0.26);

                        let minEyeLum = 255;
                        let maxEyeLum = 0;
                        let sumEyeLum = 0;
                        let eyeSamples = 0;

                        const lEyeX = Math.floor(headX + headW * 0.15);
                        const lEyeW = Math.floor(headW * 0.30);
                        const rEyeX = Math.floor(headX + headW * 0.55);
                        const rEyeW = Math.floor(headW * 0.30);

                        let lMin = 255, lMax = 0, lSum = 0, lCnt = 0;
                        let rMin = 255, rMax = 0, rSum = 0, rCnt = 0;

                        for (let ey = eyeBandY; ey < eyeBandY + eyeBandH; ey += 2) {
                            for (let ex = headX; ex < headX + headW; ex += 2) {
                                if (ex < 0 || ex >= offW || ey < 0 || ey >= offH) continue;
                                const idx = (ey * offW + ex) * 4;
                                const r = data[idx];
                                const g = data[idx + 1];
                                const b = data[idx + 2];
                                const lum = (r * 0.299 + g * 0.587 + b * 0.114);

                                if (lum < minEyeLum) minEyeLum = lum;
                                if (lum > maxEyeLum) maxEyeLum = lum;
                                sumEyeLum += lum;
                                eyeSamples++;

                                if (ex >= lEyeX && ex < lEyeX + lEyeW) {
                                    if (lum < lMin) lMin = lum;
                                    if (lum > lMax) lMax = lum;
                                    lSum += lum;
                                    lCnt++;
                                } else if (ex >= rEyeX && ex < rEyeX + rEyeW) {
                                    if (lum < rMin) rMin = lum;
                                    if (lum > rMax) rMax = lum;
                                    rSum += lum;
                                    rCnt++;
                                }
                            }
                        }

                        const eyeSpread = (maxEyeLum - minEyeLum) / (maxEyeLum + 1.0);
                        const lAvg = lCnt > 0 ? (lSum / lCnt) : 100;
                        const rAvg = rCnt > 0 ? (rSum / rCnt) : 100;
                        const lContrast = (lAvg - lMin) / (lAvg + 1.0);
                        const rContrast = (rAvg - rMin) / (rAvg + 1.0);
                        const avgContrast = (lContrast + rContrast) / 2.0;

                        faceDetected = true;
                        faceCovered = false;

                        const scaleX = w / offW;
                        const scaleY = h / offH;

                        // Mirrored coordinate mapping for HUD display
                        const leftCenterX = w - (rEyeX + rEyeW * 0.5) * scaleX;
                        const rightCenterX = w - (lEyeX + lEyeW * 0.5) * scaleX;
                        const centerY = (eyeBandY + eyeBandH * 0.5) * scaleY;

                        eyePoints = [
                            { x: leftCenterX, y: centerY },
                            { x: rightCenterX, y: centerY }
                        ];

                        if (avgContrast >= 0.13 || eyeSpread >= 0.14) {
                            computedEAR = 0.24 + Math.max(0.0, Math.min(0.14, (avgContrast - 0.13) * 0.8));
                        } else {
                            computedEAR = Math.max(0.06, 0.19 * (avgContrast / 0.13));
                        }
                    } else {
                        faceDetected = false;
                        eyePoints = [];
                    }

                    // -------------------------------------------------------------
                    // TIER 3: Occlusion Logic (Physical Hand Covering)
                    // -------------------------------------------------------------
                    if (faceDetected) {
                        faceCovered = false;
                        consecutiveFaceFrames++;
                        lastFaceSeenTick = now;
                    } else {
                        if (consecutiveFaceFrames >= 3 && (now - lastFaceSeenTick < 3000) && isPersonInFrame) {
                            faceCovered = true;
                            computedEAR = 0.0;
                        } else {
                            faceCovered = false;
                            computedEAR = 0.0;
                            if (now - lastFaceSeenTick > 3000) {
                                consecutiveFaceFrames = 0;
                            }
                        }
                    }
                }

                // Smooth EAR with moving average filter
                if (faceDetected) {
                    localEar = localEar * 0.60 + computedEAR * 0.40;
                } else {
                    localEar = 0.0;
                }
            }

            // -------------------------------------------------------------
            // HUD & Visual Feedback
            // -------------------------------------------------------------
            const hudFaceTag = document.getElementById('hudFaceTag');
            const overlay = document.getElementById('cameraSetupOverlay');

            if (overlay && isIlluminated && !overlay.classList.contains('hidden') && !userManuallyOpenedOverlay) {
                overlay.classList.add('hidden');
            }

            if (faceDetected && !faceCovered) {
                const isEyeClosed = (localEar < 0.22);
                if (hudFaceTag) {
                    hudFaceTag.textContent = isEyeClosed ? "CRITICAL: EYES CLOSED" : "EYES TRACKED & OPEN";
                    hudFaceTag.style.color = isEyeClosed ? "#ef4444" : "#10b981";
                    hudFaceTag.style.borderColor = isEyeClosed ? "#ef4444" : "#10b981";
                }

                // Dedicated Eye-Only Tracking Reticles (No face boxes)
                if (eyePoints && eyePoints.length === 2) {
                    const pLeft = eyePoints[0];
                    const pRight = eyePoints[1];
                    const eyeDist = Math.hypot(pRight.x - pLeft.x, pRight.y - pLeft.y);
                    const ew = Math.max(46, Math.min(80, eyeDist * 0.44));
                    const eh = Math.floor(ew * 0.65);
                    const bLen = Math.floor(ew * 0.22);

                    const eyes = [
                        { name: "L-EYE", pt: pLeft },
                        { name: "R-EYE", pt: pRight }
                    ];

                    eyes.forEach((eye) => {
                        const cx = eye.pt.x;
                        const cy = eye.pt.y;
                        const x = Math.floor(cx - ew * 0.5);
                        const y = Math.floor(cy - eh * 0.5);

                        ctx.strokeStyle = isEyeClosed ? "#ef4444" : "#10b981";
                        ctx.lineWidth = 2.0;

                        // Corner Reticle Brackets
                        ctx.beginPath();
                        ctx.moveTo(x, y + bLen); ctx.lineTo(x, y); ctx.lineTo(x + bLen, y);
                        ctx.moveTo(x + ew - bLen, y); ctx.lineTo(x + ew, y); ctx.lineTo(x + ew, y + bLen);
                        ctx.moveTo(x, y + eh - bLen); ctx.lineTo(x, y + eh); ctx.lineTo(x + bLen, y + eh);
                        ctx.moveTo(x + ew - bLen, y + eh); ctx.lineTo(x + ew, y + eh); ctx.lineTo(x + ew, y + eh - bLen);
                        ctx.stroke();

                        // Iris / Pupil Tracking Center Dot
                        ctx.fillStyle = isEyeClosed ? "#ef4444" : "#06b6d4";
                        ctx.beginPath();
                        ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
                        ctx.fill();

                        // Optical Axis Crosshair
                        ctx.strokeStyle = isEyeClosed ? "rgba(239, 68, 68, 0.45)" : "rgba(6, 182, 212, 0.45)";
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(x + 3, cy); ctx.lineTo(cx - 4, cy);
                        ctx.moveTo(cx + 4, cy); ctx.lineTo(x + ew - 3, cy);
                        ctx.stroke();

                        // Eye Label
                        ctx.font = "bold 10px 'JetBrains Mono', monospace";
                        ctx.fillStyle = isEyeClosed ? "#ef4444" : "#10b981";
                        ctx.textAlign = "center";
                        ctx.fillText(`${eye.name} [${isEyeClosed ? "CLOSED" : "OPEN"}]`, cx, y - 6);
                    });

                    // Connecting Optical Bridge Line between eyes
                    ctx.strokeStyle = isEyeClosed ? "rgba(239, 68, 68, 0.25)" : "rgba(16, 185, 129, 0.25)";
                    ctx.lineWidth = 1;
                    ctx.setLineDash([4, 4]);
                    ctx.beginPath();
                    ctx.moveTo(pLeft.x + ew * 0.5, pLeft.y);
                    ctx.lineTo(pRight.x - ew * 0.5, pRight.y);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            } else if (faceCovered) {
                if (hudFaceTag) {
                    hudFaceTag.textContent = "EYES OBSTRUCTED / COVERED BY HAND";
                    hudFaceTag.style.color = "#f59e0b";
                    hudFaceTag.style.borderColor = "#f59e0b";
                }
                const roiX = Math.floor(w * 0.20);
                const roiY = Math.floor(h * 0.15);
                const roiW = Math.floor(w * 0.60);
                const eyeBandY = Math.floor(roiY + h * 0.15);
                const eyeBandH = Math.floor(h * 0.25);

                ctx.strokeStyle = "rgba(245, 158, 11, 0.9)";
                ctx.lineWidth = 4;
                ctx.strokeRect(roiX, eyeBandY, roiW, eyeBandH);
                ctx.fillStyle = "rgba(245, 158, 11, 0.15)";
                ctx.fillRect(roiX, eyeBandY, roiW, eyeBandH);

                ctx.font = "bold 13px 'JetBrains Mono', monospace";
                ctx.fillStyle = "#f59e0b";
                ctx.textAlign = "center";
                ctx.fillText("EYES BLOCKED / COVERED BY HAND", roiX + roiW * 0.5, eyeBandY - 8);
            } else {
                if (hudFaceTag) {
                    hudFaceTag.textContent = isIlluminated ? "NO EYES DETECTED" : "CAMERA DISCONNECTED";
                    hudFaceTag.style.color = "#ef4444";
                    hudFaceTag.style.borderColor = "#ef4444";
                }
            }

            // Client-side Autonomous Evaluation (for static web hosting like Vercel / GitHub Pages / Netlify)
            if (window.app && !window.app.backendOnline) {
                const app = window.app;
                const earThresh = parseFloat(app.cfgEarThreshold ? app.cfgEarThreshold.value : 0.22) || 0.22;
                const eyeLimit = parseFloat(app.cfgEyeClosedDuration ? app.cfgEyeClosedDuration.value : 1.0) || 1.0;
                const faceLimit = parseFloat(app.cfgFaceHiddenDuration ? app.cfgFaceHiddenDuration.value : 1.0) || 1.0;
                const absentLimit = parseFloat(app.cfgPersonAbsentDuration ? app.cfgPersonAbsentDuration.value : 1.0) || 1.0;

                let faceStatus = "ABSENT";
                let eyeStatus = "UNKNOWN";

                if (faceCovered) {
                    faceStatus = "HIDDEN";
                } else if (faceDetected) {
                    faceStatus = "DETECTED";
                    eyeStatus = (localEar < earThresh) ? "CLOSED" : "OPEN";
                }

                if (app.isMonitoring) {
                    if (faceStatus === "DETECTED" && eyeStatus === "CLOSED") {
                        if (!app.clientEyeClosedStart) app.clientEyeClosedStart = now;
                    } else {
                        if (app.clientEyeClosedStart) {
                            const dur = (now - app.clientEyeClosedStart) / 1000.0;
                            if (dur >= 0.08 && dur < eyeLimit) app.clientBlinkCount = (app.clientBlinkCount || 0) + 1;
                            app.clientEyeClosedStart = 0;
                        }
                    }

                    if (faceStatus === "HIDDEN") {
                        if (!app.clientFaceHiddenStart) app.clientFaceHiddenStart = now;
                    } else {
                        app.clientFaceHiddenStart = 0;
                    }

                    if (faceStatus === "ABSENT") {
                        if (!app.clientPersonAbsentStart) app.clientPersonAbsentStart = now;
                    } else {
                        app.clientPersonAbsentStart = 0;
                    }
                } else {
                    app.clientEyeClosedStart = 0;
                    app.clientFaceHiddenStart = 0;
                    app.clientPersonAbsentStart = 0;
                }

                const eyeTimer = app.clientEyeClosedStart ? ((now - app.clientEyeClosedStart) / 1000.0) : 0.0;
                const faceTimer = app.clientFaceHiddenStart ? ((now - app.clientFaceHiddenStart) / 1000.0) : 0.0;
                const absentTimer = app.clientPersonAbsentStart ? ((now - app.clientPersonAbsentStart) / 1000.0) : 0.0;

                let isAlarm = false;
                let warnMsg = "";

                if (app.isMonitoring) {
                    if (eyeTimer >= eyeLimit) {
                        isAlarm = true;
                        warnMsg = "CRITICAL: Eyes closed for extended duration (>= 1s)!";
                    } else if (faceTimer >= faceLimit) {
                        isAlarm = true;
                        warnMsg = "ALERT: Face is covered or obstructed!";
                    } else if (absentTimer >= absentLimit) {
                        isAlarm = true;
                        warnMsg = "ALERT: Person left camera view / No face visible!";
                    }
                }

                app.handleTelemetry({
                    is_monitoring: app.isMonitoring,
                    face_status: faceStatus,
                    eye_status: eyeStatus,
                    alarm_state: isAlarm ? "ACTIVE_ALARM" : "NORMAL",
                    current_ear: localEar,
                    ear_threshold: earThresh,
                    fps: fps,
                    blink_count: app.clientBlinkCount || 0,
                    eye_closed_incidents: app.clientEyeClosedIncidents || 0,
                    face_covered_incidents: app.clientFaceCoveredIncidents || 0,
                    person_absent_incidents: app.clientPersonAbsentIncidents || 0,
                    total_incidents: (app.clientEyeClosedIncidents || 0) + (app.clientFaceCoveredIncidents || 0) + (app.clientPersonAbsentIncidents || 0),
                    eye_closed_limit: eyeLimit,
                    face_hidden_limit: faceLimit,
                    person_absent_limit: absentLimit,
                    eyes_closed_timer: eyeTimer,
                    face_hidden_timer: faceTimer,
                    person_absent_timer: absentTimer,
                    warning_message: warnMsg,
                    session_uptime: app.uptimeSeconds || 0,
                    alarm_muted: app.audioMuted,
                    alarm_volume: parseInt(app.cfgAlarmVolume ? app.cfgAlarmVolume.value : 85)
                });
            }

            // Sync live telemetry to C++ backend if present
            if (window.app && window.app.isMonitoring && window.app.backendOnline && (now - lastTelemetryPostTick >= 60)) {
                lastTelemetryPostTick = now;
                fetch('/api/telemetry', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        face_detected: faceDetected,
                        face_covered: faceCovered,
                        left_ear: localEar,
                        right_ear: localEar,
                        fps: fps
                    })
                }).catch(() => {});
            }
        }
        requestAnimationFrame(processFrame);
    }
    requestAnimationFrame(processFrame);
}

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new SentinelVisionApp();
});
