var _audio_recorder = new AudioRecorder();
var _is_recognizing = false;
var _info = {};
var _is_starting = false;
var recognitionTimeoutId = null;
var popup_view_instance = null; // Declare globally

function audio_start(record_length) {
	console.log("[PopupView] audio_start called. _is_recognizing:", _is_recognizing);
	if (_is_recognizing) {
		console.log("[PopupView] audio_start: Already recognizing, returning.");
		return;
	}
	_is_recognizing = true;
	console.log("[PopupView] audio_start: _is_recognizing set to true.");
	_audio_recorder.start(record_length); // This sends 'to_firefox_start' for Firefox

	if (_is_firefox) { // Only set timeout for Firefox path
        console.log("[PopupView] audio_start: Setting recognition timeout for Firefox.");
        clearTimeout(recognitionTimeoutId); // Clear any existing timeout
		recognitionTimeoutId = setTimeout(() => {
			if (_is_recognizing) { // If still recognizing after timeout
				console.warn("[PopupView] Recognition timed out in popup.js for Firefox.");
                if (popup_view_instance) { // Use the global instance
				    popup_view_instance.show_message(chrome.i18n.getMessage("recognitionTimeout") || "Recognition timed out. Please try again.", 2);
                } else {
                    // Fallback if popup_view_instance is not available
                    console.error("[PopupView] Timeout: popup_view_instance is not defined!");
                    alert(chrome.i18n.getMessage("recognitionTimeout") || "Recognition timed out. Please try again.");
                }
                _is_starting = false;
                console.log("[PopupView] Timeout: _is_starting set to false.");
				_audio_stop(); // This will set _is_recognizing to false and clear the timeout.
			}
		}, parseInt(record_length, 10) + 5000); // Timeout is record_length + 5 seconds buffer
        console.log("[PopupView] Recognition timeout SET, duration:", parseInt(record_length, 10) + 5000);
	}
}
function _audio_stop() {
	console.log("[PopupView] _audio_stop called. _is_recognizing:", _is_recognizing);
	if (!_is_recognizing) {
		console.log("[PopupView] _audio_stop: Not recognizing, returning.");
		return;
	}
	if(_audio_recorder) {
		_audio_recorder.stop();
	    console.log("[PopupView] _audio_stop: _audio_recorder.stop() called.");
	}
	_is_recognizing = false; // Critical: set recognizing to false FIRST
	console.log("[PopupView] _audio_stop: _is_recognizing set to false.");

    if (_is_firefox && recognitionTimeoutId) { // Clear timeout when stopping
        clearTimeout(recognitionTimeoutId);
        recognitionTimeoutId = null;
        console.log("[PopupView] Cleared recognition timeout because audio stopped.");
    }
}


function OnRecordedAudio(buf) {
	_audio_stop();
	post_request(buf);
}

function get_config() {
	$.ajax({
		type: 'GET',
		url: "https://api.audd.io/extension_config/",
		timeout : 15000,
		dataType: 'json',
		processData: false,
		contentType: false,
		success: function(data) {
			console.log(data);
			chrome.runtime.sendMessage({cmd: "success_got_config", result: data});
		},
		error: function(error, textStatus) {
			console.log(error);
			var msg = "HTTP Error (Code = " + textStatus + "), can't get settings";
			if (textStatus == 'timeout') {
				msg = "Network Timeout, can't get settings";
			}
			chrome.runtime.sendMessage({cmd: "popup_error_relay", result: {"status": 2, "text": msg}});
		}
	});
}

function post_request(audio_buffer) {
	var server_url = "https://api.audd.io/";
	//var browser_version = navigator.userAgent;
	var post_data = new FormData();
	if(_info.api_token) {
		post_data.append('api_token', _info.api_token);
		// post_data.append('tab_url', "api:client");
	}
	
	for (var key in _info) {
		post_data.append(key, _info[key]);
	}
	var manifest = chrome.runtime.getManifest();
	var app_id = chrome.runtime.id;
	console.log(app_id);

	post_data.append('file', audio_buffer);
	//post_data.append('browser_version', browser_version);
	//post_data.append('market', chrome.i18n.getMessage("countryCode"));
	post_data.append('version', manifest.version);
	post_data.append("app_id", app_id);
	post_data.append('return', 'lyrics');
	
	$.ajax({
		type: 'POST',
		url: server_url,
		data: post_data,
		timeout : 15000,
		dataType: 'json',
		processData: false,
		contentType: false,
		success: function(data) {
			console.log(data);
			chrome.runtime.sendMessage({cmd: "success_post", result: data, info: _info});
		},
		error: function(error, textStatus) {
			console.log(error);
			var msg = "HTTP Error (Code = " + textStatus + ")";
			if (textStatus == 'timeout') {
				msg = "Network Timeout";
			}
			chrome.runtime.sendMessage({cmd: "popup_error_relay", result: {"status": 2, "text": msg}});
		}
	});
}

