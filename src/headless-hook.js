(function(){
    const origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function(...args){
        if(!this.isConnected){
            let parent = this.parentNode;
            let next = this.nextSibling;
            try{ (document.body || document.documentElement).appendChild(this); }catch(e){}
            const res = origPlay.apply(this, args);
            try{
                if(parent){
                    parent.insertBefore(this, next);
                }
            }catch(e){}
            return res;
        }
        return origPlay.apply(this, args);
    };
})();
