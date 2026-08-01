      function checkFilesReady() {
        startBtn.disabled = videoFiles.length === 0;
      }

      videoInput.addEventListener("change", (e) => {
        videoFiles = Array.from(e.target.files).sort((a, b) => a.name.localeCompare(b.name));
        checkFilesReady();
      });

      chatInput.addEventListener("change", async (e) => {
        const files = Array.from(e.target.files).sort((a, b) => a.name.localeCompare(b.name));
        if (files.length === 0) return;
        
        try {
          const allChatData = await Promise.all(files.map(file => {
            return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (event) => {
                try {
                  resolve(JSON.parse(event.target.result));
                } catch (err) {
                  reject(err);
                }
              };
              reader.onerror = reject;
              reader.readAsText(file);
            });
          }));
          
          chatData = mergeChatData(allChatData);
          checkFilesReady();
        } catch (err) {
          alert("Ошибка чтения JSON файлов");
          console.error(err);
        }
      });

      // Умный мёрж: поддерживает массивы (старый формат) и объекты {badges,users,segments} (новый формат)
      function mergeChatData(parts) {
        if (parts.length === 0) return [];
        if (parts.length === 1) return parts[0];

        const allNew = parts.every(p => !Array.isArray(p) && p.segments && p.users);
        if (allNew) {
          // Объединяем несколько файлов нового формата
          const merged = { badges: {}, users: {}, segments: [] };
          for (const p of parts) {
            Object.assign(merged.badges, p.badges || {});
            Object.assign(merged.users,  p.users  || {});
            merged.segments.push(...(p.segments || []));
          }
          return merged;
        }

        // Старый формат (массивы) — плоско объединяем
        return parts.flat();
      }

      async function prepareAndStartApp(vFiles, cData) {
        if (loadingIndicator) loadingIndicator.style.display = "block";
        try {
          videoObjectUrls = vFiles.map(f => URL.createObjectURL(f));
          videoDurations = [];
          totalDuration = 0;

          const tempVideo = document.createElement("video");
          for (let i = 0; i < videoObjectUrls.length; i++) {
            await new Promise((resolve) => {
              tempVideo.onloadedmetadata = () => {
                videoDurations.push(tempVideo.duration);
                totalDuration += tempVideo.duration;
                resolve();
              };
              tempVideo.onerror = () => {
                console.warn(`Error loading metadata for video part ${i}`);
                videoDurations.push(0);
                resolve();
              };
              tempVideo.src = videoObjectUrls[i];
            });
          }

          currentVideoIndex = 0;
          videoEl.src = videoObjectUrls[0];
          previewVideo.src = videoObjectUrls[0];
          normalizedMessages = cData ? normalizeMessages(cData) : [];

          // Render timeline markers
          if (timelineMarkers) {
            timelineMarkers.innerHTML = "";
            if (videoDurations.length > 1) {
              let acc = 0;
              for (let i = 0; i < videoDurations.length - 1; i++) {
                acc += videoDurations[i];
                const pct = (acc / totalDuration) * 100;
                const marker = document.createElement("div");
                marker.className = "timeline-marker";
                marker.style.left = `${pct}%`;
                timelineMarkers.appendChild(marker);
              }
            }
          }

          startApp();
        } finally {
          if (loadingIndicator) loadingIndicator.style.display = "none";
        }
      }

      startBtn.addEventListener("click", async () => {
        if (videoFiles.length > 0 && videoFiles[0].name) {
          const savedTime = localStorage.getItem(`vod_time_${videoFiles[0].name}`);
          targetSeekTime = savedTime ? parseFloat(savedTime) : 0;
        } else {
          targetSeekTime = 0;
        }

        startBtn.disabled = true;
        await prepareAndStartApp(videoFiles, chatData);

        // Asynchronously save to IndexedDB for next time
        try {
          await dbStore.set('video', videoFiles);
          await dbStore.set('videoName', videoFiles.map(f => f.name).join(', '));
          await dbStore.set('chat', chatData ? JSON.stringify(chatData) : null);
          const chatName = Array.from(chatInput.files).map(f => f.name).join(', ');
          await dbStore.set('chatName', chatName);
        } catch (err) {
          console.warn("Could not save session to IndexedDB:", err);
        }
      });

      document.getElementById('restore-btn').addEventListener('click', async () => {
        const restoreBtn = document.getElementById('restore-btn');
        restoreBtn.disabled = true;
        restoreBtn.textContent = 'Восстановление...';

        try {
          let savedVideos = await dbStore.get('video');
          const savedChatData = await dbStore.get('chat');
          if (savedChatData && typeof savedChatData === 'string') {
            chatData = JSON.parse(savedChatData);
          } else {
            chatData = savedChatData; // Fallback if saved as object previously
          }

          if (!savedVideos) {
            alert('Не удалось прочитать сохраненное видео из базы данных.');
            restoreBtn.disabled = false;
            restoreBtn.textContent = 'Восстановить сессию';
            return;
          }

          if (!Array.isArray(savedVideos)) {
            savedVideos = [savedVideos]; // Fallback for old single-file format
          }
          videoFiles = savedVideos;

          if (videoFiles.length > 0 && videoFiles[0].name) {
            const savedTime = localStorage.getItem(`vod_time_${videoFiles[0].name}`);
            targetSeekTime = savedTime ? parseFloat(savedTime) : 0;
          } else {
            targetSeekTime = 0;
          }

          await prepareAndStartApp(videoFiles, chatData);
        } catch (error) {
          console.error("Ошибка восстановления сессии:", error);
          alert("Ошибка при чтении из IndexedDB: " + error.message);
          restoreBtn.disabled = false;
          restoreBtn.textContent = 'Восстановить сессию';
        }
      });

      demoBtn.addEventListener("click", () => {
        const demoVideoUrl =
          "https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-576p.mp4";
        videoEl.src = demoVideoUrl;
        previewVideo.src = demoVideoUrl;

        normalizedMessages = [];
        const demoNames = [
          "Алексей",
          "GamerPro",
          "Nagibator2000",
          "СладкаяБулочка",
          "xX_Sniper_Xx",
          "KittensLover",
          "Ded_Inside",
          "Shadow",
          "Qwerty",
          "Panda",
        ];
        const demoMsgs = [
          "Всем привет!",
          "Ого, вот это момент",
          "Лмао",
          "Когда следующий стрим?",
          "F",
          "Скип",
          "Посмотрите этот сайт: https://github.com !",
          "Кто понял, тот понял",
          "KEKW",
          "Ахахахах",
          "Где звук?",
          "Google тут: www.google.com или https://google.com",
          "Погчамп!",
          "Зачем он это сделал? https://youtube.com/watch?v=dQw4w9WgXcQ",
        ];

        for (let i = 0; i < 200; i++) {
          normalizedMessages.push({
            _timeSec: Math.random() * 122,
            author: {
              name: demoNames[Math.floor(Math.random() * demoNames.length)],
            },
            message: demoMsgs[Math.floor(Math.random() * demoMsgs.length)],
          });
        }
        normalizedMessages.sort((a, b) => a._timeSec - b._timeSec);

        startApp();
      });

      function startApp() {
        uploadScreen.style.opacity = "0";
        setTimeout(() => {
          uploadScreen.style.visibility = "hidden";
          appContainer.style.opacity = "1";
          videoEl
            .play()
            .catch((e) =>
              console.warn(
                "Воспроизведение заблокировано браузером. Нажмите Play вручную.",
              ),
            );
        }, 500);

        initPlayerControls();
        initSyncEngine();
      }

      function normalizeMessages(data) {
        let list = [];
        if (!data) return list;

        // Новый оптимизированный формат: { badges, users, segments }
        if (!Array.isArray(data) && data.segments && data.users) {
          // Сохраняем словари как единый глобальный объект — никакого копирования
          chatMeta = { badges: data.badges || {}, users: data.users || {} };
          midToMsg = new Map();

          const currentStates = {}; // Для отслеживания изменений цвета и бейджей

          for (const seg of data.segments) {
            for (const m of (seg.messages || [])) {
              const timeSec = (m.t || 0) / 1000;

              if (m.act === 'del') {
                list.push({ _timeSec: timeSec, act: 'del', tid: m.tid });
                continue;
              }
              if (m.act === 'ban') {
                list.push({ _timeSec: timeSec, act: 'ban', tid: m.tid });
                continue;
              }

              if (m.b) {
                if (!currentStates[m.uid]) currentStates[m.uid] = {};
                currentStates[m.uid].b = m.b;
              }
              if (m.c) {
                if (!currentStates[m.uid]) currentStates[m.uid] = {};
                currentStates[m.uid].c = m.c;
              }

              // Обычное сообщение: храним только компактные данные
              const entry = { _timeSec: timeSec, uid: m.uid, mid: m.mid, msg: m.msg };
              if (m.em)    entry.em    = m.em;
              if (m.rep)   entry.rep   = m.rep;
              if (m.first) entry.first = true;

              if (currentStates[m.uid]?.b) entry.b = currentStates[m.uid].b;
              if (currentStates[m.uid]?.c) entry.c = currentStates[m.uid].c;

              list.push(entry);
            }
          }

          list.sort((a, b) => a._timeSec - b._timeSec);

          // Строим Map после сортировки — для O(1) поиска reply
          for (const entry of list) {
            if (entry.mid) midToMsg.set(entry.mid, entry);
          }
          return list;
        }

        if (!Array.isArray(data) || data.length === 0) return list;

        // Формат TwitchDownloader (content.videoOffsetSeconds)
        if (data[0].content && data[0].content.videoOffsetSeconds !== undefined) {
          data.forEach((item) => {
            if (item.content && item.content.videoOffsetSeconds !== undefined) {
              list.push({
                _timeSec: item.content.videoOffsetSeconds,
                author: { name: item.commenter?.displayName || "Аноним" },
                message: item.message?.body || "",
                emotes: item.message?.emoticons || []
              });
            }
          });
          return list.sort((a, b) => a._timeSec - b._timeSec);
        }

        // Старый формат: массив сегментов с messages (raw)
        if (data[0].messages !== undefined) {
          // Пропускаем через наш конвертер в новый формат!
          if (typeof parseTwitchChatToOptimized === 'function') {
            const optimized = parseTwitchChatToOptimized(data);
            return normalizeMessages(optimized);
          }

          let accDuration = 0;
          for (const frag of data) {
            const msgs = frag.messages || [];
            
            let baseTime = frag.original_timestamp !== undefined ? frag.original_timestamp : null;
            if (baseTime === null && msgs.length > 0) {
              const timestamps = msgs.map(m => m.timestamp).filter(t => t !== undefined);
              if (timestamps.length > 0) {
                baseTime = Math.min(...timestamps);
              }
            }

            for (const m of msgs) {
              const msgType = m.message_type || m.action_type;
              if (msgType && msgType !== "text_message" && msgType !== "ban_user" && msgType !== "clear_chat" && msgType !== "clear_message" && msgType !== "delete_message") continue;

              let offset = 0;
              if (m.time_in_seconds !== undefined) {
                offset = m.time_in_seconds;
              } else if (m.timestamp !== undefined && baseTime !== null) {
                offset = (m.timestamp - baseTime) / 1000000;
              } else if (m.videoOffsetSeconds !== undefined) {
                offset = m.videoOffsetSeconds;
              }

              list.push({
                ...m,
                _timeSec: accDuration + offset,
              });
            }
            accDuration += frag.video_duration || 0;
          }
        } else {
          const valid = data
            .filter((m) => {
              const type = m.message_type || m.action_type;
              return (!type || type === "text_message") && m.timestamp !== undefined;
            })
            .sort((a, b) => a.timestamp - b.timestamp);

          if (valid.length > 0) {
            const baseTime = valid[0].timestamp / 1000000;
            for (const m of valid) {
              list.push({
                ...m,
                _timeSec: m.timestamp / 1000000 - baseTime,
              });
            }
          }
        }
        return list.sort((a, b) => a._timeSec - b._timeSec);
      }

      // Block mobile pinch-to-zoom and gesture zoom on Safari / Mobile browsers
      document.addEventListener('gesturestart', (e) => {
        e.preventDefault();
      });
      document.addEventListener('gesturechange', (e) => {
        e.preventDefault();
      });
      document.addEventListener('gestureend', (e) => {
        e.preventDefault();
      });

      // Prevent multi-touch zoom
      document.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches.length > 1) {
          e.preventDefault();
        }
      }, { passive: false });
