(function () {
  "use strict";

  /* ==========================================
     DOM
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
  let currentAudio = null;
  let introPlaying = false;
  let introPlayed = false;

  function getAudio(src) {
    if (!audioCache.has(src)) {
      const a = new Audio(src);
      a.preload = "auto";
      audioCache.set(src, a);
    }
    return audioCache.get(src);
  }

  // Detiene el audio actual y reproduce uno nuevo.
  // No interrumpe el intro mientras esté sonando.
  function playAudio(src) {
    if (introPlaying) return;
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }
    const audio = getAudio(src);
    currentAudio = audio;
    audio.currentTime = 0;
    audio.play().catch((err) => {
      if (err.name !== "AbortError")
        console.warn("Audio bloqueado:", src, err.name);
    });
  }

  function playIntroAudio() {
    const audio = getAudio(AUDIO.intro);
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
        introPlaying = false;
        currentAudio = null;
        if (err.name !== "AbortError")
          console.warn("Intro bloqueado:", err.name);
      });
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

  // Precarga todos los archivos de audio
  Object.values(AUDIO).forEach((src) => getAudio(src));

  /* ==========================================
     SOLUCIÓN
  ========================================== */
  // src esperado en cada celda (null = celda vacía)
  const solution = Array.from(refCells).map((cell) => {
    const img = cell.querySelector("img");
    return img ? img.getAttribute("src") : null;
  });

  let correctCount = 0;
  const totalBugs = solution.filter(Boolean).length;

  /* ==========================================
     DRAG & DROP (mouse + touch)
  ========================================== */
  let dragSrc = null; // <img> en movimiento
  let dragFromCell = null; // celda de origen (null si viene del banco)
  let dragClone = null; // fantasma visual que sigue al puntero
  let pointerOffsetX = 0;
  let pointerOffsetY = 0;
  let hoveredCell = null;
  let playAreaRect = null;

  function cellIndex(cell) {
    return Array.from(emptyCells).indexOf(cell);
  }

  // Rectángulo que une las dos grids y el banco; limita el arrastre
  function getPlayAreaRect() {
    const r1 = document.querySelector(".game__grids").getBoundingClientRect();
    const r2 = document.querySelector(".bug-bank").getBoundingClientRect();
    return {
      left: Math.min(r1.left, r2.left),
      top: Math.min(r1.top, r2.top),
      right: Math.max(r1.right, r2.right),
      bottom: Math.max(r1.bottom, r2.bottom),
    };
  }

  function makeDraggable(img) {
    img.addEventListener("mousedown", onPointerStart);
    img.addEventListener("touchstart", onPointerStart, { passive: false });
  }

  function onPointerStart(e) {
    if (e.currentTarget.classList.contains("bug--placed")) return;
    const isTouch = e.type === "touchstart";
    if (!isTouch && e.button !== 0) return;
    e.preventDefault();

    dragSrc = e.currentTarget;
    dragFromCell = dragSrc.closest(".grid--empty .grid__cell") || null;
    playAreaRect = getPlayAreaRect();

    const point = isTouch ? e.touches[0] : e;
    const rect = dragSrc.getBoundingClientRect();
    pointerOffsetX = point.clientX - rect.left;
    pointerOffsetY = point.clientY - rect.top;

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
      document.addEventListener("touchmove", onPointerMove, { passive: false });
      document.addEventListener("touchend", onPointerEnd, { once: true });
      document.addEventListener("touchcancel", onPointerCancel, { once: true });
    } else {
      document.addEventListener("mousemove", onPointerMove);
      document.addEventListener("mouseup", onPointerEnd, { once: true });
    }
  }

  function onPointerMove(e) {
    const isTouch = e.type === "touchmove";
    if (isTouch) e.preventDefault();
    const point = isTouch ? e.touches[0] : e;

    if (dragClone && playAreaRect) {
      const w = dragClone.offsetWidth;
      const h = dragClone.offsetHeight;
      const x = Math.max(
        playAreaRect.left,
        Math.min(point.clientX - pointerOffsetX, playAreaRect.right - w),
      );
      const y = Math.max(
        playAreaRect.top,
        Math.min(point.clientY - pointerOffsetY, playAreaRect.bottom - h),
      );
      dragClone.style.left = `${x}px`;
      dragClone.style.top = `${y}px`;
    }

    // Resalta la celda que está bajo el puntero
    const target = document.elementFromPoint(point.clientX, point.clientY);
    const cellUnderPointer =
      target?.closest(".grid--empty .grid__cell") || null;
    if (cellUnderPointer !== hoveredCell) {
      hoveredCell?.classList.remove("cell--hover");
      cellUnderPointer?.classList.add("cell--hover");
      hoveredCell = cellUnderPointer;
    }
  }

  function onPointerEnd(e) {
    const isTouch = e.type === "touchend";
    document.removeEventListener(
      isTouch ? "touchmove" : "mousemove",
      onPointerMove,
    );
    cleanupDragVisuals();

    const point = isTouch ? e.changedTouches[0] : e;
    const target = document.elementFromPoint(point.clientX, point.clientY);
    const targetCell = target?.closest(".grid--empty .grid__cell") || null;
    resolveDrop(targetCell);
  }

  function onPointerCancel() {
    document.removeEventListener("touchmove", onPointerMove);
    cleanupDragVisuals();
    dragSrc = dragFromCell = null;
  }

  function cleanupDragVisuals() {
    document.body.classList.remove("is-dragging");
    dragClone?.remove();
    dragClone = null;
    dragSrc?.classList.remove("bug--dragging");
    hoveredCell?.classList.remove("cell--hover");
    hoveredCell = null;
  }

  /* ==========================================
     LÓGICA DE DROP
  ========================================== */
  function resolveDrop(targetCell) {
    if (!dragSrc) return;

    // Soltó fuera de celda o en celda bloqueada → rebote
    if (!targetCell || targetCell.dataset.locked === "true") {
      playAudio(AUDIO.wrong);
      returnToOrigin(dragSrc);
      bounce(dragSrc);
      dragSrc = dragFromCell = null;
      return;
    }

    // Si la celda tenía un bicho libre, lo devuelve al banco
    const existing = targetCell.querySelector("img");
    if (existing && existing !== dragSrc) {
      existing.classList.remove("bug--placed");
      document.querySelector(".bug-bank").appendChild(existing);
      makeDraggable(existing);
    }

    const idx = cellIndex(targetCell);
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

  function returnToOrigin(img) {
    (dragFromCell ?? document.querySelector(".bug-bank")).appendChild(img);
  }

  function bounce(img) {
    img.classList.add("bug--bounce");
    img.addEventListener(
      "animationend",
      () => img.classList.remove("bug--bounce"),
      { once: true },
    );
  }

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
     INICIALIZACIÓN
  ========================================== */
  bankBugs.forEach((bug) => makeDraggable(bug));

  document.querySelectorAll(".controls__btn--audio").forEach((btn) => {
    btn.addEventListener("click", () => playIntroAudio());
  });

  // Intenta el autoplay al cargar; en Safari/iPad puede fallar sin gesto previo,
  // por eso se reintenta en el primer touchend.
  window.addEventListener("load", () => setTimeout(playIntroAudio, 500));
  document.addEventListener(
    "touchend",
    () => {
      if (!introPlayed) playIntroAudio();
    },
    { once: true },
  );
  document.addEventListener(
    "click",
    () => {
      if (!introPlayed) playIntroAudio();
    },
    { once: true },
  );
})();
