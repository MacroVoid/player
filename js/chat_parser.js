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

      // \u041f\u0430\u0440\u0441\u0435\u0440 \u0441\u043c\u0430\u0439\u043b\u0438\u043a\u043e\u0432 \u0434\u043b\u044f \u043d\u043e\u0432\u043e\u0433\u043e \u043a\u043e\u043c\u043f\u0430\u043a\u0442\u043d\u043e\u0433\u043e \u0444\u043e\u0440\u043c\u0430\u0442\u0430: em = { "id": ["0-8", "10-18"] }
      // \u0418\u0437\u0431\u0435\u0433\u0430\u0435\u043c \u043f\u0440\u043e\u043c\u0435\u0436\u0443\u0442\u043e\u0447\u043d\u043e\u0435 \u043f\u0440\u0435\u043e\u0431\u0440\u0430\u0437\u043e\u0432\u0430\u043d\u0438\u0435 \u0432 \u0441\u0442\u0430\u0440\u044b\u0439 \u0444\u043e\u0440\u043c\u0430\u0442 — \u0447\u0438\u0442\u0430\u0435\u043c \u043d\u0430\u043f\u0440\u044f\u043c\u0443\u044e
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

