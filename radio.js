/* =========================================================
   AV JUNKI RADIO
   radio.js
   Broadcast player + real-time processing/meter hooks.
========================================================= */

"use strict";

document.addEventListener("DOMContentLoaded", () => {

  const audio = document.getElementById("radio-audio");

  const playPause =
    document.getElementById("play-pause");

  const previousTrack =
    document.getElementById("previous-track");

  const nextTrack =
    document.getElementById("next-track");

  const volumeSlider =
    document.getElementById("volume-slider");
const volumeControl =
  document.getElementById("volume-control");
  const radioStatus =
    document.getElementById("radio-status");

  const screenContent =
    document.getElementById("screen-content");

  const screenButtons =
    document.querySelectorAll("[data-screen]");

  const panelButtons =
    document.querySelectorAll(".panel-hotspot");

  const albumArt =
    document.getElementById("player-album-art");

  const trackTitle =
    document.getElementById("player-track-title");

  const trackArtist =
    document.getElementById("player-artist");

  const spectrumCanvas =
    document.getElementById("spectrum-canvas");

  const vuNeedle =
    document.getElementById("vu-needle");

  const grFill =
    document.getElementById("gr-fill");

  const grValue =
    document.getElementById("gr-value");

  const dspStatus =
    document.getElementById("dsp-status");

  const mainstreamStatus =
    document.getElementById("mainstream-status");

  const streamState =
    document.getElementById("stream-state");


  let audioContext = null;

  let sourceNode = null;

  let inputGain = null;

  let lowShelf = null;

  let presenceEQ = null;

  let compressor = null;

  let limiter = null;

  let analyser = null;

  let masterGain = null;

  let audioGraphReady = false;

  let animationFrame = null;

  let statusTimer = null;

  let activePreset = "music";


  const presets = {

    music: {
      input: 1.0,
      lowGain: 2.0,
      presenceGain: 1.0,
      threshold: -16,
      knee: 8,
      ratio: 3,
      attack: 0.018,
      release: 0.18
    },

    podcast: {
      input: 1.08,
      lowGain: 1.5,
      presenceGain: 2.5,
      threshold: -20,
      knee: 7,
      ratio: 4,
      attack: 0.008,
      release: 0.16
    },

    live: {
      input: 0.92,
      lowGain: 0.5,
      presenceGain: 1.0,
      threshold: -18,
      knee: 7,
      ratio: 3.5,
      attack: 0.006,
      release: 0.12
    }

  };


  function setStatus(message) {

    if (!radioStatus) {
      return;
    }

    radioStatus.textContent = message;

    window.clearTimeout(statusTimer);

    statusTimer = window.setTimeout(() => {

      radioStatus.textContent = "";

    }, 2400);

  }


  function formatLabel(value) {

    return String(value || "")
      .split("-")
      .map((part) => {

        return (
          part.charAt(0).toUpperCase() +
          part.slice(1)
        );

      })
      .join(" ");

  }


  function setMainstreamState(onAir) {

    if (!mainstreamStatus || !streamState) {
      return;
    }

    mainstreamStatus.classList.toggle(
      "on-air",
      Boolean(onAir)
    );

    streamState.textContent =
      onAir ? "ON AIR" : "OFF AIR";

    mainstreamStatus.setAttribute(
      "aria-label",
      `Mainstream status: ${
        onAir ? "On Air" : "Off Air"
      }`
    );

  }


  function setDSPState(active) {

    if (!dspStatus) {
      return;
    }

    dspStatus.classList.toggle(
      "active",
      Boolean(active)
    );

  }


  function applyPreset(name) {

    activePreset =
      presets[name]
        ? name
        : "music";

    if (!audioGraphReady) {
      return;
    }

    const p =
      presets[activePreset];

    inputGain.gain.value =
      p.input;

    lowShelf.gain.value =
      p.lowGain;

    presenceEQ.gain.value =
      p.presenceGain;

    compressor.threshold.value =
      p.threshold;

    compressor.knee.value =
      p.knee;

    compressor.ratio.value =
      p.ratio;

    compressor.attack.value =
      p.attack;

    compressor.release.value =
      p.release;

  }


  function resizeSpectrumCanvas() {

    if (!spectrumCanvas) {
      return;
    }

    const rect =
      spectrumCanvas.getBoundingClientRect();

    const dpr =
      Math.max(
        1,
        Math.min(
          window.devicePixelRatio || 1,
          2
        )
      );

    const w =
      Math.max(
        1,
        Math.round(
          rect.width * dpr
        )
      );

    const h =
      Math.max(
        1,
        Math.round(
          rect.height * dpr
        )
      );

    if (
      spectrumCanvas.width !== w ||
      spectrumCanvas.height !== h
    ) {

      spectrumCanvas.width = w;
      spectrumCanvas.height = h;

    }

  }


  function ensureAudioGraph() {

    if (
      audioGraphReady ||
      !audio
    ) {
      return;
    }


    const AudioContextClass =
      window.AudioContext ||
      window.webkitAudioContext;


    if (!AudioContextClass) {

      setStatus(
        "Web Audio is not supported in this browser."
      );

      return;

    }


    audioContext =
      audioContext ||
      new AudioContextClass();


    sourceNode =
      sourceNode ||
      audioContext.createMediaElementSource(
        audio
      );


    inputGain =
      audioContext.createGain();


    lowShelf =
      audioContext.createBiquadFilter();

    lowShelf.type =
      "lowshelf";

    lowShelf.frequency.value =
      120;


    presenceEQ =
      audioContext.createBiquadFilter();

    presenceEQ.type =
      "peaking";

    presenceEQ.frequency.value =
      3200;

    presenceEQ.Q.value =
      0.85;


    compressor =
      audioContext.createDynamicsCompressor();


    limiter =
      audioContext.createDynamicsCompressor();

    limiter.threshold.value =
      -1;

    limiter.knee.value =
      0;

    limiter.ratio.value =
      20;

    limiter.attack.value =
      0.002;

    limiter.release.value =
      0.08;


    analyser =
      audioContext.createAnalyser();

    analyser.fftSize =
      256;

    analyser.smoothingTimeConstant =
      0.78;


    masterGain =
      audioContext.createGain();


    masterGain.gain.value =
      volumeSlider
        ? Number(
            volumeSlider.value
          ) / 100
        : 0.8;


    sourceNode
      .connect(inputGain)
      .connect(lowShelf)
      .connect(presenceEQ)
      .connect(compressor)
      .connect(limiter)
      .connect(analyser)
      .connect(masterGain)
      .connect(
        audioContext.destination
      );


    audio.volume =
      1;


    audioGraphReady =
      true;


    applyPreset(
      activePreset
    );


    resizeSpectrumCanvas();


    startMeterAnimation();

  }


  async function resumeAudioContext() {

    ensureAudioGraph();


    if (
      audioContext &&
      audioContext.state === "suspended"
    ) {

      try {

        await audioContext.resume();

      } catch (error) {

        setStatus(
          "Audio processing could not start."
        );

      }

    }


    setDSPState(
      Boolean(
        audioContext &&
        audioContext.state === "running"
      )
    );

  }


  function startMeterAnimation() {

    if (
      animationFrame ||
      !analyser
    ) {
      return;
    }


    const frequencyData =
      new Uint8Array(
        analyser.frequencyBinCount
      );


    const timeData =
      new Uint8Array(
        analyser.fftSize
      );


    const draw = () => {

      animationFrame =
        window.requestAnimationFrame(
          draw
        );


      drawSpectrum(
        frequencyData
      );


      drawAnalogVU(
        timeData
      );


      drawGainReduction();


      setDSPState(
        Boolean(
          audioContext &&
          audioContext.state === "running"
        )
      );

    };


    draw();

  }


  function drawSpectrum(frequencyData) {

    if (
      !spectrumCanvas ||
      !analyser
    ) {
      return;
    }


    resizeSpectrumCanvas();


    const ctx =
      spectrumCanvas.getContext(
        "2d"
      );


    if (!ctx) {
      return;
    }


    analyser.getByteFrequencyData(
      frequencyData
    );


    const width =
      spectrumCanvas.width;


    const height =
      spectrumCanvas.height;


    ctx.clearRect(
      0,
      0,
      width,
      height
    );


    const gradient =
      ctx.createLinearGradient(
        0,
        height,
        0,
        0
      );


    gradient.addColorStop(
      0,
      "rgba(45,185,255,.95)"
    );


    gradient.addColorStop(
      0.48,
      "rgba(108,118,255,.96)"
    );


    gradient.addColorStop(
      0.74,
      "rgba(222,147,76,.98)"
    );


    gradient.addColorStop(
      1,
      "rgba(255,93,55,1)"
    );


    ctx.fillStyle =
      gradient;


    const bars =
      42;


    const gap =
      Math.max(
        1,
        width * 0.0035
      );


    const barWidth =
      (
        width -
        gap * (bars - 1)
      ) / bars;


    for (
      let i = 0;
      i < bars;
      i += 1
    ) {

      const dataIndex =
        Math.floor(
          (i / bars) *
          frequencyData.length *
          0.72
        );


      const normalized =
        frequencyData[dataIndex] /
        255;


      const barHeight =
        Math.max(
          height * 0.04,
          normalized *
          height *
          0.94
        );


      const x =
        i *
        (
          barWidth +
          gap
        );


      const y =
        height -
        barHeight;


      ctx.fillRect(
        x,
        y,
        Math.max(
          1,
          barWidth
        ),
        barHeight
      );

    }

  }


  function drawAnalogVU(timeData) {

    if (
      !vuNeedle ||
      !analyser
    ) {
      return;
    }


    analyser.getByteTimeDomainData(
      timeData
    );


    let sumSquares =
      0;


    for (
      let i = 0;
      i < timeData.length;
      i += 1
    ) {

      const sample =
        (
          timeData[i] -
          128
        ) / 128;


      sumSquares +=
        sample *
        sample;

    }


    const rms =
      Math.sqrt(
        sumSquares /
        timeData.length
      );


    const db =
      rms > 0
        ? 20 *
          Math.log10(rms)
        : -60;


    const clampedDb =
      Math.max(
        -30,
        Math.min(
          3,
          db
        )
      );


    const normalized =
      (
        clampedDb +
        30
      ) / 33;


    const degrees =
      -42 +
      normalized *
      84;


    vuNeedle.style.transform =
      `translateX(-50%) rotate(${degrees.toFixed(2)}deg)`;

  }


  function drawGainReduction() {

    if (
      !compressor ||
      !grFill ||
      !grValue
    ) {
      return;
    }


    const reduction =
      Math.max(
        0,
        Math.min(
          12,
          Math.abs(
            compressor.reduction ||
            0
          )
        )
      );


    const percent =
      (
        reduction /
        12
      ) * 100;


    grFill.style.height =
      `${percent.toFixed(1)}%`;


    grValue.textContent =
      `${reduction.toFixed(1)} dB`;

  }

function updateVolumeHardware(value) {

  if (!volumeControl) {
    return;
  }

  const percent =
    Math.max(
      0,
      Math.min(
        100,
        Number(value)
      )
    );

  const needleMin = -38;
  const needleMax = 38;

  const needleAngle =
    needleMin +
    (percent / 100) *
    (needleMax - needleMin);

  volumeControl.style.setProperty(
    "--volume-angle",
    `${needleAngle.toFixed(2)}deg`
  );
volumeControl.style.setProperty(
  "--volume-center-angle",
  `${(-135 + (percent / 100) * 270 - 5).toFixed(2)}deg`
);
}
  if (
    volumeSlider &&
    audio
  ) {

    audio.volume =
      Number(
        volumeSlider.value
      ) / 100;
updateVolumeHardware(
  volumeSlider.value
);

    volumeSlider.addEventListener(
      "input",
      async () => {

        const value =
          Number(
            volumeSlider.value
          ) / 100;
updateVolumeHardware(
  volumeSlider.value
);

        await resumeAudioContext();


        if (
          audioGraphReady &&
          masterGain &&
          audioContext
        ) {

          masterGain.gain.setTargetAtTime(
            value,
            audioContext.currentTime,
            0.015
          );

        } else {

          audio.volume =
            value;

        }

      }
    );

  }


  if (
    playPause &&
    audio
  ) {

    playPause.addEventListener(
      "click",
      async () => {

        await resumeAudioContext();


        if (!audio.src) {

          setMainstreamState(
            false
          );


          setStatus(
            "Mainstream is off air — stream source not connected yet."
          );


          return;

        }


        try {

          if (audio.paused) {

            await audio.play();

          } else {

            audio.pause();

          }

        } catch (error) {

          setMainstreamState(
            false
          );


          setStatus(
            "Unable to start the audio stream."
          );

        }

      }
    );


    audio.addEventListener(
      "play",
      () => {

        playPause.textContent =
          "❚❚";


        playPause.setAttribute(
          "aria-label",
          "Pause"
        );


        setMainstreamState(
          true
        );

      }
    );


    audio.addEventListener(
      "pause",
      () => {

        playPause.textContent =
          "▶";


        playPause.setAttribute(
          "aria-label",
          "Play"
        );


        setMainstreamState(
          false
        );

      }
    );


    audio.addEventListener(
      "ended",
      () => {

        setMainstreamState(
          false
        );

      }
    );


    audio.addEventListener(
      "error",
      () => {

        setMainstreamState(
          false
        );

      }
    );

  }


  if (mainstreamStatus) {

    mainstreamStatus.addEventListener(
      "click",
      () => {

        setStatus(
          audio &&
          !audio.paused &&
          audio.src

            ? "Mainstream is on air."

            : "Mainstream is off air."
        );

      }
    );

  }


  if (previousTrack) {

    previousTrack.addEventListener(
      "click",
      () => {

        setStatus(
          "Previous track hook ready."
        );

      }
    );

  }


  if (nextTrack) {

    nextTrack.addEventListener(
      "click",
      () => {

        setStatus(
          "Next track hook ready."
        );

      }
    );

  }


  screenButtons.forEach(
    (button) => {

      button.addEventListener(
        "click",
        () => {

          const screen =
            button.dataset.screen ||
            "";


          if (screenContent) {

            screenContent.dataset.activeScreen =
              screen;

          }


          setStatus(
            formatLabel(
              screen
            )
          );

        }
      );

    }
  );


  panelButtons.forEach(
    (button) => {

      button.addEventListener(
        "click",
        () => {

          const channel =
            button.dataset.channel ||
            "";


          if (
            channel ===
            "podcast"
          ) {

            applyPreset(
              "podcast"
            );

          } else if (
            channel.startsWith(
              "live-"
            )
          ) {

            applyPreset(
              "live"
            );

          } else {

            applyPreset(
              "music"
            );

          }


          setStatus(
            formatLabel(
              channel
            )
          );

        }
      );

    }
  );


  window.setRadioTrack = ({

    title =
      "AV Junki Radio",

    artist =
      "Music Lives Here",

    artwork =
      "",

    src =
      "",

    preset =
      "music"

  } = {}) => {


    if (trackTitle) {

      trackTitle.textContent =
        title;

    }


    if (trackArtist) {

      trackArtist.textContent =
        artist;

    }


    if (albumArt) {

      albumArt.style.backgroundImage =
        artwork
          ? `url("${artwork}")`
          : "none";

    }


    applyPreset(
      preset
    );


    if (
      audio &&
      src
    ) {

      audio.src =
        src;


      audio.load();


      setMainstreamState(
        false
      );

    }

  };


  window.addEventListener(
    "resize",
    resizeSpectrumCanvas
  );


  if (audioContext) {

    audioContext.addEventListener(
      "statechange",
      () => {

        setDSPState(
          audioContext.state ===
          "running"
        );

      }
    );

  }


  setMainstreamState(
    false
  );


  setDSPState(
    false
  );

});
function updateLeftInfoTime() {
  const clock = document.getElementById("left-info-clock");
  const date = document.getElementById("left-info-date");

  if (!clock || !date) return;

  const now = new Date();

  clock.textContent = now.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });

  date.textContent = now.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
}

