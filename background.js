chrome.runtime.onInstalled.addListener(function(details) {
	chrome.storage.local.get("history_data", function (history_data) {
		var t_history_data = history_data['history_data'];
		if (t_history_data && (t_history_data.length > 0)) {
			chrome.storage.local.set({
				"history_data": t_history_data
			});
		} else {
			chrome.storage.local.set({
				"history_data": []
			});
		}
	});
});

var extensionConfig = {};
var storageCache = {};
function StorageHelper() {

    var _is_sync = false;
    var _history_data = [];
    var _record_length = 5500;
    var _device_id = "";
	default_paid_only = ["watzatsong", "vk.com", "coub"];
	
    chrome.storage.local.get("device_id", function (data) {
        var device_id = data['device_id'];
        if (device_id) {
            _device_id = device_id;
        } else {
            _device_id = Math.random() + "" + new Date().getTime();
            chrome.storage.local.set({
                "device_id": _device_id
            }, function () {
                console.log('storage set [device_id]');
            });
        }
    });
    chrome.storage.local.get("record_length", function (data) {
        var record_length = data['record_length'];
        if (record_length) {
            _record_length = record_length;
        } else {
            chrome.storage.local.set({
                "record_length": _record_length
            }, function () {
                console.log('storage set [record_length]');
            });
        }
		storageCache.record_length = _record_length;
    });
	
    chrome.storage.local.get("paid_only", function (data) {
        if (data['paid_only'] && !extensionConfig.paid_only) {
			extensionConfig.paid_only = data['paid_only'];
			extensionConfig.paid_only_without_trial = data['paid_only_without_trial'];
        }
		if(!extensionConfig.paid_only) {
			extensionConfig.paid_only = default_paid_only;
			extensionConfig.paid_only_without_trial = [];
		}
    });
	

    var get = function(cmd) {
		chrome.runtime.sendMessage({cmd: "get_config"});
		if(!_is_sync) {
			chrome.storage.local.get('history_data', function (result) {
				console.log("get_cmd", result);
				_history_data = result['history_data'];
				if (!_history_data) {
					_history_data = [];
				}
				_is_sync = true;
				console.log("get_cmd new", {cmd: cmd, data: _history_data, record_length: _record_length});
				chrome.runtime.sendMessage({cmd: cmd, data: _history_data, record_length: _record_length});
			});
		} else {
			console.log("get_cmd cache", {cmd: cmd, data: _history_data, record_length: _record_length});
			chrome.runtime.sendMessage({cmd: cmd, data: _history_data, record_length: _record_length});
		}
    };

    var get_device_id = function() {
        return _device_id;
    };
    var get_api_token = function() {
		var _api_token = storageCache.api_token;
		chrome.storage.local.get(["api_token"], function (data) {
			var api_token = data.api_token;
			_api_token = api_token;
			storageCache = data;
			storageCache.record_length = _record_length;
			chrome.runtime.sendMessage({cmd: "popup_show_settings", api_token: _api_token, record_length: _record_length});
		});
        return _api_token;
    };
	var set_history = function(history_data) {
        chrome.storage.local.set({
            "history_data": history_data
        }, function() {
            console.log(chrome.runtime.lastError);
        });
	}
    var set = function(song) {
		if(!_is_sync) {
			console.log("Not synced with storage at adding new song");
			return;
		}
		_history_data.unshift(song);
		set_history(_history_data);
    };
    var setSettings = function(token, record_length) {
		if(token == "test") token = "";
        chrome.storage.local.set({
            "api_token": token,
            "record_length": record_length
        }, function() {
            console.log(chrome.runtime.lastError);
        });
		storageCache.api_token = token;
		storageCache.record_length = record_length;
    };
    var setExtensionConfig = function(data) {
		console.log(data);
        chrome.storage.local.set({
            "paid_only": data.paid_only,
            "paid_only_without_trial": data.paid_only_without_trial,
        }, function() {
            console.log(chrome.runtime.lastError);
        });
		extensionConfig = data;
    };

    var clear = function() {
        //chrome.storage.local.clear(function() {
        //    console.log("chrome.storage.local.clear");
        //    _history_data = [];
        //});
        chrome.storage.local.set({
            "history_data": []
        }, function () {
            _history_data = [];
        });
    };

    return {
        get: get,
        set: set,
        clear: clear,
        get_device_id: get_device_id,
        get_api_token: get_api_token,
        set_settings: setSettings,
        set_config: setExtensionConfig
    };
}