function RecognizerController(popup_view) {
    var _popup_view = popup_view;

    var cancel = function() {
        console.log("[RecognizerController] cancel called.");
        _popup_view.reset();
        _audio_stop();
    };


    var start = function() {
        console.log("[RecognizerController] start called. _is_starting:", _is_starting);
        if (_is_starting) {
            console.log("[RecognizerController] Start already in progress, ignoring request.");
            return;
        }
        
        _is_starting = true;
        console.log("[RecognizerController] start: _is_starting set to true.");
        cancel();
        
        _popup_view.start();
        
        chrome.windows.getCurrent(w => {
            chrome.tabs.query({active: true, windowId: w.id}, tabs => {
                console.log("[RecognizerController] Current tab for background_start:", tabs[0]);
                chrome.runtime.sendMessage({cmd: "background_start", tab: tabs[0]});
            });
        });
    };
    var reload = function() {
        console.log("[RecognizerController] reload called.");
        chrome.runtime.sendMessage({cmd: "background_reload"});
    };

    var init = function() {
        console.log("[RecognizerController] init called.");
        chrome.runtime.sendMessage({cmd: "background_init"});
		if(_is_firefox) {
		chrome.windows.getCurrent(w => {
		  chrome.tabs.query({active: true, windowId: w.id}, tabs => {
			console.log("[RecognizerController] init: Injecting content script for Firefox for tabs:", tabs);
			inject_firefox(tabs);
		  });
		});
		}
    };

    var clear_history = function() {
        console.log("[RecognizerController] clear_history called.");
        chrome.runtime.sendMessage({cmd: "background_clear_history", pushData: {buttons:[{title:chrome.i18n.getMessage("yes")},{title:chrome.i18n.getMessage("no")}],
                title:chrome.i18n.getMessage("confirm"), message:chrome.i18n.getMessage("confirmQuestion"), type:"basic", requireInteraction: true,
                iconUrl:"../../img/favicon.png"}});
    };

    chrome.runtime.onMessage.addListener(
        function(request, sender, sendResponse) {
			console.log("[RecognizerController] Message received:", request);
            if (request.cmd === "popup_error" || 
                request.cmd === "start_recording") {
                _is_starting = false;
                console.log("[RecognizerController] onMessage: _is_starting set to false for cmd:", request.cmd);
            }
            switch (request.cmd) {
				case "start_recording":
					console.log("[RecognizerController] Case: start_recording");
					_info = request.info;
					var local_lan = chrome.i18n.getUILanguage();
					if (!local_lan) {
						local_lan = navigator.language;
					}
					_info.local_lan = local_lan;
					audio_start(request.record_length);
					_popup_view.start();
					break;
				case "firefox_ondataavailable":
					console.log("[RecognizerController] Case: firefox_ondataavailable");
					_audio_recorder.OnDataAvailable(request.result);
					return; // Important: OnDataAvailable might send other messages, so return early.
				case "get_config":
					console.log("[RecognizerController] Case: get_config");
					get_config();
					break;
                case "popup_init":
                    console.log("[RecognizerController] Case: popup_init", request);
                    _popup_view.refresh(request.data);
					start(); // Calls controller's start, not PopupView's
					break;
					
                case "no_media_all_frames":
                    console.log("[RecognizerController] Case: no_media_all_frames");
                    _popup_view.stop();
                    _popup_view.show_message(chrome.i18n.getMessage("noAudioOnTab"), 2);
                    _is_recognizing = false;
                    _is_starting = false;
                    console.log("[RecognizerController] no_media_all_frames: _is_recognizing and _is_starting set to false.");
                    _audio_stop();
                    break;
                case "popup_reload":
                    console.log("[RecognizerController] Case: popup_reload", request);
                    _popup_view.refresh(request.data);
                    if (_is_recognizing) {
                        console.log("[RecognizerController] popup_reload: Was recognizing, calling _popup_view.start()");
                        _popup_view.start();
                    }
                    break;
                case "popup_parse_result":
                    console.log("[RecognizerController] Case: popup_parse_result");
                    _popup_view.show_new_result(request.result["result"]);
                    break;
                case "no_audio":
                    console.log("[RecognizerController] Case: no_audio");
                    _popup_view.show_message(chrome.i18n.getMessage("noAudioOnTab"), 2);
                    _is_recognizing = false;
                    _is_starting = false;
                    console.log("[RecognizerController] no_audio: _is_recognizing and _is_starting set to false.");
                    _audio_stop();
                    break;
                case "no_result":
                    console.log("[RecognizerController] Case: no_result");
                    _popup_view.show_no_result();
                    break;
                case "popup_error":
                    console.log("[RecognizerController] Case: popup_error", request.result);
                    // _is_starting is set to false at the top of the listener if cmd is "popup_error".
                    _is_recognizing = false;
                    console.log("[RecognizerController] popup_error: _is_recognizing set to false.");
                    _audio_stop();
                    if(request.result["msg"] != "" && request.result["msg"] != undefined) {
						_popup_view.show_message(chrome.i18n.getMessage(request.result["msg"]), request.result["status"]);
					} else {
						_popup_view.show_message(request.result["text"], request.result["status"]);
					}
                    break;
                case "popup_message":
                    console.log("[RecognizerController] Case: popup_message", request.result);
					if(request.result["msg"] != "" && request.result["msg"] != undefined) {
						_popup_view.show_message(chrome.i18n.getMessage(request.result["msg"]));
					} else {
						_popup_view.show_message(request.result["text"]);
					}
                    break;
                case "popup_update_version":
                    console.log("[RecognizerController] Case: popup_update_version", request.result);
                    _popup_view.show_message(request.result["msg"], -1);
                    break;
                case "popup_login":
                    console.log("[RecognizerController] Case: popup_login");
                    _popup_view.show_message(chrome.i18n.getMessage("signIn"), -1);
                    break;
                case "popup_show_settings":
                    console.log("[RecognizerController] Case: popup_show_settings");
					$('#token_input').val(request.api_token);
					$('#recordingLength').val(request.record_length / 100);
					$('#recordingLengthText').text((request.record_length / 1000) + "s")
                    return;
            }
            if (request.cmd != "popup_init" && request.cmd != "popup_reload" && request.cmd != "get_config" && request.cmd != "start_recording" && request.cmd != "no_audio" && request.cmd != "popup_error" && request.cmd != "popup_message") {
				console.log("stopping <-", request);
                _popup_view.stop();
            }
            _popup_view.refresh();
			return;
        });
		
    return {
        init: init,
        reload: reload,
        start: start,
        cancel: cancel,
        clear_history: clear_history
    }
}
function init() {
    Date.prototype.format = function (fmt) {
        var o = {
            "M+": this.getMonth() + 1,
            "d+": this.getDate(),
            "h+": this.getHours(),
            "m+": this.getMinutes(),
            "s+": this.getSeconds(),
            "q+": Math.floor((this.getMonth() + 3) / 3),
            "S": this.getMilliseconds()
        };
        if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
        for (var k in o)
            if (new RegExp("(" + k + ")").test(fmt)) fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
        return fmt;
    };
	
	// Assign to the global instance here
    popup_view_instance = PopupView();
    var recognizer_controller = RecognizerController(popup_view_instance); // Pass it to controller
	
    $('.logo[screen="initial"]').on('click', function() {
        recognizer_controller.start();
    });
    $('.inactive_img.settings').on('click', function() {
        openScreen("initial");
        recognizer_controller.start();
    });
    $('.up_button[screen="lyrics"]').on('click', function() {
        openScreen("initial");
    });


    $('#clean-history').on('click', function() {
        $('#clean-history-confirm').show();
        $('#clean-history').hide();
        $('#confirmQuestion').text(chrome.i18n.getMessage("confirmQuestion"));
        $('#clean-history-yes').text(chrome.i18n.getMessage("yes"));
        $('#clean-history-no').text(chrome.i18n.getMessage("no"));
    });

    $('#clean-history-yes').on('click', function() {
        recognizer_controller.clear_history();
        openScreen("initial");
        chrome.runtime.sendMessage({cmd: "popup_message_relay", result: {"text": "The history is cleared. Close and open the extension to see the change."}});
        popup_view.hide_confirm_buttons();
    });

    $('#clean-history-no').on('click', function() {
        popup_view.hide_confirm_buttons();
    });
    chrome.runtime.sendMessage({cmd: "get_token"});
	$('#save_settings').on('click', function() {
		openScreen("initial");
		chrome.runtime.sendMessage({cmd: "change_settings", api_token: $('#token_input').val(), record_length: $('#recordingLength').val()*100});
	})

    recognizer_controller.init();
}

