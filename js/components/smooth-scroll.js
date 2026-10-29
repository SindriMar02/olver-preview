/** Smooth desktop wheel input while retaining the real window scroll position. */
(() => {
    "use strict";

    const motion = window.gsap;
    if (!motion || !window.ScrollToPlugin) return;
    motion.registerPlugin(window.ScrollToPlugin);

    const settings = {
        scope: null, // Whole page; use a selector such as "#home-innings" to compare section-only behavior.
        duration: 0.65,
        minDuration: 0.12,
        fullDurationDistance: 400, // CSS pixels of remaining travel; shorter moves settle sooner.
        ease: "power3.out",
        lineStep: 40
    };
    const enabled = window.matchMedia(
        "(min-width: 992px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)"
    );
    const root = document.documentElement;
    let tween = null;
    let targetY = window.scrollY;
    let direction = 0;

    const stop = () => {
        if (tween) tween.kill();
        tween = null;
        direction = 0;
        targetY = window.scrollY;
        root.classList.remove("bb-is-wheel-scrolling");
    };

    const needsNativeScroll = (element) => {
        if (element.closest("input, textarea, select, [contenteditable], [data-native-scroll]")) return true;

        // Leave nested scrolling and its boundary behavior to the browser.
        for (let node = element; node && node !== document.body && node !== root; node = node.parentElement) {
            const overflow = getComputedStyle(node).overflowY;
            if (/auto|scroll|overlay/.test(overflow) && node.scrollHeight > node.clientHeight) return true;
        }
        return [root, document.body].some((node) => /hidden|clip/.test(getComputedStyle(node).overflowY));
    };

    window.addEventListener("wheel", (event) => {
        const element = event.target;
        // Native wheel scrolling until load: the browser only cancels its reload/back
        // scroll restoration after a user scroll, and a scripted one doesn't count.
        if (document.readyState !== "complete" ||
            !enabled.matches || event.defaultPrevented || !event.cancelable ||
            event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
            !event.deltaY || Math.abs(event.deltaX) >= Math.abs(event.deltaY) ||
            !(element instanceof Element) ||
            (settings.scope && !element.closest(settings.scope)) || needsNativeScroll(element)) {
            stop();
            return;
        }

        const unit = event.deltaMode === 1 ? settings.lineStep : event.deltaMode === 2 ? window.innerHeight : 1;
        const delta = event.deltaY * unit;
        const nextDirection = Math.sign(delta);
        const currentY = window.scrollY;
        const baseY = tween && direction === nextDirection ? targetY : currentY;
        const maxY = Math.max(0, document.scrollingElement.scrollHeight - window.innerHeight);
        targetY = Math.max(0, Math.min(maxY, baseY + delta));
        if (Math.abs(targetY - currentY) < 0.5) {
            stop();
            return;
        }

        event.preventDefault();
        if (tween) tween.kill();
        direction = nextDirection;
        root.classList.add("bb-is-wheel-scrolling");
        const distance = Math.abs(targetY - currentY);
        tween = motion.to(window, {
            scrollTo: { y: targetY, autoKill: true, onAutoKill: stop },
            duration: Math.min(settings.duration, Math.max(
                settings.minDuration,
                settings.duration * distance / settings.fullDurationDistance
            )),
            ease: settings.ease,
            onComplete: stop
        });
    }, { passive: false });

    // New input always takes priority over the remaining wheel animation.
    ["keydown", "pointerdown", "touchstart", "resize", "blur", "pagehide"].forEach((event) => {
        window.addEventListener(event, stop, { passive: true });
    });
    document.addEventListener("visibilitychange", stop);
    enabled.addEventListener("change", stop);
})();
