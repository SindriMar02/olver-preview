/** At most one click-loaded player exists across all card sections. */
(() => {
    "use strict";
    let active = null;
    const stop = () => {
        if (!active) return;
        const { media, frame, observer } = active;
        observer?.disconnect();
        frame.remove(); // Releases playback, network activity and decoder resources.
        media.classList.remove("is-playing");
        active = null;
    };
    document.addEventListener("click", event => {
        const link = event.target.closest(".bb-card-video__play");
        if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        const media = link.closest("[data-card-video]");
        event.preventDefault();
        stop();
        const frame = document.createElement("iframe");
        frame.title = link.getAttribute("aria-label");
        frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
        frame.allowFullscreen = true;
        frame.referrerPolicy = "strict-origin-when-cross-origin";
        frame.src = "https://www.youtube-nocookie.com/embed/" + media.dataset.cardVideo + "?autoplay=1&playsinline=1&rel=0";
        media.append(frame);
        media.classList.add("is-playing");
        const observer = window.IntersectionObserver ? new IntersectionObserver(entries => {
            if (active?.frame === frame && entries[0].intersectionRatio < 0.15 && !document.fullscreenElement) stop();
        }, { threshold: [0, 0.15] }) : null;
        active = { media, frame, observer };
        observer?.observe(media);
        frame.focus({ preventScroll: true });
    });
    document.addEventListener("bb:card-covered", event => {
        if (active && event.target.contains(active.media)) stop();
    });
    document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
    window.addEventListener("pagehide", stop);
})();
