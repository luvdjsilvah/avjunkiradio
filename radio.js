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
      spectrumCanvas
        .getContext(
          "2d"
        );

    if (!ctx) {
      return;
    }

    analyser
      .getByteFrequencyData(
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
      ctx
        .createLinearGradient(
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
        width *
        0.0035
      );

    const barWidth =
      (
        width -
        gap *
        (
          bars -
          1
        )
      ) /
      bars;

    for (
      let i = 0;
      i < bars;
      i += 1
    ) {

 for (
  let i = 0;
  i < bars;
  i += 1
) {

  const minBin = 1;

  const maxBin =
    Math.floor(
      frequencyData.length * 0.65
    );

  const normalizedPosition =
    i / (bars - 1);

  const dataIndex =
    Math.floor(
      minBin *
      Math.pow(
        maxBin / minBin,
        normalizedPosition
      )
    );

  const normalized =
    frequencyData[
      Math.min(
        dataIndex,
        frequencyData.length - 1
      )
    ] / 255;

  /*
     VISUAL FREQUENCY BALANCE
     Pull the bass down gradually without
     suppressing the mids and highs.
  */

  const bassControl =
    0.58 +
    (0.42 * normalizedPosition);

  const displayLevel =
    Math.pow(
      normalized * bassControl,
      1.25
    );

  const barHeight =
    Math.max(
      height * 0.04,
      displayLevel *
      height *
      0.90
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
     CHANNEL HEROES / PLAYLISTS / MUSIC VIDEO
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
     artwork: "assets/Ney York Moods album Art.png",
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
        trackLibrary["j-hollands"]
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

      loadTrack(
        0,
        wasPlaying
      );

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

  function showScreenSaver() {

    if (
      screenSaver
    ) {

      screenSaver
        .classList
        .remove(
          "is-hidden"
        );

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

    const video =
      ensureTrackVideo();

    if (
      !video ||
      !video.getAttribute(
        "src"
      )
    ) {

      showScreenSaver();

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
                "Press play to continue the station."
              );

            }

          }
        );

    }

  }


  function playNextTrack() {

    loadTrack(
      currentTrackIndex +
      1,
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

          playNextTrack();

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
        "music"

    } = {}) => {


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
          false
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


      showScreenSaver();

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
    resizeSpectrumCanvas
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


  loadTrack(
    0,
    false
  );

});
