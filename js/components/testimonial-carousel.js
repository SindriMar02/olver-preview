/**
 * Infinite testimonial marquee. The GSAP ticker drives the track; pointer
 * events handle the hover lift, pausing and dragging. Cloned cards fill the
 * loop so the originals can wrap seamlessly.
 */
(() => {
    "use strict";

    const motion = window.gsap;
    if (!motion) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    class TestimonialCarousel {
        constructor(root) {
            this.root = root;
            this.viewport = root.querySelector("[data-testimonial-viewport]");
            this.track = root.querySelector("[data-testimonial-track]");
            this.cards = Array.from(this.track.querySelectorAll("[data-testimonial-card]"));
            if (!this.cards.length) return;

            this.offset = 0;           // distance travelled along one set, px
            this.setWidth = 0;         // width of the original cards plus the trailing gap
            this.pace = { value: 1 };  // 0 = stopped, 1 = full speed; tweened for a graceful stop/start
            this.hovered = null;
            this.drag = null;
            this.suppressClick = false;
            this.frame = null;
            this.enabled = false;

            this.setX = motion.quickSetter(this.track, "x", "px");
            this.tick = this.tick.bind(this);
            this.onPointerMove = this.onPointerMove.bind(this);
            this.onPointerEnd = this.onPointerEnd.bind(this);

            this.bindEvents();
            if (!reducedMotion.matches) this.enable();
        }

        duration(property) {
            const value = getComputedStyle(this.root).getPropertyValue(property).trim();
            return (parseFloat(value) || 0) / (value.endsWith("ms") ? 1000 : 1);
        }

        enable() {
            if (this.enabled) return;
            this.enabled = true;
            this.root.classList.add("is-enhanced");
            this.layout();
            motion.ticker.add(this.tick);
        }

        // Reduced motion falls back to the native horizontal scroller from the CSS.
        disable() {
            if (!this.enabled) return;
            this.enabled = false;
            motion.ticker.remove(this.tick);
            this.onPointerEnd({ pointerId: this.drag ? this.drag.id : null });
            this.setHovered(null);
            this.removeClones();
            this.offset = 0;
            motion.set(this.track, { clearProps: "transform" });
            this.root.classList.remove("is-enhanced");
        }

        bindEvents() {
            // Hover lifts the card and pauses the loop; touch has no hover state.
            this.track.addEventListener("pointerover", (event) => {
                if (event.pointerType === "touch") return;
                const card = event.target.closest("[data-testimonial-card]");
                if (card && card !== this.hovered) this.setHovered(card);
            });
            this.track.addEventListener("pointerout", (event) => {
                if (event.pointerType === "touch") return;
                const card = event.target.closest("[data-testimonial-card]");
                if (!card || card !== this.hovered) return;
                if (event.relatedTarget && card.contains(event.relatedTarget)) return;
                this.setHovered(null);
            });
            this.viewport.addEventListener("pointerleave", (event) => {
                if (event.pointerType !== "touch") this.setHovered(null);
            });

            // Pressing keeps the loop stopped and lets the user drag the track.
            this.viewport.addEventListener("pointerdown", (event) => {
                if (!this.enabled || this.drag) return;
                if (event.pointerType === "mouse" && event.button !== 0) return;
                if (!event.target.closest("[data-testimonial-card]")) return;
                this.drag = {
                    id: event.pointerId,
                    type: event.pointerType,
                    startX: event.clientX,
                    startY: event.clientY,
                    startOffset: this.offset,
                    moved: false
                };
                this.viewport.classList.add("is-dragging");
                this.updatePace();
                window.addEventListener("pointermove", this.onPointerMove);
                window.addEventListener("pointerup", this.onPointerEnd);
                window.addEventListener("pointercancel", this.onPointerEnd);
            });

            // A drag must not register as a click on anything inside the card.
            this.viewport.addEventListener("click", (event) => {
                if (!this.suppressClick) return;
                event.preventDefault();
                event.stopPropagation();
            }, true);

            reducedMotion.addEventListener("change", () => {
                if (reducedMotion.matches) this.disable();
                else this.enable();
            });

            if (window.ResizeObserver) {
                let width = this.viewport.clientWidth;
                this.resizeObserver = new ResizeObserver(() => {
                    const next = this.viewport.clientWidth;
                    if (Math.abs(next - width) > 0.5) {
                        width = next;
                        this.scheduleLayout();
                    }
                });
                this.resizeObserver.observe(this.viewport);
            } else {
                window.addEventListener("resize", () => this.scheduleLayout(), { passive: true });
            }
            if (document.fonts) document.fonts.ready.then(() => this.scheduleLayout());
        }

        scheduleLayout() {
            if (!this.enabled || this.frame !== null) return;
            this.frame = requestAnimationFrame(() => {
                this.frame = null;
                if (this.enabled) this.layout();
            });
        }

        removeClones() {
            this.track.querySelectorAll("[data-testimonial-clone]").forEach((clone) => {
                if (clone === this.hovered) this.setHovered(null);
                clone.remove();
            });
        }

        // Measure one set of originals and clone enough copies to cover the
        // viewport plus one full set, so wrapping never exposes a gap.
        layout() {
            const style = getComputedStyle(this.root);
            this.speed = parseFloat(style.getPropertyValue("--tc-speed")) || 40;
            this.liftDistance = parseFloat(style.getPropertyValue("--tc-lift")) || 16;
            this.liftDuration = this.duration("--tc-lift-duration") || 0.45;
            this.dropDelay = this.duration("--tc-drop-delay");

            this.removeClones();
            const gap = parseFloat(getComputedStyle(this.track).columnGap) || 0;
            const first = this.cards[0].getBoundingClientRect();
            const last = this.cards[this.cards.length - 1].getBoundingClientRect();
            this.setWidth = last.right - first.left + gap;
            if (this.setWidth <= 0) return;

            const copies = Math.ceil(this.viewport.clientWidth / this.setWidth) + 1;
            const fragment = document.createDocumentFragment();
            for (let i = 0; i < copies; i++) {
                this.cards.forEach((card) => {
                    const clone = card.cloneNode(true);
                    clone.setAttribute("data-testimonial-clone", "");
                    clone.setAttribute("aria-hidden", "true");
                    clone.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
                    clone.querySelectorAll("a, button, [tabindex]").forEach((node) => node.setAttribute("tabindex", "-1"));
                    fragment.append(clone);
                });
            }
            this.track.append(fragment);
            this.render();
        }

        tick(time, deltaTime) {
            if (this.drag || this.pace.value <= 0) return;
            this.offset += this.speed * this.pace.value * (deltaTime / 1000);
            this.render();
        }

        render() {
            const width = this.setWidth || 1;
            this.offset = ((this.offset % width) + width) % width;
            this.setX(-this.offset);
        }

        // Ease to a stop while hovered or pressed; ease back up to speed otherwise.
        updatePace() {
            const target = this.hovered || this.drag ? 0 : 1;
            motion.to(this.pace, {
                value: target,
                duration: target ? 0.9 : 0.4,
                ease: target ? "power2.in" : "power2.out",
                overwrite: true
            });
        }

        setHovered(card) {
            if (card === this.hovered) return;
            if (this.hovered) this.drop(this.hovered);
            this.hovered = card;
            if (card) this.lift(card);
            this.updatePace();
        }

        lift(card) {
            motion.to(card, {
                y: -this.liftDistance,
                duration: this.liftDuration,
                ease: "power3.out",
                overwrite: true
            });
        }

        drop(card) {
            motion.to(card, {
                y: 0,
                duration: this.liftDuration * 1.2,
                delay: this.dropDelay,
                ease: "power3.out",
                overwrite: true
            });
        }

        onPointerMove(event) {
            if (!this.drag || event.pointerId !== this.drag.id) return;
            const dx = event.clientX - this.drag.startX;
            if (!this.drag.moved) {
                const dy = event.clientY - this.drag.startY;
                if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
                // touch-action: pan-y hands vertical swipes to the browser (pointercancel);
                // anything reaching here is a horizontal drag of the track.
                this.drag.moved = true;
            }
            this.offset = this.drag.startOffset - dx;
            this.render();
        }

        onPointerEnd(event) {
            if (!this.drag || event.pointerId !== this.drag.id) return;
            const { moved, type } = this.drag;
            this.drag = null;
            this.viewport.classList.remove("is-dragging");
            window.removeEventListener("pointermove", this.onPointerMove);
            window.removeEventListener("pointerup", this.onPointerEnd);
            window.removeEventListener("pointercancel", this.onPointerEnd);

            if (moved && type !== "touch") {
                this.suppressClick = true;
                setTimeout(() => { this.suppressClick = false; }, 0);
            }
            // Mouse users keep the loop stopped until they move off the card;
            // touch has no hover, so letting go resumes the loop.
            this.updatePace();
        }
    }

    const initialize = () => {
        document.querySelectorAll("[data-testimonial-carousel]").forEach((root) => {
            if (!root.dataset.carouselReady) {
                root.dataset.carouselReady = "true";
                new TestimonialCarousel(root);
            }
        });
    };
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
