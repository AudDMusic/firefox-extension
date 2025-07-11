(function(){
    const origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function(...args){
        if(!this.isConnected){
            this.style.display = 'none';
            try{ (document.body || document.documentElement).appendChild(this); }catch(e){}
        }
        return origPlay.apply(this, args);
    };
})();
