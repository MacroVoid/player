      // IndexedDB Storage helper
      class IndexedDBStore {
        constructor() {
          this.dbName = 'VODPlayerStorage';
          this.storeName = 'saved_files';
          this.db = null;
        }

        open() {
          return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              this.db = request.result;
              resolve();
            };
            request.onupgradeneeded = (e) => {
              const db = e.target.result;
              if (!db.objectStoreNames.contains(this.storeName)) {
                db.createObjectStore(this.storeName);
              }
            };
          });
        }

        get(key) {
          return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error("Database not open"));
            const transaction = this.db.transaction(this.storeName, 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
        }

        set(key, value) {
          return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error("Database not open"));
            const transaction = this.db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(value, key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
          });
        }
      }

      const dbStore = new IndexedDBStore();

      // Open DB and check for saved session
      dbStore.open().then(async () => {
        const hasSavedVideo = await dbStore.get('video');
        const hasSavedChat = await dbStore.get('chat');
        const videoName = await dbStore.get('videoName') || 'Неизвестный видеофайл';
        const chatName = await dbStore.get('chatName') || 'Неизвестный файл чата';

        if (hasSavedVideo && hasSavedChat) {
          document.getElementById('restore-video-name').textContent = videoName;
          document.getElementById('restore-chat-name').textContent = chatName;
          document.getElementById('restore-container').style.display = 'block';
        }
      }).catch(err => {
        console.warn("IndexedDB initialization error:", err);
      });
