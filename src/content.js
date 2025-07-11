// injected in Firefox

// --- Headless media element hook ---
(function() {
    const script = document.createElement('script');
    script.textContent = '(' + function() {
        const origPlay = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function(...args) {
            if (!this.isConnected) {
                this.style.display = 'none';
                (document.documentElement || document.body).appendChild(this);
            }
            return origPlay.apply(this, args);
        };
    } + ')();';
    document.documentElement.appendChild(script);
    script.remove();
})();

function audioRecorderFirefox() {
	var AudDRecorder = function(){
		/**
		 * REC is a self-contained module for capturing audio from media elements on a page.
		 * It is designed to solve several key challenges:
		 * 1. Muting: Prevents media elements from being muted during and after recording by
		 *    creating a persistent AudioContext passthrough.
		 * 2. Discovery: Finds all active <audio> and <video> elements, including those
		 *    nested inside Shadow DOMs.
		 * 3. CORS: Intelligently handles cross-origin security errors by reloading the
		 *    media element with the `crossOrigin` attribute, but only when necessary.
		 * 4. Aggregation: Combines audio from multiple playing sources into a single track.
		 */
		const REC = (() => {
			"use strict";

			// A state variable to prevent multiple recordings from starting simultaneously.
			let isRecording = false;
			// A helper function for creating delays with Promises.
			const wait = ms => new Promise((resolve) => setTimeout(resolve, ms));

			const REC = {
				// --- State Properties ---
				audio_mime: null,       // The MIME type for the recording (e.g., 'audio/webm').
				audio_data: [],         // An array to hold the chunks of recorded audio data.
				audio_recorder: null,   // The MediaRecorder instance.

				/**
				 * @description Finds all unpaused <audio> or <video> elements in the document.
				 * This function traverses the main DOM and any nested Shadow DOMs to find all
				 * potential media sources.
				 * @returns {HTMLMediaElement[]} An array of active media elements.
				 */
				get_media_elements() {
				  const getAllMediaElements = (root) => {
					let mediaElements = [];
					// Use a TreeWalker for an efficient, deep traversal of the DOM.
					const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
					let node;
					while (node = walker.nextNode()) {
					  if ((node.tagName === 'AUDIO' || node.tagName === 'VIDEO') && !node.paused) {
						mediaElements.push(node);
					  }
					  // If a node has a shadowRoot, recursively search within it.
					  if (node.shadowRoot) {
						mediaElements = mediaElements.concat(getAllMediaElements(node.shadowRoot));
					  }
					}
					return mediaElements;
				  };
				  return getAllMediaElements(document);
				},

				/**
				 * @description Event handler for the MediaRecorder's 'dataavailable' event.
				 * Pushes the received audio data chunk into the `audio_data` array.
				 * @param {BlobEvent} evt - The event object containing the audio data.
				 */
				audio_rec_on_data(evt) {
					if (evt.data && evt.data.size > 0) {
						REC.audio_data.push(evt.data);
					}
				},

				/**
				 * @description Combines all recorded audio chunks into a single Blob.
				 * @returns {Blob} The final audio recording.
				 */
				audio_to_blob() {
					return new Blob(REC.audio_data, { type: REC.audio_mime });
				},

				/**
				 * @description Stops the recording process.
				 */
                                stop() {
                    // IMPORTANT: This function ONLY stops the MediaRecorder.
                    // It DOES NOT close the AudioContexts created in `start()`. Closing them
                    // would sever the audio routing and mute the element. The contexts are
                    // intended to persist as long as the element is on the page.
                                        if (REC.audio_recorder && REC.audio_recorder.state === "recording") {
                                                REC.audio_recorder.stop();
                    }
                    isRecording = false;
                                },

                                /**
                                 * Determine if the element's source requires CORS.
                                 * @param {HTMLMediaElement} elem - Element to check.
                                 * @returns {Promise<boolean>} True if CORS source.
                                 */
                                async isCorsSource(elem) {
                                        if (elem._auddCors !== undefined) return elem._auddCors;
                                        try {
                                                const src = elem.currentSrc || elem.src;
                                                if (!src) return false;
                                                const elemOrigin = new URL(src, document.baseURI).origin;
                                                if (elemOrigin !== document.location.origin) {
                                                        elem._auddCors = true;
                                                        return true;
                                                }
                                                const resp = await chrome.runtime.sendMessage({
                                                        cmd: 'check_cors_redirect',
                                                        src
                                                });
                                                elem._auddCors = resp && resp.crossOrigin;
                                                return elem._auddCors;
                                        } catch (e) {
                                                elem._auddCors = false;
                                                return false;
                                        }
                                },

                                /**
                                 * Create or return a hidden clone of the media element with CORS enabled.
                                 * @param {HTMLMediaElement} elem - Original element.
                                 * @returns {HTMLMediaElement} Offscreen element.
                                 */
                                getOffscreenClone(elem) {
                                        if (elem._auddOffscreen) return elem._auddOffscreen.clone;

                                        const clone = document.createElement(elem.tagName.toLowerCase());
                                        clone.src = elem.currentSrc || elem.src;
                                        clone.crossOrigin = 'anonymous';
                                        clone.preload = 'auto';
                                        clone.volume = 0;
                                        clone.muted = true;
                                        clone.currentTime = elem.currentTime;
                                        clone.style.display = 'none';
                                        (document.documentElement || document.body).appendChild(clone);

                                        const syncPlay = () => {
                                                clone.currentTime = elem.currentTime;
                                                clone.play().catch(() => {});
                                        };
                                        const syncPause = () => clone.pause();
                                        const syncSeek = () => { clone.currentTime = elem.currentTime; };

                                        elem.addEventListener('play', syncPlay);
                                        elem.addEventListener('pause', syncPause);
                                        elem.addEventListener('seeking', syncSeek);

                                        const cleanup = () => {
                                                clone.pause();
                                                clone.remove();
                                        };
                                        window.addEventListener('pagehide', cleanup, { once: true });

                                        elem._auddOffscreen = { clone, handlers: { syncPlay, syncPause, syncSeek, cleanup } };
                                        return clone;
                                },

				/**
                                * @description Handles CORS errors by reloading the media element.
                                 * This is a disruptive but necessary operation for media served from a
                                 * different origin without the proper CORS headers.
                                 * @param {HTMLMediaElement} m_elm - The media element to reload.
                                 */
				async _reloadMediaForCors(m_elm) {
					console.warn("CORS error on element. Attempting reload with crossOrigin attribute. This may cause a brief stutter.", m_elm);
					
					// Preserve the element's state to restore it after reload.
					const wasPlaying = !m_elm.paused;
					const currentTime = m_elm.currentTime;
					const src = m_elm.src;
					
					// Apply the attribute and re-assign the src to force a reload.
					m_elm.crossOrigin = 'anonymous';
					m_elm.src = src;
					
					// Wait for the media to be ready again.
					await new Promise((resolve, reject) => {
						m_elm.oncanplaythrough = resolve; // A more reliable event than 'oncanplay'.
						m_elm.onerror = reject;
						setTimeout(() => reject(new Error("Media reload timed out")), 5000); // Failsafe timeout.
					});

					// Restore the previous playback state.
					m_elm.currentTime = currentTime;
					if (wasPlaying) await m_elm.play();
					console.log("Media reloaded successfully.");
				},

				/**
				 * @description The main function to start the recording process.
				 * @param {number} rec_time_ms - The duration to record in milliseconds.
				 * @param {string} mime - The desired MIME type for the recording.
				 * @returns {Promise<Blob>} A promise that resolves with the recorded audio Blob.
				 */
				async start(rec_time_ms = 2000, mime = 'audio/webm') {
					// Guard against concurrent recordings.
					if (isRecording) {
						return Promise.reject('already_recording');
					}
                    isRecording = true;
					
					// Reset state for the new recording session.
					REC.audio_mime = mime;
					REC.audio_data = [];
				  
					try {
						const mediaElements = REC.get_media_elements();
						if (mediaElements.length === 0) {
							isRecording = false;
							return Promise.reject('no_media');
						}

						// This stream will collect audio tracks from all sources.
						const combinedStream = new MediaStream();
						let hasAudioTracks = false;
			  
						// --- Main Element Processing Loop ---
                                                for (const m_elm of mediaElements) {
                                                        try {
                                let elemToUse = m_elm;
                                if (await REC.isCorsSource(m_elm)) {
                                    elemToUse = REC.getOffscreenClone(m_elm);
                                }
                                // --- CRITICAL PASSTHROUGH LOGIC ---
                                // This block ensures the element's audio is not muted.
                                // We check if we've already set up the passthrough to avoid redundant work.
                                if (!elemToUse._auddPassthroughActive) {
                                    console.log("Setting up audio passthrough for element:", elemToUse);
                                    const passthroughCtx = new AudioContext();
                                    let source;
                                    try {
                                        // Attempt to create a source. This is where CORS errors occur.
                                        source = passthroughCtx.createMediaElementSource(elemToUse);
                                    } catch(err) {
                                        // If it's a security error, try the CORS reload workaround.
                                        if (err.name === 'SecurityError') {
                                            await REC._reloadMediaForCors(elemToUse);
                                            source = passthroughCtx.createMediaElementSource(elemToUse);
                                        } else { throw err; } // Re-throw other, unrecoverable errors.
                                    }
                                    // This line is the key: it routes the audio to the speakers.
                                    source.connect(passthroughCtx.destination);
                                    // Mark the element as processed so we don't do this again.
                                    elemToUse._auddPassthroughActive = true;
                                }

								// --- GET THE STREAM FOR THE RECORDER ---
								let streamForRecording;
                                                                if (elemToUse.captureStream) {
                                                                        streamForRecording = elemToUse.captureStream(); // Modern standard
                                                                } else if (elemToUse.mozCaptureStream) {
                                                                        streamForRecording = elemToUse.mozCaptureStream(); // Firefox-specific
                                                                } else {
                                    // Last resort fallback: create a new context just for streaming.
                                    const fallbackCtx = new AudioContext();
                                                                        const fallbackSource = fallbackCtx.createMediaElementSource(elemToUse);
                                    const destination = fallbackCtx.createMediaStreamDestination();
                                    fallbackSource.connect(destination);
                                                                        streamForRecording = destination.stream;
                                                                }
				
								// Add any found audio tracks to our main combined stream.
								if (streamForRecording && streamForRecording.getAudioTracks().length > 0) {
									streamForRecording.getAudioTracks().forEach(track => combinedStream.addTrack(track));
									hasAudioTracks = true;
								}
                                                        } catch(err) {
                                                                console.error("Failed to process audio for element, skipping:", elemToUse, err);
                                                        }
						}
			  
						// If, after checking all elements, we have no audio, abort.
						if (!hasAudioTracks) {
                            isRecording = false;
							return Promise.reject('no_media');
						}
			  
						// Create a single recorder for the combined stream.
						const recorder = new MediaRecorder(combinedStream, { mimeType: REC.audio_mime, audioBitsPerSecond: 128000 });
						REC.audio_recorder = recorder;
						
						// Set up event handlers and promises for a clean, asynchronous stop.
						const recorderStopped = new Promise(resolve => recorder.onstop = resolve);
						recorder.ondataavailable = REC.audio_rec_on_data;
						
						// Start recording, wait for the specified time, then stop.
						recorder.start();
						await wait(rec_time_ms);
						if (recorder.state === "recording") REC.stop();
						await recorderStopped; // Wait for onstop to ensure all data is collected.
			  
						return REC.audio_to_blob();

					} catch (error) {
						console.error("Critical error during recording start:", error);
						isRecording = false; // Ensure state is reset on error.
						throw error;
					}
				},
			};
			return { start: REC.start, stop: REC.stop };
		})();
		
		/**
		 * @description Callback function to send the recorded audio data back to the extension.
		 * @param {object} audio_buffer_obj - The result object containing status and data.
		 */
		var onDataAvailable = function(audio_buffer_obj) {
			console.log("Sending recorded data:", audio_buffer_obj);
			chrome.runtime.sendMessage({cmd: "firefox_ondataavailable", result: audio_buffer_obj});
		}
		
		/**
		 * @description Listens for commands (e.g., 'start', 'stop') from other parts of the extension.
		 */
		chrome.runtime.onMessage.addListener(
			function onMessage(request, sender, sendResponse) {
				console.log("Received command:", request);
				switch (request.cmd) {
					case 'to_firefox_start':
						REC.start(request.data).then(e => {
							var ret = {"status": 0, "data": e};
							// A sanity check on the blob size to catch empty recordings.
							if (!e || !e.size || e.size < 1000) { 
								console.log("Recorded blob is too small or empty:", e);
								ret = {"status": -1, "data": "audio none: can not record audio."};
							}
							onDataAvailable(ret);
						}).catch(e => {
							if (e === 'already_recording' || e === 'no_media') {
								if (e === 'no_media') chrome.runtime.sendMessage({ cmd: "frame_no_media" });
								return; // Gracefully handle expected rejections.
							}
							console.error("Recording failed:", e);
							if (e.message.includes('isolation properties')) {
								chrome.runtime.sendMessage({cmd: "popup_error", result: {"status": -1, "text": "Recording failed: Security features of this website isolate audio from extensions."}});
								return;
							}
							chrome.runtime.sendMessage({cmd: "popup_error", result: {"status": -1, "text": "An unexpected error occurred during recording: " + e}});
						});
						break;
					case 'to_firefox_stop':
						REC.stop();
						break;
				}
				// IMPORTANT: `return true` is essential to keep the message channel open for the
				// asynchronous response from the `REC.start()` Promise.
				return true;
			}
		);
	};

	// --- Injection Guard ---
	// This ensures the recorder logic is only injected and initialized once per page.
    if (window.AudDRecorder === undefined && !document.getElementById('audd-recorder-marker')) {
        // Use a marker element in the DOM as a secondary, more reliable check.
        const marker = document.createElement('div');
        marker.id = 'audd-recorder-marker';
        marker.style.display = 'none';
        document.body.appendChild(marker);
        
        window.AudDRecorder = AudDRecorder;
        console.log("injected firefox");
		AudDRecorder();
    } else {
        console.log("already injected in firefox");
    }

    return [];
}

audioRecorderFirefox();
