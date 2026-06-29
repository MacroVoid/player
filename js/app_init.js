      function checkFilesReady() {
        startBtn.disabled = !(videoFile && chatData);
      }

      videoInput.addEventListener("change", (e) => {
        videoFile = e.target.files[0];
        checkFilesReady();
      });

      chatInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            chatData = JSON.parse(event.target.result);
            checkFilesReady();
          } catch (err) {
            alert("Ошибка чтения JSON файла");
          }
        };
        reader.readAsText(file);
      });

      startBtn.addEventListener("click", async () => {
        if (videoFile && videoFile.name) {
          const savedTime = localStorage.getItem(`vod_time_${videoFile.name}`);
          targetSeekTime = savedTime ? parseFloat(savedTime) : 0;
        } else {
          targetSeekTime = 0;
        }

        const objectUrl = URL.createObjectURL(videoFile);
        videoEl.src = objectUrl;
        previewVideo.src = objectUrl;
        normalizedMessages = normalizeMessages(chatData);

        startApp();

        // Asynchronously save to IndexedDB for next time
        try {
          await dbStore.set('video', videoFile);
          await dbStore.set('videoName', videoFile.name);
          await dbStore.set('chat', JSON.stringify(chatData));
          const chatName = chatInput.files[0] ? chatInput.files[0].name : 'chat.json';
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
          videoFile = await dbStore.get('video');
          const savedChatData = await dbStore.get('chat');
          if (savedChatData && typeof savedChatData === 'string') {
            chatData = JSON.parse(savedChatData);
          } else {
            chatData = savedChatData; // Fallback if saved as object previously
          }

          if (!videoFile || !chatData) {
            alert('Не удалось прочитать сохраненные файлы из базы данных.');
            restoreBtn.disabled = false;
            restoreBtn.textContent = 'Восстановить сессию';
            return;
          }

          const videoName = await dbStore.get('videoName');
          if (videoName) {
            const savedTime = localStorage.getItem(`vod_time_${videoName}`);
            targetSeekTime = savedTime ? parseFloat(savedTime) : 0;
          } else {
            targetSeekTime = 0;
          }

          const objectUrl = URL.createObjectURL(videoFile);
          videoEl.src = objectUrl;
          previewVideo.src = objectUrl;
          normalizedMessages = normalizeMessages(chatData);

          startApp();
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
        if (data.length > 0 && data[0].messages !== undefined) {
          let accDuration = 0;
          for (const frag of data) {
            const msgs = frag.messages || [];
            for (const m of msgs) {
              const msgType = m.message_type || m.action_type;
              if (msgType && msgType !== "text_message") continue;
              list.push({
                ...m,
                _timeSec: accDuration + (m.time_in_seconds || 0),
              });
            }
            accDuration += frag.video_duration || 0;
          }
        } else {
          const valid = data
            .filter((m) => {
              const type = m.message_type || m.action_type;
              return !type || type === "text_message";
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
