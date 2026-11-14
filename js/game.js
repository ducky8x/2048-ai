// The 2048 rules. A board is an array of 16 exponents, row by row from the
// top left: 0 is an empty cell, 1 is a 2 tile, 2 is a 4 tile, 11 is 2048.
// Actions: 0 up, 1 right, 2 down, 3 left.
var Game = (function () {
  var CHANCE_OF_FOUR = 0.1;

  // For each action, the four lines of cell indexes, each listed from the
  // end the tiles move toward, so one function slides all four directions.
  var LINES = [
    [[0, 4, 8, 12], [1, 5, 9, 13], [2, 6, 10, 14], [3, 7, 11, 15]],
    [[3, 2, 1, 0], [7, 6, 5, 4], [11, 10, 9, 8], [15, 14, 13, 12]],
    [[12, 8, 4, 0], [13, 9, 5, 1], [14, 10, 6, 2], [15, 11, 7, 3]],
    [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15]]
  ];

  // Slide one line toward its first cell. A tile merges at most once per
  // move, and each merge scores the value of the new tile.
  function slideLine(line) {
    var tiles = line.filter(function (e) { return e !== 0; });
    var out = [];
    var points = 0;
    var i = 0;
    while (i < tiles.length) {
      if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
        out.push(tiles[i] + 1);
        points += Math.pow(2, tiles[i] + 1);
        i += 2;
      } else {
        out.push(tiles[i]);
        i += 1;
      }
    }
    while (out.length < 4) out.push(0);
    return { line: out, points: points };
  }

  // The board after sliding every tile one way (before a new tile appears),
  // the points scored, and whether anything moved.
  function slide(board, action) {
    var next = new Array(16);
    var points = 0;
    var moved = false;
    LINES[action].forEach(function (cells) {
      var result = slideLine(cells.map(function (c) { return board[c]; }));
      points += result.points;
      cells.forEach(function (c, k) {
        next[c] = result.line[k];
        if (next[c] !== board[c]) moved = true;
      });
    });
    return { board: next, points: points, moved: moved };
  }

  // Every move that changes the board: { action, after, points }.
  function legalMoves(board) {
    var moves = [];
    for (var action = 0; action < 4; action++) {
      var result = slide(board, action);
      if (result.moved) moves.push({ action: action, after: result.board, points: result.points });
    }
    return moves;
  }

  function emptyCells(board) {
    var cells = [];
    for (var i = 0; i < 16; i++) if (board[i] === 0) cells.push(i);
    return cells;
  }

  // A copy of the board with a new tile on a random empty cell: a 4 one time
  // in ten, otherwise a 2.
  function spawn(board, random) {
    var empty = emptyCells(board);
    var cell = empty[Math.floor(random() * empty.length)];
    var next = board.slice();
    next[cell] = random() < CHANCE_OF_FOUR ? 2 : 1;
    return { board: next, cell: cell };
  }

  function isOver(board) {
    return legalMoves(board).length === 0;
  }

  function maxTile(board) {
    var top = Math.max.apply(null, board);
    return top === 0 ? 0 : Math.pow(2, top);
  }

  return {
    CHANCE_OF_FOUR: CHANCE_OF_FOUR,
    slide: slide,
    legalMoves: legalMoves,
    emptyCells: emptyCells,
    spawn: spawn,
    isOver: isOver,
    maxTile: maxTile
  };
})();