$(window).on('load', function() {
    var date = new Date();
    var year = date.getFullYear();
    $('#copyright_year').html(year);
    var gradient = new Gradient();
    gradient.initGradient("#canvas");

    setTimeout(init, 100);
    
    var objects = document.getElementsByTagName('*'), i;
    for(i = 0; i < objects.length; i++) {
      if (objects[i].dataset && objects[i].dataset.message) {
        objects[i].innerHTML = chrome.i18n.getMessage(objects[i].dataset.message);
      }
    }
});


function MediaRecorderWrapper(user_media_stream) {

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
        var _MediaStream = window.MediaStream;
        if (typeof _MediaStream === 'undefined' && typeof webkitMediaStream !== 'undefined') {
            _MediaStream = webkitMediaStream;
        }
        if (typeof _MediaStream === 'undefined' || !_MediaStream) {
            console.error("_MediaStream === 'undefined'");
            return false;
        }

        if (_user_media_stream.getAudioTracks().length <= 0) {
            console.error("_user_media_stream.getAudioTracks().length <= 0");
            return false;
        }

        if (!!navigator.mozGetUserMedia) {
            _media_stream = new _MediaStream();
            _media_stream.addTrack(_user_media_stream.getAudioTracks()[0]);
        } else {
            // webkitMediaStream
            _media_stream = new _MediaStream(_user_media_stream.getAudioTracks());
        }

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
            _media_recorder = new MediaRecorder(_media_stream, recorder_hints);
        } catch (e) {
            // if someone passed NON_supported mimeType
            // or if Firefox on Android
            _media_recorder = new MediaRecorder(_media_stream);
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
                _user_media_stream.getAudioTracks()[0].stop();
            } catch (e) {
                console.error(e);
            }
        }
    };

    this.ondataavailable = function(blob) {
        console.log('recorded-blob', blob);
    };
}

	var _is_firefox = chrome.tabCapture === undefined;

