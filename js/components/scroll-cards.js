/** CSS pins the desktop stage; GSAP reveals the cards while mobile stays in normal flow. */
(() => {
    "use strict";

    const motion = window.gsap;
    const ScrollTrigger = window.ScrollTrigger;
    if (!motion || !ScrollTrigger) return;
    motion.registerPlugin(ScrollTrigger);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    class ScrollCards {
        constructor(root) {
            this.root = root;
            this.viewport = root.querySelector("[data-scroll-viewport]");
            this.intro = root.querySelector("[data-scroll-intro]");
            this.rail = root.querySelector("[data-scroll-rail]");
            this.track = root.querySelector("[data-scroll-track]");
            this.cards = Array.from(root.querySelectorAll("[data-scroll-card]"));
            this.context = null;
            this.trigger = null;
            this.frame = null;
            this.pendingLayout = false;
            this.touching = false;
            this.emphasis = [];
            this.emphasisFrame = null;

            this.layout();
            reducedMotion.addEventListener("change", () => this.scheduleLayout());
            window.addEventListener("resize", () => {
                const heightChange = Math.abs(window.innerHeight - this.viewportHeight);
                if (window.innerWidth === this.viewportWidth && (!heightChange ||
                    (ScrollTrigger.isTouch === 1 && heightChange < this.viewportHeight * 0.25))) return;
                this.scheduleLayout();
            }, { passive: true });
            window.addEventListener("touchstart", () => { this.touching = true; }, { passive: true });
            ["touchend", "touchcancel"].forEach((name) => window.addEventListener(name, (event) => {
                this.touching = !!(event.touches && event.touches.length);
                if (this.pendingLayout) this.scheduleLayout();
            }, { passive: true }));
            ScrollTrigger.addEventListener("scrollEnd", () => {
                if (this.pendingLayout) this.scheduleLayout();
            });
            this.root.addEventListener("focusin", (event) => this.revealFocus(event.target));
            if (document.fonts) document.fonts.ready.then(() => this.scheduleLayout());

            if (window.ResizeObserver) {
                let size = "";
                this.observer = new ResizeObserver(() => {
                    const next = [this.rail.clientWidth, this.rail.clientHeight,
                        this.track.scrollHeight, this.intro.scrollHeight].join(":");
                    if (next === size) return;
                    size = next;
                    this.scheduleLayout();
                });
                [this.rail, this.track, this.intro].forEach((element) => this.observer.observe(element));
            }
        }

        scheduleLayout() {
            this.pendingLayout = true;
            if (this.frame !== null || this.touching || ScrollTrigger.isScrolling()) return;
            this.frame = requestAnimationFrame(() => {
                this.frame = null;
                if (this.touching || ScrollTrigger.isScrolling()) return;
                this.pendingLayout = false;
                this.layout();
            });
        }

        layout() {
            this.viewportWidth = window.innerWidth;
            this.viewportHeight = window.innerHeight;
            if (this.emphasisFrame !== null) cancelAnimationFrame(this.emphasisFrame);
            this.emphasisFrame = null;
            this.emphasis = [];
            if (this.context) this.context.revert();
            this.context = null;
            this.trigger = null;
            this.root.classList.remove("is-enhanced", "is-mobile-flow");
            this.root.style.removeProperty("--bb-scroll-distance");
            this.root.style.removeProperty("--bb-scroll-exit-clearance");
            if (reducedMotion.matches || this.cards.length < 2) return;

            this.root.classList.add("is-enhanced");
            const style = getComputedStyle(this.root);
            const desktop = style.getPropertyValue("--bb-scroll-layout").trim() === "columns";
            this.scrollSpeed = desktop ? Math.max(1, parseFloat(style.getPropertyValue("--bb-card-scroll-speed")) || 1) : 1;
            this.railHeight = this.rail.clientHeight;
            this.top = parseFloat(getComputedStyle(this.viewport).top) || 0;
            this.pinOffset = parseFloat(getComputedStyle(this.root.firstElementChild).paddingTop) || 0;
            this.introDistance = desktop ? 0 : this.intro.offsetHeight +
                (parseFloat(getComputedStyle(this.intro).marginBottom) || 0);
            // The track and frame start together as the first card enters the viewport.
            this.revealLead = Math.max(0, this.railHeight - this.introDistance);
            // Retain clearance beneath the final caption in either layout.
            const exitRise = Math.min(parseFloat(style.getPropertyValue("--bb-card-exit-rise")) || 0,
                this.railHeight * 0.2);
            const exitOffset = Math.min(0, this.railHeight - this.track.scrollHeight - exitRise);
            this.travel = desktop ? -exitOffset / this.scrollSpeed :
                Math.max(0, this.introDistance + this.track.scrollHeight + exitRise - this.railHeight);

            // Measure the blocks and their gap in normal layout. Entrance transforms
            // can enlarge scrollHeight even when the content itself fits.
            const introBlocks = Array.from(this.intro.children);
            const introGap = parseFloat(getComputedStyle(this.intro).rowGap) || 0;
            const introContentHeight = introBlocks.reduce((height, block) => height + block.offsetHeight, 0) +
                introGap * Math.max(0, introBlocks.length - 1);

            // A short viewport or unusually long introduction stays readable in normal flow.
            if (this.railHeight < 240 || !this.travel ||
                this.introDistance >= this.railHeight ||
                (desktop && introContentHeight > this.intro.clientHeight)) {
                this.root.classList.remove("is-enhanced");
                return;
            }

            this.root.classList.toggle("is-mobile-flow", !desktop);
            this.root.style.setProperty("--bb-scroll-distance", (desktop ? this.travel : 0) + "px");
            this.root.style.setProperty("--bb-scroll-exit-clearance", exitRise + "px");
            const mobileRevealEnd = parseFloat(style.getPropertyValue("--bb-card-mobile-reveal-end")) / 100 || 0.45;
            // Use the stable stage height, so mobile browser toolbars cannot
            // move the finish line during a gesture.
            const revealDistance = (this.top + this.railHeight) * (1 - mobileRevealEnd);
            const revealInset = parseFloat(style.getPropertyValue("--bb-card-reveal-inset")) / 100;
            const entryOpacity = parseFloat(style.getPropertyValue("--bb-card-entry-opacity"));
            const scrub = parseFloat(style.getPropertyValue("--bb-card-scrub")) || 0;
            const popScale = parseFloat(style.getPropertyValue("--bb-card-pop-scale")) || 1.03;
            const popDuration = parseFloat(style.getPropertyValue("--bb-card-pop-duration")) || 0.42;
            const popRise = desktop ? 0.42 : 0.28;
            const popRiseEase = desktop ? "sine.out" : "power2.out";
            const revealSpan = parseFloat(style.getPropertyValue("--bb-card-reveal-span")) / 100 || 1;
            const firstRevealSpan = parseFloat(style.getPropertyValue("--bb-card-first-reveal-span")) / 100 || revealSpan;
            const popInsetRatio = desktop ? parseFloat(style.getPropertyValue("--bb-card-pop-reserve")) / 100 || 0 : 0;
            const revealEase = desktop ? "power1.inOut" : "sine.in";
            let duration = this.revealLead + this.travel;
            if (!desktop) {
                // The last reveal may continue while the footer enters. This
                // extends only the animation range, not the section's spacing.
                duration = Math.max(duration, this.cards[this.cards.length - 1].offsetTop + revealDistance);
            }
            this.context = motion.context(() => {
                const timeline = motion.timeline({ paused: true, onUpdate: () => this.scheduleEmphasis() });
                if (desktop && exitOffset) {
                    // The first card enters in normal flow, then the intro holds.
                    timeline.fromTo(this.track, { y: 0 }, {
                        y: exitOffset, duration: -exitOffset / this.scrollSpeed, ease: "none"
                    }, this.revealLead);
                } else {
                    // Mobile keeps the entire section in normal document flow.
                    timeline.to({}, { duration }, 0);
                }
                this.cards.forEach((card, index) => {
                    let entry = card.offsetTop;
                    if (desktop && entry > this.revealLead) {
                        entry = this.revealLead + (entry - this.revealLead) / this.scrollSpeed;
                    }
                    // Finish desktop reveals before the cards reach the header,
                    // with a shorter entrance for the first card. Mobile keeps
                    // its viewport-relative finish line.
                    const reveal = desktop
                        ? (Math.min(duration, this.revealLead + card.offsetTop / this.scrollSpeed) - entry) *
                            (index === 0 ? firstRevealSpan : revealSpan)
                        : revealDistance;
                    if (desktop && index === 0) {
                        timeline.fromTo(card, { y: parseFloat(style.getPropertyValue("--bb-card-first-rise")) || 0 }, {
                            // Keep the lift visible as opacity increases.
                            y: 0, duration: reveal, ease: "sine.in"
                        }, entry);
                    }
                    timeline.fromTo(card, { opacity: Number.isFinite(entryOpacity) ? entryOpacity : 0 }, {
                        opacity: 1,
                        duration: reveal,
                        ease: revealEase
                    }, entry);
                    const media = card.querySelector(".bb-scroll-card__media");
                    if (!media) return;
                    const popInset = card.clientWidth * popInsetRatio;
                    // Equal pixel insets retain the image's border inside the frame.
                    // Caption typography keeps its full size and layout throughout.
                    timeline.fromTo(card, { "--bb-card-inset": Math.max(0, card.clientWidth * revealInset - popInset) + "px" }, {
                        "--bb-card-inset": "0px",
                        duration: reveal,
                        ease: revealEase
                    }, entry);
                    // Finish the last desktop inset alongside the two-axis pop.
                    // Keep it separate so reverse scrolling can close the frame
                    // without playing the scale bounce backwards.
                    const revealPop = desktop ? motion.fromTo(card, { "--bb-card-pop-inset": popInset + "px" }, {
                        "--bb-card-pop-inset": "0px", duration: popDuration * popRise, ease: popRiseEase, paused: true
                    }) : null;
                    const pop = motion.timeline({ paused: true })
                        .to(card, { scale: popScale, duration: popDuration * popRise, ease: popRiseEase })
                        .to(card, { scale: 1, duration: popDuration * (1 - popRise), ease: desktop ? "sine.inOut" : "power2.inOut" });
                    this.emphasis.push({ pop, revealPop, fullAt: entry + reveal, resetAt: entry + reveal * 0.85, played: false });
                });

                this.trigger = ScrollTrigger.create({
                    trigger: this.root,
                    start: () => this.root.getBoundingClientRect().top + window.scrollY +
                        this.pinOffset - this.top - this.revealLead,
                    end: () => "+=" + duration,
                    animation: timeline,
                    // Keep the short trailing motion continuous when the CSS stage releases.
                    scrub: scrub || true
                });
            }, this.root);
            ScrollTrigger.refresh();
            this.revealFocus(document.activeElement);
            ScrollTrigger.update();
            this.updateEmphasis(true);
        }

        scheduleEmphasis() {
            if (!this.emphasis.length || this.emphasisFrame !== null) return;
            this.emphasisFrame = requestAnimationFrame(() => {
                this.emphasisFrame = null;
                this.updateEmphasis();
            });
        }

        updateEmphasis(settle = false) {
            if (!this.trigger) return;
            // Follow rendered scrub progress, including its brief catch-up tween.
            const time = this.trigger.animation.time();
            this.emphasis.forEach((state) => {
                if (settle) {
                    state.played = time >= state.fullAt;
                    state.pop.progress(1).pause();
                    if (state.revealPop) state.revealPop.progress(state.played ? 1 : 0).pause();
                    return;
                }
                // Re-arm only after a meaningful reverse movement, avoiding
                // repeated pops from tiny scroll changes at the finish point.
                if (time < state.resetAt && state.played) {
                    state.played = false;
                    if (state.revealPop) state.revealPop.reverse();
                }
                if (!state.played && time >= state.fullAt - 0.01) {
                    state.played = true;
                    if (state.revealPop) state.revealPop.play();
                    if (!state.pop.isActive()) state.pop.restart();
                }
            });
        }

        settleScroll(trigger = this.trigger) {
            if (!trigger) return;
            const tween = trigger.getTween();
            if (tween) tween.progress(1);
            trigger.animation.progress(trigger.progress);
        }

        revealFocus(target) {
            if (!this.trigger || !(target instanceof Element)) return;
            const card = target.closest("[data-scroll-card]");
            const targetRect = target.getBoundingClientRect();
            let offset;

            if (card) {
                const railRect = this.rail.getBoundingClientRect();
                if (targetRect.top >= Math.max(this.top, railRect.top) &&
                    targetRect.bottom <= Math.min(window.innerHeight, railRect.bottom)) return;

                const withinCard = targetRect.top - card.getBoundingClientRect().top;
                offset = this.introDistance + card.offsetTop + withinCard -
                    (this.railHeight - targetRect.height) / 2;
                offset /= this.scrollSpeed;
            } else if (this.introDistance && this.intro.contains(target)) {
                if (targetRect.top >= this.top && targetRect.bottom <= window.innerHeight) return;
                offset = 0;
            } else return;

            // Restore the right phase for off-screen links, including the mobile intro.
            window.scrollTo({
                top: this.trigger.start + this.revealLead + Math.max(0, Math.min(this.travel, offset)),
                behavior: "instant"
            });
            // Keyboard focus should be revealed immediately, without waiting for scrub.
            ScrollTrigger.update();
            this.settleScroll();
        }
    }

    const init = () => document.querySelectorAll("[data-scroll-cards]").forEach((root) => new ScrollCards(root));
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
})();
