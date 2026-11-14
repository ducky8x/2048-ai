// Tile animation. Every tile is its own element, pulled toward its cell by
// one spring per axis. A new move only changes the cell the springs pull
// toward, so a tile still in flight bends toward its new cell instead of
// jumping. Positions are kept in cells (0 to 3) and turned into pixels when
// drawn, so they don't depend on the board's size.
var Anim = (function () {
  var GAP = 6;           // px between cells and around the edge
  var ZETA = 0.9;        // damping of a slide: overshoots by under 0.2 percent
  var GROW_ZETA = 0.8;   // damping of a new tile growing in
  var POP_ZETA = 0.5;    // damping of the bounce when a merge lands
  var POP = 0.22;        // the kick for that bounce: it peaks near 1.12x size
  var SCALE_SPEED = 1.2; // scale springs run this much faster than slides
  var LAND = 0.05;       // a merging tile lands this close to its host, in cells
  var GIVE_UP = 1;       // seconds a merging tile may chase before it is dropped
  var MAX_DT = 1 / 30;   // longest step in seconds, e.g. after a hidden tab

  var boardEl;
  var slots = [];
  var grid = [];        // the tile on each cell of the game's board, or null
  var tiles = [];       // every tile on screen, merging ones included
  var stepPx = 0;       // from one cell to the next, in px
  var edgePx = 0;       // from the board's edge to the first cell, in px
  var dpr = 1;
  var omega = 0;        // spring frequency for slides, set by setPace
  var spawnDelay = 0;
  var clock = 0;        // seconds of animation; stops while the tab is hidden
  var last = 0;
  var frameId = 0;
  var lastFloat = null;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  function init(el) {
    boardEl = el;
    for (var i = 0; i < 16; i++) {
      var slot = document.createElement("div");
      slot.className = "slot";
      boardEl.appendChild(slot);
      slots.push(slot);
    }
    grid = new Array(16).fill(null);
    setPace(0);
    measure();
    window.addEventListener("resize", measure);
  }

  // How fast the springs are, from the time between AI moves in ms, or 0
  // when a person plays. With ZETA 0.9 a spring covers all but about 1
  // percent of a slide in 5 / omega seconds, whatever the distance, so long
  // slides move faster than short ones. That settle time is 0.17 s for a
  // person, and for the AI 30 ms plus half the time between its moves, so
  // each move mostly lands before the next.
  function setPace(ms) {
    var settle = ms ? 0.03 + ms / 2000 : 0.17;
    omega = 5 / settle;
    spawnDelay = 0.4 * settle;
  }

  // The board's size comes from CSS and follows the window, so read it
  // and redraw everything at the new scale. The cell size is rounded to
  // whole device pixels, and the grid centered, so every gap is the same.
  function measure() {
    var size = boardEl.clientWidth;
    dpr = window.devicePixelRatio || 1;
    var cell = Math.round((size - 5 * GAP) / 4 * dpr) / dpr;
    stepPx = cell + GAP;
    edgePx = (size - 4 * cell - 3 * GAP) / 2;
    boardEl.style.setProperty("--cell", cell + "px");
    slots.forEach(function (slot, i) {
      slot.style.left = px(col(i)) + "px";
      slot.style.top = px(row(i)) + "px";
    });
    tiles.forEach(function (t) {
      t.css = "";
      draw(t);
    });
  }

  function col(cell) { return cell % 4; }
  function row(cell) { return (cell - cell % 4) / 4; }

  // Cells to px, rounded to whole device pixels so tiles at rest are sharp
  // and sit exactly on the slots under them.
  function px(u) { return Math.round((edgePx + u * stepPx) * dpr) / dpr; }

  function spring(x) { return { x: x, v: 0, to: x }; }

  // Move a spring dt seconds along the exact solution of a damped spring
  // (zeta below 1), so short and long frames trace the same path. Returns
  // false once it rests on its target.
  function advance(s, w, zeta, dt) {
    var d = s.x - s.to;
    var v = s.v;
    if (Math.abs(d) < 1e-3 && Math.abs(v) < 1e-2) {
      s.x = s.to;
      s.v = 0;
      return false;
    }
    var a = zeta * w;
    var b = w * Math.sqrt(1 - zeta * zeta);
    var e = Math.exp(-a * dt);
    var cos = Math.cos(b * dt);
    var sin = Math.sin(b * dt);
    s.x = s.to + e * (d * cos + (v + a * d) / b * sin);
    s.v = e * (v * cos - (a * v + w * w * d) / b * sin);
    return true;
  }

  function addTile(cell, value) {
    var t = {
      el: document.createElement("div"),
      cell: cell,        // its cell on the game's board, -1 once merged away
      value: value,      // its exponent on the game's board
      shown: value,      // the exponent it shows, behind value until merges land
      x: spring(col(cell)),
      y: spring(row(cell)),
      s: spring(1),      // scale
      scaleZeta: GROW_ZETA,
      host: null,        // for a merging tile, the tile it slides into
      chasers: [],       // tiles still sliding into this one
      growing: false,
      growAt: 0,
      giveUpAt: 0,
      css: ""
    };
    boardEl.appendChild(t.el);
    tiles.push(t);
    return t;
  }

  // A new tile. It waits until the slide that made room for it is mostly
  // done, then grows in. Pass delay 0 to grow it at once.
  function spawn(cell, value, delay) {
    var t = addTile(cell, value);
    t.s.x = 0;
    t.growing = true;
    t.growAt = clock + (delay === undefined ? spawnDelay : delay);
    grid[cell] = t;
    paint(t);
    draw(t);
    changed();
  }

  // A new game: drop every tile and grow in the ones on this board.
  function reset(board) {
    tiles.forEach(function (t) { t.el.remove(); });
    tiles = [];
    grid = new Array(16).fill(null);
    board.forEach(function (e, cell) {
      if (e) spawn(cell, e, 0);
    });
  }

  // Start a slide from Game.slideTiles. Tiles keep their position and
  // velocity; only the cells their springs pull toward change.
  function move(result) {
    var next = new Array(16).fill(null);
    result.moves.forEach(function (m) {
      if (m.into >= 0) return;
      var t = grid[m.from];
      t.cell = m.to;
      t.value = result.board[m.to];
      next[m.to] = t;
    });
    result.moves.forEach(function (m) {
      if (m.into >= 0) absorb(grid[m.from], grid[m.into]);
    });
    grid = next;
    // A new tile still waiting to grow starts now, so it is seen moving.
    tiles.forEach(function (t) { t.growAt = Math.min(t.growAt, clock); });
    changed();
  }

  // t merges into host. It keeps sliding until it reaches host, and so do
  // the tiles that were still sliding into t.
  function absorb(t, host) {
    [t].concat(t.chasers).forEach(function (c) {
      c.host = host;
      c.giveUpAt = clock + GIVE_UP;
      host.chasers.push(c);
      paint(c);
    });
    t.cell = -1;
    t.chasers = [];
  }

  // A merging tile reached its host: drop it. Once nothing else is sliding
  // into the host, the host shows its new value with a little bounce.
  function land(t) {
    var host = t.host;
    host.chasers.splice(host.chasers.indexOf(t), 1);
    tiles.splice(tiles.indexOf(t), 1);
    t.el.remove();
    if (host.chasers.length === 0 && host.shown !== host.value) {
      host.shown = host.value;
      paint(host);
      if (!reduce.matches) {
        host.scaleZeta = POP_ZETA;
        host.s.v = POP * omega * SCALE_SPEED;
      }
    }
  }

  function changed() {
    if (reduce.matches) {
      finish();
    } else if (!frameId) {
      last = performance.now();
      frameId = requestAnimationFrame(frame);
    }
  }

  function frame(now) {
    var dt = Math.min(MAX_DT, Math.max(0, now - last) / 1000);
    last = now;
    clock += dt;
    var busy = false;
    tiles.forEach(function (t) {
      var home = t.host || t;
      t.x.to = col(home.cell);
      t.y.to = row(home.cell);
      if (advance(t.x, omega, ZETA, dt)) busy = true;
      if (advance(t.y, omega, ZETA, dt)) busy = true;
      if (clock < t.growAt) {
        busy = true;
      } else if (advance(t.s, omega * SCALE_SPEED, t.scaleZeta, dt)) {
        busy = true;
      } else if (t.growing) {
        t.growing = false;
        paint(t);
      }
    });
    tiles.slice().forEach(function (t) {
      if (!t.host) return;
      busy = true;
      var dx = t.x.x - t.host.x.x;
      var dy = t.y.x - t.host.y.x;
      if (dx * dx + dy * dy < LAND * LAND || clock > t.giveUpAt) land(t);
    });
    tiles.forEach(draw);
    frameId = busy ? requestAnimationFrame(frame) : 0;
  }

  // Reduced motion: put every tile where it ends up, at once.
  function finish() {
    tiles.slice().forEach(function (t) {
      if (t.host) land(t);
    });
    tiles.forEach(function (t) {
      t.x = spring(col(t.cell));
      t.y = spring(row(t.cell));
      t.s = spring(1);
      t.growing = false;
      t.growAt = 0;
      paint(t);
      draw(t);
    });
  }

  function paint(t) {
    var name = "tile t" + Math.min(t.shown, 13) + (t.host ? " merging" : t.growing ? " new" : "");
    if (t.el.className !== name) t.el.className = name;
    var text = String(Math.pow(2, t.shown));
    if (t.el.textContent !== text) t.el.textContent = text;
  }

  function draw(t) {
    var css = "translate3d(" + px(t.x.x) + "px," + px(t.y.x) + "px,0) scale(" + t.s.x.toFixed(3) + ")";
    if (css !== t.css) {
      t.el.style.transform = css;
      t.css = css;
    }
  }

  // "+points" rising beside el, the score box. Points that come in quick
  // succession, as when the AI plays fast, add up in one float.
  function floatPoints(el, points) {
    if (reduce.matches || !points) return;
    var now = performance.now();
    if (lastFloat && now - lastFloat.at < 300) {
      lastFloat.points += points;
    } else {
      var f = document.createElement("span");
      f.className = "score-float";
      f.addEventListener("animationend", function () { f.remove(); });
      el.appendChild(f);
      lastFloat = { el: f, at: now, points: points };
    }
    lastFloat.el.textContent = "+" + lastFloat.points.toLocaleString("en-US");
  }

  return {
    init: init,
    setPace: setPace,
    reset: reset,
    move: move,
    spawn: spawn,
    floatPoints: floatPoints
  };
})();