function AudioRecorder() {

    var _is_recording = false;
    var _record_time_ms = 0;
    var _media_recorder_handler = null;
	
	if(_is_firefox) {
		console.log("Hi, Firefox!");
	}

    var is_recording = function() {
        return _is_recording;
    }
	var OnDataAvailable = function (audio_buffer_obj) {
		if (audio_buffer_obj['status'] != 0) {
			chrome.runtime.sendMessage({cmd: "popup_error_relay", result: {"status": 2, "text": audio_buffer_obj['data']}});
			return;
		}
		OnRecordedAudio(audio_buffer_obj['data']);
	};
    var start = function(record_time_ms) {
        if (_is_recording) {
            console.log("_is_recording=" + _is_recording);
            return;
        }
		if(_is_firefox) {
			chrome.tabs.sendMessage(_tab_id, {cmd: "to_firefox_start", data: record_time_ms});
			return;
		}
		
        _is_recording = true;
        chrome.tabCapture.capture({
            audio : true,
            video : false
        }, function(audio_stream) {
			if (chrome.runtime.lastError) {
				_is_recording = false;
				if(chrome.runtime.lastError.message == "Extension has not been invoked for the current page (see activeTab permission). Chrome pages cannot be captured.") {
					chrome.runtime.sendMessage({cmd: "popup_error_relay", result: {"status": 2, "msg": "notInvoked"}});
				} else {
					chrome.runtime.sendMessage({cmd: "popup_error_relay", result: {"status": 2, "text": chrome.runtime.lastError.message}});
				}
				return;
			}
			if(record_time_ms == 0) {
				console.log("Recording length isn't set");
				return;
			}
            var AudioContext = window.AudioContext || window.webkitAudioContext;
            var audioCtx = new AudioContext();
            var source = audioCtx.createMediaStreamSource(audio_stream);
            source.connect(audioCtx.destination);

            _media_recorder_handler = new MediaRecorderWrapper(audio_stream);

            _media_recorder_handler.ondataavailable = OnDataAvailable;
            if(!_media_recorder_handler.start(record_time_ms)) {
				chrome.runtime.sendMessage({cmd: "popup_error_relay", result: {"status": 2, "text": "start error: can not record audio."}});
            }
        });
    };

    var stop = function() {
		if(_is_firefox) {
			chrome.tabs.sendMessage(_tab_id, {cmd: "to_firefox_stop"});
			return;
		}
        console.log("stopping _media_recorder_handler");
        _media_recorder_handler.stop();
        _is_recording = false;
    };

    return {
        start: start,
        stop: stop,
        is_recording: is_recording,
        OnDataAvailable: OnDataAvailable
    };
}

