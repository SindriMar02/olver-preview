/**
 * One-shot reveal animations, driven by classes so they can be used anywhere.
 * Each element animates the first time it enters the viewport (which is on
 * page load for anything above the fold) and never again.
 *
 *   .reveal-up        fades in, rises 10px past its resting spot, then drops
 *                     back down. For headings, copy, buttons.
 *   .reveal-delay-N   holds .reveal-up for N * 0.15s (N = 1..6), so a title
 *                     and its paragraph can be staggered. For a custom hold
 *                     use data-reveal-delay="0.5" (seconds) instead.
 *   .reveal-down      fades in while sliding down 24px into place. Takes the
 *                     delay classes.
 *   .reveal-pop       pops on and shrinks from 120% to full size, the way the
 *                     button lands in the homepage "Meet the Teams" section.
 *                     Takes the same delay classes as .reveal-up.
 *   .reveal-words     fades its text in one word at a time, in order. Words
 *                     are wrapped in spans at runtime; inline tags such as
 *                     <br> or a coloured <span> are kept. Takes the delay classes.
 *   .reveal-zoom      an image frame that starts clipped in by --reveal-inset
 *                     on every side, with the image scaled down to match, and
 *                     grows out to full bleed. The image is held invisible by
 *                     the stylesheet until its start state is set, then fades
 *                     in quickly before the zoom begins, and the zoom waits for
 *                     the image file to load so it never pops in mid-motion.
 *                     Plays once, like the other reveals. Composes with the
 *                     page-title parallax, which moves the <img> on y; this
 *                     tweens scale.
 *   .reveal-slide     for list rows (event feed, team roster). Fades in while
 *                     sliding 30px into its resting spot. Full-width rows
 *                     slide in leftwards (from the right); in a two-column
 *                     grid the left column slides in from the left and the
 *                     right column from the right. data-reveal-motion="up" swaps the sideways
 *                     move for the .reveal-up rise instead. Siblings that show
 *                     together are staggered a little (siblings by default;
 *                     set data-reveal-group on an ancestor to stagger rows
 *                     that don't share a parent). Rows that scroll in later
 *                     start right away. Fades up to the row's own CSS opacity
 *                     (dimmed past events stay dimmed) and clears its inline
 *                     styles afterwards, adding `is-revealed`, so CSS hover
 *                     effects and opacity rules apply again.
 *
 * inc/core/reveal.php adds `reveal-js` to <html> before first paint so the SCSS can
 * hold the resting-hidden state until GSAP takes over. Content inserted later
 * (AJAX) can dispatch `reveal:refresh` on document to animate its new elements.
 * `window.boomballReveal.up(element, { speed })` plays the .reveal-up motion on
 * demand, for things that appear without scrolling (the ticket map popups);
 * speed 2 runs it twice as fast.
 */
