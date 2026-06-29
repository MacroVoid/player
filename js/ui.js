      function showActionFeedback(iconSVG, text = "") {
        const overlay = document.getElementById("action-overlay-center");
        const iconContainer = document.getElementById("action-icon-center");
        const textContainer = document.getElementById("action-text-center");

        iconContainer.innerHTML = iconSVG;
        textContainer.textContent = text;
        textContainer.style.display = text ? "block" : "none";

        overlay.classList.remove("animate", "fade-out");
        void overlay.offsetWidth; // Сброс анимации
        overlay.classList.add("animate");

        clearTimeout(actionOverlayTimeout);
        actionOverlayTimeout = setTimeout(() => {
          overlay.classList.remove("animate");
          overlay.classList.add("fade-out");
        }, 300);
      }
