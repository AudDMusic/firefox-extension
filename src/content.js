// injected in Firefox

const offscreenClones = new Map();

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
                    for (const [orig, clone] of offscreenClones.entries()) {
                        clone.pause();
                        clone.remove();
                        chrome.runtime.sendMessage({
                            cmd: 'revoke_offscreen_element',
                            src: orig.currentSrc
                        });
                    }
                    offscreenClones.clear();
                    isRecording = false;
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
                                async isCorsSource(m_elm) {
                                    try {
                                        const src = m_elm.currentSrc || m_elm.src;
                                        if (!src) return false;
                                        const elemOrigin = new URL(src, document.baseURI).origin;
                                        if (elemOrigin !== document.location.origin) {
                                            return true;
                                        }
                                        const resp = await chrome.runtime.sendMessage({
                                            cmd: 'check_cors_redirect',
                                            src
                                        });
                                        return resp && resp.crossOrigin;
                                    } catch (e) {
                                        return false;
                                    }
                                },

                                async createOffscreenClone(elem) {
                                    if (offscreenClones.has(elem)) {
                                        return offscreenClones.get(elem);
                                    }
                                    const resp = await chrome.runtime.sendMessage({
                                        cmd: 'create_offscreen_element',
                                        src: elem.currentSrc
                                    });
                                    const clone = new Audio();
                                    clone.src = (resp && resp.blobUrl) ? resp.blobUrl : elem.currentSrc;
                                    clone.crossOrigin = 'anonymous';
                                    clone.volume = 0.02;
                                    clone.preload = 'auto';
                                    clone.currentTime = elem.currentTime;
                                    clone.style.display = 'none';
                                    (document.documentElement || document.body).appendChild(clone);
                                    await new Promise(resolve => {
                                        const onReady = () => {
                                            clone.play().catch(() => {});
                                            resolve();
                                        };
                                        if (clone.readyState >= 3) {
                                            onReady();
                                        } else {
                                            clone.addEventListener('canplay', onReady, { once: true });
                                        }
                                    });

                                    const cleanup = () => {
                                        clone.pause();
                                        clone.remove();
                                        offscreenClones.delete(elem);
                                        if (resp && resp.blobUrl) {
                                            chrome.runtime.sendMessage({
                                                cmd: 'revoke_offscreen_element',
                                                src: elem.currentSrc
                                            });
                                        }
                                    };
                                    elem.addEventListener('pause', cleanup, { once: true });
                                    elem.addEventListener('ended', cleanup, { once: true });
                                    window.addEventListener('pagehide', cleanup, { once: true });

                                    offscreenClones.set(elem, clone);
                                    return clone;
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
                                let elemForRecording = m_elm;
                                if (await REC.isCorsSource(m_elm)) {
                                    try {
                                        elemForRecording = await REC.createOffscreenClone(m_elm);
                                    } catch (cloneErr) {
                                        chrome.runtime.sendMessage({
                                            cmd: "offscreen_capture",
                                            src: m_elm.currentSrc,
                                            currentTime: m_elm.currentTime,
                                            duration: rec_time_ms
                                        });
                                        isRecording = false;
                                        return Promise.reject("cors_offscreen");
                                    }
                                }

                                // --- CRITICAL PASSTHROUGH LOGIC ---
                                // This block ensures the element's audio is not muted.
                                // We check if we've already set up the passthrough to avoid redundant work.
                                if (!elemForRecording._auddPassthroughActive) {
                                    console.log("Setting up audio passthrough for element:", elemForRecording);
                                    const passthroughCtx = new AudioContext();
                                    let source;
                                    try {
                                        // Attempt to create a source. This is where CORS errors occur.
                                        source = passthroughCtx.createMediaElementSource(elemForRecording);
                                    } catch(err) {
                                        if (err.name === 'SecurityError') {
                                            await REC._reloadMediaForCors(elemForRecording);
                                            source = passthroughCtx.createMediaElementSource(elemForRecording);
                                        } else { throw err; }
                                    }
                                    source.connect(passthroughCtx.destination);
                                    elemForRecording._auddPassthroughActive = true;
                                }

								// --- GET THE STREAM FOR THE RECORDER ---
                                                                let streamForRecording;
                                                                if (elemForRecording.captureStream) {
                                                                        streamForRecording = elemForRecording.captureStream(); // Modern standard
                                                                } else if (elemForRecording.mozCaptureStream) {
                                                                        streamForRecording = elemForRecording.mozCaptureStream(); // Firefox-specific
                                                                } else {
                                    // Last resort fallback: create a new context just for streaming.
                                    const fallbackCtx = new AudioContext();
                                                                        const fallbackSource = fallbackCtx.createMediaElementSource(elemForRecording);
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
                                                                console.error("Failed to process audio for element, skipping:", elemForRecording, err);
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
						// Promise for recorder error
						const recorderError = new Promise((resolve, reject) => {
							recorder.onerror = (event) => {
								console.error("MediaRecorder error in content.js:", event.error);
								REC.isRecording = false; // Reset REC's own state if different from global isRecording
								isRecording = false; // Reset global content script state
								reject(event.error || new Error("MediaRecorder failed in content.js"));
							};
						});

						recorder.ondataavailable = REC.audio_rec_on_data;
						
						recorder.start();

                        // Wait for recording time OR an error
                        await Promise.race([
                            wait(rec_time_ms), // Normal recording duration
                            recorderError      // Waits for an error from MediaRecorder
                        ]);

						// If recorderError won, an error was already thrown and caught by the outer .catch()
						// If wait(rec_time_ms) won, proceed to stop and collect data.
						if (recorder.state === "recording") {
							REC.stop(); // This will trigger onstop
						}
						await recorderStopped;
			  
						return REC.audio_to_blob();

					} catch (error) {
						console.error("Critical error during recording start or MediaRecorder error:", error);
						isRecording = false; // Ensure state is reset on error.
						isRecording = false; // Ensure state is reset on error, again.
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
						REC.start(request.data).then(e => { // `e` here is the blob
							var ret = {"status": 0, "data": e};
							// A sanity check on the blob size to catch empty recordings.
							if (!e || !e.size || e.size < 1000) { 
								console.log("Recorded blob is too small or empty:", e);
								ret = {"status": -1, "data": "audio none: can not record audio."};
							}
							onDataAvailable(ret); // Sends "firefox_ondataavailable"
						}).catch(e => { // This catches errors thrown from REC.start or rejections from recorder.onerror
							isRecording = false; // Ensure content script's global isRecording is false on error
							if (e === 'already_recording' || e === 'no_media' || e === 'cors_offscreen') {
								if (e === 'no_media') chrome.runtime.sendMessage({ cmd: "frame_no_media" });
								// These are somewhat expected, popup UI should handle them.
								return;
							}
							console.error("Recording failed in content.js promise chain:", e);
							let errorMessage = "An unexpected error occurred during recording.";
							if (e instanceof Error) {
								errorMessage = e.message;
							} else if (typeof e === 'string') {
								errorMessage = e;
							}

							if (errorMessage.includes('isolation properties')) {
								chrome.runtime.sendMessage({cmd: "popup_error", result: {"status": -1, "text": "Recording failed: Security features of this website isolate audio from extensions."}});
							} else {
								chrome.runtime.sendMessage({cmd: "popup_error", result: {"status": -1, "text": "Recording Error: " + errorMessage}});
							}
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
        // Inject a script in the main page context to hook media elements
        const hookScript = document.createElement("script");
        hookScript.id = "audd-headless-hook";
        hookScript.src = chrome.runtime.getURL("src/headless-hook.js");
        (document.head || document.documentElement).appendChild(hookScript);
        hookScript.remove();
        
        window.AudDRecorder = AudDRecorder;
        console.log("injected firefox");
		AudDRecorder();
    } else {
        console.log("already injected in firefox");
    }

    return [];
}

audioRecorderFirefox();
