'use strict';
importScripts('optimizer.js');
self.onmessage = ({data}) => {
  try { self.postMessage({result:MvpOptimizer.solve(data)}); }
  catch (error) { self.postMessage({error:error.message}); }
};
