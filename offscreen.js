let audioElem;

chrome.runtime.onMessage.addListener(async (request) => {
  if (request.cmd === 'offscreen_play') {
    if (!audioElem) {
      audioElem = new Audio();
      audioElem.crossOrigin = 'anonymous';
    }
    audioElem.src = request.src;
    try {
      audioElem.currentTime = request.currentTime || 0;
    } catch(e) {}
    try {
      await audioElem.play();
    } catch (e) {
      console.error('Offscreen play failed', e);
    }
  }
});

