(function(){
    const origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function(...args){
        if(!this.isConnected){
            try{
                this.style.display = 'none';
                (document.documentElement || document.body).appendChild(this);
            }catch(e){}
        }
        return origPlay.apply(this, args);
    };
})();
