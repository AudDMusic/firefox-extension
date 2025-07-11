chrome.runtime.onMessage.addListener(async (req) => {
    if (req.cmd === 'offscreen_record') {
        const audio = new Audio();
        audio.crossOrigin = 'anonymous';
        audio.src = req.src;
        audio.currentTime = req.currentTime || 0;
        try { await audio.play(); } catch(e) {}
        const stream = audio.captureStream ? audio.captureStream() : (audio.mozCaptureStream ? audio.mozCaptureStream() : null);
        if (!stream) {
            chrome.runtime.sendMessage({cmd:'popup_error', result:{status:2, text:'capture failed'}});
            return;
        }
        const chunks = [];
        const rec = new MediaRecorder(stream);
        rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        rec.onstop = () => {
            const blob = new Blob(chunks, {type:'audio/webm'});
            chrome.runtime.sendMessage({cmd:'firefox_ondataavailable', result:{status:0,data:blob}});
        };
        rec.start();
        setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, req.recordLength || 2000);
    }
});
