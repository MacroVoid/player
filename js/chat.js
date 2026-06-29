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

        function syncLoop() {
          if (!videoEl.paused && !videoEl.ended) {
            const currentTime = videoEl.currentTime;
            const toRender = normalizedMessages.filter(
              (m) => m._timeSec > lastRenderedTime && m._timeSec <= currentTime,
            );

            if (toRender.length > 0) {
              const fragment = document.createDocumentFragment();
              toRender.forEach((msg) => {
                fragment.appendChild(createMessageElement(msg));
                if (typeof activeProfileUser !== 'undefined' && activeProfileUser && isSameUser(msg.author, activeProfileUser)) {
                  appendMessageToProfileList(msg);
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

        videoEl.addEventListener("seeked", () => {
          const targetTime = videoEl.currentTime;
          lastRenderedTime = targetTime;
          chatMessages.innerHTML = "";

          const allPriorMsgs = normalizedMessages.filter(
            (m) => m._timeSec <= targetTime,
          );
          const preservedBuffer = allPriorMsgs.slice(-300);

          if (preservedBuffer.length > 0) {
            const fragment = document.createDocumentFragment();
            preservedBuffer.forEach((msg) =>
              fragment.appendChild(createMessageElement(msg)),
            );
            chatMessages.appendChild(fragment);
          } else {
            renderSystemText("В этот момент в чате была тишина");
          }
          chatMessages.scrollTop = chatMessages.scrollHeight;
          jumpToBottomBtn.classList.remove("visible");

          // Обновляем сообщения в открытом профиле при перемотке
          if (typeof activeProfileUser !== 'undefined' && activeProfileUser) {
            updateProfileMessages(activeProfileUser);
          }
        });
      }

      function createMessageElement(msg) {
        const div = document.createElement('div');
        div.className = 'message-container';

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

        const author = msg.author || {};
        const name = author.display_name || author.name || 'Аноним';
        const color = author.colour || msg.colour || getUserColor(name);

        let badgesHTML = '';
        if (author.badges && author.badges.length > 0) {
          author.badges.forEach(b => {
            if (b && b.icons && b.icons.length > 0 && b.icons[0].url) {
              badgesHTML += `<img src="${b.icons[0].url}" class="badge-icon" alt="badge">`;
            }
          });
        }

        // Парсим смайлики
        const formattedMessage = parseEmotesFromJSON(msg.message, msg.emotes);

        div.innerHTML = `<span class="timestamp">${timeStr}</span>` +
                        (badgesHTML ? `<span class="badges">${badgesHTML}</span>` : '') +
                        `<span class="username" style="color: ${color}">${name}</span>` +
                        `<span class="colon">:</span>` +
                        `<span class="message-text">${formattedMessage}</span>`;
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

      function isSameUser(author, username) {
        if (!author) return false;
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

        const formattedMessage = parseEmotesFromJSON(msg.message, msg.emotes);

        div.innerHTML = `<span class="profile-message-time">${timeStr}</span>` +
                        `<span class="profile-message-text" data-raw="${escapeHTML(msg.message)}">${formattedMessage}</span>` +
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
        const currentTime = videoEl.currentTime;
        const userMessages = normalizedMessages.filter(msg => {
          return isSameUser(msg.author, username) && msg._timeSec <= currentTime;
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
