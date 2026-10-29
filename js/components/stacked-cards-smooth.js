/** Sticky card stack: CSS sticks each card as it scrolls up; this untwists each card's tilt on the way. */
(() => {
    "use strict";
    const defaults = {
        tilt: 2.5 // Starting rotation (deg). Cards alternate direction: right, left, right…
    };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const cover = card => card.dispatchEvent(new CustomEvent("bb:card-covered", { bubbles: true }));

    class SmoothStack {
        constructor(root) {
            this.root = root;
            this.slots = Array.from(root.querySelectorAll("[data-smooth-stack-card]"));
            this.cards = this.slots.map(slot => slot.firstElementChild);
            this.captions = this.slots.map(slot => slot.querySelector(".bb-smooth-stack-card__caption"));
            const tilt = parseFloat(root.dataset.stackTilt);
            this.tilt = Number.isFinite(tilt) ? tilt : defaults.tilt;
            this.rests = [];
            this.stuck = this.slots.map(() => false);
            this.angles = this.slots.map(() => null);
            this.frame = null;

            const schedule = () => this.schedule();
            const remeasure = () => { this.measure(); this.schedule(); };
            window.addEventListener("scroll", schedule, { passive: true });
            window.addEventListener("resize", remeasure, { passive: true });
            reducedMotion.addEventListener("change", schedule);
            // Captions rewrap with the width and with late fonts; the header shrinks once the page scrolls.
            this.header = document.querySelector(".sticky-top");
            if (window.ResizeObserver) {
                const observer = new ResizeObserver(remeasure);
                [this.header, this.header?.querySelector(".nav-row"), ...this.captions].filter(Boolean)
                    .forEach(element => observer.observe(element));
            }
            remeasure();
        }

        // Layout reads that only change on resize: where the header ends, where each card sticks, and
        // the captions, which the CSS uses to keep every stuck card short enough to fit on screen.
        measure() {
            // Where the header's visible surface ends. --header-height keeps the taller, unscrolled
            // header (the hero needs that), so the cards would otherwise stick too far below the
            // slimmer scrolled nav.
            if (this.header) {
                const surfaces = [this.header.querySelector(".nav-row"), this.header.querySelector(".cta-top-banner")].filter(Boolean);
                const bottom = Math.max(0, ...(surfaces.length ? surfaces : [this.header]).map(element => element.getBoundingClientRect().bottom));
                if (Math.abs((parseFloat(this.root.style.getPropertyValue("--bb-ss-header")) || 0) - bottom) > 0.5) {
                    this.root.style.setProperty("--bb-ss-header", bottom + "px");
                }
            }
            const caption = Math.max(0, ...this.captions.map(box => box ? box.offsetHeight : 0));
            if (Math.abs((parseFloat(this.root.style.getPropertyValue("--bb-ss-caption")) || 0) - caption) > 1) {
                this.root.style.setProperty("--bb-ss-caption", caption + "px");
            }
            this.rests = this.slots.map(slot => parseFloat(getComputedStyle(slot).top) || 0);
            // How far below the first stuck card's top the lowest caption ends, beyond its image:
            // each card rests a step lower, so the card that needs the most room is not always
            // the one with the tallest caption. The CSS sizes the deck so that card still fits.
            // The last card is left out: it never waits stuck, but carries on rising over the
            // stack, so it can land partly below the screen and come into view on its way up.
            const first = this.rests[0] || 0;
            const waiting = this.slots.length > 1 ? this.slots.slice(0, -1) : this.slots;
            const reserve = Math.max(0, ...waiting.map((slot, index) =>
                (this.rests[index] || 0) - first + (this.captions[index] ? this.captions[index].offsetHeight : 0)));
            if (Math.abs((parseFloat(this.root.style.getPropertyValue("--bb-ss-reserve")) || 0) - reserve) > 1) {
                this.root.style.setProperty("--bb-ss-reserve", reserve + "px");
            }
        }

        schedule() {
            if (this.frame !== null) return;
            this.frame = requestAnimationFrame(() => {
                this.frame = null;
                this.update();
            });
        }

        // Each card holds its full tilt until its top enters the screen, then turns straight in
        // step with the scroll, level by the time it is centred (or reaches its sticking point,
        // whichever comes first). It rises the rest of the way flat.
        update() {
            const viewport = window.innerHeight;
            const still = reducedMotion.matches;
            this.slots.forEach((slot, index) => {
                const rect = slot.getBoundingClientRect();
                const rest = this.rests[index] || 0;
                const level = Math.max(rest, (viewport - rect.height) / 2);
                const progress = Math.min(1, Math.max(0, (rect.top - level) / Math.max(1, viewport - level)));
                const angle = still ? 0 : (index % 2 ? -1 : 1) * this.tilt * progress;
                const rounded = Math.round(angle * 1000) / 1000;
                if (rounded !== this.angles[index]) {
                    this.angles[index] = rounded;
                    this.cards[index].style.rotate = rounded ? rounded + "deg" : "";
                }
                // A card that sticks covers the one beneath it, which stops any video playing there.
                const stuck = rect.top <= rest + 1;
                if (stuck && !this.stuck[index] && index > 0) cover(this.slots[index - 1]);
                this.stuck[index] = stuck;
            });
        }
    }

    const init = () => document.querySelectorAll("[data-smooth-stack]").forEach(root => new SmoothStack(root));
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
})();