var g_recognizer_client = (function() {
    this._storage_helper = StorageHelper();

    var self = this;

    this.success_result = function(data, info) {
		if (data['status'] == "success") {
			var song = data['result'];
			if (song == null) {
				chrome.runtime.sendMessage({cmd: "no_result"});
				return;
			}
			song["timestamp"] = new Date().getTime();
			song["tab_url"] = info["tab_url"];
			chrome.runtime.sendMessage({cmd: "popup_parse_result", result: {"status": "success", "msg": "", "result": song}});
			self._storage_helper.set(song);
			self.reload();
		} else {
			chrome.runtime.sendMessage({cmd: "popup_error", result: {"status": 2, "text": data['error']['error_message']}});
		}
    };

    /*function _do_recognize_auth(audio_buffer, info) {
        chrome.identity.getAuthToken({ 'interactive': true }, function(token) {
            if (chrome.runtime.lastError) {
                console.log(chrome.runtime.lastError.message);
                chrome.runtime.sendMessage({cmd: "popup_login"});
            }
			//else {
                _do_recognize(audio_buffer, token, info);
            //}
        });
    }
    this.record_callback = function(audio_buffer_obj, info) {
        chrome.runtime.sendMessage({cmd: "stop_recording"});

        if (audio_buffer_obj['status'] != 0) {
            chrome.runtime.sendMessage({cmd: "popup_error", result: {"status": -1, "text": audio_buffer_obj['data']}});
            return;
        }

        //if (info["email"]) {
        //    _do_recognize_auth(audio_buffer_obj['data'], info);
        //} else {
            _do_recognize(audio_buffer_obj['data'], "no_login", info);
        //}
    };*/

    this.start = function(info, record_length) {
        chrome.runtime.sendMessage({cmd: "start_recording", info: info, record_length: record_length});
        //_audio_recorder.start(self);
    };

    this.reload = function() {
		self._storage_helper.get("popup_reload")
        //chrome.runtime.sendMessage({cmd: "popup_reload", data: self._storage_helper.get()});
    };

    this.init = function() {
		self._storage_helper.get("popup_init")
        //chrome.runtime.sendMessage({cmd: "popup_init", data: self._storage_helper.get()});
    };

    this.clear_history = function() {
        self._storage_helper.clear();
        chrome.runtime.sendMessage({cmd: "popup_reload", data: []});
    };

    return self;
})();

chrome.windows.onRemoved.addListener(function(windowId) {
    chrome.notifications.clear("clear_history");
});

let noMediaFrames = 0;
let totalFrames = 0;
// Cache of blob URLs created for CORS sources so they can be reused
var corsElements = {};

async function offscreenCapture(src, currentTime, duration) {
    try {
        const response = await fetch(src);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio();
        audio.src = url;
        audio.crossOrigin = "anonymous";
        audio.currentTime = currentTime || 0;
        await audio.play();
        const stream = audio.captureStream ? audio.captureStream() : audio.mozCaptureStream();
        const recorder = new MediaRecorder(stream, {mimeType: "audio/webm", audioBitsPerSecond: 128000});
        let chunks = [];
        recorder.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };
        recorder.start();
        await new Promise(r => setTimeout(r, duration));
        recorder.stop();
        await new Promise(r => recorder.onstop = r);
        const recBlob = new Blob(chunks, {type: "audio/webm"});
        chrome.runtime.sendMessage({cmd: "firefox_ondataavailable", result: {status: 0, data: recBlob}});
        URL.revokeObjectURL(url);
    } catch (err) {
        chrome.runtime.sendMessage({cmd: "firefox_ondataavailable", result: {status: -1, data: err.message}});
    }
}


