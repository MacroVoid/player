      let originalSpeed = 1;
      let speedUpActive = false;
      let pressTimer = null;
      let isLongPress = false;
      let isScrubbing = false;
      let wasPausedBeforeSpeedUp = false;

      const fallbackColors = [
        "#FF0000",
        "#0000FF",
        "#008000",
        "#B22222",
        "#FF7F50",
        "#9ACD32",
        "#FF4500",
        "#2E8B57",
        "#DAA520",
        "#D2691E",
        "#5F9EA0",
        "#1E90FF",
        "#FF69B4",
        "#8A2BE2",
        "#00FF7F",
      ];
      const userColorsMap = {};

      function getUserColor(username) {
        if (!username) return fallbackColors[0];

        // Если цвет уже был выдан в этой сессии, берем его из памяти
        if (userColorsMap[username]) return userColorsMap[username];

        let hash = 0;

        // 1. Сильный сдвиг на основе длины ника (разная длина = кардинально разный хэш)
        hash += username.length * 137;

        // 2. Усиливаем разницу от первой и последней буквы (чтобы Alex и Olex отличались)
        hash += username.charCodeAt(0) * 71;
        hash += username.charCodeAt(username.length - 1) * 97;

        // 3. Основной проход по всем буквам
        for (let i = 0; i < username.length; i++) {
          let charCode = username.charCodeAt(i);
          // Умножаем код символа на его позицию (i + 1), чтобы анаграммы отличались
          hash = (hash << 5) - hash + charCode * (i + 1);
          hash = hash & hash; // Приводим к 32-битному целому числу
        }

        // Берем остаток от деления на количество цветов
        const colorIndex = Math.abs(hash) % fallbackColors.length;
        userColorsMap[username] = fallbackColors[colorIndex];

        return userColorsMap[username];
      }

      // Функция для защиты от сломанного HTML в сообщениях
      function escapeHTML(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }

      function parseLinksAndEscape(str) {
        if (!str) return '';
        const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
        let lastIndex = 0;
        let match;
        let result = '';
        while ((match = urlRegex.exec(str)) !== null) {
          if (match.index > lastIndex) {
            result += escapeHTML(str.substring(lastIndex, match.index));
          }
          let url = match[0];
          let trailing = '';
          while (url.length > 0) {
            const lastChar = url[url.length - 1];
            if (['.', ',', ';', ':', ']', '}', '!'].includes(lastChar)) {
              trailing = lastChar + trailing;
              url = url.slice(0, -1);
            } else if (lastChar === ')') {
              const openCount = (url.match(/\(/g) || []).length;
              const closeCount = (url.match(/\)/g) || []).length;
              if (closeCount > openCount) {
                trailing = lastChar + trailing;
                url = url.slice(0, -1);
              } else {
                break;
              }
            } else {
              break;
            }
          }

          let href = url;
          if (!href.startsWith('http://') && !href.startsWith('https://')) {
            href = 'https://' + href;
          }
          
          result += `<a href="${escapeHTML(href)}" class="chat-link" target="_blank" data-url="${escapeHTML(href)}">${escapeHTML(url)}</a>${escapeHTML(trailing)}`;
          lastIndex = urlRegex.lastIndex;
        }
        if (lastIndex < str.length) {
          result += escapeHTML(str.substring(lastIndex));
        }
        return result;
      }

      // Функция замены текста на смайлики по индексам из JSON
      function parseEmotesFromJSON(text, emotesData) {
        if (!text) return '';
        if (!emotesData || !Array.isArray(emotesData) || emotesData.length === 0) {
          return parseLinksAndEscape(text);
        }

        const emoteArr = [];
        
        // Собираем все позиции всех смайликов в один массив
        emotesData.forEach(emote => {
          if (!emote.locations) return;
          let positions = [];
          if (Array.isArray(emote.locations)) {
            positions = emote.locations;
          } else if (typeof emote.locations === 'string') {
            positions = emote.locations.split(',');
          }
          
          positions.forEach(pos => {
            const [start, end] = pos.split('-');
            emoteArr.push({
              id: emote.id,
              start: parseInt(start),
              end: parseInt(end)
            });
          });
        });

        // Сортируем по возрастанию позиции, чтобы заменять слева направо
        emoteArr.sort((a, b) => a.start - b.start);

        let resultHTML = '';
        let currentIndex = 0;

        for (const emp of emoteArr) {
          // Добавляем обычный текст до смайлика (и экранируем его)
          if (emp.start > currentIndex) {
            resultHTML += parseLinksAndEscape(text.substring(currentIndex, emp.start));
          }
          // Добавляем саму картинку смайлика
          resultHTML += `<img src="https://static-cdn.jtvnw.net/emoticons/v2/${emp.id}/default/dark/1.0" class="emote" alt="emote">`;
          // Сдвигаем текущий индекс (end - это индекс последнего символа смайла, поэтому +1)
          currentIndex = emp.end + 1;
        }

        // Добавляем оставшийся хвост текста, если он есть
        if (currentIndex < text.length) {
          resultHTML += parseLinksAndEscape(text.substring(currentIndex));
        }

        return resultHTML;
      }

      // Парсер смайликов для нового компактного формата: em = { "id": ["0-8", "10-18"] }
      // Избегаем промежуточное преобразование в старый формат — читаем напрямую
      function parseEmotesFromDict(text, emDict) {
        if (!text) return '';
        if (!emDict || Object.keys(emDict).length === 0) {
          return parseLinksAndEscape(text);
        }

        const emoteArr = [];
        for (const [id, locs] of Object.entries(emDict)) {
          for (const loc of locs) {
            const [start, end] = loc.split('-');
            emoteArr.push({ id, start: parseInt(start), end: parseInt(end) });
          }
        }
        emoteArr.sort((a, b) => a.start - b.start);

        let resultHTML = '';
        let currentIndex = 0;
        for (const emp of emoteArr) {
          if (emp.start > currentIndex) {
            resultHTML += parseLinksAndEscape(text.substring(currentIndex, emp.start));
          }
          resultHTML += `<img src="https://static-cdn.jtvnw.net/emoticons/v2/${emp.id}/default/dark/1.0" class="emote" alt="emote">`;
          currentIndex = emp.end + 1;
        }
        if (currentIndex < text.length) {
          resultHTML += parseLinksAndEscape(text.substring(currentIndex));
        }
        return resultHTML;
      }

      function parseTwitchChatToOptimized(rawSegments) {
        const badges = {};
        const users = {};
        const user_states = {};
        const segments = [];

        for (const segment of rawSegments) {
          if (!segment.messages) continue;

          const outSegment = {
            type: segment.type || "video",
            video_start: segment.video_start || 0.0,
            video_duration: segment.video_duration || 0.0,
            original_start: segment.original_start || 0.0,
            original_duration: segment.original_duration || 0.0,
            original_timestamp: segment.original_timestamp || 0,
            messages: []
          };

          for (const msg of segment.messages) {
            const msgType = msg.message_type || msg.action_type;
            const msgTimestamp = msg.timestamp !== undefined ? msg.timestamp : (segment.original_timestamp || 0);
            const t = Math.floor(outSegment.video_start * 1000) + Math.floor((msgTimestamp - outSegment.original_timestamp) / 1000);

            if (msgType === "clear_chat" || msgType === "ban_user") {
              const tid = msg.banned_user || msg.target_id || (msg.author && msg.author.target_id) || (msg.author && msg.author.id);
              if (tid) {
                outSegment.messages.push({ t, act: "ban", tid: String(tid) });
              }
              continue;
            }

            if (msgType === "clear_message" || msgType === "delete_message") {
              if (msg.target_message_id) {
                outSegment.messages.push({ t, act: "del", tid: msg.target_message_id });
              }
              continue;
            }

            if (msgType !== "text_message" && msgType !== "highlighted_message") {
              continue;
            }

            const author = msg.author || {};
            const uid = String(author.id || "");
            if (!uid) continue;

            let current_badges = [];
            if (author.badges && Array.isArray(author.badges)) {
              for (const b of author.badges) {
                if (!b.name || b.version === undefined) continue;
                const badgeKey = `${b.name}:${b.version}`;
                current_badges.push(badgeKey);
                
                if (!badges[badgeKey]) {
                  if (b.icons && b.icons.length > 0 && b.icons[0].url) {
                    const url = b.icons[0].url;
                    const match = url.match(/\/v1\/([a-fA-F0-9\-]+)\//);
                    if (match) {
                      badges[badgeKey] = match[1];
                    } else {
                      const parts = url.split('/');
                      badges[badgeKey] = parts[parts.length - 2] || url;
                    }
                  } else {
                    badges[badgeKey] = "unknown-badge";
                  }
                }
              }
            }

            let current_color = msg.colour || msg.color || author.colour || author.color || getUserColor(author.display_name || author.name);

            let b_changed = false;
            let c_changed = false;

            if (!user_states[uid]) {
              user_states[uid] = {
                color: current_color,
                badges: [...current_badges]
              };
              users[uid] = {
                name: author.display_name || author.name || "Аноним",
                color: current_color,
                badges: [...current_badges]
              };
            } else {
              const state = user_states[uid];
              if (state.color !== current_color) {
                c_changed = true;
                state.color = current_color;
              }
              
              const badgesSame = state.badges.length === current_badges.length && state.badges.every((val, i) => val === current_badges[i]);
              if (!badgesSame) {
                b_changed = true;
                state.badges = [...current_badges];
              }
            }

            const outMsg = {
              t: t,
              uid: uid,
              mid: msg.message_id || msg.id,
              msg: msg.message || ""
            };

            if (msg.is_first_message) {
              outMsg.first = true;
            }

            if (msg.in_reply_to && msg.in_reply_to.message_id) {
              outMsg.rep = msg.in_reply_to.message_id;
            }

            if (msg.emotes && Array.isArray(msg.emotes) && msg.emotes.length > 0) {
              const emObj = {};
              for (const em of msg.emotes) {
                if (em.id) {
                  let locations = [];
                  if (Array.isArray(em.locations)) {
                    locations = em.locations;
                  } else if (typeof em.locations === 'string') {
                    locations = em.locations.split(',');
                  }
                  if (locations.length > 0) {
                    emObj[em.id] = locations;
                  }
                }
              }
              if (Object.keys(emObj).length > 0) {
                outMsg.em = emObj;
              }
            }

            if (b_changed) {
              outMsg.b = [...current_badges];
            }

            if (c_changed) {
              outMsg.c = current_color;
            }

            outSegment.messages.push(outMsg);
          }
          segments.push(outSegment);
        }

        return { badges, users, segments };
      }

