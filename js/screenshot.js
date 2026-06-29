      // Screenshot Selection Mode Logic
      let isScreenshotMode = false;
      const chatMessagesEl = document.getElementById('chat-messages');
      const screenshotToggleBtn = document.getElementById('chat-screenshot-toggle-btn');
      const screenshotActionBar = document.getElementById('screenshot-action-bar');
      const screenshotSelectedCount = document.getElementById('screenshot-selected-count');
      const screenshotCancelBtn = document.getElementById('screenshot-cancel-btn');
      const screenshotGenerateBtn = document.getElementById('screenshot-generate-btn');
      
      const screenshotPreviewModal = document.getElementById('screenshot-preview-modal');
      const screenshotPreviewImg = document.getElementById('screenshot-preview-img');
      const closeScreenshotPreviewBtn = document.getElementById('close-screenshot-preview-btn');
      const copyScreenshotBtn = document.getElementById('copy-screenshot-btn');
      const downloadScreenshotBtn = document.getElementById('download-screenshot-btn');

      let generatedCanvas = null;

      screenshotToggleBtn.addEventListener('click', () => {
        isScreenshotMode = !isScreenshotMode;
        if (isScreenshotMode) {
          enterScreenshotMode();
        } else {
          exitScreenshotMode();
        }
      });

      function enterScreenshotMode() {
        const scrollFromBottom = chatMessagesEl.scrollHeight - chatMessagesEl.scrollTop;
        isScreenshotMode = true;
        chatMessagesEl.classList.add('screenshot-mode');
        screenshotToggleBtn.classList.add('active');
        screenshotActionBar.classList.add('visible');
        updateSelectedCount();
        
        // Восстанавливаем позицию прокрутки, чтобы не было прыжка
        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight - scrollFromBottom;
      }

      function exitScreenshotMode() {
        const scrollFromBottom = chatMessagesEl.scrollHeight - chatMessagesEl.scrollTop;
        isScreenshotMode = false;
        chatMessagesEl.classList.remove('screenshot-mode');
        screenshotToggleBtn.classList.remove('active');
        screenshotActionBar.classList.remove('visible');
        
        const selected = chatMessagesEl.querySelectorAll('.selected-for-screenshot');
        selected.forEach(el => el.classList.remove('selected-for-screenshot'));
        
        // Восстанавливаем позицию прокрутки, чтобы не было прыжка
        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight - scrollFromBottom;
      }

      chatMessagesEl.addEventListener('click', (e) => {
        if (!isScreenshotMode) return;
        
        const chatMsg = e.target.closest('.message-container');
        if (chatMsg) {
          e.preventDefault();
          e.stopPropagation();
          
          chatMsg.classList.toggle('selected-for-screenshot');
          updateSelectedCount();
        }
      }, true);

      function updateSelectedCount() {
        const count = chatMessagesEl.querySelectorAll('.selected-for-screenshot').length;
        screenshotSelectedCount.textContent = count;
        if (count > 0) {
          screenshotGenerateBtn.disabled = false;
          screenshotGenerateBtn.style.opacity = '1';
        } else {
          screenshotGenerateBtn.disabled = true;
          screenshotGenerateBtn.style.opacity = '0.5';
        }
      }

      screenshotCancelBtn.addEventListener('click', () => {
        exitScreenshotMode();
      });

      screenshotGenerateBtn.addEventListener('click', async () => {
        const selected = chatMessagesEl.querySelectorAll('.selected-for-screenshot');
        if (selected.length === 0) return;

        if (typeof html2canvas === 'undefined') {
          alert('Библиотека html2canvas не загружена. Проверьте интернет-соединение.');
          return;
        }

        screenshotGenerateBtn.textContent = 'Генерация...';
        screenshotGenerateBtn.disabled = true;

        try {
          const tempContainer = document.createElement('div');
          tempContainer.style.position = 'fixed';
          tempContainer.style.left = '-9999px';
          tempContainer.style.top = '0';
          tempContainer.style.width = '400px'; 
          tempContainer.style.background = '#18181b'; 
          tempContainer.style.padding = '16px';
          tempContainer.style.display = 'flex';
          tempContainer.style.flexDirection = 'column';
          tempContainer.style.gap = '8px';
          
          selected.forEach(el => {
            const clone = el.cloneNode(true);
            clone.classList.remove('selected-for-screenshot');
            clone.style.paddingLeft = '20px';
            tempContainer.appendChild(clone);
          });

          document.body.appendChild(tempContainer);

          const canvas = await html2canvas(tempContainer, {
            useCORS: true,
            backgroundColor: '#18181b',
            scale: 2
          });

          document.body.removeChild(tempContainer);

          generatedCanvas = canvas;
          screenshotPreviewImg.src = canvas.toDataURL('image/png');
          screenshotPreviewModal.classList.add('open');
          
        } catch (error) {
          console.error('Ошибка создания скриншота:', error);
          alert('Не удалось создать скриншот: ' + error.message);
        } finally {
          screenshotGenerateBtn.textContent = 'Скриншот';
          screenshotGenerateBtn.disabled = false;
        }
      });

      closeScreenshotPreviewBtn.addEventListener('click', () => {
        screenshotPreviewModal.classList.remove('open');
        generatedCanvas = null;
      });

      screenshotPreviewModal.addEventListener('click', (e) => {
        if (e.target === screenshotPreviewModal) {
          screenshotPreviewModal.classList.remove('open');
          generatedCanvas = null;
        }
      });

      downloadScreenshotBtn.addEventListener('click', () => {
        if (!generatedCanvas) return;
        
        const link = document.createElement('a');
        link.download = `chat-screenshot-${Date.now()}.png`;
        link.href = generatedCanvas.toDataURL('image/png');
        link.click();

        screenshotPreviewModal.classList.remove('open');
        generatedCanvas = null;
        exitScreenshotMode();
      });

      copyScreenshotBtn.addEventListener('click', async () => {
        if (!generatedCanvas) return;
        
        try {
          generatedCanvas.toBlob(async (blob) => {
            if (!blob) {
              alert('Ошибка генерации изображения для копирования.');
              return;
            }
            
            try {
              const item = new ClipboardItem({ 'image/png': blob });
              await navigator.clipboard.write([item]);
              
              const originalText = copyScreenshotBtn.textContent;
              copyScreenshotBtn.textContent = 'Скопировано!';
              setTimeout(() => {
                copyScreenshotBtn.textContent = originalText;
                screenshotPreviewModal.classList.remove('open');
                generatedCanvas = null;
                exitScreenshotMode();
              }, 1500);
            } catch (err) {
              console.error('Ошибка буфера обмена:', err);
              alert('Браузер заблокировал копирование картинки (возможно из-за HTTP/file:// протокола или отсутствия фокуса).');
            }
          }, 'image/png');
        } catch (e) {
          console.error(e);
        }
      });
      // Fullscreen Chat Collapse Logic
      const hideChatBtn = document.getElementById('hide-chat-btn');
      const showChatBtn = document.getElementById('show-chat-btn');
      const chatSection = document.getElementById('chat-section');

      hideChatBtn.addEventListener('click', () => {
        appContainer.classList.add('fullscreen-chat-hidden');
        chatSection.classList.add('fullscreen-hidden');
      });

      showChatBtn.addEventListener('click', () => {
        appContainer.classList.remove('fullscreen-chat-hidden');
        chatSection.classList.remove('fullscreen-hidden');
      });

      document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) {
          appContainer.classList.remove('fullscreen-chat-hidden');
          chatSection.classList.remove('fullscreen-hidden');
        }
      });