/* =========================================================
   AV JUNKI RADIO
   radio.js
   MASTER PLAYER / DSP / INFO DISPLAY CONTROLLER
========================================================= */
"use strict";

document.addEventListener("DOMContentLoaded", () => {

  /* =========================================================
     ELEMENTS
  ========================================================= */

  const audio =
    document.getElementById(
      "radio-audio"
    );

  const playPause =
    document.getElementById(
      "play-pause"
    );

  const previousTrack =
    document.getElementById(
      "previous-track"
    );

  const nextTrack =
    document.getElementById(
      "next-track"
    );

  const volumeSlider =
    document.getElementById(
      "volume-slider"
    );

  const volumeControl =
    document.getElementById(
      "volume-control"
    );

  const radioStatus =
    document.getElementById(
      "radio-status"
    );

  const screenContent =
    document.getElementById(
      "screen-content"
    );

  const screenSaver =
    document.getElementById(
      "radio-screen-saver"
    );

  const screenSaverImage =
    document.getElementById(
      "radio-screen-saver-image"
    );

  const nowPlaying =
    document.getElementById(
      "radio-now-playing"
    );

  const nowPlayingBackground =
    document.getElementById(
      "now-playing-background"
    );

  const nowPlayingArt =
    document.getElementById(
      "now-playing-art"
    );

  const nowPlayingTitle =
    document.getElementById(
      "now-playing-title"
    );

  const nowPlayingArtist =
    document.getElementById(
      "now-playing-artist"
    );

  const heroImage =
    document.getElementById(
      "radio-hero-image"
    );

  const heroImageNext =
    document.getElementById(
      "radio-hero-image-next"
    );

  const screenButtons =
    document.querySelectorAll(
      "[data-screen]"
    );

  const panelButtons =
    document.querySelectorAll(
      ".panel-hotspot"
    );

  const albumArt =
    document.getElementById(
      "player-album-art"
    );

  const trackTitle =
    document.getElementById(
      "player-track-title"
    );

  const trackArtist =
    document.getElementById(
      "player-artist"
    );

  let trackVideo = null;

  let videoSyncing =
    false;

  let dropVisual = null;

  let dropWaveCanvas = null;

  let currentTrackIsStationId =
    false;

  const DROP_SCREEN_SRC =
    "assets/avjunki-radio-drop-screen.webp";

  const spectrumCanvas =
    document.getElementById(
      "spectrum-canvas"
    );

  const vuNeedle =
    document.getElementById(
      "vu-needle"
    );

  const grFill =
    document.getElementById(
      "gr-fill"
    );

  const grValue =
    document.getElementById(
      "gr-value"
    );

  const dspStatus =
    document.getElementById(
      "dsp-status"
    );

  const mainstreamStatus =
    document.getElementById(
      "mainstream-status"
    );

  const streamState =
    document.getElementById(
      "stream-state"
    );

  const leftInfoClock =
    document.getElementById(
      "left-info-clock"
    );

  const leftInfoDate =
    document.getElementById(
      "left-info-date"
    );

  const sportsName =
    document.getElementById(
      "sports-name"
    );

  const sportsTeamA =
    document.getElementById(
      "sports-team-a"
    );

  const sportsScoreA =
    document.getElementById(
      "sports-score-a"
    );

  const sportsTeamB =
    document.getElementById(
      "sports-team-b"
    );

  const sportsScoreB =
    document.getElementById(
      "sports-score-b"
    );

  const sportsStatus =
    document.getElementById(
      "sports-status"
    );

  const dowValue =
    document.getElementById(
      "dow-value"
    );

  const dowPoints =
    document.getElementById(
      "dow-points"
    );

  const dowPercent =
    document.getElementById(
      "dow-percent"
    );

  const dowStatus =
    document.getElementById(
      "dow-status"
    );


  /* =========================================================
     PLAYER / DSP STATE
  ========================================================= */

  let audioContext = null;
  let sourceNode = null;
  let inputGain = null;
  let lowShelf = null;
  let presenceEQ = null;
  let compressor = null;
  let limiter = null;
  let analyser = null;
  let masterGain = null;

  let audioGraphReady =
    false;

  let animationFrame =
    null;

  let statusTimer =
    null;

  let activePreset =
    "music";


  /* =========================================================
     DSP PRESETS
  ========================================================= */

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


  /* =========================================================
     SPORTS ROTATION
  ========================================================= */

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


  /* =========================================================
     GENERAL HELPERS
  ========================================================= */

  function setStatus(message) {

    if (!radioStatus) {
      return;
    }

    radioStatus.textContent =
      message;

    window.clearTimeout(
      statusTimer
    );

    statusTimer =
      window.setTimeout(
        () => {

          radioStatus.textContent =
            "";

        },
        2400
      );

  }


  function formatLabel(value) {

    return String(
      value ||
      ""
    )
      .split("-")
      .map(
        (part) => {

          return (
            part.charAt(0)
              .toUpperCase() +
            part.slice(1)
          );

        }
      )
      .join(" ");

  }


  function setMainstreamState(
    onAir
  ) {

    if (
      !mainstreamStatus ||
      !streamState
    ) {
      return;
    }

    const isOnAir =
      Boolean(
        onAir
      );

    mainstreamStatus
      .classList
      .toggle(
        "on-air",
        isOnAir
      );

    streamState.textContent =
      isOnAir
        ? "ON AIR"
        : "OFF AIR";

    mainstreamStatus.setAttribute(
      "aria-label",
      `Mainstream status: ${
        isOnAir
          ? "On Air"
          : "Off Air"
      }`
    );

  }


  function setDSPState(
    active
  ) {

    if (!dspStatus) {
      return;
    }

    dspStatus
      .classList
      .toggle(
        "active",
        Boolean(
          active
        )
      );

  }


  function hasAudioSource() {

    if (!audio) {
      return false;
    }

    return Boolean(
      audio.currentSrc ||
      audio.getAttribute(
        "src"
      )
    );

  }


  /* =========================================================
     DSP PRESET CONTROL
  ========================================================= */

  function applyPreset(
    name
  ) {

    activePreset =
      presets[name]
        ? name
        : "music";

    if (!audioGraphReady) {
      return;
    }

    const preset =
      presets[
        activePreset
      ];

    inputGain.gain.value =
      preset.input;

    lowShelf.gain.value =
      preset.lowGain;

    presenceEQ.gain.value =
      preset.presenceGain;

    compressor.threshold.value =
      preset.threshold;

    compressor.knee.value =
      preset.knee;

    compressor.ratio.value =
      preset.ratio;

    compressor.attack.value =
      preset.attack;

    compressor.release.value =
      preset.release;

  }


  /* =========================================================
     SPECTRUM CANVAS
  ========================================================= */

  function resizeSpectrumCanvas() {

    if (!spectrumCanvas) {
      return;
    }

    const rect =
      spectrumCanvas
        .getBoundingClientRect();

    const dpr =
      Math.max(
        1,
        Math.min(
          window.devicePixelRatio ||
          1,
          2
        )
      );

    const width =
      Math.max(
        1,
        Math.round(
          rect.width *
          dpr
        )
      );

    const height =
      Math.max(
        1,
        Math.round(
          rect.height *
          dpr
        )
      );

    if (
      spectrumCanvas.width !==
        width ||
      spectrumCanvas.height !==
        height
    ) {

      spectrumCanvas.width =
        width;

      spectrumCanvas.height =
        height;

    }

  }


  /* =========================================================
     WEB AUDIO GRAPH
  ========================================================= */

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

    try {

      audioContext =
        new AudioContextClass();

      sourceNode =
        audioContext
          .createMediaElementSource(
            audio
          );

      inputGain =
        audioContext
          .createGain();

      lowShelf =
        audioContext
          .createBiquadFilter();

      lowShelf.type =
        "lowshelf";

      lowShelf.frequency.value =
        120;

      presenceEQ =
        audioContext
          .createBiquadFilter();

      presenceEQ.type =
        "peaking";

      presenceEQ.frequency.value =
        3200;

      presenceEQ.Q.value =
        0.85;

      compressor =
        audioContext
          .createDynamicsCompressor();

      limiter =
        audioContext
          .createDynamicsCompressor();

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
        audioContext
          .createAnalyser();

      analyser.fftSize =
        2048;

      analyser
        .smoothingTimeConstant =
        0.78;

      masterGain =
        audioContext
          .createGain();

      masterGain.gain.value =
        volumeSlider
          ? Number(
              volumeSlider.value
            ) / 100
          : 0.8;

      sourceNode
        .connect(
          inputGain
        )
        .connect(
          lowShelf
        )
        .connect(
          presenceEQ
        )
        .connect(
          compressor
        )
        .connect(
          limiter
        )
        .connect(
          analyser
        )
        .connect(
          masterGain
        )
        .connect(
          audioContext.destination
        );

      audio.volume =
        1;

      audioGraphReady =
        true;

      audioContext
        .addEventListener(
          "statechange",
          () => {

            setDSPState(
              audioContext.state ===
              "running"
            );

          }
        );

      applyPreset(
        activePreset
      );

      resizeSpectrumCanvas();

      startMeterAnimation();

    } catch (error) {

      console.error(
        "AV Junki Radio audio graph error:",
        error
      );

      setStatus(
        "Audio processing could not start."
      );

      setDSPState(
        false
      );

    }

  }


  async function resumeAudioContext() {

    ensureAudioGraph();

    if (
      audioContext &&
      audioContext.state ===
        "suspended"
    ) {

      try {

        await audioContext.resume();

      } catch (error) {

        console.error(
          "AV Junki Radio resume error:",
          error
        );

        setStatus(
          "Audio processing could not start."
        );

      }

    }

    setDSPState(
      Boolean(
        audioContext &&
        audioContext.state ===
        "running"
      )
    );

  }


  /* =========================================================
     METERS
  ========================================================= */

  function startMeterAnimation() {

    if (
      animationFrame ||
      !analyser
    ) {
      return;
    }

    const frequencyData =
      new Uint8Array(
        analyser
          .frequencyBinCount
      );

    const timeData =
      new Uint8Array(
        analyser
          .fftSize
      );

    const draw =
      () => {

        animationFrame =
          window
            .requestAnimationFrame(
              draw
            );

        drawSpectrum(
          frequencyData
        );

        drawAnalogVU(
          timeData
        );

        drawDropWaveform(
          timeData
        );

        drawGainReduction();

        setDSPState(
          Boolean(
            audioContext &&
            audioContext.state ===
            "running"
          )
        );

      };

    draw();

  }


  function drawSpectrum(
    frequencyData
  ) {

    if (
      !spectrumCanvas ||
      !analyser
    ) {
      return;
    }

    resizeSpectrumCanvas();

    const ctx =
      spectrumCanvas.getContext("2d");

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


    /* =========================================================
       LIGHT BLUE ILLUMINATED DISPLAY
    ========================================================= */

    const background =
      ctx.createLinearGradient(
        0,
        0,
        0,
        height
      );

    background.addColorStop(
      0,
      "rgba(125, 215, 255, 0.24)"
    );

    background.addColorStop(
      0.5,
      "rgba(50, 155, 220, 0.18)"
    );

    background.addColorStop(
      1,
      "rgba(10, 55, 90, 0.30)"
    );

    ctx.fillStyle =
      background;

    ctx.fillRect(
      0,
      0,
      width,
      height
    );


    /* =========================================================
       FREQUENCY RANGE
    ========================================================= */

    const sampleRate =
      audioContext
        ? audioContext.sampleRate
        : 48000;

    const nyquist =
      sampleRate / 2;

    const minFrequency =
      40;

    const maxFrequency =
      Math.min(
        20000,
        nyquist * 0.95
      );


    const plotTop =
      height * 0.08;

    const plotBottom =
      height * 0.76;

    const plotHeight =
      plotBottom -
      plotTop;

    const pointCount =
      Math.max(
        72,
        Math.floor(
          width / 4
        )
      );

    const points = [];


    for (
      let i = 0;
      i < pointCount;
      i += 1
    ) {

      const position =
        i /
        (pointCount - 1);

      const frequency =
        minFrequency *
        Math.pow(
          maxFrequency /
          minFrequency,
          position
        );

      const exactBin =
        frequency /
        nyquist *
        (frequencyData.length - 1);

      const lowerBin =
        Math.floor(
          exactBin
        );

      const upperBin =
        Math.min(
          lowerBin + 1,
          frequencyData.length - 1
        );

      const fraction =
        exactBin -
        lowerBin;

      const lowerValue =
        frequencyData[
          Math.max(
            0,
            lowerBin
          )
        ];

      const upperValue =
        frequencyData[
          upperBin
        ];

      const interpolatedValue =
        lowerValue +
        (
          upperValue -
          lowerValue
        ) *
        fraction;

      let normalized =
        interpolatedValue /
        255;


      const lowMidTrim =
        frequency < 120
          ? 0.62
          : frequency < 250
            ? 0.66
            : frequency < 500
              ? 0.72
              : frequency < 1000
                ? 0.78
                : frequency < 2000
                  ? 0.86
                  : 0.92;

      const highDetailLift =
        frequency >= 2000
          ? 1 +
            (
              (
                Math.min(
                  frequency,
                  16000
                ) -
                2000
              ) /
              14000
            ) *
            0.12
          : 1;

      normalized =
        Math.min(
          1,
          normalized *
          lowMidTrim *
          highDetailLift
        );

      normalized =
        Math.pow(
          normalized,
          1.15
        );

      normalized *=
        0.88;

      const x =
        position *
        width;

      const y =
        plotBottom -
        (
          normalized *
          plotHeight
        );

      points.push({
        x,
        y
      });

    }


    if (
      points.length >
      1
    ) {

      ctx.beginPath();

      ctx.moveTo(
        points[0].x,
        plotBottom
      );

      ctx.lineTo(
        points[0].x,
        points[0].y
      );

      for (
        let i = 1;
        i < points.length - 1;
        i += 1
      ) {

        const current =
          points[i];

        const next =
          points[i + 1];

        const midX =
          (
            current.x +
            next.x
          ) / 2;

        const midY =
          (
            current.y +
            next.y
          ) / 2;

        ctx.quadraticCurveTo(
          current.x,
          current.y,
          midX,
          midY
        );

      }

      const lastPoint =
        points[
          points.length - 1
        ];

      ctx.lineTo(
        lastPoint.x,
        lastPoint.y
      );

      ctx.lineTo(
        lastPoint.x,
        plotBottom
      );

      ctx.closePath();

      const waveFill =
        ctx.createLinearGradient(
          0,
          plotTop,
          0,
          plotBottom
        );

      waveFill.addColorStop(
        0,
        "rgba(220, 245, 255, 0.32)"
      );

      waveFill.addColorStop(
        0.45,
        "rgba(90, 195, 255, 0.22)"
      );

      waveFill.addColorStop(
        1,
        "rgba(30, 125, 205, 0.05)"
      );

      ctx.fillStyle =
        waveFill;

      ctx.fill();

      ctx.beginPath();

      ctx.moveTo(
        points[0].x,
        points[0].y
      );

      for (
        let i = 1;
        i < points.length - 1;
        i += 1
      ) {

        const current =
          points[i];

        const next =
          points[i + 1];

        const midX =
          (
            current.x +
            next.x
          ) / 2;

        const midY =
          (
            current.y +
            next.y
          ) / 2;

        ctx.quadraticCurveTo(
          current.x,
          current.y,
          midX,
          midY
        );

      }

      ctx.lineTo(
        lastPoint.x,
        lastPoint.y
      );

      ctx.strokeStyle =
        "rgba(245, 252, 255, 0.98)";

      ctx.lineWidth =
        Math.max(
          1.4,
          height * 0.018
        );

      ctx.lineJoin =
        "round";

      ctx.lineCap =
        "round";

      ctx.shadowColor =
        "rgba(170, 230, 255, 0.95)";

      ctx.shadowBlur =
        Math.max(
          5,
          height * 0.08
        );

      ctx.stroke();

      ctx.shadowBlur =
        0;

    }


    const labels = [
      { frequency: 60, label: "60" },
      { frequency: 120, label: "120" },
      { frequency: 250, label: "250" },
      { frequency: 500, label: "500" },
      { frequency: 1000, label: "1K" },
      { frequency: 2000, label: "2K" },
      { frequency: 4000, label: "4K" },
      { frequency: 8000, label: "8K" },
      { frequency: 16000, label: "16K" }
    ];

    ctx.textAlign =
      "center";

    ctx.textBaseline =
      "middle";

    ctx.font =
      `${Math.max(
        8,
        height * 0.095
      )}px Arial`;

    ctx.fillStyle =
      "rgba(225, 245, 255, 0.60)";

    ctx.strokeStyle =
      "rgba(210, 240, 255, 0.10)";

    ctx.lineWidth =
      1;

    labels.forEach(
      ({
        frequency,
        label
      }) => {

        if (
          frequency >
          maxFrequency
        ) {
          return;
        }

        const position =
          Math.log(
            frequency /
            minFrequency
          ) /
          Math.log(
            maxFrequency /
            minFrequency
          );

        const x =
          position *
          width;

        ctx.beginPath();

        ctx.moveTo(
          x,
          plotBottom
        );

        ctx.lineTo(
          x,
          plotTop
        );

        ctx.stroke();

        ctx.fillText(
          label,
          x,
          height * 0.89
        );

      }
    );

  }


  function drawAnalogVU(
    timeData
  ) {

    if (
      !vuNeedle ||
      !analyser
    ) {
      return;
    }

    analyser
      .getByteTimeDomainData(
        timeData
      );

    let sumSquares =
      0;

    for (
      let i = 0;
      i <
        timeData.length;
      i += 1
    ) {

      const sample =
        (
          timeData[i] -
          128
        ) /
        128;

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
          Math.log10(
            rms
          )
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
      ) /
      33;

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
      ) *
      100;

    grFill.style.height =
      `${percent.toFixed(1)}%`;

    grValue.textContent =
      `${reduction.toFixed(1)} dB`;

  }


  /* =========================================================
     VOLUME HARDWARE
  ========================================================= */

  function updateVolumeHardware(
    value
  ) {

    if (!volumeControl) {
      return;
    }

    const percent =
      Math.max(
        0,
        Math.min(
          100,
          Number(
            value
          )
        )
      );

    const needleMin =
      -38;

    const needleMax =
      38;

    const needleAngle =
      needleMin +
      (
        percent /
        100
      ) *
      (
        needleMax -
        needleMin
      );

    const centerAngle =
      -135 +
      (
        percent /
        100
      ) *
      270 -
      5;

    volumeControl
      .style
      .setProperty(
        "--volume-angle",
        `${needleAngle.toFixed(2)}deg`
      );

    volumeControl
      .style
      .setProperty(
        "--volume-center-angle",
        `${centerAngle.toFixed(2)}deg`
      );

  }


  if (
    volumeSlider &&
    audio
  ) {

    audio.volume =
      Number(
        volumeSlider.value
      ) /
      100;

    updateVolumeHardware(
      volumeSlider.value
    );

    volumeSlider
      .addEventListener(
        "input",
        async () => {

          const value =
            Number(
              volumeSlider.value
            ) /
            100;

          updateVolumeHardware(
            volumeSlider.value
          );

          await resumeAudioContext();

          if (
            audioGraphReady &&
            masterGain &&
            audioContext
          ) {

            masterGain
              .gain
              .setTargetAtTime(
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


  /* =========================================================
     CHANNEL HEROES / TRACK LIBRARY
  ========================================================= */

  const heroSources = {

    lobby:
      "assets/Hero-Radio.webp",

    "hip-hop":
      "assets/hero-radio-hiphop.webp",

    rnb:
      "assets/hero-radio-rnb.webp",

    house:
      "assets/hero-radio-house.webp",

    reggae:
      "assets/hero-radio-reggae.webp",

    gospel:
      "assets/hero-radio-gospel.webp"

  };


  const trackLibrary = {

    "son-of-a-preacher-man": {
      title: "Son of a Preacher Man",
      artist: "Searvaxter Charles Gardner Jr.",
      artwork: "assets/son-of-a-preacher-man-cover.png",
      src: "assets/audio/son-of-a-preacher-man.mp3",
      video: "https://pub-2e91fa0475164dd8ab4072317209d9ac.r2.dev/Son-of-a-Preacher-Man.mp4",
      preset: "music"
    },

    flo: {
      title: "Flo",
      artist: "DJ Silvah",
      artwork: "assets/Flo album art.png",
      src: "assets/audio/01-flo.mp3",
      video: "",
      preset: "music"
    },

    mist: {
      title: "Mist",
      artist: "DJ Silvah",
      artwork: "assets/Mist album art.png",
      src: "assets/audio/02-mist.mp3",
      video: "",
      preset: "music"
    },

    kiss: {
      title: "Kiss",
      artist: "DJ Silvah",
      artwork: "assets/Kiss album art.png",
      src: "assets/audio/03-kiss.mp3",
      video: "",
      preset: "music"
    },

    "london-poppy": {
      title: "London Poppy",
      artist: "DJ Silvah",
      artwork: "assets/London Poppy album art.png",
      src: "assets/audio/04-london-poppy.mp3",
      video: "",
      preset: "music"
    },

    elle: {
      title: "Elle",
      artist: "DJ Silvah",
      artwork: "assets/Elle Album Art.png",
      src: "assets/audio/05-elle.mp3",
      video: "",
      preset: "music"
    },

    "new-york-moods": {
      title: "New York Moods",
      artist: "DJ Silvah",
      artwork: "assets/New York Moods album Art.png",
      src: "assets/audio/06-new-york-moods.mp3",
      video: "",
      preset: "music"
    },

    "j-hollands": {
      title: "J-Hollands",
      artist: "DJ Silvah",
      artwork: "assets/J-Jollands Album Art.png",
      src: "assets/audio/07-j-hollands.mp3",
      video: "",
      preset: "music"
    },

    tipsy: {
      title: "Tipsy",
      artist: "DJ Silvah",
      artwork: "",
      src: "assets/audio/08-tipsy.mp3",
      video: "",
      preset: "music"
    },

    faded: {
      title: "Faded",
      artist: "DJ Silvah",
      artwork: "",
      src: "assets/audio/09-faded.mp3",
      video: "",
      preset: "music"
    },

    "sex-me-next": {
      title: "Sex Me Next",
      artist: "DJ Silvah",
      artwork: "",
      src: "assets/audio/10-sex-me-next.mp3",
      video: "",
      preset: "music"
    },

    "every-version-of-me": {
      title: "Every Version of Me",
      artist: "DJ Silvah",
      artwork: "assets/11-every-version-of-me-cover.png",
      src: "assets/audio/11-every-version-of-me.mp3",
      video: "",
      preset: "music"
    },

    "cajun-drummer": {
      title: "Cajun Drummer",
      artist: "DJ Silvah",
      artwork: "assets/12-cajun-drummer-cover.png",
      src: "assets/audio/12-cajun-drummer.mp3",
      video: "",
      preset: "music"
    },

    java: {
      title: "Java",
      artist: "DJ Silvah",
      artwork: "assets/13-java-cover.png",
      src: "assets/audio/13-java.mp3",
      video: "",
      preset: "music"
    },

    "k-hall": {
      title: "K-Hall",
      artist: "DJ Silvah",
      artwork: "assets/14-k-hall-cover.png",
      src: "assets/audio/14-k-hall.mp3",
      video: "",
      preset: "music"
    },

    "still-becoming": {
      title: "Still Becoming",
      artist: "DJ Silvah",
      artwork: "assets/15-still-becoming-cover.png",
      src: "assets/audio/15-still-becoming.mp3",
      video: "",
      preset: "music"
    },

    "audrey-lane": {
      title: "Audrey Lane",
      artist: "DJ Silvah",
      artwork: "assets/16-audrey-lane-cover.png",
      src: "assets/audio/16-audrey-lane.mp3",
      video: "",
      preset: "music"
    },

    "cold-steel-drum-section": {
      title: "Cold Steel Drum Section",
      artist: "DJ Silvah",
      artwork: "assets/17-cold-steel-drum-section-cover.png",
      src: "assets/audio/17-cold-steel-drum-section.mp3",
      video: "",
      preset: "music"
    },

    "yahz-chyld-318": {
      title: "Yahz Chyld 318",
      artist: "DJ Silvah",
      artwork: "assets/18-yahz-chyld-318-cover.png",
      src: "assets/audio/18-yahz-chyld-318.mp3",
      video: "",
      preset: "music"
    },

    "university-park-2": {
      title: "University Park 2",
      artist: "DJ Silvah",
      artwork: "assets/19-university-park-2-cover.png",
      src: "assets/audio/19-university-park-2.mp3",
      video: "",
      preset: "music"
    },

    "university-park": {
      title: "University Park",
      artist: "DJ Silvah",
      artwork: "assets/20-university-park-cover.png",
      src: "assets/audio/20-university-park.mp3",
      video: "",
      preset: "music"
    },

    yahcemity: {
      title: "Yahcemity",
      artist: "DJ Silvah",
      artwork: "assets/21-yahcemity-cover.png",
      src: "assets/audio/21-yahcemity.mp3",
      video: "",
      preset: "music"
    },

    pause: {
      title: "Pause",
      artist: "DJ Silvah",
      artwork: "assets/Pause Art.png",
      src: "assets/audio/22-pause.mp3",
      video: "",
      preset: "music"
    },

    "smoke-and-prayer": {
      title: "Smoke & Prayer",
      artist: "DJ Silvah",
      artwork: "assets/Smoke & Prayer art.png",
      src: "assets/audio/23-smoke-&- prayer.mp3",
      video: "",
      preset: "music"
    },

    "same-sun": {
      title: "Same Sun",
      artist: "DJ Silvah",
      artwork: "assets/Same Sun art.png",
      src: "assets/audio/24-same-sun.mp3",
      video: "",
      preset: "music"
    }

  };


  const channelConfig = {

    lobby: {
      label: "Main Lobby",
      hero: heroSources.lobby,
      adGroup: "clean",

      tracks: [
        trackLibrary.flo,
        trackLibrary.mist,
        trackLibrary.kiss,
        trackLibrary["london-poppy"],
        trackLibrary.elle,
        trackLibrary["new-york-moods"],
        trackLibrary["j-hollands"],
        trackLibrary["every-version-of-me"],
        trackLibrary["cajun-drummer"],
        trackLibrary.java,
        trackLibrary["k-hall"],
        trackLibrary["still-becoming"],
        trackLibrary["audrey-lane"],
        trackLibrary["cold-steel-drum-section"],
        trackLibrary["yahz-chyld-318"],
        trackLibrary["university-park-2"],
        trackLibrary["university-park"],
        trackLibrary.yahcemity,
        trackLibrary.pause,
        trackLibrary["smoke-and-prayer"],
        trackLibrary["same-sun"]
      ]
    },

    "hip-hop": {
      label: "Hip Hop",
      hero: heroSources["hip-hop"],
      adGroup: "nightlife",
      tracks: []
    },

    rnb: {
      label: "R&B",
      hero: heroSources.rnb,
      adGroup: "nightlife",

      tracks: [
        trackLibrary.tipsy,
        trackLibrary.faded,
        trackLibrary["sex-me-next"]
      ]
    },

    house: {
      label: "House",
      hero: heroSources.house,
      adGroup: "nightlife",
      tracks: []
    },

    reggae: {
      label: "Reggae",
      hero: heroSources.reggae,
      adGroup: "clean",
      tracks: []
    },

    gospel: {
      label: "Gospel",
      hero: heroSources.gospel,
      adGroup: "clean",

      tracks: [
        trackLibrary["son-of-a-preacher-man"]
      ]
    }

  };


  /* =========================================================
     LIVE STATION / STATION IDS
  ========================================================= */

  const stationIds = [

    {
      title: "You're Listening to AV Junki Radio",
      artist: "AV Junki Radio",
      artwork: "",
      src: "assets/audio/ids/AVJ_ID_01_Youre_Listening.mp3",
      video: "",
      preset: "music",
      isStationId: true
    },

    {
      title: "Where the Vibe Lives",
      artist: "AV Junki Radio",
      artwork: "",
      src: "assets/audio/ids/AVJ_ID_02_Where_The_Vibe_Lives.mp3",
      video: "",
      preset: "music",
      isStationId: true
    },

    {
      title: "This Is AV Junki Radio",
      artist: "AV Junki Radio",
      artwork: "",
      src: "assets/audio/ids/AVJ_ID_03_This_Is_AV_Junki_Radio.mp3",
      video: "",
      preset: "music",
      isStationId: true
    },

    {
      title: "Stay Right Here",
      artist: "AV Junki Radio",
      artwork: "",
      src: "assets/audio/ids/AVJ_ID_04_Stay_Right_Here.mp3",
      video: "",
      preset: "music",
      isStationId: true
    },

    {
      title: "Smooth Jazz to Soul",
      artist: "AV Junki Radio",
      artwork: "",
      src: "assets/audio/ids/AVJ_ID_05_Smooth_Jazz_To_Soul.mp3",
      video: "",
      preset: "music",
      isStationId: true
    },

    {
      title: "Music for the Moment",
      artist: "AV Junki Radio",
      artwork: "",
      src: "assets/audio/ids/AVJ_ID_06_Music_For_The_Moment.mp3",
      video: "",
      preset: "music",
      isStationId: true
    },

    {
      title: "No Rush, No Noise",
      artist: "AV Junki Radio",
      artwork: "",
      src: "assets/audio/ids/AVJ_ID_07_No_Rush_No_Noise.mp3",
      video: "",
      preset: "music",
      isStationId: true
    },

    {
      title: "Settle In",
      artist: "AV Junki Radio",
      artwork: "",
      src: "assets/audio/ids/AVJ_ID_08_Settle_In.mp3",
      video: "",
      preset: "music",
      isStationId: true
    }

  ];


  const liveDurationSeconds = {

    "assets/audio/01-flo.mp3":
      179.640,

    "assets/audio/02-mist.mp3":
      213.024,

    "assets/audio/03-kiss.mp3":
      179.544,

    "assets/audio/04-london-poppy.mp3":
      202.440,

    "assets/audio/05-elle.mp3":
      179.592,

    "assets/audio/06-new-york-moods.mp3":
      404.040,

    "assets/audio/07-j-hollands.mp3":
      254.232,

    "assets/audio/11-every-version-of-me.mp3":
      228.384,

    "assets/audio/12-cajun-drummer.mp3":
      224.832,

    "assets/audio/13-java.mp3":
      224.784,

    "assets/audio/14-k-hall.mp3":
      224.784,

    "assets/audio/15-still-becoming.mp3":
      349.968,

    "assets/audio/16-audrey-lane.mp3":
      224.832,

    "assets/audio/17-cold-steel-drum-section.mp3":
      224.544,

    "assets/audio/18-yahz-chyld-318.mp3":
      224.832,

    "assets/audio/19-university-park-2.mp3":
      224.880,

    "assets/audio/20-university-park.mp3":
      224.832,

    "assets/audio/21-yahcemity.mp3":
      224.664,

    "assets/audio/22-pause.mp3":
      324.024,

    "assets/audio/23-smoke-&- prayer.mp3":
      318.432,

    "assets/audio/24-same-sun.mp3":
      302.664,

    "assets/audio/ids/AVJ_ID_01_Youre_Listening.mp3":
      4.101224,

    "assets/audio/ids/AVJ_ID_02_Where_The_Vibe_Lives.mp3":
      7.601633,

    "assets/audio/ids/AVJ_ID_03_This_Is_AV_Junki_Radio.mp3":
      3.082449,

    "assets/audio/ids/AVJ_ID_04_Stay_Right_Here.mp3":
      4.754286,

    "assets/audio/ids/AVJ_ID_05_Smooth_Jazz_To_Soul.mp3":
      11.441633,

    "assets/audio/ids/AVJ_ID_06_Music_For_The_Moment.mp3":
      10.344490,

    "assets/audio/ids/AVJ_ID_07_No_Rush_No_Noise.mp3":
      14.602449,

    "assets/audio/ids/AVJ_ID_08_Settle_In.mp3":
      14.602449

  };


  const LIVE_STATION_CHANNEL =
    "lobby";

  const LIVE_STATION_EPOCH_MS =
    Date.parse(
      "2026-09-20T00:00:00Z"
    );

  const LIVE_STATION_ROUNDS =
    17;

  const LIVE_STATION_SONGS_PER_ID =
    4;

  const LIVE_STATION_DRIFT_TOLERANCE =
    1.25;

  let liveStationProgram =
    [];

  let liveStationDuration =
    0;


  function hashStationSeed(
    value
  ) {

    let hash =
      2166136261;

    const source =
      String(
        value
      );

    for (
      let index = 0;
      index < source.length;
      index += 1
    ) {

      hash ^=
        source.charCodeAt(
          index
        );

      hash =
        Math.imul(
          hash,
          16777619
        );

    }

    return hash >>> 0;

  }


  function seededStationRandom(
    seed
  ) {

    let state =
      seed >>> 0;

    return () => {

      state +=
        0x6D2B79F5;

      let value =
        state;

      value =
        Math.imul(
          value ^
          (value >>> 15),
          value | 1
        );

      value ^=
        value +
        Math.imul(
          value ^
          (value >>> 7),
          value | 61
        );

      return (
        (
          value ^
          (value >>> 14)
        ) >>> 0
      ) / 4294967296;

    };

  }


  function seededShuffle(
    items,
    seedLabel
  ) {

    const shuffled =
      [
        ...items
      ];

    const random =
      seededStationRandom(
        hashStationSeed(
          seedLabel
        )
      );

    for (
      let index =
        shuffled.length - 1;

      index > 0;

      index -= 1
    ) {

      const swapIndex =
        Math.floor(
          random() *
          (index + 1)
        );

      [
        shuffled[index],
        shuffled[swapIndex]
      ] = [
        shuffled[swapIndex],
        shuffled[index]
      ];

    }

    return shuffled;

  }


  function getRequiredDuration(
    track
  ) {

    const duration =
      liveDurationSeconds[
        track.src
      ];

    if (
      !Number.isFinite(
        duration
      ) ||
      duration <= 0
    ) {

      console.error(
        "AV Junki Radio missing duration:",
        track.src
      );

      return 240;

    }

    return duration;

  }


  function buildStationIdQueue(
    count
  ) {

    const queue =
      [];

    let previousSource =
      "";

    let deckNumber =
      0;

    while (
      queue.length <
      count
    ) {

      const deck =
        seededShuffle(
          stationIds,
          `AVJ-ID-DECK-${deckNumber}`
        );

      if (
        previousSource &&
        deck.length > 1 &&
        deck[0].src ===
          previousSource
      ) {

        [
          deck[0],
          deck[1]
        ] = [
          deck[1],
          deck[0]
        ];

      }

      deck.forEach(
        (stationId) => {

          queue.push(
            stationId
          );

        }
      );

      previousSource =
        deck[
          deck.length - 1
        ].src;

      deckNumber +=
        1;

    }

    return queue.slice(
      0,
      count
    );

  }


  function buildLiveStationProgram() {

    const lobbyTracks =
      channelConfig[
        LIVE_STATION_CHANNEL
      ].tracks.map(
        (track, index) => ({

          track,

          playlistIndex:
            index

        })
      );

    const idsPerRound =
      Math.floor(
        lobbyTracks.length /
        LIVE_STATION_SONGS_PER_ID
      );

    const idQueue =
      buildStationIdQueue(
        idsPerRound *
        LIVE_STATION_ROUNDS
      );

    const program =
      [];

    let stationIdIndex =
      0;

    let previousLastSource =
      "";

    for (
      let round = 0;

      round <
      LIVE_STATION_ROUNDS;

      round += 1
    ) {

      const order =
        seededShuffle(
          lobbyTracks,
          `AVJ-JAZZ-ROUND-${round}`
        );

      if (
        previousLastSource &&
        order.length > 1 &&
        order[0].track.src ===
          previousLastSource
      ) {

        const swapIndex =
          order.findIndex(
            (entry) =>

              entry.track.src !==
              previousLastSource
          );

        if (
          swapIndex > 0
        ) {

          [
            order[0],
            order[swapIndex]
          ] = [
            order[swapIndex],
            order[0]
          ];

        }

      }


      order.forEach(
        (
          entry,
          songIndex
        ) => {

          program.push({

            type:
              "music",

            track:
              entry.track,

            playlistIndex:
              entry.playlistIndex,

            duration:
              getRequiredDuration(
                entry.track
              )

          });


          if (
            (songIndex + 1) %
              LIVE_STATION_SONGS_PER_ID ===
              0 &&
            stationIdIndex <
              idQueue.length
          ) {

            const stationId =
              idQueue[
                stationIdIndex
              ];

            program.push({

              type:
                "id",

              track:
                stationId,

              playlistIndex:
                null,

              duration:
                getRequiredDuration(
                  stationId
                )

            });

            stationIdIndex +=
              1;

          }

        }
      );

      previousLastSource =
        order[
          order.length - 1
        ].track.src;

    }


    let cursor =
      0;

    program.forEach(
      (item) => {

        item.start =
          cursor;

        item.end =
          cursor +
          item.duration;

        cursor =
          item.end;

      }
    );

    liveStationProgram =
      program;

    liveStationDuration =
      cursor;

  }


  function getLiveStationPosition(
    referenceMs =
      Date.now()
  ) {

    if (
      !liveStationProgram.length ||
      liveStationDuration <= 0
    ) {

      return null;

    }

    const elapsedSeconds =
      (
        referenceMs -
        LIVE_STATION_EPOCH_MS
      ) /
      1000;

    const stationSecond =
      (
        (
          elapsedSeconds %
          liveStationDuration
        ) +
        liveStationDuration
      ) %
      liveStationDuration;

    for (
      let index = 0;

      index <
      liveStationProgram.length;

      index += 1
    ) {

      const item =
        liveStationProgram[
          index
        ];

      if (
        stationSecond <
        item.end
      ) {

        return {

          item,

          offset:
            stationSecond -
            item.start

        };

      }

    }

    return {

      item:
        liveStationProgram[0],

      offset:
        0

    };

  }


  function seekLiveAudio(
    seconds
  ) {

    return new Promise(
      (resolve) => {

        if (
          !audio
        ) {

          resolve();

          return;

        }

        let finished =
          false;

        const applySeek =
          () => {

            if (
              finished
            ) {

              return;

            }

            finished =
              true;

            const mediaDuration =
              Number.isFinite(
                audio.duration
              )

                ? audio.duration

                : 0;

            const maximum =
              mediaDuration > 0.25

                ? mediaDuration - 0.20

                : seconds;

            try {

              audio.currentTime =
                Math.max(
                  0,
                  Math.min(
                    seconds,
                    maximum
                  )
                );

            } catch (error) {

              console.warn(
                "AV Junki Radio live seek warning:",
                error
              );

            }

            resolve();

          };

        if (
          audio.readyState >=
          1
        ) {

          applySeek();

          return;

        }

        audio.addEventListener(
          "loadedmetadata",
          applySeek,
          {
            once: true
          }
        );

        window.setTimeout(
          applySeek,
          4000
        );

      }
    );

  }


  async function syncToLiveStation(
    autoplay = false,
    leadMilliseconds = 0
  ) {

    if (
      activeChannel !==
        LIVE_STATION_CHANNEL ||
      !audio
    ) {

      return;

    }

    const position =
      getLiveStationPosition(
        Date.now() +
        leadMilliseconds
      );

    if (
      !position
    ) {

      return;

    }

    const item =
      position.item;

    const currentSource =
      audio.getAttribute(
        "src"
      ) ||
      "";

    const sourceChanged =
      currentSource !==
      item.track.src;

    if (
      sourceChanged
    ) {

      window.setRadioTrack(
        item.track
      );

    }

    if (
      item.type ===
        "music" &&
      Number.isInteger(
        item.playlistIndex
      )
    ) {

      currentTrackIndex =
        item.playlistIndex;

    }

    if (
      sourceChanged ||
      Math.abs(
        audio.currentTime -
        position.offset
      ) >
        LIVE_STATION_DRIFT_TOLERANCE
    ) {

      await seekLiveAudio(
        position.offset
      );

    }

    setMainstreamState(
      true
    );

    if (
      autoplay
    ) {

      await resumeAudioContext();

      try {

        await audio.play();

      } catch (error) {

        console.error(
          "AV Junki Radio live playback error:",
          error
        );

        setStatus(
          "Press Listen to join the live station."
        );

      }

    }

  }


  buildLiveStationProgram();


  let activeChannel =
    "lobby";

  let playlist =
    channelConfig[
      activeChannel
    ].tracks;

  let currentTrackIndex =
    0;

  let activeHeroLayer =
    0;


  Object
    .values(
      heroSources
    )
    .forEach(
      (src) => {

        const image =
          new Image();

        image.src =
          src;

      }
    );


  function setHero(
    src
  ) {

    if (
      !heroImage ||
      !heroImageNext ||
      !src
    ) {

      return;

    }

    const currentLayer =
      activeHeroLayer === 0
        ? heroImage
        : heroImageNext;

    const nextLayer =
      activeHeroLayer === 0
        ? heroImageNext
        : heroImage;

    if (
      currentLayer
        .getAttribute(
          "src"
        ) ===
      src
    ) {

      return;

    }

    nextLayer.src =
      src;

    nextLayer.style.opacity =
      "0";

    nextLayer
      .getBoundingClientRect();

    window
      .requestAnimationFrame(
        () => {

          currentLayer
            .style
            .opacity =
            "0";

          nextLayer
            .style
            .opacity =
            "1";

          activeHeroLayer =
            activeHeroLayer === 0
              ? 1
              : 0;

        }
      );

  }


  function resetPlayerDisplay(
    channel
  ) {

    if (
      audio
    ) {

      audio.pause();

      audio
        .removeAttribute(
          "src"
        );

      audio.load();

    }

    stopTrackVideo();

    if (
      albumArt
    ) {

      albumArt
        .style
        .backgroundImage =
        "none";

    }

    if (
      trackTitle
    ) {

      trackTitle.textContent =
        channelConfig[
          channel
        ].label;

    }

    if (
      trackArtist
    ) {

      trackArtist.textContent =
        "Music coming soon";

    }

    setMainstreamState(
      false
    );

    showScreenSaver();

  }


  function setActivePanel(
    channel
  ) {

    panelButtons.forEach(
      (button) => {

        const isActive =
          button.dataset.channel ===
          channel;

        button.setAttribute(
          "aria-pressed",
          isActive
            ? "true"
            : "false"
        );

      }
    );

  }


  function switchMusicChannel(
    channel
  ) {

    const config =
      channelConfig[
        channel
      ];

    if (
      !config
    ) {

      return;

    }

    const wasPlaying =
      Boolean(
        audio &&
        !audio.paused &&
        hasAudioSource()
      );

    activeChannel =
      channel;

    playlist =
      config.tracks;

    currentTrackIndex =
      0;

    if (
      playPause &&
      channel !==
        LIVE_STATION_CHANNEL &&
      !wasPlaying
    ) {

      playPause.textContent =
        "▶";

      playPause.setAttribute(
        "aria-label",
        "Play"
      );

    }

    if (
      playPause &&
      channel ===
        LIVE_STATION_CHANNEL &&
      !wasPlaying
    ) {

      playPause.textContent =
        "LISTEN";

      playPause.setAttribute(
        "aria-label",
        "Listen live"
      );

    }

    setHero(
      config.hero
    );

    setActivePanel(
      channel
    );

    if (
      screenContent
    ) {

      screenContent
        .dataset
        .radioChannel =
        channel;

      screenContent
        .dataset
        .adGroup =
        config.adGroup;

    }

    document
      .documentElement
      .dataset
      .radioChannel =
      channel;

    if (
      playlist.length
    ) {

      if (
        channel ===
          LIVE_STATION_CHANNEL
      ) {

        syncToLiveStation(
          wasPlaying
        );

      } else {

        loadTrack(
          0,
          wasPlaying
        );

      }

    } else {

      resetPlayerDisplay(
        channel
      );

    }

    applyPreset(
      "music"
    );

    setStatus(
      config.label
    );

  }


  /* =========================================================
     DEFAULT SCREEN SAVER
  ========================================================= */

  function showNowPlaying() {

    if (!nowPlaying) {
      return;
    }

    hideDropVisual();

    if (screenSaver) {

      screenSaver.classList.add(
        "is-hidden"
      );

    }

    nowPlaying.classList.add(
      "is-active"
    );

    if (trackVideo) {

      trackVideo.style.display =
        "none";

    }

  }


  function showScreenSaver() {

    hideDropVisual();

    if (
      screenSaver
    ) {

      screenSaver
        .classList
        .remove(
          "is-hidden"
        );

      if (
        nowPlaying
      ) {

        nowPlaying.classList.remove(
          "is-active"
        );

      }

    }

    if (
      trackVideo
    ) {

      trackVideo
        .style
        .display =
        "none";

    }

  }


  function hideScreenSaver() {

    if (
      screenSaver
    ) {

      screenSaver
        .classList
        .add(
          "is-hidden"
        );

    }

  }


  if (
    screenSaverImage
  ) {

    screenSaverImage
      .addEventListener(
        "error",
        () => {

          screenSaverImage
            .style
            .display =
            "none";

        }
      );

  }


  /* =========================================================
     STATION ID DROP SCREEN / REACTIVE WAVEFORM
  ========================================================= */

  function ensureDropVisual() {

    if (
      !screenContent
    ) {

      return null;

    }

    if (
      dropVisual &&
      dropWaveCanvas
    ) {

      return dropVisual;

    }

    /*
      Make sure the drop overlay anchors to
      the center-screen container.
    */

    const screenPosition =
      window
        .getComputedStyle(
          screenContent
        )
        .position;

    if (
      screenPosition ===
      "static"
    ) {

      screenContent.style.position =
        "relative";

    }


    dropVisual =
      document.createElement(
        "div"
      );

    dropVisual.id =
      "radio-drop-visual";

    dropVisual.setAttribute(
      "aria-label",
      "AV Junki Radio station identification"
    );

    Object.assign(
      dropVisual.style,
      {
        position:
          "absolute",

        inset:
          "0",

        display:
          "none",

        overflow:
          "hidden",

        zIndex:
          "12",

        pointerEvents:
          "none",

        backgroundImage:
          `url("${DROP_SCREEN_SRC}")`,

        backgroundSize:
          "cover",

        backgroundPosition:
          "center",

        backgroundRepeat:
          "no-repeat"
      }
    );


    dropWaveCanvas =
      document.createElement(
        "canvas"
      );

    dropWaveCanvas.id =
      "radio-drop-waveform";

    dropWaveCanvas.setAttribute(
      "aria-hidden",
      "true"
    );

    Object.assign(
      dropWaveCanvas.style,
      {
        position:
          "absolute",

        left:
          "50%",

        top:
          "67%",

        transform:
          "translate(-50%, -50%)",

        width:
          "82%",

        height:
          "26%",

        display:
          "block",

        pointerEvents:
          "none"
      }
    );


    dropVisual.appendChild(
      dropWaveCanvas
    );

    screenContent.appendChild(
      dropVisual
    );

    return dropVisual;

  }


  function resizeDropWaveCanvas() {

    if (
      !dropWaveCanvas
    ) {

      return;

    }

    const rect =
      dropWaveCanvas
        .getBoundingClientRect();

    const dpr =
      Math.max(
        1,
        Math.min(
          window.devicePixelRatio ||
          1,
          2
        )
      );

    const width =
      Math.max(
        1,
        Math.round(
          rect.width *
          dpr
        )
      );

    const height =
      Math.max(
        1,
        Math.round(
          rect.height *
          dpr
        )
      );

    if (
      dropWaveCanvas.width !==
        width ||
      dropWaveCanvas.height !==
        height
    ) {

      dropWaveCanvas.width =
        width;

      dropWaveCanvas.height =
        height;

    }

  }


  function hideDropVisual() {

    if (
      dropVisual
    ) {

      dropVisual.style.display =
        "none";

    }

  }


  function showDropVisual() {

    const visual =
      ensureDropVisual();

    if (
      !visual
    ) {

      return;

    }

    if (
      screenSaver
    ) {

      screenSaver.classList.add(
        "is-hidden"
      );

    }

    if (
      nowPlaying
    ) {

      nowPlaying.classList.remove(
        "is-active"
      );

    }

    if (
      trackVideo
    ) {

      trackVideo.style.display =
        "none";

    }

    visual.style.display =
      "block";

    resizeDropWaveCanvas();

  }


  function drawDropWaveform(
    timeData
  ) {

    if (
      !currentTrackIsStationId ||
      !analyser ||
      !dropVisual ||
      dropVisual.style.display ===
        "none" ||
      !dropWaveCanvas ||
      !timeData ||
      !timeData.length
    ) {

      return;

    }

    analyser.getByteTimeDomainData(
      timeData
    );

    resizeDropWaveCanvas();

    const ctx =
      dropWaveCanvas.getContext(
        "2d"
      );

    if (
      !ctx
    ) {

      return;

    }

    const width =
      dropWaveCanvas.width;

    const height =
      dropWaveCanvas.height;

    const centerY =
      height / 2;

    ctx.clearRect(
      0,
      0,
      width,
      height
    );


    /*
      Soft center guide.
    */

    ctx.beginPath();

    ctx.moveTo(
      0,
      centerY
    );

    ctx.lineTo(
      width,
      centerY
    );

    ctx.strokeStyle =
      "rgba(205, 238, 255, 0.20)";

    ctx.lineWidth =
      Math.max(
        1,
        height * 0.006
      );

    ctx.stroke();


    /*
      Main long-form reactive voice waveform.
      It spans roughly 80% of the drop screen.
    */

    ctx.beginPath();

    const sampleCount =
      Math.min(
        timeData.length,
        Math.max(
          256,
          Math.floor(
            width / 2
          )
        )
      );

    const step =
      timeData.length /
      sampleCount;

    for (
      let i = 0;
      i < sampleCount;
      i += 1
    ) {

      const sampleIndex =
        Math.min(
          timeData.length - 1,
          Math.floor(
            i *
            step
          )
        );

      const normalized =
        (
          timeData[
            sampleIndex
          ] -
          128
        ) /
        128;

      const x =
        (
          i /
          (sampleCount - 1)
        ) *
        width;

      const y =
        centerY +
        normalized *
        height *
        0.40;

      if (
        i === 0
      ) {

        ctx.moveTo(
          x,
          y
        );

      } else {

        ctx.lineTo(
          x,
          y
        );

      }

    }

    ctx.strokeStyle =
      "rgba(245, 252, 255, 0.98)";

    ctx.lineWidth =
      Math.max(
        2,
        height * 0.022
      );

    ctx.lineJoin =
      "round";

    ctx.lineCap =
      "round";

    ctx.shadowColor =
      "rgba(105, 205, 255, 0.95)";

    ctx.shadowBlur =
      Math.max(
        8,
        height * 0.10
      );

    ctx.stroke();

    ctx.shadowBlur =
      0;

  }


  /* =========================================================
     MUSIC VIDEO ENGINE
  ========================================================= */

  function ensureTrackVideo() {

    if (
      !screenContent
    ) {

      return null;

    }

    if (
      trackVideo
    ) {

      return trackVideo;

    }

    trackVideo =
      document
        .createElement(
          "video"
        );

    trackVideo.id =
      "radio-track-video";

    trackVideo.muted =
      true;

    trackVideo.playsInline =
      true;

    trackVideo.preload =
      "metadata";

    trackVideo.setAttribute(
      "aria-label",
      "Now playing music video"
    );

    trackVideo
      .style
      .display =
      "none";

    screenContent
      .appendChild(
        trackVideo
      );

    return trackVideo;

  }


  function syncVideoToAudio(
    force = false
  ) {

    if (
      !audio ||
      !trackVideo ||
      !trackVideo.getAttribute(
        "src"
      )
    ) {

      return;

    }

    const difference =
      Math.abs(
        trackVideo.currentTime -
        audio.currentTime
      );

    if (
      force ||
      difference >
        0.35
    ) {

      try {

        trackVideo.currentTime =
          Math.max(
            0,
            audio.currentTime -
            0.07
          );

      } catch (error) {

      }

    }

  }


  function showTrackVideo() {

    if (
      currentTrackIsStationId
    ) {

      showDropVisual();

      return;

    }

    hideDropVisual();

    const video =
      ensureTrackVideo();

    if (
      !video ||
      !video.getAttribute(
        "src"
      )
    ) {

      if (
        nowPlayingArt &&
        nowPlayingArt.getAttribute(
          "src"
        )
      ) {

        showNowPlaying();

      } else {

        showScreenSaver();

      }

      return;

    }

    hideScreenSaver();

    video.style.display =
      "block";

    syncVideoToAudio(
      true
    );

    const promise =
      video.play();

    if (
      promise &&
      typeof promise.catch ===
        "function"
    ) {

      promise.catch(
        () => {}
      );

    }

  }


  function pauseTrackVideo() {

    if (
      !trackVideo
    ) {

      return;

    }

    trackVideo.pause();

  }


  function stopTrackVideo() {

    hideDropVisual();

    if (
      !trackVideo
    ) {

      showScreenSaver();

      return;

    }

    trackVideo.pause();

    try {

      trackVideo.currentTime =
        0;

    } catch (error) {

    }

    trackVideo.style.display =
      "none";

    showScreenSaver();

  }


  /* =========================================================
     PLAYLIST ENGINE
  ========================================================= */

  function loadTrack(
    index,
    autoplay = false
  ) {

    if (
      !playlist.length
    ) {

      return;

    }

    currentTrackIndex =
      (
        index +
        playlist.length
      ) %
      playlist.length;

    const track =
      playlist[
        currentTrackIndex
      ];

    window.setRadioTrack(
      track
    );

    if (
      autoplay &&
      audio
    ) {

      resumeAudioContext()
        .then(
          async () => {

            try {

              await audio.play();

            } catch (error) {

              console.error(
                "AV Junki Radio autoplay error:",
                error
              );

              setStatus(
                "Press Listen to continue the station."
              );

            }

          }
        );

    }

  }


  function playNextTrack() {

    if (
      activeChannel ===
        LIVE_STATION_CHANNEL
    ) {

      syncToLiveStation(
        true,
        500
      );

      return;

    }

    if (
      playlist.length <=
      1
    ) {

      loadTrack(
        0,
        true
      );

      return;

    }

    let nextTrackIndex;

    do {

      nextTrackIndex =
        Math.floor(
          Math.random() *
          playlist.length
        );

    } while (
      nextTrackIndex ===
      currentTrackIndex
    );

    loadTrack(
      nextTrackIndex,
      true
    );

  }


  if (
    previousTrack
  ) {

    previousTrack
      .addEventListener(
        "click",
        () => {

          if (
            activeChannel ===
              LIVE_STATION_CHANNEL
          ) {

            syncToLiveStation(
              true
            );

            setStatus(
              "Live station — synced to now."
            );

            return;

          }

          loadTrack(
            currentTrackIndex -
            1,
            true
          );

        }
      );

  }


  if (
    nextTrack
  ) {

    nextTrack
      .addEventListener(
        "click",
        () => {

          if (
            activeChannel ===
              LIVE_STATION_CHANNEL
          ) {

            syncToLiveStation(
              true
            );

            setStatus(
              "Live station — synced to now."
            );

            return;

          }

          playNextTrack();

        }
      );

  }


  /* =========================================================
     PLAYER CONTROLS
  ========================================================= */

  if (
    playPause &&
    audio
  ) {

    playPause
      .addEventListener(
        "click",
        async () => {

          if (
            activeChannel ===
              LIVE_STATION_CHANNEL
          ) {

            if (
              !audio.paused
            ) {

              audio.pause();

              setStatus(
                "Live audio paused. Press Listen to rejoin now."
              );

              return;

            }

            await syncToLiveStation(
              true
            );

            return;

          }

          if (
            !hasAudioSource()
          ) {

            setMainstreamState(
              false
            );

            setStatus(
              "Mainstream is off air — stream source not connected yet."
            );

            return;

          }

          await resumeAudioContext();

          try {

            if (
              audio.paused
            ) {

              await audio.play();

            } else {

              audio.pause();

            }

          } catch (error) {

            console.error(
              "AV Junki Radio playback error:",
              error
            );

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
          activeChannel ===
            LIVE_STATION_CHANNEL
              ? "Pause live radio"
              : "Pause"
        );

        setMainstreamState(
          true
        );

      }
    );


    audio.addEventListener(
      "pause",
      () => {

        if (
          activeChannel ===
            LIVE_STATION_CHANNEL
        ) {

          playPause.textContent =
            "LISTEN";

          playPause.setAttribute(
            "aria-label",
            "Listen live"
          );

          setMainstreamState(
            true
          );

          return;

        }

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
      "error",
      () => {

        setMainstreamState(
          false
        );

      }
    );

  }


  if (
    mainstreamStatus
  ) {

    mainstreamStatus
      .addEventListener(
        "click",
        () => {

          if (
            activeChannel ===
              LIVE_STATION_CHANNEL
          ) {

            setStatus(
              "Mainstream is on air."
            );

            return;

          }

          setStatus(
            audio &&
            !audio.paused &&
            hasAudioSource()

              ? "Mainstream is on air."

              : "Mainstream is off air."
          );

        }
      );

  }


  /* =========================================================
     CENTER SCREEN NAVIGATION
  ========================================================= */

  screenButtons.forEach(
    (button) => {

      button.addEventListener(
        "click",
        () => {

          const screen =
            button.dataset.screen ||
            "";

          if (
            screenContent
          ) {

            screenContent
              .dataset
              .activeScreen =
              screen;

          }

          stopTrackVideo();

          setStatus(
            formatLabel(
              screen
            )
          );

        }
      );

    }
  );


  /* =========================================================
     GENRE / CHANNEL PANELS
  ========================================================= */

  panelButtons.forEach(
    (button) => {

      button.addEventListener(
        "click",
        () => {

          const channel =
            button.dataset.channel ||
            "";

          if (
            channelConfig[
              channel
            ]
          ) {

            switchMusicChannel(
              channel
            );

            return;

          }

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


  /* =========================================================
     PUBLIC TRACK LOADER
  ========================================================= */

  window.setRadioTrack =
    ({

      title =
        "AV Junki Radio",

      artist =
        "Music Lives Here",

      artwork =
        "",

      src =
        "",

      video =
        "",

      preset =
        "music",

      isStationId =
        false

    } = {}) => {


      currentTrackIsStationId =
        Boolean(
          isStationId
        );


      if (
        trackTitle
      ) {

        trackTitle.textContent =
          title;

      }


      if (
        trackArtist
      ) {

        trackArtist.textContent =
          artist;

      }


      if (
        albumArt
      ) {

        albumArt
          .style
          .backgroundImage =
          artwork

            ? `url("${artwork}")`

            : "none";

      }


      if (
        nowPlayingBackground
      ) {

        nowPlayingBackground.src =
          artwork ||
          "";

      }


      if (
        nowPlayingArt
      ) {

        nowPlayingArt.src =
          artwork ||
          "";

      }


      if (
        nowPlayingTitle
      ) {

        nowPlayingTitle.textContent =
          title;

      }


      if (
        nowPlayingArtist
      ) {

        nowPlayingArtist.textContent =
          artist;

      }


      applyPreset(
        preset
      );


      if (
        audio &&
        src
      ) {

        audio.pause();

        audio.src =
          src;

        audio.load();

        setMainstreamState(
          activeChannel ===
            LIVE_STATION_CHANNEL
        );

      }


      const videoElement =
        ensureTrackVideo();


      if (
        videoElement
      ) {

        videoElement.pause();

        videoElement
          .removeAttribute(
            "src"
          );

        videoElement.load();

        videoElement
          .style
          .display =
          "none";

        if (
          video
        ) {

          videoElement.src =
            video;

          videoElement.load();

        }

      }

      if (
        currentTrackIsStationId
      ) {

        showDropVisual();

      } else {

        hideDropVisual();

        showScreenSaver();

      }

    };


  /* =========================================================
     AUDIO / VIDEO EVENTS
  ========================================================= */

  if (
    audio
  ) {

    audio.addEventListener(
      "play",
      () => {

        showTrackVideo();

      }
    );


    audio.addEventListener(
      "pause",
      () => {

        pauseTrackVideo();

      }
    );


    audio.addEventListener(
      "seeking",
      () => {

        syncVideoToAudio(
          true
        );

      }
    );


    audio.addEventListener(
      "timeupdate",
      () => {

        if (
          videoSyncing
        ) {

          return;

        }

        videoSyncing =
          true;

        syncVideoToAudio(
          false
        );

        videoSyncing =
          false;

      }
    );


    audio.addEventListener(
      "ended",
      () => {

        stopTrackVideo();

        playNextTrack();

      }
    );

  }


  /* =========================================================
     LEFT INFO — LIVE CLOCK / DATE
  ========================================================= */

  function updateLeftInfoTime() {

    if (
      !leftInfoClock ||
      !leftInfoDate
    ) {

      return;

    }

    const now =
      new Date();

    leftInfoClock.textContent =
      now.toLocaleTimeString(
        [],
        {
          hour:
            "numeric",

          minute:
            "2-digit"
        }
      );

    leftInfoDate.textContent =
      now.toLocaleDateString(
        [],
        {
          weekday:
            "long",

          month:
            "long",

          day:
            "numeric"
        }
      );

  }


  /* =========================================================
     LEFT INFO — SPORTS
  ========================================================= */

  function showSport(
    index
  ) {

    const sport =
      sportsRotation[
        index
      ];

    if (
      !sport ||
      !sportsName ||
      !sportsTeamA ||
      !sportsScoreA ||
      !sportsTeamB ||
      !sportsScoreB ||
      !sportsStatus
    ) {

      return;

    }

    sportsName.textContent =
      sport.name;

    sportsTeamA.textContent =
      sport.teamA;

    sportsScoreA.textContent =
      sport.scoreA;

    sportsTeamB.textContent =
      sport.teamB;

    sportsScoreB.textContent =
      sport.scoreB;

    sportsStatus.textContent =
      sport.status;

  }


  function runSportsCycle() {

    let index =
      0;

    showSport(
      index
    );

    const sportsTimer =
      window.setInterval(
        () => {

          index +=
            1;

          if (
            index >=
            sportsRotation.length
          ) {

            window.clearInterval(
              sportsTimer
            );

            return;

          }

          showSport(
            index
          );

        },
        8000
      );

  }


  function scheduleSportsCycle() {

    showSport(
      0
    );

    window.setTimeout(
      () => {

        runSportsCycle();

      },
      2000
    );

  }


  /* =========================================================
     LEFT INFO — DOW PLACEHOLDER
  ========================================================= */

  function updateDowDisplay() {

    if (
      !dowValue ||
      !dowPoints ||
      !dowPercent ||
      !dowStatus
    ) {

      return;

    }

    dowValue.textContent =
      "46,250.00";

    dowPoints.textContent =
      "+125.50";

    dowPercent.textContent =
      "(+0.27%)";

    dowStatus.textContent =
      "MARKET CLOSED";

  }


  /* =========================================================
     PAGE EVENTS
  ========================================================= */

  window.addEventListener(
    "resize",
    () => {

      resizeSpectrumCanvas();

      resizeDropWaveCanvas();

    }
  );


  /* =========================================================
     INITIALIZE
  ========================================================= */

  setMainstreamState(
    false
  );

  setDSPState(
    false
  );

  resizeSpectrumCanvas();

  updateLeftInfoTime();

  window.setInterval(
    updateLeftInfoTime,
    1000
  );

  showSport(
    0
  );

  window.setTimeout(
    () => {

      scheduleSportsCycle();

      window.setInterval(
        () => {

          scheduleSportsCycle();

        },
        96000
      );

    },
    22000
  );

  updateDowDisplay();

  showScreenSaver();

  setActivePanel(
    activeChannel
  );

  if (
    screenContent
  ) {

    screenContent
      .dataset
      .radioChannel =
      activeChannel;

    screenContent
      .dataset
      .adGroup =
      channelConfig[
        activeChannel
      ].adGroup;

  }

  document
    .documentElement
    .dataset
    .radioChannel =
    activeChannel;

  if (
    playPause
  ) {

    playPause.textContent =
      "LISTEN";

    playPause.setAttribute(
      "aria-label",
      "Listen live"
    );

  }

  syncToLiveStation(
    false
  );

  setMainstreamState(
    true
  );

  window.setInterval(
    () => {

      if (
        activeChannel ===
          LIVE_STATION_CHANNEL &&
        audio &&
        !audio.paused
      ) {

        const position =
          getLiveStationPosition();

        const currentSource =
          audio.getAttribute(
            "src"
          ) ||
          "";

        const expectedSource =
          position &&
          position.item &&
          position.item.track
            ? position.item.track.src
            : "";

        /*
          SAFETY GUARD:
          Only correct timing while the SAME
          audio file is still supposed to be playing.

          Never replace a song mid-play just because
          the live station clock has moved ahead.
        */
        if (
          currentSource ===
          expectedSource
        ) {

          syncToLiveStation(
            true
          );

        }

      }

    },
    30000
  );

});