updateLeftInfoTime();
setInterval(updateLeftInfoTime, 1000);
const sportsRotation = [
  {
    name: "FOOTBALL",
    teamA: "LV",
    scoreA: "--",
    teamB: "DAL",
    scoreB: "--",
    status: "PLACEHOLDER"
  },
  {
    name: "BASKETBALL",
    teamA: "LV",
    scoreA: "--",
    teamB: "PHX",
    scoreB: "--",
    status: "PLACEHOLDER"
  },
  {
    name: "BASEBALL",
    teamA: "LAD",
    scoreA: "--",
    teamB: "SF",
    scoreB: "--",
    status: "PLACEHOLDER"
  },
  {
    name: "HOCKEY",
    teamA: "VGK",
    scoreA: "--",
    teamB: "LA",
    scoreB: "--",
    status: "PLACEHOLDER"
  },
  {
    name: "HORSE RACING",
    teamA: "RACE",
    scoreA: "--",
    teamB: "TRACK",
    scoreB: "--",
    status: "PLACEHOLDER"
  },
  {
    name: "SOCCER",
    teamA: "LV",
    scoreA: "--",
    teamB: "LA",
    scoreB: "--",
    status: "PLACEHOLDER"
  }
];

function showSport(index) {
  const sport = sportsRotation[index];

  document.getElementById("sports-name").textContent = sport.name;
  document.getElementById("sports-team-a").textContent = sport.teamA;
  document.getElementById("sports-score-a").textContent = sport.scoreA;
  document.getElementById("sports-team-b").textContent = sport.teamB;
  document.getElementById("sports-score-b").textContent = sport.scoreB;
  document.getElementById("sports-status").textContent = sport.status;
}

function runSportsCycle() {
  let index = 0;

  showSport(index);

  const sportsTimer = setInterval(() => {
    index++;

    if (index >= sportsRotation.length) {
      clearInterval(sportsTimer);
      return;
    }

    showSport(index);
  }, 8000);
}

function scheduleSportsCycle() {
  showSport(0);

  setTimeout(() => {
    runSportsCycle();
  }, 2000);
}

setTimeout(() => {
  scheduleSportsCycle();

  setInterval(() => {
    scheduleSportsCycle();
  }, 96000);

}, 22000);
function updateDowDisplay() {
  const value = document.getElementById("dow-value");
  const points = document.getElementById("dow-points");
  const percent = document.getElementById("dow-percent");
  const status = document.getElementById("dow-status");

  if (!value || !points || !percent || !status) return;

  value.textContent = "46,250.00";
  points.textContent = "+125.50";
  percent.textContent = "(+0.27%)";
  status.textContent = "MARKET CLOSED";
}

updateDowDisplay();