var _tab_id;
function inject_firefox(tabs){
	if(tabs.length == 0) {
	  console.log("can't find the tab");
	}
	_tab_id = tabs[0].id;
	console.log(_tab_id);
	try {
		chrome.scripting.executeScript(
			{
			  target: {tabId: _tab_id, allFrames: false},
			  files: ['src/content.js'],
			});
	} catch (err) {
		console.error(`failed to execute script: ${err}`);
	}
}


function checkLyrics(song) {
	if(!song.lyrics) return false;
	if(!song.lyrics.lyrics) return false;
	var song_artist = clean_names(song.artist);
	var lyrics_artist = clean_names(song.lyrics.artist);
	var lyrics_fullTitle = clean_names(song.lyrics.full_title);
	return lyrics_fullTitle.includes(song_artist) || song_artist.includes(lyrics_artist);
}
function clean_names(str) {
	return str.toLowerCase().replace(/\s/g, '').replace(/&/gi, '').replace(/,/gi, '').replace(/feat/gi, '').replace(/ft/gi, '');
}

function format_dates(timestamp) {
	var newDate = new Date();
	newDate.setTime(parseInt(timestamp));
	return newDate.format("dd/MM/yyyy hh:mm:ss");
}

function openLyrics() {
	$("#initial_screen").addClass("lyrics");
}
function closeLyrics() {
	$("#initial_screen").removeClass("lyrics");
}

var current_screen = "";

function openScreen(screen_name) {
	if(screen_name == current_screen) return;
	if(current_screen == "lyrics") {
		closeLyrics();
	}
	current_screen = screen_name;
	$('[show-on]').hide();
	$('[show-on-'+screen_name+']').show();
	if(screen_name == "lyrics") {
		openLyrics();
		return;
	}
	$('.screen').css('display', 'none');
	$('#' + screen_name + '_screen').css('display', 'block');
}

var recognitionHistory = [];

function getCover(song) {
	var img = "";
	song.SquereCover = true;
	
	if (song.song_link) {
		img = song.song_link + "?thumb";
		if(song.song_link.includes("//youtu.be/")){
			img = "https://i3.ytimg.com/vi/"+song.song_link.replace("https://youtu.be/", "")+"/hqdefault.jpg";
			song.SquereCover = false;
		}
		if(song.song_link.includes("//youtube.com/")){
			img = "https://i3.ytimg.com/vi/"+song.song_link.replace("https://youtube.com/watch?v=")+"/hqdefault.jpg";
			song.SquereCover = false;
		}
	}

	song.albumImage = img;
	return song;
}

