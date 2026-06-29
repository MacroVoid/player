      let controlsInitialized = false;

      function initPlayerControls() {
        if (controlsInitialized) return;
        controlsInitialized = true;

        function formatTime(s) {
          if (isNaN(s)) return "00:00";
          const total = Math.floor(s);
          const h = Math.floor(total / 3600);
          const m = Math.floor((total % 3600) / 60);
          const sec = total % 60;
          if (h > 0)
            return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
          return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
        }

        function updateSeekBarBackground(val) {
          const max = parseFloat(seekBar.max) || 100;
          const percentage = max > 0 ? (val / max) * 100 : 0;
          seekBar.style.background = `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${percentage}%, rgba(255, 255, 255, 0.2) ${percentage}%, rgba(255, 255, 255, 0.2) 100%)`;
        }

        function updateVolumeBarBackground(val) {
          const percentage = val * 100;
          const vol = val * 2.0;
          const isOrange = vol > 1.0;
          const trackColor = isOrange ? "#ff8200" : "#ffffff";
          
          if (isOrange) {
            volumeBar.classList.add("volume-orange");
          } else {
            volumeBar.classList.remove("volume-orange");
          }

          volumeBar.style.background = `linear-gradient(to right, ${trackColor} 0%, ${trackColor} ${percentage}%, rgba(255, 255, 255, 0.2) ${percentage}%, rgba(255, 255, 255, 0.2) 100%)`;
        }

        function initAudioContext() {
          if (audioCtx) return;
          try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            audioSource = audioCtx.createMediaElementSource(videoEl);
            gainNode = audioCtx.createGain();
            audioSource.connect(gainNode);
            gainNode.connect(audioCtx.destination);
          } catch (e) {
            console.error("Web Audio API initialization failed:", e);
          }
        }

        function setPlayerVolume(val) {
          initAudioContext();
          const vol = parseFloat(val);
          virtualVolume = vol;
          
          if (!videoEl.muted) {
            videoEl.volume = Math.min(1.0, vol);
            if (gainNode) {
              gainNode.gain.value = vol > 1.0 ? vol : 1.0;
            }
          }
          volumeBar.value = vol;
          updateVolumeBarBackground(vol / 2.0);
        }

        // Initialize volume to 50%
        videoEl.volume = 0.5;
        virtualVolume = 0.5;
        volumeBar.value = 0.5;
        updateVolumeBarBackground(0.25);

        function togglePlay() {
          if (videoEl.paused) {
            videoEl.play();
            showActionFeedback(SVG_PLAY);
          } else {
            videoEl.pause();
            showActionFeedback(SVG_PAUSE);
          }
        }

        playPauseBtn.addEventListener("click", togglePlay);

        videoEl.addEventListener("play", () => {
          iconPlay.style.display = "none";
          iconPause.style.display = "block";
        });

        videoEl.addEventListener("pause", () => {
          iconPlay.style.display = "block";
          iconPause.style.display = "none";
          resetControlsTimeout();
        });

        videoEl.addEventListener("loadedmetadata", () => {
          seekBar.max = videoEl.duration;
          timeDisplay.textContent = `00:00 / ${formatTime(videoEl.duration)}`;
          updateSeekBarBackground(0);

          if (targetSeekTime > 0 && targetSeekTime < videoEl.duration) {
            videoEl.currentTime = targetSeekTime;
            seekBar.value = targetSeekTime;
            updateSeekBarBackground(targetSeekTime);
            targetSeekTime = 0;
          }
        });

        videoEl.addEventListener("timeupdate", () => {
          if (!isScrubbing) {
            seekBar.value = videoEl.currentTime;
            timeDisplay.textContent = `${formatTime(videoEl.currentTime)} / ${formatTime(videoEl.duration)}`;
            updateSeekBarBackground(videoEl.currentTime);
          }
          if (videoFile && videoFile.name) {
            localStorage.setItem(`vod_time_${videoFile.name}`, videoEl.currentTime);
          }
        });

        function updatePreview(time, percentage) {
          previewContainer.style.left = `${percentage * 100}%`;
          previewTime.textContent = formatTime(time);

          if (previewVideo.readyState >= 1) {
            previewVideo.currentTime = time;
          }
        }

        seekBar.addEventListener("mousedown", (e) => {
          isScrubbing = true;
          
          const rect = seekBar.getBoundingClientRect();
          let offsetX = e.clientX - rect.left;
          if (offsetX < 0) offsetX = 0;
          if (offsetX > rect.width) offsetX = rect.width;
          
          const thumbWidth = 12;
          const halfThumb = thumbWidth / 2;
          let percentage = 0;
          if (rect.width > thumbWidth) {
            percentage = (offsetX - halfThumb) / (rect.width - thumbWidth);
          } else {
            percentage = offsetX / rect.width;
          }
          if (percentage < 0) percentage = 0;
          if (percentage > 1) percentage = 1;
          
          const val = percentage * videoEl.duration;
          seekBar.value = val;
          videoEl.currentTime = val;
          timeDisplay.textContent = `${formatTime(val)} / ${formatTime(videoEl.duration)}`;
          
          updatePreview(val, percentage);
          updateSeekBarBackground(val);
        });

        seekBar.addEventListener("mouseup", () => {
          isScrubbing = false;
        });

        seekBar.addEventListener("input", () => {
          const val = parseFloat(seekBar.value);
          timeDisplay.textContent = `${formatTime(val)} / ${formatTime(videoEl.duration)}`;
          videoEl.currentTime = val;

          // Force update preview to match the thumb exactly when dragging
          const percentage = val / videoEl.duration;
          updatePreview(val, percentage);
          updateSeekBarBackground(val);
        });

        seekBar.addEventListener("mouseenter", () => {
          if (videoEl.readyState >= 1) {
            previewContainer.classList.add("visible");
          }
        });

        seekBar.addEventListener("mouseleave", () => {
          previewContainer.classList.remove("visible");
        });

        seekBar.addEventListener("mousemove", (e) => {
          if (isScrubbing) return;

          const rect = seekBar.getBoundingClientRect();
          let offsetX = e.clientX - rect.left;
          if (offsetX < 0) offsetX = 0;
          if (offsetX > rect.width) offsetX = rect.width;

          // Корректируем смещение под ширину ползунка (12px), так как браузерный слайдер центрирует его
          const thumbWidth = 12;
          const halfThumb = thumbWidth / 2;
          let percentage = 0;
          if (rect.width > thumbWidth) {
            percentage = (offsetX - halfThumb) / (rect.width - thumbWidth);
          } else {
            percentage = offsetX / rect.width;
          }
          if (percentage < 0) percentage = 0;
          if (percentage > 1) percentage = 1;

          const time = percentage * videoEl.duration;

          updatePreview(time, percentage);
        });

        volumeBar.addEventListener("input", () => {
          setPlayerVolume(volumeBar.value);
          videoEl.muted = volumeBar.value == 0;
        });

        muteBtn.addEventListener("click", () => {
          if (videoEl.muted) {
            videoEl.muted = false;
            setPlayerVolume(virtualVolume);
            
            const svg = virtualVolume === 0 ? SVG_VOL_MUTE : virtualVolume < 0.5 ? SVG_VOL_LOW : SVG_VOL_UP;
            showActionFeedback(svg, Math.round(virtualVolume * 100) + "%");
          } else {
            videoEl.muted = true;
            showActionFeedback(SVG_VOL_MUTE, "0%");
          }
        });

        videoEl.addEventListener("volumechange", () => {
          const vol = videoEl.muted ? 0 : virtualVolume;
          volumeBar.value = vol;
          updateVolumeBarBackground(vol / 2.0);

          iconVolUp.style.display = "none";
          iconVolLow.style.display = "none";
          iconMute.style.display = "none";

          if (vol === 0) {
            iconMute.style.display = "block";
          } else if (vol < 0.5) {
            iconVolLow.style.display = "block";
          } else {
            iconVolUp.style.display = "block";
          }
        });

        speedBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          speedMenu.classList.toggle("open");
        });
        
        window.addEventListener("click", () => {
          speedMenu.classList.remove("open");
        });

        speedOptions.forEach(opt => {
          opt.addEventListener("click", () => {
            const val = parseFloat(opt.getAttribute("data-value"));
            videoEl.playbackRate = val;
            speedBtn.textContent = opt.textContent;
            
            speedOptions.forEach(o => o.classList.remove("active"));
            opt.classList.add("active");
          });
        });

        fullscreenBtn.addEventListener("click", () => {
          if (!document.fullscreenElement) {
            appContainer.requestFullscreen().catch(err => {
              console.error("Error enabling fullscreen mode:", err);
            });
          } else {
            document.exitFullscreen();
          }
        });

        function resetControlsTimeout() {
          if (speedUpActive) return;
          playerContainer.classList.remove("controls-hidden");
          clearTimeout(controlsTimeout);
          if (!videoEl.paused) {
            controlsTimeout = setTimeout(() => {
              playerContainer.classList.add("controls-hidden");
            }, 1200); // Быстрое скрытие нижней панели (1.2 сек)
          }
        }

        playerContainer.addEventListener("mousemove", resetControlsTimeout);

        // УЛУЧШЕННОЕ УСКОРЕНИЕ (В ТОМ ЧИСЛЕ С ПАУЗЫ)
        function startSpeedUp() {
          if (videoEl.readyState < 2) return;

          isLongPress = true;
          speedUpActive = true;
          const activeOpt = document.querySelector('.speed-option.active');
          originalSpeed = activeOpt ? parseFloat(activeOpt.getAttribute('data-value')) : 1;
          wasPausedBeforeSpeedUp = videoEl.paused;

          videoEl.playbackRate = 2.0;
          if (wasPausedBeforeSpeedUp) {
            videoEl.play();
          }

          speedOverlay.classList.add("visible");
          playerContainer.classList.add("controls-hidden");
        }

        function stopSpeedUp() {
          if (speedUpActive) {
            videoEl.playbackRate = originalSpeed;
            speedUpActive = false;

            if (wasPausedBeforeSpeedUp) {
              videoEl.pause();
            }

            speedOverlay.classList.remove("visible");
            resetControlsTimeout();
          }
        }

        // Добавляем переменные для отслеживания фокуса окна
        let lastFocusTime = 0;
        let ignoreClickAfterFocus = false;

        // Отлавливаем момент, когда окно становится активным
        window.addEventListener("focus", () => {
          lastFocusTime = Date.now();
        });

        videoEl.addEventListener("mousedown", (e) => {
          if (e.button !== 0) return;

          // Если с момента получения окном фокуса прошло меньше 200мс,
          // значит это был клик для активации окна
          if (Date.now() - lastFocusTime < 200) {
            ignoreClickAfterFocus = true;
            return; // Игнорируем запуск ускорения
          }

          ignoreClickAfterFocus = false;
          isLongPress = false;
          pressTimer = setTimeout(startSpeedUp, 250);
        });

        window.addEventListener("mouseup", (e) => {
          isScrubbing = false;

          if (e.button !== 0) return;

          // Если этот клик был для активации окна, ничего не делаем
          if (ignoreClickAfterFocus) {
            ignoreClickAfterFocus = false; // сбрасываем флаг
            return;
          }

          clearTimeout(pressTimer);
          if (speedUpActive) {
            stopSpeedUp();
          } else if (!isLongPress && e.target === videoEl) {
            togglePlay();
          }
        });
        playerContainer.addEventListener("mouseleave", () => {
          clearTimeout(pressTimer);
        });

        window.addEventListener("blur", () => {
          clearTimeout(pressTimer);
          stopSpeedUp();
        });

        videoEl.addEventListener("click", (e) => {
          e.preventDefault();
        });

        window.addEventListener("keydown", (e) => {
          if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")
            return;

          switch (e.code) {
            case "Space":
              e.preventDefault();
              if (!e.repeat && !speedUpActive) {
                isLongPress = false;
                pressTimer = setTimeout(startSpeedUp, 250);
              }
              break;
            case "KeyM":
              muteBtn.click();
              break;
            case "KeyF":
              fullscreenBtn.click();
              break;
            case "ArrowRight":
              e.preventDefault();
              videoEl.currentTime += 5;
              showActionFeedback(SVG_FF, "+5с");
              resetControlsTimeout();
              break;
            case "ArrowLeft":
              e.preventDefault();
              videoEl.currentTime -= 5;
              showActionFeedback(SVG_REW, "-5с");
              resetControlsTimeout();
              break;
            case "ArrowUp":
              e.preventDefault();
              videoEl.muted = false;
              let newVolUp = Math.min(2.0, virtualVolume + 0.05);
              setPlayerVolume(newVolUp);
              const svgUp = newVolUp === 0 ? SVG_VOL_MUTE : newVolUp < 0.5 ? SVG_VOL_LOW : SVG_VOL_UP;
              showActionFeedback(svgUp, Math.round(newVolUp * 100) + "%");
              resetControlsTimeout();
              break;
            case "ArrowDown":
              e.preventDefault();
              videoEl.muted = false;
              let newVolDown = Math.max(0.0, virtualVolume - 0.05);
              setPlayerVolume(newVolDown);
              const svgDown = newVolDown === 0 ? SVG_VOL_MUTE : newVolDown < 0.5 ? SVG_VOL_LOW : SVG_VOL_UP;
              showActionFeedback(svgDown, Math.round(newVolDown * 100) + "%");
              resetControlsTimeout();
              break;
          }
        });

        window.addEventListener("keyup", (e) => {
          if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")
            return;
          if (e.code === "Space") {
            e.preventDefault();
            clearTimeout(pressTimer);
            if (speedUpActive) {
              stopSpeedUp();
            } else if (!isLongPress) {
              togglePlay();
            }
          }
        });
      }
