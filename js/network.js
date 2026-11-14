// The trained network and the move picker that uses it.
//
// The network reads a board as 16 numbers (each exponent / 15) and runs it
// through three dense layers (16 -> 256 -> 256 -> 1) with relu between them.
// Its output, divided by the reward scale, is how many more points it expects
// to score from a board taken right after a slide, before the new tile.
var Network = (function () {
  var SIZES = [16, 256, 256, 1];
  var REWARD_SCALE = 0.001;

  // weights.bin holds float32 arrays back to back: weights then bias for each
  // layer, weights row-major with shape [inputs, outputs].
  function fromBuffer(buffer) {
    var floats = new Float32Array(buffer);
    var layers = [];
    var offset = 0;
    for (var i = 0; i + 1 < SIZES.length; i++) {
      var nIn = SIZES[i];
      var nOut = SIZES[i + 1];
      var w = floats.subarray(offset, offset + nIn * nOut);
      offset += nIn * nOut;
      var b = floats.subarray(offset, offset + nOut);
      offset += nOut;
      layers.push({ w: w, b: b, nIn: nIn, nOut: nOut });
    }
    if (offset !== floats.length) throw new Error("weights.bin has the wrong size");
    return { layers: layers };
  }

  function value(net, board) {
    var a = new Float64Array(16);
    for (var i = 0; i < 16; i++) a[i] = board[i] / 15;
    var layers = net.layers;
    for (var l = 0; l < layers.length; l++) {
      var layer = layers[l];
      var z = new Float64Array(layer.nOut);
      for (var j = 0; j < layer.nOut; j++) z[j] = layer.b[j];
      for (var k = 0; k < layer.nIn; k++) {
        var x = a[k];
        if (x === 0) continue;
        var row = k * layer.nOut;
        for (j = 0; j < layer.nOut; j++) z[j] += x * layer.w[row + j];
      }
      if (l + 1 < layers.length) {
        for (j = 0; j < z.length; j++) if (z[j] < 0) z[j] = 0;
      }
      a = z;
    }
    return a[0] / REWARD_SCALE;
  }

  // Expected points for each of the four actions on this board, or null for
  // a move that changes nothing. Lookahead 0 scores each move as its points
  // plus the network's value of the board after it. Lookahead 1 also tries
  // every new tile that could appear, takes the best reply to each, and
  // averages them by how likely each tile is.
  function scores(net, board, lookahead) {
    var cache = new Map();
    function cachedValue(b) {
      var key = b.join(",");
      var v = cache.get(key);
      if (v === undefined) {
        v = value(net, b);
        cache.set(key, v);
      }
      return v;
    }

    function chance(after) {
      var empty = Game.emptyCells(after);
      var outcomes = [[1, 1 - Game.CHANCE_OF_FOUR], [2, Game.CHANCE_OF_FOUR]];
      var total = 0;
      empty.forEach(function (cell) {
        outcomes.forEach(function (outcome) {
          var b = after.slice();
          b[cell] = outcome[0];
          var replies = Game.legalMoves(b);
          if (replies.length === 0) return; // game over there: nothing more to come
          var best = -Infinity;
          replies.forEach(function (m) {
            best = Math.max(best, m.points + cachedValue(m.after));
          });
          total += (outcome[1] / empty.length) * best;
        });
      });
      return total;
    }

    var result = [null, null, null, null];
    Game.legalMoves(board).forEach(function (m) {
      result[m.action] = m.points + (lookahead === 0 ? cachedValue(m.after) : chance(m.after));
    });
    return result;
  }

  // The action with the highest score, ties to the lowest action; -1 if none.
  function choose(moveScores) {
    var best = -1;
    for (var action = 0; action < 4; action++) {
      var s = moveScores[action];
      if (s !== null && (best === -1 || s > moveScores[best])) best = action;
    }
    return best;
  }

  return { fromBuffer: fromBuffer, value: value, scores: scores, choose: choose };
})();
