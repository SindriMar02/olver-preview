/**
 * Home hero video modal. Plays with sound when the modal opens and stops when it
 * closes so audio doesn't keep running behind the page. Two kinds of video:
 * - Bunny Stream / MP4 (<video data-modal-video>): the source attaches on first open,
 *   so nothing downloads with the page. An .m3u8 plays natively in Safari and via
 *   hls.js elsewhere; if it can't play, the fallback MP4 is used.
 * - YouTube / Vimeo (ACF oEmbed iframe): autoplay=1 is added on open and the
 *   original src restored on close, which reloads the player.
 * The click that opens the modal is the user gesture browsers need for sound.
 * The hero background video pauses while the modal is open.
 * Markup lives in template-parts/home/home-hero-banner.php; styles in scss/custom.scss (.video-modal).
 */
(() => {
    "use strict";

    const HLS_SRC = "https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js";

    // Shared with the hero background video (hero-background-video.js) so hls.js only loads once
    const loadHls = () => {
        if (window.Hls) return Promise.resolve(window.Hls);
        if (!window.boomballHlsLoader) {
            window.boomballHlsLoader = new Promise((resolve) => {
                const script = document.createElement("script");
                script.src = HLS_SRC;
                script.async = true;
                script.onload = () => resolve(window.Hls || null);
                script.onerror = () => resolve(null);
                document.head.appendChild(script);
            });
        }
        return window.boomballHlsLoader;
    };

    const play = (video) => {
        // If a browser still refuses sound, the controls are there to start it by hand
        const attempt = video.play();
        if (attempt && attempt.catch) attempt.catch(() => {});
    };

    const setupVideo = (modal, video) => {
        const { modalVideo: type, src, fallback } = video.dataset;
        let attached = false;

        const playFile = (url) => {
            if (!url) return;
            video.src = url;
            play(video);
        };

        const attach = () => {
            attached = true;
            if (type !== "hls") {
                playFile(src);
                return;
            }
            if (video.canPlayType("application/vnd.apple.mpegurl")) {
                video.addEventListener("error", () => playFile(fallback), { once: true });
                playFile(src);
                return;
            }
            loadHls().then((Hls) => {
                if (!Hls || !Hls.isSupported()) {
                    playFile(fallback);
                    return;
                }
                const hls = new Hls({ capLevelToPlayerSize: true });
                hls.on(Hls.Events.ERROR, (event, data) => {
                    if (!data.fatal) return;
                    hls.destroy();
                    playFile(fallback);
                });
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    if (modal.classList.contains("show")) play(video);
                });
                hls.loadSource(src);
                hls.attachMedia(video);
            });
        };

        // show.bs.modal runs inside the opening click, so play() keeps its permission for sound
        modal.addEventListener("show.bs.modal", () => {
            if (attached) {
                play(video);
            } else {
                attach();
            }
        });
        // Each open starts from the beginning
        modal.addEventListener("hidden.bs.modal", () => {
            video.pause();
            video.currentTime = 0;
        });
    };

    const setupIframe = (modal, iframe) => {
        const baseSrc = iframe.getAttribute("src");
        if (!baseSrc) return;

        // YouTube and Vimeo both honour autoplay=1
        const autoplaySrc = baseSrc + (baseSrc.includes("?") ? "&" : "?") + "autoplay=1";

        modal.addEventListener("show.bs.modal", () => iframe.setAttribute("src", autoplaySrc));
        // Restoring the original src reloads the player, which stops playback
        modal.addEventListener("hidden.bs.modal", () => iframe.setAttribute("src", baseSrc));
    };

    // The hero background video is hidden behind the backdrop while the modal is open,
    // so it pauses to leave the bandwidth and CPU to the modal video, then picks up again.
    // It only resumes if it was playing (autoplay can be refused, e.g. in Low Power Mode).
    const pauseHeroBackground = (modal) => {
        const background = document.querySelector(".hero-banner__video");
        if (!background) return;
        let wasPlaying = false;

        modal.addEventListener("show.bs.modal", () => {
            wasPlaying = !background.paused;
            if (wasPlaying) background.pause();
        });
        modal.addEventListener("hidden.bs.modal", () => {
            if (wasPlaying) play(background);
        });
    };

    const setup = (modal) => {
        pauseHeroBackground(modal);
        const video = modal.querySelector("video[data-modal-video]");
        if (video) {
            setupVideo(modal, video);
            return;
        }
        const iframe = modal.querySelector("iframe");
        if (iframe) setupIframe(modal, iframe);
    };

    const initialize = () => {
        document.querySelectorAll("[data-video-modal]").forEach((modal) => {
            if (!modal.dataset.videoReady) {
                modal.dataset.videoReady = "true";
                setup(modal);
            }
        });
    };
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
