(function(){
    const origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function(...args){
        if(!this.isConnected){
            try{ (document.body || document.documentElement).appendChild(this); }catch(e){}
        }
        return origPlay.apply(this, args);
    };
})();
