(function(){
    const code = `(() => {
        const origPlay = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function(...args) {
            try {
                if (!this.isConnected) {
                    this.style.display = 'none';
                    (document.documentElement || document.body).appendChild(this);
                }
            } catch(e){
                console.warn('AudD hook append failed', e);
            }
            return origPlay.apply(this, args);
        };
    })();`;
    const s = document.createElement('script');
    s.textContent = code;
    (document.documentElement || document.head).appendChild(s);
    s.remove();
})();
