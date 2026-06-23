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

  const audioCache = new Map();

  // El audio que se está reproduciendo actualmente
  let currentAudio = null;

  // true mientras el intro esté sonando — ningún otro audio lo interrumpe
  let introPlaying = false;

  // true una vez que el intro ya sonó al menos una vez
  let introPlayed = false;

  function getAudio(src) {
    if (!audioCache.has(src)) {
      const a = new Audio(src);
      a.preload = "auto";
      audioCache.set(src, a);
    }
    return audioCache.get(src);
  }

  /**
   * Reproduce un audio de feedback (acierto / error / victoria).
   * Si el intro está sonando, NO lo interrumpe.
   * Si hay otro feedback sonando, lo cancela y arranca el nuevo.
   */
  function playAudio(src) {
    if (introPlaying) return; // el intro es intocable mientras suena

    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }

    const audio = getAudio(src);
    currentAudio = audio;
    audio.currentTime = 0;

    audio.play().catch((err) => {
      if (err.name !== "AbortError") {
        console.warn("Audio bloqueado:", src, err.name);
      }
    });
  }

  /**
   * Reproduce el audio de instrucción.
   * Marca introPlaying = true mientras dura y lo limpia al terminar.
   */
  function playIntroAudio() {
    const audio = getAudio(AUDIO.intro);

    // Detiene cualquier feedback previo antes de arrancar el intro
    if (currentAudio && currentAudio !== audio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }

    currentAudio = audio;
    audio.currentTime = 0;
    introPlaying = true;

    audio
      .play()
      .then(() => {
        introPlayed = true;
      })
      .catch((err) => {
        introPlaying = false; // falló el autoplay, quedará pendiente
        currentAudio = null;
        if (err.name !== "AbortError") {
          console.warn("Intro bloqueado:", err.name);
        }
      });

    // Al terminar de reproducirse, libera el bloqueo
    audio.addEventListener(
      "ended",
      () => {
        introPlaying = false;
      },
      { once: true },
    );
  }

  function stopAllAudio() {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio = null;
    }
    introPlaying = false;
  }

  // Precarga todos los audios
  Object.values(AUDIO).forEach((src) => getAudio(src));

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
    const cellUnderPointer = target
      ? target.closest(".grid--empty .grid__cell")
      : null;

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
      playAudio(AUDIO.wrong);
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
     El botón de bocina siempre lo puede reiniciar manualmente.
  ========================================== */
  document.querySelectorAll(".controls__btn--audio").forEach((btn) => {
    btn.addEventListener("click", () => playIntroAudio());
  });

  /* ==========================================
     INICIALIZACIÓN
  ========================================== */

  bankBugs.forEach((bug) => makeDraggable(bug));

  // Intenta reproducir el intro al cargar.
  // En iPad/Safari el autoplay falla sin un gesto previo del usuario;
  // en ese caso se reintenta en el primer touchend, que ocurre al
  // levantar el dedo — después de que el drag terminó, nunca durante.
  window.addEventListener("load", () => {
    setTimeout(playIntroAudio, 500);
  });

  document.addEventListener(
    "touchend",
    () => {
      if (!introPlayed) playIntroAudio();
    },
    { once: true },
  );
})();
