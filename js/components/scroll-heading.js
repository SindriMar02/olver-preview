/** Stagger words into a moving line while the page keeps its natural scroll. */
(() => {
    "use strict";

    const motion = window.gsap;
    const ScrollTrigger = window.ScrollTrigger;
    if (!motion || !ScrollTrigger) {
        document.documentElement.classList.remove("bb-heading-loading");
        return;
    }
    motion.registerPlugin(ScrollTrigger);

    let refreshFrame = null;
    const refreshLayout = () => {
        if (refreshFrame !== null) return;
        refreshFrame = requestAnimationFrame(() => {
            refreshFrame = null;
            ScrollTrigger.refresh(true);
        });
    };

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const settings = {
        scrub: 0.6,
        enterAt: 1,
        finishAt: 0.18,
        headerGap: 32,
        // Where the first word's centre rises, as a fraction of the line width.
        firstWordAt: 0.45,
        wordRise: 125,
        moveStart: 0.04,
        wordDuration: 0.34,
        firstWordDuration: 0.24,
        wordEase: "back.out(0.8)"
    };
    // Ease into the rise before the small overshoot. A plain back.out spends
    // most of its movement at the start, even when its duration is extended.
    const settleEase = motion.parseEase(settings.wordEase);
    const wordEase = (progress) => settleEase(progress * progress);

    class ScrollHeading {
        constructor(root) {
            this.root = root;
            this.window = root.querySelector("[data-heading-window]");
            this.track = root.querySelector("[data-heading-track]");
            this.words = Array.from(root.querySelectorAll("[data-heading-word]"));
            this.header = document.querySelector(".sticky-top");
            if (!this.window || !this.track || !this.words.length) return;

            this.context = null;
            this.frame = null;
            this.layout();
            reducedMotion.addEventListener("change", () => this.scheduleLayout());

            // Transforms do not resize these boxes. Toolbar-height changes therefore
            // leave the timeline intact; only actual width/font changes rebuild it.
            if (window.ResizeObserver) {
                let size = this.size();
                this.observer = new ResizeObserver(() => {
                    const next = this.size();
                    if (next === size) return;
                    size = next;
                    this.scheduleLayout();
                });
                [this.window, this.track].forEach((element) => this.observer.observe(element));
            } else {
                window.addEventListener("resize", () => this.scheduleLayout(), { passive: true });
                if (document.fonts) document.fonts.ready.then(() => this.scheduleLayout());
            }
        }

        size() {
            return [this.window.clientWidth, this.track.offsetWidth, this.track.offsetHeight].join(":");
        }

        scheduleLayout() {
            if (this.frame !== null) return;
            this.frame = requestAnimationFrame(() => {
                this.frame = null;
                this.layout();
            });
        }

        layout() {
            if (this.context) this.context.revert();
            this.context = null;
            this.root.classList.remove("is-enhanced", "is-animating");
            refreshLayout();
            if (reducedMotion.matches) return;

            this.root.classList.add("is-enhanced");
            // Read geometry once, before creating any transforms. Nothing in the
            // animation's update path reads layout, adds nodes, or writes scrollY.
            const style = getComputedStyle(this.window);
            const available = this.window.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
            // Start the track shifted so the first word rises just left of centre,
            // giving it the full half-width of travel before it leaves the view.
            const firstWord = this.words[0];
            const inset = Math.max(0, Math.min(available - firstWord.offsetWidth,
                available * settings.firstWordAt - firstWord.offsetLeft - firstWord.offsetWidth / 2));
            const endX = Math.min(0, available - this.track.offsetWidth);
            const travel = inset - endX;
            const fontSize = parseFloat(getComputedStyle(this.track).fontSize);
            // Long copy travels farther in the same visible portion of the page.
            // Let each word settle within a fraction of the viewport's travel,
            // so it cannot cross the screen while still below the mask.
            const wordDuration = Math.min(settings.wordDuration,
                (1 - settings.moveStart) * available * 0.42 / travel);
            // The first word starts near the left edge; its shorter rise lets it
            // become readable before the track carries it out of the viewport.
            const durations = this.words.map((word, index) => index === 0 ?
                Math.min(wordDuration, settings.firstWordDuration) : wordDuration);
            const stagger = Math.min(0.075, 0.3 / Math.max(1, this.words.length - 1));
            // Begin each later word just before it reaches the right edge. Waiting
            // until it is already inside leaves a blank gap after the previous word.
            const entryEdge = available + fontSize * 0.3;
            const starts = this.words.map((word, index) => Math.min(1 - durations[index],
                Math.max(index * stagger, settings.moveStart + (1 - settings.moveStart) *
                    (word.offsetLeft + inset - entryEdge) / travel)));

            this.context = motion.context(() => {
                const timeline = motion.timeline({ paused: true });
                timeline.fromTo(this.track, { x: inset }, {
                    x: endX, duration: 1 - settings.moveStart, ease: "none"
                }, settings.moveStart);
                this.words.forEach((word, index) => {
                    timeline.fromTo(word, { x: fontSize * 0.22, yPercent: settings.wordRise }, {
                        x: 0,
                        yPercent: 0,
                        duration: durations[index],
                        ease: wordEase
                    }, starts[index]);
                });

                ScrollTrigger.create({
                    trigger: this.window,
                    start: "clamp(top " + settings.enterAt * 100 + "%)",
                    // Use more of the visible scroll distance for a calmer pace.
                    // Measure on refresh, not scroll, and keep the endpoint below
                    // the navigation even on short screens or with a CTA banner.
                    end: () => {
                        // Use its sticky position so restored scroll positions do
                        // not change the finish point compared with a fresh load.
                        const headerBottom = this.header ? this.header.offsetHeight +
                            (parseFloat(getComputedStyle(this.header).top) || 0) : 0;
                        const finish = Math.max(window.innerHeight * settings.finishAt,
                            headerBottom + settings.headerGap);
                        return "clamp(top " + finish + "px)";
                    },
                    animation: timeline,
                    scrub: settings.scrub,
                    onToggle: (self) => {
                        if (self.isActive) this.root.classList.add("is-animating");
                    },
                    onScrubComplete: (self) => {
                        if (!self.isActive) this.root.classList.remove("is-animating");
                    }
                });
            }, this.root);
        }
    }

    const init = () => {
        document.querySelectorAll("[data-scroll-heading]").forEach((root) => new ScrollHeading(root));
        document.documentElement.classList.remove("bb-heading-loading");
        // The Tickets feed changes the position of the heading when filtering or
        // loading dates. Reuse its existing content notification, without observing scroll.
        document.addEventListener("reveal:refresh", refreshLayout);
        // Content above this component can settle after our display font is ready.
        // Refresh positions for those layout changes, without rebuilding the words.
        if (document.fonts) document.fonts.ready.then(refreshLayout);
        if (document.readyState !== "complete") {
            window.addEventListener("load", refreshLayout, { once: true });
        }
        if (window.ResizeObserver) {
            let height = document.body.offsetHeight;
            const observer = new ResizeObserver(() => {
                const next = document.body.offsetHeight;
                if (next === height) return;
                height = next;
                refreshLayout();
            });
            observer.observe(document.body);
        }
    };
    const ready = () => {
        const track = document.querySelector("[data-heading-track]");
        if (!track || !document.fonts) return init();
        // Do not paint or measure the fallback font. Bound the wait so a failed
        // font request cannot leave the heading hidden indefinitely.
        Promise.race([
            document.fonts.load("400 32px " + getComputedStyle(track).fontFamily).catch(() => {}),
            new Promise((resolve) => setTimeout(resolve, 1800))
        ]).then(init);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready, { once: true });
    else ready();
})();
