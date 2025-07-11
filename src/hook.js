(function(){
  function ensureInDOM(el){
    try {
      if(!el.isConnected){
        el.style.display='none';
        (document.documentElement||document.body).appendChild(el);
      }
    } catch(e){}
  }
  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function(...args){
    ensureInDOM(this);
    return origPlay.apply(this,args);
  };
  if(window.Audio){
    const OrigAudio = window.Audio;
    window.Audio = function(...args){
      const el = new OrigAudio(...args);
      ensureInDOM(el);
      return el;
    };
    window.Audio.prototype = OrigAudio.prototype;
  }
  if(window.Video){
    const OrigVideo = window.Video;
    window.Video = function(...args){
      const el = new OrigVideo(...args);
      ensureInDOM(el);
      return el;
    };
    window.Video.prototype = OrigVideo.prototype;
  }
})();
