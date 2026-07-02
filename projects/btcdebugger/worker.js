self.Module = {
  noInitialRun: true,
  print: function(text) {
    if (arguments.length > 1) text = Array.prototype.slice.call(arguments).join(' ');
    self.postMessage({ type: 'stdout', text });
  },
  printErr: function(text) {
    if (arguments.length > 1) text = Array.prototype.slice.call(arguments).join(' ');
    self.postMessage({ type: 'stderr', text });
  },
  onRuntimeInitialized: function() {
    self.postMessage({ type: 'ready' });
  }
};

// Import the Emscripten generated JS
importScripts('./btcdeb.js');

self.onmessage = function(e) {
  if (e.data.type === 'run') {
    let args = e.data.args;
    let n = 0;
    let r = 0;
    
    // Override prompt for this run
    globalThis.window = {
      prompt: function() {
        r++;
        if (r > 700) throw new Error("Execution Complete");
        let cmd = ['altstack', 'print', 'step'][n];
        n = (n + 1) % 3;
        return cmd;
      }
    };
    
    try {
      self.callMain(args);
    } catch (err) {
      if (err.message !== "Execution Complete") {
        self.postMessage({ type: 'error', error: err.message || String(err) });
      }
    }
    
    // We do NOT post 'done' here because any WASM crash leaves it dirty.
    // The main thread will just kill this worker when it wants a new run.
    self.postMessage({ type: 'done' });
  }
};