(() => {
    "use strict";

    const root = document.documentElement;
    const motion = window.gsap;
    const ScrollTrigger = window.ScrollTrigger;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!motion || !ScrollTrigger || reducedMotion.matches) {
        // Nothing will animate, so make sure nothing stays hidden.
        root.classList.remove("reveal-js");
        return;
    }
    motion.registerPlugin(ScrollTrigger);

    const DELAY_STEP = 0.15;
    const SLIDE_STEP = 0.12; // gap between sibling rows that reveal together
    const START = "top 90%";

    const delayFor = (element) => {
        const custom = parseFloat(element.dataset.revealDelay);
        if (!Number.isNaN(custom)) return custom;
        const step = Array.from(element.classList).find((name) => /^reveal-delay-\d+$/.test(name));
        return step ? parseInt(step.split("-").pop(), 10) * DELAY_STEP : 0;
    };

    // A paused timeline that a trigger plays the first time the element shows.
    // The hold is placed inside the timeline so it can't be lost by the trigger.
    const onceInView = (element) => {
        const timeline = motion.timeline({ paused: true });
        ScrollTrigger.create({ trigger: element, start: START, once: true, onEnter: () => timeline.play() });
        return timeline;
    };

    // The .reveal-up motion on a timeline, starting at `at` seconds; `speed`
    // divides the durations (1 = the standard 0.8s, 2 = 0.4s)
    const upMotion = (timeline, element, at, speed = 1) => timeline
        .to(element, { autoAlpha: 1, y: -10, duration: 0.35 / speed, ease: "power2.out" }, at)
        .to(element, { y: 0, duration: 0.45 / speed, ease: "power2.inOut" }, at + 0.35 / speed);

    const revealUp = (element) => {
        motion.set(element, { autoAlpha: 0, y: 24 });
        upMotion(onceInView(element), element, delayFor(element));
    };

    // Play .reveal-up immediately (no scroll trigger), e.g. on popup content
    const playUp = (element, { speed = 1 } = {}) => {
        motion.set(element, { autoAlpha: 0, y: 24 });
        upMotion(motion.timeline(), element, 0, speed);
    };
    window.boomballReveal = { up: playUp };

    const revealDown = (element) => {
        motion.set(element, { autoAlpha: 0, y: -30 });
        onceInView(element)
            .to(element, { autoAlpha: 1, y: 0, duration: 1.5, ease: "power2.out" }, delayFor(element));
    };

    const revealPop = (element) => {
        const at = delayFor(element);
        motion.set(element, { autoAlpha: 0, scale: 1.2, transformOrigin: "50% 50%" });
        onceInView(element)
            .to(element, { autoAlpha: 1, duration: 0.1, ease: "none" }, at)
            .to(element, { scale: 1, duration: 0.83, ease: "expo.out" }, at);
    };

    // Wrap each word of an element's text in a span, leaving inline tags intact.
    const wrapWords = (root) => {
        const words = [];
        const walk = (node) => {
            Array.from(node.childNodes).forEach((child) => {
                if (child.nodeType === Node.ELEMENT_NODE) return walk(child);
                if (child.nodeType !== Node.TEXT_NODE || !child.textContent.trim()) return;
                const fragment = document.createDocumentFragment();
                child.textContent.split(/(\s+)/).forEach((part) => {
                    if (!part) return;
                    if (!part.trim()) return fragment.appendChild(document.createTextNode(part));
                    const word = document.createElement("span");
                    word.className = "reveal-word";
                    word.textContent = part;
                    fragment.appendChild(word);
                    words.push(word);
                });
                child.replaceWith(fragment);
            });
        };
        walk(root);
        return words;
    };

    const revealWords = (element) => {
        const words = wrapWords(element);
        if (!words.length) return;
        // Hide the words, then show the container the stylesheet was holding hidden.
        motion.set(words, { autoAlpha: 0 });
        motion.set(element, { autoAlpha: 1 });
        onceInView(element)
            .to(words, { autoAlpha: 1, duration: 0.2, ease: "power1.out", stagger: 0.3 }, delayFor(element));
    };

    const revealZoom = (frame) => {
        const image = frame.querySelector("img");
        const inset = () => parseFloat(getComputedStyle(frame).getPropertyValue("--reveal-inset")) || 0;
        // Scale the image so its edges sit just inside the clipped frame, whatever
        // the frame's width, so the picture itself grows rather than being unveiled.
        const startScale = () => 1 - Math.max(0, 2 * inset() - 4) / frame.offsetWidth;

        const at = delayFor(frame);
        motion.set(frame, { clipPath: () => `inset(${inset()}px)` });
        // The stylesheet keeps the image at opacity 0 until this runs, so the
        // scale (and the parallax's first y offset) are applied unseen
        if (image) motion.set(image, { scale: startScale, transformOrigin: "50% 50%", autoAlpha: 0 });

        // Quick fade first, with the zoom starting just before it completes
        const timeline = motion.timeline({ paused: true });
        const zoomAt = at + (image ? 0.2 : 0);
        if (image) timeline.to(image, { autoAlpha: 1, duration: 0.3, ease: "power1.out" }, at);
        timeline.to(frame, { clipPath: "inset(0px)", duration: 1.2, ease: "expo.out" }, zoomAt);
        if (image) timeline.to(image, { scale: 1, duration: 1.2, ease: "expo.out" }, zoomAt);

        // Play once the frame is in view AND the image has loaded (3s cap so a
        // slow image can't hold the reveal back indefinitely). One-shot: it
        // doesn't replay when scrolling back up to the frame.
        let inView = false;
        let played = false;
        let ready = !image || image.complete;
        const maybePlay = () => {
            if (inView && ready && !played) {
                played = true;
                timeline.play();
            }
        };
        ScrollTrigger.create({
            trigger: frame,
            start: START,
            once: true,
            onEnter: () => { inView = true; maybePlay(); },
        });
        if (!ready) {
            const done = () => { ready = true; maybePlay(); };
            image.addEventListener("load", done, { once: true });
            image.addEventListener("error", done, { once: true });
            window.setTimeout(done, 3000);
        }
    };

    // One state per parent list so its rows queue behind each other
    const slideGroups = new WeakMap();
    const revealSlide = (element) => {
        const parent = element.parentElement;
        const group = element.closest("[data-reveal-group]") || parent;
        if (!slideGroups.has(group)) slideGroups.set(group, { nextAt: 0 });
        const state = slideGroups.get(group);

        // 1 = left-to-right, -1 = right-to-left. Full-width or centred rows (e.g. a
        // max-width .container) and the right column of a two-column grid come
        // from the right; the left column from the left.
        const direction = () => {
            const row = element.getBoundingClientRect();
            const box = parent.getBoundingClientRect();
            const fullWidth = row.width >= box.width - 1;
            const rightOrCentre = row.left + row.width / 2 >= box.left + box.width / 2 - 1;
            return fullWidth || rightOrCentre ? -1 : 1;
        };

        // The opacity the stylesheet gives this row once revealed (e.g. 0.4 for past events)
        const restingOpacity = () => {
            element.classList.add("is-revealed");
            const value = parseFloat(getComputedStyle(element).opacity);
            element.classList.remove("is-revealed");
            return Number.isNaN(value) ? 1 : value;
        };

        // Read it before the inline hide below, which would otherwise be what we measure
        const targetOpacity = restingOpacity();

        // Rows carry a CSS transition on transform for their hover lift; while
        // GSAP drives the transform that transition would lag every frame, so
        // it's suspended inline until the slide completes
        motion.set(element, { autoAlpha: 0, x: 0, transition: "none" });
        ScrollTrigger.create({
            trigger: element,
            start: START,
            once: true,
            onEnter: () => {
                // Start no sooner than SLIDE_STEP after the previous sibling started
                const now = performance.now() / 1000;
                const at = Math.max(now, state.nextAt);
                state.nextAt = at + SLIDE_STEP;
                const dir = direction();
                const timeline = motion.timeline({ delay: at - now + delayFor(element) });
                if (element.dataset.revealMotion === "up") {
                    // The .reveal-up rise: from 24px below, up past rest by 10px, then settle
                    timeline
                        .fromTo(element, { autoAlpha: 0, y: 24 }, { autoAlpha: targetOpacity, y: -10, duration: 0.35, ease: "power2.out" })
                        .to(element, { y: 0, duration: 0.45, ease: "power2.inOut" });
                } else {
                    // Fade in while sliding 30px in the travel direction into place
                    timeline.fromTo(element, { autoAlpha: 0, x: -30 * dir }, { autoAlpha: targetOpacity, x: 0, duration: 0.5, ease: "power2.out" });
                }
                timeline.call(() => {
                    // Hand opacity and transform back to the stylesheet
                    element.classList.add("is-revealed");
                    motion.set(element, { clearProps: "transform,opacity,visibility,transition" });
                });
            },
        });
    };

    const initialize = () => {
        document.querySelectorAll(".reveal-up").forEach((element) => {
            if (element.dataset.revealReady) return;
            element.dataset.revealReady = "true";
            revealUp(element);
        });
        document.querySelectorAll(".reveal-down").forEach((element) => {
            if (element.dataset.revealReady) return;
            element.dataset.revealReady = "true";
            revealDown(element);
        });
        document.querySelectorAll(".reveal-pop").forEach((element) => {
            if (element.dataset.revealReady) return;
            element.dataset.revealReady = "true";
            revealPop(element);
        });
        document.querySelectorAll(".reveal-words").forEach((element) => {
            if (element.dataset.revealReady) return;
            element.dataset.revealReady = "true";
            revealWords(element);
        });
        document.querySelectorAll(".reveal-zoom").forEach((frame) => {
            if (frame.dataset.revealReady) return;
            frame.dataset.revealReady = "true";
            revealZoom(frame);
        });
        document.querySelectorAll(".reveal-slide").forEach((element) => {
            if (element.dataset.revealReady || element.closest(".leaflet-popup")) return;
            element.dataset.revealReady = "true";
            revealSlide(element);
        });
    };
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
    // Rows added after load (e.g. the events feed filter / load more)
    document.addEventListener("reveal:refresh", initialize);
})();
