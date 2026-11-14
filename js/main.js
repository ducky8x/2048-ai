// The page: draws the board, takes moves from the keyboard and swipes, and
// lets the network play in "Watch the AI" mode.
(function () {
  var KEYS = {
    ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3,
    w: 0, d: 1, s: 2, a: 3, W: 0, D: 1, S: 2, A: 3
  };

  var state = {
    board: null,
    score: 0,
    moves: 0,
    mode: "human",
    net: null,
    running: false,
    delay: 120,
    lookahead: 0,
    timer: null,
    aiScores: null
  };

  var $ = function (id) { return document.getElementById(id); };
  var boardEl = $("board");
  Anim.init(boardEl);

  function newGame() {
    var first = Game.spawn(new Array(16).fill(0), Math.random);
    var second = Game.spawn(first.board, Math.random);
    state.board = second.board;
    state.score = 0;
    state.moves = 0;
    Anim.reset(state.board);
    refreshScores();
    render();
  }

  // Play one move. Returns false if the move changes nothing. The game
  // moves on at once; the tiles catch up on screen.
  function play(action) {
    var result = Game.slideTiles(state.board, action);
    if (!result.moved) return false;
    var spawned = Game.spawn(result.board, Math.random);
    state.board = spawned.board;
    state.score += result.points;
    state.moves += 1;
    Anim.move(result);
    Anim.spawn(spawned.cell, state.board[spawned.cell]);
    Anim.floatPoints($("score").parentNode, result.points);
    refreshScores();
    render();
    return true;
  }

  function refreshScores() {
    state.aiScores = state.net && state.mode === "ai"
      ? Network.scores(state.net, state.board, state.lookahead)
      : null;
  }

  function render() {
    $("score").textContent = state.score.toLocaleString("en-US");
    $("best").textContent = Game.maxTile(state.board).toLocaleString("en-US");
    $("moves").textContent = state.moves.toLocaleString("en-US");

    var over = Game.isOver(state.board);
    $("over").hidden = !over;
    $("over-score").textContent = "Final score: " + state.score.toLocaleString("en-US");
    if (over) stop();

    var chosen = state.aiScores ? Network.choose(state.aiScores) : -1;
    document.querySelectorAll(".move-score").forEach(function (el) {
      var action = Number(el.dataset.action);
      var s = state.aiScores ? state.aiScores[action] : null;
      el.querySelector(".val").textContent = s === null ? "-" : Math.round(s).toLocaleString("en-US");
      el.classList.toggle("chosen", action === chosen);
    });

    $("start").textContent = state.running ? "Pause" : "Start";
    $("start").disabled = !state.net || over;
    $("step").disabled = !state.net || over || state.running;
  }

  // ----- the AI -----

  function aiMove() {
    if (!state.aiScores) refreshScores();
    var action = Network.choose(state.aiScores);
    return action >= 0 && play(action);
  }

  function tick() {
    if (!state.running) return;
    var started = performance.now();
    if (!aiMove()) return stop();
    var spent = performance.now() - started;
    state.timer = setTimeout(tick, Math.max(0, state.delay - spent));
  }

  function start() {
    if (state.running || !state.net) return;
    state.running = true;
    render();
    state.timer = setTimeout(tick, state.delay);
  }

  function stop() {
    if (!state.running) return;
    state.running = false;
    clearTimeout(state.timer);
    render();
  }

  // ----- controls -----

  function setMode(mode) {
    if (mode === state.mode) return;
    stop();
    state.mode = mode;
    $("mode-human").classList.toggle("active", mode === "human");
    $("mode-ai").classList.toggle("active", mode === "ai");
    $("mode-human").setAttribute("aria-pressed", String(mode === "human"));
    $("mode-ai").setAttribute("aria-pressed", String(mode === "ai"));
    $("human-panel").hidden = mode !== "human";
    $("ai-panel").hidden = mode !== "ai";
    setPace();
    refreshScores();
    render();
  }

  // Tiles keep up with the AI's speed setting; a person's moves get one pace.
  function setPace() {
    Anim.setPace(state.mode === "ai" ? state.delay : 0);
  }

  $("mode-human").addEventListener("click", function () { setMode("human"); });
  $("mode-ai").addEventListener("click", function () { setMode("ai"); });

  document.querySelectorAll(".new-game, #over-new").forEach(function (button) {
    button.addEventListener("click", newGame);
  });

  $("start").addEventListener("click", function () {
    if (state.running) stop(); else start();
  });

  $("step").addEventListener("click", function () {
    if (!state.running) aiMove();
  });

  document.querySelectorAll(".speed").forEach(function (button) {
    button.addEventListener("click", function () {
      state.delay = Number(button.dataset.delay);
      setPace();
      document.querySelectorAll(".speed").forEach(function (b) {
        b.classList.toggle("active", b === button);
        b.setAttribute("aria-pressed", String(b === button));
      });
    });
  });

  $("ahead").addEventListener("change", function () {
    state.lookahead = this.checked ? 1 : 0;
    refreshScores();
    render();
  });

  // Inside an iframe the page only gets key presses once it has focus.
  document.addEventListener("pointerdown", function (event) {
    window.focus();
    if (!event.target.closest("button, input, label")) $("app").focus();
  });

  document.addEventListener("keydown", function (event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    var action = KEYS[event.key];
    if (action === undefined) return;
    if (event.key.indexOf("Arrow") === 0) event.preventDefault();
    if (state.mode === "human") play(action);
  });

  var swipeStart = null;
  boardEl.addEventListener("pointerdown", function (event) {
    swipeStart = { x: event.clientX, y: event.clientY };
  });
  boardEl.addEventListener("pointerup", function (event) {
    if (!swipeStart || state.mode !== "human") return;
    var dx = event.clientX - swipeStart.x;
    var dy = event.clientY - swipeStart.y;
    swipeStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) play(dx > 0 ? 1 : 3);
    else play(dy > 0 ? 2 : 0);
  });
  boardEl.addEventListener("pointercancel", function () { swipeStart = null; });

  newGame();

  fetch("model/weights.bin")
    .then(function (response) {
      if (!response.ok) throw new Error(response.status);
      return response.arrayBuffer();
    })
    .then(function (buffer) {
      state.net = Network.fromBuffer(buffer);
      $("model-status").textContent = "Expected points for each move. The highlighted one is next.";
      refreshScores();
      render();
    })
    .catch(function () {
      $("model-status").textContent = "The model could not be loaded.";
    });
})();