function getSharable(song) {
	var track = song.title + " by " + song.artist;
	var message = "I used AudD Music Recognition on Chrome to discover " + track;
	var twitter_link = "https://twitter.com/intent/tweet?via=helloAudD&text="+encodeURIComponent("I discovered " + track);
	var message_copiable = message;
	if(song.song_link) {
		twitter_link += "&url="+encodeURIComponent(song.song_link);
		message_copiable += ". " + song.song_link;
	} else {
		song.song_link = "https://audd.app/chrome";
	}
	var fb_link = "https://www.facebook.com/dialog/feed?app_id=143511416271112&link="+encodeURIComponent(song.song_link)+"&quote="+encodeURIComponent(message);
	var tg_link = "https://telegram.me/share/url?url="+encodeURIComponent(song.song_link)+"&text="+encodeURIComponent(message.replace("AudD Music Recognition", "@AudD_io"));
	song.copyText = encodeURIComponent(message_copiable);
	song.shareFacebook = fb_link;
	song.shareTelegram = tg_link;
	song.shareTwitter = twitter_link;
	return song;
}

function copyTextToClipboard(text) {
  var textArea = document.createElement("textarea");
  textArea.value = text;
  
  // Avoid scrolling to bottom
  textArea.style.top = "0";
  textArea.style.left = "0";
  textArea.style.position = "fixed";

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    var successful = document.execCommand('copy');
    var msg = successful ? 'successful' : 'unsuccessful';
    console.log('Fallback: Copying text command was ' + msg);
  } catch (err) {
    console.error('Fallback: Oops, unable to copy', err);
  }
  if(msg == "successful") {
	  chrome.runtime.sendMessage({cmd: "popup_message_relay", result: {"status": -1, "msg": "copiedSuccessfully"}});
  }
  document.body.removeChild(textArea);
}

