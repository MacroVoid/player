const videoInput = document.getElementById("video-input");
      const chatInput = document.getElementById("chat-input");
      const startBtn = document.getElementById("start-btn");
      const demoBtn = document.getElementById("demo-btn");
      const uploadScreen = document.getElementById("upload-screen");
      const appContainer = document.getElementById("app-container");

      const playerContainer = document.getElementById("player-container");
      const videoEl = document.getElementById("main-video");
      const chatMessages = document.getElementById("chat-messages");
      const jumpToBottomBtn = document.getElementById("jump-to-bottom-btn");

      const playPauseBtn = document.getElementById("play-pause-btn");
      const iconPlay = document.getElementById("icon-play");
      const iconPause = document.getElementById("icon-pause");
      const seekBar = document.getElementById("seek-bar");
      const muteBtn = document.getElementById("mute-btn");

      const iconVolUp = document.getElementById("icon-vol-up");
      const iconVolLow = document.getElementById("icon-vol-low");
      const iconMute = document.getElementById("icon-mute");

      const volumeBar = document.getElementById("volume-bar");
      const timeDisplay = document.getElementById("time-display");
      const speedBtn = document.getElementById("speed-btn");
      const speedMenu = document.getElementById("speed-menu");
      const speedOptions = document.querySelectorAll(".speed-option");
      const fullscreenBtn = document.getElementById("fullscreen-btn");
      const speedOverlay = document.getElementById("speed-overlay");
      const previewContainer = document.getElementById("preview-container");
      const previewVideo = document.getElementById("preview-video");
      const previewTime = document.getElementById("preview-time");

      // Иконки для центрального уведомления
      const SVG_PLAY = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
      const SVG_PAUSE = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
      const SVG_FF = `<svg viewBox="0 0 24 24"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>`;
      const SVG_REW = `<svg viewBox="0 0 24 24"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg>`;
      const SVG_VOL_UP = `<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`;
      const SVG_VOL_LOW = `<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>`;
      const SVG_VOL_MUTE = `<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`;

      let videoFile = null;
      let chatData = null;
      let normalizedMessages = [];
      let lastRenderedTime = 0;
      let isScrolledUp = false;
      let controlsTimeout = null;
      let actionOverlayTimeout = null;
      let targetSeekTime = 0;

      let virtualVolume = 0.5;
      let audioCtx = null;
      let gainNode = null;
      let audioSource = null;