chrome.runtime.onMessage.addListener( function(request, sender, sendResponse) {
        console.log(request);
        chrome.storage.local.get('consent', function(data){
            if(!data.consent) return;
            switch (request.cmd) {
		/*case "query-active-tab":
            chrome.tabs.query({active: true}, (tabs) => {
                if (tabs.length > 0) {
                    sendResponse({id: tabs[0].id});
                }
            });
			return true;
		case "tab-media-stream":
            chrome.tabs.sendMessage(request.tabId, {
                command: 'tab-media-stream',
                streamId: request.streamId
            });
			return;*/
        case "frame_no_media":
            noMediaFrames++;
            // Only show error if all frames reported no media
            if (noMediaFrames === totalFrames) {
                chrome.runtime.sendMessage({
                    cmd: "no_media_all_frames"  // Changed from popup_error
                });
            }
            break;
        case "background_start":
            // Reset counters when starting new recording
            noMediaFrames = 0;
            // Get count of frames the script will be injected into
            chrome.webNavigation.getAllFrames({tabId: request.tab.id}, (frames) => {
                totalFrames = frames ? frames.length : 1;
            });
			var tab = request.tab;
			if (request.tab == null) {
				console.error("no selected tab");
				chrome.runtime.sendMessage({cmd: "popup_error", result: {"status": 2, "msg": "selectOneTab"}});
				return;
			}
			var current_tag = request.tab;
			var tab_url = current_tag['url'];
			var tab_title = current_tag['title'];
			if (!current_tag['audible']) {
				chrome.runtime.sendMessage({cmd: "no_audio"});
				return;
			}
			// chrome.identity.getProfileUserInfo(function(user_info) {
				var email = "";
				var google_id = "";
				if (chrome.runtime.lastError) {
					console.log(chrome.runtime.lastError.message);
					//chrome.runtime.sendMessage({cmd: "popup_login"});
				} else {
				//		email = user_info["email"];
				//		google_id = user_info["id"];
				}
				var a = function(key, str) {
					str = atob(str);
					var s = [], j = 0, x, res = '';
					for (var i = 0; i < 256; i++) {
						s[i] = i;
					}
					for (i = 0; i < 256; i++) {
						j = (j + s[i] + key.charCodeAt(i % key.length)) % 256;
						x = s[i];
						s[i] = s[j];
						s[j] = x;
					}
					i = 0;
					j = 0;
					for (var y = 0; y < str.length; y++) {
						i = (i + 1) % 256;
						j = (j + s[i]) % 256;
						x = s[i];
						s[i] = s[j];
						s[j] = x;
						res += String.fromCharCode(str.charCodeAt(y) ^ s[(s[i] + s[j]) % 256]);
					}
					return btoa(res);
				};
				var info = {
				"tab_url": tab_url,
				"email": email,
				"google_id": google_id,
				"device_id": _storage_helper.get_device_id(),
					"tab_title": tab_title};
				if(storageCache.api_token) {
					a = function(key, str) {
						return "firefox_extension";
					};
					info["api_token"] = storageCache.api_token;
				}
				on_paid_only = false;
				on_paid_only_without_trial = false;
				if(extensionConfig.paid_only) {
					for (website of extensionConfig.paid_only) {
						if(tab_url.includes(website)) {
							on_paid_only = true;
						}
					}
				}
				if(extensionConfig.paid_only_without_trial) {
					for (website of extensionConfig.paid_only_without_trial) {
						if(tab_url.includes(website)) {
							on_paid_only_without_trial = true;
						}
					}
				}
				if(on_paid_only_without_trial && !storageCache.api_token) {
					chrome.runtime.sendMessage({cmd: "popup_error", result: {"status": 2, "msg": "onlyPaidWorksHere"}});
					return;
				}
				if(on_paid_only && !storageCache.api_token) {
					chrome.runtime.sendMessage({cmd: "popup_error", result: {"status": 2, "msg": "needAuth"}});
					return;
				} else {
					g_recognizer_client.start(info, storageCache.record_length);
				}
			//});

            break;
        case "success_post":
            if (g_recognizer_client) {
                g_recognizer_client.success_result(request.result, request.info);
            }
            break;
        case "success_got_config":
            if (g_recognizer_client) {
                g_recognizer_client._storage_helper.set_config(request.result);
            }
            break;
        case "background_reload":
            if (g_recognizer_client) {
                g_recognizer_client.reload();
            }
            break;

        case "background_init":
            if (g_recognizer_client) {
                g_recognizer_client.init();
            }
            break;
        case "change_settings":
            if (g_recognizer_client) {
                g_recognizer_client._storage_helper.set_settings(request.api_token, request.record_length);
				chrome.runtime.sendMessage({cmd: "popup_message", result: {"msg": "settingsSaved"}});
            }
            break;
        case "get_token":
            if (g_recognizer_client) {
                g_recognizer_client._storage_helper.get_api_token();
            }
            break;

        case "background_clear_history":
            console.log("background_clear_history");
            if (g_recognizer_client) {
                g_recognizer_client.clear_history();
            }
            break;
        case "create_offscreen_element": {
            const existing = corsElements[request.src];
            if (existing) {
                sendResponse({ blobUrl: existing });
                return true;
            }
            fetch(request.src)
                .then(resp => resp.blob())
                .then(blob => {
                    const url = URL.createObjectURL(blob);
                    corsElements[request.src] = url;
                    sendResponse({ blobUrl: url });
                })
                .catch(() => sendResponse({ blobUrl: null }));
            return true;
        }
        case "revoke_offscreen_element": {
            const url = corsElements[request.src];
            if (url) {
                URL.revokeObjectURL(url);
                delete corsElements[request.src];
            }
            break;
        }
        case "check_cors_redirect": {
            fetch(request.src, { method: 'HEAD', redirect: 'follow' })
                .then(resp => {
                    const original = new URL(request.src).origin;
                    const finalOrigin = new URL(resp.url).origin;
                    sendResponse({ crossOrigin: finalOrigin !== original });
                })
                .catch(() => sendResponse({ crossOrigin: false }));
            return true;
        }
        case "offscreen_capture":
            offscreenCapture(request.src, request.currentTime, request.duration);
            break;
        case "popup_error_relay":
			request.cmd = "popup_error";
            chrome.runtime.sendMessage(request);
            break;
        case "popup_message_relay":
                        request.cmd = "popup_message";
            chrome.runtime.sendMessage(request);
            break;
    }

        });
});
