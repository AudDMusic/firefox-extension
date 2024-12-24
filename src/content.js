// injected in Firefox

function audioRecorderFirefox() {
	var AudDRecorder = function(){
		const REC = (() => {
			// thanks to github.com/Termplexed for solving https://github.com/AudDMusic/firefox-extension/issues/4
			
			"use strict";

			let isRecording = false; // Add recording state tracker
			const wait = ms => new Promise((resolve) => setTimeout(resolve, ms));

			const REC = {
				audio_mime: null,
				audio_data: [],
				audio_recorder: null,
				audio_capture_stream: null,
				get_media_elements() {
				  const getAllMediaElements = (root) => {
					let mediaElements = [];
					const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
					let node = walker.nextNode();
					while (node) {
					  if ((node.tagName === 'AUDIO' || node.tagName === 'VIDEO') && !node.paused) {
						mediaElements.push(node);
					  }
					  // If the node has a shadow root, traverse it as well
					  if (node.shadowRoot) {
						mediaElements = mediaElements.concat(getAllMediaElements(node.shadowRoot));
					  }
					  node = walker.nextNode();
					}
					return mediaElements;
				  };
				  return getAllMediaElements(document);
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
                    isRecording = false;
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
					if (isRecording) {
						console.log("Recording already in progress");
						return Promise.reject('already_recording');
					}
                    isRecording = true;
				  REC.audio_mime = mime;
				  REC.audio_data = [];
				  
				  try {
				  const mediaElements = REC.get_media_elements();
				  if (mediaElements.length === 0) {
					isRecording = false;
					return Promise.reject('no_media');
				  }

				  const combinedStream = new MediaStream();
				  let hasAudioTracks = false;
		  

				  for (let m_elm of mediaElements) {
					try {
						let stream;
						
						// Try different methods to capture audio
						if (m_elm.captureStream) {
							// Method 1: Direct capture
							stream = m_elm.captureStream();
						} else if (m_elm.mozCaptureStream) {
							// Method 2: Firefox-specific capture
							stream = m_elm.mozCaptureStream();
						} else {
							// Method 3: Audio Context fallback
							try {
								// Set crossOrigin before creating the audio context
								if (!m_elm.hasAttribute('crossorigin')) {
									m_elm.crossOrigin = 'anonymous';
								}
								
								// Force reload the media element to apply crossOrigin
								const currentTime = m_elm.currentTime;
								const wasPlaying = !m_elm.paused;
								const src = m_elm.src;
								m_elm.src = '';
								m_elm.load();
								m_elm.src = src;
								m_elm.load();
								
								if (wasPlaying) {
									await m_elm.play();
									m_elm.currentTime = currentTime;
								}
		
								const audioCtx = new AudioContext();
								const source = audioCtx.createMediaElementSource(m_elm);
								const destination = audioCtx.createMediaStreamDestination();
								source.connect(destination);
								source.connect(audioCtx.destination);
								stream = destination.stream;
							} catch (err) {
								console.warn('Audio context fallback failed:', err);
								continue;
							}
						}
		
						// Add all audio tracks from the stream
						if (stream && stream.getAudioTracks().length > 0) {
							stream.getAudioTracks().forEach(track => {
								combinedStream.addTrack(track);
								hasAudioTracks = true;
							});
						}
					} catch (err) {
						console.warn('Could not capture audio from element:', err);
						continue;
					}
				}
		  
				  if (!hasAudioTracks) {
					  isRecording = false;
					  return Promise.reject('no_media');
				  }
		  
				  // Create single recorder for combined stream
				  const recorder = new MediaRecorder(combinedStream, { 
					  mimeType: REC.audio_mime,
					  audioBitsPerSecond: 128000 // Add explicit bitrate
				  });
				  
				  recorder.ondataavailable = REC.audio_rec_on_data;
				  recorder.start(100); // Record in smaller chunks
		  
				  await wait(rec_time_ms);

				  if (recorder.state === "recording") {
					  recorder.stop();
				  }
		  
				  const result = REC.audio_to_blob();
				  isRecording = false;
				  return result;

				} catch (error) {
					isRecording = false;
					throw error;
				}
				},

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
						REC.start(request.data).then(e => {
							var ret = {"status": 0, "data": e};
							if (!e || !e.size || e.size < 26800) {
								console.log(e);
								ret = {"status": -1, "data": "audio none: can not record audio."};
							}
							onDataAvailable(ret);
						}).catch(e => {
							if (e === 'already_recording') {
								console.log('Recording already in progress, ignoring start request');
								return;
							}
							if (e === 'no_media') {
								// Instead of immediately sending error, send a status message
								chrome.runtime.sendMessage({
									cmd: "frame_no_media"
								});
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
    if (window.AudDRecorder === undefined && !document.getElementById('audd-recorder-marker')) {
        // Create marker element
        const marker = document.createElement('div');
        marker.id = 'audd-recorder-marker';
        marker.style.display = 'none';
        document.body.appendChild(marker);
        
        window.AudDRecorder = AudDRecorder;
        console.log("injected firefox");
    } else {
        console.log("already injected in firefox");
    }
    AudDRecorder();
    return [];
}

audioRecorderFirefox();
