/* ==========================================
   K3 – El lugar de los bichos
   Lógica de arrastrar y soltar
========================================== */

(function () {
  ("use strict");

  /* ==========================================
     REFERENCIAS AL DOM
  ========================================== */
  const emptyCells = document.querySelectorAll(".grid--empty .grid__cell");
  const refCells = document.querySelectorAll(".grid--reference .grid__cell");
  const bankBugs = document.querySelectorAll(".bug-bank__bug");

  /* ==========================================
     AUDIO
  ========================================== */
  const AUDIO = {
    intro: "audio/C26_AS_AU_RE_67_PRIN.mp3",
    wrong: "audio/C26_AS_AU_RE_17_PRIN.mp3",
    correct: "audio/C26_AS_AU_RE_56_PRIN.mp3",
    win: "audio/C26_AS_AU_RE_68_PRIN.mp3",
  };

  // Cachea instancias de Audio ya creadas
  const audioCache = new Map();

  // Audio que se está reproduciendo actualmente
  let currentAudio = null;

  // Indica si el audio de victoria ya quedó "desbloqueado" para iOS/iPadOS
  let winAudioUnlocked = false;

  /**
   * Reproduce un sonido.
   * Si hay otro sonando, se detiene inmediatamente.
   */
  function playAudio(src) {
    let audio = audioCache.get(src);

    if (!audio) {
      audio = new Audio(src);
      audio.preload = "auto";
      audioCache.set(src, audio);
    }

    // Detiene cualquier audio anterior
    if (currentAudio && currentAudio !== audio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }

    currentAudio = audio;

    audio.pause();
    audio.currentTime = 0;

    audio.play().catch((err) => {
      console.warn("No se pudo reproducir audio:", src, err);
    });
  }

  /**
   * Detiene todos los audios y los reinicia.
   */
  function stopAllAudio() {
    audioCache.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });

    currentAudio = null;
  }

  // Precarga todos los audios
  [AUDIO.intro, AUDIO.wrong, AUDIO.correct, AUDIO.win].forEach((src) => {
    const audio = new Audio(src);
    audio.preload = "auto";
    audioCache.set(src, audio);
  });

  /**
   * Desbloquea el audio de victoria en iOS/iPadOS.
   *
   * Safari solo permite reproducir audio si el .play() ocurre de
   * forma síncrona dentro de un gesto del usuario. El audio de
   * victoria se dispara con un delay (setTimeout en placeCorrectly),
   * así que aquí lo "desbloqueamos" en el primer toque/clic de toda
   * la página, reproduciéndolo y pausándolo de inmediato.
   */
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
        // Si falla, se reintentará en el siguiente gesto del usuario
      });
  }

  document.addEventListener("pointerdown", unlockWinAudio, { once: true });
  document.addEventListener("touchstart", unlockWinAudio, { once: true });

  /* ==========================================
     SOLUCIÓN DEL JUEGO
  ========================================== */

  // Array con el src esperado en cada celda de la grid vacía
  // (null = celda que debe quedar vacía)
  const solution = Array.from(refCells).map((cell) => {
    const img = cell.querySelector("img");
    return img ? img.getAttribute("src") : null;
  });

  // Cantidad de bichos colocados correctamente hasta el momento
  let correctCount = 0;

  // Total de bichos que hay que colocar para ganar (6)
  const totalBugs = solution.filter(Boolean).length;

  /* ==========================================
     ARRASTRE UNIFICADO (mouse + touch)
     Mismo motor para desktop e iPad: el cursor/
     clon visual se controla por completo en JS
     y no depende del drag nativo del navegador.
  ========================================== */

  let dragSrc = null; // <img> en movimiento
  let dragFromCell = null; // celda de origen (null si viene del banco)
  let dragClone = null; // imagen fantasma que sigue al puntero/dedo
  let pointerOffsetX = 0; // distancia del punto de toque al borde izq. de la imagen
  let pointerOffsetY = 0; // distancia del punto de toque al borde sup. de la imagen
  let hoveredCell = null; // celda actualmente resaltada bajo el puntero/dedo
  let playAreaRect = null; // rectángulo permitido para el arrastre (grids + banco)

  /** Índice (0-11) de una celda dentro de la grid vacía */
  function cellIndex(cell) {
    return Array.from(emptyCells).indexOf(cell);
  }

  /**
   * Calcula el rectángulo que envuelve a .game__grids + .bug-bank.
   * Se usa para limitar el arrastre a esa zona y que el bicho no
   * se salga de la pantalla ni invada el área de la guía/controles.
   */
  function getPlayAreaRect() {
    const grids = document.querySelector(".game__grids");
    const bank = document.querySelector(".bug-bank");
    const r1 = grids.getBoundingClientRect();
    const r2 = bank.getBoundingClientRect();

    return {
      left: Math.min(r1.left, r2.left),
      top: Math.min(r1.top, r2.top),
      right: Math.max(r1.right, r2.right),
      bottom: Math.max(r1.bottom, r2.bottom),
    };
  }

  /** Registra los listeners de arrastre (mouse + touch) en una imagen */
  function makeDraggable(img) {
    img.addEventListener("mousedown", onPointerStart);
    img.addEventListener("touchstart", onPointerStart, { passive: false });
  }

  /** Inicia el arrastre: crea el clon visual y arma el área permitida */
  function onPointerStart(e) {
    // Bicho ya colocado correctamente → bloqueado, no se arrastra
    if (e.currentTarget.classList.contains("bug--placed")) return;

    const isTouch = e.type === "touchstart";
    if (!isTouch && e.button !== 0) return; // solo clic izquierdo

    e.preventDefault();

    dragSrc = e.currentTarget;
    dragFromCell = dragSrc.closest(".grid--empty .grid__cell") || null;
    playAreaRect = getPlayAreaRect();

    const point = isTouch ? e.touches[0] : e;
    const rect = dragSrc.getBoundingClientRect();
    pointerOffsetX = point.clientX - rect.left;
    pointerOffsetY = point.clientY - rect.top;

    // Clon visual que sigue al puntero (mouse o dedo)
    dragClone = dragSrc.cloneNode(true);
    dragClone.style.cssText = `
      position: fixed;
      z-index: 1000;
      pointer-events: none;
      width: ${rect.width}px;
      height: ${rect.height}px;
      opacity: 0.85;
      left: ${point.clientX - pointerOffsetX}px;
      top:  ${point.clientY - pointerOffsetY}px;
    `;
    document.body.appendChild(dragClone);

    dragSrc.classList.add("bug--dragging");
    document.body.classList.add("is-dragging");

    if (isTouch) {
      document.addEventListener("touchmove", onPointerMove, {
        passive: false,
      });
      document.addEventListener("touchend", onPointerEnd, { once: true });
      document.addEventListener("touchcancel", onPointerCancel, {
        once: true,
      });
    } else {
      document.addEventListener("mousemove", onPointerMove);
      document.addEventListener("mouseup", onPointerEnd, { once: true });
    }
  }

  /** Mueve el clon visual y resalta la celda que está debajo */
  function onPointerMove(e) {
    const isTouch = e.type === "touchmove";
    if (isTouch) e.preventDefault();
    const point = isTouch ? e.touches[0] : e;

    if (dragClone && playAreaRect) {
      const cloneWidth = dragClone.offsetWidth;
      const cloneHeight = dragClone.offsetHeight;

      let x = point.clientX - pointerOffsetX;
      let y = point.clientY - pointerOffsetY;

      // Clampea para que el clon no se salga del área de juego
      x = Math.max(
        playAreaRect.left,
        Math.min(x, playAreaRect.right - cloneWidth),
      );
      y = Math.max(
        playAreaRect.top,
        Math.min(y, playAreaRect.bottom - cloneHeight),
      );

      dragClone.style.left = `${x}px`;
      dragClone.style.top = `${y}px`;
    }

    // Detecta la celda debajo del puntero/dedo para resaltarla (cell--hover)
    const target = document.elementFromPoint(point.clientX, point.clientY);
    let cellUnderPointer = target
      ? target.closest(".grid--empty .grid__cell")
      : null;

    // Si la celda ya está bloqueada (acierto previo), no se trata
    // como zona activa: no se resalta como si se pudiera soltar ahí.
    if (cellUnderPointer && cellUnderPointer.dataset.locked === "true") {
      cellUnderPointer = null;
    }

    if (cellUnderPointer !== hoveredCell) {
      if (hoveredCell) hoveredCell.classList.remove("cell--hover");
      if (cellUnderPointer) cellUnderPointer.classList.add("cell--hover");
      hoveredCell = cellUnderPointer;
    }
  }

  /** Finaliza el arrastre: limpia visuales y resuelve el drop */
  function onPointerEnd(e) {
    const isTouch = e.type === "touchend";
    document.removeEventListener(
      isTouch ? "touchmove" : "mousemove",
      onPointerMove,
    );

    cleanupDragVisuals();

    const point = isTouch ? e.changedTouches[0] : e;
    const target = document.elementFromPoint(point.clientX, point.clientY);
    const targetCell = target
      ? target.closest(".grid--empty .grid__cell")
      : null;

    resolveDrop(targetCell);
  }

  /** Cancela el arrastre (ej. interrupción del sistema en touch) */
  function onPointerCancel() {
    document.removeEventListener("touchmove", onPointerMove);
    cleanupDragVisuals();
    dragSrc = dragFromCell = null;
  }

  /** Quita el clon visual, la clase de arrastre y el resaltado de celda */
  function cleanupDragVisuals() {
    document.body.classList.remove("is-dragging");

    if (dragClone) {
      dragClone.remove();
      dragClone = null;
    }

    if (dragSrc) dragSrc.classList.remove("bug--dragging");

    if (hoveredCell) {
      hoveredCell.classList.remove("cell--hover");
      hoveredCell = null;
    }
  }

  /** Aplica el resultado del drop: correcto, incorrecto, bloqueado o fuera de celda */
  function resolveDrop(targetCell) {
    if (!dragSrc) return;

    // Soltó fuera de una celda válida → rebote
    if (!targetCell) {
      returnToOrigin(dragSrc);
      bounce(dragSrc);
      dragSrc = dragFromCell = null;
      return;
    }

    const idx = cellIndex(targetCell);

    // Celda ya bloqueada (acierto previo) → rebote
    if (targetCell.dataset.locked === "true") {
      playAudio(AUDIO.wrong);
      returnToOrigin(dragSrc);
      bounce(dragSrc);
      dragSrc = dragFromCell = null;
      return;
    }

    // Si la celda tenía un bicho sin bloquear, lo devolvemos al banco
    const existing = targetCell.querySelector("img");
    if (existing && existing !== dragSrc) {
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
      returnToOrigin(dragSrc);
      bounce(dragSrc);
    }

    dragSrc = dragFromCell = null;
  }

  /** Regresa la imagen a su celda de origen, o al banco si venía de ahí */
  function returnToOrigin(img) {
    if (dragFromCell) {
      dragFromCell.appendChild(img);
    } else {
      document.querySelector(".bug-bank").appendChild(img);
    }
  }

  /** Aplica la animación de rebote (colocación incorrecta) */
  function bounce(img) {
    img.classList.add("bug--bounce");
    img.addEventListener(
      "animationend",
      () => img.classList.remove("bug--bounce"),
      { once: true },
    );
  }

  /** Coloca el bicho correctamente, lo bloquea y verifica si hay victoria */
  function placeCorrectly(img, cell) {
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
      setTimeout(() => {
        stopAllAudio();
        playAudio(AUDIO.win);
      }, 600);

      showWinFeedback();
    }
  }

  /* ==========================================
     PANTALLA DE VICTORIA
  ========================================== */

  /** Crea y muestra el overlay de victoria con el botón de continuar */
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

  /* ==========================================
   AUDIO DE INSTRUCCIÓN
   Se intenta reproducir al cargar la pantalla.
   Si el navegador bloquea el autoplay, espera la
   primera interacción del usuario.
========================================== */

  let introPlayed = false;

  /** Reproduce la instrucción una sola vez como audio inicial */
  function playIntroOnce() {
    if (introPlayed) return;

    introPlayed = true;
    playAudio(AUDIO.intro);

    document.removeEventListener("touchstart", playIntroOnce);
    document.removeEventListener("pointerdown", playIntroOnce);
  }

  /** Reinicia la instrucción manualmente desde el botón de bocina */
  function playIntro() {
    playAudio(AUDIO.intro);
  }

  document.querySelectorAll(".controls__btn--audio").forEach((btn) => {
    btn.addEventListener("click", playIntro);
  });

  /* ==========================================
   INICIALIZACIÓN
========================================== */

  bankBugs.forEach((bug) => makeDraggable(bug));

  window.addEventListener("load", () => {
    setTimeout(() => {
      if (introPlayed) return;

      const introAudio = audioCache.get(AUDIO.intro);
      if (!introAudio) return;

      introAudio.pause();
      introAudio.currentTime = 0;

      introAudio
        .play()
        .then(() => {
          introPlayed = true;
          currentAudio = introAudio;

          document.removeEventListener("touchstart", playIntroOnce);
          document.removeEventListener("pointerdown", playIntroOnce);
        })
        .catch(() => {
          // Si el navegador bloquea autoplay, queda listo el fallback.
        });
    }, 500);
  });

  document.addEventListener("touchstart", playIntroOnce, { once: true });
  document.addEventListener("pointerdown", playIntroOnce, { once: true });
})();
