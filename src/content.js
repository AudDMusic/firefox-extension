// injected in Firefox

function audioRecorderFirefox() {
	var AudDRecorder = function(){
		const REC = (() => {
			// thanks to github.com/Termplexed for solving https://github.com/AudDMusic/firefox-extension/issues/4
			
			"use strict";

			const wait = ms => new Promise((resolve) => setTimeout(resolve, ms));

			const REC = {
				audio_mime: null,
				audio_data: [],
				audio_recorder: null,
				audio_capture_stream: null,
				get_media_element() {
					const media = Array.from(
						document.querySelectorAll('audio, video')
					).filter(media => !media.paused);
					return media.length ? media[0] : null;
				},
				audio_rec_on_data(evt) {
					REC.audio_data.push(evt.data);
				},
				audio_to_blob() {
					return new Blob(
						REC.audio_data, { type: REC.audio_mime }
					);
				},
				stop() {
					if (REC.audio_recorder.state === "recording")
						REC.audio_recorder.stop();
				},
				create_audio_context(m_elm) {
					const a_ctx = new AudioContext();
					// Use createMediaElementSource() instead
					// of createMediaStreamSource()
					const m_src = a_ctx.createMediaElementSource(m_elm);
					m_src.connect(a_ctx.destination);
				},
				create_audio_recorder(m_elm) {
					REC.create_audio_context(m_elm);
					const m_cap_str = m_elm.mozCaptureStream();
					const m_cap_tracks = m_cap_str.getAudioTracks();
					const m_str = new MediaStream(m_cap_tracks);
					const m_rec = new MediaRecorder(m_str, {
						mimeType: REC.audio_mime
					});
					m_rec.ondataavailable = REC.audio_rec_on_data;
					REC.audio_recorder = m_rec;
					REC.audio_capture_stream = m_cap_str;
					return m_rec;
				},
				audio_recorder_add_track() {
					const m_cap_tracks = REC.audio_capture_stream.getAudioTracks();
					if(m_cap_tracks.length <= 0) return false;
					REC.audio_recorder.stream.addTrack(m_cap_tracks[0]);
					return true;
				},
				async start(rec_time_ms = 2000, mime = 'audio/webm') {
					REC.audio_mime = mime;
					REC.audio_data = [];
					const m_elm = REC.get_media_element();
					if (m_elm === null)
						return Promise.reject('no_media');
					if (m_elm.dataset.rec !== "initiated") {
						REC.create_audio_recorder(m_elm);
						m_elm.dataset.rec = "initiated";
					} else if (REC.audio_recorder.stream.active === false) {
						/* Track has changed and new is not loaded
						 * automatically. Load new track */
						if(!REC.audio_recorder_add_track())
							return Promise.reject('no_media');
					}
					if ('canRecordMimeType' in REC.audio_recorder && REC.audio_recorder.canRecordMimeType(mime) === false) {
						console.warn('MediaRecorder API seems unable to record mimeType:', mime);
						return Promise.reject('cant_record_mime_type');
					}
					const m_rec = REC.audio_recorder;
					m_rec.start();

					const rec_stopped = new Promise((resolve, reject) => {
						/* onstop is raised AFTER dataavailable,
						 * hence REC.buf[] is filled including last
						 * fragment. */
						m_rec.onstop = resolve;
						m_rec.onerror = evt => reject(evt.name);
					});
					const rec_record = wait(rec_time_ms).then(() => {
						if (m_rec.state === "recording")
							m_rec.stop();
					});
					await Promise.all([rec_record, rec_stopped]);
					return REC.audio_to_blob();
				}
			};
			return {
				start: REC.start,
				stop: REC.stop
			};
		})();
		
		var onDataAvailable = function(audio_buffer_obj) {
			console.log(audio_buffer_obj);
			chrome.runtime.sendMessage({cmd: "firefox_ondataavailable", result: audio_buffer_obj});
		}
		chrome.runtime.onMessage.addListener(
		  function onMessage(request, sender, sendResponse) {
			  console.log(request);
			switch (request.cmd) {
				case 'to_firefox_start':
					REC.start(record_time_ms = request.data).then(e => {
						/*const url = URL.createObjectURL(blob);
						document.getElementById('some-audio-element').src = url;*/
						var ret = {"status":0, "data": e};
						if (!e || !e.size || e.size < 26800) {
							console.log(e);
							ret = {"status":-1, "data": "audio none: can not record audio."};
						}
						onDataAvailable(ret);
					}).catch(e => {
						if(e == 'no_media') {
							chrome.runtime.sendMessage({cmd: "popup_error", result: {"status": 2, "text": "start error: can't find any unpaused media elements."}});
							return;
						}
						console.log(e);
					});
					break;
				case 'to_firefox_stop':
					REC.stop();
					break;
				
			}
			return true;
		  }
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
