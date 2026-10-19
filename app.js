(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const SAMPLE = "你好世界學習中文";
  const STORAGE_KEY = "ink-and-order-v1";
  const MAX_CHARACTERS = 200;
  const HAN = /\p{Script=Han}/u;
  const LOCAL_CHARACTERS = new Set(
    Array.from(
      "你好世界學習中文学而时习之不亦说乎春眠不覺曉處聞啼鳥一二三人永",
    ),
  );
  const dataCache = new Map();
  // At most three engines, one per animation speed. Reuse them across characters
  // so the library's document-level pointer listeners do not accumulate.
  const writerPool = new Map();
  const state = {
    characters: [],
    index: 0,
    mode: "watch",
    completed: {},
    data: null,
    writer: null,
    generation: 0,
    animation: 0,
    playing: false,
    loading: false,
    step: null,
    speed: 1,
  };
  const modes = {
    watch: {
      title: "Start with the strokes.",
      description: "",
      caption: "Watch how each stroke connects.",
      feedback: "Press play, then give tracing a try.",
    },
    trace: {
      title: "Follow the rhythm.",
      description:
        "Trace the pale character, one stroke at a time. Use your finger, stylus, or mouse.",
      caption: "Follow the outline in the correct order.",
      feedback: "Draw the first stroke. A hint appears after two misses.",
    },
    write: {
      title: "",
      description: "",
      caption: "No outline. No hints. Just you and the page.",
      feedback: "Draw the first stroke in the right direction.",
    },
  };
  function chineseCharacters(text) {
    return Array.from(text).filter((char) => HAN.test(char));
  }
  function setFeedback(message, tone = "") {
    $("feedback").textContent = message;
    $("feedback").dataset.tone = tone;
  }
  function save() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          text: state.characters.join(""),
          index: state.index,
          mode: state.mode,
          completed: state.completed,
          speed: state.speed,
        }),
      );
    } catch {
      $("storage-note").textContent =
        "Device storage is unavailable. Progress lasts for this visit.";
    }
  }
  function readSaved() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved || typeof saved.text !== "string") return null;
      return saved;
    } catch {
      return null;
    }
  }
  function updateInputCount() {
    const count = chineseCharacters($("lesson-text").value).length;
    $("input-count").textContent =
      `${count} character${count === 1 ? "" : "s"}`;
  }
  function completionKey(index = state.index) {
    return `${index}:${state.characters[index]}`;
  }
  function isComplete(index, mode = state.mode) {
    const record = state.completed[completionKey(index)];
    return Boolean(
      record &&
        (mode === "watch" ? record.trace || record.write : record[mode]),
    );
  }
  function renderNavigation() {
    const fragment = document.createDocumentFragment();
    state.characters.forEach((char, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = char;
      button.lang = "zh";
      button.dataset.index = index;
      button.setAttribute(
        "aria-label",
        `Character ${index + 1}: ${char}${isComplete(index) ? ", practiced" : ""}`,
      );
      button.setAttribute("aria-current", String(index === state.index));
      button.classList.toggle("completed", isComplete(index));
      fragment.append(button);
    });
    $("character-list").replaceChildren(fragment);
    $("previous-button").disabled = state.index === 0;
    $("next-button").disabled = state.index === state.characters.length - 1;
    $("position-label").textContent =
      `CHARACTER ${String(state.index + 1).padStart(2, "0")} OF ${String(state.characters.length).padStart(2, "0")}`;
    updateSessionProgress();
  }
  function updateSessionProgress() {
    const completed = state.characters.filter((_, index) =>
      isComplete(index),
    ).length;
    $("session-count").textContent =
      `${completed} / ${state.characters.length}`;
    $("session-progress").max = state.characters.length;
    $("session-progress").value = completed;
    $("session-caption").textContent =
      completed === state.characters.length
        ? "Beautiful work. Every character practiced."
        : state.mode === "watch"
          ? "Complete a character in Trace or Write."
          : `${state.mode === "trace" ? "Traced" : "Written from memory"} · progress saved on this device.`;
  }
  function bringCharacterIntoView() {
    // Scroll only the horizontal strip; never pull the whole page away from the writing board.
    const list = $("character-list");
    const selected = list.querySelector('[aria-current="true"]');
    if (selected)
      list.scrollLeft =
        selected.offsetLeft -
        list.offsetLeft -
        list.clientWidth / 2 +
        selected.clientWidth / 2;
  }
  async function fetchJSON(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (
        !Array.isArray(data.strokes) ||
        !data.strokes.length ||
        !Array.isArray(data.medians)
      )
        throw new Error("Invalid stroke data");
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }
  async function loadCharacter(char) {
    if (dataCache.has(char)) return dataCache.get(char);
    const promise = (async () => {
      if (LOCAL_CHARACTERS.has(char)) {
        try {
          return await fetchJSON(`./data/${encodeURIComponent(char)}.json`);
        } catch {
          /* Try the public data mirror. */
        }
      }
      return fetchJSON(
        `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${encodeURIComponent(char)}.json`,
      );
    })();
    dataCache.set(char, promise);
    try {
      return await promise;
    } catch (error) {
      dataCache.delete(char);
      throw error;
    }
  }
  function createCharacterSVG(
    data,
    size,
    through = data.strokes.length - 1,
    highlight = false,
    faint = false,
  ) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
    svg.setAttribute("aria-hidden", "true");
    const group = document.createElementNS(ns, "g");
    group.setAttribute(
      "transform",
      HanziWriter.getScalingTransform(size, size, size * 0.12).transform,
    );
    data.strokes.slice(0, through + 1).forEach((stroke, i) => {
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", stroke);
      path.setAttribute(
        "fill",
        faint ? "#d8dcd1" : highlight && i === through ? "#be6549" : "#344f46",
      );
      group.append(path);
    });
    svg.append(group);
    return svg;
  }
  function renderStrokeSequence() {
    $("stroke-strip").replaceChildren();
    if (!state.data || state.mode === "write") return;
    const fragment = document.createDocumentFragment();
    state.data.strokes.forEach((_, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "stroke-step";
      button.dataset.stroke = i;
      button.setAttribute("aria-label", `Watch stroke ${i + 1}`);
      const number = document.createElement("span");
      number.textContent = i + 1;
      button.append(createCharacterSVG(state.data, 60, i, true), number);
      fragment.append(button);
    });
    $("stroke-strip").append(fragment);
  }
  function configureMode() {
    const mode = modes[state.mode];
    document.querySelectorAll("[data-mode]").forEach((tab) => {
      const selected = tab.dataset.mode === state.mode;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    $("mode-panel").setAttribute("aria-labelledby", `tab-${state.mode}`);
    $("mode-title").textContent = mode.title;
    $("mode-title").hidden = !mode.title;
    $("mode-description").textContent = mode.description;
    $("mode-description").hidden = !mode.description;
    $("board-caption").textContent = mode.caption;
    $("watch-controls").hidden = state.mode !== "watch";
    $("quiz-controls").hidden = state.mode === "watch";
    $("stroke-section").hidden = state.mode === "write";
    $("memory-note").hidden = state.mode !== "write";
    $("writing-board").setAttribute(
      "role",
      state.mode === "watch" ? "img" : "group",
    );
    $("writing-board").setAttribute(
      "aria-label",
      `${state.mode === "watch" ? "Stroke order animation" : "Handwriting area"} for ${state.characters[state.index]}`,
    );
    setFeedback(mode.feedback);
  }
  function resetQuizStats() {
    $("accepted-count").textContent =
      `0 / ${state.data?.strokes.length || "–"}`;
    $("mistake-count").textContent = "0";
    $("stroke-progress").max = state.data?.strokes.length || 1;
    $("stroke-progress").value = 0;
  }
  function startQuiz() {
    if (!state.writer || !state.data) return;
    const generation = state.generation;
    state.writer.cancelQuiz();
    state.writer.hideCharacter({ duration: 0 });
    resetQuizStats();
    const guided = state.mode === "trace";
    state.writer.quiz({
      showHintAfterMisses: guided ? 2 : false,
      markStrokeCorrectAfterMisses: false,
      acceptBackwardsStrokes: false,
      highlightOnComplete: guided,
      onCorrectStroke(data) {
        if (generation !== state.generation) return;
        $("accepted-count").textContent =
          `${data.strokeNum + 1} / ${state.data.strokes.length}`;
        $("stroke-progress").value = data.strokeNum + 1;
        $("mistake-count").textContent = data.totalMistakes;
        setFeedback(
          data.strokesRemaining
            ? `Good stroke. ${data.strokesRemaining} to go.`
            : "All strokes in the right order.",
          "success",
        );
      },
      onMistake(data) {
        if (generation !== state.generation) return;
        $("mistake-count").textContent = data.totalMistakes;
        setFeedback(
          guided
            ? "Try that stroke again. Follow its shape, order, and direction."
            : "Try again. Check the stroke’s shape, order, and direction.",
          "error",
        );
      },
      onComplete(data) {
        if (generation !== state.generation) return;
        const key = completionKey();
        state.completed[key] = { ...state.completed[key], [state.mode]: true };
        save();
        renderNavigation();
        bringCharacterIntoView();
        const last = state.index === state.characters.length - 1;
        setFeedback(
          `Character complete! ${data.totalMistakes === 0 ? "Every stroke on the first try." : `${data.totalMistakes} try-again${data.totalMistakes === 1 ? "" : "s"} — practice is progress.`} ${last ? "Revisit any character to keep practicing." : "Choose Next when you’re ready."}`,
          "success",
        );
      },
    });
  }
  function stopWriter() {
    state.generation++;
    state.animation++;
    state.playing = false;
    if (state.writer) {
      state.writer.cancelQuiz();
      state.writer.pauseAnimation();
    }
    state.writer = null;
    state.data = null;
    for (const { target } of writerPool.values()) target.hidden = true;
  }
  function updatePlayButton() {
    $("play-button").textContent = state.playing
      ? "Ⅱ Pause animation"
      : state.step === "paused"
        ? "▷ Resume animation"
        : state.step !== null
          ? "▷ Replay stroke order"
          : "▷ Play stroke order";
  }
  async function showCharacter() {
    stopWriter();
    const generation = state.generation;
    const char = state.characters[state.index];
    state.loading = true;
    state.step = null;
    configureMode();
    renderNavigation();
    bringCharacterIntoView();
    $("current-character").textContent = char;
    $("stroke-count").textContent = "Loading…";
    $("stroke-strip").replaceChildren();
    $("board-overlay").textContent = "Preparing your character…";
    $("board-overlay").hidden = false;
    $("retry-button").hidden = true;
    $("play-button").disabled = true;
    $("restart-button").disabled = true;
    updatePlayButton();
    resetQuizStats();
    try {
      if (!window.HanziWriter) throw new Error("Writing library unavailable");
      const data = await loadCharacter(char);
      if (generation !== state.generation) return;
      state.data = data;
      const size = $("writing-board").clientWidth;
      let engine = writerPool.get(state.speed);
      if (!engine) {
        const target = document.createElement("div");
        $("writer").append(target);
        const writer = new HanziWriter(target, {
          width: size,
          height: size,
          padding: size * 0.12,
          strokeColor: "#344f46",
          drawingColor: "#344f46",
          outlineColor: "#e0e5d8",
          highlightColor: "#be6549",
          highlightCompleteColor: "#6d8b67",
          showCharacter: false,
          showOutline: false,
          showHintAfterMisses: false,
          markStrokeCorrectAfterMisses: false,
          acceptBackwardsStrokes: false,
          strokeAnimationSpeed: state.speed,
          delayBetweenStrokes: 280 / state.speed,
          strokeFadeDuration: 180,
          drawingWidth: Math.max(5, size / 50),
          charDataLoader: loadCharacter,
        });
        engine = { writer, target };
        writerPool.set(state.speed, engine);
      }
      state.writer = engine.writer;
      engine.target.hidden = false;
      state.writer.updateDimensions({
        width: size,
        height: size,
        padding: size * 0.12,
      });
      await state.writer.setCharacter(char);
      if (generation !== state.generation) return;
      // showOutline/showCharacter persist in the library's options across
      // setCharacter calls. Reset both explicitly before uncovering the board.
      await state.writer.hideCharacter({ duration: 0 });
      if (generation !== state.generation) return;
      if (state.mode === "write")
        await state.writer.hideOutline({ duration: 0 });
      else await state.writer.showOutline({ duration: 0 });
      if (generation !== state.generation) return;
      if (state.mode === "watch")
        await state.writer.showCharacter({ duration: 0 });
      if (generation !== state.generation) return;
      state.loading = false;
      $("board-overlay").hidden = true;
      $("stroke-count").textContent =
        `${data.strokes.length} stroke${data.strokes.length === 1 ? "" : "s"}`;
      $("play-button").disabled = false;
      $("restart-button").disabled = false;
      renderStrokeSequence();
      resetQuizStats();
      if (state.mode !== "watch") startQuiz();
      save();
    } catch {
      if (generation !== state.generation) return;
      state.loading = false;
      $("board-overlay").textContent =
        `Stroke data for “${char}” couldn’t be loaded. It may be unavailable, or your connection may be offline.`;
      $("stroke-count").textContent = "Unavailable";
      $("retry-button").hidden = false;
      setFeedback(
        "Retry loading, or select another character to continue.",
        "error",
      );
    }
  }
  async function play() {
    if (!state.writer || state.mode !== "watch") return;
    if (state.playing) {
      state.writer.pauseAnimation();
      state.playing = false;
      updatePlayButton();
      setFeedback("Animation paused. Press play to continue.");
      return;
    }
    if (state.step === "paused") {
      state.writer.resumeAnimation();
      state.playing = true;
      updatePlayButton();
      setFeedback("Follow the movement, one stroke at a time.");
      return;
    }
    // Pausing uses a separate marker so the same animation resumes without a reset.
    const animation = ++state.animation;
    const generation = state.generation;
    state.playing = true;
    state.step = "running";
    updatePlayButton();
    setFeedback("Follow the movement, one stroke at a time.");
    await state.writer.animateCharacter();
    if (animation !== state.animation || generation !== state.generation)
      return;
    state.playing = false;
    state.step = null;
    updatePlayButton();
    setFeedback("That’s the rhythm. Try Trace when you’re ready.");
  }
  function setMode(mode) {
    if (state.mode === mode) return;
    state.mode = mode;
    showCharacter();
  }
  function createLesson(text) {
    const characters = chineseCharacters(text);
    if (!characters.length || characters.length > MAX_CHARACTERS) {
      $("input-error").textContent = characters.length
        ? `Please use up to ${MAX_CHARACTERS} Chinese characters per lesson. Your text has ${characters.length}.`
        : "Add at least one Chinese character to create a practice lesson.";
      $("input-error").hidden = false;
      $("lesson-text").setAttribute("aria-invalid", "true");
      return;
    }
    $("input-error").hidden = true;
    $("lesson-text").removeAttribute("aria-invalid");
    if (characters.join("") !== state.characters.join("")) {
      state.completed = {};
      state.index = 0;
    }
    state.characters = characters;
    save();
    showCharacter();
    if (matchMedia("(max-width: 650px)").matches)
      $("practice").scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
  }
  async function watchStroke(index) {
    if (!state.writer || !state.data || state.mode === "write") return;
    // Selecting an individual stroke is a Watch action; don't interrupt a quiz invisibly.
    if (state.mode === "trace") {
      state.mode = "watch";
      await showCharacter();
    }
    if (!state.writer || state.mode !== "watch") return;
    const generation = state.generation;
    const animation = ++state.animation;
    state.playing = false;
    state.step = index;
    updatePlayButton();
    await state.writer.hideCharacter({ duration: 0 });
    if (generation !== state.generation || animation !== state.animation)
      return;
    setFeedback(
      `Watching stroke ${index + 1} of ${state.data.strokes.length}.`,
    );
    await state.writer.animateStroke(index);
  }
  async function printWorksheet() {
    const button = $("print-button");
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = "Preparing your sheet…";
    // Snapshot the lesson, so navigation or a new lesson can't change a sheet midway.
    const characters = [...state.characters];
    const unique = [...new Set(characters)];
    const loaded = new Map();
    for (let i = 0; i < unique.length; i += 6) {
      await Promise.all(
        unique.slice(i, i + 6).map(async (char) => {
          try {
            loaded.set(char, await loadCharacter(char));
          } catch {
            loaded.set(char, null);
          }
        }),
      );
      button.textContent = `Preparing ${Math.min(i + 6, unique.length)} / ${unique.length}…`;
    }
    const area = $("print-area");
    area.replaceChildren();
    const title = document.createElement("div");
    title.className = "print-title";
    const heading = document.createElement("h1");
    heading.textContent = "ink & order · writing practice";
    const name = document.createElement("p");
    name.textContent = "Name: ________________   Date: ________________";
    title.append(heading, name);
    area.append(title);
    const lesson = document.createElement("p");
    lesson.className = "print-lesson";
    lesson.textContent = characters.join("");
    area.append(lesson);
    characters.forEach((char) => {
      const data = loaded.get(char);
      const row = document.createElement("div");
      row.className = "print-row";
      const h2 = document.createElement("h2");
      h2.textContent = char;
      const small = document.createElement("small");
      small.textContent = data
        ? `${data.strokes.length} strokes · watch → trace → write`
        : "Stroke data unavailable · blank practice only";
      h2.append(small);
      row.append(h2);
      if (data) {
        const strokes = document.createElement("div");
        strokes.className = "print-strokes";
        data.strokes.forEach((_, i) => {
          const item = document.createElement("div");
          item.className = "print-stroke";
          const number = document.createElement("span");
          number.textContent = i + 1;
          item.append(createCharacterSVG(data, 40, i, true), number);
          strokes.append(item);
        });
        row.append(strokes);
      }
      const boxes = document.createElement("div");
      boxes.className = "print-boxes";
      for (let i = 0; i < 6; i++) {
        const box = document.createElement("div");
        box.className = "print-box";
        box.innerHTML =
          '<svg class="print-grid" viewBox="0 0 72 72" aria-hidden="true"><line x1="36" y1="0" x2="36" y2="72"/><line x1="0" y1="36" x2="72" y2="36"/><line x1="0" y1="0" x2="72" y2="72"/><line x1="72" y1="0" x2="0" y2="72"/></svg>';
        if (data && i < 2)
          box.append(
            createCharacterSVG(
              data,
              72,
              data.strokes.length - 1,
              false,
              i === 1,
            ),
          );
        boxes.append(box);
      }
      row.append(boxes);
      area.append(row);
    });
    const note = document.createElement("p");
    note.className = "print-footer";
    note.textContent =
      "Ink & Order · Stroke data: Make Me a Hanzi / Arphic Public License. Character forms and stroke orders can vary by region. Paper practice cannot validate stroke order; use Write mode on screen to check it.";
    area.append(note);
    button.disabled = false;
    button.textContent = "Print a practice sheet";
    window.print();
  }
  $("lesson-form").addEventListener("submit", (event) => {
    event.preventDefault();
    createLesson($("lesson-text").value);
  });
  $("lesson-text").addEventListener("input", () => {
    updateInputCount();
    $("input-error").hidden = true;
    $("lesson-text").removeAttribute("aria-invalid");
  });
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
    button.addEventListener("keydown", (event) => {
      const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      const names = ["watch", "trace", "write"];
      const index = names.indexOf(state.mode);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? 2
            : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3;
      setMode(names[next]);
      $(`tab-${names[next]}`).focus();
    });
  });
  $("character-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-index]");
    if (!button) return;
    state.index = Number(button.dataset.index);
    showCharacter();
  });
  $("previous-button").addEventListener("click", () => {
    if (state.index > 0) {
      state.index--;
      showCharacter();
    }
  });
  $("next-button").addEventListener("click", () => {
    if (state.index < state.characters.length - 1) {
      state.index++;
      showCharacter();
    }
  });
  $("stroke-strip").addEventListener("click", (event) => {
    const button = event.target.closest("[data-stroke]");
    if (button) watchStroke(Number(button.dataset.stroke));
  });
  $("play-button").addEventListener("click", () => {
    if (state.playing) {
      state.writer.pauseAnimation();
      state.playing = false;
      state.step = "paused";
      updatePlayButton();
      setFeedback("Animation paused. Press play to continue.");
    } else play();
  });
  $("speed").addEventListener("change", () => {
    state.speed = Number($("speed").value);
    save();
    showCharacter();
  });
  $("restart-button").addEventListener("click", () => {
    startQuiz();
    setFeedback(modes[state.mode].feedback);
  });
  $("retry-button").addEventListener("click", () => showCharacter());
  $("print-button").addEventListener("click", printWorksheet);
  $("help-button").addEventListener("click", () =>
    $("help-dialog").showModal(),
  );
  $("close-help").addEventListener("click", () => $("help-dialog").close());
  $("start-practicing").addEventListener("click", () =>
    $("help-dialog").close(),
  );
  $("help-dialog").addEventListener("click", (event) => {
    if (event.target !== $("help-dialog")) return;
    const r = $("help-dialog").getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      $("help-dialog").close();
  });
  const observer = new ResizeObserver(() => {
    if (!state.writer) return;
    const size = $("writing-board").clientWidth;
    state.writer.updateDimensions({
      width: size,
      height: size,
      padding: size * 0.12,
    });
  });
  observer.observe($("writing-board"));
  const saved = readSaved();
  const savedCharacters = chineseCharacters(saved?.text || SAMPLE).slice(
    0,
    MAX_CHARACTERS,
  );
  state.characters = savedCharacters.length
    ? savedCharacters
    : Array.from(SAMPLE);
  state.index = Number.isInteger(saved?.index)
    ? Math.max(0, Math.min(saved.index, state.characters.length - 1))
    : 0;
  state.mode = Object.hasOwn(modes, saved?.mode) ? saved.mode : "watch";
  state.completed =
    saved?.completed &&
    typeof saved.completed === "object" &&
    !Array.isArray(saved.completed)
      ? saved.completed
      : {};
  state.speed = [0.6, 1, 1.8].includes(saved?.speed) ? saved.speed : 1;
  $("speed").value = state.speed;
  $("lesson-text").value = state.characters.join("");
  updateInputCount();
  showCharacter();
})();