function PopupView() {
	var running = false;
	
    var audio_band = 1;

    var audio_bands_func;

    var _music_info_template_str = $("#music_info_template").html();
    var _no_results_template_str = $("#no_results_template").html();
    var _show_error_template_str = $("#show_error_template").html();

    var _list_template_str = $("#list_template").html();

    var screens = ['history', 'lyrics', 'initial', 'settings']
	
	var recordingLengthSlider = document.getElementById("recordingLength");
	var recordingLengthTextDiv = document.getElementById("recordingLengthText");
	recordingLengthSlider.oninput = function() {
	  recordingLengthTextDiv.innerHTML = this.value / 10 + "s";
	}

    var show_confirm_buttons = function() {
        $('#clean-history-confirm').show();
        $('#clean-history').hide();
    };

    var hide_confirm_buttons = function() {
        $('#clean-history-confirm').hide();
        $('#clean-history').show();
    };
	
	var activateScreenButtons = function() {
		screens.forEach(function(curScreen) {
			$('#' + curScreen + '_button').on('click', function() {
				openScreen(curScreen);
			})
			$('[button-'+curScreen+']').on('click', function() {
				openScreen(curScreen);
			})
		})
	}
	activateScreenButtons();

    var show_message = function(msg, level) {
		if(level == 2) { // Critical error display
			running = false;
			clearInterval(audio_bands_func);
			$("#main_footer").show(); // Error messages are shown in footer
			// console.log(msg); // Logged by caller
			var music_info_html = Mustache.render(_show_error_template_str, {"history": recognitionHistory, "identifiedEarlierText": chrome.i18n.getMessage("identifiedEarlierText")});
			$('#initial_screen_info').html(music_info_html).ready(function(){
				loadCoverImages();
			});
            // Remove other states, add 'show-error' state
			$("#initial_screen_search_img, #initial_screen_search_img2, #logo, .inactive_img, .audio-bands, .mic-eclipse").removeClass("found start");
			$("#initial_screen_search_img, #initial_screen_search_img2, #logo, .inactive_img, .audio-bands, .mic-eclipse").addClass("show-error");
            $(".audio-bands").css("opacity", "0"); // Ensure bands are hidden in error state
			activateScreenButtons();
			msg = "<p>" + msg + "</p>";
			$("#footer_msg").html(msg).ready(function(){
				var padding_for_h2 = 35;
				var padding_top_for_history = parseInt($("#history-results").css("padding-top").replace("px", ""));
				var logo_height = $("#logo").height();
				var footer_height = $("#main_footer").height();
				var bottom_content_height = $("body").height() - footer_height - logo_height;
				var history_height = bottom_content_height - padding_for_h2;
				$("#bottom-content").css("height", bottom_content_height);
				$("#history-tracks").css("padding-top", padding_for_h2);
				$("#history-tracks").css("height", history_height);
				$("#history-results").css("height", history_height - padding_top_for_history);
				$(".history-shadow").css("bottom", footer_height);
				$(".upper-shadow").css("top", logo_height + padding_for_h2);
			});
			return;
		}
        var show_class = 'success';
        if (level == -1) {
            show_class = 'error';
        }

        $("#main_header").hide();
        $("#main_header h1").html(msg);
        $("#main_header").addClass(show_class);
        $("#main_header").slideDown("fast"); // Use a defined speed
		setTimeout(() => {
            $("#main_header").removeClass(show_class).slideUp("fast"); // Slide up for a cleaner disappearance
        }, 3000); // Timeout for message visibility
    };

    var show_new_result = function(song) {
		running = false;
        clearInterval(audio_bands_func);
        // Reset core animation classes to a base state (e.g. 'found') before showing results
        $("#initial_screen_search_img, #initial_screen_search_img2, #logo, .inactive_img, .audio-bands, .mic-eclipse").removeClass("start show-error").addClass("found");
        $(".audio-bands").css("opacity", "0"); // Ensure bands are hidden
		$("#main_footer").hide(); // Results view doesn't use the generic footer message area
		
		song = getCover(song);
		song.playsAt = chrome.i18n.getMessage("playsAt");
		song.SavedToHistory = chrome.i18n.getMessage("SavedToHistory");
		song = getSharable(song);
		
		if(!checkLyrics(song)) {
			song.lyrics = false;
		}
		if(!song.song_link) {
			song.song_link = "https://www.google.com/search?q="+encodeURIComponent(song.artist + " " + song.title);
		}
        var music_info_html = Mustache.render(_music_info_template_str, song);
        $('#initial_screen_info').html(music_info_html);
		recognitionHistory.unshift(song);
		var history_html = Mustache.render(_list_template_str, {"history": recognitionHistory});
        $('#history-on-result').html(history_html).ready(function(){
            loadCoverImages();
            var padding_for_buttons = 88;
            var patreon_height = 0; // Height of Patreon banner + margins
            if (_info && _info.api_token) patreon_height = 0; // Check if _info exists
            var bottom_content_height = $("body").height() - $(".cover-content").height();
            var history_height = bottom_content_height - padding_for_buttons - patreon_height;
            $(".bottom-content").css("height", bottom_content_height);
            $("#history-results").css("height", history_height);
            
			
			$("[share-url]").on("click", function() {
				chrome.windows.create({url: $(this).attr("share-url")});
            });
			$("[copy-text]").on("click", function() {
				copyTextToClipboard(decodeURIComponent($(this).attr("copy-text")));
            });
			setTimeout(function(){
                if ($(".share").length && $(".sub_menu").length && $(".share").offset()) { // Check elements exist
				    var share_left = $(".share").offset().left + $(".share").width()/2 - $(".sub_menu").width() / 2;
				    $(".sub_menu").css("left", share_left);
                }
			}, 100);
			setTimeout(function(){
                if ($(".share").length && $(".sub_menu").length && $(".share").offset()) { // Check elements exist
				    var share_left = $(".share").offset().left + $(".share").width()/2 - $(".sub_menu").width() / 2;
				    $(".sub_menu").css("left", share_left);
                }
			}, 1000);
            $('#patreon-link').on('click', function() {
                chrome.tabs.create({url: 'https://www.patreon.com/audd'});
            });
            
            $('#patreon-close').on('click', function() {
                $('.patreon-suggestion').fadeOut();
            });
            
            if (_info && _info.api_token) { // Check if _info exists
                $('.patreon-suggestion').hide();
            }
		});
        if(song.lyrics) {
            $("#lyrics_body").html(song.lyrics.lyrics.replace(/(?:\r\n|\r|\n)/g, '<br>').replace(/(\])/g, ']<br>'));
        }
		activateScreenButtons();
    };

    var show_no_result = function() {
		running = false;
        clearInterval(audio_bands_func);
        // Reset core animation classes
        $("#initial_screen_search_img, #initial_screen_search_img2, #logo, .inactive_img, .audio-bands, .mic-eclipse").removeClass("start show-error").addClass("found");
        $(".audio-bands").css("opacity", "0"); // Ensure bands are hidden
		$("#main_footer").hide();
		// console.log(recognitionHistory); // Logged by caller
        var music_info_html = Mustache.render(_no_results_template_str, {"history": recognitionHistory, 
			"tryAgainText": chrome.i18n.getMessage("tryAgainText"), "identifiedEarlierText": chrome.i18n.getMessage("identifiedEarlierText"), 
			"noMatchesText": chrome.i18n.getMessage("noMatchesText")});
        $('#initial_screen_info').html(music_info_html).ready(function(){
			loadCoverImages();
		});
		activateScreenButtons();
    };
	
	var loadCoverImages = function() {
		$(".history-cover img").on('error', function () {
			$(this).unbind("error").attr("src", "../../img/no-album.svg");
		});
		$(".history-cover img").each(function() {
			this.src = $(this).attr('data-src');
		});
	}

    var refresh = function(data) {
        if (typeof data !== "undefined") {
            $("#history_screen_info").html("");
            hide_confirm_buttons();

            data.forEach(function(item) {
				item.SquereCover = true;
                item.links = [];
				var usedLabels = {};
				if (item["song_link"]) {
					item.links.push({
						"image": "../../img/auddio-mic-logo.png",
						"link": item["song_link"],
						"label": "lis.tn"
					})
					usedLabels["lis.tn"] = true;
				}
				item.timestamp = format_dates(item.timestamp);
				item = getCover(item);
            })
			
			recognitionHistory = data;
			var tmp_html = Mustache.render(_list_template_str, {"history": data});
            $("#history_screen_info").html(tmp_html).ready(function(){
				loadCoverImages();
			});
            $("#history_screen_info").slideDown("slow");
			activateScreenButtons();
        }

        $("a").each(function() {
            var url = $(this).attr('url');
            var is_set_click = $(this).attr('is_set_click');
            if (url && !is_set_click) {
                $(this).attr('is_set_click', "true");
                $(this).on('click', function() {
                    //var name = $(this).attr('name');
                    chrome.tabs.create({url: url});
                });
            }
        });
    };


    var start = function() {
		if(running) return; // Already running, do nothing
		running = true;
        $("#main_header").hide();
		$("#main_footer").hide();
        // Remove potentially conflicting states
        $("#initial_screen_search_img, #initial_screen_search_img2, #logo, .inactive_img, .audio-bands, .mic-eclipse").removeClass("found show-error");
        // Add 'start' state
        $("#initial_screen_search_img, #initial_screen_search_img2, #logo, .inactive_img, .audio-bands, .mic-eclipse").addClass("start");
        $(".audio-bands").css("opacity", "1"); // Make bands visible
        audio_bands_func = setInterval(function(band) {
            $(".audio-band").removeClass("active");
            $(".audio-band." + audio_band % 3).addClass("active");
            audio_band++;
        }, 500);
		$('#initial_screen_info').html(""); // Clear previous results/messages
    };

    var stop = function() {
		running = false;
        clearInterval(audio_bands_func);
        // if ($("#initial_screen_album").attr("src") == "../../img/microphone.gif") // Old GIF logic
        //     $("#initial_screen_album").attr("src", "../../img/auddio-mic-logo.png")
        // $("#initial_screen_album").removeClass("searching");
		$("#main_footer").hide(); // Often shown by error view, so hide it if stopping to idle

        // Remove 'start' (recording) and 'show-error' (error) classes
        $("#initial_screen_search_img, #initial_screen_search_img2, #logo, .inactive_img, .audio-bands, .mic-eclipse").removeClass("start show-error");
        // Add 'found' class (idle/ready state)
        $("#initial_screen_search_img, #initial_screen_search_img2, #logo, .inactive_img, .audio-bands, .mic-eclipse").addClass("found");
        // Ensure bands are hidden if stop is called
        $(".audio-bands").css("opacity", "0");
    };

    var reset = function() {
        $("#search_result").fadeOut();
        $('#search_result').html("");
    };

    var clear_history = function() {
        $('#search_result').html("");
    };
	
    return {
        start: start,
        stop: stop,
        show_message: show_message,
        refresh: refresh,
        reset: reset,
        show_new_result: show_new_result,
        show_no_result: show_no_result,
        clear_history: clear_history,
        hide_confirm_buttons: hide_confirm_buttons
    };
}
