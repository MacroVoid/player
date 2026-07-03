      let engineStarted = false;

      function initSyncEngine() {
        if (engineStarted) return;
        engineStarted = true;

        jumpToBottomBtn.addEventListener("click", () => {
          chatMessages.scrollTop = chatMessages.scrollHeight;
          isScrolledUp = false;
          jumpToBottomBtn.classList.remove("visible");
        });

        chatMessages.addEventListener("scroll", () => {
          const threshold = 35;
          isScrolledUp =
            chatMessages.scrollHeight -
              chatMessages.scrollTop -
              chatMessages.clientHeight >
            threshold;

          if (!isScrolledUp) {
            jumpToBottomBtn.classList.remove("visible");
          }

          // Скрываем превью при прокрутке чата
          if (linkTooltip) {
            linkTooltip.classList.remove("visible");
            currentHoveredUrl = null;
            clearTimeout(hoverTimeout);
          }
        });

        function getGlobalCurrentTime() {
          if (typeof targetSeekTime !== "undefined" && targetSeekTime > 0) {
            return targetSeekTime;
          }
          if (typeof videoDurations === "undefined" || videoDurations.length === 0) {
            return videoEl.currentTime;
          }
          const prevPartsDuration = videoDurations.slice(0, currentVideoIndex).reduce((a, b) => a + b, 0);
          return prevPartsDuration + videoEl.currentTime;
        }

        function syncLoop() {
          if (!videoEl.paused && !videoEl.ended) {
            const currentTime = getGlobalCurrentTime();
            const toRender = normalizedMessages.filter(
              (m) => m._timeSec > lastRenderedTime && m._timeSec <= currentTime,
            );

            if (toRender.length > 0) {
              const fragment = document.createDocumentFragment();
              toRender.forEach((msg) => {
                const el = createMessageElement(msg);
                if (el instanceof Node) {
                  fragment.appendChild(el);
                  if (typeof activeProfileUser !== 'undefined' && activeProfileUser && isSameUser(msg, activeProfileUser)) {
                    appendMessageToProfileList(msg);
                  }
                } else if (el && el.type === 'meta') {
                  handleMetaEvent(el, fragment, chatMessages);
                }
              });
              chatMessages.appendChild(fragment);

              while (chatMessages.children.length > 400) {
                chatMessages.removeChild(chatMessages.firstChild);
              }

              if (!isScrolledUp) {
                chatMessages.scrollTop = chatMessages.scrollHeight;
              } else {
                jumpToBottomBtn.classList.add("visible");
              }
            }
            lastRenderedTime = currentTime;
          }
          requestAnimationFrame(syncLoop);
        }
        requestAnimationFrame(syncLoop);

        // Инициализируем чат сразу при запуске, чтобы он не был пустым, если первое сообщение нескоро
        if (typeof handleChatSeek === "function") {
          handleChatSeek(getGlobalCurrentTime());
        }
      }

      function handleMetaEvent(meta, fragment, container) {
        if (meta.action === 'ban') {
           const targetUsername = meta.user.toLowerCase();
           fragment.querySelectorAll('.message-container').forEach(el => {
             if (el.getAttribute('data-username') === targetUsername) {
                markMessageAsDeleted(el, meta.reason);
             }
           });
           container.querySelectorAll('.message-container').forEach(el => {
             if (el.getAttribute('data-username') === targetUsername) {
                markMessageAsDeleted(el, meta.reason);
             }
           });
        } else if (meta.action === 'delete') {
           const targetId = meta.targetId;
           fragment.querySelectorAll('.message-container').forEach(el => {
             if (el.getAttribute('data-msg-id') === targetId) {
                markMessageAsDeleted(el, meta.reason);
             }
           });
           container.querySelectorAll('.message-container').forEach(el => {
             if (el.getAttribute('data-msg-id') === targetId) {
                markMessageAsDeleted(el, meta.reason);
             }
           });
        }
      }

      function markMessageAsDeleted(el, reason) {
        if (el.classList.contains('deleted-message-container')) return;
        el.classList.add('deleted-message-container');

        // Определяем тип удаления для цветовой полоски
        const isBan = reason && (reason.includes('забан') || reason.includes('Отстран'));
        if (isBan) el.classList.add('deleted-type-ban');

        // Сохраняем исходный контент
        const originalContent = document.createElement('div');
        originalContent.className = 'original-message-content';
        while (el.firstChild) originalContent.appendChild(el.firstChild);

        // Планка-уведомление
        const notice = document.createElement('div');
        notice.className = 'deleted-notice';
        notice.innerHTML = `
          <span class="deleted-icon">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
          </span>
          <span class="deleted-reason">${reason || 'Сообщение удалено'}</span>
          <button class="toggle-deleted-btn" aria-label="Показать сообщение">Показать</button>
        `;

        const toggleBtn = notice.querySelector('.toggle-deleted-btn');
        let isOpen = false;

        toggleBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          isOpen = !isOpen;
          originalContent.classList.toggle('visible', isOpen);
          toggleBtn.textContent = isOpen ? 'Скрыть' : 'Показать';
          toggleBtn.classList.toggle('active', isOpen);
        });

        el.appendChild(notice);
        el.appendChild(originalContent);
      }

      function createMessageElement(msg) {
        // ── Новый компактный формат: системные события ──
        if (msg.act === 'del') {
          return msg.tid
            ? { type: 'meta', action: 'delete', targetId: msg.tid, reason: 'Сообщение удалено' }
            : null;
        }
        if (msg.act === 'ban') {
          if (!msg.tid) return null;
          const bannedName = chatMeta?.users?.[msg.tid]?.name || msg.tid;
          return { type: 'meta', action: 'ban', user: bannedName, reason: 'Пользователь забанен' };
        }

        // ── Старый формат: системные события ──
        const msgType = msg.message_type || msg.action_type;
        if (msgType === "clear_chat" || msgType === "ban_user") {
          const bannedUser = msg.banned_user;
          if (bannedUser) {
             return {
                type: 'meta',
                action: 'ban',
                user: bannedUser,
                reason: msg.ban_type === "timeout" ? `Отстранён на ${msg.ban_duration || '?'} сек` : "Пользователь забанен"
             };
          }
          return null;
        }
        if (msgType === "clear_message" || msgType === "delete_message") {
          const targetId = msg.target_message_id;
          if (targetId) {
             return { type: 'meta', action: 'delete', targetId, reason: "Сообщение удалено" };
          }
          return null;
        }

        // ── Общая часть: формируем время ──
        let timeStr = '00:00';
        if (msg.time_text) {
          timeStr = msg.time_text;
        } else {
          const totalSec = Math.floor(msg._timeSec || 0);
          const h = Math.floor(totalSec / 3600);
          const m = Math.floor((totalSec % 3600) / 60);
          const s = totalSec % 60;
          timeStr = h > 0
            ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
            : `${m}:${String(s).padStart(2,'0')}`;
        }

        let name, color, badgesHTML = '', formattedMessage, replyHTML = '', msgId;

        const isCompact = msg.uid && !msg.author;

        if (isCompact) {
          // ── Новый компактный формат: лениво читаем данные из chatMeta ──
          const userInfo = chatMeta?.users?.[msg.uid] || {};
          name  = userInfo.name  || msg.uid;
          color = userInfo.color || getUserColor(name);
          msgId = msg.mid;

          (userInfo.badges || []).forEach(key => {
            const uuid = chatMeta?.badges?.[key];
            if (uuid) badgesHTML += `<img src="https://static-cdn.jtvnw.net/badges/v1/${uuid}/1" class="badge-icon" alt="badge">`;
          });

          formattedMessage = parseEmotesFromDict(msg.msg || '', msg.em);

          if (msg.rep) {
            const repliedMsg = midToMsg?.get(msg.rep);
            if (repliedMsg) {
              const repliedUser = chatMeta?.users?.[repliedMsg.uid];
              const repliedName = repliedUser?.name || repliedMsg.uid || 'Аноним';
              let replyText = escapeHTML(repliedMsg.msg || '');
              const escapedMention = escapeHTML(`@${repliedName}`);
              const lowerFormatted = formattedMessage.toLowerCase();
              if (lowerFormatted.startsWith(escapedMention.toLowerCase() + ' ')) {
                formattedMessage = formattedMessage.substring(escapedMention.length + 1);
              } else if (lowerFormatted.startsWith(escapedMention.toLowerCase() + ', ')) {
                formattedMessage = formattedMessage.substring(escapedMention.length + 2);
              }
              replyHTML = `<div class="chat-reply" data-reply-id="${escapeHTML(msg.rep)}"><span class="reply-author">@${escapeHTML(repliedName)}:</span><span class="reply-text">${replyText}</span></div>`;
            }
          }
        } else {
          // ── Старый формат ──
          const author = msg.author || {};
          name  = author.display_name || author.name || 'Аноним';
          color = author.colour || msg.colour || getUserColor(name);
          msgId = msg.message_id;

          if (author.badges && author.badges.length > 0) {
            author.badges.forEach(b => {
              if (b && b.icons && b.icons.length > 0 && b.icons[0].url) {
                badgesHTML += `<img src="${b.icons[0].url}" class="badge-icon" alt="badge">`;
              }
            });
          }

          formattedMessage = parseEmotesFromJSON(msg.message, msg.emotes);

          if (msg.in_reply_to) {
            const replyAuthorName = msg.in_reply_to.author
              ? (msg.in_reply_to.author.display_name || msg.in_reply_to.author.name || 'Аноним')
              : 'Аноним';
            let replyText = escapeHTML(msg.in_reply_to.message || '');
            const escapedMention = escapeHTML(`@${replyAuthorName}`);
            const lowerFormatted = formattedMessage.toLowerCase();
            if (lowerFormatted.startsWith(escapedMention.toLowerCase() + ' ')) {
              formattedMessage = formattedMessage.substring(escapedMention.length + 1);
            } else if (lowerFormatted.startsWith(escapedMention.toLowerCase() + ', ')) {
              formattedMessage = formattedMessage.substring(escapedMention.length + 2);
            }
            replyHTML = `<div class="chat-reply" data-reply-id="${escapeHTML(msg.in_reply_to.message_id || '')}"><span class="reply-author">@${escapeHTML(replyAuthorName)}:</span><span class="reply-text">${replyText}</span></div>`;
          }
        }

        if (!color) color = getUserColor(name);

        // ── Общая сборка DOM ──
        const div = document.createElement('div');
        div.className = 'message-container';
        div.setAttribute('data-username', name.toLowerCase());
        if (msgId) div.setAttribute('data-msg-id', msgId);

        div.innerHTML = replyHTML +
                        `<span class="timestamp">${timeStr}</span>` +
                        (badgesHTML ? `<span class="badges">${badgesHTML}</span>` : '') +
                        `<span class="username" style="color: ${color}">${escapeHTML(name)}</span>` +
                        `<span class="colon">:</span>` +
                        `<span class="message-text">${formattedMessage}</span>`;

        const replyEl = div.querySelector('.chat-reply');
        if (replyEl) {
          replyEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const replyId = replyEl.getAttribute('data-reply-id');
            const targetMsg = document.querySelector(`.message-container[data-msg-id="${replyId}"]`);
            if (targetMsg) {
              const chatMessagesEl = document.getElementById('chat-messages');
              if (chatMessagesEl) {
                const containerRect = chatMessagesEl.getBoundingClientRect();
                const targetRect = targetMsg.getBoundingClientRect();
                chatMessagesEl.scrollTo({
                  top: chatMessagesEl.scrollTop + (targetRect.top - containerRect.top) - (containerRect.height / 2) + (targetRect.height / 2),
                  behavior: 'smooth'
                });
              } else {
                targetMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
              targetMsg.style.transition = 'background-color 0.3s ease';
              targetMsg.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
              setTimeout(() => { targetMsg.style.backgroundColor = ''; }, 2000);
            }
          });
        }

        return div;
      }

      function renderSystemText(text) {
        const div = document.createElement("div");
        div.className = "system-message";
        div.textContent = text;
        chatMessages.appendChild(div);
      }

      // Link Preview Logic
      const linkTooltip = document.getElementById('link-preview-tooltip');
      let previewCache = {};
      let hoverTimeout = null;
      let currentHoveredUrl = null;

      async function fetchWithTimeout(resource, options = {}) {
        const { timeout = 5000 } = options;
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        const response = await fetch(resource, {
          ...options,
          signal: controller.signal
        });
        clearTimeout(id);
        return response;
      }

      async function fetchHtml(url) {
        try {
          const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
          const response = await fetchWithTimeout(proxyUrl, { timeout: 4000 });
          if (response.ok) {
            const text = await response.text();
            if (text) return text;
          }
        } catch (e) {
          console.warn("corsproxy.io failed, trying allorigins", e);
        }

        try {
          const alloriginsUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
          const response = await fetchWithTimeout(alloriginsUrl, { timeout: 5000 });
          if (response.ok) {
            const data = await response.json();
            if (data && data.contents) return data.contents;
          }
        } catch (e) {
          console.error("allorigins fallback failed", e);
        }
        
        return null;
      }

      chatMessages.addEventListener('mouseover', (e) => {
        const link = e.target.closest('.chat-link');
        if (link) {
          const url = link.getAttribute('data-url');
          if (currentHoveredUrl === url) return;
          
          currentHoveredUrl = url;
          clearTimeout(hoverTimeout);
          
          hoverTimeout = setTimeout(() => {
            showPreview(link, url);
          }, 400);
        }
      });

      chatMessages.addEventListener('mouseout', (e) => {
        const link = e.target.closest('.chat-link');
        if (link) {
          clearTimeout(hoverTimeout);
          currentHoveredUrl = null;
          linkTooltip.classList.remove('visible');
        }
      });

      function isDirectImageLink(url) {
        try {
          const urlObj = new URL(url);
          const pathname = urlObj.pathname.toLowerCase();
          return pathname.endsWith('.jpg') || 
                 pathname.endsWith('.jpeg') || 
                 pathname.endsWith('.png') || 
                 pathname.endsWith('.gif') || 
                 pathname.endsWith('.webp') ||
                 pathname.endsWith('.svg');
        } catch(e) {
          const cleanUrl = url.split('?')[0].toLowerCase();
          return cleanUrl.endsWith('.jpg') || 
                 cleanUrl.endsWith('.jpeg') || 
                 cleanUrl.endsWith('.png') || 
                 cleanUrl.endsWith('.gif') || 
                 cleanUrl.endsWith('.webp') ||
                 cleanUrl.endsWith('.svg');
        }
      }

      function extractVideoId(url) {
        try {
          const urlObj = new URL(url);
          const hostname = urlObj.hostname.replace('www.', '').toLowerCase();
          if (hostname === 'youtu.be') {
            return urlObj.pathname.split('/')[1];
          } else if (urlObj.pathname.includes('/watch')) {
            return urlObj.searchParams.get('v');
          } else if (urlObj.pathname.startsWith('/shorts/')) {
            return urlObj.pathname.split('/')[2];
          }
        } catch(e){}
        return null;
      }

      async function fetchYoutubeOembed(url) {
        try {
          const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
          const response = await fetchWithTimeout(oembedUrl, { timeout: 4000 });
          if (response.ok) {
            const data = await response.json();
            return {
              title: data.title,
              desc: `Канал: ${data.author_name || 'YouTube'}. Нажмите для просмотра.`,
              image: data.thumbnail_url || `https://img.youtube.com/vi/${extractVideoId(url)}/mqdefault.jpg`
            };
          }
        } catch (e) {
          console.warn("YouTube oEmbed failed", e);
        }
        return null;
      }

      function isYoutubePost(url) {
        try {
          const urlObj = new URL(url);
          const hostname = urlObj.hostname.replace('www.', '').toLowerCase();
          return (hostname === 'youtube.com' || hostname === 'youtu.be') && urlObj.pathname.startsWith('/post/');
        } catch(e) {}
        return false;
      }

      function isCloudflareOrError(title) {
        if (!title) return true;
        const t = title.toLowerCase();
        return t.includes('cloudflare') || 
               t.includes('access denied') || 
               t.includes('attention required') || 
               t.includes('page not found') ||
               t.includes('404') ||
               t.includes('403') ||
               t.includes('ddos') ||
               t === 'youtube' || 
               t.includes('before you continue');
      }

      function getFallbackDomainPreview(url) {
        try {
          const urlObj = new URL(url);
          const domain = urlObj.hostname.replace('www.', '');
          const capitalizedDomain = domain.charAt(0).toUpperCase() + domain.slice(1);
          return {
            title: capitalizedDomain,
            desc: 'Нажмите, чтобы перейти на сайт.',
            image: ''
          };
        } catch(e) {
          return {
            title: url,
            desc: 'Нажмите, чтобы перейти по ссылке.',
            image: ''
          };
        }
      }

      function getSpecialDomainPreview(url) {
        try {
          const urlObj = new URL(url);
          const hostname = urlObj.hostname.replace('www.', '').toLowerCase();
          
          if (hostname === 'youtube.com' || hostname === 'youtu.be') {
            // 1. YouTube Video / Short
            const videoId = extractVideoId(url);
            if (videoId) {
              return {
                title: 'YouTube Видео',
                desc: 'Нажмите, чтобы перейти к просмотру видео на YouTube.',
                image: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
              };
            }
            
            // 2. YouTube Community Post
            if (urlObj.pathname.startsWith('/post/')) {
              return {
                title: 'Публикация на YouTube',
                desc: 'Нажмите, чтобы открыть публикацию во вкладке Сообщество.',
                image: 'https://www.gstatic.com/youtube/img/branding/favicon/favicon_144x144.png'
              };
            }
            
            // 3. YouTube Channel
            if (urlObj.pathname.startsWith('/@') || urlObj.pathname.startsWith('/channel/') || urlObj.pathname.startsWith('/c/')) {
              const channelName = decodeURIComponent(urlObj.pathname.split('/')[1]);
              return {
                title: `Канал YouTube: ${channelName}`,
                desc: 'Нажмите, чтобы перейти на страницу автора.',
                image: 'https://www.gstatic.com/youtube/img/branding/favicon/favicon_144x144.png'
              };
            }
            
            // Generic YouTube
            return {
              title: 'YouTube',
              desc: 'Нажмите, чтобы перейти на YouTube.',
              image: 'https://www.gstatic.com/youtube/img/branding/favicon/favicon_144x144.png'
            };
          }
          
          // Twitch fallback
          if (hostname === 'twitch.tv') {
            const parts = urlObj.pathname.split('/').filter(Boolean);
            if (parts.length === 1 && !['directory', 'downloads', 'jobs', 'press'].includes(parts[0])) {
              return {
                title: `Канал Twitch: ${parts[0]}`,
                desc: `Нажмите для перехода на трансляцию ${parts[0]}.`,
                image: 'https://upload.wikimedia.org/wikipedia/commons/7/74/Twitch_logo.svg'
              };
            }
          }
        } catch(e) {}
        return null;
      }

      async function showPreview(linkEl, url) {
        if (isDirectImageLink(url)) {
          linkTooltip.classList.add('visible');
          const previewData = { isImage: true, url: url };
          previewCache[url] = previewData;
          renderTooltip(previewData, linkEl);
          return;
        }

        // 1. YouTube Video / Shorts (oEmbed check for real title)
        const videoId = extractVideoId(url);
        if (videoId) {
          linkTooltip.innerHTML = '<div class="preview-loading">Загрузка превью YouTube...</div>';
          linkTooltip.classList.add('visible');
          positionTooltip(linkEl);
          
          if (previewCache[url]) {
            renderTooltip(previewCache[url], linkEl);
            return;
          }

          const oembedData = await fetchYoutubeOembed(url);
          if (oembedData) {
            previewCache[url] = oembedData;
            if (currentHoveredUrl === url) {
              renderTooltip(oembedData, linkEl);
            }
            return;
          }
        }

        // 2. YouTube Post Scraper / Fallback
        const specialPreview = getSpecialDomainPreview(url);
        if (specialPreview) {
          linkTooltip.classList.add('visible');
          positionTooltip(linkEl);
          
          if (previewCache[url]) {
            renderTooltip(previewCache[url], linkEl);
            return;
          }

          if (isYoutubePost(url)) {
            linkTooltip.innerHTML = '<div class="preview-loading">Загрузка превью YouTube...</div>';
            try {
              const html = await fetchHtml(url);
              if (html) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                let title = doc.querySelector('meta[property="og:title"]')?.content || 
                            doc.querySelector('title')?.innerText || '';
                
                if (title && !isCloudflareOrError(title)) {
                  let desc = doc.querySelector('meta[property="og:description"]')?.content || 
                             doc.querySelector('meta[name="description"]')?.content || '';
                  let image = doc.querySelector('meta[property="og:image"]')?.content || specialPreview.image;
                  
                  const realData = { title, desc, image };
                  previewCache[url] = realData;
                  if (currentHoveredUrl === url) {
                    renderTooltip(realData, linkEl);
                  }
                  return;
                }
              }
            } catch(e) {}
          }

          // Fallback to static if scrape failed or not a post
          previewCache[url] = specialPreview;
          renderTooltip(specialPreview, linkEl);
          return;
        }

        // 3. Regular Websites
        linkTooltip.innerHTML = '<div class="preview-loading">Загрузка превью...</div>';
        linkTooltip.classList.add('visible');
        
        positionTooltip(linkEl);
        
        if (previewCache[url]) {
          renderTooltip(previewCache[url], linkEl);
          return;
        }

        try {
          const htmlContent = await fetchHtml(url);
          if (htmlContent) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlContent, 'text/html');
            
            let title = doc.querySelector('meta[property="og:title"]')?.content || 
                        doc.querySelector('title')?.innerText || '';
            
            if (title && !isCloudflareOrError(title)) {
              let desc = doc.querySelector('meta[property="og:description"]')?.content || 
                         doc.querySelector('meta[name="description"]')?.content || '';
              let image = doc.querySelector('meta[property="og:image"]')?.content || '';

              if (image && image.startsWith('/')) {
                try {
                  const urlObj = new URL(url);
                  image = urlObj.origin + image;
                } catch(e){}
              }

              const previewData = { title, desc, image };
              previewCache[url] = previewData;
              
              if (currentHoveredUrl === url) {
                renderTooltip(previewData, linkEl);
              }
              return;
            }
          }
          throw new Error('CORS / Cloudflare error');
        } catch (err) {
          if (currentHoveredUrl === url) {
            const fallbackData = getFallbackDomainPreview(url);
            previewCache[url] = fallbackData;
            renderTooltip(fallbackData, linkEl);
          }
        }
      }

      function renderTooltip(data, linkEl) {
        let html = '';
        if (data.isImage) {
          html += `<img src="${escapeHTML(data.url)}" class="preview-image" style="max-height: 200px; object-fit: contain;" onerror="this.parentElement.innerHTML='<div class=&quot;preview-loading&quot;>Не удалось загрузить изображение</div>'">`;
          html += `<div class="preview-title" style="word-break: break-all;">${escapeHTML(data.url)}</div>`;
        } else {
          if (data.image) {
            html += `<img src="${escapeHTML(data.image)}" class="preview-image" onerror="this.style.display='none'">`;
          }
          html += `<div class="preview-title">${escapeHTML(data.title)}</div>`;
          if (data.desc) {
            html += `<div class="preview-desc">${escapeHTML(data.desc)}</div>`;
          }
        }
        linkTooltip.innerHTML = html;
        positionTooltip(linkEl);
      }

      function positionTooltip(linkEl) {
        const rect = linkEl.getBoundingClientRect();
        const sectionRect = document.getElementById('chat-section').getBoundingClientRect();
        
        linkTooltip.style.left = '50px';
        
        const tooltipHeight = linkTooltip.offsetHeight;
        let top = rect.top - sectionRect.top - tooltipHeight - 10;
        
        if (top < 10) {
          top = rect.bottom - sectionRect.top + 10;
        }
        
        linkTooltip.style.top = top + 'px';
      }

      // User Profile Menu Logic
      const userProfilePanel = document.getElementById('user-profile-panel');
      let activeProfileUser = null;
      
      chatMessages.addEventListener('click', (e) => {
        const usernameEl = e.target.closest('.username');
        if (usernameEl) {
          const username = usernameEl.textContent.trim();
          openUserProfile(username);
        }
      });

      document.getElementById('close-profile-btn').addEventListener('click', () => {
        userProfilePanel.classList.remove('open');
        activeProfileUser = null;
      });

      function makeDraggable(el, header) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        header.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
          e = e || window.event;
          if (e.target.closest('button')) return;
          
          e.preventDefault();
          pos3 = e.clientX;
          pos4 = e.clientY;
          document.onmouseup = closeDragElement;
          document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
          e = e || window.event;
          e.preventDefault();
          pos1 = pos3 - e.clientX;
          pos2 = pos4 - e.clientY;
          pos3 = e.clientX;
          pos4 = e.clientY;
          
          let newTop = el.offsetTop - pos2;
          let newLeft = el.offsetLeft - pos1;
          
          const maxLeft = window.innerWidth - el.offsetWidth;
          const maxTop = window.innerHeight - el.offsetHeight;
          
          if (newLeft < 0) newLeft = 0;
          if (newTop < 0) newTop = 0;
          if (newLeft > maxLeft) newLeft = maxLeft;
          if (newTop > maxTop) newTop = maxTop;

          el.style.top = newTop + "px";
          el.style.left = newLeft + "px";
        }

        function closeDragElement() {
          document.onmouseup = null;
          document.onmousemove = null;
        }
      }

      // Initialize dragging
      makeDraggable(userProfilePanel, document.querySelector('.profile-header'));

      // Copy Message click handler
      const msgListEl = document.getElementById('profile-messages-list');
      msgListEl.addEventListener('click', (e) => {
        const copyBtn = e.target.closest('.copy-msg-btn');
        if (copyBtn) {
          const item = copyBtn.closest('.profile-message-item');
          const textEl = item.querySelector('.profile-message-text');
          const rawText = textEl.getAttribute('data-raw') || '';
          
          navigator.clipboard.writeText(rawText).then(() => {
            copyBtn.classList.add('copied');
            copyBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
            setTimeout(() => {
              copyBtn.classList.remove('copied');
              copyBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`;
            }, 1500);
          }).catch(err => {
            console.error('Could not copy text: ', err);
          });
        }
      });

      function isSameUser(msg, username) {
        if (!msg) return false;
        // Новый компактный формат: есть uid, нет author
        if (msg.uid && !msg.author) {
          const name = chatMeta?.users?.[msg.uid]?.name || msg.uid;
          return name.toLowerCase() === username.toLowerCase();
        }
        // Старый формат: msg.author или передан объект author
        const author = msg.author || msg;
        const name = author.display_name || author.name || 'Аноним';
        return name.toLowerCase() === username.toLowerCase();
      }

      function appendMessageToProfileList(msg) {
        const msgListEl = document.getElementById('profile-messages-list');
        if (!msgListEl) return;
        
        // Remove empty placeholder
        const placeholder = msgListEl.querySelector('.profile-message-item[style*="text-align: center"]');
        if (placeholder) {
          placeholder.remove();
        }

        const div = document.createElement('div');
        div.className = 'profile-message-item';

        let timeStr = '00:00';
        if (msg.time_text) {
          timeStr = msg.time_text;
        } else {
          const totalSec = Math.floor(msg._timeSec || 0);
          const h = Math.floor(totalSec / 3600);
          const m = Math.floor((totalSec % 3600) / 60);
          const s = totalSec % 60;
          if (h > 0) timeStr = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
          else timeStr = `${m}:${String(s).padStart(2, '0')}`;
        }

        // Поддерживаем оба формата
        const isCompact = msg.uid && !msg.author;
        const msgText = isCompact ? (msg.msg || '') : (msg.message || '');
        const formattedMessage = isCompact
          ? parseEmotesFromDict(msgText, msg.em)
          : parseEmotesFromJSON(msgText, msg.emotes);

        div.innerHTML = `<span class="profile-message-time">${timeStr}</span>` +
                        `<span class="profile-message-text" data-raw="${escapeHTML(msgText)}">${formattedMessage}</span>` +
                        `<button class="copy-msg-btn" title="Копировать сообщение">` +
                        `<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>` +
                        `</button>`;
        msgListEl.appendChild(div);
        msgListEl.scrollTop = msgListEl.scrollHeight;
      }

      function updateProfileMessages(username) {
        const msgListEl = document.getElementById('profile-messages-list');
        if (!msgListEl) return;
        
        msgListEl.innerHTML = '';
        
        // Define or reference getGlobalCurrentTime
        const getGlobalTime = () => {
          if (typeof targetSeekTime !== "undefined" && targetSeekTime > 0) {
            return targetSeekTime;
          }
          if (typeof videoDurations === "undefined" || videoDurations.length === 0) {
            return videoEl.currentTime;
          }
          const prevPartsDuration = videoDurations.slice(0, currentVideoIndex).reduce((a, b) => a + b, 0);
          return prevPartsDuration + videoEl.currentTime;
        };
        
        const currentTime = getGlobalTime();
        const userMessages = normalizedMessages.filter(msg => {
          return isSameUser(msg, username) && msg._timeSec <= currentTime;
        });

        if (userMessages.length === 0) {
          msgListEl.innerHTML = '<div class="profile-message-item" style="color: var(--text-muted); text-align: center;">Нет сообщений до текущего момента</div>';
        } else {
          userMessages.forEach(msg => {
            appendMessageToProfileList(msg);
          });
        }
      }

      async function getTwitchUser(username) {
        const query = `
          query($login: String!) {
            user(login: $login) {
              id
              login
              displayName
              description
              profileImageURL(width: 300)
              bannerImageURL
              createdAt
              roles {
                isPartner
                isStaff
              }
              broadcastSettings {
                title
                game {
                  name
                }
              }
            }
          }
        `;

        try {
          const response = await fetch("https://gql.twitch.tv/gql", {
            method: "POST",
            headers: {
              "client-id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              query: query,
              variables: { login: username.toLowerCase() }
            })
          });

          const result = await response.json();
          return result.data.user;
        } catch (error) {
          console.error("Ошибка при получении данных пользователя:", error);
          return null;
        }
      }

      function getDefaultAvatar(username) {
        const char = username ? username.charAt(0).toUpperCase() : '?';
        const color = getUserColor(username);
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(32, 32, 32, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 30px Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(char, 32, 32);
        return canvas.toDataURL();
      }

      async function openUserProfile(username) {
        activeProfileUser = username;
        
        const avatarEl = document.getElementById('profile-avatar');
        const usernameEl = document.getElementById('profile-username');
        const roleEl = document.getElementById('profile-role');
        const descEl = document.getElementById('profile-description');

        // Close preview tooltip just in case
        linkTooltip.classList.remove('visible');

        // Set initial loading state
        usernameEl.textContent = username;
        roleEl.textContent = 'Зритель';
        descEl.textContent = 'Получение информации из Twitch...';
        avatarEl.src = getDefaultAvatar(username);

        // Load messages
        updateProfileMessages(username);

        // Center the panel initially
        userProfilePanel.style.top = '15vh';
        userProfilePanel.style.left = 'calc(50vw - 220px)';

        userProfilePanel.classList.add('open');

        // Fetch Twitch GQL data
        const user = await getTwitchUser(username);
        
        // Check if panel is still open for this user (to prevent race conditions)
        if (activeProfileUser !== username) return;

        if (user) {
          if (user.profileImageURL) {
            avatarEl.src = user.profileImageURL;
          }
          descEl.textContent = user.description || 'Описание канала отсутствует.';
          
          let role = 'Зритель';
          if (user.roles) {
            if (user.roles.isStaff) role = 'Staff (Twitch)';
            else if (user.roles.isPartner) role = 'Партнер';
          }
          roleEl.textContent = role;
        } else {
          roleEl.textContent = 'Зритель';
          descEl.textContent = 'Канал не найден или не удалось загрузить описание из Twitch.';
        }
      }

      let chatSeekDebounceTimer = null;

      function handleChatSeek(globalTime) {
        if (isNaN(globalTime)) return;
        
        // Update immediately so syncLoop knows we've seeked
        lastRenderedTime = globalTime;

        if (chatSeekDebounceTimer) {
          clearTimeout(chatSeekDebounceTimer);
        }

        // Debounce the heavy DOM operations to prevent chat from disappearing during rapid scrubbing
        chatSeekDebounceTimer = setTimeout(() => {
          executeChatSeek(globalTime);
        }, 150);
      }

      function executeChatSeek(globalTime) {
        chatMessages.innerHTML = "";

        const allPriorMsgs = normalizedMessages.filter(
          (m) => m._timeSec <= globalTime,
        );
        const preservedBuffer = allPriorMsgs.slice(-300);

        if (preservedBuffer.length > 0) {
          const fragment = document.createDocumentFragment();
          preservedBuffer.forEach((msg) => {
            const el = createMessageElement(msg);
            if (el instanceof Node) {
              fragment.appendChild(el);
            } else if (el && el.type === 'meta') {
              handleMetaEvent(el, fragment, chatMessages);
            }
          });
          chatMessages.appendChild(fragment);
        } else {
          renderSystemText("В этот момент в чате была тишина");
        }
        chatMessages.scrollTop = chatMessages.scrollHeight;
        isScrolledUp = false;
        jumpToBottomBtn.classList.remove("visible");

        // Обновляем сообщения в открытом профиле при перемотке
        if (typeof activeProfileUser !== 'undefined' && activeProfileUser) {
          updateProfileMessages(activeProfileUser);
        }
      }
