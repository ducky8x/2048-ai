# Learning 2048

A web page where a small neural network plays 2048 in the browser, and where you can play the game yourself.

The network scores each possible move by the points it makes plus how many more points it expects to score afterward. "Think ahead" also tries every new tile that could appear and the best reply to each. The model and its training come from the reinforcement-learning-2048 project; `model/weights.bin` holds its weights as float32 numbers.

The page is plain HTML, CSS and JavaScript with no build step and no outside requests.

## Run it locally

From the repo root:

```
python3 -m http.server
```

Then open http://localhost:8000.
