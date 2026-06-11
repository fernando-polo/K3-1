/* ==========================================
   K3 – El lugar de los bichos
   Lógica de arrastrar y soltar
========================================== */

(function () {
  "use strict";

  /* ------------------------------------------
     1. REFERENCIAS AL DOM
  ------------------------------------------ */
  const emptyCells = document.querySelectorAll(".grid--empty .grid__cell");
  const refCells = document.querySelectorAll(".grid--reference .grid__cell");
  const bankBugs = document.querySelectorAll(".bug-bank__bug");

  /* ------------------------------------------
     2. AUDIO
     Rutas relativas a la carpeta del HTML
  ------------------------------------------ */
  const AUDIO = {
    intro: "../audio/C26_AS_AU_RE_67_PRIN.mp3",
    wrong: "../audio/C26_AS_AU_RE_17_PRIN.mp3",
    correct: "../audio/C26_AS_AU_RE_56_PRIN.mp3",
    win: "../audio/C26_AS_AU_RE_68_PRIN.mp3",
  };

  function playAudio(src) {
    const audio = new Audio(src);
    audio.play().catch(() => {
      // Silencia errores si el archivo no existe en dev
    });
  }

  /* ------------------------------------------
     3. MAPA DE SOLUCIÓN
     Construimos un array con el alt (identificador)
     que debe ir en cada celda de la grid vacía,
     leyendo las celdas de referencia en orden.
  ------------------------------------------ */
  const solution = Array.from(refCells).map((cell) => {
    const img = cell.querySelector("img");
    return img ? img.getAttribute("src") : null; // null = celda vacía
  });

  /* ------------------------------------------
     4. ESTADO DEL JUEGO
     Cuántas celdas ya están correctamente ocupadas
  ------------------------------------------ */
  let correctCount = 0;
  const totalBugs = solution.filter(Boolean).length; // 6

  /* ------------------------------------------
     5. DRAG SOURCE
     Guardamos qué elemento se está arrastrando
     y de dónde viene (banco o celda).
  ------------------------------------------ */
  let dragSrc = null; // el <img> que se mueve
  let dragFromCell = null; // la celda de origen (null si viene del banco)

  /* ------------------------------------------
     6. HELPERS
  ------------------------------------------ */

  /** Devuelve el índice (0-11) de una celda vacía */
  function cellIndex(cell) {
    return Array.from(emptyCells).indexOf(cell);
  }

  /** Animación de rebote: la imagen vuelve a su posición original */
  function bounceBack(img, originParent) {
    img.classList.add("bug--bounce");
    img.addEventListener(
      "animationend",
      () => {
        img.classList.remove("bug--bounce");
        // Devolver al origen
        if (originParent) {
          originParent.appendChild(img);
        } else {
          // Volver al banco
          img.draggable = true;
          img.classList.remove("bug--placed");
          document.querySelector(".bug-bank").appendChild(img);
        }
      },
      { once: true },
    );
  }

  /* ------------------------------------------
     7. EVENTOS DE ARRASTRE — ORIGEN
  ------------------------------------------ */

  /** Configura los listeners en un <img> arrastrable */
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

    // Ocultamos el original mientras se arrastra
    // (setTimeout para que el navegador alcance a tomar el snapshot del drag ghost)
    setTimeout(() => dragSrc.classList.add("bug--dragging"), 0);
  }

  function onDragEnd(e) {
    // Si por algún motivo no se procesó el drop (soltó fuera), restauramos visibilidad
    if (dragSrc) dragSrc.classList.remove("bug--dragging");
  }

  /* ------------------------------------------
     8. EVENTOS DE ARRASTRE — DESTINO (celdas vacías)
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

    // Siempre quitamos la clase de ocultamiento al resolver el drop
    dragSrc.classList.remove("bug--dragging");

    const targetCell = this;
    const idx = cellIndex(targetCell);

    // ¿Ya tiene un bicho correctamente colocado?
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

    // ¿La celda ya tiene un bicho no bloqueado? Lo devolvemos al banco.
    const existing = targetCell.querySelector("img");
    if (existing) {
      existing.draggable = true;
      existing.classList.remove("bug--placed");
      document.querySelector(".bug-bank").appendChild(existing);
      makeDraggable(existing);
    }

    // Verificamos si la respuesta es correcta
    const expectedSrc = solution[idx];
    const droppedSrc = dragSrc.getAttribute("src");

    if (expectedSrc && droppedSrc === expectedSrc) {
      // ✅ CORRECTO
      placeCorrectly(dragSrc, targetCell);
    } else {
      // ❌ INCORRECTO — rebote
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

  /** Coloca el bicho como correcto, bloquea la celda y actualiza el conteo */
  function placeCorrectly(img, cell) {
    img.draggable = false;
    img.classList.add("bug--placed");
    cell.appendChild(img);
    cell.dataset.locked = "true";
    playAudio(AUDIO.correct);

    // Animación de rebote de confirmación
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
     9. SOPORTE TÁCTIL (Touch Events)
     Para tablets y móviles
  ------------------------------------------ */

  let touchClone = null; // ghost que sigue el dedo
  let touchOriginX = 0;
  let touchOriginY = 0;

  function onTouchStart(e) {
    // Si ya está bloqueado, no hacer nada
    if (e.currentTarget.draggable === false) return;

    e.preventDefault();
    dragSrc = e.currentTarget;
    dragFromCell = dragSrc.closest(".grid--empty .grid__cell") || null;

    const touch = e.touches[0];
    const rect = dragSrc.getBoundingClientRect();

    touchOriginX = touch.clientX - rect.left;
    touchOriginY = touch.clientY - rect.top;

    // Crear clon visual que sigue el dedo
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

    if (!targetCell || !dragSrc) {
      // Soltó fuera de una celda → rebote
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

    // Simular el drop
    const fakeEvent = { preventDefault: () => {} };
    const dropHandler = onDrop.bind(targetCell);

    // Reutilizamos la lógica de drop
    const idx = cellIndex(targetCell);
    const expectedSrc = solution[idx];
    const droppedSrc = dragSrc.getAttribute("src");

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
     10. FEEDBACK DE VICTORIA
  ------------------------------------------ */
  function showWinFeedback() {
    document.body.classList.add("game--win");

    const overlay = document.createElement("div");
    overlay.className = "win-overlay";
    overlay.innerHTML = `
      <div class="win-overlay__content">
        <div class="win-overlay__cloud-wrap">
          <img class="win-overlay__cloud" src="../img/nube_final.png" alt="" />

          <p class="win-overlay__msg">
            ¡Muy bien!<br>
            Acomodaste todas las<br>
            imágenes correctamente.
          </p>

          <button class="win-overlay__continue" aria-label="Continuar">
            <img src="../img/end_btn.png" alt="Continuar" />
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
     11. AUDIO DE INSTRUCCIÓN
     - Se intenta reproducir al cargar la página.
     - El botón de audio lo reinicia desde el principio,
       deteniendo cualquier reproducción anterior.
  ------------------------------------------ */

  // Instancia reutilizable del audio de intro
  const introAudio = new Audio(AUDIO.intro);

  function playIntro() {
    introAudio.pause();
    introAudio.currentTime = 0;
    introAudio.play().catch(() => {
      // El navegador bloqueó el autoplay; el usuario
      // puede presionar el botón para escucharlo.
    });
  }

  document.querySelectorAll(".controls__btn--audio").forEach((btn) => {
    btn.addEventListener("click", playIntro);
  });

  /* ------------------------------------------
     12. INICIALIZACIÓN
  ------------------------------------------ */
  bankBugs.forEach((bug) => makeDraggable(bug));

  // Intentar reproducir instrucción al cargar.
  // Si el navegador lo bloquea, se reproducirá
  // la primera vez que el usuario toque la página.
  window.addEventListener("load", () => {
    setTimeout(() => {
      introAudio.play().catch(() => {
        // Autoplay bloqueado: esperar interacción del usuario
        const unlockIntro = () => {
          playIntro();
          document.removeEventListener("pointerdown", unlockIntro);
        };
        document.addEventListener("pointerdown", unlockIntro, { once: true });
      });
    }, 500);
  });
})();
