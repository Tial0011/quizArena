/* Compatibility shim.
   Push handling now lives in sw.js (a scope can only hold one service
   worker, and sw.js also does the offline caching). This file stays only
   so browsers that still know the old registration, or anything that
   asks for this URL by name, get the same worker. */
importScripts("/sw.js");
