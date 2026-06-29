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
          const positions = emote.locations.split(',');
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

      function normalizeMessages(data) {
        const result = [];
        if (!data || !Array.isArray(data)) return result;
        data.forEach((item) => {
          if (item.content && item.content.videoOffsetSeconds !== undefined) {
            result.push({
              _timeSec: item.content.videoOffsetSeconds,
              author: { name: item.commenter?.displayName || "Аноним" },
              message: item.message?.body || "",
              emotes: item.message?.emoticons || []
            });
          }
        });
        result.sort((a, b) => a._timeSec - b._timeSec);
        return result;
      }
