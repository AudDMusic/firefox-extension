// injected on Firefox

function audioRecorderFirefox() {
	var AudDRecorder = function(){
	var counter = 0;
    var is_recording = false;
    var _media_recorder_handler = null;
	var last_src = "";
	
	var MediaRecorderWrapper = function(user_media_stream) {

    var _user_media_stream = user_media_stream;
    var _media_stream = null;
    var _mime_type = 'audio/webm';
    if (typeof window.InstallTrigger !== 'undefined') {
        _mime_type = 'audio/ogg';
    }
    var _media_recorder = null;

    var _is_opera = !!window.opera || navigator.userAgent.indexOf(' OPR/') >= 0;
    var _is_chrome = !!window.chrome && !_is_opera;
    var _is_firefox = typeof window.InstallTrigger !== 'undefined';

    var _is_recording = false;

    var _dom_interval_handler = null;

    var self = this;

    function is_MediaRecorder_compatible() {
        if (_is_firefox) {
            return true;
        }
        if (!_is_chrome) {
            return false;
        }

        var t_offset = -1;
        var version_str = navigator.userAgent;
        console.log(version_str);

        if ((t_offset = version_str.indexOf('Chrome')) !== -1) {
            version_str = version_str.substring(t_offset + 7);
        }
        if ((t_offset = version_str.indexOf(';')) !== -1) {
            version_str = version_str.substring(0, t_offset);
        }
        if ((t_offset = version_str.indexOf(' ')) !== -1) {
            version_str = version_str.substring(0, t_offset);
        }

        var major_version = parseInt('' + version_str, 10);

        if (isNaN(major_version)) {
            major_version = parseInt(navigator.appVersion, 10);
        }

        console.log(major_version);

        return major_version >= 49;
    }

    this.start = function(record_time_ms) {
        if (_is_recording) {
            return true;
        }
        _is_recording = true;
        if (_user_media_stream.getAudioTracks().length <= 0) {
            console.error("_user_media_stream.getAudioTracks().length <= 0");
            return false;
        }
		
        /*var _MediaStream = window.MediaStream;
        if (typeof _MediaStream === 'undefined' && typeof webkitMediaStream !== 'undefined') {
            _MediaStream = webkitMediaStream;
        }
        if (typeof _MediaStream === 'undefined' || !_MediaStream) {
            console.error("_MediaStream === 'undefined'");
            return false;
        }

        if (!!navigator.mozGetUserMedia) {
            _media_stream = new _MediaStream();
            _media_stream.addTrack(_user_media_stream.getAudioTracks()[0]);
        } else {
            // webkitMediaStream
            _media_stream = new _MediaStream(_user_media_stream.getAudioTracks());
        }*/

        var recorder_hints = {
            mimeType: _mime_type
        };

        if (!is_MediaRecorder_compatible()) {
            // to support video-only recording on stable
            recorder_hints = 'video/vp8';
        }

        // http://dxr.mozilla.org/mozilla-central/source/content/media/MediaRecorder.cpp
        // https://wiki.mozilla.org/Gecko:MediaRecorder
        // https://dvcs.w3.org/hg/dap/raw-file/default/media-stream-capture/MediaRecorder.html
        // starting a recording session; which will initiate "Reading Thread"
        // "Reading Thread" are used to prevent main-thread blocking scenarios
        try {
            _media_recorder = new MediaRecorder(_user_media_stream, recorder_hints);
        } catch (e) {
            // if someone passed NON_supported mimeType
            // or if Firefox on Android
            _media_recorder = new MediaRecorder(_user_media_stream);
        }

        if ('canRecordMimeType' in _media_recorder && _media_recorder.canRecordMimeType(_mime_type) === false) {
            console.warn('MediaRecorder API seems unable to record mimeType:', _mime_type);
            return false;
        }

        // i.e. stop recording when <video> is paused by the user; and auto restart recording
        // when video is resumed. E.g. yourStream.getVideoTracks()[0].muted = true; // it will auto-stop recording.
        //mediaRecorder.ignoreMutedMedia = self.ignoreMutedMedia || false;
        // Dispatching OnDataAvailable Handler
        _media_recorder.ondataavailable = function(e) {
            if (!_is_recording) {
                console.log("MediaRecorderWrapper record have stopped.");
                return;
            }

            var ret = {"status":0, "data": new Blob([e.data], {type: _mime_type})};
            if (!e.data || !e.data.size || e.data.size < 26800) {
                ret = {"status":-1, "data": "audio none: can not record audio."};
            }

            self.ondataavailable(ret);
        };

        _media_recorder.onerror = function(error) {
            console.error(error.name);

            self.ondataavailable({"status":-1, "data": error.name + ": can't record audio. Please make sure you're using the latest browser and OS versions."});

            if (_media_recorder) {
                _media_recorder.stop();
            }
        };

        // void start(optional long mTimeSlice)
        // The interval of passing encoded data from EncodedBufferCache to onDataAvailable
        // handler. "mTimeSlice < 0" means Session object does not push encoded data to
        // onDataAvailable, instead, it passive wait the client side pull encoded data
        // by calling requestData API.
        try {
            _media_recorder.start(3.6e+6);
        } catch (e) {
            console.error(e);
            return false;
        }

        _dom_interval_handler = setInterval(function() {
            if (!_is_recording) {
                return;
            }

            if (!_media_recorder) {
                return;
            }
            if (_media_recorder.state === 'recording') {
                _media_recorder.requestData();
            }
        }, record_time_ms);

        return true;
    };


    this.stop = function() {
        console.log("MediaRecorderWrapper stop");

        if (!_is_recording) {
            return;
        }

        _is_recording = false;
        if (_dom_interval_handler) {
            clearInterval(_dom_interval_handler);
            _dom_interval_handler = null;
        }

        if (_media_recorder && _media_recorder.state === 'recording') {
            _media_recorder.stop();
            try {
                //_user_media_stream.getAudioTracks()[0].stop();
            } catch (e) {
                console.error(e);
            }
        }
    };

    this.ondataavailable = function(blob) {
        console.log('recorded-blob', blob);
    };
};
	var start = function(record_time_ms) {
		const els = Array.from(document.querySelectorAll('audio, video')).filter(media => !media.paused);
		if (els.length === 0) {
			console.log("els.length === 0");
			is_recording = false;
			chrome.runtime.sendMessage({cmd: "popup_error", result: {"status": 2, "text": "start error: can't find any unpaused media elements."}});
			return;
		}
        if (is_recording) {
            console.log("is_recording=" + is_recording);
            return;
        }
        is_recording = true;
		counter++;
		console.log("starting firefox audio capture", counter);
		var media = els[0];
		media.onplay = (event) => {
			console.log('media.onplay');
			start(0);
			stop();
		};
		
		if (
			media.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
			|| media.paused
		) {
			is_recording = false;
			return;
		}
		let stream;
		if (media.captureStream) {
			stream = media.captureStream()
		} else if (media.mozCaptureStream) {
			stream = media.mozCaptureStream()
		}
		
		AudioContext = window.AudioContext || window.webkitAudioContext;
		const audioCtx = window.AudDContext || new AudioContext()
		if (media.src != "" && last_src != media.src) {
			try {
				const source = audioCtx.createMediaStreamSource(stream);
				source.connect(audioCtx.destination);
				
				console.log("connected the stream");
				console.log(stream);
				console.log(audioCtx);
				last_src = media.src;
			} catch(e) {console.log(e);}
		}
		// window.AudDContext = audioCtx;
		
		
		/*var AudioContext = window.AudioContext || window.webkitAudioContext;
		var audioCtx = new AudioContext();
		var source = audioCtx.createMediaStreamSource(stream);
		source.connect(audioCtx.destination);*/
		
		
			if(record_time_ms == 0) {
				console.log("Recording length isn't set");
				is_recording = false;
				return;
			}
			console.log(stream);
		 

             let pureAudioStream = new MediaStream(stream.getAudioTracks())
			_media_recorder_handler = new MediaRecorderWrapper(pureAudioStream);

            _media_recorder_handler.ondataavailable = function (audio_buffer_obj) {
				console.log(audio_buffer_obj);
				chrome.runtime.sendMessage({cmd: "firefox_ondataavailable", result: audio_buffer_obj});
            };
			console.log("starting recording");
            if(!_media_recorder_handler.start(record_time_ms)) {
				chrome.runtime.sendMessage({cmd: "popup_error", result: {"status": 2, "text": "start error: can not record audio."}});
            }
	}
    var stop = function() {
        console.log("stopping firefox _media_recorder_handler");
        _media_recorder_handler.stop();
        is_recording = false;
    };
	chrome.runtime.onMessage.addListener(
	  function onMessage(request, sender, sendResponse) {
		  console.log(request);
		switch (request.cmd) {
			case 'to_firefox_start':
				start(request.data);
				break;
			case 'to_firefox_stop':
				stop();
				/*window.AudDContext = undefined;
				window.AudDRecorder = undefined;
				AudDRecorder = undefined;
				FirefoxAudioRecording = undefined;
				_media_recorder_handler = undefined;
				chrome.runtime.onMessage.removeListener(onMessage);*/
				break;
			
		}
		return true;
	  }
	);
	
		// fixes the wierd bug of audio stopping working on YouTube after navigating to a different video
		window.addEventListener('locationchange', function () {
			console.log('location changed!');
			start(0);
		});
		window.addEventListener('popstate', function () {
			console.log('location changed via popstate!');
			start(0);
		});
		window.onmouseup = (event) => {
			console.log('location possibly changed via onmouseup!');
			start(0);
			stop();
		};
		new MutationObserver(function(mutations) {
			console.log('location possibly changed (the title has changed)!');
			start(0);
		}).observe(
			document.querySelector('title'),
			{ subtree: true, characterData: true, childList: true }
		);
		new MutationObserver(function(mutations) {
			console.log('location possibly changed (the video has changed)!');
			start(0);
		}).observe(
			document.querySelector('video'),
			{ subtree: true, characterData: true, childList: true }
		);
	};
	if(window.AudDRecorder === undefined)
	{
		window.AudDRecorder = AudDRecorder;
		console.log("injected firefox");
	} else {
		console.log("already injected in firefox");
	}
	AudDRecorder();
  return [];
}

audioRecorderFirefox();
