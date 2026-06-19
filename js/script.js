/* ==========================================
   K3 – El lugar de los bichos
   Lógica de arrastrar y soltar
========================================== */

(function () {
  "use strict";

  /* ------------------------------------------
     REFERENCIAS AL DOM
  ------------------------------------------ */
  const emptyCells = document.querySelectorAll(".grid--empty .grid__cell");
  const refCells = document.querySelectorAll(".grid--reference .grid__cell");
  const bankBugs = document.querySelectorAll(".bug-bank__bug");

  /* ------------------------------------------
     AUDIO
  ------------------------------------------ */
  const AUDIO = {
    intro: "audio/C26_AS_AU_RE_67_PRIN.mp3",
    wrong: "audio/C26_AS_AU_RE_17_PRIN.mp3",
    correct: "audio/C26_AS_AU_RE_56_PRIN.mp3",
    win: "audio/C26_AS_AU_RE_68_PRIN.mp3",
  };

  const audioCache = new Map();
  let winAudioUnlocked = false;

  /* ------------------------------------------
   REPRODUCCIÓN DE AUDIO
   En iOS/iPadOS, reutilizar el mismo elemento
   <audio> con pause()+currentTime=0+play() en
   sucesión rápida puede dejarlo "atascado" y
   sin sonido. Si el audio cacheado sigue sonando,
   se usa un clon en vez de interrumpirlo.
------------------------------------------ */
  function playAudio(src) {
    const cached = audioCache.get(src);
    let audio;

    if (!cached) {
      audio = new Audio(src);
      audio.preload = "auto";
      audioCache.set(src, audio);
    } else if (cached.paused) {
      audio = cached;
      audio.currentTime = 0;
    } else {
      audio = cached.cloneNode(true);
    }

    audio.play().catch((err) => {
      console.warn("No se pudo reproducir audio:", src, err);
    });
  }

  // Precarga los efectos para que estén listos desde el primer uso
  [AUDIO.wrong, AUDIO.correct, AUDIO.win].forEach((src) => {
    const audio = new Audio(src);
    audio.preload = "auto";
    audioCache.set(src, audio);
  });

  /* ------------------------------------------
   DESBLOQUEO DE AUDIO EN iOS/iPadOS
   Safari solo permite reproducir audio si el
   .play() ocurre síncronamente dentro de un
   gesto del usuario. El audio de victoria se
   dispara con delay (setTimeout), así que lo
   "desbloqueamos" en el primer toque/clic,
   reproduciéndolo y pausándolo de inmediato.
------------------------------------------ */
  function unlockWinAudio() {
    if (winAudioUnlocked) return;
    const winAudio = audioCache.get(AUDIO.win);
    if (!winAudio) return;

    winAudio
      .play()
      .then(() => {
        winAudio.pause();
        winAudio.currentTime = 0;
        winAudioUnlocked = true;
      })
      .catch(() => {
        // Si falla, se reintentará en el siguiente gesto
      });
  }

  document.addEventListener("pointerdown", unlockWinAudio, { once: true });
  document.addEventListener("touchstart", unlockWinAudio, { once: true });
  /* ------------------------------------------
     SOLUCIÓN
     Array con el src esperado en cada celda
     de la grid vacía (null = celda vacía).
  ------------------------------------------ */
  const solution = Array.from(refCells).map((cell) => {
    const img = cell.querySelector("img");
    return img ? img.getAttribute("src") : null;
  });

  /* ------------------------------------------
     ESTADO DEL JUEGO
  ------------------------------------------ */
  let correctCount = 0;
  const totalBugs = solution.filter(Boolean).length; // 6

  /* ------------------------------------------
     DRAG SOURCE
     Qué imagen se arrastra y desde dónde viene.
  ------------------------------------------ */
  let dragSrc = null; // <img> en movimiento
  let dragFromCell = null; // celda de origen (null si viene del banco)

  /* ------------------------------------------
     HELPERS
  ------------------------------------------ */

  /** Índice (0-11) de una celda en la grid vacía */
  function cellIndex(cell) {
    return Array.from(emptyCells).indexOf(cell);
  }

  /** Rebota la imagen y la devuelve a su origen */
  function bounceBack(img, originParent) {
    img.classList.add("bug--bounce");
    img.addEventListener(
      "animationend",
      () => {
        img.classList.remove("bug--bounce");
        if (originParent) {
          originParent.appendChild(img);
        } else {
          img.draggable = true;
          img.classList.remove("bug--placed");
          document.querySelector(".bug-bank").appendChild(img);
        }
      },
      { once: true },
    );
  }

  /* ------------------------------------------
     DRAG — ORIGEN
  ------------------------------------------ */

  /** Registra los listeners de arrastre en una imagen */
  function makeDraggable(img) {
    img.addEventListener("dragstart", onDragStart);
    img.addEventListener("dragend", onDragEnd);
    img.addEventListener("touchstart", onTouchStart, { passive: false });
  }

  function onDragStart(e) {
    dragSrc = e.currentTarget;
    dragFromCell = dragSrc.closest(".grid--empty .grid__cell") || null;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragSrc.getAttribute("src"));
    // setTimeout para que el navegador capture el ghost antes de ocultar el original
    setTimeout(() => dragSrc.classList.add("bug--dragging"), 0);
  }

  function onDragEnd(e) {
    // Restaura visibilidad si el drop no fue procesado (soltó fuera)
    if (dragSrc) dragSrc.classList.remove("bug--dragging");
  }

  /* ------------------------------------------
     DRAG — DESTINO (celdas de la grid vacía)
  ------------------------------------------ */

  emptyCells.forEach((cell) => {
    cell.addEventListener("dragover", onDragOver);
    cell.addEventListener("dragleave", onDragLeave);
    cell.addEventListener("drop", onDrop);
  });

  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    this.classList.add("cell--hover");
  }

  function onDragLeave() {
    this.classList.remove("cell--hover");
  }

  function onDrop(e) {
    e.preventDefault();
    this.classList.remove("cell--hover");

    if (!dragSrc) return;

    dragSrc.classList.remove("bug--dragging");

    const targetCell = this;
    const idx = cellIndex(targetCell);

    // Celda bloqueada → rebote
    if (targetCell.dataset.locked === "true") {
      playAudio(AUDIO.wrong);
      if (dragFromCell) {
        dragFromCell.appendChild(dragSrc);
      } else {
        document.querySelector(".bug-bank").appendChild(dragSrc);
      }
      dragSrc.classList.add("bug--bounce");
      dragSrc.addEventListener(
        "animationend",
        () => dragSrc.classList.remove("bug--bounce"),
        { once: true },
      );
      dragSrc = null;
      dragFromCell = null;
      return;
    }

    // Si la celda tenía un bicho sin bloquear, lo devolvemos al banco
    const existing = targetCell.querySelector("img");
    if (existing) {
      existing.draggable = true;
      existing.classList.remove("bug--placed");
      document.querySelector(".bug-bank").appendChild(existing);
      makeDraggable(existing);
    }

    const expectedSrc = solution[idx];
    const droppedSrc = dragSrc.getAttribute("src");

    if (expectedSrc && droppedSrc === expectedSrc) {
      placeCorrectly(dragSrc, targetCell);
    } else {
      playAudio(AUDIO.wrong);
      if (dragFromCell) {
        dragFromCell.appendChild(dragSrc);
      } else {
        document.querySelector(".bug-bank").appendChild(dragSrc);
      }
      dragSrc.classList.add("bug--bounce");
      dragSrc.addEventListener(
        "animationend",
        () => dragSrc.classList.remove("bug--bounce"),
        { once: true },
      );
    }

    dragSrc = null;
    dragFromCell = null;
  }

  /** Coloca el bicho correctamente, lo bloquea y verifica victoria */
  function placeCorrectly(img, cell) {
    img.draggable = false;
    img.classList.add("bug--placed");
    cell.appendChild(img);
    cell.dataset.locked = "true";
    playAudio(AUDIO.correct);

    img.classList.add("bug--bounce-correct");
    img.addEventListener(
      "animationend",
      () => img.classList.remove("bug--bounce-correct"),
      { once: true },
    );

    correctCount++;
    if (correctCount === totalBugs) {
      setTimeout(() => playAudio(AUDIO.win), 600);
      showWinFeedback();
    }
  }

  /* ------------------------------------------
     TOUCH — soporte táctil para tablet/móvil
  ------------------------------------------ */

  let touchClone = null; // imagen fantasma que sigue el dedo
  let touchOriginX = 0;
  let touchOriginY = 0;

  function onTouchStart(e) {
    if (e.currentTarget.draggable === false) return;

    e.preventDefault();
    dragSrc = e.currentTarget;
    dragFromCell = dragSrc.closest(".grid--empty .grid__cell") || null;

    const touch = e.touches[0];
    const rect = dragSrc.getBoundingClientRect();

    touchOriginX = touch.clientX - rect.left;
    touchOriginY = touch.clientY - rect.top;

    // Clon visual que sigue el dedo
    touchClone = dragSrc.cloneNode(true);
    touchClone.style.cssText = `
      position: fixed;
      z-index: 1000;
      pointer-events: none;
      width: ${rect.width}px;
      height: ${rect.height}px;
      opacity: 0.85;
      left: ${touch.clientX - touchOriginX}px;
      top:  ${touch.clientY - touchOriginY}px;
    `;
    document.body.appendChild(touchClone);

    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { once: true });
    document.addEventListener("touchcancel", onTouchCancel, { once: true });
  }

  function onTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    if (touchClone) {
      touchClone.style.left = `${touch.clientX - touchOriginX}px`;
      touchClone.style.top = `${touch.clientY - touchOriginY}px`;
    }
  }

  function onTouchEnd(e) {
    document.removeEventListener("touchmove", onTouchMove);
    if (touchClone) {
      touchClone.remove();
      touchClone = null;
    }

    const touch = e.changedTouches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const targetCell = target
      ? target.closest(".grid--empty .grid__cell")
      : null;

    // Soltó fuera de una celda → rebote
    if (!targetCell || !dragSrc) {
      if (dragSrc) {
        dragSrc.classList.add("bug--bounce");
        dragSrc.addEventListener(
          "animationend",
          () => dragSrc.classList.remove("bug--bounce"),
          { once: true },
        );
        playAudio(AUDIO.wrong);
      }
      dragSrc = dragFromCell = null;
      return;
    }

    const idx = cellIndex(targetCell);
    const expectedSrc = solution[idx];
    const droppedSrc = dragSrc.getAttribute("src");

    // Celda bloqueada → rebote
    if (targetCell.dataset.locked === "true") {
      playAudio(AUDIO.wrong);
      if (dragFromCell) {
        dragFromCell.appendChild(dragSrc);
      } else {
        document.querySelector(".bug-bank").appendChild(dragSrc);
      }
      dragSrc.classList.add("bug--bounce");
      dragSrc.addEventListener(
        "animationend",
        () => dragSrc.classList.remove("bug--bounce"),
        { once: true },
      );
      dragSrc = dragFromCell = null;
      return;
    }

    // Si había un bicho sin bloquear, lo devolvemos al banco
    const existing = targetCell.querySelector("img");
    if (existing && existing !== dragSrc) {
      existing.draggable = true;
      existing.classList.remove("bug--placed");
      document.querySelector(".bug-bank").appendChild(existing);
      makeDraggable(existing);
    }

    if (expectedSrc && droppedSrc === expectedSrc) {
      placeCorrectly(dragSrc, targetCell);
    } else {
      playAudio(AUDIO.wrong);
      if (dragFromCell) {
        dragFromCell.appendChild(dragSrc);
      } else {
        document.querySelector(".bug-bank").appendChild(dragSrc);
      }
      dragSrc.classList.add("bug--bounce");
      dragSrc.addEventListener(
        "animationend",
        () => dragSrc.classList.remove("bug--bounce"),
        { once: true },
      );
    }

    dragSrc = dragFromCell = null;
  }

  function onTouchCancel() {
    document.removeEventListener("touchmove", onTouchMove);
    if (touchClone) {
      touchClone.remove();
      touchClone = null;
    }
    dragSrc = dragFromCell = null;
  }

  /* ------------------------------------------
     PANTALLA DE VICTORIA
  ------------------------------------------ */
  function showWinFeedback() {
    document.body.classList.add("game--win");

    const overlay = document.createElement("div");
    overlay.className = "win-overlay";
    overlay.innerHTML = `
      <div class="win-overlay__content">
        <div class="win-overlay__cloud-wrap">
          <img class="win-overlay__cloud" src="img/nube_final.png" alt="" />
          <p class="win-overlay__msg">
            ¡Muy bien!<br>
            Acomodaste todas las<br>
            imágenes correctamente.
          </p>
          <button class="win-overlay__continue" aria-label="Continuar">
            <img src="img/end_btn.png" alt="Continuar" />
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay
      .querySelector(".win-overlay__continue")
      .addEventListener("click", () => location.reload(), { once: true });
  }

  /* ------------------------------------------
     AUDIO DE INSTRUCCIÓN
     Se reproduce al cargar; el botón lo reinicia.
  ------------------------------------------ */
  const introAudio = new Audio(AUDIO.intro);

  function playIntro() {
    introAudio.pause();
    introAudio.currentTime = 0;
    introAudio.play().catch(() => {});
  }

  document.querySelectorAll(".controls__btn--audio").forEach((btn) => {
    btn.addEventListener("click", playIntro);
  });

  /* ------------------------------------------
     INICIALIZACIÓN
  ------------------------------------------ */
  bankBugs.forEach((bug) => makeDraggable(bug));

  // Reproduce la instrucción al cargar.
  // Si el autoplay está bloqueado, espera la primera interacción.
  window.addEventListener("load", () => {
    setTimeout(() => {
      introAudio.play().catch(() => {
        const unlockIntro = () => {
          playIntro();
          document.removeEventListener("pointerdown", unlockIntro);
        };
        document.addEventListener("pointerdown", unlockIntro, { once: true });
      });
    }, 500);
  });
})();
